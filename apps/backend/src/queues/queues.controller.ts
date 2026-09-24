import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueuesService } from './queues.service';

@Controller('queues')
export class QueuesController {
  constructor(private readonly queuesService: QueuesService) {}

  @Get()
  async list() {
    return this.queuesService.listQueues();
  }

  @Get(':id/requests')
  async listRequests(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.queuesService.findByQueue(id, {
      status,
      priority,
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
  }
}
