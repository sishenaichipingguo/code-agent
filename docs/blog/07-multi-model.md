# 多模型支持 —— 不绑死一个 LLM

## 概念

如果你的 agent 直接调用 `anthropic.messages.create()`，换模型就要改一堆业务代码。

解法是**适配器模式**：定义一个统一接口，每个模型实现这个接口。业务代码只依赖接口，不依赖具体模型。

这是软件设计里的"依赖倒置"——高层模块（AgentLoop）不依赖低层模块（Anthropic SDK），两者都依赖抽象（ModelAdapter 接口）。

好处很实际：
- 本地开发用 Ollama，省钱
- 生产环境用 Claude，效果好
- 切换只改一行配置，不改代码

## 项目实现

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

注意 `chatStream` 是**可选方法**（`?`）。不是所有 provider 都支持流式输出，适配器可以只实现 `chat`。`AgentLoop` 在使用前会检查：

```typescript
if (this.context.streaming && this.context.model.chatStream) {
  // 走流式路径
} else {
  // 走非流式路径（fallback）
}
```

这个设计让你可以先实现一个最简单的适配器（只有 `chat`），之后再加 `chatStream`，不需要一次性实现所有功能。

### ModelFactory

`ModelFactory` 根据 `.agent.yml` 配置选择实现：

```typescript
// src/core/models/factory.ts
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
// src/core/agent/loop.ts
const response = await this.context.model.chat(request, this.context.tools)
// this.context.model 是 ModelAdapter，不是具体实现
```

### streaming 的指数退避重试

`AnthropicAdapter` 的 streaming 路径内置了**Full Jitter 指数退避重试**，这是生产环境稳定性的关键：

```typescript
// AgentLoop.runWithStream() 里
} catch (error: any) {
  const maxRetries = 10
  const baseDelay = 1000
  const maxDelay = 60000

  if (error instanceof AgentError && error.recoverable && attempt < maxRetries) {
    // Full Jitter：随机化指数退避，避免多个 agent 同时重试造成雪崩
    const exponentialDelay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt))
    const delay = Math.random() * exponentialDelay

    await new Promise(resolve => setTimeout(resolve, delay))
    return this.runWithStream(request, messages, attempt + 1)
  }
  throw error
}
```

为什么用 Full Jitter 而不是固定等待？如果你同时跑了 10 个 agent，它们都在第 2 秒遇到限流，如果都等固定的 2 秒后重试，会在第 4 秒同时打过来，再次触发限流。Full Jitter 让每个 agent 的重试时间随机分散，避免这种"惊群效应"。

### 接入 OpenAI 兼容 API

`OllamaAdapter` 本质上是一个 OpenAI 兼容客户端。如果你想接入 DeepSeek、Qwen 或其他 OpenAI 兼容的 API，参考 `OllamaAdapter` 的实现，改一下 `baseUrl` 和认证方式就能用：

```typescript
// 伪代码，参考 OllamaAdapter 实现
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
        messages: request.messages,
        tools: tools?.toSchema()
      })
    })
    // 解析响应，转换成 ModelResponse 格式
  }
}
```

然后在 `ModelFactory` 里加一个 `case 'deepseek'`，在 `.agent.yml` 里配置 `provider: deepseek` 就能用。

## 动手练习

安装 Ollama 后，把 `.agent.yml` 改成：

```yaml
provider: ollama
baseUrl: http://localhost:11434
model: qwen2.5-coder:7b
mode: yolo
```

运行 `bun run dev "写一个快速排序"` 对比 Claude 和本地模型的输出质量和速度。

然后试试把 `streaming: true` 加到配置里，观察流式输出的效果——本地模型的流式输出延迟会比 Claude 低很多（因为不需要网络往返），但输出质量可能不如 Claude。这个权衡在不同场景下有不同的最优解。

---

> **English Summary:** The adapter pattern decouples `AgentLoop` from specific LLM providers. `ModelAdapter` interface has a required `chat()` and optional `chatStream?()` — adapters can start with just `chat` and add streaming later. `ModelFactory` selects the implementation from `.agent.yml`. The streaming path has Full Jitter exponential backoff retry (up to 10 attempts) to handle rate limits without thundering herd.
>
> ⭐ [GitHub: code-agent](https://github.com/your-repo/code-agent) | Next: [Sub-Agent →](./08-sub-agent.md)
