import { ChromaClient } from 'chromadb'
import type { Observation } from '../types'
import { generateEmbedding } from './generator'

export class ChromaManager {
  private client: ChromaClient
  private collection: any
  private collectionName = 'observations'

  constructor(private dataDir: string) {
    // 使用嵌入式模式，数据存储在本地
    this.client = new ChromaClient({
      path: `${dataDir}/chroma`
    })
  }

  async init() {
    try {
      // 尝试获取已存在的 collection
      this.collection = await this.client.getCollection({
        name: this.collectionName
      })
      console.log('✅ ChromaDB collection loaded')
    } catch {
      // 如果不存在，创建新的 collection
      this.collection = await this.client.createCollection({
        name: this.collectionName,
        metadata: { description: 'Memory observations with embeddings' }
      })
      console.log('✅ ChromaDB collection created')
    }
  }

  /**
   * 添加观察记录到向量数据库
   */
  async addObservation(observation: Observation) {
    if (!this.collection) {
      throw new Error('ChromaDB not initialized')
    }

    // 生成 embedding
    const embedding = await generateEmbedding(observation.content)

    // 存储到 ChromaDB
    await this.collection.add({
      ids: [`obs_${observation.id}`],
      embeddings: [embedding],
      documents: [observation.content],
      metadatas: [{
        session_id: observation.sessionId,
        type: observation.type,
        created_at: observation.createdAt,
        ...observation.metadata
      }]
    })
  }

  /**
   * 语义搜索相关的观察记录
   */
  async searchSimilar(
    query: string,
    options: {
      project?: string
      limit?: number
      minScore?: number
    } = {}
  ): Promise<Array<{
    id: number
    content: string
    type: string
    sessionId: number
    createdAt: number
    metadata: any
    score: number
  }>> {
    if (!this.collection) {
      throw new Error('ChromaDB not initialized')
    }

    const limit = options.limit || 10
    const minScore = options.minScore || 0.3

    // 生成查询的 embedding
    const queryEmbedding = await generateEmbedding(query)

    // 构建过滤条件
    const where = options.project ? { project: options.project } : undefined

    // 执行语义搜索
    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
      where
    })

    // 解析结果
    const observations: Array<any> = []

    if (results.ids && results.ids[0]) {
      for (let i = 0; i < results.ids[0].length; i++) {
        const id = results.ids[0][i]
        const distance = results.distances?.[0]?.[i] || 0
        const score = 1 - distance // 转换为相似度分数

        // 过滤低分结果
        if (score < minScore) continue

        const metadata = results.metadatas?.[0]?.[i] || {}
        const document = results.documents?.[0]?.[i] || ''

        // 从 id 中提取 observation id
        const obsId = parseInt(id.replace('obs_', ''))

        observations.push({
          id: obsId,
          content: document,
          type: metadata.type,
          sessionId: metadata.session_id,
          createdAt: metadata.created_at,
          metadata,
          score
        })
      }
    }

    return observations
  }

  /**
   * 批量添加观察记录（用于初始化或迁移）
   */
  async addObservations(observations: Observation[]) {
    if (!this.collection) {
      throw new Error('ChromaDB not initialized')
    }

    if (observations.length === 0) return

    console.log(`🔄 Adding ${observations.length} observations to ChromaDB...`)

    const ids: string[] = []
    const embeddings: number[][] = []
    const documents: string[] = []
    const metadatas: any[] = []

    for (const obs of observations) {
      const embedding = await generateEmbedding(obs.content)

      ids.push(`obs_${obs.id}`)
      embeddings.push(embedding)
      documents.push(obs.content)
      metadatas.push({
        session_id: obs.sessionId,
        type: obs.type,
        created_at: obs.createdAt,
        ...obs.metadata
      })
    }

    await this.collection.add({
      ids,
      embeddings,
      documents,
      metadatas
    })

    console.log(`✅ Added ${observations.length} observations to ChromaDB`)
  }

  /**
   * 获取 collection 统计信息
   */
  async getStats() {
    if (!this.collection) {
      throw new Error('ChromaDB not initialized')
    }

    const count = await this.collection.count()
    return { count }
  }
}
