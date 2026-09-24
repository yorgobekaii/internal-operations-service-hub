import { Module } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service';
import { ServiceRequestsController } from './service-requests.controller';
import { AiTriageService } from './ai/ai-triage.service';
import { createTriageClient } from './ai/ai-triage.client';
import { PrismaModule } from '../prisma/prisma.module';
import { QueuesModule } from '../queues/queues.module';

@Module({
  imports: [PrismaModule, QueuesModule],
  controllers: [ServiceRequestsController],
  providers: [
    ServiceRequestsService,
    {
      provide: AiTriageService,
      useFactory: () => {
        const client = createTriageClient();
        console.log(
          `[ai-triage] provider=${client.modelVersion} (AI_PROVIDER=${process.env.AI_PROVIDER ?? 'mock (default)'})`,
        );
        return new AiTriageService(client);
      },
    },
  ],
})
export class ServiceRequestsModule {}
