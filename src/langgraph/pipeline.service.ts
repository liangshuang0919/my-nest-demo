import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { END, START, StateGraph, Annotation } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';

import { LangChainConfig } from '../config';
import { PipelineDto } from './dto/langgraph.dto';

// 定义节点
const PipelineState = Annotation.Root({
    topic: Annotation<string>(), // 用户输入主题
    research: Annotation<string>(), // 搜索内容
    outline: Annotation<string>(), // 大纲
    draft: Annotation<string>(), // 初稿
    finalArticle: Annotation<string>(), // 终稿
    // 记录过程
    process: Annotation<string[]>({
        reducer: (prev, cur) => [...prev, ...cur],
        default: () => [],
    }),
});

@Injectable()
export class PipelineService implements OnModuleInit {
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

        // 搜索主题 agent
        const researchAgent = async (state: typeof PipelineState.State) => {
            console.log('搜索主题：', state.topic);

            const res = await this.LLM.invoke([
                new HumanMessage(`
                    你是研究员，为主题"${state.topic}"收集素材：
                    1. 背景介绍（2-3 句）
                    2. 核心要点（3-5 个）
                    3. 典型案例（1-2 个）
                    每条不超过 50 字。
                `),
            ]);

            return {
                research: res.content as string,
                process: ['✅ 素材收集完成'],
            };
        };

        // 大纲
        const outlineAgent = async (state: typeof PipelineState.State) => {
            console.log('输出大纲：', state.research);

            const res = await this.LLM.invoke([
                new HumanMessage(`
                    你是内容策划，根据素材为"${state.topic}"生成大纲：
                    素材：${state.research}
                    格式：# 章节 / - 子项，共 3-5 章
                `),
            ]);

            return {
                outline: res.content as string,
                process: ['✅ 大纲生成完成'],
            };
        };

        // 初稿
        const writerAgent = async (state: typeof PipelineState.State) => {
            console.log('终稿生成：', state.outline);

            const res = await this.LLM.invoke([
                new HumanMessage(`你是撰稿人，根据大纲写文章（400-600 字）：
                    主题：${state.topic}
                    大纲：${state.outline}
                    参考素材：${state.research}
                `),
            ]);

            return {
                finalArticle: res.content as string,
                process: ['✅ 初稿写作完成'],
            };
        };

        // 终稿
        const reviewAgent = async (state: typeof PipelineState.State) => {
            console.log('初稿生成：', state.outline);

            const res = await this.LLM.invoke([
                new HumanMessage(`你是编辑，优化以下文章，直接输出优化后全文：\n${state.draft}`),
            ]);

            return {
                draft: res.content as string,
                process: ['✅ 审校优化完成'],
            };
        };

        this.graph = new StateGraph(PipelineState)
            .addNode('researchAgent', researchAgent)
            .addNode('outlineAgent', outlineAgent)
            .addNode('writerAgent', writerAgent)
            .addNode('reviewAgent', reviewAgent)
            .addEdge(START, 'researchAgent')
            .addEdge('researchAgent', 'outlineAgent')
            .addEdge('outlineAgent', 'writerAgent')
            .addEdge('writerAgent', 'reviewAgent')
            .addEdge('reviewAgent', END)
            .compile();
    }

    // 工作流九：内容创作流水线
    async pipeline({ topic }: PipelineDto) {
        const t0 = Date.now();

        const res = await this.graph.invoke({ topic });

        return {
            success: true,
            data: {
                topic,
                process: res.process,
                finalArticle: res.finalArticle,
            },
        };
    }
}
