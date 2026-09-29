import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { QueuesModule } from './queues/queues.module';
import { MetricsModule } from './metrics/metrics.module';
import { AdminModule } from './admin/admin.module';
import { TeachingIdentityModule } from './teaching-identity/teaching-identity.module';

@Module({
  imports: [TeachingIdentityModule, ServiceRequestsModule, QueuesModule, MetricsModule, AdminModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
