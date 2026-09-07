// ------------------- 操作文件工具 -------------------

import { promises as fsp } from 'fs';
import * as path from 'path';

const SAFE_ROOT = process.cwd();

function resolveSafePath(filePath: string): string {
    const resolved = path.resolve(SAFE_ROOT, filePath);
    if (!resolved.startsWith(SAFE_ROOT)) {
        throw new Error(`不允许访问项目目录外的文件：${filePath}`);
    }
    return resolved;
}

const handleFileOperation = async (operation: 'read' | 'write', args: any): Promise<string> => {
    if (operation === 'read') {
        const { path: filePath } = args;
        const fullPath = resolveSafePath(filePath);

        try {
            const stat = await fsp.stat(fullPath);

            if (stat.size > 100 * 1024) {
                const content = await fsp.readFile(fullPath, 'utf-8');

                return `文件较大，只返回前 2000 字符：\n\n${content.slice(0, 2000)}\n\n...(文件共 ${stat.size} 字节)`;
            }
            const content = await fsp.readFile(fullPath, 'utf-8');

            return `文件内容（${filePath}）：\n\n${content}`;
        } catch (err: any) {
            if (err.code === 'ENOENT') return `文件不存在：${filePath}`;

            throw err;
        }
    }

    if (operation === 'write') {
        const { path: filePath, content } = args;
        const fullPath = resolveSafePath(filePath);

        await fsp.mkdir(path.dirname(fullPath), { recursive: true });
        await fsp.appendFile(fullPath, content, 'utf-8');

        return `已成功写入 ${content.length} 个字符到 ${filePath}`;
    }

    throw new Error(`不支持的操作：${operation}`);
};

export { handleFileOperation };
