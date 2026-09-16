import { Controller, Get, Post, Body, HttpCode, Param } from '@nestjs/common';

import { ArticleService } from './article.service';
import { LanggraphService } from './langgraph.service';
import { SimpleChatDto, MemoryChatDto, ArticleDto } from './dto/langgraph.dto';

@Controller('langgraph')
export class LanggraphController {
    constructor(
        private readonly langgraphService: LanggraphService,
        private readonly articleService: ArticleService,
    ) {}

    // 工作流一：简单回答（无记忆）
    @Post('simple-chat')
    @HttpCode(200)
    async simpleChat(@Body() body: SimpleChatDto) {
        return await this.langgraphService.simpleChat(body);
    }

    // 工作流二：简单回答（有记忆，多轮对话）
    @Post('memory-chat')
    @HttpCode(200)
    async memoryChat(@Body() body: MemoryChatDto) {
        return await this.langgraphService.memoryChat(body);
    }

    // 工作流三：获取会话历史
    @Get('history/:threadId')
    @HttpCode(200)
    async getHistory(@Param('threadId') threadId: string) {
        return await this.langgraphService.getHistory(threadId);
    }

    // 工作流四：文章摘要流水线
    @Post('article')
    @HttpCode(200)
    async processArticle(@Body() body: ArticleDto) {
        return await this.articleService.processArticle(body);
    }
}
