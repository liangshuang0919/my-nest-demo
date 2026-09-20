import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { END, START, StateGraph, Annotation, Command, Send, task } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';

import { LangChainConfig } from '../config';
import { ParallerDto } from './dto/langgraph.dto';

// 定义节点
const ParallelState = Annotation.Root({
    task: Annotation<string>(), // 要执行的任务
    results: Annotation<{ task: string; result: string }[]>({
        reducer: (prev, cur) => [...prev, ...cur],
        default: () => [],
    }),
    finalReport: Annotation<string>(), // 汇总
});

// 子图 state：每个子任务的输入输出
const subState = Annotation.Root({
    task: Annotation<string>(), // 要执行的任务
});

@Injectable()
export class ParallelService implements OnModuleInit {
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

        // 拆分节点
        const splitTask = async (state: typeof ParallelState.State) => {
            const res = await this.LLM.invoke([
                new HumanMessage(`
                    请把以下任务拆解成三个独立的子任务：\n\n${state.task}\n\n
                    要求：
                    1. 每个子任务单独一行，不要编号，不超过100个字
                `),
            ]);
            console.log('拆分的任务：', res);

            const subTasks = (res.content as string)
                .split('\n')
                .map((t) => t.trim())
                .filter(Boolean)
                .slice(0, 3);

            subTasks.forEach((item, index) => console.log(`子任务${index + 1}：${item}`));

            return new Command({
                goto: subTasks.map((item) => new Send('processSubTask', { task: item })),
            });
        };

        // 子任务节点，多个实例并行运行
        const processSubTask = async (state: typeof subState.State) => {
            console.log('处理子任务：', state.task);

            const res = await this.LLM.invoke([
                new HumanMessage(`
                    请完成以下子任务：\n\n${state.task}\n\n
                    要求：
                    1. 100子以内
                `),
            ]);

            console.log('子任务结果：', res);

            return {
                results: [{ task: state.task, result: res.content as string }],
            };
        };

        // 汇总子任务
        const mergeSubTasks = async (state: typeof ParallelState.State) => {
            console.log('要汇总的所有子任务', state.results);
            const text = state.results.map((item) => `子任务：${item.task}\n结果：${item.result}`).join('\n\n');

            const res = await this.LLM.invoke([
                new HumanMessage(`
                    请根据以下子任务结果，生成最终报告：\n\n${text}\n\n
                    要求：
                    1. 300字以内
                `),
            ]);

            return {
                finalReport: res.content as string,
            };
        };

        this.graph = new StateGraph(ParallelState)
            .addNode('splitTask', splitTask, { ends: ['processSubTask'] })
            .addNode('processSubTask', processSubTask, { ends: ['mergeSubTasks'] })
            .addNode('mergeSubTasks', mergeSubTasks)
            .addEdge(START, 'splitTask')
            .addEdge('processSubTask', 'mergeSubTasks')
            .addEdge('mergeSubTasks', END)
            .compile();
    }

    async parallel({ task }: ParallerDto) {
        const t0 = Date.now();

        const res = await this.graph.invoke({ task });

        const time = (Date.now() - t0) / 1000;

        return {
            success: true,
            data: {
                time,
                task,
                subTasks: res.results.map((item) => ({ task: item.task, result: item.result })),
                results: res.results,
                finalReport: res.finalReport,
            },
        };
    }
}
