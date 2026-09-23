import { Test, TestingModule } from '@nestjs/testing';
import { ServiceRequestsService } from './service-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import type { ServiceRequest as PrismaServiceRequest } from '@prisma/client';

function buildRow(
  overrides: Partial<PrismaServiceRequest> = {},
): PrismaServiceRequest {
  return {
    id: 'test-id',
    title: 'Laptop',
    category: 'IT',
    status: 'Submitted',
    priority: 'Standard',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ServiceRequestsService', () => {
  let service: ServiceRequestsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceRequestsService,
        {
          provide: PrismaService,
          useValue: {
            serviceRequest: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ServiceRequestsService>(ServiceRequestsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Business Rule: State Transitions', () => {
    it('1-Business-rule test: should reject invalid state transition from Submitted to Resolved', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'Submitted' }));

      await expect(
        service.updateStatus('test-id', { status: 'Resolved' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('4-Regression test: should allow valid transition from Submitted to In Progress', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'Submitted' }));

      jest
        .spyOn(prisma.serviceRequest, 'update')
        .mockResolvedValue(buildRow({ status: 'In Progress' }));

      const result = await service.updateStatus('test-id', {
        status: 'In Progress',
      });
      expect(result.status).toBe('In Progress');
    });
  });
});
