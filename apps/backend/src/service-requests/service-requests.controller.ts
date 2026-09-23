import { Controller, Post, Body, Param, Patch, Get, UseGuards, HttpCode } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { UpdateServiceRequestStatusDto } from './dto/update-service-request-status.dto';
import { AiTriageRequestDto } from './dto/ai-triage-request.dto';
import { AiTriageService } from './ai/ai-triage.service';
import { AuthGuard } from './auth.guard';

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
  async create(@Body() createServiceRequestDto: CreateServiceRequestDto) {
    return this.serviceRequestsService.create(createServiceRequestDto);
  }

  @Get()
  async findAll() {
    return this.serviceRequestsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.serviceRequestsService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard)
  async updateStatus(
    @Param('id') id: string,
    @Body() updateServiceRequestStatusDto: UpdateServiceRequestStatusDto
  ) {
    return this.serviceRequestsService.updateStatus(id, updateServiceRequestStatusDto);
  }
}
