import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { RequireActorGuard, resolvedActorFromRequest } from '../service-requests/auth.guard';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('queue-health')
  @UseGuards(RequireActorGuard)
  async queueHealth(@Req() req: unknown) {
    return this.metricsService.getQueueHealth(
      resolvedActorFromRequest(req),
    );
  }
}
