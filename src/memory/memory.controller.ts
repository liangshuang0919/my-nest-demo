import { Controller, Get, Post, Delete, Param, Body, HttpCode, Res } from '@nestjs/common';
import type { Response } from 'express';

import { MemoryService } from './memory.service';
import { ChatDto, ChatHistoryDto } from './dto/memory.dto';

@Controller('memory')
export class MemoryController {
    constructor(private readonly memoryService: MemoryService) {}

    // 记忆存储会话
    @Post('chat')
    @HttpCode(200)
    async chat(@Body() body: ChatDto) {
        return await this.memoryService.Chat(body);
    }

    // 流式记忆存储会话
    @Post('chat-stream')
    @HttpCode(200)
    async chatStream(@Body() body: ChatDto, @Res() res: Response) {
        return await this.memoryService.ChatStream(body, res);
    }

    // 查看会话历史
    @Post('get-history')
    @HttpCode(200)
    getHistory(@Body() body: ChatHistoryDto) {
        return this.memoryService.getHistory(body);
    }

    @Delete('session/:sessionId')
    clearSession(@Param('sessionId') sessionId: string) {
        return this.memoryService.clearSession(sessionId);
    }

    @Get('sessions')
    listSessions() {
        return this.memoryService.listSessions();
    }
}
