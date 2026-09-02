import { Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto/user.dto';

@Injectable()
export class UserService {
    constructor(private readonly prisma: PrismaService) {}

    async createUser(userData: CreateUserDto) {
        const user = await this.prisma.user.create({
            data: {
                ...userData,
                role: userData.role ?? 'user',
            },
        });

        return {
            success: true,
            data: user,
            message: 'User created successfully',
        };
    }

    async getUsers() {
        const users = await this.prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return {
            success: true,
            data: {
                total: users.length,
                list: users,
            },
            message: 'Users fetched successfully',
        };
    }

    async getUser(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: parseInt(id) },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
                updatedAt: true,
                posts: {
                    select: {
                        id: true,
                        title: true,
                        content: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                },
            },
        });

        if (!user) {
            return {
                success: false,
                data: null,
                message: 'User not found',
            };
        }

        return {
            success: true,
            data: user,
            message: 'User fetched successfully',
        };
    }

    async deleteUser(id: string) {
        return await this.prisma.user
            .delete({
                where: { id: parseInt(id) },
            })
            .then(() => {
                return {
                    success: true,
                    data: null,
                    message: 'User deleted successfully',
                };
            })
            .catch(() => {
                return {
                    success: false,
                    data: null,
                    message: 'User not found',
                };
            });
    }

    async updateUser(id: string, userData: UpdateUserDto) {
        return await this.prisma.user
            .update({
                where: { id: parseInt(id) },
                data: userData,
            })
            .then(() => {
                return {
                    success: true,
                    data: null,
                    message: 'User updated successfully',
                };
            })
            .catch(() => {
                return {
                    success: false,
                    data: null,
                    message: 'User not found',
                };
            });
    }

    async searchUsers(query: QueryUserDto) {
        const { page = '1', pageSize = '10', ...rest } = query;

        const take = parseInt(pageSize);
        // 分页偏移量
        // 当前页码 - 1 * 每页条数，因为下标从 0 开始
        const skip = (parseInt(page) - 1) * take;

        // 查询条件，用于组合查询
        const where: Prisma.UserWhereInput = {};

        if (rest.name) {
            where.name = { contains: rest.name, mode: 'insensitive' };
        }
        if (rest.role) {
            where.role = { contains: rest.role };
        }

        // 事务查询，先查询总数，再查询列表
        return await this.prisma
            .$transaction([
                this.prisma.user.count({ where }),
                this.prisma.user.findMany({
                    where,
                    skip,
                    take,
                    orderBy: { createdAt: 'asc' },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                }),
            ])
            .then(([total, users]) => {
                // 返回总数和列表
                const totalPage = Math.ceil(total / take);

                return {
                    success: true,
                    data: {
                        list: users,
                        total,
                        totalPage,
                        currentPage: parseInt(page),
                    },
                };
            })
            .catch(() => {
                return {
                    success: false,
                    message: 'Users not found',
                };
            });
    }
}
