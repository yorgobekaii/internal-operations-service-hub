import { Controller, Post, Body, Param, Patch, Get, UseGuards, HttpCode, Headers } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { UpdateServiceRequestStatusDto } from './dto/update-service-request-status.dto';
import { AiTriageRequestDto } from './dto/ai-triage-request.dto';
import { AiTriageService } from './ai/ai-triage.service';
import { AuthGuard } from './auth.guard';
import { USER_ID_HEADER, USER_ROLE_HEADER } from '@internal/shared';

function resolveActor(headers: Record<string, unknown>): string {
  const fromId =
    headers?.[USER_ID_HEADER] ?? (headers as Record<string, unknown>)?.['x-user-id'];
  if (typeof fromId === 'string' && fromId.trim().length > 0) return fromId;
  const fromRole =
    headers?.[USER_ROLE_HEADER] ?? (headers as Record<string, unknown>)?.['x-user-role'];
  if (typeof fromRole === 'string' && fromRole.trim().length > 0)
    return fromRole;
  return 'system';
}

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
  async create(
    @Body() createServiceRequestDto: CreateServiceRequestDto,
    @Headers() headers: Record<string, unknown>,
  ) {
    return this.serviceRequestsService.create(
      createServiceRequestDto,
      resolveActor(headers ?? {}),
    );
  }

  @Get()
  async findAll() {
    return this.serviceRequestsService.findAll();
  }

  @Get(':id/audit')
  async getAudit(@Param('id') id: string) {
    return this.serviceRequestsService.getAuditTrail(id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.serviceRequestsService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard)
  async updateStatus(
    @Param('id') id: string,
    @Body() updateServiceRequestStatusDto: UpdateServiceRequestStatusDto,
    @Headers() headers: Record<string, unknown>,
  ) {
    return this.serviceRequestsService.updateStatus(
      id,
      updateServiceRequestStatusDto,
      resolveActor(headers ?? {}),
    );
  }
}
