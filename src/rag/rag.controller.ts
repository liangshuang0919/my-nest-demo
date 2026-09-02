import { Controller, Get, Post, Body, HttpCode, Delete } from '@nestjs/common';

import { LoadRagDto, SearchRagDto, ChatRagDto } from './dto/rag.dto';
import { RagService } from './rag.service';

@Controller('rag')
export class RagController {
    constructor(private readonly ragService: RagService) {}

    // 加载文档到向量库
    @Post('load')
    @HttpCode(200)
    async loadDocumnets(@Body() body: LoadRagDto) {
        return await this.ragService.LoadDocumnets(body);
    }

    // 检索向量库（纯向量查询，不通过大模型，直接检索结果）
    @Post('embed-search')
    @HttpCode(200)
    async embedSearch(@Body() body: SearchRagDto) {
        return await this.ragService.EmbedSearch(body);
    }

    // 检索向量库（完整 rag 回答，结合大模型）
    @Post('embed-chat')
    @HttpCode(200)
    async embedChat(@Body() body: ChatRagDto) {
        return await this.ragService.EmbedChat(body);
    }

    // 获取向量数据库状态
    @Get('status')
    @HttpCode(200)
    getStatus() {
        return this.ragService.GetStatus();
    }

    // 清空向量数据库
    @Delete('clear')
    @HttpCode(200)
    clear() {
        return this.ragService.Clear();
    }
}
