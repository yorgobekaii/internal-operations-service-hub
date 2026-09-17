import { Injectable, BadRequestException, UnprocessableEntityException, NotFoundException } from '@nestjs/common';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { UpdateServiceRequestStatusDto } from './dto/update-service-request-status.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceRequest } from '@prisma/client';

@Injectable()
export class ServiceRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDto: CreateServiceRequestDto): Promise<ServiceRequest> {
    return this.prisma.serviceRequest.create({
      data: {
        title: createDto.title,
        category: createDto.category,
        status: 'Submitted',
      },
    });
  }

  async findAll(): Promise<ServiceRequest[]> {
    return this.prisma.serviceRequest.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<ServiceRequest> {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });
    
    if (!request) {
      throw new NotFoundException(`ServiceRequest with ID ${id} not found`);
    }
    return request;
  }

  async updateStatus(id: string, updateDto: UpdateServiceRequestStatusDto): Promise<ServiceRequest> {
    const request = await this.findOne(id);
    const currentStatus = request.status;
    const nextStatus = updateDto.status;

    if (currentStatus === 'Resolved' || currentStatus === 'Declined') {
      throw new UnprocessableEntityException('Request is immutable and cannot be updated');
    }

    if (currentStatus === 'Submitted') {
      if (nextStatus !== 'In Progress') {
        throw new BadRequestException('Invalid state transition.');
      }
    } else if (currentStatus === 'In Progress') {
      if (nextStatus !== 'Resolved' && nextStatus !== 'Blocked' && nextStatus !== 'Declined') {
        throw new BadRequestException('Invalid state transition.');
      }
    } else if (currentStatus === 'Blocked') {
      if (nextStatus !== 'In Progress' && nextStatus !== 'Declined') {
        throw new BadRequestException('Invalid state transition.');
      }
    } else if (currentStatus === 'Pending Approval') {
      if (nextStatus !== 'In Progress' && nextStatus !== 'Declined') {
         throw new BadRequestException('Invalid state transition.');
      }
    } else {
      throw new BadRequestException('Unknown state transition');
    }

    return this.prisma.serviceRequest.update({
      where: { id },
      data: { status: nextStatus },
    });
  }
}
