import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EmbedModule } from './embed/embed.module';
import { RgaModule } from './rga/rga.module';

@Module({
  imports: [EmbedModule, RgaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
