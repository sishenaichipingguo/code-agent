# 记忆系统 —— 跨会话的持久化

## 概念

上下文压缩解决了"单次对话太长"的问题，但关掉程序重新开，一切归零。

**长期记忆**要解决的是：让 agent 在下次对话里还记得你是谁、你喜欢什么风格、上次讨论了什么。

常见方案：
- **向量数据库**（Pinecone、Chroma）：语义搜索，适合大量非结构化记忆，但需要额外服务
- **文件索引**：Markdown 文件 + 索引文件，轻量，零依赖，适合个人项目

这个项目选了文件索引——不依赖任何外部服务，记忆就是普通文件，你可以直接打开编辑。

记忆分四种类型：
- `user`：用户的角色、背景、偏好
- `feedback`：用户对 agent 行为的纠正和确认
- `project`：项目相关的上下文和决策
- `reference`：外部资源的指针（文档链接、工具位置等）

## 项目实现

### 两阶段设计：索引常驻，内容按需

记忆系统的核心设计是**两阶段加载**：

1. **索引注入 system prompt**：每次对话开始，`MEMORY.md` 索引被注入 system prompt，agent 知道"有哪些记忆可以查"
2. **内容按需加载**：agent 需要某条记忆的详细内容时，主动调用 `memory_load` 工具读取具体文件

这样避免把所有记忆都塞进 context——如果你有 50 条记忆，全部注入会占用大量 token，但实际上每次对话只需要其中几条。

### MemoryManager

`src/core/memory/manager.ts` 把记忆存成 Markdown 文件：

```typescript
manager.save({
  name: 'user_role',
  type: 'user',
  description: '用户是后端工程师，熟悉 Go',
  content: '用户主要写 Go，对 TypeScript 不熟悉，解释时用 Go 类比'
})
// 生成文件：.claude/memory/user_user_role.md
// 同时更新：.claude/memory/MEMORY.md（索引）
```

文件名格式是 `{type}_{name}.md`，索引里的条目格式是：

```markdown
## User
- [user_role](user_user_role.md) — 用户是后端工程师，熟悉 Go
```

索引按类型分节，agent 扫一眼就知道有哪些记忆、大概是什么内容。

### MEMORY_NAMESPACE：子 agent 的记忆隔离

`MemoryManager` 支持命名空间：

```typescript
constructor(projectRoot: string) {
  this.rootMemoryDir = join(projectRoot, '.claude', 'memory')
  const namespace = process.env.MEMORY_NAMESPACE
  this.memoryDir = namespace
    ? join(this.rootMemoryDir, namespace)  // 命名空间子目录
    : this.rootMemoryDir                   // 默认：根目录
  this.indexPath = join(this.rootMemoryDir, 'MEMORY.md')  // 索引始终在根目录
}
```

子 agent 可以通过 `MEMORY_NAMESPACE` 环境变量把自己的记忆写到独立的子目录，避免和主 agent 的记忆混在一起。但索引始终在根目录的 `MEMORY.md`——所有命名空间的记忆都会出现在同一个索引里，主 agent 可以看到全局视图。

### SessionStore：会话间的摘要

`SessionStore` 解决的是另一个问题：上次对话做了什么？

它不是记忆（不是关于用户的信息），而是上次会话的工作摘要。每次会话结束时，agent 可以把本次对话的关键内容写入 `SessionStore`，下次启动时这个摘要会被注入 system prompt 的 `## Previous Session` 节。

这让 agent 在多次会话里保持工作连续性——不需要用户每次都重新解释"上次我们做到哪了"。

### TeamStore：团队共享记忆

`TeamStore` 是多人协作场景的扩展：团队成员共享的知识（比如"这个项目的数据库在 192.168.1.100"、"部署用 deploy.sh 脚本"）存在 `TeamStore` 里，每个人的 agent 都能看到。

`SystemPromptBuilder` 会把 `TeamStore` 的索引注入 `## Team Memory` 节，和个人记忆并列显示。

## 动手练习

在 `src/core/memory/types.ts` 里新增一个 `preference` 类型，专门存用户的代码风格偏好：

```typescript
// 原来
export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

// 改成
export type MemoryType = 'user' | 'feedback' | 'project' | 'reference' | 'preference'
```

同时在 `MemoryManager.updateIndex()` 里加上新类型的分节：

```typescript
const sectionMap = {
  user: '## User',
  feedback: '## Feedback',
  project: '## Project',
  reference: '## Reference',
  preference: '## Preference'  // 新增
}
```

然后保存一条偏好记忆：

```typescript
manager.save({
  name: 'code_style',
  type: 'preference',
  description: '用户的代码风格偏好',
  content: '不喜欢过度注释，函数名要自解释，禁止用 any 类型，提交信息用中文'
})
```

下次对话时，agent 会自动遵守这些偏好，不需要每次重复告诉它。验证方法：让 agent 写一段代码，看它是否遵守了"禁止用 any 类型"的规则。

---

> **English Summary:** The memory system uses a two-phase design: a `MEMORY.md` index is injected into the system prompt (so the agent knows what memories exist), and full content is loaded on demand via `memory_load`. `MEMORY_NAMESPACE` env var lets sub-agents write to isolated subdirectories while sharing the root index. `SessionStore` persists cross-session work summaries. `TeamStore` enables shared team knowledge visible to all agents.
>
> ⭐ [GitHub: code-agent](https://github.com/your-repo/code-agent) | Next: [Multi-Model →](./07-multi-model.md)
