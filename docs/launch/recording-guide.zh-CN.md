# 如何录制真实 demo

<p align="right">
  <a href="recording-guide.md">English</a> · <b>简体中文</b>
</p>

目标：一段 20–30 秒的视频，只讲清楚一件最关键的事——
**你在第一次会话里教它一件事，第二次会话它还记得。**

下面三种方式，从最省事到最专业，挑一个就行。

---

## 要拍的「剧情」（三种方式通用）

保持紧凑，全部重点就是那个「它居然记住了！」的瞬间。

**第一次会话 —— 教它（约 10 秒）**
```bash
agent --with-memory "记住：这个项目用 2 空格缩进，只用具名导出"
```
等它确认并把记忆存下来。（可以顺手 `cat .claude/memory/MEMORY.md` 闪一下，
让观众看到记忆是真实、可读的文件——这是很好的「建立信任」镜头。）

**第二次会话 —— 全新开始，它记得（约 15 秒）**
```bash
agent --with-memory "在 src/utils 里加一个 formatDate 工具函数"
```
关键看点是：助手在**没人再提醒**的情况下，自动用了 2 空格缩进 + 具名导出。
如果界面里有「正在回忆记忆 / 找到用户偏好」这类提示，务必让它清晰可见。

**结尾定格（约 3 秒）**
让最终生成的代码停留在画面上，这就是你的收尾画面。

> 小技巧：正式录之前，先**不录**跑一遍，让模型「热」起来、你也摸清节奏，
> 然后再录第二遍。

---

## 方式 A —— QuickTime（零安装，最简单）

1. 打开终端，把窗口调成干净的尺寸（约 100x30），字号调大一点，
   这样在小尺寸的嵌入图里也看得清。
2. QuickTime Player → 文件 → 新建屏幕录制。
3. 点下拉箭头，选择只录终端窗口（或框选一块区域）。用正常分辨率录，
   别用 Retina 超大分辨率。
4. 跑上面那两次会话。在「已存入记忆」和「正在回忆记忆」两个瞬间稍作停顿。
5. 停止录制，得到一个 `.mov` 文件。用下面「转成 GIF」一节的命令转换。

优点：什么都不用装。缺点：录完需要自己裁剪/加速一下。

---

## 方式 B —— vhs（最干净、脚本化、可重复，推荐）

[vhs](https://github.com/charmbracelet/vhs) 用脚本来录制终端，所以每次录出来都
一模一样、画面像素级干净。好处是改了代码之后还能重录。

```bash
brew install vhs
```

然后在项目根目录运行：

```bash
vhs docs/launch/demo.tape
```

`demo.tape` 脚本已经放在本文件旁边。把里面输入的命令改成你真实的流程，
再运行——它会直接输出 `assets/demo.gif`。

> 注意：vhs 是**真实执行**这些命令的，所以要先 `export ANTHROPIC_API_KEY=...`
> （或把配置指向本地 Ollama 模型），否则录制时助手的调用会失败。

优点：干净、可重复、不用手动裁剪。缺点：要装一次。

---

## 方式 C —— asciinema（文件极小，但不是 GIF）

```bash
brew install asciinema
asciinema rec demo.cast
# 跑那两次会话，然后按 Ctrl-D 停止
```

可以嵌入播放器，或用 `agg` 转成 GIF（`brew install agg && agg demo.cast demo.gif`）。

优点：文件最小、内容可复制成文本。缺点：要多一步才能得到 GIF，
画面也不如真实录屏丰富。

---

## 把屏幕录制（.mov）转成优化过的 GIF

用 QuickTime 录完后，用项目里已有的 ffmpeg 转换。加速到约 1.5 倍会更紧凑：

```bash
# 1) 加速 + 缩放（调 setpts：0.66 约等于 1.5 倍速）
ffmpeg -i screen.mov -vf "setpts=0.66*PTS,fps=20,scale=900:-1:flags=lanczos" demo-raw.gif

# 2) 调色板优化，压到适合放进 README 的体积（理想 <2MB）
ffmpeg -i demo-raw.gif -vf "split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" assets/demo.gif

# 看一下体积
ls -lh assets/demo.gif
```

用这个真实的 GIF 替换掉模拟的 `assets/demo.gif`。README 已经指向
`assets/demo.gif`，所以不用改 markdown。

---

## 录制质量检查清单

- [ ] 终端字号够大，在 600–900px 宽的嵌入图里看得清
- [ ] 提示符干净（没有杂乱信息，画面里不要出现 key/密钥）
- [ ] 两个「wow」瞬间都清晰可见：记忆**已保存**、记忆**被回忆起来**
- [ ] 总时长 20–30 秒（大胆裁剪/加速——没人会看慢吞吞的 demo）
- [ ] 最后一帧停在生成结果上，让画面收在「回报」上
- [ ] 文件小于约 2MB，这样在 GitHub 上加载快
- [ ] 画面任何位置都不要出现真实 API key 或私密路径
```
