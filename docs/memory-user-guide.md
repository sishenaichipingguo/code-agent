# Memory System - User Guide

## 快速开始

### 正常模式（无记忆）

```bash
bun run dev "帮我创建一个 hello.txt 文件"
```

### 记忆模式（自动启动 Worker）

```bash
bun run dev --with-memory "帮我重构 auth.ts"
```

就这么简单！加上 `--with-memory` 参数，系统会：
1. ✅ 自动启动 Worker Service（后台进程）
2. ✅ 自动注入 Hook 配置
3. ✅ 自动记录所有操作到数据库
4. ✅ 退出时自动清理 Worker 进程

## 详细说明

### 启动过程

```
$ bun run dev --with-memory "重构 auth.ts"

🧠 Starting memory system...
🧠 Memory system ready on :37777
Starting in YOLO mode
Using provider anthropic, model claude-sonnet-4-6

[正常对话...]

^C
🧠 Stopping memory system...
💾 Saving session...
📝 Closing logs...
```

### 数据存储位置

```
~/.claude-mem/
├── claude-mem.db          # SQLite 数据库
│   ├── sessions           # 会话记录
│   ├── observations       # 观察记录
│   ├── summaries          # 会话摘要
│   └── user_prompts       # 用户输入历史
```

### 查看记录

```bash
# 使用 SQLite 查看
sqlite3 ~/.claude-mem/claude-mem.db

# 查看所有会话
SELECT * FROM sessions;

# 查看最近的观察记录
SELECT * FROM observations ORDER BY created_at DESC LIMIT 10;
```

### 环境变量

```bash
# API Key（必需）
export ANTHROPIC_API_KEY="your-key-here"

# Worker 端口（可选，默认 37777）
export WORKER_PORT=37777

# 数据目录（可选，默认 ~/.claude-mem）
export WORKER_DATA_DIR="$HOME/.claude-mem"

# 排除的项目（可选）
export EXCLUDED_PROJECTS="private-project,secret-repo"
```

### Verbose 模式

查看 Worker 详细日志：

```bash
bun run dev --with-memory --verbose "你的任务"
```

输出示例：
```
🧠 Starting memory system...
[Worker] 🚀 Worker Service running on http://localhost:37777
[Worker] 📁 Data directory: /Users/debug/.claude-mem
🧠 Memory system ready on :37777
```

## 对比

| 功能 | 正常模式 | 记忆模式 |
|------|---------|---------|
| 启动命令 | `bun run dev` | `bun run dev --with-memory` |
| Worker Service | ❌ 不启动 | ✅ 自动启动 |
| Hook 配置 | ❌ 需手动配置 | ✅ 自动注入 |
| 操作记录 | ❌ 不记录 | ✅ 自动记录 |
| 进程管理 | 单进程 | 自动管理子进程 |
| 退出清理 | 简单 | 自动清理 Worker |

## 故障排查

### Worker 启动失败

```
⚠️  Failed to start memory system: Worker startup timeout (10s)
   Continuing without memory...
```

**原因**：
- ANTHROPIC_API_KEY 未设置或无效
- 端口 37777 被占用
- Bun 未安装或版本不兼容

**解决**：
```bash
# 检查 API Key
echo $ANTHROPIC_API_KEY

# 检查端口占用
lsof -i :37777

# 使用其他端口
export WORKER_PORT=38888
bun run dev --with-memory "你的任务"
```

### 没有记录数据

**检查**：
1. Worker 是否成功启动（看到 "Memory system ready" 消息）
2. 数据库文件是否存在：`ls -la ~/.claude-mem/`
3. 使用 `--verbose` 查看详细日志

### 手动清理

```bash
# 停止所有 Worker 进程
pkill -f "worker/server.ts"

# 清空数据库
rm -rf ~/.claude-mem/
```

## 高级用法

### 配置文件方式

在 `.agent/config.json` 中：

```json
{
  "memory": {
    "enabled": true,
    "port": 37777,
    "dataDir": "~/.claude-mem"
  }
}
```

然后直接运行：
```bash
bun run dev "你的任务"
```

（注：此功能待实现）

### API 访问

Worker 提供 HTTP API：

```bash
# 健康检查
curl http://localhost:37777/health

# 搜索观察记录
curl "http://localhost:37777/api/search?project=code-agent&limit=10"

# 查看会话状态
curl http://localhost:37777/api/sessions/status/your-session-id
```

## 下一步

- [ ] 实现 ChromaDB 语义搜索
- [ ] 添加 Viewer UI（实时观察流）
- [ ] 支持配置文件启用记忆功能
- [ ] 添加记忆搜索命令（`/memory search "关键词"`）
