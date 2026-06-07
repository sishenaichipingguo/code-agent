import type { HooksConfig } from '@/core/hooks/manager'

export function createMemoryHooks(port: number, verbose = false): HooksConfig {
  const baseUrl = `http://localhost:${port}`

  // If verbose mode, show Hook execution results
  const verboseLog = verbose ? '' : '2>/dev/null'

  return {
    'user-prompt-submit': [
      {
        command: `curl -X POST ${baseUrl}/api/sessions/init -H 'Content-Type: application/json' -d "{\\"contentSessionId\\":\\"$SESSION_ID\\",\\"project\\":\\"$(basename $PWD)\\",\\"prompt\\":\\"$USER_PROMPT\\",\\"platformSource\\":\\"claude-code\\",\\"cwd\\":\\"$PWD\\"}" ${verboseLog} && echo "📝 Recorded prompt to memory" >&2 || true`,
        onError: 'ignore',
        timeout: 5000
      }
    ],
    'post-tool-use': [
      {
        command: `curl -X POST ${baseUrl}/api/sessions/observations -H 'Content-Type: application/json' -d "{\\"contentSessionId\\":\\"$SESSION_ID\\",\\"toolName\\":\\"$TOOL_NAME\\",\\"toolInput\\":$TOOL_INPUT,\\"toolResponse\\":\\"$TOOL_RESULT\\"}" ${verboseLog} && echo "🔍 Recorded tool: $TOOL_NAME" >&2 || true`,
        onError: 'ignore',
        timeout: 3000
      }
    ],
    'session-end': [
      {
        command: `curl -X POST ${baseUrl}/api/sessions/complete -H 'Content-Type: application/json' -d "{\\"contentSessionId\\":\\"$SESSION_ID\\"}" ${verboseLog} || true`,
        onError: 'ignore',
        timeout: 2000
      }
    ]
  }
}
