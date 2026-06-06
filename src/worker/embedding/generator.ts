import { pipeline, env } from '@xenova/transformers'
import { homedir } from 'os'
import { join } from 'path'
import { getLogger } from '../../infra/logger'

// 配置模型缓存目录
env.cacheDir =
  process.env.TRANSFORMERS_CACHE || join(homedir(), '.cache/transformers')

// The transformers pipeline() return type is a broad union across all task
// kinds; for feature-extraction we only need this callable shape.
type FeatureExtractor = (
  text: string,
  options: { pooling: 'mean'; normalize: boolean }
) => Promise<{ data: ArrayLike<number> }>

let embeddingPipeline: FeatureExtractor | null = null

/**
 * 初始化 embedding 模型
 * 使用 all-MiniLM-L6-v2 模型（轻量级，384 维）
 */
export async function initEmbeddingModel(): Promise<FeatureExtractor> {
  if (embeddingPipeline) return embeddingPipeline

  getLogger().info('Loading embedding model (first time may take a while)...')

  embeddingPipeline = (await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2'
  )) as unknown as FeatureExtractor

  getLogger().info('Embedding model loaded')
  return embeddingPipeline
}

/**
 * 生成文本的 embedding 向量
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const extractor = embeddingPipeline ?? (await initEmbeddingModel())

  // 截断过长的文本（模型限制 512 tokens）
  const truncated = text.slice(0, 2000)

  const output = await extractor(truncated, {
    pooling: 'mean',
    normalize: true,
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
