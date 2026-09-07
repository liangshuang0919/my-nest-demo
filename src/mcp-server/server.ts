// Mcp 服务
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// Mcp 启动服务
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// 格式校验
import { z } from 'zod';

// 导入 tool 工具
import { handleDatabaseQuery } from './tools/database.tool';
import { handleFileOperation } from './tools/file.tool';
import { handleWeatherQuery } from './tools/weather.tool';

// 创建 Mcp 服务
const server = new McpServer({
    name: 'Example Mcp Server',
    description: 'An example of a Mcp Server',
    version: '1.0.0',
});

// 工具1：查询数据库
server.registerTool(
    'query_database', // 方法名
    // 输入参数校验
    {
        description: '查询数据库', // 描述
        inputSchema: z.object({
            name: z.string().optional().describe('根据用户名进行查询'), // 搜索条件：name
            role: z.enum(['admin', 'user', 'guest']).optional().describe('根据角色进行查询'), // 搜索条件：role
            limit: z.number().optional().describe('根据条数进行查询'), // 条数
        }),
    },
    async (args) => {
        try {
            // 调用工具函数
            const result = await handleDatabaseQuery(args);

            return {
                success: true,
                // content 是返回必须有的结构
                content: [{ type: 'text' as const, text: JSON.stringify(result) }],
            };
        } catch (error) {
            return {
                success: false,
                content: [{ type: 'text' as const, text: `工具执行失败：${error.message}` }],
            };
        }
    },
);

// 工具2：读写文件
server.registerTool(
    'read_file', // 方法名
    // 输入参数校验
    {
        description: '读取文件', // 描述
        inputSchema: z.object({
            filePath: z.string().describe('文件路径'), // 文件路径
        }),
    },
    async (args) => {
        const { filePath } = args;

        try {
            // 读取文件
            const result = await handleFileOperation('read', filePath);

            return {
                success: true,
                // content 是返回必须有的结构
                content: [{ type: 'text' as const, text: result }],
            };
        } catch (error) {
            return {
                success: false,
                content: [{ type: 'text' as const, text: `工具执行失败：${error.message}` }],
            };
        }
    },
);

// 工具3：天气查询
server.registerTool(
    'query_weather', // 方法名
    // 输入参数校验
    {
        description: '获取天气', // 描述
        inputSchema: z.object({
            location: z.string().describe('要查询的地点'),
        }),
    },
    async (args) => {
        try {
            // 读取文件
            const result = await handleWeatherQuery(args);

            return {
                success: true,
                // content 是返回必须有的结构
                content: [{ type: 'text' as const, text: result }],
            };
        } catch (error) {
            return {
                success: false,
                content: [{ type: 'text' as const, text: `工具执行失败：${error.message}` }],
            };
        }
    },
);

// 启动 mcp 服务
const startServer = async () => {
    try {
        const transport = new StdioServerTransport();
        await server.connect(transport);

        console.log(`Mcp Server started at 3000`);
    } catch (error) {
        console.error(`Mcp Server error: ${error}`);
    }
};

startServer().catch((error) => console.error(error));
