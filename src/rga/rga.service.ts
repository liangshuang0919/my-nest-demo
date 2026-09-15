import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OllamaEmbeddings, ChatOllama } from '@langchain/ollama';
import { Pool } from 'pg';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import type { DistanceStrategy } from '@langchain/community/vectorstores/pgvector';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Document } from '@langchain/core/documents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

import { AddDocumentsDto, ChatDto, SearchDto } from './dto/rga.dto';

@Injectable()
export class RgaService implements OnModuleInit, OnModuleDestroy {
    // 日志器初始化
    private readonly logger: Logger = new Logger(RgaService.name);
    // 向量模型
    private ollamaEmbeddings: OllamaEmbeddings;
    // 大模型
    private chatOllama: ChatOllama;
    // 数据库连接池
    private pool: Pool;

    // 配置数据库
    private getPgConfig(collectionName: string) {
        return {
            pool: this.pool,
            // 表名
            tableName: 'langchain_pg_embedding',
            collectionTableName: 'langchain_pg_collection',
            collectionName,
            // columns 字段名必须和建表时的列名完全对应
            // @langchain/community@1.1.x 内部用这些 key 拼 INSERT SQL
            // 任何一个对不上都会导致插入时对应列为 null
            columns: {
                idColumnName: 'id', // TEXT PRIMARY KEY
                vectorColumnName: 'embedding', // VECTOR(1024)
                contentColumnName: 'document', // TEXT
                metadataColumnName: 'cmetadata' // JSONB
            },
            // 距离策略：cosine（余弦相似度），和 HNSW 索引的 vector_cosine_ops 对应
            // 注意，这里是余弦距离，越小（越接近于 0）表示越相似
            distanceStrategy: 'cosine' as DistanceStrategy,
            // 建议加这个，避免重复 collection 创建问题
            preDeleteCollection: false
        };
    }

    // 初始化
    async onModuleInit() {
        // 初始化向量大模型
        this.ollamaEmbeddings = new OllamaEmbeddings({
            model: process.env.EMBEDDING,
            baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
        });

        // 初始化大模型
        this.chatOllama = new ChatOllama({
            model: process.env.CHAT_MODAL,
            baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
            numPredict: 512,
            temperature: 0.3,
            think: false
        });

        // PostGreSQL 连接池配置
        this.pool = new Pool({
            host: process.env.PG_HOST,
            port: parseInt(process.env.PG_PORT || '5432'),
            user: process.env.PG_USER,
            password: process.env.PG_PASSWORD,
            database: process.env.PG_DATABASE
        });

        this.logger.log(`PostGreSQL 连接池已初始化`);
    }

    // 添加文档
    async addDocuments(body: AddDocumentsDto) {
        // 定义文档分块
        const chunkSize = body.chunkSize || 500;
        // 定义文档分块重叠
        const chunkOverlap = body.chunkOverlap || 0;
        // 拆分规则
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize,
            chunkOverlap,
            separators: ['\n\n', '\n', '。', '！'] // 拆分原则
        });
        // 所有的文本
        const allDocs: Document[] = [];
        // 所有 id
        const allIds: string[] = [];

        // 循环进行拆分文档
        for (const doc of body.documents) {
            // 拆分文档
            const chunks = await splitter.createDocuments([doc.content], [{ id: doc.id, metadata: doc.metadata }]);

            // 遍历一下拆分的文档，添加一些额外的信息
            chunks.forEach((chunk, index) => {
                chunk.metadata.chunkIndex = index;
                chunk.metadata.totalChunks = chunks.length;
                allDocs.push(chunk);
                allIds.push(`${doc.id}-${index}`);
            });

            this.logger.log(`文档 ${doc.id} 分块完成，总共分了 ${chunks.length} 块`);
        }

        // 拆分完之后，开始向数据库中添加数据
        await PGVectorStore.fromDocuments(allDocs, this.ollamaEmbeddings, this.getPgConfig(body.collectionName));

        return {
            success: true,
            backend: 'pgvector',
            collectionName: body.collectionName,
            documnetCount: body.documents.length,
            chunkCount: allDocs.length,
            chunkSize,
            chunkOverlap
        };
    }

    // 搜索
    async search(body: SearchDto) {
        // 搜索结果数量
        const topk = body.topK || 3;
        // 获取 pg 配置
        const vectorStore = await PGVectorStore.initialize(this.ollamaEmbeddings, this.getPgConfig(body.collectionName));

        // 用来从向量库里找最相似的 N 个文档片段，并同时返回相似度分数。
        const result = await vectorStore.similaritySearchWithScore(body.query, topk);
        await vectorStore.end();

        return {
            query: body.query,
            backend: 'pgvector',
            collectionName: body.collectionName,
            result: result.map(([doc, score]) => ({
                content: doc.pageContent, // 文档内容
                metadata: doc.metadata, // 文档的元数据
                score: parseFloat(score.toFixed(4)) // 文档的相似度
            }))
        };
    }

    // 用户提问
    async chat(body: ChatDto) {
        // 搜索结果数量
        const topk = body.topK || 3;
        // 获取 pg 配置
        const vectorStore = await PGVectorStore.initialize(this.ollamaEmbeddings, this.getPgConfig(body.collectionName));

        // 设置前缀
        const queryWithPrefix = `Represent this sentence for searching relevant passages: ${body.question}`;
        // 用来从向量库里找最相似的 N 个文档片段，并同时返回相似度分数。
        const retrieved = await vectorStore.similaritySearchWithScore(queryWithPrefix, topk);

        if (retrieved.length === 0) {
            return {
                query: body.question,
                answer: '知识库中没有相应内容',
                result: []
            };
        }

        // 获取上下文
        const context = retrieved.map(([doc], i) => `[${i + 1}] ${doc.pageContent}`).join('\n\n');
        // 设置提示词
        const prompt = ChatPromptTemplate.fromMessages([
            [
                'system',
                `
                    你是专业的知识库问答助手。严格根据参考资料回答问题，无相关内容时直接回答"知识库中暂无相关内容"，不要编造。
                    参考资料：
                    {context}
                `
            ],
            ['human', '{question}']
        ]);

        const chain = prompt.pipe(this.chatOllama).pipe(new StringOutputParser());
        const answer = await chain.invoke({
            context,
            question: body.question
        });

        return {
            question: body.question,
            backend: 'pgvector',
            answer,
            sources: retrieved.map(([doc, score]) => ({
                content: doc.pageContent,
                score: parseFloat(score.toFixed(6)),
                metadata: doc.metadata
            }))
        };
    }

    // 销毁
    async onModuleDestroy() {}
}
