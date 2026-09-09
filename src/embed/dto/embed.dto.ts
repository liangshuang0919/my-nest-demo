// 单个文本
export class EmbedSignleDto {
    text: string;
}

// 批量文本
export class EmbedBatchDto {
    text: string[];
}

// 查询
export class EmbedQueryDto {
    query: string;
    documents: string[];
}
