export class LoadRagDto {
    documents: Array<{
        id: string; // 文档ID
        content: string; // 文档内容
        source?: string; // 文档来源
    }>;
}

export class SearchRagDto {
    query: string; // 查询
    topK?: number; // 返回结果数量
}

export class ChatRagDto {
    question: string; // 查询
    topK?: number; // 返回结果数量
}
