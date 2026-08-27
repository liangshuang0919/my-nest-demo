export class TranslateDto {
    text: string; // 待翻译文本
    targetLanguage: string; // 目标语言
}

export class SummarizeDto {
    text: string; // 待总结文本
    maxWords?: number; // 最大字数
}

export class ClassifyDto {
    input: string; // 待分类文本
}

export class CodeReviewDto {
    code: string; // 待审核代码
    language: string; // 语言
}
