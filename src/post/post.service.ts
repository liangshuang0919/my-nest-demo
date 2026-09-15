import { Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto, DeletePostDto, UpdatePostDto, SearchPostDto } from './dto/post.dto';

function toBoolean(value: unknown): boolean | undefined {
    if (value === undefined || value === '') return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return undefined;
}

@Injectable()
export class PostService {
    constructor(private readonly prisma: PrismaService) {}

    async createPost(createPostDto: CreatePostDto) {
        return await this.prisma.post
            .create({
                data: createPostDto,
            })
            .then((data) => {
                return {
                    success: true,
                    data,
                    message: 'Post created successfully',
                };
            })
            .catch(() => {
                return {
                    success: false,
                    data: null,
                    message: 'Post creation failed',
                };
            });
    }

    async deletePost(params: DeletePostDto) {
        return await this.prisma.post
            .delete({
                where: { id: parseInt(params.id) },
            })
            .then((data) => {
                return {
                    success: true,
                    data,
                    message: 'Post deleted successfully',
                };
            })
            .catch(() => {
                return {
                    success: false,
                    data: null,
                    message: 'Post deletion failed',
                };
            });
    }

    async updatePost(id: string, updatePostDto: UpdatePostDto) {
        return await this.prisma.post
            .update({
                where: { id: parseInt(id) },
                data: updatePostDto,
            })
            .then((data) => {
                return {
                    success: true,
                    data,
                    message: 'Post updated successfully',
                };
            })
            .catch(() => {
                return {
                    success: false,
                    data: null,
                    message: 'Post update failed',
                };
            });
    }

    async getPostDetail(id: string) {
        return await this.prisma.post
            .findUnique({
                where: { id: parseInt(id) },
            })
            .then((data) => {
                if (!data) {
                    return {
                        success: false,
                        data: null,
                        message: 'Post not found',
                    };
                }

                return {
                    success: true,
                    data,
                    message: 'Post detail fetched successfully',
                };
            })
            .catch(() => {
                return {
                    success: false,
                    data: null,
                    message: 'Post detail fetch failed',
                };
            });
    }

    async getPostList() {
        return await this.prisma
            .$transaction([this.prisma.post.count(), this.prisma.post.findMany()])
            .then(([total, posts]) => {
                return {
                    success: true,
                    data: {
                        list: posts,
                        total,
                    },
                    message: 'Post list fetched successfully',
                };
            })
            .catch(() => {
                return {
                    success: false,
                    data: null,
                    message: 'Post list fetch failed',
                };
            });
    }

    async searchPost(query: SearchPostDto) {
        const { page = '1', pageSize = '10', ...rest } = query;

        const take = parseInt(pageSize);
        const skip = (parseInt(page) - 1) * take;

        const where: Prisma.PostWhereInput = {};

        if (rest.title) {
            where.title = {
                contains: rest.title,
                mode: 'insensitive',
            };
        }
        if (rest.content) {
            where.content = {
                contains: rest.content,
                mode: 'insensitive',
            };
        }
        const published = toBoolean(rest.published);
        if (published !== undefined) {
            where.published = published;
        }
        if (rest.authorId) {
            where.authorId = parseInt(rest.authorId);
        }

        return await this.prisma
            .$transaction([
                this.prisma.post.count({ where }),
                this.prisma.post.findMany({
                    where,
                    skip,
                    take,
                }),
            ])
            .then(([total, posts]) => {
                return {
                    success: true,
                    data: {
                        list: posts,
                        total,
                        totalPage: Math.ceil(total / take),
                        currentPage: parseInt(page),
                    },
                };
            })
            .catch(() => {
                return {
                    success: false,
                    data: null,
                    message: 'Post search failed',
                };
            });
    }
}
