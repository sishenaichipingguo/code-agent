# 如何知道记忆功能是否在工作？

## 方法 1：启动时的提示信息

当你使用 `--with-memory` 启动时，会看到明确的提示：

```bash
$ bun run dev --with-memory "你的任务"

🧠 Starting memory system...
✅ Memory system ready (recording to ~/.claude-mem/)
Starting in YOLO mode
💡 Tip: Use --verbose to see detailed memory recording logs

[正常对话...]
```

**关键标志**：
- ✅ `Memory system ready` - Worker 启动成功
- 📁 `recording to ~/.claude-mem/` - 数据存储位置

## 方法 2：Verbose 模式（实时反馈）

使用 `--verbose` 查看每次记录的详细日志：

```bash
$ bun run dev --with-memory --verbose "重构 auth.ts"

🧠 Starting memory system...
[Worker] 🚀 Worker Service running on http://localhost:37777
[Worker] 📁 Data directory: /Users/debug/.claude-mem
✅ Memory system ready (recording to ~/.claude-mem/)

📝 Recorded prompt to memory        # ← 用户输入被记录
🔍 Recorded tool: Read              # ← 工具调用被记录
🔍 Recorded tool: Edit              # ← 每个工具都会显示
🔍 Recorded tool: Write
```

**每次操作都会显示**：
- 📝 `Recorded prompt to memory` - 用户输入被记录
- 🔍 `Recorded tool: XXX` - 工具调用被记录

## 方法 3：查看数据库统计

使用内置脚本查看记录的数据：

```bash
$ bun run memory:view

📊 Memory System Statistics

Sessions: 3
Observations: 15
Summaries: 2

📝 Recent Sessions:

  • code-agent (5 prompts) - 2026-04-18 16:30:45
  • my-project (2 prompts) - 2026-04-18 15:20:12
  • test-app (1 prompts) - 2026-04-18 14:10:33

🔍 Recent Observations:

  • [tool_call] 用户执行了 Edit，修改了 auth.ts 文件... - 2026-04-18 16:31:20
  • [tool_call] 用户执行了 Read，读取了 auth.ts 的内容... - 2026-04-18 16:31:15
  • [init] 用户正在尝试重构认证模块... - 2026-04-18 16:30:50
```

## 方法 4：直接查看数据库

```bash
# 查看数据库文件
ls -lh ~/.claude-mem/

# 使用 SQLite 查看
sqlite3 ~/.claude-mem/claude-mem.db

# 查看所有会话
sqlite> SELECT * FROM sessions;

# 查看最近的观察记录
sqlite> SELECT * FROM observations ORDER BY created_at DESC LIMIT 10;

# 退出
sqlite> .quit
```

## 方法 5：检查 Worker 进程

```bash
# 查看 Worker 是否在运行
ps aux | grep "worker/server.ts"

# 测试 Worker API
curl http://localhost:37777/health

# 应该返回：
# {"status":"ok","timestamp":1713456789}
```

## 完整示例

```bash
# 1. 启动（带 verbose）
$ bun run dev --with-memory --verbose "创建 hello.txt"

🧠 Starting memory system...
[Worker] 🚀 Worker Service running on http://localhost:37777
✅ Memory system ready (recording to ~/.claude-mem/)

📝 Recorded prompt to memory        # ← 看到这个说明记录成功

# 2. 对话过程中
🔍 Recorded tool: Write             # ← 每个工具调用都会显示

# 3. 退出后查看
$ bun run memory:view

📊 Memory System Statistics
Sessions: 1
Observations: 3                     # ← 有数据说明工作正常
```

## 故障排查

### 没有看到 "Memory system ready"

**原因**：Worker 启动失败

**检查**：
```bash
# 1. API Key 是否设置
echo $ANTHROPIC_API_KEY

# 2. 端口是否被占用
lsof -i :37777

# 3. 查看错误信息
bun run dev --with-memory --verbose "test"
```

### 看到 "Memory system ready" 但没有 "Recorded" 消息

**原因**：Hook 没有触发或失败

**检查**：
```bash
# 使用 verbose 模式查看详细日志
bun run dev --with-memory --verbose "test"

# 手动测试 Worker API
curl -X POST http://localhost:37777/api/sessions/init \
  -H 'Content-Type: application/json' \
  -d '{"contentSessionId":"test","project":"test","prompt":"hello","platformSource":"claude-code"}'
```

### 数据库是空的

**原因**：可能是 SDKAgent 处理失败

**检查**：
```bash
# 查看 Worker 日志（verbose 模式）
bun run dev --with-memory --verbose "test"

# 查看数据库表结构
sqlite3 ~/.claude-mem/claude-mem.db ".schema"
```

## 快速验证清单

✅ 启动时看到 "Memory system ready"
✅ Verbose 模式下看到 "Recorded prompt to memory"
✅ Verbose 模式下看到 "Recorded tool: XXX"
✅ `bun run memory:view` 显示有数据
✅ `ls ~/.claude-mem/` 看到 claude-mem.db 文件

如果以上都满足，说明记忆功能正常工作！🎉
