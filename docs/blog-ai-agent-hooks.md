# 用 shell 命令做 AI Agent 的插件系统：为什么 Hook 不是函数调用

> 这是 [《写完一个 AI 编程助手之后，我才确定 prompt 工程不是重点》](./blog-ai-agent-from-scratch-v2.md) 系列的第六篇（最后一篇）。前五篇讲了进程模型、权限、并发调度、记忆系统。这一篇讲 Hook——整个项目里最"丑"但最有用的设计。

Agent 需要插件系统。

记忆系统要在工具执行后记录数据。权限系统要在工具执行前拦截。上下文压缩要在 token 超限时触发。未来还会有日志、监控、审计……

第一反应是写一个 EventEmitter：

```typescript
agent.on('post-tool-use', async (event) => {
  await memorySystem.record(event)
})
```

我没这么做。我用了 shell 命令。

```typescript
{
  'post-tool-use': [{
    command: 'curl -X POST http://localhost:37777/api/sessions/observations ...',
    onError: 'ignore',
    timeout: 3000
  }]
}
```

看起来很丑。但这是我做过的最正确的架构决策之一。

---

## 一、为什么不用 EventEmitter

EventEmitter 有三个致命问题：

**1. 插件必须跟 Agent 同进程**

如果记忆系统跑在独立 Worker 里（[第二篇](./blog-ai-agent-process-model.md)讲过为什么要拆），EventEmitter 就没法用。你得在 listener 里写 HTTP 调用，那跟直接写 shell 命令有什么区别？

**2. 插件必须用同一种语言**

Agent 是 TypeScript。如果我想用 Python 写一个分析插件（因为 Python 的 NLP 生态更好），EventEmitter 做不到。shell 命令不关心你用什么语言实现。

**3. 插件崩溃会拖垮主进程**

EventEmitter 的 listener 如果抛异常，要么你 try-catch 吞掉（隐藏 bug），要么让它冒泡（主进程挂）。shell 命令天然隔离——子进程崩了，主进程只看到一个非零退出码。

---

## 二、Hook 的完整实现：100 行

核心是 `HookManager`（`src/core/hooks/manager.ts`）。两个公开方法：

```typescript
// 触发事件，不关心返回值
async fire(event: HookEvent, env: Record<string, string>): Promise<void>

// 触发事件，用返回值变换 payload
async transform<T>(event: HookEvent, payload: T, env: Record<string, string>): Promise<T>
```

`fire` 用于通知型 hook（记忆记录、日志）。`transform` 用于拦截型 hook（权限检查、内容过滤）。

底层都是同一个 `run` 方法：

```typescript
private run(entry: HookEntry, extraEnv: Record<string, string>, stdin: string | null): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const proc = spawn('bash', ['-c', entry.command], {
      cwd: process.cwd(),
      env: { ...process.env, ...extraEnv },
      stdio: stdin !== null ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe']
    })

    let stdout = '', stderr = ''
    let killed = false

    const timer = setTimeout(() => {
      killed = true
      proc.kill('SIGTERM')
      setTimeout(() => proc.kill('SIGKILL'), 3000)
    }, entry.timeout)

    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })

    if (stdin !== null && proc.stdin) {
      proc.stdin.write(stdin)
      proc.stdin.end()
    }

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (killed) { handleError(...); return }
      if (code !== 0) { handleError(...); return }
      resolve(stdout)
    })
  })
}
```

就是 `spawn('bash', ['-c', command])`。没有 SDK，没有协议，没有序列化格式。

数据通过**环境变量**传入，通过 **stdout** 传出。

---

## 三、环境变量是最好的 IPC 格式（对于小数据）

Hook 需要知道当前上下文：哪个工具被调用了、输入是什么、结果是什么、session id 是什么。

我用环境变量传：

```typescript
await this.context.hooks?.fire('post-tool-use', {
  AGENT_CWD: process.cwd(),
  TOOL_NAME: tool.name,
  TOOL_INPUT: JSON.stringify(tool.input),
  TOOL_RESULT: resultStr.slice(0, 10000),
  SESSION_ID: this.context.sessionManager?.getCurrentSession()?.id || 'unknown'
})
```

Hook 命令里直接用 `$TOOL_NAME`、`$SESSION_ID`：

```bash
curl -X POST http://localhost:37777/api/sessions/observations \
  -H 'Content-Type: application/json' \
  -d "{\"toolName\":\"$TOOL_NAME\",\"contentSessionId\":\"$SESSION_ID\"}"
```

为什么不用 stdin + JSON？

- 环境变量**零解析成本**。shell 直接展开，不需要 jq、不需要 python -c。
- 环境变量**自文档化**。看一眼 hook 配置就知道有哪些变量可用。
- 环境变量**有大小限制**（通常 128KB）。这是**优点**——强制你只传必要的数据。`TOOL_RESULT` 我截断到 10000 字符，避免一个巨大的文件内容撑爆环境。

stdin 留给 `transform` 型 hook——它需要接收完整 payload、修改后从 stdout 返回。这种场景数据量大，环境变量装不下。

> **小数据走环境变量，大数据走 stdin/stdout。不要统一成一种格式——两种场景的约束不同。**

---

## 四、onError 三态：ignore / warn / abort

Hook 失败了怎么办？又是三态：

```typescript
type OnError = 'ignore' | 'warn' | 'abort'
```

- **ignore**：吞掉错误，主流程继续。记忆系统用这个——记忆挂了不影响 Agent 工作。
- **warn**：打一行警告到 stderr，主流程继续。日志系统用这个——你想知道它挂了，但不想停。
- **abort**：抛异常，主流程中断。权限检查用这个——权限 hook 挂了，宁可停也不能放行。

这三个选项覆盖了我遇到的所有场景。不需要更多。

记忆系统的 hook 配置：

```typescript
// src/worker/hooks.ts
'post-tool-use': [{
  command: 'curl -X POST ... || true',
  onError: 'ignore',
  timeout: 3000
}]
```

注意 `|| true`——即使 curl 失败，bash 也返回 0。再加上 `onError: 'ignore'`，双重保险。记忆系统的可用性不应该影响 Agent 的可用性。

---

## 五、timeout 是必须的，不是可选的

每个 hook 都有 timeout：

```typescript
const timer = setTimeout(() => {
  killed = true
  proc.kill('SIGTERM')
  setTimeout(() => proc.kill('SIGKILL'), 3000)
}, entry.timeout)
```

没有 timeout 的 hook 系统是定时炸弹。

真实场景：记忆系统的 Worker 挂了，curl 连接超时默认 120 秒。如果没有 timeout，Agent 每次工具调用后都会卡 120 秒等 hook 返回。

我的 timeout 设置：

| Hook 类型 | timeout | 原因 |
|-----------|---------|------|
| user-prompt-submit | 5000ms | 初始化可能要建表 |
| post-tool-use | 3000ms | 正常情况 < 500ms，3s 是容错 |
| session-end | 2000ms | 只是一个 HTTP POST |

> **timeout 不是"以防万一"，是"一定会发生"。任何网络调用都会超时，区别只是你是主动控制还是被动等待。**

---

## 六、transform vs fire：拦截 vs 通知

`fire` 是单向的——触发 hook，不等返回值。适合记录、日志、监控。

`transform` 是双向的——把 payload 通过 stdin 传给 hook，hook 修改后从 stdout 返回。适合拦截、过滤、变换。

```typescript
async transform<T>(event: HookEvent, payload: T, env: Record<string, string>): Promise<T> {
  let current = payload
  for (const entry of entries) {
    const result = await this.run(entry, env, JSON.stringify(current))
    if (!result?.trim()) continue
    try {
      current = JSON.parse(result.trim())
    } catch {
      this.onWarn(`Hook returned non-JSON — ignoring`)
    }
  }
  return current
}
```

多个 transform hook 串行执行，前一个的输出是后一个的输入。这是 Unix pipe 的思想——每个 hook 是一个 filter。

实际用例：

- `pre-tool`：hook 可以修改工具的 input（比如自动补全路径）
- `post-sampling`：hook 可以修改模型的输出（比如过滤敏感信息）
- `pre-compress`：hook 可以在压缩前归档消息

---

## 七、为什么这个设计能活下来

这套 hook 系统上线两个月，我没改过一行核心代码。期间加了：

- 记忆系统（3 个 hook）
- 上下文压缩通知（2 个 hook）
- 工具执行计时（1 个 hook）
- 调试用的 verbose 日志（1 个 hook）

每次都是加一条配置，不动框架代码。

这就是 shell 命令做 hook 的真正优势：**扩展点和实现完全解耦**。

- 框架只知道"在这个时机执行一条命令"
- 命令可以是 curl、python 脚本、go 二进制、甚至另一个 Agent
- 命令挂了有 onError 兜底
- 命令慢了有 timeout 兜底

> **最好的插件系统是最笨的那个。不要发明协议，不要定义接口，不要写 SDK。给一个 shell，传几个环境变量，收一个 stdout。够了。**

---

## 系列总结

六篇写完了。回头看，整个系列讲的是同一件事：

**AI Agent 的难点不在 AI，在工程。**

| 篇目 | 核心判断 |
|------|---------|
| [总论](./blog-ai-agent-from-scratch-v2.md) | prompt 工程不是重点，工程问题决定好坏 |
| [进程模型](./blog-ai-agent-process-model.md) | 阻塞操作 > 100ms 就拆进程 |
| [权限系统](./blog-ai-agent-permissions.md) | 让工具自己说危不危险，框架只做仲裁 |
| [并发调度](./blog-ai-agent-tool-dispatch.md) | 让工具自己声明并发安全，调度器一行搞定 |
| [记忆系统](./blog-ai-agent-memory-system.md) | 记忆是信噪比问题，不是存储问题 |
| Hook 系统（这篇） | 最笨的插件系统最耐用 |

贯穿六篇的元原则：

> **框架的工作是定义接口，不是实现逻辑。把语义留给组件，把策略留给框架，把实现留给 shell。**

整个项目开源：[github.com/your-handle/code-agent](https://github.com/your-handle/code-agent)。从 `src/core/agent/loop.ts` 开始读，200 行就能看完主循环。

如果你也在写 Agent，这六篇可以当 checklist 用。每改对一个，体感跳一个台阶。
