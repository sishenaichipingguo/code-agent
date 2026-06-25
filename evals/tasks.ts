// The evaluation suite: a fixed set of tasks, each with a prepared workspace,
// a prompt, and a machine-checkable success criterion. Add tasks here as the
// agent grows — a stable suite is what makes pass-rate comparable over time.

import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { CheckResult, EvalTask } from './types'

async function read(workDir: string, file: string): Promise<string> {
  try {
    return await readFile(join(workDir, file), 'utf-8')
  } catch {
    return ''
  }
}

function pass(detail = 'ok'): CheckResult {
  return { passed: true, detail }
}

function fail(detail: string): CheckResult {
  return { passed: false, detail }
}

export const TASKS: EvalTask[] = [
  {
    id: 'create-file',
    description: 'Writes a new file with exact requested content',
    prompt:
      'Create a file named greeting.txt whose only content is: Hello, Agent',
    check: async ({ workDir }) => {
      const content = await read(workDir, 'greeting.txt')
      if (!content) return fail('greeting.txt missing')
      return content.includes('Hello, Agent')
        ? pass()
        : fail(`unexpected content: ${JSON.stringify(content.slice(0, 60))}`)
    },
  },
  {
    id: 'edit-file',
    description: 'Edits an existing file in place',
    prompt:
      'In note.txt, change the word "World" to "Claude". Keep everything else.',
    setup: async workDir => {
      await writeFile(join(workDir, 'note.txt'), 'Hello World, welcome.\n')
    },
    check: async ({ workDir }) => {
      const content = await read(workDir, 'note.txt')
      if (content.includes('World')) return fail('"World" still present')
      return content.includes('Hello Claude')
        ? pass()
        : fail(`got: ${JSON.stringify(content.slice(0, 60))}`)
    },
  },
  {
    id: 'fix-bug',
    description: 'Locates and fixes a logic bug from a description',
    prompt:
      'There is a bug in math.js: the add function subtracts instead of adds. Fix it so add(a, b) returns the sum.',
    setup: async workDir => {
      await writeFile(
        join(workDir, 'math.js'),
        'export function add(a, b) {\n  return a - b\n}\n'
      )
    },
    check: async ({ workDir }) => {
      const content = await read(workDir, 'math.js')
      if (!content) return fail('math.js missing')
      const subtracts = /return\s+a\s*-\s*b/.test(content)
      const adds = /return\s+a\s*\+\s*b/.test(content)
      if (subtracts) return fail('still subtracts')
      return adds ? pass() : fail('no "a + b" found')
    },
  },
  {
    id: 'search-and-answer',
    description: 'Searches multiple files and reports the right answer',
    prompt:
      'Exactly one file in this directory contains the word BANANA. Tell me which filename it is.',
    setup: async workDir => {
      await writeFile(join(workDir, 'alpha.txt'), 'apples and oranges\n')
      await writeFile(join(workDir, 'beta.txt'), 'here is a BANANA hidden\n')
      await writeFile(join(workDir, 'gamma.txt'), 'cherries only\n')
    },
    check: async ({ stdout }) => {
      // Black-box: did the agent's final answer name the correct file?
      const said = stdout.includes('beta.txt')
      const wrong = stdout.includes('alpha.txt') || stdout.includes('gamma.txt')
      if (said && !wrong) return pass()
      if (said && wrong) return fail('named beta.txt but also others')
      return fail('did not name beta.txt')
    },
  },
  {
    id: 'refactor-rename',
    description: 'Renames a symbol consistently across a file',
    prompt:
      'In util.js, rename the function oldName to newName everywhere it appears (definition and call sites).',
    setup: async workDir => {
      await writeFile(
        join(workDir, 'util.js'),
        [
          'export function oldName(x) {',
          '  return x * 2',
          '}',
          '',
          'export function double(x) {',
          '  return oldName(x)',
          '}',
          '',
          'export const four = oldName(2)',
          '',
        ].join('\n')
      )
    },
    check: async ({ workDir }) => {
      const content = await read(workDir, 'util.js')
      if (!content) return fail('util.js missing')
      if (/\boldName\b/.test(content)) return fail('"oldName" still present')
      const occurrences = (content.match(/\bnewName\b/g) || []).length
      return occurrences >= 3
        ? pass(`${occurrences} newName references`)
        : fail(`only ${occurrences} newName references (expected >= 3)`)
    },
  },
]
