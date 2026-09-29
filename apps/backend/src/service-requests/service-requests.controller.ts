import { Controller, Post, Body, Param, Patch, Get, UseGuards, HttpCode, Req } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { UpdateServiceRequestStatusDto } from './dto/update-service-request-status.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import {
  ApproveServiceRequestDto,
  DeclineServiceRequestDto,
  RejectServiceRequestDto,
} from './dto/decision.dto';
import { AiTriageRequestDto } from './dto/ai-triage-request.dto';
import { ReassignServiceRequestDto } from './dto/reassign-service-request.dto';
import { AiTriageService } from './ai/ai-triage.service';
import {
  RequireActorGuard,
  RequireApproverGuard,
  RequireHandlerGuard,
  resolvedActorFromRequest,
} from './auth.guard';

@Controller('service-requests')
export class ServiceRequestsController {
  constructor(
    private readonly serviceRequestsService: ServiceRequestsService,
    private readonly aiTriageService: AiTriageService,
  ) {}

  @Post('ai-triage')
  @HttpCode(200)
  async aiTriage(@Body() dto: AiTriageRequestDto) {
    return this.aiTriageService.suggest(dto.description);
  }

  @Post()
  @UseGuards(RequireActorGuard)
  async create(
    @Body() createServiceRequestDto: CreateServiceRequestDto,
    @Req() req: unknown,
  ) {
    const actor = resolvedActorFromRequest(req);
    return this.serviceRequestsService.create(createServiceRequestDto, actor);
  }

  @Get()
  @UseGuards(RequireActorGuard)
  async findAll(@Req() req: unknown) {
    return this.serviceRequestsService.findAll(resolvedActorFromRequest(req));
  }

  @Get(':id/audit')
  @UseGuards(RequireActorGuard)
  async getAudit(@Param('id') id: string, @Req() req: unknown) {
    return this.serviceRequestsService.getAuditTrail(
      id,
      resolvedActorFromRequest(req),
    );
  }

  @Get(':id/comments')
  @UseGuards(RequireActorGuard)
  async listComments(@Param('id') id: string, @Req() req: unknown) {
    return this.serviceRequestsService.listComments(
      id,
      resolvedActorFromRequest(req),
    );
  }

  @Post(':id/comments')
  @UseGuards(RequireActorGuard)
  async addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @Req() req: unknown,
  ) {
    return this.serviceRequestsService.addComment(
      id,
      dto ?? {},
      resolvedActorFromRequest(req),
    );
  }

  @Get(':id')
  @UseGuards(RequireActorGuard)
  async findOne(@Param('id') id: string, @Req() req: unknown) {
    return this.serviceRequestsService.findOne(
      id,
      resolvedActorFromRequest(req),
    );
  }

  @Patch(':id/status')
  @UseGuards(RequireHandlerGuard)
  async updateStatus(
    @Param('id') id: string,
    @Body() updateServiceRequestStatusDto: UpdateServiceRequestStatusDto,
    @Req() req: unknown,
  ) {
    return this.serviceRequestsService.updateStatus(
      id,
      updateServiceRequestStatusDto,
      resolvedActorFromRequest(req),
    );
  }

  @Post(':id/approve')
  @UseGuards(RequireApproverGuard)
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveServiceRequestDto,
    @Req() req: unknown,
  ) {
    return this.serviceRequestsService.approve(
      id,
      dto ?? {},
      resolvedActorFromRequest(req),
    );
  }

  @Post(':id/reject')
  @UseGuards(RequireApproverGuard)
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectServiceRequestDto,
    @Req() req: unknown,
  ) {
    return this.serviceRequestsService.reject(
      id,
      dto ?? {},
      resolvedActorFromRequest(req),
    );
  }

  @Post(':id/decline')
  @UseGuards(RequireHandlerGuard)
  async decline(
    @Param('id') id: string,
    @Body() dto: DeclineServiceRequestDto,
    @Req() req: unknown,
  ) {
    return this.serviceRequestsService.decline(
      id,
      dto ?? {},
      resolvedActorFromRequest(req),
    );
  }

  @Get(':id/approvals')
  @UseGuards(RequireActorGuard)
  async listApprovals(@Param('id') id: string, @Req() req: unknown) {
    return this.serviceRequestsService.listApprovalSteps(
      id,
      resolvedActorFromRequest(req),
    );
  }

  @Patch(':id/assign')
  @UseGuards(RequireHandlerGuard)
  async reassign(
    @Param('id') id: string,
    @Body() dto: ReassignServiceRequestDto,
    @Req() req: unknown,
  ) {
    return this.serviceRequestsService.reassign(
      id,
      dto ?? {},
      resolvedActorFromRequest(req),
    );
  }
}
