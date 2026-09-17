import { Test, TestingModule } from '@nestjs/testing';
import { ServiceRequestsService } from './service-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

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
      jest.spyOn(prisma.serviceRequest, 'findUnique').mockResolvedValue({
        id: 'test-id',
        title: 'Laptop',
        category: 'IT',
        status: 'Submitted',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      await expect(service.updateStatus('test-id', { status: 'Resolved' }))
        .rejects
        .toThrow(BadRequestException);
    });
    
    it('4-Regression test: should allow valid transition from Submitted to In Progress', async () => {
       jest.spyOn(prisma.serviceRequest, 'findUnique').mockResolvedValue({
        id: 'test-id',
        title: 'Laptop',
        category: 'IT',
        status: 'Submitted',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      
      jest.spyOn(prisma.serviceRequest, 'update').mockResolvedValue({
        id: 'test-id',
        title: 'Laptop',
        category: 'IT',
        status: 'In Progress',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await service.updateStatus('test-id', { status: 'In Progress' });
      expect(result.status).toBe('In Progress');
    });
  });
});
