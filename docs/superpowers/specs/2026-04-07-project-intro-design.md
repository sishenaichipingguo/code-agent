# 项目介绍文档设计规范

**日期**：2026-04-07
**目标文件**：`docs/介绍.md`
**形式**：独立中文介绍文档
**受众**：使用者 / 学习者 / 贡献者（三类受众分层覆盖）
**结构策略**：问题驱动型叙事，概述层不含代码，深入章节含代码片段和 ASCII 图

---

## 文档目录结构

```
一、为什么需要这个项目        ← 痛点叙事，建立共鸣
二、它能做什么                ← 30秒定位 + 全景架构图
三、核心机制：ReAct 循环      ← ASCII 流程图，面向所有人
四、六大子系统解析            ← 分层：概述→流程图→代码片段
    4.1 入口路由
    4.2 Agent 主循环
    4.3 工具系统与权限模型
    4.4 Sub-agent 并行执行
    4.5 上下文自动压缩
    4.6 记忆与会话持久化
五、快速上手                  ← 用户视角，3步跑起来
六、扩展指南                  ← 贡献者视角，4个扩展点
七、项目全景：模块依赖图       ← 收尾完整地图
```

---

## 各章节内容设计

### 第一章：为什么需要这个项目

**叙事逻辑**：共鸣场景 → 问题本质化 → 真实任务流程 → 现有方案不足 → 一句话定位

**内容要点**：
- 开篇用"粘贴报错循环"场景建立共鸣
- 点明无状态对话的根本局限
- 用代码块展示真实工程任务的多步骤特征
- 对比 LangChain（太重）和裸调 API（太简）的不足
- 收尾：Code Agent 填的是哪个空白

---

### 第二章：它能做什么

**内容要点**：
- 一句话定位
- 全景 ASCII 架构图（五层：用户→CLI→AgentLoop→会话记忆→Sub-agent）
- 六大核心能力对照表（能力 + 一句话说明）

**全景图层次**：
```
用户 / 调用方
  └→ CLI 入口层（yolo / safe / MCP 服务器）
       └→ Agent 核心循环（模型适配器 + 工具注册表 + Hook 中间件 + 上下文压缩）
            ├→ 会话 & 记忆层（SessionManager + MemoryManager）
            └→ Sub-agent 层（并行子进程 · 权限沙箱 · 多 Backend）
```

---

### 第三章：核心机制：ReAct 循环

**内容要点**：
- 对比传统"一问一答"与 Agent 循环的区别
- 完整 ASCII 流程图（含并行工具判断分支 + Token 压缩触发点）
- 三个关键设计决策：
  1. `while(true)` 的原因：不知道需要几轮工具调用
  2. 工具并行的条件：全部只读才并行，有写操作退回串行
  3. 上下文压缩的时机：80% Token 上限触发，保留最近几轮原始内容

---

### 第四章：六大子系统解析

#### 4.1 入口路由（`src/cli/index.ts`）

**概述**：CLI 入口是整个系统的"交通枢纽"，根据参数决定走哪条执行路径。

**四条路径**：
| 条件 | 路径 |
|------|------|
| `--mcp-serve` | MCP 服务器模式，把工具暴露给外部 |
| `--ui` + yolo | Ink TUI 图形界面 |
| yolo（默认） | CLI 文字模式，无权限检查 |
| safe | CLI 文字模式，危险操作需确认 |

**关键设计**：动态 `import()` 懒加载，只有真正需要某个模式时才加载对应代码，启动时间 < 100ms。

**代码示例**：展示懒加载模式切换的核心逻辑（约 10 行）

---

#### 4.2 Agent 主循环（`src/core/agent/loop.ts`）

**概述**：`AgentLoop` 是整个框架的心脏，维护消息历史，驱动模型与工具之间的交互。

**AgentContext 依赖注入**：
```
AgentContext {
  model          ← 模型适配器（可替换）
  tools          ← 工具注册表（可扩展）
  permissionContext ← 权限上下文（yolo/safe/auto）
  contextManager ← 上下文压缩（可选）
  sessionManager ← 会话持久化（可选）
  hooks          ← Hook 中间件（可选）
}
```

**关键设计**：所有依赖通过构造函数注入，AgentLoop 本身不知道用的是哪个模型、哪些工具——这是它可测试、可替换的基础。

**代码示例**：展示 while 循环的核心分支（text / tool_use / error）

---

#### 4.3 工具系统与权限模型（`src/core/tools/registry.ts`）

**概述**：工具系统是框架最核心的扩展点，权限模型决定哪些操作需要用户确认。

**工具接口**：每个工具声明自己的能力边界：
```typescript
interface Tool {
  name, description, inputSchema  // 告诉 AI 这个工具是什么
  execute(input)                   // 实际执行逻辑
  isConcurrencySafe()              // 可以并行吗？
  isReadOnly()                     // 只读操作？
  isDestructive()                  // 危险操作？
  checkPermissions()               // 权限检查逻辑
}
```

**权限决策流程**：
```
bypass 模式 → 直接允许
  ↓
工具自身 checkPermissions() → deny? 直接拒绝
  ↓
匹配 allowRules（用户预设白名单）→ 命中则允许
  ↓
auto 模式 → 拒绝（子进程沙箱用）
  ↓
default 模式 → 提示用户确认（safe 模式）
```

**代码示例**：`createTool` 工厂函数（展示安全默认值的设计）

---

#### 4.4 Sub-agent 并行执行（`src/core/agent/`）

**概述**：这是整个框架最有特色的设计——Agent 可以派遣子进程 Agent 并行处理子任务，每个子 Agent 有独立的工具权限沙箱。

**完整数据流**：
```
父 AgentLoop
  │  AI 返回 tool_use: { name: "agent", input: { subagent_type, prompt } }
  ▼
AgentTool.execute()
  ▼
AgentDispatcher.dispatch()
  ├── 查 SUBAGENT_CONFIGS（工具白名单 + 超时 + 系统提示）
  └── BackendFactory.detect()（自动选 Backend）
       ▼
InProcessBackend.execute()
  │  spawn('bun', ['run', 'src/core/agent/runner.ts'], {
  │    env: { SUBAGENT_PROMPT: base64(prompt), SUBAGENT_TOOLS: [...] }
  │  })
  ▼
[子进程: runner.ts]
  │  构建受限 ToolRegistry → 运行完整 AgentLoop
  └── process.stdout.write(JSON.stringify({ success, result }))
  ▼
父进程收到 stdout → JSON.parse → 返回给 AI 作为 tool_result
```

**四种子 Agent 类型及权限对比**：
| 类型 | 允许工具 | 设计意图 |
|------|---------|---------|
| `explore` | read, glob, grep, ls | 只读探索，绝不修改 |
| `plan` | read, glob, grep, ls, plan | 制定计划，不写代码 |
| `context-gatherer` | read, glob, grep, bash | 收集上下文 |
| `general-purpose` | 几乎全部 | 完整执行能力 |

**三个关键设计细节**：
1. **Base64 编码 Prompt**：环境变量不能含换行/特殊字符，Base64 保证安全传输
2. **stdout 是纯净 JSON 通道**：所有调试日志走 stderr，父进程只解析 stdout
3. **后台模式**：`run_in_background: true` 立即返回 agentId，父 Agent 可同时派遣多个子 Agent，之后用 `send_message` 收集结果

**代码示例**：InProcessBackend 的 spawn 调用（约 15 行）

---

#### 4.5 上下文自动压缩（`src/core/context/manager.ts`）

**概述**：长任务的天敌是 Token 上限。压缩机制让 Agent 可以无限续跑。

**触发条件**：输入 Token 超过模型上限的 80%

**三种压缩策略**：
| 策略 | 触发方式 | 行为 |
|------|---------|------|
| `auto` | 自动触发 | 摘要旧消息，保留最近几轮 |
| `micro` | 自动触发（更激进） | 最小化保留，极限压缩 |
| `manual` | 用户执行 `/compact` | 手动触发，同 auto |

**PTL 重试机制**：如果 API 直接返回"prompt too long"错误，`ptlRetry` 自动压缩后重试一次，对调用方完全透明。

---

#### 4.6 记忆与会话持久化

**概述**：两套独立的持久化机制，解决不同问题。

**记忆系统**（跨会话，注入 System Prompt）：
- 存储路径：`.claude/memory/`
- 索引文件：`MEMORY.md`（每次对话开始时注入到系统提示）
- 四种类型：`user`（用户偏好）/ `feedback`（行为反馈）/ `project`（项目上下文）/ `reference`（外部资源指针）
- 子 Agent 有独立命名空间（`MEMORY_NAMESPACE` 环境变量），不污染主 Agent 记忆

**会话持久化**（当次对话，可续接）：
- 存储路径：`.agent/sessions/`
- 每条消息生成时实时写入 JSON
- `--continue` 标志恢复上次会话的完整消息历史

---

### 第五章：快速上手

**面向**：想立刻用起来的开发者

**三步结构**：
1. 安装依赖（`bun install`）
2. 配置 API Key
3. 运行第一个任务

**展示四种常用命令**：
```bash
# 基础用法
bun run dev "帮我找出所有超过 100 行的 TypeScript 文件"

# 安全模式（危险操作需确认）
bun run dev --mode safe "删除所有 .log 文件"

# 交互式 TUI
bun run dev --ui "重构这个函数"

# 续接上次会话
bun run dev --continue "继续刚才的任务"
```

**配置文件示例**（`.agent.yml`，含注释说明每个字段的作用）

---

### 第六章：扩展指南

**面向**：想定制或贡献代码的开发者

**四个扩展点**：

**① 接入新模型**（实现 `ModelAdapter` 接口，2 个方法）：
```typescript
interface ModelAdapter {
  name: string
  chat(request, toolRegistry): Promise<UnifiedResponse>
  chatStream?(request, toolRegistry): AsyncGenerator<StreamChunk>  // 可选
}
```

**② 添加自定义工具**（用 `createTool` 工厂函数）：
```typescript
const MyTool = createTool({
  name: 'my_tool',
  description: '工具描述（AI 靠这个决定何时调用）',
  inputSchema: { type: 'object', properties: { ... } },
  execute: async (input) => { /* 实现逻辑 */ },
  isReadOnly: () => true,  // 声明只读，允许并行执行
})
registry.register(MyTool)
```

**③ 新增 Sub-agent 类型**（在 `config.ts` 加一条配置）：
```typescript
'my-specialist': {
  type: 'my-specialist',
  allowedTools: ['read', 'glob', 'bash'],
  maxTokens: 50000,
  timeout: 300000,
  systemPrompt: '你是一个专门做 X 的专家...'
}
```

**④ 接入 MCP 服务器**（在 `.agent.yml` 配置，工具自动注入）：
```yaml
mcp:
  servers:
    my-server:
      command: npx
      args: ['-y', '@my/mcp-server']
```

---

### 第七章：项目全景：模块依赖图

**内容**：一张完整的模块依赖 ASCII 图，展示所有模块之间的关系，作为文档收尾。

```
src/
├── cli/                    ← 入口层
│   ├── index.ts            ← 路由分发
│   ├── yolo.ts / safe.ts   ← 两种执行模式
│   └── yolo-ui.ts          ← Ink TUI
│
├── core/
│   ├── agent/
│   │   ├── loop.ts         ← 核心循环（依赖 model + tools + context + session + hooks）
│   │   ├── dispatcher.ts   ← Sub-agent 调度
│   │   ├── runner.ts       ← Sub-agent 入口
│   │   └── backends/       ← in-process / tmux / iterm2
│   │
│   ├── models/             ← 模型适配器（Anthropic / Ollama）
│   ├── tools/              ← 工具注册表 + 14 个内置工具
│   ├── permissions/        ← 权限引擎（decide 函数）
│   ├── context/            ← 上下文压缩（3 种策略）
│   ├── memory/             ← 记忆管理（4 种类型）
│   ├── session/            ← 会话持久化
│   ├── hooks/              ← Hook 中间件
│   ├── mcp/                ← MCP 客户端 + 服务器
│   └── system-prompt/      ← System Prompt 构建器
│
└── infra/                  ← 基础设施
    ├── logger.ts
    ├── metrics.ts
    ├── token-tracker.ts
    └── errors.ts
```

---

## 写作规范

- 每章开头一句话说明"这章讲什么、为什么重要"
- ASCII 图优先于文字描述，能画图就不用段落
- 代码片段只展示核心逻辑，不超过 20 行，附注释
- 技术术语首次出现时用括号给出英文原名
- 不在文档中注明代码由 AI 生成

---

## 篇幅预估

| 章节 | 预估字数 |
|------|---------|
| 一、痛点 | ~250 字 |
| 二、定位 | ~150 字 + 图 |
| 三、ReAct 循环 | ~400 字 + 图 |
| 四、六大子系统 | ~1800 字 + 图 + 代码 |
| 五、快速上手 | ~200 字 + 代码 |
| 六、扩展指南 | ~400 字 + 代码 |
| 七、全景图 | ~100 字 + 图 |
| **合计** | **~3300 字** |
