import { Controller, Post, HttpCode, Body } from '@nestjs/common';

import { EmbedService } from './embed.service';
import { EmbedSignleDto, EmbedBatchDto, EmbedQueryDto } from './dto/embed.dto';

@Controller('embed')
export class EmbedController {
    constructor(private readonly embedService: EmbedService) {}

    // 单个文本向量化
    @Post('single')
    @HttpCode(200)
    async createSignle(@Body() body: EmbedSignleDto) {
        return await this.embedService.createSignle(body);
    }

    // 多个文本向量化
    @Post('batch')
    @HttpCode(200)
    async createBatch(@Body() body: EmbedBatchDto) {
        return await this.embedService.createBatch(body);
    }

    // 计算查询与文档之间的余弦相似度，并返回相似度最高的文档
    @Post('query')
    @HttpCode(200)
    async createQuery(@Body() body: EmbedQueryDto) {
        return await this.embedService.createQuery(body);
    }
}
