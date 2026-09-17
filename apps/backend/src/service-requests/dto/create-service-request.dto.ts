import { IsNotEmpty, IsString } from 'class-validator';
import type { CreateServiceRequestDto as CreateServiceRequestContract } from '@internal/shared';

export class CreateServiceRequestDto implements CreateServiceRequestContract {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  category: string;
}
