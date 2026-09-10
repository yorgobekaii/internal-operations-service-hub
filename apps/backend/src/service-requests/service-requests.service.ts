import { Injectable, BadRequestException, UnprocessableEntityException, NotFoundException } from '@nestjs/common';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { UpdateServiceRequestStatusDto } from './dto/update-service-request-status.dto';
import { ServiceRequest, ServiceRequestStatus } from './entities/service-request.entity';

@Injectable()
export class ServiceRequestsService {
  private readonly requests = new Map<string, ServiceRequest>();
  private idCounter = 1;

  create(createDto: CreateServiceRequestDto): ServiceRequest {
    const id = this.idCounter.toString();
    this.idCounter++;
    
    const newRequest: ServiceRequest = {
      id,
      title: createDto.title,
      category: createDto.category,
      status: 'Submitted',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.requests.set(id, newRequest);
    return newRequest;
  }

  findOne(id: string): ServiceRequest {
    const request = this.requests.get(id);
    if (!request) {
      throw new NotFoundException(`ServiceRequest with ID ${id} not found`);
    }
    return request;
  }

  updateStatus(id: string, updateDto: UpdateServiceRequestStatusDto): ServiceRequest {
    const request = this.findOne(id);
    const currentStatus = request.status;
    const nextStatus = updateDto.status;

    // Immutability Invariant: Cannot update a Resolved request
    if (currentStatus === 'Resolved') {
      throw new UnprocessableEntityException('Request is immutable and cannot be updated');
    }

    // State Machine Transitions
    if (currentStatus === 'Submitted') {
      if (nextStatus !== 'In Progress') {
        throw new BadRequestException('Invalid state transition. Can only transition from Submitted to In Progress.');
      }
    } else if (currentStatus === 'In Progress') {
      if (nextStatus !== 'Resolved') {
        throw new BadRequestException('Invalid state transition. Can only transition from In Progress to Resolved.');
      }
    } else {
      throw new BadRequestException(`Unknown state transition from ${currentStatus} to ${nextStatus}`);
    }

    request.status = nextStatus;
    request.updatedAt = new Date();
    
    this.requests.set(id, request);
    return request;
  }
}
