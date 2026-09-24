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
    description: null,
    requesterId: null,
    queueId: null,
    ownerId: null,
    backupOwnerId: null,
    blockedReason: null,
    slaDueAt: null,
    payloadJson: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ServiceRequestsService', () => {
  let service: ServiceRequestsService;
  let prisma: PrismaService;
  let mockTx: {
    serviceRequest: { create: jest.Mock; update: jest.Mock };
    auditEntry: { create: jest.Mock };
  };

  beforeEach(async () => {
    mockTx = {
      serviceRequest: { create: jest.fn(), update: jest.fn() },
      auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };

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
            auditEntry: {
              create: jest.fn(),
              findMany: jest.fn(),
            },
            $transaction: jest.fn(async (cb: (tx: unknown) => unknown) =>
              cb(mockTx),
            ),
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

      mockTx.serviceRequest.update.mockResolvedValue(
        buildRow({ status: 'In Progress' }),
      );

      const result = await service.updateStatus('test-id', {
        status: 'In Progress',
      });
      expect(result.status).toBe('In Progress');
    });

    it('Step A: create writes an audit entry atomically with the request', async () => {
      mockTx.serviceRequest.create.mockImplementation(async (args: {
        data: Record<string, unknown>;
      }) => buildRow({ ...(args.data as object), status: 'Submitted' }));

      const result = await service.create(
        { title: 'Laptop', category: 'IT' },
        'tester',
      );

      expect(result.status).toBe('Submitted');
      expect(result.slaDueAt).toBeDefined();
      expect(mockTx.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'tester',
          from: null,
          to: 'Submitted',
          action: 'created',
        }),
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('Step A: updateStatus writes a status_changed audit entry', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'Submitted' }));

      mockTx.serviceRequest.update.mockResolvedValue(
        buildRow({ status: 'In Progress' }),
      );

      await service.updateStatus(
        'test-id',
        { status: 'In Progress' },
        'operator',
      );

      expect(mockTx.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestId: 'test-id',
          actorId: 'operator',
          from: 'Submitted',
          to: 'In Progress',
          action: 'status_changed',
        }),
      });
    });

    it('Step A: getAuditTrail returns entries oldest-first', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'In Progress' }));
      const findMany = jest.spyOn(prisma.auditEntry, 'findMany').mockResolvedValue(
        [
          {
            id: 'a1',
            requestId: 'test-id',
            actorId: 'tester',
            from: null,
            to: 'Submitted',
            action: 'created',
            createdAt: new Date('2026-01-01T00:00:00Z'),
          },
          {
            id: 'a2',
            requestId: 'test-id',
            actorId: 'operator',
            from: 'Submitted',
            to: 'In Progress',
            action: 'status_changed',
            createdAt: new Date('2026-01-02T00:00:00Z'),
          },
        ],
      );

      const trail = await service.getAuditTrail('test-id');

      expect(trail).toHaveLength(2);
      expect(trail[0].action).toBe('created');
      expect(trail[1].to).toBe('In Progress');
      expect(findMany).toHaveBeenCalledWith({
        where: { requestId: 'test-id' },
        orderBy: { createdAt: 'asc' },
      });
    });
  });
});
