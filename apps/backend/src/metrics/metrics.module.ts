import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TeachingIdentityModule } from '../teaching-identity/teaching-identity.module';

@Module({
  imports: [PrismaModule, TeachingIdentityModule],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
