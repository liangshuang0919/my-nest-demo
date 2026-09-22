import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { END, START, StateGraph, Annotation, Command, Send } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';

import { LangChainConfig } from '../config';
import { CodeReviewDto } from './dto/langgraph.dto';

// 代码审查节点
const ReviewState = Annotation.Root({
    code: Annotation<string>(), // 用户输入的代码
    language: Annotation<string>(), // 代码语言
    // 审查结果
    //  aspects：反馈
    // issues：问题
    // score：分数
    reviewResult: Annotation<{ aspects: string; issues: string[]; score: number }[]>({
        reducer: (prev, cur) => [...prev, ...cur],
        default: () => [],
    }),
    report: Annotation<string>(), // 报告
});

// 单行代码节点
const SingleReviewState = Annotation.Root({
    code: Annotation<string>(), // 代码
    language: Annotation<string>(), // 语言
    aspect: Annotation<string>(), // 评价
    prompt: Annotation<string>(), // 提示
});

@Injectable()
export class CodeReviewService implements OnModuleInit {
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

        // dispatch：分发agent，用 Command({ goto }) 包裹 Send 数组
        const dispatch = async (state: typeof ReviewState.State) => {
            const tasks = [
                {
                    aspect: '安全性',
                    prompt: `
                        检查代码安全问题（SQL 注入、XSS、敏感信息泄露等）。
                        输出 JSON（不要其他内容）：{ "issues": ["问题描述"], "score": 7 }
                    `,
                },
                {
                    aspect: '性能',
                    prompt: `
                        检查代码性能问题（算法复杂度、N+1 查询、内存泄漏等）。
                        输出 JSON（不要其他内容）：{ "issues": ["问题描述"], "score": 7 }
                    `,
                },
                {
                    aspect: '代码规范',
                    prompt: `
                        检查代码规范（命名、注释、DRY 原则、错误处理等）。
                        输出 JSON（不要其他内容）：{ "issues": ["问题描述"], "score": 7 }
                    `,
                },
            ];
            console.log(`\n [dispatch] 并行启动 ${tasks.length} 个审查 Agent`);

            return new Command({
                goto: tasks.map(
                    (item) =>
                        new Send('reviewAgent', {
                            code: state.code,
                            language: state.language,
                            aspect: item.aspect,
                            prompt: item.prompt,
                        }),
                ),
            });
        };

        // review agent
        const reviewAgent = async (state: typeof SingleReviewState.State) => {
            const res = await this.LLM.invoke([
                new HumanMessage(`${state.prompt}\n\n${state.language} 代码：\n\`\`\`\n${state.code}\n\`\`\``),
            ]);

            // 存放具体的问题和分数
            let parsed: { issues: string[]; score: number };

            try {
                const json = (res.content as string).replace(/```json\n?|\n?```/g, '').trim();
                parsed = JSON.parse(json);
            } catch (error) {
                parsed = { issues: ['结果解析失败'], score: 0 };
            }

            return {
                reviewResult: [{ aspect: state.aspect, ...parsed }],
            };
        };

        // 汇总
        const reportAgent = async (state: typeof ReviewState.State) => {
            const avgScore = Math.round(state.reviewResult.reduce((s, r) => s + r.score, 0) / state.reviewResult.length);
            const detail = state.reviewResult
                .map((r) => `【${r.aspects}】评分：${r.score}/10\n问题：\n${r.issues.map((i) => `  - ${i}`).join('\n')}`)
                .join('\n\n');

            const res = await this.LLM.invoke([
                new HumanMessage(`根据以下代码审查结果生成综合报告（综合评分、主要问题、改进建议）：\n\n${detail}`),
            ]);

            return { report: `综合评分：${avgScore}/10\n\n${res.content}` };
        };

        this.graph = new StateGraph(ReviewState)
            .addNode('dispatch', dispatch, { ends: ['reviewAgent'] })
            .addNode('reviewAgent', reviewAgent, { ends: ['reportAgent'] })
            .addNode('reportAgent', reportAgent)
            .addEdge(START, 'dispatch')
            .addEdge('dispatch', 'reviewAgent')
            .addEdge('reviewAgent', 'reportAgent')
            .addEdge('reportAgent', END)
            .compile();
    }

    // 工作流十：并行agent代码审查
    async codeReview({ code, language }: CodeReviewDto) {
        const t0 = Date.now();
        const result = await this.graph.invoke({ code, language });
        return {
            language,
            reviewResult: result.reviewResult,
            report: result.report,
            totalTime: `${Date.now() - t0}ms`,
        };
    }
}
