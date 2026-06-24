// Shared structured-summary instructions for context compression.
//
// A free-text paragraph loses the concrete state an agent needs to continue a
// long task (which files changed, what was decided, what is still pending). The
// instructions below ask the model for a structured handoff so compression
// preserves continuity instead of vibe.

const STRUCTURED_SECTIONS = [
  '- Files created or modified (path + one-line description of the change)',
  '- Decisions made (design choices, approaches selected and why)',
  '- Errors encountered and how they were resolved',
  '- Current task / what was being worked on when compression triggered',
  '- Next steps, open questions, or blockers',
]

/**
 * Mid-task handoff used by the automatic compressor. Recent turns are kept
 * verbatim, so this summarizes only the older prefix that is being dropped.
 */
export function autoHandoffInstruction(): string {
  return [
    'Summarize the conversation above as a structured handoff. Use these sections:',
    ...STRUCTURED_SECTIONS,
    'Only include facts actually present above; do not invent state. Be concise but',
    'preserve every detail needed to continue the current task without the dropped history.',
  ].join('\n')
}

/**
 * Full handoff used by manual /compact, which replaces the entire history.
 */
export function manualHandoffInstruction(): string {
  return [
    'Create a structured context summary with these sections:',
    ...STRUCTURED_SECTIONS,
    'Be thorough — this summary will replace the entire conversation history.',
  ].join('\n')
}
