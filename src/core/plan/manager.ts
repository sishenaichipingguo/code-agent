import type { PlanState } from './types'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'

export class PlanManager {
  private state: PlanState | null = null
  private planDir: string

  constructor(projectRoot: string) {
    this.planDir = join(projectRoot, '.claude', 'plans')
    this.ensurePlanDir()
  }

  private ensurePlanDir() {
    if (!existsSync(this.planDir)) {
      mkdirSync(this.planDir, { recursive: true })
    }
  }

  enter(sessionId: string): PlanState {
    const planFile = join(this.planDir, `${sessionId}_plan.md`)
    this.state = {
      active: true,
      planFile,
      phase: 'exploration',
      startTime: new Date()
    }

    const template = `# Implementation Plan

## Overview
[Describe what needs to be done]

## Files to Modify
[List files that will be changed]

## Implementation Steps
[Detailed steps]

## Risks & Considerations
[Potential issues]
`
    writeFileSync(planFile, template)
    return this.state
  }

  exit(): { approved: boolean; planContent: string } {
    if (!this.state) throw new Error('Not in plan mode')
    const planContent = readFileSync(this.state.planFile, 'utf-8')
    this.state = null
    return { approved: true, planContent }
  }

  getState(): PlanState | null {
    return this.state
  }

  updatePhase(phase: PlanState['phase']) {
    if (this.state) this.state.phase = phase
  }
}
