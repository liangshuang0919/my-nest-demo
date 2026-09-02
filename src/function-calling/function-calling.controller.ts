import { Controller, Post, Body, HttpCode } from '@nestjs/common';

import { FunctionCallingService } from './function-calling.service';
import { LoadFCDto } from './dto/function-calling.dto';

@Controller('function-calling')
export class FunctionCallingController {
    constructor(private readonly fcService: FunctionCallingService) {}

    // 加载 function calling
    @Post('load')
    @HttpCode(200)
    async fcLoad(@Body() body: LoadFCDto) {
        return await this.fcService.FCLoad(body);
    }
}
