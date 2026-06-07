# Testing Memory System Cross-Session Recall

## 测试场景：验证记忆系统联动

### 目标
验证在不同终端/会话中的操作能被记录并在后续会话中回忆起来。

## 测试步骤

### Step 1: 第一个会话（创建内容）

```bash
# 终端 1
export ANTHROPIC_API_KEY="your-key"
export WORKER_MODEL="claude-sonnet-4-6"  # 如果需要

bun run dev --with-memory --verbose "创建一个名为 session1.txt 的文件，内容是 'Hello from session 1'"
```

**期望看到**：
```
🧠 Starting memory system...
✅ Memory system ready (recording to ~/.claude-mem/)
📝 Recorded prompt to memory
🔍 Recorded tool: write
```

**验证**：
```bash
# 检查文件是否创建
ls session1.txt

# 检查记忆是否记录
bun run memory:view
```

应该看到：
```
📊 Memory System Statistics
Sessions: 1
Observations: 2-3

📝 Recent Sessions:
  • code-agent (1 prompts) - 2026-04-18 ...

🔍 Recent Observations:
  • [tool_call] User executed write, created session1.txt...
  • [init] User is trying to create a file...
```

### Step 2: 第二个会话（回忆之前的操作）

```bash
# 终端 2（或者退出终端 1 后重新启动）
bun run dev --with-memory --verbose "我刚才创建了什么文件？"
```

**期望看到**：
```
🧠 Starting memory system...
✅ Memory system ready (recording to ~/.claude-mem/)
📝 Recorded prompt to memory
🔍 Recorded tool: read  # 可能会读取 session1.txt
```

**关键点**：
- ❌ **当前实现**：Claude **不会自动**看到之前的记忆
- ✅ **原因**：记忆已存储在数据库，但还没有实现"语义注入"功能

### Step 3: 验证数据已记录

```bash
# 运行跨会话测试脚本
bun run scripts/test-cross-session.ts
```

**期望输出**：
```
🧪 Memory System Cross-Session Test

📊 Found 2 session(s)

Session 1: code-agent
  Created: 2026-04-18 16:30:45
  Prompts: 1
  Observations: 2
    1. [init] User is trying to create a file...
    2. [tool_call] User executed write, created session1.txt...

Session 2: code-agent
  Created: 2026-04-18 16:35:20
  Prompts: 1
  Observations: 2
    1. [init] User is asking about previously created files...
    2. [tool_call] User executed read...

🔗 Cross-Session Analysis:

  Total prompts across all sessions: 2
  Total observations recorded: 4

✅ Multiple sessions detected!
   Session 1 and Session 2 are stored in the same database.
   This means they CAN share memory context.
```

## 当前状态 vs 完整功能

### ✅ 已实现（v2.2）

1. **记录功能**：
   - ✅ 每个会话的操作都被记录到 SQLite
   - ✅ 跨会话数据存储在同一个数据库
   - ✅ 可以通过 `bun run memory:view` 查看历史

2. **数据持久化**：
   - ✅ 数据存储在 `~/.claude-mem/claude-mem.db`
   - ✅ 不同会话共享同一个数据库
   - ✅ 数据不会丢失

### ❌ 未实现（需要 Phase 2）

1. **语义注入**：
   - ❌ 历史记忆不会自动注入到新会话的 SystemPrompt
   - ❌ Claude 不知道之前会话发生了什么
   - ❌ 需要手动查询数据库才能看到历史

2. **语义搜索**：
   - ❌ 没有 ChromaDB 集成
   - ❌ 不能根据语义相似度搜索历史
   - ❌ 只能通过 SQL 查询

## 如何验证"联动"

### 方法 1：数据库验证（当前可用）

```bash
# 会话 1
bun run dev --with-memory "create session1.txt"

# 会话 2
bun run dev --with-memory "create session2.txt"

# 验证两个会话都记录了
bun run scripts/test-cross-session.ts
```

**结果**：应该看到 2 个 session，每个都有 observations

### 方法 2：手动查询数据库

```bash
sqlite3 ~/.claude-mem/claude-mem.db

# 查看所有会话
SELECT * FROM sessions;

# 查看所有观察记录
SELECT * FROM observations ORDER BY created_at DESC;

# 查看特定项目的历史
SELECT o.content, o.created_at 
FROM observations o 
JOIN sessions s ON o.session_id = s.id 
WHERE s.project = 'code-agent' 
ORDER BY o.created_at DESC;
```

### 方法 3：使用 memory:view 命令

```bash
# 会话 1
bun run dev --with-memory "create test1.txt"

# 会话 2
bun run dev --with-memory "create test2.txt"

# 查看记录
bun run memory:view
```

应该看到两个会话的记录。

## 完整测试脚本

```bash
#!/bin/bash
# test-memory-linkage.sh

echo "🧪 Testing Memory System Linkage"
echo ""

# Setup
export ANTHROPIC_API_KEY="your-key"
export WORKER_MODEL="claude-sonnet-4-6"

# Clean old data
rm -rf ~/.claude-mem/
echo "✓ Cleaned old data"

# Session 1
echo ""
echo "📝 Session 1: Creating file..."
bun run dev --with-memory "create a file called memory-test.txt with content 'Session 1 was here'"
echo "✓ Session 1 completed"

# Wait a bit
sleep 2

# Session 2
echo ""
echo "📝 Session 2: Creating another file..."
bun run dev --with-memory "create a file called memory-test2.txt with content 'Session 2 was here'"
echo "✓ Session 2 completed"

# Verify
echo ""
echo "🔍 Verifying cross-session data..."
bun run scripts/test-cross-session.ts

echo ""
echo "📊 Checking database directly..."
sqlite3 ~/.claude-mem/claude-mem.db "SELECT COUNT(*) as sessions FROM sessions;"
sqlite3 ~/.claude-mem/claude-mem.db "SELECT COUNT(*) as observations FROM observations;"
```

## 期望 vs 现实

### 期望（完整功能）

```
用户: "我刚才创建了什么文件？"
Claude: "根据记忆，你在上一个会话中创建了 session1.txt 文件。"
```

### 现实（当前 v2.2）

```
用户: "我刚才创建了什么文件？"
Claude: "我没有看到你创建文件的记录。" 
       （因为历史记忆没有注入到 SystemPrompt）

但是：
- ✅ 数据已经记录在数据库中
- ✅ 可以通过 bun run memory:view 查看
- ✅ 可以通过 SQL 查询历史
```

## 下一步：实现语义注入（Phase 2）

要实现真正的"联动"，需要：

1. **ChromaDB 集成**：向量化 observations
2. **语义搜索**：根据当前 prompt 搜索相关历史
3. **SystemPrompt 注入**：将相关历史注入到 SystemPrompt

这样 Claude 就能"记住"之前的会话了。

## 总结

**当前状态**：
- ✅ 记录功能完整（所有操作都被记录）
- ✅ 数据持久化（跨会话共享数据库）
- ❌ 自动回忆（需要 Phase 2 实现）

**验证方法**：
- 使用 `bun run scripts/test-cross-session.ts`
- 使用 `bun run memory:view`
- 直接查询 SQLite 数据库

**要实现真正的"联动"**：需要实现 Phase 2 的语义注入功能。
