# End-to-End Tests

完整的端到端测试套件，测试 agent 的真实运行流程。

## 测试结构

```
tests/e2e/
├── setup.ts                   # 测试工具和辅助函数
├── basic-operations.test.ts   # 基础操作测试
├── workflow.test.ts           # 完整工作流测试
└── performance.test.ts        # 性能和压力测试
```

## 运行测试

```bash
# 运行所有 E2E 测试
bun test tests/e2e/

# 运行特定测试文件
bun test tests/e2e/basic-operations.test.ts

# 运行特定测试用例
bun test tests/e2e/basic-operations.test.ts -t "should show help"

# 带详细输出
bun test tests/e2e/ --verbose
```

## 测试覆盖

### 基础操作 (basic-operations.test.ts)
- ✅ 帮助信息显示
- ✅ 版本信息显示
- ✅ 参数验证
- ✅ 文件读取
- ✅ 文件创建
- ✅ 文件编辑
- ✅ 文件搜索
- ✅ 内容搜索

### 工作流 (workflow.test.ts)
- ✅ 多步骤任务执行
- ✅ 代码重构流程
- ✅ 错误恢复
- ✅ 配置加载
- ✅ 模式切换

### 性能 (performance.test.ts)
- ✅ 启动速度
- ✅ 大文件处理
- ✅ 多文件处理
- ✅ 并发操作
- ✅ 超时处理

## 测试环境

每个测试都在独立的临时目录中运行，测试结束后自动清理：

```typescript
let ctx: TestContext

beforeEach(async () => {
  ctx = await createTestContext()  // 创建临时目录
})

afterEach(async () => {
  await ctx.cleanup()  // 清理临时目录
})
```

## 编写新测试

### 1. 基础测试模板

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestContext, runAgent, type TestContext } from './setup'

describe('E2E: My Feature', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await createTestContext()
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  test('should do something', async () => {
    const result = await runAgent(
      ['Your command here'],
      { cwd: ctx.workDir, timeout: 150000 }
    )
    
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('expected output')
  })
})
```

### 2. 文件操作测试

```typescript
import { writeTestFile, readTestFile, fileExists } from './setup'

test('should work with files', async () => {
  // 创建测试文件
  await writeTestFile(ctx.workDir, 'input.txt', 'test content')
  
  // 运行 agent
  await runAgent(['Process input.txt'], { cwd: ctx.workDir })
  
  // 验证结果
  const exists = await fileExists(ctx.workDir, 'output.txt')
  expect(exists).toBe(true)
  
  const content = await readTestFile(ctx.workDir, 'output.txt')
  expect(content).toContain('processed')
})
```

### 3. 工作流测试

```typescript
test('should complete multi-step workflow', async () => {
  // Step 1
  const step1 = await runAgent(['Step 1 command'], { cwd: ctx.workDir })
  expect(step1.exitCode).toBe(0)
  
  // Step 2
  const step2 = await runAgent(['Step 2 command'], { cwd: ctx.workDir })
  expect(step2.exitCode).toBe(0)
  
  // Verify final state
  const result = await readTestFile(ctx.workDir, 'result.txt')
  expect(result).toContain('expected final state')
})
```

## 调试测试

### 查看测试输出

```typescript
test('debug test', async () => {
  const result = await runAgent(['command'], { cwd: ctx.workDir })
  
  console.log('STDOUT:', result.stdout)
  console.log('STDERR:', result.stderr)
  console.log('Exit Code:', result.exitCode)
  console.log('Duration:', result.duration, 'ms')
})
```

### 保留测试目录

```typescript
afterEach(async () => {
  console.log('Test directory:', ctx.workDir)
  // 注释掉 cleanup 以保留测试文件
  // await ctx.cleanup()
})
```

## 最佳实践

1. **隔离性**: 每个测试使用独立的临时目录
2. **清理**: 测试结束后自动清理资源
3. **超时**: 为所有操作设置合理的超时时间
4. **断言**: 验证退出码、输出内容和文件状态
5. **错误处理**: 测试正常流程和错误场景
6. **性能**: 监控测试执行时间，避免过慢的测试

## CI/CD 集成

在 CI 环境中运行：

```yaml
# .github/workflows/test.yml
- name: Run E2E Tests
  run: bun test tests/e2e/
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## 故障排查

### 测试超时
- 增加 timeout 参数
- 检查 agent 是否卡住
- 查看 stderr 输出

### 文件未创建
- 检查工作目录是否正确
- 验证 agent 权限
- 查看 agent 输出日志

### 断言失败
- 打印实际输出内容
- 检查预期值是否正确
- 验证测试环境状态
