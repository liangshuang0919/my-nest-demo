import { Module } from '@nestjs/common';
import { McpClientController } from './mcp-client.controller';
import { McpClientService } from './mcp-client.service';

@Module({
    controllers: [McpClientController],
    providers: [McpClientService],
})
export class McpClientModule {}
