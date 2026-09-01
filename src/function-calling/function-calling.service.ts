import { Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { LoadFCDto } from './dto/function-calling.dto';
import { LangChainConfig } from '../config';

@Injectable()
export class FunctionCallingService {
    private readonly LLM: ChatOllama;
    // 工具1：查询商品信息，输入参数是商品的名字，输出是一个字符串，包含商品的库存和价格信息
    private readonly checkProductTool: DynamicStructuredTool;
    // 工具2：创建订单
    private readonly createOrderTool: DynamicStructuredTool;
    // 查询订单状态
    private readonly checkOrderStatusTool: DynamicStructuredTool;

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
    }

    // 加载 function calling
    async FCLoad({ messaage }: LoadFCDto) {
        const tools = [this.checkProductTool, this.createOrderTool, this.checkOrderStatusTool];
        const toolMap: Record<string, DynamicStructuredTool> = {
            check_product: this.checkProductTool,
            create_order: this.createOrderTool,
            check_order_status: this.checkOrderStatusTool,
        };

        const llmWithTools = this.LLM.bindTools(tools);
        const messages: BaseMessage[] = [new HumanMessage(messaage)];
        const toolCallLog: any[] = [];

        for (let round = 0; round < 3; round++) {
            const response = await llmWithTools.invoke(messages);
            messages.push(response);

            if (!response.tool_calls || response.tool_calls.length === 0) {
                break;
            }

            for (const toolCall of response.tool_calls) {
                const toolFn = toolMap[toolCall.name];
                if (!toolFn) continue;

                const result = await toolFn.invoke(toolCall.args);

                toolCallLog.push({
                    tool: toolCall.name,
                    args: toolCall.args,
                    result,
                });

                messages.push(new ToolMessage({ content: result, tool_call_id: toolCall.id ?? '' }));
            }
        }

        const lastMsg = [...messages].reverse().find((m) => m.constructor.name === 'AIMessage');

        return {
            messaage,
            toolCalls: toolCallLog, // 调用了哪些工具、参数和结果
            finalAnswer: lastMsg?.content || '处理完成',
        };
    }
}
