# 让工具自己声明并发安全：我把调度逻辑砍到一行

> 这是 [《写完一个 AI 编程助手之后，我才确定 prompt 工程不是重点》](./blog-ai-agent-from-scratch-v2.md) 的第四篇，也是「工程问题决定 Agent 好坏」系列的最后一篇。前几篇讲了[进程模型](./blog-ai-agent-process-model.md)和[权限系统](./blog-ai-agent-permissions.md)，这一篇讲并发调度。

AI 经常一口气甩三个工具：

```
[
  { name: 'read',  input: { path: 'a.ts' } },
  { name: 'read',  input: { path: 'b.ts' } },
  { name: 'grep',  input: { pattern: 'TODO' } }
]
```

也经常这样：

```
[
  { name: 'read',  input: { path: 'a.ts' } },
  { name: 'write', input: { path: 'a.ts', content: '...' } },
  { name: 'edit',  input: { path: 'a.ts', ... } }
]
```

第一组并行跑没问题。第二组并行跑就炸——同一个文件被三个操作竞争。

调度器要不要并行？怎么决定？

我试过三种方案，前两种都错了。

---

## 一、第一种错法：全部串行

最朴素的方案：永远不并行。

```typescript
for (const tool of tools) {
  results.push(await runTool(tool))
}
```

正确，但慢得令人发指。读三个文件本来 50ms 能搞定，串行变成 150ms。一次轮次里有四五次 batch，累积下来用户能感觉到。

而且这是个**无意义的慢**——Read 工具就是无害的，串它干嘛？

---

## 二、第二种错法：调度器去猜

第二个直觉是写一张表：

```typescript
const SAFE_TOOLS = ['read', 'grep', 'glob', 'ls']
const allSafe = tools.every(t => SAFE_TOOLS.includes(t.name))
```

跑了几天就发现 bug。比如：

```
bash git status     ← 只读，应该并行
bash rm -rf foo     ← 破坏性，绝对不能并行
```

是同一个工具 `bash`，但语义完全不同。把 `bash` 加进 SAFE 列表是错的，不加进去又把所有 `bash git status / git log / ls` 这种纯查询全串行了。

更糟的是，每加一个新工具，就要回到调度器更新这张表。**写新工具的人必须改无关的代码**——每次都会忘。

> **调度器不应该知道工具的语义。任何让调度器去"判断"工具的方案，都会在加新工具时退化。**

---

## 三、第三种做法：让工具自己说

核心改动：在每个工具上加一个方法。

```typescript
// src/core/permissions/types.ts
export interface PermissionCapable {
  isConcurrencySafe(input: unknown): boolean
  // ...
}
```

然后调度器只问一句话：

```typescript
// src/core/agent/loop.ts
const allConcurrencySafe = tools.every(t => {
  const tool = this.context.tools.get(t.name)
  return tool?.isConcurrencySafe(t.input) ?? false
})

if (allConcurrencySafe) {
  return Promise.all(tools.map(runTool))
}

const results: any[] = []
for (const tool of tools) {
  results.push(await runTool(tool))
}
return results
```

调度器一行判断。

工具自己回答：

```typescript
// read.ts
isConcurrencySafe: () => true,

// write.ts、edit.ts、rm.ts
isConcurrencySafe: () => false,
```

`bash` 是真正有意思的那个：

```typescript
// src/core/tools/bash.ts
isConcurrencySafe: (input) => {
  const cmd = (input as any).command
  return typeof cmd === 'string' && classifyCommand(cmd) === 'readonly'
}
```

注意签名——`isConcurrencySafe(input)` 接收输入。同一个 `bash` 工具，对 `git status` 返回 `true`，对 `rm -rf` 返回 `false`。**判断粒度不是工具，是工具调用**。

这是这个设计真正起作用的地方。如果签名是 `isConcurrencySafe()`（无参数），bash 就只能选一个保守的 `false`，损失全部并发收益。

---

## 四、默认值要保守，不要乐观

有一个细节决定这套设计能不能在团队里活下来：**默认值**。

`createTool` 的默认实现：

```typescript
// src/core/tools/registry.ts
isConcurrencySafe: spec.isConcurrencySafe ?? (() => false)
```

默认 `false`。新写的工具如果忘了声明，自动按串行处理。**忘记声明的代价是慢，不是炸**。

反过来，如果默认 `true`，每加一个新工具都可能引入并发 bug，而且测试很难发现——因为冲突只在特定时序下出现。

MCP 工具也走这个默认（`src/core/mcp/client/tool-wrapper.ts`）：

```typescript
isConcurrencySafe: () => false
```

这是对的，因为 MCP server 的语义对我们完全不透明，假设它危险是唯一安全的选择。

> **任何"必须由作者主动声明才安全"的属性，默认值都要选不安全的那一边。**

---

## 五、为什么不做"部分并行"

最后一个反直觉的决定：**不要做部分并行**。

设想这个 batch：

```
[ read a.ts, read b.ts, write c.ts, read d.ts ]
```

聪明的调度器会说："前两个并行，等第三个串行执行，再起一个并行跑第四个。"

这套逻辑要写一个拓扑排序，要追踪资源依赖（哪些路径在被写？bash 的副作用怎么算？），还要考虑回退。代码量从 5 行膨胀到 200 行，且每个新工具都要重新审视。

我选择了最钝的方案：

```
全部安全 → Promise.all
否则     → 全部串行
```

代价是上面那个 batch 退化成全串行，慢一点。但代码简单到不会出 bug，新工具加进来零成本。

> **能用 5 行代码解决 80% 的问题时，不要写 200 行代码解决 100% 的问题。**

实际跑下来，AI 给的 batch 里 95% 要么全是 read 类（全并行），要么含 write/edit（全串行）。混合 batch 罕见，性价比不值得为它写复杂逻辑。

---

## 所以呢

这是「工程问题决定 Agent 好坏」系列的第三个例子，跟前两篇讲的是同一个原则：

- [进程模型](./blog-ai-agent-process-model.md)：把阻塞操作丢给 Worker，主循环只负责调度
- [权限系统](./blog-ai-agent-permissions.md)：把危险性判断丢给工具，引擎只负责仲裁
- 工具调度（这篇）：把并发安全丢给工具，调度器只负责选 `Promise.all` 或串行

> **框架的本职工作只有一件：定义一个让组件自我描述的接口，然后做最钝的调度。**

写得越多 AI Agent 我越确信这件事。`prompt 工程`、`chain 抽象`、`memory 设计` 这些被各种框架包装的概念，本质上都是组件自我描述 + 钝调度的问题。一旦你把它从"框架的智能"改成"组件的诚实"，复杂度立刻塌一个数量级。

四篇下来，整个 code-agent 项目的核心架构就讲完了。代码：[github.com/your-handle/code-agent](https://github.com/your-handle/code-agent)。

---

如果你也在写 AI Agent，欢迎拿这四篇当 checklist：

- 你的副路径里有没有 100ms+ 的阻塞操作？拆 Worker。
- 你的权限是不是写在框架里？挪到工具里。
- 你的调度器知不知道工具的语义？让它别知道。
- 你的工具默认值是不是乐观的？翻过来。

每改对一个，Agent 的体感会跳一个台阶。
