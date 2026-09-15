// ──────────────────────────────────────────────────────────
// 接口：POST /rag/documents
// 用途：把原始文档存入向量数据库（含自动分块逻辑）
// ──────────────────────────────────────────────────────────
export class AddDocumentsDto {
    // Chroma 集合名称，相当于数据库中的"表名"
    // 同一个知识库用同一个 collectionName，不同知识库用不同名称
    // 例如：'frontend-docs'、'company-wiki'、'product-manual'
    collectionName: string;

    // 文档数组，支持一次性批量存入多个文档
    documents: {
        // 文档的唯一标识符，自己定义
        // 分块后每个块的 id 会追加 '-chunk-0'、'-chunk-1' 等
        // 例如 id='doc-001'，分块后生成 'doc-001-chunk-0'、'doc-001-chunk-1'
        id: string;

        // 文档的完整文本内容
        // 会被分块器按 chunkSize 和 chunkOverlap 切成多个小块
        // 每个块独立向量化后存入 Chroma
        content: string;

        // 可选的元数据，格式自由，可存任意键值对
        // 会原样附加到每个分块上，检索时一起返回
        // 常见用法：{ category: 'vue', author: '大伟老师', createdAt: '2025-01' }
        metadata?: Record<string, any>;
    }[];

    // 可选：每个分块的最大字符数
    // 不传则使用 config.ts 中的 splitter.chunkSize（默认 500）
    chunkSize?: number;

    // 可选：相邻分块之间的重叠字符数
    // 不传则使用 config.ts 中的 splitter.chunkOverlap（默认 50）
    chunkOverlap?: number;
}

// ──────────────────────────────────────────────────────────
// 接口：POST /rag/search
// 用途：纯向量检索（不经过大模型）
//       用于演示检索效果，对比不同 query 的 score 变化
// ──────────────────────────────────────────────────────────
export class SearchDto {
    // 要检索的集合名称，必须是已通过 /rag/documents 存入的集合
    collectionName: string;

    // 用户的查询文本，服务内部会自动加上 queryPrefix 再向量化
    query: string;

    // 可选：返回最相似的前 K 条结果，默认使用 config.rag.defaultTopK（3）
    topK?: number;
}

// ──────────────────────────────────────────────────────────
// 接口：POST /rag/query
// 用途：完整 RAG 流程（向量检索 + Qwen 生成最终回答）
//       这是课程的核心演示接口
// ──────────────────────────────────────────────────────────
export class ChatDto {
    // 要检索的集合名称
    collectionName: string;

    // 用户的自然语言问题
    // 会先向量化后检索，再把检索结果拼入 Prompt 给 Qwen 回答
    question: string;

    // 可选：检索几条相关文档传给大模型，默认 3
    // 建议范围 2~5：太少可能信息不足，太多会超出模型 context
    topK?: number;
}
