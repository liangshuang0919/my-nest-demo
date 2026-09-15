import { Controller, Post, Body, HttpCode } from '@nestjs/common';

import { RgaService } from './rga.service';
import { AddDocumentsDto, ChatDto, SearchDto } from './dto/rga.dto';

@Controller('rga')
export class RgaController {
    constructor(private readonly rgaService: RgaService) {}

    // 添加文档
    @Post('add-documents')
    @HttpCode(200)
    async addDocuments(@Body() body: AddDocumentsDto) {
        return await this.rgaService.addDocuments(body);
    }

    // 搜索
    @Post('search')
    @HttpCode(200)
    async search(@Body() body: SearchDto) {
        return await this.rgaService.search(body);
    }

    // 用户提问
    @Post('chat')
    @HttpCode(200)
    async chat(@Body() body: ChatDto) {
        return await this.rgaService.chat(body);
    }
}
