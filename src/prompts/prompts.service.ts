import { Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { ChatPromptTemplate, PromptTemplate, FewShotPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

import { TranslateDto, SummarizeDto, ClassifyDto, CodeReviewDto } from './dto/prompts.dto';
import { LangChainConfig } from '../config';

@Injectable()
export class PromptsService {
    private readonly LLM: ChatOllama;

    constructor() {
        this.LLM = new ChatOllama({
            model: LangChainConfig.ollama.model, // 模型名称
            baseUrl: LangChainConfig.ollama.baseUrl, // 模型地址
            temperature: LangChainConfig.ollama.temperature, // 温度参数
            think: false, // 是否开启思考模式，开启后模型会优先返回一个思考中的消息，等生成完成后再返回最终答案
        });
    }

    // 翻译
    // 多消息对话模块，适合需要上下文的对话场景，模型会根据之前的消息内容进行回答
    async promptTranslate({ targetLanguage, text }: TranslateDto) {
        // fromMessages 接收一个消息数组，每个消息由一个角色（system、user、assistant）和内容组成，模板中可以用占位符 {text} 和 {targetLanguage}
        const propmpts = ChatPromptTemplate.fromMessages([
            ['system', '你是一个翻译助手，只输出翻译结果，帮助用户将文本翻译成指定的语言。'],
            ['human', '请把一下的内容翻译成 {targetLanguage}: {text}'],
        ]);

        const chain = propmpts.pipe(this.LLM).pipe(new StringOutputParser());
        return await chain
            .invoke({
                text,
                targetLanguage,
            })
            .then((res) => {
                return {
                    code: 200,
                    message: 'success',
                    data: {
                        text,
                        targetLanguage,
                        result: res,
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

    // 总结
    async promptSummarize({ text, maxWords }: SummarizeDto) {
        const prompt = ChatPromptTemplate.fromTemplate(
            maxWords ? '用不超过{maxWords}个字总结以下内容，只输出总结：\n\n{text}' : '总结以下内容：\n\n{text}',
        );
        const chain = prompt.pipe(this.LLM).pipe(new StringOutputParser());

        return await chain
            .invoke({
                text,
                maxWords,
            })
            .then((res) => {
                return {
                    code: 200,
                    message: 'success',
                    data: res,
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

    // 分类
    async promptClassify({ input }: ClassifyDto) {
        // 示例评价
        const examples = [
            { input: '这个产品太棒了！', output: '正面' },
            { input: '完全不值这个价格', output: '负面' },
            { input: '还可以吧，普通', output: '中性' },
            { input: '强烈推荐！超出预期', output: '正面' },
            { input: '很失望，不会再买了', output: '负面' },
        ];

        const examplePrompt = PromptTemplate.fromTemplate('输入：{input}\n输出：{output}');
        const fewShotPrompt = new FewShotPromptTemplate({
            examples, // 示例
            examplePrompt, // 示例模板
            prefix: '分析文本情感，只输出：正面、负面、中性之一。\n\n示例：', // 前缀
            suffix: '输入：{input}\n输出：', // 后缀
            inputVariables: ['input'], // 输入变量
        });

        // ---------- 格式化写法一：----------
        const prompt = await fewShotPrompt.format({ input });

        return await this.LLM.invoke(prompt)
            .then((res) => {
                return {
                    code: 200,
                    message: 'success',
                    data: {
                        input,
                        label: res.content,
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

        // ---------- 格式化写法二：----------
        const chain = fewShotPrompt.pipe(this.LLM).pipe(new StringOutputParser());

        return await chain
            .invoke({
                input,
            })
            .then((res) => {
                return {
                    code: 200,
                    message: 'success',
                    data: {
                        input,
                        label: res,
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

    // code review
    async promptCodeReview({ code, language }: CodeReviewDto) {
        const prompt = ChatPromptTemplate.fromMessages([
            ['system', '你是一个资深{language}代码审查助手，帮助用户找出代码中的错误和改进建议。'],
            ['human', '请帮我审查以下的{language}代码，并指出其中的错误和改进建议：\n{code}'],
        ]);

        const chain = prompt.pipe(this.LLM).pipe(new StringOutputParser());

        return await chain
            .invoke({
                code,
                language,
            })
            .then((res) => {
                return {
                    code: 200,
                    message: 'success',
                    data: res,
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
