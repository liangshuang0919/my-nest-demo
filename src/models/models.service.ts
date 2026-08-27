import type { Response } from 'express';
import { Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';

import { ChatDto } from './dto/models.dto';
import { LangChainConfig } from '../config';

@Injectable()
export class ModelsService {
    private readonly LLM: ChatOllama;

    constructor() {
        this.LLM = new ChatOllama({
            model: LangChainConfig.ollama.model, // 模型名称
            baseUrl: LangChainConfig.ollama.baseUrl, // 模型地址
            temperature: LangChainConfig.ollama.temperature, // 温度参数
            think: false, // 是否开启思考模式，开启后模型会优先返回一个思考中的消息，等生成完成后再返回最终答案
        });
    }

    // 普通聊天，获取全量返回
    async chat({ question }: ChatDto) {
        return await this.LLM.invoke([new HumanMessage(question)])
            .then((res) => {
                return {
                    code: 200,
                    message: 'success',
                    data: {
                        question,
                        answer: res.content,
                        usage: res.usage_metadata, // token 使用情况
                    },
                };
            })
            .catch((err) => {
                return {
                    code: 500,
                    message: 'error',
                    data: err as string,
                };
            });
    }

    // 系统提示词聊天，设定系统提示词
    async chatSystem({ question, system }: ChatDto) {
        return await this.LLM.invoke([...(system ? [new SystemMessage(system)] : []), new HumanMessage(question)])
            .then((res) => {
                return {
                    code: 200,
                    message: 'success',
                    data: {
                        question,
                        answer: res.content,
                        usage: res.usage_metadata, // token 使用情况
                    },
                };
            })
            .catch((err) => {
                return {
                    code: 500,
                    message: 'error',
                    data: err as string,
                };
            });
    }

    // 流式聊天
    async chatStream({ question }: ChatDto, res: Response) {
        // 设置响应头，告诉客户端是一个流式响应
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');

        const response = await this.LLM.stream([new HumanMessage(question)]);

        // sse 固定格式：data 服务器发送的数据\n\n
        for await (const chunk of response) {
            if (chunk.content) {
                res.write(`data: ${JSON.stringify({ text: chunk.content })}\n\n`);
            }
        }

        res.write(`data: [DONE]\n\n`);
        res.end();
    }

    // 解析 AIMessage 对象，将返回的大模型结果解析成字符串
    async chatParser({ question }: ChatDto) {
        // 自动把 AIMessage 提取成纯字符串
        const chain = this.LLM.pipe(new StringOutputParser());
        // 这直接就是一个字符串
        return await chain
            .invoke([new HumanMessage(question)])
            .then((res) => {
                return {
                    code: 200,
                    message: 'success',
                    data: {
                        question,
                        answer: res,
                    },
                };
            })
            .catch((err) => {
                return {
                    code: 500,
                    message: 'error',
                    data: err as string,
                };
            });
    }
}
