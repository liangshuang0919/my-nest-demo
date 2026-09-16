import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { StateGraph, Annotation, MessagesAnnotation, MemorySaver, START, END } from '@langchain/langgraph';

import { LangChainConfig } from '../config';
import { ArticleDto } from './dto/langgraph.dto';

// 自定义 state：定义这个工作流所有节点共享的数据结构
const ArticleState = Annotation.Root({
    // 原始文章（用户输入，各节点只读）
    article: Annotation<string>(),
    // 关键字列表（用户输入，大模型输出，供后续节点进行使用）
    keywords: Annotation<string[]>({
        // reducer 定义了如果这个字段被多次写入，应该如何合并这些写入结果，这里我们选择将所有写入的关键字列表进行合并成一个总的列表
        reducer: (prev, cur) => [...prev, ...cur],
        default: () => [], // 定义默认为一个空数组，确保在没有写入时也能正常使用
    }),
    // 最终摘要
    summary: Annotation<string>(),
    // 日志，记录整个流程过程
    log: Annotation<string[]>({
        reducer: (prev, cur) => [...prev, ...cur],
        default: () => [],
    }),
});

@Injectable()
export class ArticleService implements OnModuleInit {
    // 大模型
    private LLM: ChatOllama;
    // 图容器
    private graph: any;

    onModuleInit() {
        // 创建 chatOllam 模型
        this.LLM = new ChatOllama({
            model: LangChainConfig.ollama.model, // 模型名称
            baseUrl: LangChainConfig.ollama.baseUrl, // 模型地址
            temperature: LangChainConfig.ollama.temperature, // 温度参数
            think: false, // 是否开启思考模式，开启后模型会优先返回一个思考中的消息，等生成完成后再返回最终答案
        });

        // 节点1：提取关键词
        const extractKeywords = async (state: typeof ArticleState.State) => {
            // 记录当前流程开始时间
            const t0 = Date.now();
            const res = await this.LLM.invoke([
                new SystemMessage('你是一个专业的文本分析助手，负责从文章中提取关键词'),
                new HumanMessage(
                    `请从以下文章中提取关键词：\n\n${state.article}\n\n只需要返回关键词列表，从文章中提取4-7个关键词，逗号分隔，不要其他内容`,
                ),
            ]);

            const keywords = (res.content as string)
                .split(/[,，]/)
                .map((item) => item.trim())
                .filter(Boolean);

            return {
                keywords,
                log: [`提取关键词耗时 ${(Date.now() - t0) / 1000}s`],
            };
        };

        // 节点2：生成摘要
        // state.keywords 此时已经包含了 extractKeywords 节点提取的关键词，可以直接在 generateSummary 节点中使用这些关键词来生成摘要
        const generateSummary = async (state: typeof ArticleState.State) => {
            // 记录当前流程开始时间
            const t0 = Date.now();
            const res = await this.LLM.invoke([
                new SystemMessage('你是一个专业的文本总结助手，负责根据文章内容和关键词生成摘要'),
                new HumanMessage(
                    `根据以下文章生成 200 字以内的摘要。\n关键词参考：${state.keywords.join('、')}\n\n文章：\n${state.article}`,
                ),
            ]);

            return {
                summary: res.content as string,
                log: [`关键词提取完成 ${(Date.now() - t0) / 1000}s`],
            };
        };

        this.graph = new StateGraph(ArticleState)
            .addNode('extractKeywords', extractKeywords)
            .addNode('generateSummary', generateSummary)
            .addEdge(START, 'extractKeywords')
            .addEdge('extractKeywords', 'generateSummary')
            .addEdge('generateSummary', END)
            .compile();
    }

    // 文章摘要处理
    async processArticle({ article }: ArticleDto) {
        const res = await this.graph.invoke({ article });

        return {
            success: true,
            data: {
                log: res.log,
                summary: res.summary,
                keywords: res.keywords,
            },
        };
    }
}
