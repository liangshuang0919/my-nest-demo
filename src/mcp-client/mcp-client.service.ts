import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { CallToolDto } from './dto/mcp-client.dto';

@Injectable()
export class McpClientService implements OnModuleInit, OnModuleDestroy {
    private client: Client;
    private transport: StdioClientTransport;

    // nest 生命周期钩子，初始化时候调用
    // 模块初始化的时候建立 MCP 客户端连接
    async onModuleInit() {
        // 创建 Mcp 服务
        this.client = new Client({
            name: 'Example Mcp Server',
            description: 'An example of a Mcp Server',
            version: '1.0.0',
        });

        // stdio 模式，是用于与独立的 MCP 服务器进程通信，子进程模式，是用于在统一进程内运行 MCP 服务器
        this.transport = new StdioClientTransport({
            command: 'ts-node',
            args: ['src/mcp-server/server.ts'],
            env: { ...process.env } as Record<string, string>,
        });

        await this.client.connect(this.transport);
    }

    // 获取工具列表
    async getTools() {
        const response = await this.client.listTools();

        return {
            success: true,
            data: response.tools.map((item) => ({
                name: item.name,
                description: item.description,
                inputSchema: item.inputSchema,
            })),
        };
    }

    // 调用工具
    async callTool({ toolName, args }: CallToolDto) {
        // 调用 callTool 方法
        const response = await this.client.callTool({
            name: toolName,
            arguments: args,
        });

        // MCP 响应里面的 content 是一个数组，包含了工具调用的结果，可以根据需要进行处理
        // const content = response.content.find((item) => item.type === 'text')?.text || 'No text content found';

        return {
            toolName,
            isError: response.isError,
            result: response.content,
        };
    }

    // nest 生命周期钩子，销毁时候调用
    async onModuleDestroy() {
        // 关闭 mcp 连接
        await this.client.close();
    }
}
