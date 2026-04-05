import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import type { AllowRule } from './types'

function getStoragePath(): string {
  return join(process.cwd(), '.agent', 'permissions.json')
}

export function loadRules(): AllowRule[] {
  const path = getStoragePath()
  if (!existsSync(path)) return []
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      r => typeof r?.tool === 'string' && r?.matcher && typeof r?.persistent === 'boolean'
    )
  } catch {
    return []
  }
}

export function saveRule(rule: AllowRule): void {
  const path = getStoragePath()
  mkdirSync(dirname(path), { recursive: true })
  const existing = loadRules()
  const updated = [...existing, rule]
  writeFileSync(path, JSON.stringify(updated, null, 2), 'utf-8')
}
