import { Controller, Get, Headers, Query, Req } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service';
import { actorFromRequest } from './auth.guard';
import type { RequestActor } from '@internal/shared';

/**
 * Approver work queue: requests currently gated at Pending Approval,
 * scoped to the caller's identity like every other listing.
 */
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly serviceRequestsService: ServiceRequestsService) {}

  @Get()
  async list(
    @Query('approverId') approverId: string | undefined,
    @Headers() headers: Record<string, unknown>,
    @Req() req: unknown,
  ) {
    const scope: RequestActor = req ? actorFromRequest(req) : {};
    return this.serviceRequestsService.findApprovals(
      scope.userId || scope.role ? scope : undefined,
      typeof approverId === 'string' && approverId.trim().length > 0
        ? approverId
        : undefined,
    );
  }
}
