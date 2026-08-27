import { Controller, Post, Get, Put, Delete, Body, Param, Query } from '@nestjs/common';

import { UserService } from './user.service';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto/user.dto';

@Controller('user')
export class UserController {
    constructor(private readonly userService: UserService) {}

    @Post('create')
    createUser(@Body() createUserDto: CreateUserDto) {
        return this.userService.createUser(createUserDto);
    }

    @Get('list')
    getUsers() {
        return this.userService.getUsers();
    }

    @Get('detail/:id')
    getUser(@Param('id') id: string) {
        return this.userService.getUser(id);
    }

    @Delete('delete/:id')
    deleteUser(@Param('id') id: string) {
        return this.userService.deleteUser(id);
    }

    @Put('update/:id')
    updateUser(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
        return this.userService.updateUser(id, updateUserDto);
    }

    @Get('search')
    searchUsers(@Query() query: QueryUserDto) {
        return this.userService.searchUsers(query);
    }
}
