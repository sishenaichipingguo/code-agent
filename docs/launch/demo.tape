# vhs tape for the Code Agent memory demo.
#
#   brew install vhs
#   export ANTHROPIC_API_KEY=sk-...   # or point config at a local Ollama model
#   vhs docs/launch/demo.tape
#
# Outputs assets/demo.gif. Edit the typed commands below to match your real flow.
# vhs runs the commands for real, so the agent must be runnable in this dir.

Output assets/demo.gif

# --- Look & feel ------------------------------------------------------------
Set Theme "Dracula"
Set FontSize 18
Set Width 1000
Set Height 600
Set Padding 24
Set TypingSpeed 60ms
Set PlaybackSpeed 1.0

# --- Session 1: teach it -----------------------------------------------------
Type "# Session 1 — teach it once"
Enter
Sleep 800ms

Type `agent --with-memory "remember: this project uses 2-space indent and named exports only"`
Enter
# Wait for the agent to respond and save the memory.
# Bump this if your model is slow.
Sleep 6s

# Show that the memory is a real, readable file (big trust beat).
Type "cat .claude/memory/MEMORY.md"
Enter
Sleep 2500ms

Type "clear"
Enter
Sleep 500ms

# --- Session 2: fresh start, it remembers -----------------------------------
Type "# Session 2 — days later, brand new run. Watch it recall."
Enter
Sleep 1s

Type `agent --with-memory "add a formatDate helper in src/utils"`
Enter
# Wait for it to recall memory + write the file applying your conventions.
Sleep 9s

# Linger on the result — this is the closing frame / the payoff.
Sleep 3s
