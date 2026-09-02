import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('/app')
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Get()
    getHello(): string {
        return this.appService.getHello();
    }

    @Get('/ls')
    getHello2(): string {
        return 'Hello liangshuang';
    }
}
