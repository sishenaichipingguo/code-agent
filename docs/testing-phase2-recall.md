# 测试 Phase 2：跨会话记忆回忆

## 功能说明

Phase 2 实现了语义注入功能，让 Claude 能够自动"记住"之前会话中的操作。

**核心能力：**
- ✅ 自动生成观察记录的 embedding（向量）
- ✅ 使用 ChromaDB 存储和检索向量
- ✅ 基于用户提问进行语义搜索
- ✅ 将相关记忆注入到系统提示词中

## 测试步骤

### 准备工作

1. **确保环境变量已设置：**
```bash
export ANTHROPIC_API_KEY="your-api-key"
export WORKER_MODEL="claude-sonnet-4-6"
```

2. **（可选）如果已有历史数据，迁移到 ChromaDB：**
```bash
bun run memory:migrate
```

这会将现有的 SQLite 观察记录导入到 ChromaDB，并生成 embedding。

### 测试场景 1：基础跨会话回忆

**会话 1 - 创建文件：**
```bash
bun run dev --with-memory "创建一个名为 hello.txt 的文件，内容是 'Hello World'"
```

等待完成后，退出。

**会话 2 - 询问历史：**
```bash
bun run dev --with-memory "我刚才创建了什么文件？"
```

**期望结果：**
Claude 应该能够回答："你刚才创建了 hello.txt 文件，内容是 'Hello World'"

**验证原理：**
- 会话 1 的操作被记录到 SQLite 和 ChromaDB
- 会话 2 启动时，用户提问 "我刚才创建了什么文件？" 会触发语义搜索
- ChromaDB 找到相关的观察记录并注入到系统提示词
- Claude 基于注入的记忆回答问题

### 测试场景 2：语义理解

**会话 1 - 修复 Bug：**
```bash
bun run dev --with-memory "修复 src/worker/server.ts 中的端口配置问题"
```

假设你修改了端口相关代码。

**会话 2 - 相关问题：**
```bash
bun run dev --with-memory "Worker 服务的端口是怎么配置的？"
```

**期望结果：**
Claude 应该能够回忆起你在会话 1 中修改过端口配置，并给出相关信息。

### 测试场景 3：项目隔离

**项目 A - 会话 1：**
```bash
cd /path/to/project-a
bun run dev --with-memory "创建 config.json"
```

**项目 B - 会话 2：**
```bash
cd /path/to/project-b
bun run dev --with-memory "我刚才创建了什么文件？"
```

**期望结果：**
Claude 应该回答"我没有看到你创建文件的记录"，因为默认只搜索当前项目的记忆。

## 验证工具

### 1. 查看记忆统计
```bash
bun run memory:view
```

输出示例：
```
📊 Memory Statistics

Sessions: 5
Observations: 23
Summaries: 2

Recent observations:
- [2026-04-18] User executed Write, created hello.txt
- [2026-04-18] User executed Read, examined server.ts
...
```

### 2. 测试跨会话数据
```bash
bun run memory:test
```

输出示例：
```
🧪 Memory System Cross-Session Test

📊 Found 2 session(s)

Session 1: code-agent
  Created: 2026-04-18 16:30:45
  Observations: 3

Session 2: code-agent
  Created: 2026-04-18 16:35:20
  Observations: 2

✅ Multiple sessions detected!
```

### 3. 直接测试 Recall API

启动 Worker 服务：
```bash
bun run dev:worker
```

在另一个终端测试 API：
```bash
curl -X POST http://localhost:37777/api/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query": "创建文件",
    "project": "code-agent",
    "limit": 5
  }'
```

期望返回：
```json
{
  "memories": [
    {
      "id": 1,
      "content": "用户执行了 Write，创建了 hello.txt",
      "type": "tool_call",
      "score": 0.85,
      ...
    }
  ],
  "formattedText": "## Relevant Past Context\n\nFrom session on 2026-04-18:\n- [tool_call] 用户执行了 Write，创建了 hello.txt\n",
  "count": 1
}
```

## 调试技巧

### 查看 Worker 日志
```bash
bun run dev --with-memory --verbose "你的问题"
```

`--verbose` 模式会显示详细的记忆系统日志：
- Embedding 生成时间
- ChromaDB 查询结果
- 注入的记忆内容

### 检查 ChromaDB 数据
```bash
# 查看 ChromaDB 存储目录
ls -la ~/.claude-mem/chroma/

# 查看统计信息
bun run memory:migrate  # 会显示当前 ChromaDB 中的记录数
```

### 清空数据重新测试
```bash
# 清空所有记忆数据
rm -rf ~/.claude-mem/

# 重新开始测试
bun run dev --with-memory "测试消息"
```

## 性能指标

**首次启动（需要下载模型）：**
- Embedding 模型下载：~50MB
- 首次加载时间：~10-30 秒

**后续启动：**
- Worker 启动时间：~2-3 秒
- Embedding 模型加载：~1-2 秒
- 单次 recall 查询：~50-200ms

**存储空间：**
- Embedding 模型缓存：~50MB（在 ~/.cache/transformers）
- ChromaDB 数据：每 1000 条观察记录约 ~10-20MB

## 常见问题

### Q: Claude 没有回忆起之前的操作？

**可能原因：**
1. 语义相似度太低（score < 0.3）
2. 项目名称不匹配（默认只搜索当前项目）
3. ChromaDB 中没有数据（需要先运行 `memory:migrate`）

**解决方法：**
```bash
# 检查是否有数据
bun run memory:view

# 如果没有数据，运行迁移
bun run memory:migrate

# 使用 verbose 模式查看详细日志
bun run dev --with-memory --verbose "你的问题"
```

### Q: Worker 启动失败？

**检查：**
```bash
# 确认 API Key 已设置
echo $ANTHROPIC_API_KEY

# 确认端口未被占用
lsof -i :37777

# 查看详细错误
bun run dev:worker
```

### Q: Embedding 模型下载太慢？

**解决方法：**
```bash
# 设置国内镜像（如果可用）
export HF_ENDPOINT=https://hf-mirror.com

# 或手动下载模型到缓存目录
# 模型会自动下载到 ~/.cache/transformers
```

## 下一步

Phase 2 已完成基础的语义注入功能。未来可以增强：

1. **更智能的记忆选择**：根据时间衰减、重要性评分等因素排序
2. **跨项目搜索**：添加配置选项支持跨项目记忆
3. **记忆压缩**：对长期记忆进行摘要压缩
4. **用户反馈**：让用户标记哪些记忆有用/无用
5. **记忆可视化**：Web UI 查看和管理记忆

## 总结

Phase 2 实现了完整的跨会话记忆回忆功能：

✅ **记录**：所有操作自动记录到 SQLite + ChromaDB  
✅ **向量化**：使用本地 embedding 模型生成向量  
✅ **检索**：基于语义相似度搜索相关记忆  
✅ **注入**：动态将记忆注入到系统提示词  
✅ **回忆**：Claude 能够"记住"之前的操作  

现在你可以在不同会话中与 Claude 对话，它会自动回忆起相关的历史操作！
