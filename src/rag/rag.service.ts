import { Injectable } from '@nestjs/common';
import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import { Document } from '@langchain/core/documents';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { StringOutputParser } from '@langchain/core/output_parsers';

import { LoadRagDto, SearchRagDto, ChatRagDto } from './dto/rag.dto';
import { LangChainConfig } from '../config';
import { ChatPromptTemplate } from '@langchain/core/prompts';

@Injectable()
export class RagService {
    private readonly LLM: ChatOllama;
    // 向量模型，把文本转换成数字向量（用于比较相似度）
    private readonly EmbedModel: OllamaEmbeddings;
    // 内存向量库（null 表示未初始化）
    private vectorStore: MemoryVectorStore | null = null;
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

        // fromDocuments 是批量向量化所有文档块，存入内存向量库
        // 内部调用 MemoryVectorStore 转成向量
        this.vectorStore = await MemoryVectorStore.fromDocuments(allDocs, this.EmbedModel);

        this.documentCount = allDocs.length;

        return {
            success: true,
            originalDocs: documents.length,
            totalCount: allDocs.length,
            message: `加载 ${documents.length} 篇文档，共 ${allDocs.length} 个块`,
        };
    }

    // 检索向量库（纯向量查询，不通过大模型，直接检索结果）
    async EmbedSearch({ query, topK = 3 }: SearchRagDto) {
        if (!this.vectorStore) {
            return {
                success: false,
                message: '知识库为空，请先加载文档',
            };
        }

        // 调用检索方法
        // similaritySearchWithScore 方法的流程：
        // 1. 把 query 向量化（调用 EmbedModel.embedQuery）
        // 2. 和向量库里面的所有文档向量计算余弦相似度
        // 3. 按照相似程度排序，返回前 topK 个结果
        const results = await this.vectorStore.similaritySearchWithScore(query, topK);

        return {
            success: true,
            // results 有两个参数：
            // doc: Document 对象，包含文档内容、元数据等信息
            // score: 相似度分数，范围 0~1
            results: results.map(([doc, score]) => ({
                score: parseFloat(score.toFixed(4)), // 越趋近于1，越相似
                ...doc.metadata,
                content: doc.pageContent,
            })),
        };
    }

    // 检索向量库（完整 rag 回答，结合大模型）
    async EmbedChat({ question, topK = 3 }: ChatRagDto) {
        if (!this.vectorStore) {
            return {
                success: false,
                message: '知识库为空，请先加载文档',
            };
        }

        // 第一步：检索相关文档块
        const results = await this.vectorStore.similaritySearchWithScore(question, topK);

        if (!results.length) {
            return {
                question,
                source: [],
                message: '知识库中没有找到相关内容',
            };
        }

        // 第二步：把检索结果拼成 content 字符串
        // content 内容格式如下：
        // [1]第一块内容\n\n[2]第二块内容\n\n...
        // 编号方便模型在回答时引用："根据[1]..."
        const content = results.map(([doc], index) => `[${index + 1}] ${doc.pageContent}`).join('\n\n');

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
                            ...doc.metadata,
                            score: parseFloat(score.toFixed(4)),
                            content: doc.pageContent,
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
    GetStatus() {
        return {
            loaded: !!this.vectorStore,
            documentCount: this.documentCount,
            message: this.vectorStore ? `已加载 ${this.documentCount} 个文档` : '知识库为空，请先加载文档',
        };
    }

    // 清空向量数据库
    Clear() {
        this.vectorStore = null;
        this.documentCount = 0;

        return {
            success: true,
            message: '已清空知识库',
        };
    }
}
