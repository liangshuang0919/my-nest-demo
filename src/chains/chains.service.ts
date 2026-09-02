import { Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';

import { PolishDto, BlogDto, CategoryDto } from './dto/chains.dto';
import { LangChainConfig } from '../config';

@Injectable()
export class ChainsService {
    private readonly LLM: ChatOllama;

    constructor() {
        this.LLM = new ChatOllama({
            model: LangChainConfig.ollama.model, // 模型名称
            baseUrl: LangChainConfig.ollama.baseUrl, // 模型地址
            temperature: LangChainConfig.ollama.temperature, // 温度参数
            think: false, // 是否开启思考模式，开启后模型会优先返回一个思考中的消息，等生成完成后再返回最终答案
        });
    }

    // 润色文章
    // 多步执行，每一步的输出都可以作为下一步的输入，适合需要分布处理的复杂任务
    // 例如润色文章：
    // 第一步先对文章进行分析，提取出文章的主体、风格、存在的问题等关键信息
    // 第二步根据第一步的分析结果对文章进行润色，改进文章的表达、结构、用词等方面，使文章更加流畅、清晰、有吸引力
    async chainsPolish({ article }: PolishDto) {
        // 文章分析助手
        const analysisPrompt = ChatPromptTemplate.fromMessages([
            ['system', '你是一个文章分析助手，只输出问题列表，不需要其他的内容。'],
            ['human', '分析这篇文章存在的问题：{article}'],
        ]);

        // 文章润色助手
        const polishPrompt = ChatPromptTemplate.fromMessages([
            [
                'system',
                '你是一个文章润色助手，根据输出的问题列表对文章进行润色，改进文章的表达、结构、用词等方面，是文章更加流畅、清晰、有吸引力。',
            ],
            ['human', '根据以下分析结果润色这篇文章：{analysis}，文章内容是：{article}'],
        ]);

        // 第一条 chain：article 文章 -> analysis 分析
        const analysisChain = analysisPrompt.pipe(this.LLM).pipe(new StringOutputParser());

        // 第二条 chain：article 润色后的文章 -> polished 润色后的文章
        // 第一步：保留原文 article + 调用 analysisChain 得到的 analysis 字符串
        // 第二步：（analysis 字符串 + article 原文）-> polished 润色后的文章
        // RunnableSequence 可以吧多个 chain 串联起来，前一个 chain 的输出会作为下一个 chain 的输入
        const chain = RunnableSequence.from([
            {
                article: new RunnablePassthrough(), // 保留原文
                analysis: analysisChain, // 调用 analysisChain 得到的 analysis 字符串
            },
            // 润色后的文章
            polishPrompt.pipe(this.LLM).pipe(new StringOutputParser()),
        ]);

        return await chain
            .invoke({
                article,
            })
            .then((res) => {
                return {
                    code: 200,
                    message: 'success',
                    data: {
                        article,
                        polish: res,
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

    // 生成博客
    // 用户传过来一个关键词，生成大纲，根据大纲再生成博客，然后生成 seo 标题
    // 关键词 -> 大纲 -> 博客 -> seo 标题
    async chainsBlog({ keywords, style }: BlogDto) {
        try {
            // 生成大纲
            const outlinePrompt = ChatPromptTemplate.fromMessages([
                ['system', '你是一个专业的博客大纲生成助手，根据用户提供的关键词和风格生成一篇博客文章大纲。'],
                ['human', '请根据以下关键词和风格生成一篇博客文章大纲，关键词：\n{keywords}，\n风格：{style}'],
            ])
                .pipe(this.LLM)
                .pipe(new StringOutputParser());
            // 大纲结果
            const outlineRes = await outlinePrompt.invoke({ keywords, style });

            // 生成文章
            const articlePrompt = ChatPromptTemplate.fromMessages([
                ['system', '你是一个专业的博客文章生成助手，根据用户提供的关键词和风格生成一篇博客文章。'],
                ['human', '请根据以下博客大纲和风格生成一篇博客文章，播客大纲：\n{outline}'],
            ])
                .pipe(this.LLM)
                .pipe(new StringOutputParser());
            // 文章结果
            const articleRes = await articlePrompt.invoke({ outline: outlineRes });

            // 生成 seo 标题
            const setTitlePrompt = ChatPromptTemplate.fromMessages([
                ['system', '你是一个专业的SEO标题生成助手，根据用户提供的关键词和风格生成3个SEO标题。'],
                ['human', '请根据以下博客文章和风格生成3个SEO标题，博客文章内容：\n{article}'],
            ])
                .pipe(this.LLM)
                .pipe(new StringOutputParser());
            // seo 标题结果
            const seoTitleRes = await setTitlePrompt.invoke({ article: articleRes });

            return {
                code: 200,
                data: {
                    outlineRes,
                    articleRes,
                    seoTitleRes,
                },
            };
        } catch (err) {
            return {
                code: 500,
                success: false,
                message: (err as Error).message,
                data: null,
            };
        }
    }

    // 条件链路
    // 用户输入一个问题，模型会根据问题的内容和类型来判断应该调用哪个功能模块来处理这个问题，比如翻译、总结、分类等
    async chainsCategory({ question }: CategoryDto) {
        // 第一步，分类
        const categoryPrompt = ChatPromptTemplate.fromMessages([
            [
                'system',
                `分析用户的问题，只输出分类标签：
                    技术问题-TECH
                    退款问题-REFUND
                    订单问题-ORDER
                    投诉建议-COMPLAINT
                    其他-OTHER
                `,
            ],
            ['human', '{question}'],
        ])
            .pipe(this.LLM)
            .pipe(new StringOutputParser());

        // 拿到分类
        const category = await categoryPrompt.invoke({
            question,
        });

        // 第二步，根据分类标签，调用不同的处理模块
        const systemMap: Record<string, string> = {
            TECH: '你是一个技术支持助手，帮助用户解决技术问题。',
            REFUND: '你是一个客服助手，帮助用户处理退款问题。',
            ORDER: '你是一个订单助手，帮助用户查询和修改订单信息。',
            COMPLAINT: '你是一个投诉处理助手，帮助用户提交和跟进投诉建议。',
            OTHER: '你是一个通用助手，帮助用户解答各种问题。',
        };

        // 获取分类标签
        const systemMessage = systemMap[category.match(/[a-zA-Z]+/)?.[0] ?? ''] || systemMap.OTHER;

        // 第三步，把系统角色信息和用户问题一起给大模型，让模型根据不同的角色信息来生成不同的回答内容
        const answerPrompt = ChatPromptTemplate.fromMessages([
            ['system', systemMessage],
            ['human', '{question}'],
        ])
            .pipe(this.LLM)
            .pipe(new StringOutputParser());

        return await answerPrompt
            .invoke({
                question,
            })
            .then((res) => {
                return {
                    code: 200,
                    message: 'success',
                    data: {
                        question,
                        category,
                        systemMessage,
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
