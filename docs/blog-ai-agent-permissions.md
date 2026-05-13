# AI Agent 的权限不该写在框架里：每个工具自己说

> 这是 [《写完一个 AI 编程助手之后，我才确定 prompt 工程不是重点》](./blog-ai-agent-from-scratch-v2.md) 的第三篇。上一篇讲了[进程模型](./blog-ai-agent-process-model.md)，这一篇讲权限。

第一版权限系统我写错了。

我把它做成框架级别的：在 Agent 主循环里维护一份 `dangerous_tools` 列表，凡是命中的就弹确认。

```typescript
// 第一版（错的）
const DANGEROUS = ['rm', 'write', 'bash']
if (DANGEROUS.includes(toolName)) {
  await confirm()
}
```

跑起来就发现两个问题：

1. **`bash echo hello`** 也会问。它根本不危险。
2. **`write README.md`** 第一次问，第二次问，第十次还在问。用户疯了。

修了几次之后我意识到：这个抽象层从一开始就错了。

---

## 一、`rm -rf /` 和 `cat file` 不是同一类问题

把工具按"危险/不危险"二分，这本身就是对工具语义的过度简化。

举个例子，`bash` 工具：

- `bash git status` —— 只读，零风险
- `bash rm -rf node_modules` —— 破坏性，但可恢复
- `bash sudo dd if=/dev/zero of=/dev/sda` —— 破坏性，且不可逆

同一个工具，三种风险级别。框架去判断"bash 危不危险"，无论怎么判断都不对。

正确做法：**工具自己分类，框架只问工具一句话**。

```typescript
// src/core/tools/bash.ts
function classifyCommand(command: string): 'readonly' | 'dangerous' | 'normal' {
  const cmd = command.trimStart()
  if (READONLY_PREFIXES.some(p => cmd.startsWith(p))) return 'readonly'
  if (DANGEROUS_PREFIXES.some(p => cmd.startsWith(p))) return 'dangerous'
  return 'normal'
}
```

`READONLY_PREFIXES` 是 `['git status', 'git log', 'ls ', 'cat ', 'grep ', ...]`。`DANGEROUS_PREFIXES` 是 `['rm ', 'kill ', 'sudo ', 'curl', 'npm install', ...]`。

这个列表丑，但**它必须丑**——因为 shell 命令的危险性本来就由前缀决定。把这个 ugly 隐藏到工具内部，框架就干净了。

---

## 二、权限的返回值是三态，不是布尔

第二个错误是把权限做成 `boolean`：允许 / 不允许。

实际有三种结果：

```typescript
export type PermissionResult =
  | { type: 'allow' }
  | { type: 'deny';  reason: string }
  | { type: 'ask';   description: string }
```

- **allow**：直接放行，不打扰用户
- **deny**：拒绝，给出原因（让 AI 看到，它会换一种方式做）
- **ask**：需要用户确认，给出描述（让用户看到他在批准什么）

`ask` 不是 `deny` 的一种，是独立的状态。如果你把它折叠进 `deny`，AI 会以为权限永远不通过，开始绕路；如果折叠进 `allow`，危险操作会偷偷执行。

引擎实现极简（`src/core/permissions/engine.ts`）：

```typescript
export function decide(tool, input, ctx, toolName): PermissionResult {
  if (ctx.mode === 'bypass') return { type: 'allow' }

  const toolResult = tool.checkPermissions(input, ctx)
  if (toolResult.type === 'deny') return toolResult

  // 工具说要问？检查一下规则里有没有放行过
  const matched = ctx.allowRules.some(rule => matchesRule(rule, toolName, input))
  if (matched) return { type: 'allow' }

  if (toolResult.type === 'allow') return { type: 'allow' }

  if (ctx.mode === 'auto') {
    return { type: 'deny', reason: 'auto mode: requires confirmation' }
  }

  return toolResult  // type: 'ask'
}
```

22 行。这就是整个权限引擎。

剩下的复杂度全在工具自己的 `checkPermissions` 里——那才是它本来就该在的地方。

---

## 三、用户每按一次 y，就生成一条规则

确认弹窗最容易写错的地方是：每次都问。

```
> bash rm node_modules/.cache → 确认 y
> bash rm node_modules/.tmp   → 又问 y
> bash rm node_modules/foo    → 又问 y
```

用户按到第三次就开始想"能不能闭嘴"。

正确做法：用户每按一次 `y`，框架自动产生一条 `AllowRule`，下次相同模式直接放行。

但"相同模式"怎么定义？这又是工具自己最清楚的事——`bash` 看前缀，`write` 看路径 glob。所以工具暴露第二个方法 `preparePermissionMatcher`：

```typescript
// bash 工具
preparePermissionMatcher: (input) => {
  const cmd = input.command.trimStart()
  const prefix = cmd.split(/\s+/)[0]  // 取第一个 token
  return { kind: 'bash-prefix', prefix }
}

// write 工具（伪代码，类似实现）
preparePermissionMatcher: (input) => ({
  kind: 'path-glob',
  glob: dirname(input.path) + '/*'
})
```

框架持有这些 matcher，匹配逻辑在 `matchesRule()` 里：

```typescript
case 'bash-prefix': {
  const cmd = inp.command.trimStart()
  return cmd === prefix || cmd.startsWith(prefix + ' ')
}
case 'path-glob': {
  return matchGlob(rule.matcher.glob, inp.path)
}
```

效果：用户对 `bash rm node_modules/.cache` 按一次 `y`，之后所有 `rm` 开头的命令都默认放行（在当前 session 里）。要持久化，加一个 `persistent: true` 写到磁盘。

> **权限规则不是用户配置出来的，是用户用出来的。**

我从来没有真正配置过这个项目的权限——所有的 `AllowRule` 都是我跑命令的时候按 `y` 自动生成的。

---

## 四、模式只需要三种：bypass / default / auto

不要做花哨的权限模式。三种就够：

```typescript
export type PermissionMode = 'bypass' | 'default' | 'auto'
```

- **bypass（YOLO）**：什么都不问，直接执行。我自己做过滤功能、调试 prompt 时用。
- **default**：工具说要问的就问，匹配规则的放行。日常用。
- **auto**：工具说要问的一律拒绝（让 AI 自己想办法绕开）。我让 Agent 跑长任务、自己离开电脑时用。

四种以上的模式开始难解释。"sandbox 模式"、"review 模式"、"safe-write 模式"——这些都是产品经理的幻觉，每加一种用户就少一种把握。

---

## 所以呢

我做这个权限系统之前看了别的几个 Agent 框架，权限部分基本都是 200+ 行的"规则引擎"，配 YAML 配置，还有 DSL。

最后我的版本：

- 引擎：22 行（`engine.ts`）
- 匹配器：35 行（`matcher.ts`）
- 类型：30 行（`types.ts`）
- 每个工具自己 5–10 行实现两个方法

不到 100 行让 13 个工具都能正确判断危险性、用户每按一次 y 都自动生成规则、三种模式各司其职。

> **框架的工作不是替工具做决定，是给工具一个统一的接口让它自己说话。**

这跟 v2 第四节的"并发安全让工具自己声明"是同一个原则的两个例子——把语义留给工具，把策略留给框架。

代码：[code-agent/src/core/permissions](https://github.com/your-handle/code-agent/tree/main/src/core/permissions)。可以直接抄，类型签名换成你自己的工具基类就行。

---

下一篇讲第三个具体例子：**让工具自己声明并发安全**——同一个原则的第三种应用，把调度逻辑砍到一行的故事。
