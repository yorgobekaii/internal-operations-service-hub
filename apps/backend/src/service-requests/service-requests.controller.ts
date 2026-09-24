import { Controller, Post, Body, Param, Patch, Get, UseGuards, HttpCode, Headers, Req } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { UpdateServiceRequestStatusDto } from './dto/update-service-request-status.dto';
import { AiTriageRequestDto } from './dto/ai-triage-request.dto';
import { AiTriageService } from './ai/ai-triage.service';
import { AuthGuard, actorFromRequest } from './auth.guard';
import {
  USER_ID_HEADER,
  USER_ROLE_HEADER,
  type RequestActor,
} from '@internal/shared';

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

function resolveScope(
  headers: Record<string, unknown>,
  req?: unknown,
): RequestActor {
  if (req) return actorFromRequest(req);
  const h = headers ?? {};
  const pick = (...names: string[]): string | undefined => {
    for (const n of names) {
      const v = h[n];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
    return undefined;
  };
  return {
    userId: pick(USER_ID_HEADER, 'x-user-id'),
    role: pick(USER_ROLE_HEADER, 'x-user-role'),
    department: pick('x-user-dept'),
  };
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
    @Req() req: unknown,
  ) {
    const scope = resolveScope(headers ?? {}, req);
    return this.serviceRequestsService.create(
      createServiceRequestDto,
      resolveActor(headers ?? {}),
      scope.userId ? scope : undefined,
    );
  }

  @Get()
  async findAll(
    @Headers() headers: Record<string, unknown>,
    @Req() req: unknown,
  ) {
    return this.serviceRequestsService.findAll(
      resolveScope(headers ?? {}, req),
    );
  }

  @Get(':id/audit')
  async getAudit(
    @Param('id') id: string,
    @Headers() headers: Record<string, unknown>,
    @Req() req: unknown,
  ) {
    return this.serviceRequestsService.getAuditTrail(
      id,
      resolveScope(headers ?? {}, req),
    );
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Headers() headers: Record<string, unknown>,
    @Req() req: unknown,
  ) {
    return this.serviceRequestsService.findOne(
      id,
      resolveScope(headers ?? {}, req),
    );
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard)
  async updateStatus(
    @Param('id') id: string,
    @Body() updateServiceRequestStatusDto: UpdateServiceRequestStatusDto,
    @Headers() headers: Record<string, unknown>,
    @Req() req: unknown,
  ) {
    const scope = resolveScope(headers ?? {}, req);
    return this.serviceRequestsService.updateStatus(
      id,
      updateServiceRequestStatusDto,
      resolveActor(headers ?? {}),
      scope.userId ? scope : undefined,
    );
  }
}
