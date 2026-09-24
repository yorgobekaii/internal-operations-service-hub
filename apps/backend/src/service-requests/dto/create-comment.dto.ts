import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { CreateCommentDto as CreateCommentContract } from '@internal/shared';

export class CreateCommentDto implements CreateCommentContract {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsString()
  authorId?: string;
}
