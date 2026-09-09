import { Injectable } from '@nestjs/common';
import { OllamaEmbeddings } from '@langchain/ollama';

import { EmbedSignleDto, EmbedBatchDto, EmbedQueryDto } from './dto/embed.dto';

@Injectable()
export class EmbedService {
    // ollama 大模型
    private ollamaEmbeddings: OllamaEmbeddings;
    // 手写计算余弦相似度的方法
    private cosineSimilarity: any;

    constructor() {
        this.ollamaEmbeddings = new OllamaEmbeddings({
            model: 'mxbai-embed-large:latest',
            baseUrl: 'http://localhost:11434'
        });

        this.cosineSimilarity = (vecA: number[], vecB: number[]): number => {
            const dot = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
            const normA = Math.sqrt(vecA.reduce((s, a) => s + a * a, 0));
            const normB = Math.sqrt(vecB.reduce((s, b) => s + b * b, 0));

            // 避免计算出来是 0
            if (normA === 0 || normB === 0) {
                return 0;
            }

            return dot / (normA * normB);
        };
    }

    // 单个文本向量化
    async createSignle({ text }: EmbedSignleDto) {
        const vector = await this.ollamaEmbeddings.embedQuery(text);

        return {
            text,
            vector,
            dimension: vector.length
        };
    }

    // 多个文本向量化
    async createBatch({ text }: EmbedBatchDto) {
        const vectors = await this.ollamaEmbeddings.embedDocuments(text);

        return vectors.map((item, index) => ({
            index,
            text: text[index],
            vector: item,
            dimension: item.length
        }));
    }

    // 计算查询与文档之间的余弦相似度，并返回相似度最高的文档
    async createQuery({ query, documents }: EmbedQueryDto) {
        // 查询向量，加上检索前缀
        const queryVector = await this.ollamaEmbeddings.embedQuery(`
            Represent this sentence for searching relevant passages: ${query}
        `);
        // 文档向量
        const docVectors = await this.ollamaEmbeddings.embedDocuments(documents);

        // 计算余弦相似度
        const similarities = docVectors.map((item, index) => {
            // 计算出用户查询的内容，与文档之间的相似度
            const similarity = this.cosineSimilarity(queryVector, item);

            return {
                index,
                similarity: parseFloat(similarity.toFixed(4)),
                text: documents[index]
            };
        });

        similarities.sort((a, b) => b.similarity - a.similarity);

        return {
            query,
            similarities
        };
    }
}
