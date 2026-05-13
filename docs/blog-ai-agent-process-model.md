# 把 AI Agent 拆成两个进程：单进程方案我跑了一周才放弃

> 这是 [《写完一个 AI 编程助手之后，我才确定 prompt 工程不是重点》](./blog-ai-agent-from-scratch-v2.md) 的第二篇。上一篇说工程问题决定 Agent 的好坏，这一篇讲第一个具体例子：**进程模型**。

写记忆系统的第一周，我把它直接挂在主循环里。

每次工具执行完成后，触发一个 hook，hook 同步去算 embedding、写 SQLite、做相似度查询。看起来很优雅——所有数据都在一个进程里，没有 IPC，调试方便。

跑了一周我把这个方案删了。

原因不是 bug。是体感。

---

## 一、本地 embedding 不能放在主循环里

我用的是 `all-MiniLM-L6-v2`，50MB，本地推理。单次 embedding 大约 50–200ms，看起来不慢。

但 Agent 一次轮次里，工具调用是**成串发生**的。AI 经常一次 grep + 三个 read + 一次 edit。每个工具执行后都触发记忆 hook，每个 hook 都跑 embedding：

```
工具 1 完成 (50ms)  → embedding (180ms) → 写 SQLite (20ms)  ⏸ 主循环阻塞 200ms
工具 2 完成 (30ms)  → embedding (160ms) → 写 SQLite (15ms)  ⏸ 主循环阻塞 175ms
工具 3 完成 (40ms)  → embedding (190ms) → 写 SQLite (20ms)  ⏸ 主循环阻塞 210ms
...
```

一次轮次累计阻塞 600–1000ms，反映到用户那边就是「流式输出停了一下」「看起来像卡死」。

更糟的是，模型加载本身要 30 秒。冷启动那 30 秒 Agent 完全没法用。

> **本地推理永远不要放在用户的关键路径上。它可以快，但它不可控——CPU 占用、内存峰值、首次加载延迟，每一个都会打穿你的 SLA。**

---

## 二、Worker 是子进程，不是 Worker thread

切独立进程的时候我有两个选项：Worker thread 还是 child process？

我选了 child process。三个原因：

**1. embedding 模型有几百兆的常驻内存**。放进 thread 会跟主进程共享 V8 堆，GC 一次卡一秒。child process 各自管自己。

**2. 我希望 Worker 能独立崩溃**。embedding 偶尔会段错误（特别是某些 ONNX runtime 版本），主进程不能跟着挂。

**3. Worker 以后可能换语言**。Python 的 embedding 生态比 Node 好太多。HTTP 接口先约定好，后面想换 `sentence-transformers` 直接换。

实际启动代码（`src/worker/manager.ts`）：

```typescript
const workerPath = join(process.cwd(), 'src/worker/server.ts')
this.workerProcess = spawn('bun', ['run', workerPath], {
  env: { ...process.env, WORKER_PORT: String(this.port) },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: false  // 父进程退出，子进程跟着退
})
```

`detached: false` 是 macOS / Linux 上避免僵尸进程的关键。`true` 的时候子进程会脱离会话，父进程 Ctrl+C 之后子进程还活着，下次 `bun run dev` 会发现端口被占。

---

## 三、健康检查必须有超时，但超时也得有上限

主进程怎么知道 Worker 起来了？两个常见方案：

- **侦听 stdout 关键字**："Worker Service running"
- **轮询 HTTP `/health`**

只用第一个不安全——子进程可能写了日志但接口还没监听。只用第二个浪费时间——HTTP 准备好之前 stderr 上的报错你看不到。

我两个一起用：

```typescript
this.workerProcess.stdout?.on('data', (data: Buffer) => {
  if (data.toString().includes('Worker Service running')) {
    this.isReady = true
    resolve()
  }
})

setTimeout(() => {
  if (!this.isReady) {
    this.stop()
    reject(new Error('Worker startup timeout (10s)'))
  }
}, 10000)
```

10 秒是经验值。低于 5 秒首次冷启动会被误杀（embedding 模型要从磁盘加载）。高于 15 秒用户就开始怀疑你卡死了。

更细一点的版本是 `waitForHealth`，每 500ms 轮询一次 `/health`，最多 10 次。两层叠起来比单一信号稳。

---

## 四、优雅退出有两个 SIGNAL，不是一个

第一版我只发 SIGTERM。结果遇到 embedding 模型还在初始化的时候，进程吞掉信号，永远不退。

```typescript
stop(): void {
  if (this.workerProcess) {
    this.workerProcess.kill('SIGTERM')

    // 3 秒还没退出，强制
    setTimeout(() => {
      if (this.workerProcess) {
        this.workerProcess.kill('SIGKILL')
      }
    }, 3000)

    this.workerProcess = null
  }
}
```

3 秒是个有意为之的数字：

- 太短（< 1s）：Worker 来不及把缓冲区里的 embedding 写盘
- 太长（> 5s）：用户 Ctrl+C 之后觉得程序挂了，又按一次，结果同样的代码跑两遍

这两段加起来 = "graceful shutdown"。常见错误是只写第一段，以为发个 SIGTERM 就万事大吉。**SIGTERM 是请求，SIGKILL 才是命令**。

---

## 五、UX 是工程决策的副作用

第一版的启动流程长这样：

```bash
# 终端 1
bun run dev:worker

# 终端 2
bun run dev

# 还要手动写 hook 配置到 .agent/config.json
```

用户要管两个终端 + 一个配置文件。我自己用了两天就受不了。

第二版变成：

```bash
bun run dev --with-memory "重构 auth.ts"
```

背后是 `WorkerManager.start()` 自动 spawn、自动 health check、自动注入 hook、自动跟随父进程退出。

两个版本工程量差不多，但用户体感差了一个量级。

> **你的进程模型直接决定了用户的命令行长度。每多一个用户要管的进程，就要在某处加一行代码替他管。这一行代码不写，UX 就烂。**

这是我做这个项目最大的一次态度转变：进程模型不是后端工程师的内部细节，是**前置 UX 决策**。

---

## 所以呢

把记忆系统从主循环抠出来，是这个项目里我做过的最对的一次架构决定。带来的几个副产出：

- 主循环延迟从 ~800ms 抖动降到稳定 < 50ms
- Worker 单独崩溃不影响 Agent
- 以后想换 Python 写 embedding，HTTP 接口已经约定好
- `--with-memory` 这种"零配置"体验只能在 WorkerManager 自动化的前提下做到

但代价也真实：

- 多了 1 个进程要监控
- IPC 开销（HTTP POST，约 2ms）
- 跨进程上下文必须显式传（参考 [v2 第二节](./blog-ai-agent-from-scratch-v2.md)）

如果你写 Agent 时也在纠结要不要拆进程，我的判断是：**只要你的副路径里有一个会阻塞超过 100ms 的操作（embedding、LLM 调用、磁盘扫描、网络请求），就拆**。

代码：[code-agent/src/worker/manager.ts](https://github.com/your-handle/code-agent/blob/main/src/worker/manager.ts)。`WorkerManager` 一共 130 行，可以直接抄。

---

下一篇讲第二个具体例子：**AI Agent 的权限系统该怎么写**。剧透一句话——**框架级权限是伪问题，每个工具应该自己说**。
