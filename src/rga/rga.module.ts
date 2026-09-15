import { Module } from '@nestjs/common';
import { RgaController } from './rga.controller';
import { RgaService } from './rga.service';

@Module({
    controllers: [RgaController],
    providers: [RgaService]
})
export class RgaModule {}
