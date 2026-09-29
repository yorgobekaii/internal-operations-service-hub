import { Module } from '@nestjs/common';
import { QueuesController } from './queues.controller';
import { QueuesService } from './queues.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TeachingIdentityModule } from '../teaching-identity/teaching-identity.module';

@Module({
  imports: [PrismaModule, TeachingIdentityModule],
  controllers: [QueuesController],
  providers: [QueuesService],
  exports: [QueuesService],
})
export class QueuesModule {}
