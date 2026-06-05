# How to record the real demo

<p align="right">
  <b>English</b> · <a href="recording-guide.zh-CN.md">简体中文</a>
</p>

Goal: a 20–30s clip that shows the ONE thing that matters —
**you teach it something in session 1, and it remembers in session 2.**

You have three options, from easiest to most polished. Pick one.

---

## The story to capture (same for all three options)

Keep it tight. The whole point is the "it remembered!" moment.

**Session 1 — teach it (≈10s)**
```bash
agent --with-memory "remember: this project uses 2-space indent and named exports only"
```
Let it confirm and save the memory. (Optionally `cat .claude/memory/MEMORY.md`
for half a second to show it's a real, readable file — this is a great trust beat.)

**Session 2 — fresh start, it remembers (≈15s)**
```bash
agent --with-memory "add a formatDate helper in src/utils"
```
The win is the agent applying 2-space indent + a named export **without being told
again**. If the UI shows a "recalling memory / found user preference" line, make
sure it's visible.

**End card (≈3s)**
Leave the final code on screen. That's your closing frame.

> Tip: do a dry run once WITHOUT recording so the model's output is warm and you
> know the timing. Then record the second take.

---

## Option A — QuickTime (zero install, simplest)

1. Open your terminal app, make the window a clean size (~100x30), bump font size
   so it's readable in a small embed.
2. QuickTime Player → File → New Screen Recording.
3. Click the dropdown, choose to record only your terminal window (or a selected
   region). Record at a normal display resolution, not Retina-huge.
4. Run the two sessions above. Pause briefly on the "saved to memory" and the
   "recalling memory" moments.
5. Stop. You get a `.mov`. Convert it to GIF with the command in the
   "Convert to GIF" section below.

Pros: nothing to install. Cons: you'll want to trim/speed it up afterward.

---

## Option B — vhs (best for a clean, scripted, repeatable GIF)

[vhs](https://github.com/charmbracelet/vhs) records a terminal from a script, so
every take is identical and pixel-clean. Great because you can re-run it after
code changes.

```bash
brew install vhs
```

Then from the repo root:

```bash
vhs docs/launch/demo.tape
```

A starter `demo.tape` is included next to this file. Edit the typed commands to
match your real flow, then run it — it outputs `assets/demo.gif` directly.

> Note: vhs runs the commands for real, so set `ANTHROPIC_API_KEY` first (or point
> it at a local Ollama model) or the agent calls will fail in the recording.

Pros: clean, repeatable, no manual trimming. Cons: needs a one-time install.

---

## Option C — asciinema (tiny file, but not a GIF)

```bash
brew install asciinema
asciinema rec demo.cast
# run the two sessions, then Ctrl-D to stop
```

Embed the player, or convert to GIF with `agg` (`brew install agg && agg demo.cast demo.gif`).

Pros: smallest files, copy-paste-able text. Cons: extra step to get a GIF; less
visually rich than a real screen recording.

---

## Convert a screen recording (.mov) to an optimized GIF

After QuickTime, use the project's existing ffmpeg setup. Speeding up to ~1.5x
keeps it snappy:

```bash
# 1) speed up + scale (tweak setpts: 0.66 ≈ 1.5x faster)
ffmpeg -i screen.mov -vf "setpts=0.66*PTS,fps=20,scale=900:-1:flags=lanczos" demo-raw.gif

# 2) palette-optimize so it's small enough for the README (<2MB ideal)
ffmpeg -i demo-raw.gif -vf "split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" assets/demo.gif

# check size
ls -lh assets/demo.gif
```

Replace the simulated `assets/demo.gif` with this real one. The README already
points at `assets/demo.gif`, so no markdown changes needed.

---

## Recording quality checklist

- [ ] Terminal font large enough to read in a 600–900px-wide embed
- [ ] Clean prompt (no clutter, no secrets/keys visible on screen)
- [ ] The two "wow" beats are clearly visible: memory **saved**, memory **recalled**
- [ ] Total length 20–30s (trim/speed up aggressively — nobody watches a slow demo)
- [ ] Final frame shows the result code so the loop ends on the payoff
- [ ] File under ~2MB so it loads fast on GitHub
- [ ] No real API key or private path visible anywhere in the frame
```
