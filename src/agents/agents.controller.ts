import { Controller, Post, Body, HttpCode } from '@nestjs/common';

import { AgentsService } from './agents.service';
import { AgentsRunDto } from './dto/agents.dto';

@Controller('agents')
export class AgentsController {
    constructor(private readonly agentsService: AgentsService) {}

    @Post('run')
    @HttpCode(200)
    async AgentsRun(@Body() body: AgentsRunDto) {
        return await this.agentsService.AgentsRun(body);
    }
}
