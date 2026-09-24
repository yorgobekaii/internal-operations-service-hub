import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { QueuesModule } from './queues/queues.module';

@Module({
  imports: [ServiceRequestsModule, QueuesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
