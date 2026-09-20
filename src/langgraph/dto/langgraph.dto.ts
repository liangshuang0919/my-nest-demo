export class SimpleChatDto {
    question: string; // 问题
}

export class MemoryChatDto {
    threadId: string; // 记录会话 id
    question: string; // 问题
}

export class ArticleDto {
    article: string; // 文章
}

export class ReactChatDto {
    threadId: string; // 记录会话 id
    message: string; // 用户消息
}

export class RoutingDto {
    input: string; // 用户输入
}

export class ParallerDto {
    task: string; // 处理的任务
}
