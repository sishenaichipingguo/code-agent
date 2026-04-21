import { pipeline, env } from '@xenova/transformers'

// 配置模型缓存目录
env.cacheDir = process.env.TRANSFORMERS_CACHE || require('os').homedir() + '/.cache/transformers'

let embeddingPipeline: any = null

/**
 * 初始化 embedding 模型
 * 使用 all-MiniLM-L6-v2 模型（轻量级，384 维）
 */
export async function initEmbeddingModel() {
  if (embeddingPipeline) return embeddingPipeline

  console.log('🔄 Loading embedding model (first time may take a while)...')

  embeddingPipeline = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2'
  )

  console.log('✅ Embedding model loaded')
  return embeddingPipeline
}

/**
 * 生成文本的 embedding 向量
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!embeddingPipeline) {
    await initEmbeddingModel()
  }

  // 截断过长的文本（模型限制 512 tokens）
  const truncated = text.slice(0, 2000)

  const output = await embeddingPipeline(truncated, {
    pooling: 'mean',
    normalize: true
  })

  // 转换为普通数组
  return Array.from(output.data)
}

/**
 * 批量生成 embeddings
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = []

  for (const text of texts) {
    const embedding = await generateEmbedding(text)
    embeddings.push(embedding)
  }

  return embeddings
}
