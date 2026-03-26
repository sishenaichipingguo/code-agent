// SubAgent运行时入口
import { createToolRegistry } from '../tools/registry'

async function main() {
  try {
    const type = process.env.SUBAGENT_TYPE!
    const promptBase64 = process.env.SUBAGENT_PROMPT!
    const prompt = Buffer.from(promptBase64, 'base64').toString('utf-8')
    const allowedTools = JSON.parse(process.env.SUBAGENT_TOOLS!)
    const systemPrompt = process.env.SUBAGENT_SYSTEM!

    // 创建受限工具注册表
    const fullRegistry = createToolRegistry()
    const restrictedRegistry = createRestrictedRegistry(fullRegistry, allowedTools)

    // 执行任务（简化版，实际需要调用completion engine）
    const result = await executeSubAgentTask(restrictedRegistry, systemPrompt, prompt)

    // 输出结果
    console.log(JSON.stringify({
      success: true,
      result,
      metadata: {
        toolsUsed: [],
        filesAccessed: [],
        tokensUsed: 0
      }
    }))
  } catch (error: any) {
    console.log(JSON.stringify({
      success: false,
      error: error.message
    }))
    process.exit(1)
  }
}

function createRestrictedRegistry(fullRegistry: any, allowedTools: string[]): any {
  const restricted = { tools: new Map() }
  allowedTools.forEach(name => {
    const tool = fullRegistry.get(name)
    if (tool) restricted.tools.set(name, tool)
  })
  return restricted
}

async function executeSubAgentTask(registry: any, systemPrompt: string, prompt: string): Promise<string> {
  // 简化实现：返回提示信息
  return `SubAgent executed with prompt: ${prompt.slice(0, 100)}...`
}

main()

