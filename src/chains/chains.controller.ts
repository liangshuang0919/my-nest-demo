import { Controller, Post, Body, HttpCode } from '@nestjs/common';

import { ChainsService } from './chains.service';
import { PolishDto, BlogDto, CategoryDto } from './dto/chains.dto';

@Controller('chains')
export class ChainsController {
    constructor(private readonly chainsService: ChainsService) {}

    // 润色文章
    @Post('polish')
    @HttpCode(200)
    async polish(@Body() body: PolishDto) {
        return await this.chainsService.chainsPolish(body);
    }

    // 生成博客
    @Post('blog')
    @HttpCode(200)
    async blog(@Body() body: BlogDto) {
        return await this.chainsService.chainsBlog(body);
    }

    // 条件链路
    @Post('category')
    @HttpCode(200)
    async category(@Body() body: CategoryDto) {
        return await this.chainsService.chainsCategory(body);
    }
}
