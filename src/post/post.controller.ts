import { Controller, HttpCode, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';

import { PostService } from './post.service';
import { CreatePostDto, UpdatePostDto, SearchPostDto } from './dto/post.dto';

@Controller('post')
export class PostController {
    constructor(private readonly service: PostService) {}

    @Post('create')
    @HttpCode(200)
    createPost(@Body() createPostDto: CreatePostDto) {
        return this.service.createPost(createPostDto);
    }

    @Delete('delete/:id')
    @HttpCode(200)
    deletePost(@Param('id') id: string) {
        return this.service.deletePost({ id });
    }

    @Put('update/:id')
    @HttpCode(200)
    updatePost(@Param('id') id: string, @Body() updatePostDto: UpdatePostDto) {
        return this.service.updatePost(id, updatePostDto);
    }

    @Get('detail/:id')
    @HttpCode(200)
    getPostDetail(@Param('id') id: string) {
        return this.service.getPostDetail(id);
    }

    @Get('list')
    @HttpCode(200)
    getPostList() {
        return this.service.getPostList();
    }

    @Get('search')
    @HttpCode(200)
    searchPost(@Query() query: SearchPostDto) {
        return this.service.searchPost(query);
    }
}
