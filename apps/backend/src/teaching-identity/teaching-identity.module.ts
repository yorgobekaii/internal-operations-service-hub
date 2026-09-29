import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TeachingIdentityService } from './teaching-identity.service';
import { TeachingIdentityController } from './teaching-identity.controller';

@Module({
  imports: [PrismaModule],
  providers: [TeachingIdentityService],
  controllers: [TeachingIdentityController],
  exports: [TeachingIdentityService],
})
export class TeachingIdentityModule {}
