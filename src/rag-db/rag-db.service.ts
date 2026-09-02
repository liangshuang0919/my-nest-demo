import { Injectable } from '@nestjs/common';
import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import { Document } from '@langchain/core/documents';
// 真实存储到数据库中的 pgvector
import { DistanceStrategy, PGVectorStore } from '@langchain/community/vectorstores/pgvector';
// 数据库连接池
import { Pool } from 'pg';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { StringOutputParser } from '@langchain/core/output_parsers';

import { LoadRagDto, SearchRagDto, ChatRagDto } from './dto/rag-db.dto';
import { LangChainConfig } from '../config';
import { ChatPromptTemplate } from '@langchain/core/prompts';

@Injectable()
export class RagDbService {
    private readonly LLM: ChatOllama;
    // 向量模型，把文本转换成数字向量（用于比较相似度）
    private readonly EmbedModel: OllamaEmbeddings;
    // pgvector 连接池
    private readonly pgPool: Pool;
    // pgvectorStore 配置
    private readonly pgVectorStoreConfig: any;
    // 文本数量
    private documentCount = 0;

    constructor() {
        this.LLM = new ChatOllama({
            model: LangChainConfig.ollama.model, // 模型名称
            baseUrl: LangChainConfig.ollama.baseUrl, // 模型地址
            temperature: LangChainConfig.ollama.temperature, // 温度参数
            think: false, // 是否开启思考模式，开启后模型会优先返回一个思考中的消息，等生成完成后再返回最终答案
        });

        this.EmbedModel = new OllamaEmbeddings({
            model: LangChainConfig.ollama.embedModel, // 模型名称
            baseUrl: LangChainConfig.ollama.baseUrl, // 模型地址
        });

        this.pgPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 10, // 连接池最大连接数
            idleTimeoutMillis: 30000, // 连接空闲超时时间 30s
            connectionTimeoutMillis: 2000, // 连接超时 2 s
        });

        this.pgVectorStoreConfig = {
            pool: this.pgPool, // pg 连接池
            // 集合名称：类似命名空间，可以隔离不同的业务向量数据
            // 例如：rag_collection 存储 RAG 相关的文档向量，faq_collection 存储 FAQ 相关的文档向量
            collectionName: 'rag-knowledge-base',
            collectionTableName: 'langchain_pg_collection', // 存储文档的表名
            // 向量表名
            tableName: 'langchain_pg_embedding', // 存储文档的表名
            // 主键列名
            columns: {
                idColumnName: 'id', // 文档 ID 列
                vectorColumnName: 'embedding', // 向量列
                contentColumnName: 'content', // 文档内容列
                metadataColumnName: 'metadata', // 元数据列，存储文档的额外信息（例如来源、文档 ID 等）
            },
            // 向量距离计算策略
            // pgvector 支持两种距离计算方式：
            // 1. 欧氏距离（L2）
            // 2. 余弦相似度（COSINE）
            distanceStrategy: 'cosine' as DistanceStrategy, // 距离计算策略
        };
    }

    // 加载文档到向量库
    async LoadDocumnets({ documents }: LoadRagDto) {
        // 文本拆分
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 500, // 每块最大字符数
            chunkOverlap: 50, // 相邻块重叠 50 个字符

            // 分隔符优先级：从上到下依次尝试
            separators: [
                '\n\n', // 第1优先：段落分隔（语义最完整）
                '\n', // 第2优先：换行
                '。', // 第3优先：中文句号
                '！',
                '？',
                ' ', // 第4优先：空格（英文单词边界）
                '', // 最后手段：强制按字符数截断
            ],
        });

        // 定义文档存储（目前存在内存中）
        const allDocs: Document[] = [];

        for (const doc of documents) {
            // 分块
            const chunks = await splitter.createDocuments(
                [doc.content], // 文本内容
                [{ source: doc.source || doc.id, docId: doc.id }], // 文本数据源信息
            );

            // 存储每一个块
            allDocs.push(...chunks);
        }

        // 通过 pgvectorStore 批量向量化所有文档块，存入数据库
        // pgvectorStore.fromDocuments 内部会调用 this.EmbedModel.embedDocuments 方法，把文档块转换成向量
        // 1. 首次调用，自动创建表结构（langchain_pg_collection 存储文档、langchain_pg_embedding 存储向量）
        // 2. 后续调用，直接向量化并存储到数据库
        await PGVectorStore.fromDocuments(allDocs, this.EmbedModel, this.pgVectorStoreConfig);
        this.documentCount += documents.length;

        return {
            success: true,
            originalDocs: documents.length,
            totalCount: allDocs.length,
            message: `加载 ${documents.length} 篇文档，共 ${allDocs.length} 个块`,
        };
    }

    // 检索向量库（纯向量查询，不通过大模型，直接检索结果）
    async EmbedSearch({ query, topK = 3 }: SearchRagDto) {
        // 每次调用都会新建连接池
        const vectorStore = await PGVectorStore.initialize(this.EmbedModel, this.pgVectorStoreConfig);

        const results = await vectorStore.similaritySearchWithScore(query, topK);

        if (!results.length) {
            return {
                success: false,
                message: '知识库为空，请先加载文档',
            };
        }

        return {
            success: true,
            results: results.map(([doc, score]) => ({
                ...doc.metadata,
                content: doc.pageContent,
                score: parseFloat(score.toFixed(4)), // 余弦距离，越小越相似
                similarity: parseFloat((1 - score).toFixed(4)), // 余弦相似度，越接近1，越相似
            })),
        };
    }

    // 检索向量库（完整 rag 回答，结合大模型）
    async EmbedChat({ question, topK = 3 }: ChatRagDto) {
        const vectorStore = await PGVectorStore.initialize(this.EmbedModel, this.pgVectorStoreConfig);

        // 第一步：检索相关文档块
        const results = await vectorStore.similaritySearchWithScore(question, topK);

        // 第二步：把检索结果拼成 content 字符串
        // score 是余弦距离，越小越相关，选出小于 0.5 的数据
        const filtered = results.filter(([, score]) => score <= 0.5);

        if (!filtered.length) {
            return {
                question,
                source: [],
                message: '知识库中没有找到相关内容',
            };
        }

        // content 内容格式如下：
        // [1]第一块内容\n\n[2]第二块内容\n\n...
        // 编号方便模型在回答时引用："根据[1]..."
        const content = filtered.map(([doc], index) => `[${index + 1}] ${doc.pageContent}`).join('\n\n');

        // 第三步：RAG Prompt，严格限制模型只能用参考资料回答
        const prompt = ChatPromptTemplate.fromMessages([
            [
                'system',
                `
                    你是知识库问答助手，严格基于参考资料回答。
                    规则：
                    1. 只根据参考资料内容回答，不能使用资料外的知识
                    2. 资料中没有相关信息，回答"知识库中暂无相关内容"
                    3. 回答简洁准确，使用中文

                    参考资料：{context}
                `,
            ],
            ['human', '{question}'],
        ]);

        // 第四步：调用模型生成回答
        const chain = prompt.pipe(this.LLM).pipe(new StringOutputParser());

        return await chain
            .invoke({
                question,
                context: content,
            })
            .then((res) => {
                return {
                    code: 200,
                    message: 'success',
                    data: {
                        answer: res,
                        question,
                        sources: results.map(([doc, score]) => ({
                            content: doc.pageContent,
                            source: doc.metadata.source || doc.metadata.id,
                            score: parseFloat(score.toFixed(4)), // 余弦距离，越小越相似
                            similarity: parseFloat((1 - score).toFixed(4)), // 余弦相似度，越接近1，越相似
                        })),
                    },
                };
            })
            .catch((err) => {
                return {
                    code: 500,
                    message: 'error',
                    data: err as string,
                };
            });
    }

    // 获取向量数据库状态
    async GetStatus() {
        try {
            // 查询 pgvector 数据库中已经存储的向量数据
            const results = await this.pgPool.query(
                `SELECT COUNT(*) FROM ${this.pgVectorStoreConfig.tableName} 
                WHERE collection_id = (
                    SELECT uuid FROM ${this.pgVectorStoreConfig.collectionTableName} WHERE name = $1
                )`,
                [this.pgVectorStoreConfig.collectionName],
            );

            // 计算出来的总数据条数
            const vectorCount = parseInt(results.rows[0].count, 10);

            return {
                mode: 'pgvector',
                loaded: vectorCount > 0,
                vectorCount,
                collection: this.pgVectorStoreConfig.collectionName,
                message: vectorCount > 0 ? `PostgreSQL 向量库中有 ${vectorCount} 个文档块` : '向量库为空，请先加载文档',
            };
        } catch (error) {
            return {
                loaded: false,
                vectorCount: 0,
                message: '获取向量数据库状态失败',
                error: error.message,
            };
        }
    }

    // 清空向量数据库
    async Clear() {
        await this.pgPool.query(
            `
                DELETE FROM ${this.pgVectorStoreConfig.tableName} 
                WHERE collection_id = (
                    SELECT uuid FROM ${this.pgVectorStoreConfig.collectionTableName} WHERE name = $1
                )
            `,
            [this.pgVectorStoreConfig.collectionName],
        );
        await this.pgPool.query(
            `
                DELETE FROM ${this.pgVectorStoreConfig.collectionTableName} 
                WHERE name = $1
            `,
            [this.pgVectorStoreConfig.collectionName],
        );

        return {
            success: true,
            message: '知识库已清空',
        };
    }

    async onModuleDestory() {
        await this.pgPool.end();
    }
}
