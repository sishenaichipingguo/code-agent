# System Prompt 工程 —— 告诉模型它是谁

## 概念

System prompt 是你在对话开始前告诉模型的"背景设定"。

大多数教程里 system prompt 就一句话："你是一个有帮助的助手。"

但生产级 agent 的 system prompt 是**动态组装**的，包含：
- 角色定义和行为规则
- 当前环境信息（操作系统、工作目录、git 状态）
- 上次会话的摘要（让 agent 记得上次做了什么）
- 用户的历史记忆索引
- 团队共享记忆
- 项目级指令（`CLAUDE.md`）

这让模型知道"我在哪台机器上、当前项目是什么状态、这个用户喜欢什么风格、上次我们讨论到哪了"。静态 prompt 是死的，动态 prompt 是活的。

## 项目实现

`src/core/system-prompt/builder.ts` 里的 `SystemPromptBuilder` 类负责组装：

```typescript
export class SystemPromptBuilder {
  constructor(
    private cwd: string,
    private memoryManager?: MemoryManager,    // 个人记忆
    private sessionStore?: SessionStore,       // 上次会话摘要
    private teamStore?: TeamStore              // 团队共享记忆
  ) {}

  async build(): Promise<string> {
    const sections: string[] = []

    // 1. 角色定义 + 工具使用规则（硬编码）
    sections.push(this.buildCore())

    // 2. 环境信息（运行时获取）
    sections.push(this.buildEnv())

    // 3. 上次会话摘要（如果有）
    if (this.sessionStore) {
      const summary = this.sessionStore.load()
      if (summary.trim()) sections.push(`## Previous Session\n${summary.trim()}`)
    }

    // 4. 个人记忆索引（如果有条目）
    const memory = this.buildMemory()
    if (memory) sections.push(memory)

    // 5. 团队共享记忆（如果有条目）
    if (this.teamStore) {
      const teamIndex = this.teamStore.loadIndex().trim()
      if (/^- \[/m.test(teamIndex)) {
        sections.push(`## Team Memory\n${truncateMemoryIndex(teamIndex)}`)
      }
    }

    // 6. CLAUDE.md（项目级指令）
    const claudeMd = await loadClaudeMd(this.cwd)
    if (claudeMd) sections.push(claudeMd)

    return sections.join('\n\n---\n\n')  // 用 --- 分隔各节
  }
}
```

### 环境信息：让模型知道它在哪

```typescript
private buildEnv(): string {
  const lines = [
    `## Environment`,
    `- OS: ${platform()}`,
    `- Shell: ${process.env.SHELL ?? 'bash'}`,
    `- Working directory: ${this.cwd}`,
    `- Date: ${new Date().toISOString().split('T')[0]}`
  ]

  // git 信息：best effort，不是 git 仓库就跳过
  try {
    const branch = execSync('git branch --show-current', { timeout: 3000 }).toString().trim()
    const status = execSync('git status --short', { timeout: 3000 }).toString().trim()
    lines.push(`- Git branch: ${branch || '(detached HEAD)'}`)
    lines.push(status ? `- Git status:\n${status}` : `- Git status: clean`)
  } catch { /* 不是 git 仓库，跳过 */ }

  return lines.join('\n')
}
```

注意 git 命令有 3 秒超时，且用 `try/catch` 包裹——agent 可能在非 git 目录下运行，这里不能因为 git 不可用就崩溃。

### 记忆索引的截断保护

记忆索引注入 system prompt 时有一个重要的保护：`truncateMemoryIndex()`。

如果用户积累了大量记忆，索引文件可能很长，直接塞进 system prompt 会撑爆 context window。`truncateMemoryIndex` 会在超过一定长度时截断，确保 system prompt 不会因为记忆太多而失控：

```typescript
private buildMemory(): string {
  const raw = this.memoryManager.loadIndex().trim()
  const hasEntries = /^- \[/m.test(raw)
  if (!hasEntries) return ''
  return `## Memory\n${truncateMemoryIndex(raw)}`  // 截断保护
}
```

注意这里只注入**索引**（每条记忆的一行摘要），不注入记忆的完整内容。agent 看到索引后，如果需要某条记忆的详细内容，会主动调用 `memory_load` 工具去读。这是一个两阶段设计：索引常驻 context，内容按需加载。

### sections 用 `---` 分隔的意图

各节之间用 `\n\n---\n\n` 分隔，而不是简单的换行。这是有意为之：Markdown 的 `---` 是水平分割线，在视觉上清晰地区分各节，同时也给模型一个明确的"这是新的一节"信号。

### CLAUDE.md：项目级指令

`CLAUDE.md` 这个设计很实用：你在项目根目录放一个 `CLAUDE.md`，agent 就会自动读取并遵守里面的规则，不需要每次手动告诉它。

`loadClaudeMd()` 会从当前工作目录向上查找，直到找到 `CLAUDE.md` 或到达文件系统根目录。这意味着你可以在 monorepo 的根目录放一个全局 `CLAUDE.md`，各子项目也可以有自己的 `CLAUDE.md`，它们会被合并。

## 动手练习

在 `SystemPromptBuilder.buildEnv()` 里加上最近一次 git commit 信息：

```typescript
try {
  const branch = execSync('git branch --show-current', { timeout: 3000 }).toString().trim()
  const status = execSync('git status --short', { timeout: 3000 }).toString().trim()
  const lastCommit = execSync('git log -1 --pretty="%h %s"', { timeout: 3000 }).toString().trim()

  lines.push(`- Git branch: ${branch || '(detached HEAD)'}`)
  lines.push(`- Last commit: ${lastCommit}`)
  if (status) {
    lines.push(`- Git status:\n${status.split('\n').map(l => `  ${l}`).join('\n')}`)
  }
} catch { /* 不是 git 仓库 */ }
```

运行后，问 agent "我最近改了什么"，它能直接引用最近的 commit 信息回答，而不需要自己去跑 `git log`。

---

> **English Summary:** `SystemPromptBuilder` in `src/core/system-prompt/builder.ts` dynamically assembles the system prompt from six sources: role rules, environment info (OS/shell/git), previous session summary, personal memory index, team memory, and CLAUDE.md. The memory index uses `truncateMemoryIndex()` to prevent context overflow. Only the index is injected — full memory content is loaded on demand via the `memory_load` tool.
>
> ⭐ [GitHub: code-agent](https://github.com/your-repo/code-agent) | Next: [Context Compression →](./05-context-compression.md)
