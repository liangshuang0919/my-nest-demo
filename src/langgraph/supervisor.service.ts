import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { END, START, StateGraph, Annotation, Command, Send, task, MessagesAnnotation } from '@langchain/langgraph';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';

import { LangChainConfig } from '../config';
import { SupervisorDto } from './dto/langgraph.dto';

// 定义节点
const SupervisorState = Annotation.Root({
    messages: MessagesAnnotation.spec.messages, // 用户输入
    nextAgent: Annotation<string>(), // 决定调用哪一个 agent
    // 合并所有 agent 信息
    completedAgents: Annotation<string[]>({
        reducer: (prev, cur) => [...prev, ...cur],
        default: () => [],
    }),
});

@Injectable()
export class SupervisorService implements OnModuleInit {
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

        // supervisor 节点，让大模型决定下一步调用哪个 agent
        const supervisor = async (state: typeof SupervisorState.State) => {
            const done = state.completedAgents.length ? `已完成：${state.completedAgents.join('、')}` : '尚未调用任何 Agent';

            const res = await this.LLM.invoke([
                new SystemMessage(`你是任务协调者，管理以下专业 Agent：
                    - researcher：收集信息、搜索资料
                    - analyst：数据分析、逻辑推理
                    - writer：撰写报告、优化表达
                    
                    规则：
                    1. 根据任务需求按需选择 Agent
                    2. ${done}
                    3. 所有必要工作完成后输出 FINISH
                    4. 只输出下一个 Agent 名称或 FINISH，不要其他内容
                    
                    可选值：researcher | analyst | writer | FINISH`),
                ...state.messages,
            ]);

            const next = (res.content as string).trim();
            const valid = ['researcher', 'analyst', 'writer', 'FINISH'];
            const safeNext = valid.includes(next) ? next : 'FINISH';

            return {
                nextAgent: safeNext,
                // 把调度决定记录到消息历史，让 Worker 有上下文
                messages: [new AIMessage(`[Supervisor] 下一步 → ${safeNext}`)],
            };
        };
        // 路由函数：以 FINISH 结束，否则路由到对应的 Agent
        const routeToAgent = (state: typeof SupervisorState.State) => (state.nextAgent === 'FINISH' ? END : state.nextAgent);

        // 工厂函数，根据 Agent 名称创建对应的 Agent
        // name: Agent 名称
        // systemPrompt: 系统提示词
        const createWorker = (name: string, systemPrompt: string) => async (state: typeof SupervisorState.State) => {
            // 取第一条用户消息作为任务描述
            const userMsg = state.messages.find((m) => m._getType?.() === 'human');
            // 取最近 4 条消息作为上下文（包含其他 Agent 的输出）
            const context = state.messages
                .slice(-4)
                .map((m) => m.content)
                .join('\n');

            const res = await this.LLM.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`原始任务：${userMsg?.content ?? ''}\n\n当前上下文：\n${context}`),
            ]);

            return {
                messages: [new AIMessage(`[${name}] ${res.content}`)],
                completedAgents: [name],
            };
        };

        this.graph = new StateGraph(SupervisorState)
            .addNode('supervisor', supervisor)
            .addNode('researcher', createWorker('researcher', '你是研究员，擅长收集整理信息，提供详细调研结果。'))
            .addNode('analyst', createWorker('analyst', '你是分析师，擅长数据分析，提供洞察和建议。'))
            .addNode('writer', createWorker('writer', '你是写作专家，把信息整理成清晰专业的报告。'))
            .addEdge(START, 'supervisor')
            .addConditionalEdges('supervisor', routeToAgent, {
                researcher: 'researcher',
                analyst: 'analyst',
                writer: 'writer',
                [END]: END,
            })
            // 所有 Worker 完成后都回到 supervisor，让它决定下一步
            .addEdge('researcher', 'supervisor')
            .addEdge('analyst', 'supervisor')
            .addEdge('writer', 'supervisor')
            .compile();
    }

    // 工作流八：监督模式
    async supervisor({ input }: SupervisorDto) {
        const result = await this.graph.invoke({ messages: [new HumanMessage(input)] }, { recursionLimit: 30 });

        const messages = result.messages as AIMessage[];
        const agentLog = messages
            .filter((m) => typeof m.content === 'string' && m.content.startsWith('['))
            .map((m) => m.content as string);

        const writerOutputs = agentLog.filter((l) => l.startsWith('[writer]'));
        const finalReport = writerOutputs.length
            ? writerOutputs.at(-1)!.replace('[writer] ', '')
            : (agentLog.at(-1) ?? '无输出');

        return {
            agentLog,
            completedAgents: result.completedAgents,
            finalReport,
        };
    }
}
