import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service';
import { RequireActorGuard, resolvedActorFromRequest } from './auth.guard';

/**
 * Approver work queue: requests currently gated at Pending Approval,
 * scoped to the caller's resolved teaching identity. The optional
 * `approverId` query is intentionally ignored — authority derives from
 * `x-user-id`, never from client-supplied fields.
 */
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly serviceRequestsService: ServiceRequestsService) {}

  @Get()
  @UseGuards(RequireActorGuard)
  async list(@Req() req: unknown) {
    return this.serviceRequestsService.findApprovals(
      resolvedActorFromRequest(req),
    );
  }
}
