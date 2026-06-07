# Worker Service 启动脚本示例

这个脚本展示如何启动 Worker Service 并配置 Hook 来连接 CLI 和 Worker。

## 1. 启动 Worker Service

```bash
# 设置环境变量
export ANTHROPIC_API_KEY="your-api-key-here"
export WORKER_PORT=37777
export WORKER_DATA_DIR="$HOME/.claude-mem"
export EXCLUDED_PROJECTS="private-project,secret-repo"

# 启动 Worker
bun run dev:worker
```

## 2. 配置 Hook（在 .agent/config.json 中）

```json
{
  "hooks": {
    "user-prompt-submit": [
      {
        "command": "curl -X POST http://localhost:37777/api/sessions/init -H 'Content-Type: application/json' -d '{\"contentSessionId\":\"$SESSION_ID\",\"project\":\"$(basename $PWD)\",\"prompt\":\"$USER_PROMPT\",\"platformSource\":\"claude-code\",\"cwd\":\"$PWD\"}' 2>/dev/null || true",
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
    ],
    "session-end": [
      {
        "command": "curl -X POST http://localhost:37777/api/sessions/complete -H 'Content-Type: application/json' -d '{\"contentSessionId\":\"$SESSION_ID\"}' 2>/dev/null || true",
        "onError": "ignore",
        "timeout": 2000
      }
    ]
  }
}
```

## 3. 测试 Worker

```bash
# 健康检查
curl http://localhost:37777/health

# 搜索 observations
curl "http://localhost:37777/api/search?project=code-agent&limit=10"

# 查看会话状态
curl http://localhost:37777/api/sessions/status/your-session-id
```

## 架构说明

```
┌─────────────────────────────────────────────────────────────┐
│  CLI Process (agent)                                        │
│                                                              │
│  用户输入 → AgentLoop.run()                                  │
│       ↓                                                      │
│  触发 user-prompt-submit Hook                                │
│       ↓                                                      │
│  curl POST /api/sessions/init                               │
│       ↓                                                      │
│  执行工具 → executeTools()                                   │
│       ↓                                                      │
│  触发 post-tool-use Hook                                     │
│       ↓                                                      │
│  curl POST /api/sessions/observations                       │
│       ↓                                                      │
│  会话结束 → 触发 session-end Hook                            │
│       ↓                                                      │
│  curl POST /api/sessions/complete                           │
└─────────────────────────────────────────────────────────────┘
                    │ HTTP
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  Worker Service (:37777)                                    │
│                                                              │
│  SessionManager                                             │
│    ├─ ActiveSession Map (内存中的会话状态)                  │
│    ├─ Message Queue (异步处理队列)                          │
│    └─ SDKAgent (生成 observations)                          │
│                                                              │
│  SQLiteManager                                              │
│    ├─ sessions 表                                            │
│    ├─ observations 表                                        │
│    ├─ summaries 表                                           │
│    └─ user_prompts 表                                        │
└─────────────────────────────────────────────────────────────┘
```

## 数据流

1. **Init**: 用户提交 prompt → Hook 调用 /api/sessions/init → 创建 session → SDKAgent 生成初始 observation
2. **Observation**: 工具执行完成 → Hook 调用 /api/sessions/observations → 加入队列 → SDKAgent 分析工具调用
3. **Complete**: 会话结束 → Hook 调用 /api/sessions/complete → 清理内存中的 ActiveSession

## 下一步

- [ ] 实现 ChromaDB 集成（语义搜索）
- [ ] 实现语义注入到 SystemPromptBuilder
- [ ] 添加 Viewer UI（React 或 Ink）
- [ ] 添加 SSE 实时推送
- [ ] 性能优化和错误处理
