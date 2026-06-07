# Tool Use —— Agent 的手和眼

## 一、工具描述写了一个字，模型用错了

我第一次给 agent 加搜索工具，description 写的是："搜索文件"。

然后我让 agent 找一个函数定义，它调用了这个工具，传了函数名作为参数，没找到，又调用了一次，还是没找到，然后它放弃了，告诉我"找不到这个函数"。

但函数明明在代码里。

问题出在 description。我的工具是按文件名搜索的（类似 `find`），但模型以为它是按内容搜索的（类似 `grep`）。模型传了函数名，工具在文件名里找，当然找不到。

**工具描述写得模糊，模型就会用错工具。** 这不是模型的问题，是工具设计的问题。

## 二、工具调用的标准化

LLM 本质上是一个文本转换函数：输入文本，输出文本。它没有手，没有眼，不能打开文件，不能运行命令。

早期让模型"行动"的方式是 prompt 解析：让模型输出特定格式的文本，然后用正则或字符串匹配提取操作指令：

```
模型输出：
我需要读取文件。
<action>read_file</action>
<path>src/main.ts</path>
```

这能用，但极其脆弱。模型输出格式稍有变化（多个空格、换行位置不同、用了中文标点），解析就崩了。

2023 年 OpenAI 引入 Function Calling（Anthropic 叫 Tool Use），把这个流程标准化：
- 你在 API 请求里声明"有哪些工具可以用，每个工具的参数是什么"
- 模型在响应里输出结构化的工具调用请求，格式由 API 保证
- 你执行工具，把结果以结构化格式传回给模型

这个改变看起来只是格式标准化，但影响深远：**模型现在"知道"自己在调用工具，而不是在生成文本**。这让模型能更准确地选择工具、构造参数、处理结果。

## 三、工具描述的重要性

工具系统里最容易被忽视、但影响最大的是 **description**。

模型选择工具、构造参数，完全依赖 description。description 写得模糊，模型就会用错工具，或者传错参数。

对比两个 description：

**差的：**
```json
{
  "name": "search",
  "description": "搜索文件"
}
```

**好的：**
```json
{
  "name": "grep",
  "description": "在文件内容中搜索匹配正则表达式的行。适合搜索代码中的函数定义、变量名、特定字符串。返回匹配行及其文件路径和行号。注意：这是内容搜索，不是文件名搜索；如果要按文件名搜索，用 glob 工具。"
}
```

好的 description 要回答三个问题：
1. 这个工具**做什么**？（功能）
2. **什么时候**用它？（适用场景）
3. **什么时候不用**它？（与其他工具的区别）

第三点最容易被忽略，但对模型选择工具至关重要。这里再啰嗦一下：description 里的"什么时候不用"，是帮模型在相似工具之间做区分的关键信息。`grep` 和 `glob` 都是"搜索"，但一个搜内容，一个搜文件名——不说清楚，模型就会猜。

## 四、工具调用失败的处理

工具调用失败是常态，不是异常。文件可能不存在，命令可能出错，网络可能超时。

关键是：**错误信息要对模型有意义**。

```typescript
// 差的错误信息
throw new Error('File not found')

// 好的错误信息
throw new Error(
  `文件不存在: ${path}\n` +
  `提示：请先用 glob 工具确认文件路径，或检查路径是否有拼写错误`
)
```

好的错误信息告诉模型：发生了什么、可能的原因是什么、下一步应该怎么做。这让模型能从错误中恢复，而不是陷入困惑。

模型处理工具错误的方式通常是：把错误信息作为工具结果塞回消息列表，然后在下一轮推理时决定如何处理。如果错误信息足够清晰，模型通常能找到正确的恢复路径。

## 五、项目实现

### Tool 接口

`src/core/tools/registry.ts` 定义了 `Tool` 接口：

```typescript
export interface Tool {
  name: string
  description: string
  inputSchema: any
  execute(input: any): Promise<any>

  // 调度相关
  isConcurrencySafe(input: unknown): boolean  // 可以和其他工具并行执行吗？

  // 权限相关
  isReadOnly(input: unknown): boolean          // 不修改任何状态吗？
  isDestructive(input: unknown): boolean       // 有破坏性吗（删除、覆盖）？
  checkPermissions(input: unknown, ctx: PermissionContext): PermissionResult
  preparePermissionMatcher(input: unknown): PermissionMatcher | null
}
```

`isConcurrencySafe` 和 `isReadOnly` 是两个不同维度的概念，容易混淆：
- `isReadOnly`：**语义维度**，表示工具不修改任何状态，用于权限判断
- `isConcurrencySafe`：**调度维度**，表示工具可以和其他工具同时执行，用于并行优化

一个工具可以是只读但不并发安全（比如读取一个会被其他工具修改的临时文件）。`AgentLoop` 用 `isConcurrencySafe` 决定是否并行，不是 `isReadOnly`。

### 工具执行的完整管道

`ToolRegistry.execute()` 不只是调用 `tool.execute()`，它是一个完整的执行管道：

```
权限检查 → pre-tool hook（可修改输入）→ 超时包装执行 → post-tool hook（通知）
```

```typescript
async execute(name: string, input: any, ctx: PermissionContext): Promise<any> {
  const tool = this.tools.get(name)

  // 1. 权限检查（详见第 3 篇）
  const decision = decide(tool, input, ctx, name)
  if (decision.type === 'deny') throw new AgentError(PERMISSION_DENIED, ...)
  if (decision.type === 'ask') {
    const confirmed = await this.promptUser(name, decision.description, input)
    if (!confirmed) throw new AgentError(PERMISSION_DENIED, 'User denied')
  }

  // 2. pre-tool hook：可以修改传入参数（详见第 9 篇）
  let effectiveInput = input
  if (this.hooks) {
    const transformed = await this.hooks.transform('pre-tool', { name, input }, hookEnv)
    effectiveInput = transformed.input
  }

  // 3. 超时包装执行（默认 30s，可在 .agent.yml 里配置）
  const timeout = config.tools?.[name]?.timeout || 30000
  const result = await executeWithTimeout(tool.execute(effectiveInput), timeout, timeoutError)

  // 4. post-tool hook：通知（不能修改结果）
  await this.hooks?.fire('post-tool', {
    AGENT_TOOL_NAME: name,
    AGENT_TOOL_RESULT: JSON.stringify(result)
  })

  return result
}
```

超时设计值得注意：默认 30 秒，但可以在 `.agent.yml` 里按工具名单独配置。`bash` 工具可能需要更长的超时（编译、测试），`read` 工具通常几百毫秒就够了。

### MCP：工具的生态系统

**Model Context Protocol（MCP）** 是 Anthropic 提出的工具标准化协议。它定义了一套通用接口，让任何人都可以发布"MCP server"——一个提供工具的服务，任何支持 MCP 的 agent 都能直接使用。

这类似于 npm 之于 Node.js：你不需要自己实现所有工具，可以直接用社区发布的 MCP server。

`createToolRegistry()` 在注册完所有内置工具后，会自动从配置的 MCP server 加载工具：

```typescript
export async function createToolRegistry(): Promise<ToolRegistry> {
  const registry = new ToolRegistry()
  registry.register(BashTool)
  // ...

  // 从 MCP server 加载额外工具
  const config = getConfig()
  if (config.mcp?.servers && Object.keys(config.mcp.servers).length > 0) {
    const manager = new McpClientManager()
    await manager.loadTools(registry, config.mcp)
  }

  return registry
}
```

在 `.agent.yml` 里配置 MCP server，agent 启动时就能用上那些工具：

```yaml
mcp:
  servers:
    filesystem:
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    github:
      command: npx
      args: ["-y", "@modelcontextprotocol/server-github"]
      env:
        GITHUB_TOKEN: "${GITHUB_TOKEN}"
```

### 受限工具注册表

`ToolRegistry` 有一个 `createRestricted()` 方法，用于给子 agent 创建只包含部分工具的注册表：

```typescript
createRestricted(allowedTools: string[]): ToolRegistry {
  const restricted = new ToolRegistry()
  for (const name of allowedTools) {
    const tool = this.tools.get(name)
    if (tool) restricted.register(tool)
  }
  restricted.hooks = this.hooks  // hooks 继承
  return restricted
}
```

这是最小权限原则的直接体现：子 agent 只拿到它需要的工具，不能调用主 agent 的全部工具集。

## 六、边界条件和陷阱

**工具结果太大**：如果 `bash` 工具执行了 `cat large-file.log`，返回几十万行内容，会迅速撑爆 context window。工具实现里需要对结果做截断，并在截断时告知模型"结果已截断，如需完整内容请缩小范围"。

**工具描述过时**：工具的实际行为改变了，但 description 没有更新，模型会基于错误的描述做决策。工具 description 要和实现保持同步，这是容易被忽视的维护成本。

**工具名冲突**：内置工具和 MCP 工具可能有同名的情况。`ToolRegistry` 里后注册的工具会覆盖先注册的，需要注意注册顺序。

**并发安全的误判**：把不应该并行的工具标记为 `isConcurrencySafe: true`，可能导致竞态条件。比如一个工具读文件、另一个工具写同一个文件，如果并行执行，读到的可能是写了一半的内容。

## 七、与其他组件的关系

工具系统是 agent 和外部世界的接口，几乎所有其他组件都和它有关：
- **权限模型**（第 3 篇）：决定哪些工具调用需要用户确认
- **Hooks 系统**（第 9 篇）：在工具执行前后注入自定义逻辑
- **Sub-Agent**（第 8 篇）：`AgentTool` 本身就是一个工具，把"调用子 agent"抽象成了工具调用
- **Context 压缩**（第 5 篇）：工具结果会占用大量 context，是压缩的主要对象

## 八、动手练习

**练习 1：写一个工具，观察并行执行**

在 `src/core/tools/` 下新建 `get-time.ts`，注册一个返回当前时间的工具：

```typescript
import { createTool } from './registry'

export const getTimeTool = createTool({
  name: 'get_time',
  description: '获取指定时区的当前时间。适合需要知道当前时间或比较不同时区时间的场景。参数 timezone 使用 IANA 时区名称，如 Asia/Shanghai、America/New_York。',
  inputSchema: {
    type: 'object',
    properties: {
      timezone: { type: 'string', description: 'IANA 时区名称，默认本地时区' }
    }
  },
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  checkPermissions: () => ({ type: 'allow' }),
  execute: async ({ timezone }) => {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      dateStyle: 'full', timeStyle: 'long'
    }).format(new Date())
  }
})
```

在 `createToolRegistry()` 里注册它，运行 `bun run dev "现在北京、纽约、伦敦分别几点？"` 观察模型是否会并行调用三次 `get_time`。

**练习 2：体验工具描述的影响**

把 `get_time` 的 description 改成只有一句话："获取时间"，再跑同样的任务。观察模型的行为是否有变化——它还能正确传 timezone 参数吗？还是会传错或者不传？

**练习 3：故意触发工具错误**

在 `execute` 里加一个随机失败：

```typescript
execute: async ({ timezone }) => {
  if (Math.random() < 0.5) throw new Error('时区服务暂时不可用，请稍后重试')
  // ...正常逻辑
}
```

观察模型如何处理工具失败：它会重试吗？会换一种方式吗？错误信息的质量对模型的恢复行为有多大影响？

---

> **English Summary:** Tool Use (Function Calling) standardizes how agents interact with the world — the model declares intent, your code executes. Tool description quality directly determines how accurately the model uses tools. `ToolRegistry` runs a full pipeline: permission check → pre-tool hook → timeout-wrapped execution → post-tool hook. MCP enables a tool ecosystem where community-published servers can be used without writing code. Key pitfalls: oversized results, stale descriptions, name conflicts, and incorrect concurrency annotations.
>
> ⭐ Next: [Permission Model →](./03-permissions.md)
