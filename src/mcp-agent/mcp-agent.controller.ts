import { Controller, Get, Post, Body, HttpCode } from '@nestjs/common';

import { McpAgentService } from './mcp-agent.service';
import { RunToolDto } from './dto/mcp-agent';

@Controller('mcp-agent')
export class McpAgentController {
    constructor(private readonly mcpAgentService: McpAgentService) {}

    // 获取工具列表
    @Get('tools')
    @HttpCode(200)
    getTools() {
        return this.mcpAgentService.getTools();
    }

    // 调用工具
    @Post('run')
    @HttpCode(200)
    runTools(@Body() body: RunToolDto) {
        return this.mcpAgentService.runTools(body);
    }
}
