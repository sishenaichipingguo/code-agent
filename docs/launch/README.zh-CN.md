# 发布工具包

<p align="right">
  <a href="README.md">English</a> · <b>简体中文</b>
</p>

让 Code Agent 出现在更多人面前的现成文案，以及一份发布节奏规划。

Star 数主要取决于**有多少人看到这个仓库**，而不是 README 写得多好。这些文档
就是「把人引过来」的那一半工作。

## 文件清单

- [`hacker-news.zh-CN.md`](./hacker-news.zh-CN.md) —— Show HN 标题 + 首条评论（单点杠杆最高）
- [`reddit.zh-CN.md`](./reddit.zh-CN.md) —— r/LocalLLaMA、r/programming 及其他
- [`twitter-and-chinese.zh-CN.md`](./twitter-and-chinese.zh-CN.md) —— X 推文串 + V2EX/即刻/B站/掘金
- [`blog-post.zh-CN.md`](./blog-post.zh-CN.md) —— 讲记忆系统设计的长文技术博客
- [`recording-guide.zh-CN.md`](./recording-guide.zh-CN.md) —— 如何录制真实 demo

## 发布前检查清单

在任何地方发布**之前**，先完成这些：

- [ ] 用一段真实的 20–30 秒屏幕录制，替换掉模拟的 `assets/demo.gif`
      （就是「周一教它 → 周四它记得」那个流程）。真实录屏转化率高得多，
      也经得起别人挑剔。
- [ ] 推一个 `v0.1.0` tag，让 Releases 页面有真实二进制供安装脚本下载。
      在一台干净的机器上测一遍 `curl ... | bash`。
- [ ] 确保仓库有：清晰的描述、topics/标签（ai、agent、cli、memory、llm、
      ollama），以及 README 在 GitHub 上渲染正常。
- [ ] 有了初步热度后，加一个 star-history 徽章（star-history.com）。
- [ ] 把几个必答问题的答案准备好：「这和 X 有什么区别」「隐私怎么保证」
      「为什么不直接用一个规则文件」。

## 发布节奏（别第一天就全平台轰炸）

**第一周 —— 单点集中突破**
- 只选一个主渠道。推荐 **Hacker News（Show HN）**。
- 发布时间选周二到周四，美西时间上午 8–10 点（约北京时间晚 11 点到凌晨 1 点）。
- 发完后头 1–2 小时守在评论区，回答所有问题。

**第一周，第 2–3 天 —— 第二渠道**
- **r/LocalLLaMA**（你的本地优先卖点在那里非常契合）。
- 标题和正文都要改写，绝不要跨平台复制粘贴同样的文字。

**第一周末 —— 放大**
- 发 **X/Twitter 推文串**，配上 demo 视频。
- 回到你的 HN/Reddit 帖子，补充更新（「根据反馈修复了 XX」）。

**第二周及以后 —— 持续**
- 发布**技术博客**（dev.to + 掘金），从文章里链接到仓库。
- 发中文社区（V2EX、即刻、B站）。
- 给相关的 awesome-list 提 PR（awesome-ai-agents、awesome-claude 等）。
- 做一个看得见的新功能，然后发一条「更新」帖。如此循环。

## 铁律

- **绝不买 star、绝不叫朋友刷 star。** GitHub 能检测到，曲线会很假，而且违反
  服务条款。一条「先陡升后骤平」的假曲线反而会把真实用户吓跑。
- **绝不在 HN 上求 star。** 在那里这会立刻拉低你的可信度。
- **开头先讲问题和故事，别先甩功能清单。**「我受够了每天早上重新跟 agent 解释
  我的项目」比「支持 10 种工具」强得多。
- **早期回复每一个人。** 头 2 小时的互动决定了你在每个平台的排名。
