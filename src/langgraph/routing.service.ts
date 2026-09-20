import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { END, START, StateGraph, Annotation } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';

import { LangChainConfig } from '../config';
import { RoutingDto } from './dto/langgraph.dto';

// 定义节点
const RoutingState = Annotation.Root({
    userInput: Annotation<string>(), // 用户输入
    category: Annotation<string>(), // 分类，用户写入内容，大模型对内容进行分类
    response: Annotation<string>(), // 处理各个节点的写入
});

@Injectable()
export class RoutingService implements OnModuleInit {
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

        const classify = async (state: typeof RoutingState.State) => {
            const res = await this.LLM.invoke([
                new HumanMessage(`
                    把用户问题分类，只输出类别名，不要其他内容：
                    - technical（技术、编程类的问题）
                    - pricing（价格、费用问题）    
                    - general（其他一般性问题）
                    用户问题：${state.userInput}
                `),
            ]);

            const category = (res.content as string).trim().toLowerCase();
            const valid = ['technical', 'pricing', 'general'];

            return {
                category: valid.includes(category) ? category : 'general',
            };
        };

        // 条件路由函数
        const routeByCategory = (state: typeof RoutingState.State) => state.category;

        const makeHandler = (systemPrompt: string) => async (state: typeof RoutingState.State) => {
            const res = await this.LLM.invoke([new HumanMessage(`${systemPrompt} \n\n 用户问题：${state.userInput}`)]);

            return {
                response: res.content as string,
            };
        };

        this.graph = new StateGraph(RoutingState)
            .addNode('classify', classify)
            .addNode('technical', makeHandler('你是一个技术专家，专门回答技术相关的问题'))
            .addNode('pricing', makeHandler('你是商务专员，友好地回答价格相关的问题，具体价格引导 liangshuang.com'))
            .addNode('general', makeHandler('你是客服专家，友好地回答用户的问题'))
            .addEdge(START, 'classify')
            .addConditionalEdges('classify', routeByCategory, {
                technical: 'technical',
                pricing: 'pricing',
                general: 'general',
            })
            .addEdge('technical', END)
            .addEdge('pricing', END)
            .addEdge('general', END)
            .compile();
    }

    // 工作流六：条件路由
    async routing({ input }: RoutingDto) {
        const res = await this.graph.invoke({ userInput: input });

        return {
            success: true,
            data: {
                input,
                category: res.category,
                response: res.response,
            },
        };
    }
}
