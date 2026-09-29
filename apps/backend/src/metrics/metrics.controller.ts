import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { RequireActorGuard, RequireAdminGuard, resolvedActorFromRequest } from '../service-requests/auth.guard';

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

  @Get('calendar')
  @UseGuards(RequireAdminGuard)
  async calendar(@Req() req: unknown, @Query('from') from?: string, @Query('to') to?: string) {
    return this.metricsService.getCalendar(resolvedActorFromRequest(req), from, to);
  }
}
