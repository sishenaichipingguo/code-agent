# Evals — 衡量 agent "好不好用"

单元测试验证**零件对不对**；eval 验证**整个 agent 能不能完成任务**。
它把 agent 当黑盒：给一个准备好的工作区 + 一句指令，看它有没有达成
**可机器检验**的目标，并记录成本/轮数。

## 怎么跑

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # 必须是真 key（会真实调用模型、产生费用）
bun run eval                          # 跑全套
bun run eval fix-bug                  # 只跑某个任务
```

输出示例：

```
=== Eval Scorecard ===
  [PASS] create-file        12s · 2 turns · 1 tools · $0.0031
  [FAIL] refactor-rename    34s · 6 turns · 5 tools · $0.0142
         ↳ "oldName" still present

  4/5 passed (80%) · total $0.0480 · 71s wall
```

## 结果存在哪

- **每次跑的成绩**：`evals/results/<时间戳>.json`（`Scorecard` 结构）
  → 用来**对比回归**：改完 prompt/模型后再跑，pass 数掉了就是改坏了。
- **成本 / 性能 / Token**：从 agent 自己打到 stderr 的 `💰 Token Usage`、
  `⚡ Performance` 里抓出来，存进上面的 JSON。

## 项目级观测（非 eval，平时真实使用时）

| 数据 | 在哪看 |
|---|---|
| 结构化日志（JSONL） | `.agent/logs/agent.log` （`tail -f` 它） |
| **每次运行的 Token / 成本 / 性能** | `.agent/logs/usage.jsonl`（每行一条记录，退出时落盘） |
| 实时 Token / 成本 | 每次跑完打到终端 stderr；会话内输入 `/cost` |

`usage.jsonl` 每行结构：

```json
{"timestamp":"2026-06-25T07:06:53.863Z","mode":"yolo","model":"claude-sonnet-4-6",
 "usage":{"inputTokens":1200,"outputTokens":340,"totalTokens":1540,"cost":0.0087},
 "performance":[{"name":"api-call","avgMs":6,"minMs":6,"maxMs":6,"count":1}]}
```

> 出于隐私考虑，`usage.jsonl` **不记录** prompt 内容或文件内容，只存聚合用量。
> 快速看每次花了多少钱：`cat .agent/logs/usage.jsonl | jq '{timestamp,model,cost:.usage.cost}'`

## 加新任务

编辑 `evals/tasks.ts`，往 `TASKS` 数组加一项：

```ts
{
  id: 'my-task',
  description: '一句话说明它测什么能力',
  prompt: '给 agent 的指令',
  setup: async workDir => { /* 写入 fixture 文件（可选） */ },
  check: async ({ workDir, stdout }) => {
    // 返回 { passed, detail }，判据必须可机器检验
  },
}
```

**原则**：判据要么是"文件内容对不对"，要么是"最终输出里有没有正确答案"，
不要依赖 agent 的措辞。任务集越稳定，pass-rate 越能跨时间对比。

## 文件一览

- `runner.ts` — 编排：建临时工作区 → 跑 agent → 检查 → 汇总 + 落盘
- `run-agent.ts` — 以子进程方式跑 CLI，从 stderr 解析成本/轮数
- `tasks.ts` — 任务套件（fixture + prompt + 判据）
- `types.ts` — 类型定义
- `MANUAL-CHECKLIST.md` — 手动评测清单（看过程、查安全边界）
- `results/` — 历次 scorecard
