import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { ChatOllama } from '@langchain/ollama';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

import { ChatDto, ChatHistoryDto } from './dto/memory.dto';
import { LangChainConfig } from '../config';

@Injectable()
export class MemoryService {
    private readonly LLM: ChatOllama;
    // 会话缓存
    private readonly messages = new Map<string, BaseMessage[]>();
    // 对话历史助手
    private readonly systemMessage = new SystemMessage(
        '你是一个专业的智能助手，能记住对话历史，根据上下文准确的回答问题。',
    );

    // 获取会话缓存
    private getOrCreateMessages = (sessionId: string): BaseMessage[] => {
        if (!this.messages.has(sessionId)) {
            // 新会话，初始化加入 systemMessage
            this.messages.set(sessionId, [this.systemMessage]);
        }

        return this.messages.get(sessionId)!;
    };

    constructor() {
        this.LLM = new ChatOllama({
            model: LangChainConfig.ollama.model, // 模型名称
            baseUrl: LangChainConfig.ollama.baseUrl, // 模型地址
            temperature: LangChainConfig.ollama.temperature, // 温度参数
            think: false, // 是否开启思考模式，开启后模型会优先返回一个思考中的消息，等生成完成后再返回最终答案
        });
    }

    // 记忆存储会话
    async Chat({ message, sessionId }: ChatDto) {
        // 获取会话缓
        const history = this.getOrCreateMessages(sessionId);
        // 把用户新的消息加入历史
        history.push(new HumanMessage(message));

        // 把完整的历史发给模型（包含 system、历史对话、本次信息）
        const response = await this.LLM.invoke(history);
        // 把模型回复也加入历史，下次对话继续携带
        history.push(response);

        return {
            message,
            sessionId,
            reply: response.content, // 回复内容
            truns: Math.floor((history.length - 1) / 2), // 获取会话轮数
        };
    }

    // 流式记忆存储会话
    async ChatStream({ message, sessionId }: ChatDto, res: Response) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');

        const history = this.getOrCreateMessages(sessionId);
        history.push(new HumanMessage(message));

        const stream = await this.LLM.stream(history);
        let streamReply = '';

        for await (const chunk of stream) {
            if (chunk.content) {
                const text = typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content);
                streamReply += text;
                res.write(`data: ${JSON.stringify({ text, sessionId })}\n\n`);
            }
        }

        history.push(new AIMessage(streamReply));
        res.write(`data: ${JSON.stringify({ text: '[DONE]', turns: Math.floor((history.length - 1) / 2) })}\n\n`);
        res.end();
    }

    // 查看会话历史
    getHistory({ sessionId }: ChatHistoryDto) {
        const history = this.messages.get(sessionId);

        if (!history) {
            return {
                sessionId,
                exists: false,
                messages: [],
            };
        }

        const messages = history
            .filter((m) => !(m instanceof SystemMessage)) // 过滤掉系统提示内容，只保留用户和大模型回复的消息
            .map((m, i) => ({
                index: i + 1,
                role: m instanceof HumanMessage ? 'user' : 'assistant',
                content: m.content,
            }));

        return {
            messages,
            sessionId,
            exists: true,
            turns: Math.floor(messages.length / 2),
        };
    }

    // 清空会话
    clearSession(sessionId: string) {
        if (!this.messages.has(sessionId)) {
            return {
                sessionId,
                cleared: false,
                message: '会话不存在',
            };
        }

        this.messages.delete(sessionId);

        return {
            sessionId,
            cleared: true,
            message: '会话已清空',
        };
    }

    // 所有会话列表
    listSessions() {
        const sessions = Array.from(this.messages.entries()).map(([id, h]) => ({
            sessionId: id,
            turns: Math.floor((h.length - 1) / 2),
        }));

        return {
            total: sessions.length,
            sessions,
        };
    }
}
