import { Test, TestingModule } from '@nestjs/testing';
import { ServiceRequestsService } from './service-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueuesService } from '../queues/queues.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

const IT_ROUTE = {
  id: 'queue-it',
  name: 'IT Queue',
  category: 'IT',
  ownerId: 'owner-it',
  backupOwnerId: 'backup-it',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ServiceRequestsService', () => {
  let service: ServiceRequestsService;
  let prisma: PrismaService;
  let mockTx: {
    serviceRequest: { create: jest.Mock; update: jest.Mock };
    auditEntry: { create: jest.Mock };
    approvalStep: { create: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
    comment: { create: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockTx = {
      serviceRequest: { create: jest.fn(), update: jest.fn() },
      auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      approvalStep: {
        create: jest.fn().mockResolvedValue({ id: 'step-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      comment: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceRequestsService,
        {
          provide: PrismaService,
          useValue: {
            serviceRequest: {
              create: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
            auditEntry: {
              create: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            user: {
              findUnique: jest.fn().mockResolvedValue(null),
              create: jest.fn(),
            },
            approvalStep: {
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              updateMany: jest.fn(),
            },
            comment: {
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
            },
            queue: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            $transaction: jest.fn(async (cb: (tx: unknown) => unknown) =>
              cb(mockTx),
            ),
          },
        },
        {
          provide: QueuesService,
          useValue: {
            routeForCategory: jest.fn().mockResolvedValue(IT_ROUTE),
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

  describe('Step B: Routing', () => {
    it('routes new requests to the category queue with owner + backup', async () => {
      mockTx.serviceRequest.create.mockImplementation(async (args: {
        data: Record<string, unknown>;
      }) => buildRow({ ...(args.data as object), status: 'Submitted' }));

      const result = await service.create({ title: 'Laptop', category: 'IT' });

      expect(result.queueId).toBe('queue-it');
      expect(result.ownerId).toBe('owner-it');
      expect(result.backupOwnerId).toBe('backup-it');
      expect(mockTx.serviceRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ queueId: 'queue-it' }),
      });
    });

    it('records the header identity as requesterId', async () => {
      mockTx.serviceRequest.create.mockImplementation(async (args: {
        data: Record<string, unknown>;
      }) => buildRow({ ...(args.data as object), status: 'Submitted' }));

      const result = await service.create(
        { title: 'Laptop', category: 'IT' },
        'alice',
        { userId: 'alice@internal.local', role: 'requester' },
      );

      expect(result.requesterId).toBe('alice@internal.local');
    });
  });

  describe('Step B: Row-level scoping', () => {
    it('legacy callers without identity still see everything', async () => {
      const findMany = jest.spyOn(prisma.serviceRequest, 'findMany');
      await service.findAll();
      expect(findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
      });
    });

    it('requesters only see their own requests', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'u-alice',
        email: 'alice@internal.local',
        role: 'requester',
        department: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const findMany = jest.spyOn(prisma.serviceRequest, 'findMany');

      await service.findAll({ userId: 'alice@internal.local', role: 'requester' });

      expect(findMany).toHaveBeenCalledWith({
        where: { requesterId: 'alice@internal.local' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('requesters cannot open someone else\u2019s request', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'u-alice',
        email: 'alice@internal.local',
        role: 'requester',
        department: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ requesterId: 'bob@internal.local' }));

      await expect(
        service.findOne('test-id', { userId: 'alice@internal.local' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('department operators are confined to their queue', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'u-op',
        email: 'op@internal.local',
        role: 'operator',
        department: 'IT',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      jest.spyOn(prisma.queue, 'findMany').mockResolvedValue([
        {
          id: 'queue-it',
          name: 'IT Queue',
          category: 'IT',
          ownerId: 'owner-it',
          backupOwnerId: 'backup-it',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      const findMany = jest.spyOn(prisma.serviceRequest, 'findMany');

      await service.findAll({ userId: 'op@internal.local', role: 'operator' });

      expect(findMany).toHaveBeenCalledWith({
        where: { queueId: { in: ['queue-it'] } },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('admins see everything', async () => {
      const findMany = jest.spyOn(prisma.serviceRequest, 'findMany');
      await service.findAll({ userId: 'root@internal.local', role: 'admin' });
      expect(findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('Step C: Approval gate', () => {
    const pendingRow = () =>
      buildRow({ status: 'Pending Approval', queueId: 'queue-it' });
    const pendingStep = (overrides = {}) => ({
      id: 'step-1',
      requestId: 'test-id',
      approverId: null,
      status: 'pending',
      rationale: null,
      decidedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

    it('opens a pending approval step when entering Pending Approval', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'Submitted' }));
      mockTx.serviceRequest.update.mockResolvedValue(pendingRow());

      await service.updateStatus('test-id', { status: 'Pending Approval' });

      expect(mockTx.approvalStep.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestId: 'test-id',
          status: 'pending',
        }),
      });
    });

    it('blocks PATCH directly to In Progress while steps are pending (422)', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(pendingRow());
      jest
        .spyOn(prisma.approvalStep, 'findMany')
        .mockResolvedValue([pendingStep()]);

      await expect(
        service.updateStatus('test-id', { status: 'In Progress' }),
      ).rejects.toThrow('Approval required before fulfillment can start');
      expect(mockTx.serviceRequest.update).not.toHaveBeenCalled();
    });

    it('approve() releases to In Progress and records an approved audit', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(pendingRow());
      jest
        .spyOn(prisma.approvalStep, 'findMany')
        .mockResolvedValue([pendingStep()]);
      mockTx.serviceRequest.update.mockResolvedValue(
        buildRow({ status: 'In Progress', queueId: 'queue-it' }),
      );

      const result = await service.approve('test-id', {}, 'boss');

      expect(result.status).toBe('In Progress');
      expect(mockTx.approvalStep.updateMany).toHaveBeenCalledWith({
        where: { requestId: 'test-id', status: 'pending' },
        data: expect.objectContaining({ status: 'approved', approverId: 'boss' }),
      });
      expect(mockTx.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          from: 'Pending Approval',
          to: 'In Progress',
          action: 'approved',
        }),
      });
    });

    it('reject() requires a rationale and declines with a rejected audit', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(pendingRow());

      await expect(service.reject('test-id', { rationale: '' })).rejects.toThrow(
        'A rejection rationale is required.',
      );
      await expect(
        service.reject('test-id', {} as { rationale: string }),
      ).rejects.toThrow('A rejection rationale is required.');

      jest
        .spyOn(prisma.approvalStep, 'findMany')
        .mockResolvedValue([pendingStep()]);
      mockTx.serviceRequest.update.mockResolvedValue(
        buildRow({ status: 'Declined', queueId: 'queue-it' }),
      );

      const result = await service.reject(
        'test-id',
        { rationale: 'Over budget' },
        'boss',
      );

      expect(result.status).toBe('Declined');
      expect(mockTx.approvalStep.updateMany).toHaveBeenCalledWith({
        where: { requestId: 'test-id', status: 'pending' },
        data: expect.objectContaining({
          status: 'rejected',
          rationale: 'Over budget',
        }),
      });
      expect(mockTx.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          from: 'Pending Approval',
          to: 'Declined',
          action: 'rejected',
        }),
      });
    });

    it('approve()/reject() refuse non-pending requests', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'Submitted' }));

      await expect(service.approve('test-id', {})).rejects.toThrow(
        'Only requests pending approval can be approved',
      );
      await expect(
        service.reject('test-id', { rationale: 'nope' }),
      ).rejects.toThrow('Only requests pending approval can be rejected');
    });

    it('findApprovals lists gated requests, filterable by approver', async () => {
      const findMany = jest.spyOn(prisma.serviceRequest, 'findMany');
      await service.findApprovals();
      expect(findMany).toHaveBeenCalledWith({
        where: { status: 'Pending Approval' },
        orderBy: { createdAt: 'desc' },
      });

      jest.spyOn(prisma.approvalStep, 'findMany').mockResolvedValue([
        pendingStep({ approverId: null }),
      ]);
      await service.findApprovals(undefined, 'boss@internal.local');
      expect(findMany).toHaveBeenCalledWith({
        where: {
          status: 'Pending Approval',
          id: { in: ['test-id'] },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('Step D: Blocking and comments', () => {
    it('blocking without a reason is refused (400)', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'In Progress' }));

      await expect(
        service.updateStatus('test-id', { status: 'Blocked' }),
      ).rejects.toThrow('A blockage reason is required to block a request.');
      await expect(
        service.updateStatus('test-id', { status: 'Blocked', blockedReason: '  ' }),
      ).rejects.toThrow('A blockage reason is required to block a request.');
      expect(mockTx.serviceRequest.update).not.toHaveBeenCalled();
    });

    it('blocking with a reason stores the trimmed reason', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'In Progress' }));
      mockTx.serviceRequest.update.mockResolvedValue(
        buildRow({ status: 'Blocked', blockedReason: 'Waiting on vendor' }),
      );

      const result = await service.updateStatus('test-id', {
        status: 'Blocked',
        blockedReason: '  Waiting on vendor  ',
      });

      expect(result.status).toBe('Blocked');
      expect(result.blockedReason).toBe('Waiting on vendor');
      expect(mockTx.serviceRequest.update).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        data: expect.objectContaining({ blockedReason: 'Waiting on vendor' }),
      });
    });

    it('addComment stores the comment and writes a commented audit', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'In Progress' }));
      mockTx.comment.create.mockImplementation(async (args: {
        data: Record<string, unknown>;
      }) =>
        Promise.resolve({
          id: 'c1',
          requestId: 'test-id',
          authorId: args.data['authorId'],
          body: args.data['body'],
          createdAt: new Date(),
        }),
      );

      const comment = await service.addComment(
        'test-id',
        { body: '  Any update?  ' },
        'requester-alice',
      );

      expect(comment.body).toBe('Any update?');
      expect(comment.authorId).toBe('requester-alice');
      expect(mockTx.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'commented' }),
      });
    });

    it('addComment refuses empty bodies', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'In Progress' }));

      await expect(service.addComment('test-id', { body: '   ' })).rejects.toThrow(
        'Comment body is required.',
      );
    });
  });
});
