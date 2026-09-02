export class CreateUserDto {
    name: string;
    email: string;
    password: string;
    role?: string;
}

export class UpdateUserDto {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
}

export class QueryUserDto {
    name?: string;
    role?: string;
    page?: string;
    pageSize?: string;
}
