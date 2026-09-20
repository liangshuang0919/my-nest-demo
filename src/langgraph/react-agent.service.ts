import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { MessagesAnnotation, END, START, StateGraph, MemorySaver } from '@langchain/langgraph';
import { AIMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';

import { LangChainConfig } from '../config';
import { ReactChatDto } from './dto/langgraph.dto';

// 工具1：计算器工具。输入一个数学表达式，输出计算结果
const calculatorTool = tool(
    async ({ expression }: any) => {
        try {
            const result = await Function(`"use strict"; return (${expression})`)();

            return {
                result: `计算结果：${expression} = ${result}`,
            };
        } catch (error) {
            return {
                result: `计算错误：${error.message}`,
            };
        }
    },
    {
        name: 'calculator',
        description: '一个计算工具，输入一个数字表达式，输出计算结果，例如：{ "expression": "1 + 2 = 3" }',
        schema: z.object({
            expression: z.string().describe('一个数学表达式，例如："1 + 2 = 3"'),
        }),
    },
);

// 工具2：查询天气的工具
const weatherTool = tool(
    async ({ city }: any) => {
        try {
            const mock: Record<string, string> = {
                北京: '北京天气为晴天，温度为 25 度。',
                上海: '上海天气为晴天，温度为 28 度。',
                广州: '广州天气为多云，温度为 27 度。',
                深圳: '深圳天气为阴天，温度为 25.5 度。',
                杭州: '杭州天气为雷阵雨，温度为 23.5 度。',
                南京: '南京天气为晴天，温度为 26.5 度。',
            };

            return {
                result: mock[city] ? `查询结果：${city}的天气为 ${mock[city]}` : '未知',
            };
        } catch (error) {
            return {
                result: `天气查询错误：${error.message}`,
            };
        }
    },
    {
        name: 'weather',
        description: '一个天气查询工具，输入城市名称，输出天气信息，例如：{ "city": "上海" }',
        schema: z.object({
            city: z.string().describe('要查询天气的城市名称'),
        }),
    },
);

// 工具列表
const tools = [calculatorTool, weatherTool];

@Injectable()
export class ReactAgentService implements OnModuleInit {
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

        // 绑定工具
        // bindTools 方法是将工具的 name、description、schema 绑定到模型中，让模型知道那些工具可以调用，以及如何调用这些工具
        // 大模型推理知道有哪些工具可调用，需要的时候自动生成 tool_calls 来调用工具，拿到工具技术后继续推理生成最终回答
        const llmWithTools = this.LLM.bindTools(tools);

        // ToolNode 封装执行大模型返回的 tool_calls 的逻辑，自动调用对应工具，获取结果，并把结果返回给大模型继续推理
        const toolNode = new ToolNode(tools);

        // 大模型调用工具的逻辑
        const callModel = async (state: typeof MessagesAnnotation.State) => {
            const messages = [
                new SystemMessage(
                    `
                        你是一个专业的 ai 助手，能够实用工具来回答用户的问题，可用工具：
                            - calculator：一个计算工具，输入一个数字表达式，输出计算结果。例如：{ "expression": "1 + 2 = 3" }
                            - weather：一个查询天气的工具，输入城市名称，输出该城市的天气信息。例如：{ "city": "北京" }
                    `,
                ),
                ...state.messages,
            ];

            const result = await llmWithTools.invoke(messages);

            return {
                success: true,
                messages: [result],
            };
        };

        // 判断是否需要继续推理的逻辑
        const shouldContinue = async (state: typeof MessagesAnnotation.State) => {
            // 获取模型返回的最后一个消息
            const last = state.messages.at(-1) as AIMessage;

            // 如果最后一个消息还包含 tool_calls，并且不为空，则说明模型需要调用工具，继续执行，否则模型推理结束
            return (last.tool_calls?.length ?? 0) ? 'tools' : END;
        };

        this.graph = new StateGraph(MessagesAnnotation)
            .addNode('callModel', callModel)
            .addNode('tools', toolNode)
            .addEdge(START, 'callModel')
            .addConditionalEdges('callModel', shouldContinue, {
                tools: 'tools',
                [END]: END,
            })
            .addEdge('tools', 'callModel') // 工具执行完 → 回到 LLM，形成循环
            .compile({ checkpointer: new MemorySaver() });
    }

    // 工作流五：react-agent 循环
    async reactChat({ message, threadId }: ReactChatDto) {
        const result = await this.graph.invoke(
            { messages: [new HumanMessage(message)] },
            {
                configurable: { thread_id: threadId },
                recursionLimit: 10, // 设置递归层数，防止死循环
            },
        );

        return {
            success: true,
            data: result?.messages?.at(-1)?.content || '没有回答',
        };
    }
}
