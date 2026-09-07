// ------------------- 查询数据库工具 -------------------

// 引入操作数据库的依赖
import { Pool } from 'pg';
import 'dotenv/config';

interface IDatabaseQueryArgs {
    name?: string; // 数据库表中的 name 字段
    role?: string; // 数据库表中的 role 字段
    limit?: number; // 条数
}

// 创建 mcp server
// 是一个独立的进程，需要初始化数据库连接
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// 数据库查询函数 -- 不使用 prisma
const handleDatabaseQuery = async (args: IDatabaseQueryArgs): Promise<any> => {
    const { name, role, limit = 10 } = args;

    const conditions: string[] = [];

    if (name) {
        conditions.push(`name LIKE '%${name}%'`);
    }

    if (role) {
        conditions.push(`role = '${role}'`);
    }

    const query = `
        SELECT id, name, role
        FROM users
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        LIMIT ${limit}
    `;
    const result = await pool.query(query);
    const users = result.rows;

    const userList = users.map((item) => `ID：${item.id}，姓名：${item.name}，角色：${item.role}`);

    return {
        code: 200,
        message: 'Success',
        data: userList,
    };
};

export { handleDatabaseQuery };
