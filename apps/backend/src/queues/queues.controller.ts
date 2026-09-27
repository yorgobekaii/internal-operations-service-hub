import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { QueuesService } from './queues.service';
import { RequireActorGuard, resolvedActorFromRequest } from '../service-requests/auth.guard';

@Controller('queues')
export class QueuesController {
  constructor(private readonly queuesService: QueuesService) {}

  @Get()
  @UseGuards(RequireActorGuard)
  async list(@Req() req: unknown) {
    return this.queuesService.listQueues(resolvedActorFromRequest(req));
  }

  @Get(':id/requests')
  @UseGuards(RequireActorGuard)
  async listRequests(
    @Param('id') id: string,
    @Req() req: unknown,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.queuesService.findByQueue(
      id,
      {
        status,
        priority,
        page: page !== undefined ? Number(page) : undefined,
        limit: limit !== undefined ? Number(limit) : undefined,
      },
      resolvedActorFromRequest(req),
    );
  }
}
