import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import type { AiTriageRequest as AiTriageRequestContract } from '@internal/shared';

export class AiTriageRequestDto implements AiTriageRequestContract {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(2000)
  description!: string;
}
