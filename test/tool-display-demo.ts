#!/usr/bin/env bun
/**
 * Demo script to show the new tool execution display format
 */

// Simulate tool execution output
function simulateToolExecution() {
  console.log('\n=== Tool Execution Display Demo ===\n')

  // Example 1: Read file
  console.log('┌─ read')
  console.log('│  Read a file from the filesystem')
  console.log('│')
  console.log('│  file_path: "/Users/debug/workspace/code-agent/package.json"')
  console.log('│')
  console.log('│  ⏳ Executing...')
  console.log('│  ✓ Completed in 5ms')
  console.log('│')
  console.log('│  Result:')
  console.log('│  {')
  console.log('│    "name": "code-agent",')
  console.log('│    "version": "0.1.0",')
  console.log('│    ...')
  console.log('│  }')
  console.log('└─')

  // Example 2: Bash command
  console.log('\n┌─ bash')
  console.log('│  Execute a shell command')
  console.log('│')
  console.log('│  command: "ls -la src/"')
  console.log('│  description: "List source directory contents"')
  console.log('│')
  console.log('│  ⏳ Executing...')
  console.log('│  ✓ Completed in 45ms')
  console.log('│')
  console.log('│  Result:')
  console.log('│  total 16')
  console.log('│  drwxr-xr-x  7 debug  staff   224 Apr 17 17:46 .')
  console.log('│  drwxr-xr-x 26 debug  staff   832 Apr 17 17:46 ..')
  console.log('│  drwxr-xr-x  8 debug  staff   256 Apr 17 17:46 cli')
  console.log('│  drwxr-xr-x 19 debug  staff   608 Apr  7 17:25 core')
  console.log('└─')

  // Example 3: Error case
  console.log('\n┌─ write')
  console.log('│  Write content to a file')
  console.log('│')
  console.log('│  file_path: "/root/protected.txt"')
  console.log('│  content: "test content..." (100 chars)')
  console.log('│')
  console.log('│  ⏳ Executing...')
  console.log('│  ✗ Failed')
  console.log('│')
  console.log('│  ❌ Permission denied: Cannot write to /root/protected.txt')
  console.log('│  💡 Try writing to a directory you have access to')
  console.log('└─')

  console.log('\n=== Demo Complete ===\n')
}

simulateToolExecution()
