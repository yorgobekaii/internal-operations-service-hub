import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { QueuesModule } from './queues/queues.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [ServiceRequestsModule, QueuesModule, MetricsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
