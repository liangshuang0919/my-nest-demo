import { Controller, Post, Body, HttpCode, Res } from '@nestjs/common';
import type { Response } from 'express';

import { ModelsService } from './models.service';
import { ChatDto } from './dto/models.dto';

@Controller('models')
export class ModelsController {
    constructor(private readonly modelsService: ModelsService) {}

    // 普通聊天，获取全量返回
    @Post('chat')
    @HttpCode(200)
    chat(@Body() body: ChatDto) {
        return this.modelsService.chat(body);
    }

    // 系统提示词聊天，设定系统提示词
    @Post('chat-system')
    @HttpCode(200)
    chatSystem(@Body() body: ChatDto) {
        return this.modelsService.chatSystem(body);
    }

    // 流式聊天
    @Post('chat-stream')
    @HttpCode(200)
    chatStream(@Body() body: ChatDto, @Res() res: Response) {
        return this.modelsService.chatStream(body, res);
    }

    // 解析 AIMessage 对象，将返回的大模型结果解析成字符串
    @Post('chat-parser')
    @HttpCode(200)
    chatParser(@Body() body: ChatDto) {
        return this.modelsService.chatParser(body);
    }
}
