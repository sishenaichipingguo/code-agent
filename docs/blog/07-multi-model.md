# 多模型支持 —— 适配器模式的实践

## 一、问题背景：为什么需要多模型支持

不同的 LLM 在不同维度上有不同的权衡：

| 维度 | 大模型（Claude Opus、GPT-4） | 小模型（Haiku、本地 Ollama） |
|------|--------------------------|--------------------------|
| 推理能力 | 强，适合复杂任务 | 弱，适合简单任务 |
| 速度 | 慢（1-5 秒/响应） | 快（<1 秒/响应） |
| 成本 | 高（$15-60/M tokens） | 低或免费 |
| 隐私 | 数据发送到云端 | 本地运行，数据不出机器 |
| 可用性 | 依赖网络和 API | 本地运行，离线可用 |

没有一个模型在所有维度上都最优。实际使用中，你可能希望：
- 日常开发用本地 Ollama，省钱且快
- 复杂的架构分析用 Claude Opus，效果好
- 敏感代码用本地模型，数据不出机器
- CI/CD 里用 Haiku，便宜且够用

如果 agent 直接调用 `anthropic.messages.create()`，切换模型就要改业务代码。这违反了"开闭原则"——对扩展开放，对修改关闭。

## 二、核心矛盾：统一接口 vs 模型差异

多模型支持的核心矛盾是：**不同模型的 API 差异很大，但你希望用统一的方式调用它们。**

差异体现在：
- **API 格式**：Anthropic 和 OpenAI 的消息格式不同，工具调用格式不同
- **能力差异**：不是所有模型都支持工具调用，不是所有模型都支持流式输出
- **错误处理**：不同模型的错误码和错误信息格式不同
- **参数差异**：temperature、max_tokens 等参数的范围和默认值不同

适配器模式的核心思路是：**定义一个统一的接口，把差异封装在适配器里**。业务代码只依赖接口，不依赖具体实现。

## 三、设计空间：适配器模式的几种变体

适配器模式（Adapter Pattern）是软件设计里的经典模式，但实现质量差异很大。好的适配器设计有几个原则：

**接口要稳定**：接口一旦定义，就不应该频繁变化。每次接口变化都需要所有适配器同步更新。接口设计要考虑未来的扩展性，但也要避免过度设计。

**适配器要薄**：适配器只做格式转换，不包含业务逻辑。业务逻辑（重试、压缩、权限检查）在上层处理，不在适配器里。

**可选能力要明确标注**：不是所有模型都支持所有能力（比如流式输出）。可选能力用可选方法（`?`）标注，调用方在使用前检查是否存在。

**错误要统一**：不同模型的错误格式不同，适配器要把它们转换成统一的错误格式，让上层不需要处理各种不同的错误类型。

## 四、项目实现

### ModelAdapter 接口

`src/core/models/adapter.ts` 定义统一接口：

```typescript
export interface ModelAdapter {
  name: string
  chat(request: ChatRequest, tools?: ToolRegistry): Promise<ModelResponse>
  chatStream?(
    request: ChatRequest,
    tools?: ToolRegistry
  ): AsyncGenerator<StreamChunk>
}
```

接口设计的几个决策：

**`chatStream` 是可选方法（`?`）**：不是所有 provider 都支持流式输出，适配器可以只实现 `chat`。`AgentLoop` 在使用前检查：

```typescript
if (this.context.streaming && this.context.model.chatStream) {
  // 走流式路径
} else {
  // 走非流式路径（fallback）
}
```

这让你可以先实现一个最简单的适配器（只有 `chat`），之后再加 `chatStream`，不需要一次性实现所有功能。

**`tools` 是可选参数**：不是所有调用都需要工具（比如生成摘要时不需要工具）。把 `tools` 设为可选，让适配器可以在不需要工具时跳过工具相关的格式转换。

**返回 `ModelResponse` 而不是原始 API 响应**：适配器把各种模型的响应格式统一转换成 `ModelResponse`，上层不需要处理各种不同的响应格式。

### ModelFactory

`ModelFactory` 根据 `.agent.yml` 配置选择实现：

```typescript
export function createModel(config: AgentConfig): ModelAdapter {
  switch (config.provider) {
    case 'anthropic': return new AnthropicAdapter(config)
    case 'ollama':    return new OllamaAdapter(config)
    default: throw new Error(`Unknown provider: ${config.provider}`)
  }
}
```

`AgentLoop` 只知道 `ModelAdapter`，完全不知道底层是 Claude 还是 Ollama：

```typescript
const response = await this.context.model.chat(request, this.context.tools)
// this.context.model 是 ModelAdapter，不是具体实现
```

这是"依赖倒置原则"的体现：高层模块（AgentLoop）不依赖低层模块（AnthropicAdapter），两者都依赖抽象（ModelAdapter 接口）。

### Full Jitter 指数退避重试

Streaming 路径内置了**Full Jitter 指数退避重试**，这是生产环境稳定性的关键：

```typescript
} catch (error: any) {
  if (error instanceof AgentError && error.recoverable && attempt < 10) {
    const exponentialDelay = Math.min(60000, 1000 * Math.pow(2, attempt))
    const delay = Math.random() * exponentialDelay  // Full Jitter
    await new Promise(resolve => setTimeout(resolve, delay))
    return this.runWithStream(request, messages, attempt + 1)
  }
  throw error
}
```

为什么用 Full Jitter 而不是固定等待或纯指数退避？

**固定等待**（比如每次等 2 秒）：如果你同时跑了 10 个 agent，它们都在第 2 秒遇到限流，都等 2 秒后重试，会在第 4 秒同时打过来，再次触发限流。这叫"惊群效应"。

**纯指数退避**（第 1 次等 1 秒，第 2 次等 2 秒，第 3 次等 4 秒...）：比固定等待好，但多个 agent 的重试时间仍然是同步的（都是 1、2、4、8...秒）。

**Full Jitter**（在指数退避的基础上加随机化）：每个 agent 的重试时间完全随机，分散在 [0, 指数退避上限] 的范围内。多个 agent 的重试时间自然分散，不会同时打过来。

这是分布式系统里的经典技巧，在 AWS 的技术博客里有详细讨论。

### 接入 OpenAI 兼容 API

`OllamaAdapter` 本质上是一个 OpenAI 兼容客户端。如果你想接入 DeepSeek、Qwen 或其他 OpenAI 兼容的 API，参考 `OllamaAdapter` 的实现：

```typescript
export class DeepSeekAdapter implements ModelAdapter {
  name = 'deepseek-chat'

  async chat(request: ChatRequest, tools?: ToolRegistry): Promise<ModelResponse> {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: this.convertMessages(request.messages),
        tools: tools ? this.convertTools(tools) : undefined
      })
    })
    return this.convertResponse(await response.json())
  }
}
```

然后在 `ModelFactory` 里加一个 `case 'deepseek'`，在 `.agent.yml` 里配置 `provider: deepseek` 就能用。

## 五、边界条件和陷阱

**模型能力的差异被低估**：同样的 prompt，在 Claude Opus 和 Qwen 7B 上的效果可能差异巨大。适配器模式让切换模型变得容易，但不能保证切换后效果相同。在切换模型前，需要在你的具体任务上测试效果。

**工具调用的兼容性**：不是所有模型都支持工具调用，或者支持的方式不同。`OllamaAdapter` 需要把工具调用格式从 Anthropic 格式转换成 OpenAI 格式，这个转换可能不完美（比如某些参数类型的处理方式不同）。

**流式输出的格式差异**：不同模型的流式输出格式不同，适配器需要把它们统一转换成 `StreamChunk` 格式。这个转换比较复杂，容易出 bug。

**本地模型的上下文限制**：本地模型（Ollama）的 context window 通常比云端模型小很多（比如 4k vs 200k）。如果你的任务需要长 context，切换到本地模型可能会频繁触发 context 压缩，甚至压缩后还是太长。

**接口稳定性的代价**：为了保持接口稳定，有时候需要在适配器里做一些"不自然"的转换。比如 Anthropic 的工具调用格式和 OpenAI 的不同，统一成一种格式意味着某些特性可能无法完整表达。

## 六、与其他组件的关系

`ModelAdapter` 是 `AgentLoop` 的核心依赖，几乎所有功能都通过它调用模型：
- **上下文压缩**（第 5 篇）：压缩时调用模型生成摘要，也通过 `ModelAdapter`
- **Streaming**（第 1 篇）：`chatStream?` 方法支持流式输出
- **重试机制**：Full Jitter 重试在 `AgentLoop` 里实现，不在适配器里

`ModelFactory` 和配置系统（`.agent.yml`）紧密耦合：配置里的 `provider` 字段决定使用哪个适配器。

## 七、动手练习

**练习 1：切换到本地模型**

安装 Ollama 后，把 `.agent.yml` 改成：

```yaml
provider: ollama
baseUrl: http://localhost:11434
model: qwen2.5-coder:7b
mode: yolo
```

运行 `bun run dev "写一个快速排序"` 对比 Claude 和本地模型的输出质量和速度。注意本地模型的响应速度（通常更快，因为没有网络延迟）和输出质量（通常比 Claude 差）。

**练习 2：实现一个最简单的适配器**

实现一个 `EchoAdapter`，不调用任何 LLM，直接把用户输入原样返回：

```typescript
export class EchoAdapter implements ModelAdapter {
  name = 'echo'

  async chat(request: ChatRequest): Promise<ModelResponse> {
    const lastMessage = request.messages[request.messages.length - 1]
    const content = typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content)
    return { type: 'text', content: `Echo: ${content}` }
  }
}
```

在 `ModelFactory` 里加上 `case 'echo'`，用它跑 agent，观察 agent 的行为——它会陷入无限循环吗？（因为 echo 永远不会返回 `tool_use`，所以会立即返回 `text`，循环只跑一轮就结束了。）

**练习 3：观察 Full Jitter 的效果**

在 `runWithStream` 的重试逻辑里加日志：

```typescript
process.stderr.write(`[retry] attempt ${attempt}, waiting ${Math.round(delay)}ms\n`)
```

然后故意让 API 调用失败（比如传一个无效的 API key），观察重试的等待时间是否是随机的，而不是固定的。

**练习 4：预测接口变化的影响**

假设你要给 `ModelAdapter` 接口加一个新方法 `countTokens(text: string): number`，思考：
- 哪些现有代码需要修改？
- 如果把这个方法设为可选（`countTokens?`），影响有什么不同？
- 这个练习能让你理解接口设计的稳定性为什么重要。

---

> **English Summary:** Different LLMs have different trade-offs (capability, speed, cost, privacy). The adapter pattern (`ModelAdapter` interface) decouples `AgentLoop` from specific providers. `chatStream?` is optional — adapters can start with just `chat`. `ModelFactory` selects the implementation from config. Full Jitter exponential backoff prevents thundering herd when multiple agents retry simultaneously. Key pitfall: switching models is easy, but effect quality may differ significantly — always test on your specific tasks.
>
> ⭐ Next: [Sub-Agent →](./08-sub-agent.md)
