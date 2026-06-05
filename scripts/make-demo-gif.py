#!/usr/bin/env python3
"""
Generate a simulated Code Agent terminal-session demo GIF.

This renders a fake-but-realistic terminal session that showcases the
project's core differentiator: persistent cross-session memory.

Story:
  Session 1 — user states a preference; agent saves it to memory.
  ... time passes (new day, new session) ...
  Session 2 — agent recalls the preference automatically and applies it.

Output: assets/demo.gif

Usage:
    python3 scripts/make-demo-gif.py
"""

import os
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Layout / theme
# ---------------------------------------------------------------------------
WIDTH, HEIGHT = 920, 560
PAD = 24
TITLEBAR_H = 36
LINE_H = 24
FONT_SIZE = 16

BG = (24, 26, 33)
TITLEBAR = (40, 42, 54)
FG = (222, 224, 232)
DIM = (128, 132, 150)
GREEN = (126, 211, 144)
CYAN = (94, 200, 214)
YELLOW = (235, 203, 110)
MAGENTA = (200, 140, 230)
RED = (235, 120, 120)
BLUE = (110, 170, 240)

FONT_PATH = "/System/Library/Fonts/SFNSMono.ttf"
FONT_FALLBACK = "/System/Library/Fonts/Menlo.ttc"


def load_font(size):
    for path in (FONT_PATH, FONT_FALLBACK):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


FONT = load_font(FONT_SIZE)

# ---------------------------------------------------------------------------
# Session script.
# Each entry is a line of segments [(text, color), ...].
# "type": True  -> typed out char-by-char (user input)
# "pause": hold time after the line appears (in ~90ms units)
# ---------------------------------------------------------------------------
SESSION = [
    {"segs": [("# ", DIM), ("Monday", YELLOW), (" — session 1", DIM)], "type": False, "pause": 6},
    {"segs": [("$ ", DIM), ("agent", GREEN), (" \"use 2-space indent and named exports\"", FG)], "type": True, "pause": 5},
    {"segs": [("● ", CYAN), ("agent", CYAN), (" got it.", FG)], "type": False, "pause": 4},
    {"segs": [("  💾 saved to memory ", GREEN), ("user/code-style", DIM)], "type": False, "pause": 8},
    {"segs": [("", FG)], "type": False, "pause": 1},
    {"segs": [(".claude/memory/user_code-style.md", DIM)], "type": False, "pause": 3},
    {"segs": [("  • 2-space indent   • prefer named exports", DIM)], "type": False, "pause": 12},
    {"segs": [("", FG)], "type": False, "pause": 1},

    {"segs": [("# ", DIM), ("Thursday", YELLOW), (" — session 2  ", DIM), ("(fresh start, days later)", DIM)], "type": False, "pause": 8},
    {"segs": [("$ ", DIM), ("agent", GREEN), (" \"add a formatDate util\"", FG)], "type": True, "pause": 5},
    {"segs": [("● ", CYAN), ("agent", CYAN), (" recalling project memory...", DIM)], "type": False, "pause": 4},
    {"segs": [("  🧠 found ", MAGENTA), ("user/code-style", CYAN), (" — applying your conventions", DIM)], "type": False, "pause": 9},
    {"segs": [("", FG)], "type": False, "pause": 1},
    {"segs": [("  ✓ wrote ", GREEN), ("src/utils/date.ts", FG)], "type": False, "pause": 4},
    {"segs": [("    export const formatDate = (d) => {", FG)], "type": False, "pause": 3},
    {"segs": [("      return d.toISOString()      ", FG), ("# 2-space ✓", GREEN)], "type": False, "pause": 3},
    {"segs": [("    }                             ", FG), ("# named export ✓", GREEN)], "type": False, "pause": 10},
    {"segs": [("", FG)], "type": False, "pause": 1},
    {"segs": [("you never re-explained yourself.", DIM)], "type": False, "pause": 16},
]


def draw_titlebar(draw):
    draw.rectangle([0, 0, WIDTH, TITLEBAR_H], fill=TITLEBAR)
    cy = TITLEBAR_H // 2
    for i, col in enumerate(((255, 95, 86), (255, 189, 46), (39, 201, 63))):
        cx = 20 + i * 22
        draw.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=col)
    title = "code-agent — zsh"
    w = draw.textlength(title, font=FONT)
    draw.text(((WIDTH - w) / 2, cy - FONT_SIZE / 2), title, font=FONT, fill=DIM)


def render_frame(completed_lines, partial_segs=None):
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)
    draw_titlebar(draw)

    y = TITLEBAR_H + PAD
    for segs in completed_lines:
        x = PAD
        for text, color in segs:
            draw.text((x, y), text, font=FONT, fill=color)
            x += draw.textlength(text, font=FONT)
        y += LINE_H

    if partial_segs is not None:
        segs, n = partial_segs
        x = PAD
        remaining = n
        for text, color in segs:
            if remaining <= 0:
                break
            chunk = text[:remaining]
            draw.text((x, y), chunk, font=FONT, fill=color)
            x += draw.textlength(chunk, font=FONT)
            remaining -= len(chunk)
        draw.rectangle([x + 1, y + 2, x + 9, y + LINE_H - 4], fill=GREEN)

    return img


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(os.path.dirname(here), "assets")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "demo.gif")

    frames, durations = [], []
    completed = []

    def add(img, ms):
        frames.append(img)
        durations.append(ms)

    add(render_frame(completed), 600)

    for line in SESSION:
        segs = line["segs"]
        if line["type"]:
            total = sum(len(t) for t, _ in segs)
            for i in range(1, total + 1):
                add(render_frame(completed, (segs, i)), 42)
            add(render_frame(completed, (segs, total)), 250)
        completed.append(segs)
        max_lines = (HEIGHT - TITLEBAR_H - 2 * PAD) // LINE_H
        if len(completed) > max_lines:
            completed = completed[-max_lines:]
        add(render_frame(completed), line["pause"] * 90)

    add(render_frame(completed), 1800)

    frames[0].save(
        out_path,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )
    size_kb = os.path.getsize(out_path) / 1024
    print(f"wrote {out_path} ({len(frames)} frames, {size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
