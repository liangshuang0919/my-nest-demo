export class CreatePostDto {
  title: string;
  content: string;
  published?: boolean;
  authorId: number;
}

export class DeletePostDto {
  id: string;
}

export class UpdatePostDto {
  title?: string;
  content?: string;
  published?: boolean;
}

export class SearchPostDto {
  title?: string;
  content?: string;
  published?: boolean;
  authorId?: string;
  page?: string;
  pageSize?: string;
}
