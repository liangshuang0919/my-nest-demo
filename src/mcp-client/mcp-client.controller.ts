import { Controller, Get, Post, Body, HttpCode } from '@nestjs/common';

import { McpClientService } from './mcp-client.service';
import { CallToolDto } from './dto/mcp-client.dto';

@Controller('mcp-client')
export class McpClientController {
    constructor(private readonly mcpClientService: McpClientService) {}

    // 获取工具列表
    @Get('tools')
    @HttpCode(200)
    getTools() {
        return this.mcpClientService.getTools();
    }

    // 调用工具
    @Post('call-tool')
    @HttpCode(200)
    async callTool(@Body() body: CallToolDto) {
        return this.mcpClientService.callTool(body);
    }
}
