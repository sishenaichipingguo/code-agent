# Memory System Integration

记忆系统融合实现 - 基于流程图的完整架构

## 概述

这个实现将流程图中的记忆系统融合到当前 code-agent 项目中，采用**非侵入式**设计，通过独立的 Worker Service 处理观察生成、存储和语义搜索。

## 架构组件

### 1. Hook 系统扩展 ✅

**文件**: `src/core/hooks/types.ts`

新增两个 Hook 事件：
- `user-prompt-submit`: 用户提交 prompt 时触发
- `post-tool-use`: 工具执行完成后触发

### 2. AgentLoop 集成 ✅

**文件**: `src/core/agent/loop.ts`

在关键点触发 Hook：
- `run()` 方法开始时触发 `user-prompt-submit`
- `executeTools()` 成功后触发 `post-tool-use`

### 3. Worker Service ✅

**核心文件**:
- `src/worker/server.ts` - Express HTTP Server
- `src/worker/session/manager.ts` - 会话和队列管理
- `src/worker/agents/observer.ts` - SDKAgent 观察者
- `src/worker/db/sqlite.ts` - SQLite 数据层
- `src/worker/types/index.ts` - 类型定义和接口契约

**功能**:
- 接收 CLI 的 Hook 调用（HTTP API）
- 管理 ActiveSession 和消息队列
- 使用 SDKAgent 生成结构化 observations
- 存储到 SQLite 数据库
- 提供搜索 API

### 4. 数据模型

**SQLite 表结构**:
- `sessions` - 会话元数据
- `observations` - 观察记录（工具调用、文件操作等）
- `summaries` - 会话摘要
- `user_prompts` - 用户输入历史

## 使用方法

### 启动 Worker Service

```bash
# 设置 API Key
export ANTHROPIC_API_KEY="your-key-here"

# 启动 Worker
bun run dev:worker

# 或使用启动脚本
bun run scripts/start-worker.ts
```

### 配置 Hook

在 `.agent/config.json` 中添加：

```json
{
  "hooks": {
    "user-prompt-submit": [
      {
        "command": "curl -X POST http://localhost:37777/api/sessions/init -H 'Content-Type: application/json' -d '{\"contentSessionId\":\"$SESSION_ID\",\"project\":\"$(basename $PWD)\",\"prompt\":\"$USER_PROMPT\",\"platformSource\":\"claude-code\"}' 2>/dev/null || true",
        "onError": "ignore",
        "timeout": 5000
      }
    ],
    "post-tool-use": [
      {
        "command": "curl -X POST http://localhost:37777/api/sessions/observations -H 'Content-Type: application/json' -d '{\"contentSessionId\":\"$SESSION_ID\",\"toolName\":\"$TOOL_NAME\",\"toolInput\":$TOOL_INPUT,\"toolResponse\":\"$TOOL_RESULT\"}' 2>/dev/null || true",
        "onError": "ignore",
        "timeout": 3000
      }
    ]
  }
}
```

### 测试

```bash
# 健康检查
curl http://localhost:37777/health

# 搜索 observations
curl "http://localhost:37777/api/search?project=code-agent&limit=10"
```

## 数据流

```
用户输入 "帮我重构 auth.ts"
    ↓
AgentLoop.run() 触发 user-prompt-submit Hook
    ↓
curl POST /api/sessions/init
    ↓
Worker: SessionManager.initSession()
    ↓
Worker: 创建 Session → 加入 init 消息到队列
    ↓
Worker: SDKAgent.processInit() 生成初始 observation
    ↓
Worker: 存储到 SQLite observations 表
    ↓
AgentLoop 执行工具 Read(auth.ts)
    ↓
executeTools() 触发 post-tool-use Hook
    ↓
curl POST /api/sessions/observations
    ↓
Worker: 加入 observation 消息到队列
    ↓
Worker: SDKAgent.processContinuation() 分析工具调用
    ↓
Worker: 存储到 SQLite
```

## 已实现功能

- ✅ Hook 系统扩展（user-prompt-submit, post-tool-use）
- ✅ AgentLoop 集成触发点
- ✅ Worker Service HTTP Server
- ✅ SessionManager（会话管理和消息队列）
- ✅ SDKAgent（观察者 Agent）
- ✅ SQLite 数据层（sessions/observations/summaries/user_prompts）
- ✅ 搜索 API（基于 SQLite）
- ✅ 类型定义和接口契约

## 待实现功能

### Phase 2: 语义搜索
- [ ] ChromaDB 集成
- [ ] 向量化 observations
- [ ] 语义相似度搜索
- [ ] 语义注入到 SystemPromptBuilder

### Phase 3: 完整体验
- [ ] Viewer UI（React SPA 或 Ink TUI）
- [ ] SSE 实时推送
- [ ] 搜索和管理界面
- [ ] 性能优化和错误处理

## 设计优势

1. **非侵入式**: Worker 是独立进程，不影响现有 CLI
2. **渐进式**: 可以逐步添加功能（SQLite → ChromaDB → UI）
3. **可选性**: 用户可选择是否启动 Worker
4. **兼容性**: 利用现有 Hook 和 Memory 系统
5. **解耦**: CLI 和 Worker 通过 HTTP API 通信

## 文件清单

```
src/
├── core/
│   ├── hooks/
│   │   └── types.ts (已修改 - 新增事件类型)
│   └── agent/
│       └── loop.ts (已修改 - 触发新 Hook)
├── worker/ (新增)
│   ├── server.ts
│   ├── types/
│   │   └── index.ts
│   ├── db/
│   │   └── sqlite.ts
│   ├── agents/
│   │   └── observer.ts
│   └── session/
│       └── manager.ts
scripts/
└── start-worker.ts (新增)
docs/
└── worker-service-setup.md (新增)
```

## 下一步

1. 测试 Worker Service 基础功能
2. 验证 Hook 触发和数据流
3. 实现 ChromaDB 集成（Phase 2）
4. 添加语义注入管道
5. 开发 Viewer UI（Phase 3）
