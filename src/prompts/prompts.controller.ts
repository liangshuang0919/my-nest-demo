import { Controller, Post, Body, HttpCode } from '@nestjs/common';

import { TranslateDto, SummarizeDto, ClassifyDto, CodeReviewDto } from './dto/prompts.dto';
import { PromptsService } from './prompts.service';

@Controller('prompts')
export class PromptsController {
    constructor(private readonly promptsService: PromptsService) {}

    // 翻译
    @Post('translate')
    @HttpCode(200)
    promptTranslate(@Body() body: TranslateDto) {
        return this.promptsService.promptTranslate(body);
    }

    // 总结
    @Post('summarize')
    @HttpCode(200)
    promptSummarize(@Body() body: SummarizeDto) {
        return this.promptsService.promptSummarize(body);
    }

    // 分类
    @Post('classify')
    @HttpCode(200)
    promptClassify(@Body() body: ClassifyDto) {
        return this.promptsService.promptClassify(body);
    }

    // code review
    @Post('code-review')
    @HttpCode(200)
    promptCodeReview(@Body() body: CodeReviewDto) {
        return this.promptsService.promptCodeReview(body);
    }
}
