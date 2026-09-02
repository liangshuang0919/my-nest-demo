import { Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { SystemMessage, HumanMessage, ToolMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { AgentsRunDto } from './dto/agents.dto';
import { LangChainConfig } from '../config';

@Injectable()
export class AgentsService {
    private readonly LLM: ChatOllama;
    // 工具1：查询商品信息，输入参数是商品的名字，输出是一个字符串，包含商品的库存和价格信息
    private readonly checkProductTool: DynamicStructuredTool;
    // 工具2：创建订单
    private readonly createOrderTool: DynamicStructuredTool;
    // 查询订单状态
    private readonly checkOrderStatusTool: DynamicStructuredTool;
    // 申请退款
    private readonly applyRefundTool: DynamicStructuredTool;

    constructor() {
        this.LLM = new ChatOllama({
            model: LangChainConfig.ollama.model, // 模型名称
            baseUrl: LangChainConfig.ollama.baseUrl, // 模型地址
            temperature: LangChainConfig.ollama.temperature, // 温度参数
            think: false, // 是否开启思考模式，开启后模型会优先返回一个思考中的消息，等生成完成后再返回最终答案
        });

        // tool 函数：把普通 js 函数包装成模型能识别的格式
        // 参数一：工具函数
        // 参数二：工具配置信息
        this.checkProductTool = tool(
            ({ productName }: { productName: string }) => {
                // 所有商品
                const products: Record<string, { stock: number; price: number; category: string }> = {
                    'iPhone 18': { stock: 10, price: 7999, category: '手机' },
                    'iPhone 18 pro': { stock: 120, price: 9999, category: '手机' },
                    'MacBook pro': { stock: 101, price: 19999, category: '电脑' },
                    'AirPods pro': { stock: 0, price: 10099, category: '电脑' },
                    'Nike Air': { stock: 100, price: 499, category: '衣服' },
                    'Adidas Ultraboost': { stock: 10, price: 399, category: '衣服' },
                };

                const product = products[productName];

                if (!product) {
                    return `没有找到 ${productName} 的相关信息`;
                }

                if (product.stock === 0) {
                    return `${productName} 已售罄`;
                }

                return `商品名称：${productName}，库存：${product.stock}，价格：${product.price}，分类：${product.category}`;
            },
            {
                // 是工具的名称（魔性调研工具时会使用这个名称）
                name: 'check_product',
                // 是工具描述（告诉模型这个工具是干什么的）
                description: '查询商品库存和价格的工具，输入参数是商品名字，输出是一个字符串，包含商品的库存和价格信息',
                // 定义了工具的输入参数（一般都是 zod 格式，告诉模型调用这个工具时需要提供哪些参数，以及参数的类型和描述）
                schema: z.object({
                    productName: z.string().describe('要查询的商品名字'),
                }),
            },
        );

        this.createOrderTool = tool(
            ({ productName, quantity, customer }: { productName: string; quantity: number; customer: string }) => {
                // 商品价格
                const prices: Record<string, number> = {
                    'iPhone 18': 7999,
                    'iPhone 18 pro': 9999,
                    'MacBook pro': 19999,
                    'AirPods pro': 10099,
                    'Nike Air': 499,
                    'Adidas Ultraboost': 399,
                };

                const unitPrice = prices[productName];

                if (!unitPrice) {
                    return `无法创建订单，未找到产品 ${productName} 的价格信息。`;
                }

                const orderId = `ORDER-${Date.now().toString().slice(-6)}`;

                return `
                    成功创建订单：
                        订单ID ${orderId}，商品 ${productName}，数量 ${quantity}，单价 ${unitPrice}，总价 ${unitPrice * quantity}，客户 ${customer}。
                `;
            },
            {
                name: 'create_order',
                description: '查询商品库存和价格的工具，输入参数是商品名字，输出是一个字符串，包含商品的库存和价格信息',
                schema: z.object({
                    productName: z.string().describe('要创建订单的商品名称'),
                    quantity: z.string().describe('要创建订单的商品数量'),
                    customer: z.string().describe('客户的姓名'),
                }),
            },
        );

        this.checkOrderStatusTool = tool(
            ({ orderId }: { orderId: string }) => {
                // 模拟订单状态，实际项目需要查询数据库或者其他服务来获取订单状态
                const statusArr = ['待支付', '已支付', '待发货', '已发货', '已完成', '已取消'];
                // 模拟随机状态
                const status = statusArr[Math.floor(Math.random() * statusArr.length)];

                return status === '已取消' ? '订单因库存不足被取消' : `订单 ${orderId} 已被取消`;
            },
            {
                name: 'check_order_status',
                description: '查询订单状态的工具，输入参数是订单ID，输出是一个字符串，包含订单的当前状态',
                schema: z.object({
                    orderId: z.string().describe('要查询状态的订单ID，例如 ORDER-1234567890'),
                }),
            },
        );

        this.applyRefundTool = tool(
            ({ orderId, reason }: { orderId: string; reason: string }) => {
                // 这里直接返回一个字符串，模拟退款的结果，实际项目中会调用数据库嚯其他服务来处理退款申请
                const refundId = `REFUND-${Date.now().toString().slice(-6)}`;

                return `成功提交退款申请：退款ID ${refundId}，订单ID ${orderId}，申请理由 ${reason}`;
            },
            {
                name: 'apply_refund',
                description: '申请退款的工具，输入参数是订单ID和申请理由，输出是一个字符串，包含申请退款的ID和结果',
                schema: z.object({
                    orderId: z.string().describe('要查询状态的订单ID，例如 ORDER-1234567890'),
                    reason: z.string().describe('申请退款的理由'),
                }),
            },
        );
    }

    // 核心 agents 逻辑
    async AgentsRun({ question }: AgentsRunDto) {
        // 创建工具
        const tools: DynamicStructuredTool[] = [
            this.checkProductTool,
            this.createOrderTool,
            this.checkOrderStatusTool,
            this.applyRefundTool,
        ];
        const toolMap: Record<string, DynamicStructuredTool> = {
            check_product: this.checkProductTool,
            create_order: this.createOrderTool,
            check_order_status: this.checkOrderStatusTool,
            apply_refund: this.applyRefundTool,
        };

        // bindTools 方法可以把工具绑定到 llm 上，这样模型在生成回答时候可以调用这些工具了
        // 模型会根据用户的输入和对话的上下文来判断什么时候需要调用工具，以及调用哪个工具，并且把工具的输出结果整合到最终的回答中返回给用户
        const llmWithTools = this.LLM.bindTools(tools);

        // 消息历史：Agent 每一轮都能看到完整的对话 + 工具调用结果
        const messages: BaseMessage[] = [
            // 设定系统角色
            new SystemMessage(`
                你是一个「极速购」电商平台的 AI 智能客服助手，帮助用户查询商品信息、创建订单、查询订单状态和申请退款。
                你可以使用以下工具帮助客户：
                - check_product：查询商品库存和价格的工具，输入参数是商品名字，输出是一个字符串，包含商品的库存和价格信息
                - create_order：创建订单的工具，输入参数是商品名字、数量和客户姓名，输出是一个字符串，包含订单创建的结果
                - check_order_status：查询订单状态的工具，输入参数是订单ID，输出是一个字符串，包含订单的当前状态
                - apply_refund：申请退款的工具，输入参数是订单ID和申请理由，输出是一个字符串，包含申请退款的ID和结果

                工作原则：
                1. 先用工具获取真实信息，再给客户答复
                2. 下单前必须先查询库存确认有货
                3. 下单需要知道客户姓名，如果用户没说，主动询问
                4. 回答简洁友好，使用中文
            `),
            new HumanMessage(question),
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
}
