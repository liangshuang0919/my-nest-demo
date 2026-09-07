import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { SystemMessage, HumanMessage, ToolMessage, AIMessage, BaseMessage } from '@langchain/core/messages';

import { LangChainConfig } from '../config';
import { RunToolDto } from './dto/mcp-agent';
import { object } from 'zod';

@Injectable()
export class McpAgentService implements OnModuleInit, OnModuleDestroy {
    private readonly LLM: ChatOllama;
    // MultiServerMCPClient 是一个适配器，允许我们在 langchain 中使用 MCP 协议与多个服务器进行通信
    // 他提供了一个统一的接口，让我们可以轻松地调用不同服务器上的工具，而不需要关心底层的通信细节
    private mcpClient: MultiServerMCPClient;
    // 从 mcp 服务端获取所有的工具列表
    private mcpTools: any[];

    constructor() {
        this.LLM = new ChatOllama({
            model: LangChainConfig.ollama.model, // 模型名称
            baseUrl: LangChainConfig.ollama.baseUrl, // 模型地址
            temperature: LangChainConfig.ollama.temperature, // 温度参数
            think: false, // 是否开启思考模式，开启后模型会优先返回一个思考中的消息，等生成完成后再返回最终答案
        });
    }

    async onModuleInit() {
        this.mcpClient = new MultiServerMCPClient({
            // 连接配置，可以同时连接多个 mcp 服务器
            // 这里以一个名为 local-tools，实际使用中可以根据需要命名
            mcpServers: {
                // 自定义本地的 mcp 服务器，使用 stdio 方式通知，是用于与独立的 mcp 服务进程通信
                'local-tools': {
                    transport: 'stdio', // 使用进程的方式
                    command: 'ts-node', // 运行命令
                    args: ['src/mcp-server/server.ts'],
                    env: { ...process.env } as Record<string, string>,
                },
                // 还可以添加其他服务的连接配置，例如：社区现成的 mcp 服务
                // 'filesystem-tool': {
                //   transport: 'stdio',
                //   command: 'npx',
                //   args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
                // },
            },
        });

        // 那所有 mcp server 的工具转成统一的格式，存储在 mcptools 变量中，方便后续调用
        this.mcpTools = await this.mcpClient.getTools();
    }

    // 获取所有工具
    async getTools() {
        return this.mcpTools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.schema,
        }));
    }

    // 调用工具
    // 核心 agents 逻辑
    async runTools({ message }: RunToolDto) {
        if (!this.mcpTools.length) {
            return {
                success: false,
                data: '没有可以调用的工具',
            };
        }

        // bindTools 方法可以把工具绑定到 llm 上，这样模型在生成回答时候可以调用这些工具了
        // 模型会根据用户的输入和对话的上下文来判断什么时候需要调用工具，以及调用哪个工具，并且把工具的输出结果整合到最终的回答中返回给用户
        const llmWithTools = this.LLM.bindTools(this.mcpTools);
        // 把工具列表转成一个映射表，方便根据工具名称找到对应的工具函数
        const toolMap = Object.fromEntries(this.mcpTools.map((tool) => [tool.name, tool]));

        // 消息历史：Agent 每一轮都能看到完整的对话 + 工具调用结果
        const messages: any[] = [
            // 设定系统角色
            new SystemMessage(`
                你是一个智能助手，可以使用以下工具帮助用户：
                - query_database：查询用户数据库
                - read_file：读取项目文件
                - query_weather：查询城市天气

                根据用户的问题，选择合适的工具获取信息后回答。用中文回答。
            `),
            new HumanMessage(message),
        ];

        // 记录一下没部执行的过程（用于前端展示 调试）
        const steps: string[] = [];
        let roundCount = 0;

        // 定义一个递归函数来处理模型的回答和工具调用
        // 限制最大轮数为 5 轮，防止死循环
        while (roundCount < 6) {
            roundCount++;
            console.log(`Agent 第 ${roundCount} 轮`);

            // 获取模型的回答
            const response = await llmWithTools.invoke(messages);
            messages.push(response);

            // 注册成功后，模型回复里面会包含 tool_calls 字段，告诉我们模型调用哪些工具，以及调用参数
            // 当返回的 tool_calls 字段为空时，说明模型有了最终答案，直接返回结果给用户，退出循环
            if (!response.tool_calls || response.tool_calls.length === 0) {
                steps.push(`【最终回答】模型回答：${JSON.stringify(response.content)}`);
                break;
            }

            for (const toolCall of response.tool_calls) {
                steps.push(`【调用工具】模型调用工具：${toolCall.name}，参数：${JSON.stringify(toolCall.args)}。`);
                console.log(toolCall);

                // 从工具映射表中找到对应的工具函数
                const toolFun = toolMap[toolCall.name];

                if (!toolFun) {
                    const errMsg = `未找到工具函数：${toolCall.name}`;
                    steps.push(`【错误】${errMsg}`);
                    messages.push(new ToolMessage({ content: errMsg, tool_call_id: toolCall.id ?? '' }));
                    continue;
                }

                // 调用工具函数，获取结果
                const toolResult: unknown = await toolFun.invoke(toolCall.args);
                const toolResultText = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
                steps.push(`【调用结果】工具返回结果：${toolResultText}`);
                console.log(`工具执行结果：${toolResultText}`);

                // 把工具调用结果作为新的消息添加到消息历史中，让模型在下一轮回答时可以看到这个结果
                messages.push(new ToolMessage({ content: toolResultText, tool_call_id: toolCall.id ?? '' }));
            }
        }

        // 返回最终的回答
        const finalResponse: AIMessage | string =
            [...messages].reverse().find((msg): msg is AIMessage => AIMessage.isInstance(msg)) ??
            '很抱歉，我无法处理您的需求。';

        return {
            steps, // 调试信息
            messages, // 消息历史
            totalrounds: roundCount, // 总轮数
            answer: finalResponse instanceof AIMessage ? finalResponse.content : finalResponse, // 最终的回答
        };
    }

    async onModuleDestroy() {
        await this.mcpClient.close();
    }
}
