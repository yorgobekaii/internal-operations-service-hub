import { Module } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service';
import { ServiceRequestsController } from './service-requests.controller';
import { AiTriageService } from './ai/ai-triage.service';
import { createTriageClient } from './ai/ai-triage.client';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ServiceRequestsController],
  providers: [
    ServiceRequestsService,
    {
      provide: AiTriageService,
      useFactory: () => new AiTriageService(createTriageClient()),
    },
  ],
})
export class ServiceRequestsModule {}
