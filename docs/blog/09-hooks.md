# Hooks 系统 —— 不改核心代码的扩展点

## 概念

你想在每次工具执行后记录日志，或者在 agent 输出前做内容过滤，或者在会话开始时初始化一些状态。

最直接的做法是改 `AgentLoop` 的源码。但这样每次升级都要重新合并你的修改，而且你的定制逻辑和核心逻辑混在一起，很难维护。

**Hooks** 是另一种思路：在 agent 生命周期的关键节点预留"插槽"，你往插槽里注册 shell 命令，agent 运行到那个节点时自动执行你的命令。核心代码不需要改，你的扩展逻辑独立存在。

这和 git hooks 的思路完全一样——`pre-commit`、`post-merge` 都是这种模式。

## 项目实现

### 两种 Hook 类型

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

## 动手练习

写一个 `pre-tool` hook，拦截所有 `bash` 工具调用并打印命令内容：

```bash
# scripts/log-bash.sh
#!/bin/bash
# 从 stdin 读取 payload（JSON 格式）
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
# .agent.yml
hooks:
  pre-tool:
    - command: "bash scripts/log-bash.sh"
      onError: warn
      timeout: 3000
```

运行 agent 执行一些需要 bash 的任务，然后查看 `.agent/bash-history.log`，你会看到所有执行过的 bash 命令的完整记录。

---

> **English Summary:** The hooks system lets you inject behavior at agent lifecycle events without modifying core code. `fire()` sends env vars to a shell command (notify-only). `transform()` pipes JSON payload via stdin and reads modified JSON from stdout (can change data). Nine events cover the full lifecycle: session start/end, prompt submit, pre/post tool, post-sampling, and pre/post compress. Hook scripts can be written in any language — they just need to read stdin and write stdout.
>
> ⭐ [GitHub: code-agent](https://github.com/your-repo/code-agent)
