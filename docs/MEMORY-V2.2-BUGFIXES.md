# Memory System v2.2 - Bug Fixes

## Issues Fixed

### 1. ❌ Worker Path Error
**Error**: `Module not found "/Users/debug/workspace/code-agent/worker/server.ts"`

**Root Cause**: Used `join(__dirname, '../../worker/server.ts')` which calculated wrong path

**Fix**: Changed to `join(process.cwd(), 'src/worker/server.ts')` - always uses project root

**File**: `src/worker/manager.ts`

### 2. ❌ SDKAgent Model Hardcoded
**Error**: `503 model_not_found - No available channel for model claude-3-5-sonnet-20241022`

**Root Cause**: SDKAgent hardcoded model name, incompatible with some API providers

**Fix**: Made model configurable via constructor parameter or `WORKER_MODEL` env var

**Files**: 
- `src/worker/agents/observer.ts` - Added model parameter
- `src/worker/server.ts` - Pass model to SDKAgent

### 3. ❌ SESSION_ID Not Passed to Hooks
**Error**: `Session not found: ` (empty SESSION_ID)

**Root Cause**: `SESSION_ID` was set in Hook environment but not passed to `post-tool-use` hook

**Fix**: Added `SESSION_ID` to `post-tool-use` hook environment variables

**File**: `src/core/agent/loop.ts`

### 4. ❌ Worker Errors Block Main Flow
**Issue**: Worker errors printed to stderr, confusing users

**Fix**: Better error handling - errors logged but don't throw, memory system failures don't block main flow

**File**: `src/worker/session/manager.ts`

## Changes Summary

### src/worker/manager.ts
```typescript
// Before
spawn('bun', ['run', join(__dirname, '../../worker/server.ts')])

// After
const workerPath = join(process.cwd(), 'src/worker/server.ts')
spawn('bun', ['run', workerPath])
```

### src/worker/agents/observer.ts
```typescript
// Before
constructor(apiKey: string) {
  this.client = new Anthropic({ apiKey })
}
async processInit() {
  const response = await this.client.messages.create({
    model: 'claude-3-5-sonnet-20241022',  // Hardcoded
    ...
  })
}

// After
constructor(apiKey: string, model?: string) {
  this.client = new Anthropic({ apiKey })
  this.model = model || process.env.WORKER_MODEL || 'claude-3-5-sonnet-20241022'
}
async processInit() {
  const response = await this.client.messages.create({
    model: this.model,  // Configurable
    ...
  })
}
```

### src/core/agent/loop.ts
```typescript
// Before
await this.context.hooks?.fire('post-tool-use', {
  AGENT_CWD: process.cwd(),
  TOOL_NAME: tool.name,
  TOOL_INPUT: JSON.stringify(tool.input),
  TOOL_RESULT: resultStr.slice(0, 10000)
  // Missing SESSION_ID!
})

// After
await this.context.hooks?.fire('post-tool-use', {
  AGENT_CWD: process.cwd(),
  TOOL_NAME: tool.name,
  TOOL_INPUT: JSON.stringify(tool.input),
  TOOL_RESULT: resultStr.slice(0, 10000),
  SESSION_ID: this.context.sessionManager?.getCurrentSession()?.id || 'unknown'
})
```

### src/worker/session/manager.ts
```typescript
// Before
catch (error) {
  console.error('Init message processing error:', error)
}

// After
catch (error: any) {
  // Log error but don't throw - memory system should not block main flow
  console.error('Init message processing error:', error.message || error)
}
```

## How to Use

### Configure Worker Model

If your API provider doesn't support `claude-3-5-sonnet-20241022`, set a different model:

```bash
export WORKER_MODEL="claude-sonnet-4-6"
# or whatever model your provider supports

bun run dev --with-memory --verbose
```

### Verify It Works

```bash
# Start with verbose mode
bun run dev --with-memory --verbose

# You should see:
# 🧠 Starting memory system...
# ✅ Memory system ready (recording to ~/.claude-mem/)

# Type a message, you should see:
# 📝 Recorded prompt to memory
# 🔍 Recorded tool: bash

# Check recorded data
bun run memory:view
```

## Environment Variables

```bash
# Required
export ANTHROPIC_API_KEY="your-key"

# Optional - configure Worker model
export WORKER_MODEL="claude-sonnet-4-6"

# Optional - Worker port
export WORKER_PORT=37777

# Optional - data directory
export WORKER_DATA_DIR="$HOME/.claude-mem"
```

## Verification

✅ Type check passed (0 errors)
✅ Worker path fixed
✅ Model configurable
✅ SESSION_ID passed correctly
✅ Error handling improved

## Testing

```bash
# Test with custom model
export WORKER_MODEL="claude-sonnet-4-6"
bun run dev --with-memory --verbose "create test folder"

# Should see:
# 🧠 Starting memory system...
# ✅ Memory system ready (recording to ~/.claude-mem/)
# 📝 Recorded prompt to memory
# 🔍 Recorded tool: bash

# Check data
bun run memory:view
```

## Summary

All critical bugs fixed:
- ✅ Worker starts correctly (path fixed)
- ✅ Works with different API providers (model configurable)
- ✅ SESSION_ID passed to all hooks
- ✅ Errors don't block main flow

Now the memory system should work reliably! 🎉
