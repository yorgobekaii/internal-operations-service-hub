import { IsNotEmpty, IsString } from 'class-validator';
import type { ReassignServiceRequestDto as ReassignContract } from '@internal/shared';

export class ReassignServiceRequestDto implements ReassignContract {
  @IsString()
  @IsNotEmpty()
  ownerId!: string;
}
