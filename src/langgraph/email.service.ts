import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { END, START, StateGraph, Annotation, interrupt, MemorySaver, Command } from '@langchain/langgraph';
import { SystemMessage } from '@langchain/core/messages';

import { LangChainConfig } from '../config';
import { EmailStartDto, EmailModifyDto } from './dto/langgraph.dto';

// 定义节点
const EmailState = Annotation.Root({
    emailRequest: Annotation<string>(), // email 请求
    // 邮件内容
    // subject 邮件主题
    // recipient 收件人
    // body 邮件内容
    draftEmail: Annotation<{ subject: string; recipient: string; body: string }>(),
    approvalStatus: Annotation<'pending' | 'approved' | 'rejected' | 'need_modify'>(), // 审查状态
    modifyFeedback: Annotation<string>(), // 修改意见
    // 次数
    revisionCount: Annotation<number>({
        reducer: (prev) => prev + 1,
        default: () => 0,
    }),
    finalStatus: Annotation<string>(), // 最终状态
});

@Injectable()
export class EmailService implements OnModuleInit {
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

        // 节点1：草拟邮件
        const draftAgent = async (state: typeof EmailState.State) => {
            // 获取是否为第一次草拟邮件
            const isRevision = !!state.modifyFeedback;
            console.log(
                `\n [draftAgent] ${isRevision ? '根据反馈意见修改邮件草稿' : '初次草拟'}，当前已修改 ${state.revisionCount} 次`,
            );

            // 提示词
            const prompt = isRevision
                ? `根据以下反馈修改邮件草稿：
                    修改建议：${state.modifyFeedback}
                    原始需求：${state.emailRequest}
                    上次草稿：${JSON.stringify(state.draftEmail)}`
                : `请根据以下请求草拟一封邮件：${state.emailRequest}`;

            const res = await this.LLM.invoke([
                new SystemMessage(
                    `\n${prompt}\n\n请输出 JSON 格式的邮件草稿：{"subject": "邮件主题","recipient":"收件人","body":"邮件内容"}`,
                ),
            ]);

            let draft: { subject: string; recipient: string; body: string };
            try {
                const json = (res.content as string).replace(/```json\n?|\n?```/g, '').trim();
                draft = JSON.parse(json);
            } catch {
                draft = { subject: '草稿', recipient: '未知', body: res.content as string };
            }

            console.log(`收件人: ${draft.recipient}，主题: ${draft.subject}`);

            return {
                draftEmail: draft,
                approvalStatus: 'pending' as const,
                revisionCount: 0,
                finalStatus: isRevision ? 1 : 0,
            };
        };

        // 节点2：等待人工审批（interrupt 暂停）
        const waitAgent = async (state: typeof EmailState.State) => {
            console.log(`\n⏸️ [waitAgent] 等待人工审批（第 ${state.revisionCount + 1} 版）`);

            // 写暂停逻辑
            const decision = interrupt({
                type: 'email_review', // 类型
                message: `请审查邮件草稿，当前状态：${state.approvalStatus}，第 ${state.revisionCount + 1} 版。`,
                draft: state.draftEmail,
                options: {
                    approve: '批准发送',
                    reject: '拒绝（取消发送）',
                    modify: '需要修改（附修改意见）',
                },
            });

            console.log(`人工审批结果: ${JSON.stringify(decision)}`);

            if (typeof decision === 'string') {
                return {
                    approvalStatus: decision,
                };
            }
            if (typeof decision === 'object' && decision?.action === 'modify') {
                return {
                    approvalStatus: 'need_modify',
                    modifyFeedback: decision.feedback,
                };
            }

            return {
                approvalStatus: 'rejected',
            };
        };

        // 节点3：发送邮件
        const sendAgent = async (state: typeof EmailState.State) => {
            console.log(`\n📤 [sendNode] 发送邮件`);
            console.log(`   收件人: ${state.draftEmail.recipient}`);
            console.log(`   主题:   ${state.draftEmail.subject}`);

            return {
                finalStatus: `✅ 邮件已发送\n收件人：${state.draftEmail.recipient}\n主题：${state.draftEmail.subject}`,
            };
        };

        // 节点4：取消发送
        const cancelAgent = async (state: typeof EmailState.State) => {
            console.log(`\n🚫 [cancelNode] 邮件已取消，状态: ${state.approvalStatus}`);

            return {
                finalStatus: `❌ 邮件已取消（审批状态：${state.approvalStatus}）`,
            };
        };

        // 路由函数：根据审批结果到不同的节点
        const routeAfterApproval = async (state: typeof EmailState.State) => {
            console.log(`\n🔀 [route] approvalStatus = ${state.approvalStatus}`);
            switch (state.approvalStatus) {
                // 发送
                case 'approved':
                    return 'sendAgent';
                // 草稿
                case 'need_modify':
                    return 'draftAgent'; // 回到起草节点重新起草
                // 取消
                default:
                    return 'cancelAgent';
            }
        };

        this.graph = new StateGraph(EmailState)
            .addNode('draftAgent', draftAgent)
            .addNode('waitAgent', waitAgent)
            .addNode('sendAgent', sendAgent)
            .addNode('cancelAgent', cancelAgent)
            .addEdge(START, 'draftAgent')
            .addEdge('draftAgent', 'waitAgent')
            .addConditionalEdges('waitAgent', routeAfterApproval, {
                sendAgent: 'sendAgent',
                draftAgent: 'draftAgent',
                cancelAgent: 'cancelAgent',
            })
            .addEdge('sendAgent', END)
            .addEdge('cancelAgent', END)
            .compile({ checkpointer: new MemorySaver() });

        console.log('✅ 邮件审批工作流初始化完成');
    }

    // 工作流十一：人工审查邮件 -- 开始发送
    async emailStart({ request, threadId }: EmailStartDto) {
        console.log(`\n🚀 启动邮件审批流程，线程 ID：${threadId}`);
        const t0 = Date.now();
        const res = await this.graph.invoke(
            { emailRequest: request },
            {
                configurable: { thread_id: threadId },
            },
        );

        // 如果包含 __interrupted__，表示流程被中断，等待审批
        if (res.__interrupted__) {
            return {
                status: 'waiting_for_approval',
                threadId,
                reviewData: res.__interrupted__[0].value, // 包含审批相关数据（如草稿内容，审批选项等）
                message: '邮件草稿已生成，正在等待人工审批，请前往审批界面进行操作',
            };
        }

        return {
            status: 'completed',
            data: {
                threadId,
                result: res,
            },
        };
    }

    // 工作流十一：人工审查邮件 -- 审批
    async emailApprove(threadId: string) {
        console.log(`\n✅ [email/approve] threadId: ${threadId}`);

        const res = await this.graph.invoke(
            new Command({
                resume: 'approved',
            }),
            {
                configurable: { thread_id: threadId },
            },
        );

        // 获取状态
        const state = await this.graph.getState({
            configurable: { thread_id: threadId },
        });

        return {
            status: 'email_send',
            finalStatus: state.values.finalStatus,
        };
    }

    // 工作流十一：人工审查邮件 -- 拒绝
    async emailReject(threadId: string) {
        console.log(`\n❌ [email/reject] threadId: ${threadId}`);

        const res = await this.graph.invoke(
            new Command({
                resume: 'canceled',
            }),
            {
                configurable: { thread_id: threadId },
            },
        );

        return {
            status: 'canceled',
            message: '邮件审批已驳回，流程已取消',
            data: res,
        };
    }

    // 工作流十一：人工审查邮件 -- 修改
    async emailModify(threadId: string, { feedback }: EmailModifyDto) {
        console.log(`\n✏️ [email/modify] threadId: ${threadId}`);

        const res = await this.graph.invoke(
            new Command({
                resume: { action: 'modify', feedback },
            }),
            {
                configurable: { thread_id: threadId },
            },
        );

        if (res.__interrupted__) {
            return {
                status: 'waiting_for_approval',
                threadId,
                reviewData: res.__interrupted__[0].value, // 包含审批相关数据（如草稿内容，审批选项等）
                message: '修改建议已提交，正在等待人工审批，请前往审批界面进行操作',
            };
        }

        return {
            status: 'canceled',
            message: '修改已提交并通过审批，流程继续进行',
        };
    }

    // 工作流十一：人工审查邮件 -- 获取状态
    async emailStatus(threadId: string) {
        console.log(`\n [emailStatus] 查询流程状态，线程ID：${threadId}`);

        const res = await this.graph.getState({
            configurable: { thread_id: threadId },
        });

        console.log(`当前状态：${res.values}`);

        if (!res) {
            return {
                status: 'not_found',
                message: '未找到对应的审批流程，请检查线程 ID 是否正确',
            };
        }

        return {
            status: 'in_progress',
            threadId,
            currentState: res.values,
            message: `当前审批状态：${res.values.approvalStatus}，已修改次数：${res.values.revisionCount}`,
        };
    }
}
