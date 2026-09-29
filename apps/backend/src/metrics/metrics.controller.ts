import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { RequireActorGuard, resolvedActorFromRequest } from '../service-requests/auth.guard';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('queue-health')
  @UseGuards(RequireActorGuard)
  async queueHealth(@Req() req: unknown, @Query('asOf') asOf?: string) {
    return this.metricsService.getQueueHealth(
      resolvedActorFromRequest(req),
      undefined,
      asOf,
    );
  }
}
