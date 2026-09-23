import {
  Injectable,
  BadRequestException,
  UnprocessableEntityException,
  NotFoundException,
} from '@nestjs/common';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { UpdateServiceRequestStatusDto } from './dto/update-service-request-status.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { ServiceRequest as PrismaServiceRequest } from '@prisma/client';
import type {
  ServiceRequest as SharedServiceRequest,
  ServiceRequestCategory,
  ServiceRequestStatus,
} from '@internal/shared';
import { ALLOWED_TRANSITIONS } from '@internal/shared';

function toContract(row: PrismaServiceRequest): SharedServiceRequest {
  return {
    id: row.id,
    title: row.title,
    category: row.category as ServiceRequestCategory,
    status: row.status as ServiceRequestStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class ServiceRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    createDto: CreateServiceRequestDto,
  ): Promise<SharedServiceRequest> {
    const row = await this.prisma.serviceRequest.create({
      data: {
        title: createDto.title,
        category: createDto.category,
        status: 'Submitted',
      },
    });
    return toContract(row);
  }

  async findAll(): Promise<SharedServiceRequest[]> {
    const rows = await this.prisma.serviceRequest.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toContract);
  }

  async findOne(id: string): Promise<SharedServiceRequest> {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException(`ServiceRequest with ID ${id} not found`);
    }
    return toContract(request);
  }

  async updateStatus(
    id: string,
    updateDto: UpdateServiceRequestStatusDto,
  ): Promise<SharedServiceRequest> {
    const request = await this.findOne(id);
    const currentStatus = request.status;
    const nextStatus = updateDto.status;

    if (!nextStatus) {
      throw new BadRequestException('Status is required.');
    }

    if (currentStatus === 'Resolved' || currentStatus === 'Declined') {
      throw new UnprocessableEntityException(
        'Request is immutable and cannot be updated',
      );
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed) {
      throw new BadRequestException('Unknown state transition');
    }
    if (!allowed.includes(nextStatus)) {
      throw new BadRequestException('Invalid state transition.');
    }

    const row = await this.prisma.serviceRequest.update({
      where: { id },
      data: { status: nextStatus },
    });
    return toContract(row);
  }
}
