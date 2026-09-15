import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { StateGraph, MessagesAnnotation, MemorySaver, START, END } from '@langchain/langgraph';

import { LangChainConfig } from '../config';
import { SimpleChatDto, MemoryChatDto } from './dto/langgraph.dto';

@Injectable()
export class LanggraphService implements OnModuleInit {
    // 大模型
    private LLM: ChatOllama;
    // 简单对话图容器（无记忆）
    private simpleGraph: any;
    // 简单对话图容器（有记忆）
    private memoryGraph: any;

    onModuleInit() {
        // 创建 chatOllam 模型
        this.LLM = new ChatOllama({
            model: LangChainConfig.ollama.model, // 模型名称
            baseUrl: LangChainConfig.ollama.baseUrl, // 模型地址
            temperature: LangChainConfig.ollama.temperature, // 温度参数
            think: false, // 是否开启思考模式，开启后模型会优先返回一个思考中的消息，等生成完成后再返回最终答案
        });

        // 简单对话图（无记忆）
        const callModel = async (state: typeof MessagesAnnotation.State) => {
            // 无记忆简单问答，每次调用 invoke 都是全新的对话，没有上下文记忆
            const res = await this.LLM.invoke(state.messages);

            return { messages: [res] };
        };

        // 初始化简单对话图（无记忆）
        this.simpleGraph = new StateGraph(MessagesAnnotation)
            .addNode('callModel', callModel)
            .addEdge(START, 'callModel')
            .addEdge('callModel', END)
            .compile();

        // 简单对话图（有记忆）
        const callModelWithMemory = async (state: typeof MessagesAnnotation.State) => {
            const messages = [new SystemMessage('你是专业的 AI 助手，请记住对话上下文。'), ...state.messages];
            const res = await this.LLM.invoke(messages);

            return { messages: [res] };
        };

        // 初始化简单对话图（有记忆）
        this.memoryGraph = new StateGraph(MessagesAnnotation)
            .addNode('callModel', callModelWithMemory)
            .addEdge(START, 'callModel')
            .addEdge('callModel', END)
            .compile({ checkpointer: new MemorySaver() });
    }

    // 工作流一：简单回答（无记忆）
    async simpleChat({ question }: SimpleChatDto) {
        const result = await this.simpleGraph.invoke({
            messages: [new SystemMessage('你是专业的 AI 助手，回答简洁清晰。'), new HumanMessage(question)],
        });

        return {
            success: true,
            data: result?.messages?.at(-1)?.content || '没有回答',
        };
    }

    // 工作流二：简单回答（有记忆，多轮对话）
    async memoryChat({ threadId, question }: MemoryChatDto) {
        const result = await this.memoryGraph.invoke(
            { messages: [new HumanMessage(question)] },
            // 每一个 thread_id 对应一个独立的对话上下文
            { configurable: { thread_id: threadId } },
        );

        return {
            success: true,
            data: result?.messages?.at(-1)?.content || '没有回答',
        };
    }

    // 工作流三：获取会话历史
    async getHistory(threadId: string) {
        const result = await this.memoryGraph.getState({
            configurable: { thread_id: threadId },
        });

        return {
            success: true,
            data: (result.values.messages ?? []).map((item) => ({
                role: item._getType?.() === 'human' ? 'user' : 'assistant',
                content: item.content,
            })),
        };
    }
}
