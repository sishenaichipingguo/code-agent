# Memory System Integration - v2.0

## 🎉 改进总结

### 用户体验大幅提升

**之前（v1.0）**：
```bash
# 终端 1
bun run dev:worker

# 终端 2
bun run dev

# 还需要手动配置 .agent/config.json 中的 Hook
```

**现在（v2.0）**：
```bash
# 一条命令搞定！
bun run dev --with-memory "你的任务"
```

## ✨ 新特性

### 1. 一键启动
- ✅ `--with-memory` 参数自动启动 Worker Service
- ✅ 自动注入 Hook 配置，无需手动配置
- ✅ 自动管理进程生命周期
- ✅ 退出时自动清理 Worker

### 2. 智能错误处理
- ✅ API Key 缺失时友好提示
- ✅ Worker 启动失败时降级到正常模式
- ✅ 10 秒超时保护
- ✅ 健康检查确保 Worker 就绪

### 3. 详细日志（可选）
```bash
bun run dev --with-memory --verbose "你的任务"
```

输出：
```
🧠 Starting memory system...
[Worker] 🚀 Worker Service running on http://localhost:37777
[Worker] 📁 Data directory: /Users/debug/.claude-mem
🧠 Memory system ready on :37777
```

## 📁 新增文件

```
src/
├── worker/
│   ├── manager.ts         # WorkerManager - 进程管理
│   └── hooks.ts           # 自动生成 Hook 配置
├── cli/
│   └── parser.ts          # 新增 --with-memory 参数
└── core/
    └── agent/loop.ts      # 集成 Hook 触发点

docs/
└── memory-user-guide.md   # 用户指南

scripts/
└── test-memory.ts         # 测试脚本
```

## 🚀 使用方法

### 基础用法

```bash
# 正常模式（无记忆）
bun run dev "创建 hello.txt"

# 记忆模式（自动启动 Worker）
bun run dev --with-memory "重构 auth.ts"

# 记忆模式 + 详细日志
bun run dev --with-memory --verbose "分析代码"
```

### 环境变量

```bash
# 必需
export ANTHROPIC_API_KEY="your-key-here"

# 可选
export WORKER_PORT=37777
export WORKER_DATA_DIR="$HOME/.claude-mem"
export EXCLUDED_PROJECTS="private-project,secret-repo"
```

### 查看数据

```bash
# 数据存储在
~/.claude-mem/claude-mem.db

# 使用 SQLite 查看
sqlite3 ~/.claude-mem/claude-mem.db "SELECT * FROM observations LIMIT 10;"
```

## 🏗️ 架构改进

### v1.0 架构（手动管理）

```
用户 → 手动启动 Worker (终端1)
     → 手动配置 Hook (config.json)
     → 手动启动 CLI (终端2)
     → 手动停止 Worker
```

### v2.0 架构（自动管理）

```
用户 → bun run dev --with-memory
     ↓
   CLI 启动
     ↓
   检测 --with-memory 参数
     ↓
   WorkerManager.start()
     ├─ 启动 Worker 子进程
     ├─ 等待健康检查
     └─ 自动注入 Hook 配置
     ↓
   正常运行（Hook 自动触发）
     ↓
   用户按 Ctrl+C
     ↓
   GracefulShutdown
     ├─ 停止 Worker
     ├─ 保存会话
     └─ 清理资源
```

## 🔧 技术细节

### WorkerManager 职责

1. **进程管理**
   - 启动 Worker 子进程
   - 监控进程状态
   - 捕获输出日志
   - 优雅停止（SIGTERM → SIGKILL）

2. **健康检查**
   - 等待 Worker 启动完成
   - 轮询 `/health` 端点
   - 超时保护（10 秒）

3. **错误处理**
   - 启动失败降级到正常模式
   - 友好的错误提示
   - 不阻塞主流程

### Hook 自动注入

```typescript
// 自动生成的 Hook 配置
{
  'user-prompt-submit': [
    {
      command: 'curl -X POST http://localhost:37777/api/sessions/init ...',
      onError: 'ignore',
      timeout: 5000
    }
  ],
  'post-tool-use': [...],
  'session-end': [...]
}
```

### 进程生命周期

```
CLI 进程 (父)
  └─ Worker 进程 (子, detached: false)
     ├─ 父进程退出 → 子进程自动退出
     ├─ SIGTERM → 优雅停止
     └─ 3秒后 SIGKILL → 强制停止
```

## 📊 对比表

| 特性 | v1.0 | v2.0 |
|------|------|------|
| 启动方式 | 两个终端 | 一条命令 |
| Hook 配置 | 手动编写 JSON | 自动注入 |
| 进程管理 | 手动启停 | 自动管理 |
| 错误处理 | 无 | 智能降级 |
| 日志输出 | 混乱 | 格式化 |
| 用户体验 | ⭐⭐ | ⭐⭐⭐⭐⭐ |

## 🎯 下一步

### Phase 2: 语义搜索
- [ ] ChromaDB 集成
- [ ] 向量化 observations
- [ ] 语义相似度搜索
- [ ] 语义注入到 SystemPromptBuilder

### Phase 3: 完整体验
- [ ] Viewer UI（实时观察流）
- [ ] `/memory search` 命令
- [ ] 配置文件支持（`memory.enabled: true`）
- [ ] 性能优化和错误处理

## 📚 文档

- [用户指南](./docs/memory-user-guide.md) - 详细使用说明
- [架构说明](./README-MEMORY-SYSTEM.md) - 技术架构
- [Worker 设置](./docs/worker-service-setup.md) - 手动设置（高级）

## 🧪 测试

```bash
# 运行测试脚本
bun run scripts/test-memory.ts

# 手动测试
bun run dev --with-memory "echo test"
```

## 🙏 致谢

感谢用户反馈，v2.0 的改进完全基于真实使用体验！
