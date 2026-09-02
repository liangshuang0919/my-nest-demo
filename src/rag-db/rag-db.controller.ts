import { Controller, Get, Post, Body, HttpCode, Delete } from '@nestjs/common';

import { LoadRagDto, SearchRagDto, ChatRagDto } from './dto/rag-db.dto';
import { RagDbService } from './rag-db.service';

@Controller('rag-db')
export class RagDbController {
    constructor(private readonly ragDbService: RagDbService) {}

    // 加载文档到向量库
    @Post('load')
    @HttpCode(200)
    async loadDocumnets(@Body() body: LoadRagDto) {
        return await this.ragDbService.LoadDocumnets(body);
    }

    // 检索向量库（纯向量查询，不通过大模型，直接检索结果）
    @Post('embed-search')
    @HttpCode(200)
    async embedSearch(@Body() body: SearchRagDto) {
        return await this.ragDbService.EmbedSearch(body);
    }

    // 检索向量库（完整 rag 回答，结合大模型）
    @Post('embed-chat')
    @HttpCode(200)
    async embedChat(@Body() body: ChatRagDto) {
        return await this.ragDbService.EmbedChat(body);
    }

    // 获取向量数据库状态
    @Get('status')
    @HttpCode(200)
    getStatus() {
        return this.ragDbService.GetStatus();
    }

    // 清空向量数据库
    @Delete('clear')
    @HttpCode(200)
    clear() {
        return this.ragDbService.Clear();
    }
}
