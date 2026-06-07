# 记忆系统 —— 让 Agent 跨越会话的遗忘

## 一、每次都要重新告诉它

我用 agent 写代码，第一次对话告诉它："我不喜欢过度注释，函数名要自解释，禁止用 any 类型。"

它记住了，那次对话写的代码很干净。

第二天开了新对话，它又开始写大量注释，又开始用 any。

我又告诉它一遍。

第三天，同样的事情发生了。

这不是 agent 的 bug，是 LLM 的架构决定的。LLM 是一个**无状态函数**：给定输入，产生输出，不保留任何状态。每次调用之间没有任何连接。每次对话都是全新的，它不记得上次发生了什么。

**解法是外部记忆**：把需要持久化的信息存到外部存储，每次对话时按需加载。这本质上是给无状态函数加了一个"状态层"。

## 二、存什么，怎么检索

记忆系统的核心矛盾是：**你希望 agent 记住尽可能多的信息，但把所有记忆都塞进 context 太贵，而且会稀释当前任务的相关信息。**

这个矛盾有几个维度：

**存什么**：不是所有信息都值得记忆。"用户喜欢简洁代码"值得记，"用户今天问了一个关于排序的问题"不值得记。记忆系统需要有选择地存储信息。

**怎么检索**：有了记忆，如何知道哪条记忆和当前任务相关？全部加载太贵，随机加载没用。

**怎么更新**：记忆会过时。"用户在用 Python 2"这条记忆，在用户升级到 Python 3 后就错了。如何识别和更新过时的记忆？

## 三、向量数据库 vs 文件索引

两种主流方案：

**向量数据库（Pinecone、Chroma、Weaviate）**：
- 把记忆转换成向量（embedding），存入向量数据库
- 检索时，把当前问题也转换成向量，找最相似的记忆
- 优点：语义搜索，能找到"意思相近"的记忆，即使措辞不同
- 缺点：需要额外的 embedding 模型调用，需要维护外部服务，成本更高

**文件索引（这个项目的选择）**：
- 把记忆存成 Markdown 文件，维护一个索引文件
- 把索引注入 system prompt，让模型自己判断哪条记忆相关
- 优点：零依赖，记忆是普通文件可以直接编辑，实现简单
- 缺点：依赖模型的判断能力，记忆太多时索引会很长

为什么选文件索引？这个项目的目标是"零依赖，开箱即用"。向量数据库需要额外的服务和 API key，增加了部署复杂度。对于个人使用场景，文件索引的效果已经足够好。

但文件索引有一个根本局限：**检索质量依赖模型的判断**。如果模型没有注意到某条相关记忆，它就不会去加载。向量数据库的语义搜索在这方面更可靠。

## 四、两阶段加载：解决完整性 vs 效率矛盾的关键设计

记忆系统的核心设计是**两阶段加载**，这是解决"记忆完整性 vs 检索效率"矛盾的关键：

**第一阶段：索引常驻 system prompt**

每次对话开始，`MEMORY.md` 索引被注入 system prompt：

```markdown
## Memory

### User
- [user_role](user_user_role.md) — 用户是后端工程师，熟悉 Go，对 TypeScript 不熟悉

### Feedback
- [code_style](feedback_code_style.md) — 不喜欢过度注释，函数名要自解释

### Project
- [db_schema](project_db_schema.md) — 数据库 schema 设计和字段说明
```

模型看到索引，知道"有哪些记忆可以查"，但不知道每条记忆的详细内容。

**第二阶段：内容按需加载**

当模型判断某条记忆和当前任务相关时，主动调用 `memory_load` 工具读取具体文件：

```
模型：我需要了解数据库 schema，让我加载相关记忆
工具调用：memory_load("project_db_schema.md")
工具结果：[详细的 schema 说明...]
```

这样避免把所有记忆都塞进 context——如果你有 50 条记忆，全部注入会占用大量 token，但实际上每次对话只需要其中几条。

这个设计和数据库索引的思路完全一样：索引告诉你"数据在哪里"，你按需读取具体数据，而不是把整个数据库加载到内存里。这里再啰嗦一下：两阶段加载是记忆系统里最重要的设计决策，分析"为什么 agent 没有用到某条记忆"时，要先检查索引里有没有这条记忆，再检查模型是否注意到了它。

## 五、项目实现

### MemoryManager

`src/core/memory/manager.ts` 把记忆存成 Markdown 文件：

```typescript
manager.save({
  name: 'user_role',
  type: 'user',
  description: '用户是后端工程师，熟悉 Go',
  content: `
用户主要写 Go，对 TypeScript 不熟悉。
解释 TypeScript 概念时，用 Go 类比（比如 interface → Go interface，
async/await → goroutine + channel）。
不要假设用户知道 TypeScript 的特定语法。
  `.trim()
})
```

文件名格式是 `{type}_{name}.md`，文件内容包含 frontmatter 和正文：

```markdown
---
name: user_role
type: user
description: 用户是后端工程师，熟悉 Go
---

用户主要写 Go，对 TypeScript 不熟悉...
```

索引按类型分节，agent 扫一眼就知道有哪些记忆、大概是什么内容。

### 记忆的四种类型

记忆分四种类型，每种类型有不同的用途和更新频率：

**`user`**：关于用户的信息——角色、背景、技术栈、偏好。相对稳定，不经常变化。

**`feedback`**：用户对 agent 行为的纠正和确认。这是最重要的类型——当用户说"不要这样做"或"就是这样，继续"，agent 应该立即保存这条反馈，避免下次重蹈覆辙。

**`project`**：项目相关的上下文和决策——架构决策、技术选型、重要约定。这类记忆有时效性，需要定期更新。

**`reference`**：外部资源的指针——文档链接、工具位置、API 端点。这类记忆最容易过时，需要定期验证。

### MEMORY_NAMESPACE：子 agent 的记忆隔离

`MemoryManager` 支持命名空间：

```typescript
constructor(projectRoot: string) {
  this.rootMemoryDir = join(projectRoot, '.claude', 'memory')
  const namespace = process.env.MEMORY_NAMESPACE
  this.memoryDir = namespace
    ? join(this.rootMemoryDir, namespace)  // 命名空间子目录
    : this.rootMemoryDir
  this.indexPath = join(this.rootMemoryDir, 'MEMORY.md')  // 索引始终在根目录
}
```

子 agent 通过 `MEMORY_NAMESPACE` 环境变量把自己的记忆写到独立的子目录，避免和主 agent 的记忆混在一起。但索引始终在根目录——所有命名空间的记忆都会出现在同一个索引里，主 agent 可以看到全局视图。

这个设计解决了一个实际问题：子 agent 可能会保存一些"临时性"的记忆（比如"当前任务的中间状态"），这些记忆不应该污染主 agent 的记忆空间，但主 agent 需要能看到子 agent 保存了什么。

## 六、边界条件和陷阱

**记忆的过时问题**：记忆会过时，但 agent 不知道。"用户在用 Python 2"这条记忆，在用户升级到 Python 3 后就错了，但 agent 还会基于它做决策。需要定期审查记忆，删除或更新过时的条目。

**记忆的冲突问题**：两条记忆可能互相矛盾（"用户喜欢详细注释"和"用户不喜欢过度注释"）。`MemoryManager` 不会自动检测冲突，需要人工维护。

**索引截断的影响**：当记忆太多时，`truncateMemoryIndex()` 会截断索引。被截断的记忆不会出现在 system prompt 里，模型不知道它们的存在，也就不会去加载。这意味着记忆太多时，旧的记忆会被"遗忘"。

**记忆的安全性**：记忆文件是普通文件，任何有文件系统访问权限的人都可以读取和修改。如果记忆里包含敏感信息（API key、密码），需要注意安全。

**两阶段加载的盲区**：如果模型没有注意到索引里的某条记忆，它就不会去加载。这意味着记忆系统的效果依赖模型的注意力——如果模型在处理复杂任务时"分心"，可能会忽略相关记忆。

## 七、与其他组件的关系

记忆系统和上下文压缩（第 5 篇）是互补的：
- 上下文压缩管理"当前会话"的短期记忆
- 记忆系统管理"跨会话"的长期记忆

两者的协作模式：当 agent 判断某些信息"值得长期保留"时，先用 `memory_save` 存入记忆系统，再让上下文压缩把它从短期记忆里清除。这样重要信息不会因为压缩而丢失。

记忆系统和 system prompt（第 4 篇）紧密耦合：记忆索引通过 `SystemPromptBuilder` 注入 system prompt，是 system prompt 的重要组成部分。

记忆系统和子 agent（第 8 篇）通过 `MEMORY_NAMESPACE` 协作：子 agent 有独立的记忆空间，但主 agent 可以看到全局视图。

## 八、动手练习

**练习 1：保存一条记忆，观察效果**

在 `src/cli/yolo.ts` 里，在 agent 初始化后手动保存一条记忆：

```typescript
const memoryManager = new MemoryManager(process.cwd())
memoryManager.save({
  name: 'code_style',
  type: 'feedback',
  description: '代码风格偏好',
  content: '不喜欢过度注释。函数名要自解释。禁止使用 any 类型。提交信息用中文。'
})
```

然后让 agent 写一段代码，观察它是否自动遵守了这些偏好，而不需要你在 prompt 里重复说明。

**练习 2：观察两阶段加载**

在 `MemoryManager.load()` 里加日志，记录每次加载了哪条记忆：

```typescript
load(name: string): string {
  process.stderr.write(`[memory] loading: ${name}\n`)
  // ...原有逻辑
}
```

跑几个不同的任务，观察 agent 在不同任务里加载了哪些记忆。你会发现 agent 会根据任务内容选择性地加载相关记忆，而不是每次都加载所有记忆。

**练习 3：体验记忆过时的问题**

保存一条记忆："用户的项目使用 React 16"。然后让 agent 帮你写一段 React 代码，观察它是否会基于这条（可能过时的）记忆做决策。然后更新记忆为"用户的项目使用 React 18"，再跑同样的任务，观察行为变化。

**练习 4：测试记忆冲突**

故意保存两条互相矛盾的记忆（比如"用户喜欢详细注释"和"用户不喜欢注释"），观察 agent 如何处理冲突——它会选择哪条记忆？这能让你理解记忆系统的局限性。

---

> **English Summary:** LLMs have no native long-term memory — every call starts fresh. The memory system uses a two-phase design: a `MEMORY.md` index is injected into the system prompt (agent knows what exists), full content is loaded on demand via `memory_load` (agent loads what's relevant). Four memory types: user, feedback, project, reference. `MEMORY_NAMESPACE` isolates sub-agent memories. Key pitfall: memories go stale and the system has no automatic staleness detection.
>
> ⭐ Next: [Multi-Model →](./07-multi-model.md)
