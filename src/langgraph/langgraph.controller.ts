import { Controller, Get, Post, Body, HttpCode, Param } from '@nestjs/common';

import { ArticleService } from './article.service';
import { LanggraphService } from './langgraph.service';
import { ParallelService } from './parallel.service';
import { ReactAgentService } from './react-agent.service';
import { RoutingService } from './routing.service';
import { SimpleChatDto, MemoryChatDto, ArticleDto, ReactChatDto, RoutingDto, ParallerDto } from './dto/langgraph.dto';

@Controller('langgraph')
export class LanggraphController {
    constructor(
        private readonly langgraphService: LanggraphService,
        private readonly articleService: ArticleService,
        private readonly parallelService: ParallelService,
        private readonly reactAgentService: ReactAgentService,
        private readonly routingService: RoutingService,
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

    // 工作流五：react-agent 循环
    @Post('react-chat')
    @HttpCode(200)
    async reactChat(@Body() body: ReactChatDto) {
        return await this.reactAgentService.reactChat(body);
    }

    // 工作流六：条件路由
    @Post('routing')
    @HttpCode(200)
    async routing(@Body() body: RoutingDto) {
        return await this.routingService.routing(body);
    }

    // 工作流七：并行分支
    @Post('parallel')
    @HttpCode(200)
    async parallel(@Body() body: ParallerDto) {
        return await this.parallelService.parallel(body);
    }
}
