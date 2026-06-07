# Hooks 系统 —— 不改核心代码的扩展点

## 一、想加日志，但不想改核心代码

有一次我想知道 agent 在一次任务里执行了哪些 bash 命令，方便事后审计。

最直接的做法是在 `ToolRegistry.execute()` 里加几行日志代码。但这样每次升级都要重新合并我的修改，而且日志逻辑和核心逻辑混在一起，很难维护。

我想要的是：**在不修改核心代码的情况下，在工具执行后自动运行我的日志脚本。**

这就是 hooks 系统要解决的问题。

## 二、扩展系统行为的几种方式

这是软件工程里的经典问题：如何在不修改核心代码的情况下扩展系统行为？

常见的解法有几种：
- **继承（Inheritance）**：子类覆盖父类方法。但继承会创建紧耦合，而且 JavaScript/TypeScript 的单继承限制了灵活性。
- **装饰器（Decorator）**：包装原有对象，在调用前后注入逻辑。比继承灵活，但需要修改调用方。
- **事件系统（Event System）**：在关键节点发出事件，监听者注册处理函数。解耦彻底，但事件系统本身需要维护。
- **Hooks（钩子）**：在生命周期的关键节点预留"插槽"，外部代码注册到插槽里执行。

**Hooks** 是另一种思路：在 agent 生命周期的关键节点预留"插槽"，你往插槽里注册 shell 命令，agent 运行到那个节点时自动执行你的命令。核心代码不需要改，你的扩展逻辑独立存在。

这和 git hooks 的思路完全一样——`pre-commit`、`post-merge` 都是这种模式。

## 三、两种 Hook 类型

解决"观察 vs 修改"的矛盾，这个项目设计了两种 hook 类型：

**通知型（fire）**：hook 只是被通知"某件事发生了"，不能修改任何数据。适合日志记录、监控、通知等场景。

**变换型（transform）**：hook 接收数据，可以修改后返回新数据。适合内容过滤、输入验证、数据转换等场景。

这个区分很重要：通知型 hook 的失败不影响主流程（因为它不修改数据），而变换型 hook 的失败需要决策——是用原始数据继续，还是中止操作？

## 四、项目实现

### 两种 Hook 方法

`src/core/hooks/manager.ts` 的 `HookManager` 有两种方法：

**`fire(event, env)`** — 通知型，不影响流程：
```typescript
await this.hooks?.fire('session-start', { AGENT_CWD: process.cwd() })
```
- 把 `env` 里的键值对作为环境变量传给 hook 脚本
- 不读脚本的 stdout
- 脚本失败时根据 `onError` 配置决定是 warn、ignore 还是 abort

**`transform(event, payload, env)`** — 变换型，可以修改数据：
```typescript
const transformed = await this.hooks.transform('pre-tool', { name, input }, hookEnv)
effectiveInput = transformed.input
```
- 把 `payload` 序列化为 JSON，通过 stdin 传给脚本
- 读脚本的 stdout，解析为 JSON，作为新的 payload
- 如果脚本输出空或非 JSON，保持原 payload 不变

这个设计让 hook 脚本可以用任何语言写——只要能读 stdin、写 stdout 就行。

### 完整的 Hook 事件列表

```typescript
export type HookEvent =
  | 'session-start'      // 会话开始（fire）
  | 'session-end'        // 会话结束（fire）
  | 'user-prompt-submit' // 用户提交 prompt（fire）
  | 'pre-tool'           // 工具执行前（transform，可修改输入）
  | 'post-tool'          // 工具执行后（fire，通知）
  | 'post-tool-use'      // 工具执行完成（fire，带完整结果）
  | 'post-sampling'      // 模型输出后（transform，可修改最终文本）
  | 'pre-compress'       // 压缩前（transform，可修改要压缩的消息）
  | 'post-compress'      // 压缩后（fire，通知）
```

每个事件触发时，`HookManager` 会把相关信息作为环境变量传给脚本：

| 事件 | 额外环境变量 |
|------|------------|
| `pre-tool` / `post-tool` | `AGENT_TOOL_NAME`, `AGENT_TOOL_INPUT` |
| `post-tool` | + `AGENT_TOOL_RESULT` |
| `post-tool-use` | `TOOL_NAME`, `TOOL_INPUT`, `TOOL_RESULT`, `SESSION_ID` |
| `user-prompt-submit` | `USER_PROMPT`, `SESSION_ID` |
| `pre-compress` / `post-compress` | `AGENT_COMPRESS_STRATEGY` |
| `post-compress` | + `AGENT_COMPRESS_ORIGINAL_COUNT`, `AGENT_COMPRESS_RESULT_COUNT` |

所有事件都有 `AGENT_CWD`（当前工作目录）。

### 配置方式

在 `.agent.yml` 里配置：

```yaml
hooks:
  post-tool-use:
    - command: "echo \"[$(date)] $TOOL_NAME: $TOOL_INPUT\" >> .agent/tool-calls.log"
      onError: warn    # warn | abort | ignore
      timeout: 5000    # ms

  pre-tool:
    - command: "node scripts/validate-tool-input.js"
      onError: abort   # 验证失败时中止工具执行
      timeout: 3000

  post-sampling:
    - command: "python scripts/content-filter.py"
      onError: warn
      timeout: 10000
```

`onError` 的三个选项：
- `warn`：打印警告，继续执行
- `ignore`：静默忽略错误
- `abort`：抛出错误，中止当前操作（对 `transform` 类型的 hook 有意义）

### 实际用例：记录所有工具调用

最常见的用法是用 `post-tool-use` 记录工具调用日志：

```bash
# .agent.yml
hooks:
  post-tool-use:
    - command: |
        echo "{\"time\":\"$(date -Iseconds)\",\"tool\":\"$TOOL_NAME\",\"session\":\"$SESSION_ID\"}" \
          >> .agent/observations.jsonl
      onError: ignore
      timeout: 2000
```

每次工具执行完，这条命令会把工具名、时间、session ID 追加到 `.agent/observations.jsonl`。之后你可以用 `jq` 分析：哪些工具被调用最多、哪个 session 执行了最多操作等。

### 实际用例：用 post-sampling 过滤输出

`post-sampling` 是 `transform` 类型，可以修改模型的最终输出：

```python
# scripts/content-filter.py
import json, sys, re

payload = json.load(sys.stdin)
text = payload['text']

# 把输出里的 API key 替换掉
text = re.sub(r'sk-[a-zA-Z0-9]{48}', '[REDACTED]', text)

print(json.dumps({'text': text}))
```

```yaml
hooks:
  post-sampling:
    - command: "python scripts/content-filter.py"
      onError: warn
      timeout: 5000
```

脚本从 stdin 读 `{"text": "..."}` 格式的 JSON，处理后把新的 JSON 写到 stdout。`HookManager` 会用脚本的输出替换原来的文本。

### Hook 脚本的超时和错误处理

`HookManager` 给每个 hook 脚本设置了超时：

```typescript
const timer = setTimeout(() => {
  killed = true
  proc.kill('SIGTERM')
  setTimeout(() => { try { proc.kill('SIGKILL') } catch {} }, 3000)
}, entry.timeout)
```

超时后先发 `SIGTERM`，3 秒后如果还没退出再发 `SIGKILL`。这防止 hook 脚本卡住导致整个 agent 挂起。

这里再啰嗦一下：`transform` hook 如果脚本输出空或非 JSON，`HookManager` 会保持原始数据不变。这是一个静默失败——你可能以为 hook 生效了，但实际上没有。调试 `transform` hook 不生效时，第一件事是检查脚本的 stdout 输出是否是合法的 JSON。

## 五、边界条件和陷阱

**Hook 脚本的副作用**：hook 脚本可以做任何事——写文件、发网络请求、修改环境变量。这种灵活性也意味着 hook 脚本可能产生意外的副作用。需要谨慎设计 hook 脚本，避免它们影响 agent 的核心行为。

**transform hook 的数据格式**：`transform` hook 通过 stdin/stdout 传递 JSON。如果脚本输出的 JSON 格式不对（比如缺少必要字段），`HookManager` 会保持原始数据不变。这是一个静默失败——你可能以为 hook 生效了，但实际上没有。

**hook 执行顺序**：同一个事件可以注册多个 hook，它们按配置顺序依次执行。对于 `transform` hook，前一个 hook 的输出是后一个 hook 的输入。如果某个 hook 修改了数据，后续 hook 看到的是修改后的数据。

**hook 和子 agent 的交互**：子 agent 通过 `createRestricted()` 创建的受限注册表继承了原注册表的 hooks。这意味着你在主 agent 里配置的 hooks 也会在子 agent 里生效。如果你的 hook 假设只有主 agent 会触发它，可能会产生意外行为。

**安全性**：`pre-tool` hook 可以修改工具输入，这意味着恶意的 hook 脚本可以劫持工具调用。hook 脚本的来源需要可信。

## 六、与其他组件的关系

Hooks 系统和工具系统（第 2 篇）紧密集成：`pre-tool` 和 `post-tool` 事件在工具执行的前后触发，`ToolRegistry` 在执行工具时调用 `HookManager`。

Hooks 系统和上下文压缩（第 5 篇）有直接交互：`pre-compress` 和 `post-compress` 事件让你可以在压缩前后注入逻辑。

Hooks 系统和子 agent（第 8 篇）有继承关系：子 agent 的受限注册表继承了 hooks，所以 hooks 在子 agent 里同样生效。

Hooks 系统是整个 agent 系统的"观测层"——通过 hooks，你可以在不修改核心代码的情况下，观察和修改 agent 的任何行为。

## 七、动手练习

**练习 1：记录 bash 命令历史**

写一个 `pre-tool` hook，拦截所有 `bash` 工具调用并打印命令内容：

```bash
# scripts/log-bash.sh
#!/bin/bash
payload=$(cat)
tool_name=$(echo "$payload" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('name',''))")

if [ "$tool_name" = "bash" ]; then
  command=$(echo "$payload" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('input',{}).get('command',''))")
  echo "[BASH] $command" >> .agent/bash-history.log
fi

# 输出原始 payload（不修改）
echo "$payload"
```

```yaml
hooks:
  pre-tool:
    - command: "bash scripts/log-bash.sh"
      onError: warn
      timeout: 3000
```

运行 agent 执行一些需要 bash 的任务，然后查看 `.agent/bash-history.log`，你会看到所有执行过的 bash 命令的完整记录。

**练习 2：实现一个"危险命令拦截器"**

修改上面的脚本，让它拦截包含 `rm -rf` 的 bash 命令，并在 payload 里把命令替换成 `echo "BLOCKED: rm -rf is not allowed"`。观察 agent 如何处理被拦截的命令。

**练习 3：用 post-sampling 统计输出长度**

写一个 `post-sampling` hook，记录每次模型输出的字符数：

```python
# scripts/track-output.py
import json, sys

payload = json.load(sys.stdin)
text = payload.get('text', '')
with open('.agent/output-stats.log', 'a') as f:
    f.write(f"{len(text)}\n")

# 不修改 payload，原样输出
print(json.dumps(payload))
```

跑几个任务后，分析 `.agent/output-stats.log`，观察不同任务的输出长度分布。

**练习 4：预测 hook 失败的影响**

把一个 `pre-tool` hook 的 `onError` 设为 `abort`，然后故意让 hook 脚本失败（比如让它返回非零退出码）。观察 agent 的行为——工具调用是否被中止？agent 是否能继续执行其他任务？

---

> **English Summary:** The hooks system lets you inject behavior at agent lifecycle events without modifying core code. `fire()` sends env vars to a shell command (notify-only). `transform()` pipes JSON payload via stdin and reads modified JSON from stdout (can change data). Nine events cover the full lifecycle: session start/end, prompt submit, pre/post tool, post-sampling, and pre/post compress. Hook scripts can be written in any language — they just need to read stdin and write stdout.
>
> ⭐ [GitHub: code-agent](https://github.com/your-repo/code-agent)
