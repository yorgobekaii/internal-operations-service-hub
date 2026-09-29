import { Test, TestingModule } from '@nestjs/testing';
import { ServiceRequestsService } from './service-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueuesService } from '../queues/queues.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ServiceRequest as PrismaServiceRequest } from '@prisma/client';

const MAYA = { userId: 'maya.requester' };
const THEO = { userId: 'theo.requester' };
const OMAR = { userId: 'omar.it-handler' };
const PRIYA = { userId: 'priya.hr-handler' };
const LINA = { userId: 'lina.finance-approver' };
const SAM = { userId: 'sam.legal-approver' };
const NORA = { userId: 'nora.ops-admin' };

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
    approvalStep: { create: jest.Mock; findMany: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    comment: { create: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockTx = {
      serviceRequest: { create: jest.fn(), update: jest.fn() },
      auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      approvalStep: {
        create: jest.fn().mockResolvedValue({ id: 'step-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 'step-1' }),
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
              update: jest.fn(),
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
        {
          provide: NotificationsService,
          useValue: { notify: jest.fn(), fanOut: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<ServiceRequestsService>(ServiceRequestsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Fail-closed identity', () => {
    it('rejects missing and unknown actors (no legacy open behavior)', async () => {
      await expect(service.findAll(undefined)).rejects.toThrow(ForbiddenException);
      await expect(service.findAll({ userId: 'ghost' })).rejects.toThrow(ForbiddenException);
      await expect(service.findOne('test-id', undefined)).rejects.toThrow(ForbiddenException);
      await expect(
        service.create({ title: 'Laptop', category: 'IT', payloadJson: JSON.stringify({ system: 'Jira' }) }, undefined),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ignores client-supplied role/dept and resolves from the registry', async () => {
      // Spoofed handler claim via unknown id still 403s; unknown ids never resolve.
      await expect(
        service.findAll({ userId: 'mallory', role: 'admin', department: 'IT' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Business Rule: State Transitions', () => {
    it('1-Business-rule test: should reject invalid state transition from Submitted to Resolved', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'Submitted' }));

      await expect(
        service.updateStatus('test-id', { status: 'Resolved' }, NORA),
      ).rejects.toThrow(BadRequestException);
    });

    it('4-Regression test: should allow valid transition from Submitted to In Progress (admin)', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'Submitted' }));

      mockTx.serviceRequest.update.mockResolvedValue(
        buildRow({ status: 'In Progress' }),
      );

      const result = await service.updateStatus('test-id', {
        status: 'In Progress',
      }, NORA);
      expect(result.status).toBe('In Progress');
    });

    it('requester/approver cannot PATCH status (403)', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'Submitted', requesterId: 'maya.requester' }));
      await expect(
        service.updateStatus('test-id', { status: 'In Progress' }, MAYA),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.updateStatus('test-id', { status: 'In Progress' }, LINA),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Step A: create writes an audit entry atomically with the request', async () => {
      mockTx.serviceRequest.create.mockImplementation(async (args: {
        data: Record<string, unknown>;
      }) => buildRow({ ...(args.data as object), status: 'Submitted' }));

      const result = await service.create(
        { title: 'Laptop', category: 'IT', payloadJson: JSON.stringify({ system: 'Jira' }) },
        MAYA,
      );

      expect(result.status).toBe('Submitted');
      expect(result.slaDueAt).toBeDefined();
      expect(mockTx.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'maya.requester',
          from: null,
          to: 'Submitted',
          action: 'created',
        }),
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('Step A: updateStatus writes a status_changed audit entry with resolved actor (ignores body actorId)', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'Submitted' }));

      mockTx.serviceRequest.update.mockResolvedValue(
        buildRow({ status: 'In Progress' }),
      );

      await service.updateStatus(
        'test-id',
        { status: 'In Progress', actorId: 'mallory' },
        NORA,
      );

      expect(mockTx.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestId: 'test-id',
          actorId: 'nora.ops-admin',
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

      const trail = await service.getAuditTrail('test-id', NORA);

      expect(trail).toHaveLength(2);
      expect(trail[0].action).toBe('created');
      expect(trail[1].to).toBe('In Progress');
      expect(findMany).toHaveBeenCalledWith({
        where: { requestId: 'test-id' },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('Step B: Routing + server-owned fields', () => {
    it('routes new requests to the category queue with owner + backup', async () => {
      mockTx.serviceRequest.create.mockImplementation(async (args: {
        data: Record<string, unknown>;
      }) => buildRow({ ...(args.data as object), status: 'Submitted' }));

      const result = await service.create({ title: 'Laptop', category: 'IT', payloadJson: JSON.stringify({ system: 'Jira' }) }, MAYA);

      expect(result.queueId).toBe('queue-it');
      expect(result.ownerId).toBe('owner-it');
      expect(result.backupOwnerId).toBe('backup-it');
      expect(mockTx.serviceRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ queueId: 'queue-it' }),
      });
    });

    it('records the resolved actor as requesterId and ignores spoofed body fields', async () => {
      mockTx.serviceRequest.create.mockImplementation(async (args: {
        data: Record<string, unknown>;
      }) => buildRow({ ...(args.data as object), status: 'Submitted' }));

      const result = await service.create(
        {
          title: 'Laptop',
          category: 'IT',
          payloadJson: JSON.stringify({ system: 'Jira' }),
          requesterId: 'mallory',
          queueId: 'evil-queue',
          ownerId: 'evil-owner',
        } as never,
        MAYA,
      );

      expect(result.requesterId).toBe('maya.requester');
      expect(result.queueId).toBe('queue-it');
      expect(result.ownerId).toBe('owner-it');
      expect(mockTx.serviceRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requesterId: 'maya.requester',
          queueId: 'queue-it',
          ownerId: 'owner-it',
        }),
      });
    });
  });

  describe('Step B: Row-level scoping', () => {
    it('requesters only see their own requests', async () => {
      const findMany = jest.spyOn(prisma.serviceRequest, 'findMany');

      await service.findAll(MAYA);

      expect(findMany).toHaveBeenCalledWith({
        where: { requesterId: 'maya.requester' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('requesters cannot open someone else’s request', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ requesterId: 'theo.requester' }));

      await expect(
        service.findOne('test-id', MAYA),
      ).rejects.toThrow(ForbiddenException);
    });

    it('department handlers are confined to their queue', async () => {
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

      await service.findAll(OMAR);

      expect(findMany).toHaveBeenCalledWith({
        where: { queueId: { in: ['queue-it'] } },
        orderBy: { createdAt: 'desc' },
      });

      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ queueId: 'queue-hr', requesterId: 'x' }));
      await expect(service.findOne('test-id', OMAR)).rejects.toThrow(ForbiddenException);
    });

    it('admins see everything but sensitive payloads are redacted', async () => {
      jest.spyOn(prisma.serviceRequest, 'findUnique').mockResolvedValue(
        buildRow({
          category: 'HR',
          description: 'secret',
          payloadJson: JSON.stringify({ topic: 'Leave' }),
        }),
      );
      const got = await service.findOne('test-id', NORA);
      expect(got.description).toBe('[restricted: sensitive request]');
      expect(got.payloadJson).toBeNull();
    });

    it('approvers see only assigned requests', async () => {
      jest.spyOn(prisma.approvalStep, 'findMany').mockResolvedValue([]);
      expect(await service.findAll(LINA)).toEqual([]);
      jest.spyOn(prisma.approvalStep, 'findMany').mockResolvedValue([
        {
          id: 'step-1',
          requestId: 'test-id',
          approverId: 'lina.finance-approver',
          status: 'pending',
          rationale: null,
          decidedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      jest.spyOn(prisma.serviceRequest, 'findMany').mockResolvedValue([
        buildRow({ status: 'Pending Approval' }),
      ]);
      const list = await service.findAll(LINA);
      expect(list).toHaveLength(1);
    });
  });

  describe('Step C: Approval gate (designated approver)', () => {
    const pendingRow = () =>
      buildRow({ status: 'Pending Approval', queueId: 'queue-it' });
    const pendingStep = (overrides = {}) => ({
      id: 'step-1',
      requestId: 'test-id',
      approverId: 'lina.finance-approver',
      status: 'pending',
      rationale: null,
      decidedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

    it('opens a pending approval step assigned to the designated approver', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'Submitted' }));
      mockTx.serviceRequest.update.mockResolvedValue(pendingRow());

      await service.updateStatus('test-id', { status: 'Pending Approval' }, NORA);

      expect(mockTx.approvalStep.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestId: 'test-id',
          status: 'pending',
          approverId: 'lina.finance-approver',
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
        service.updateStatus('test-id', { status: 'In Progress' }, NORA),
      ).rejects.toThrow('Approval required before fulfillment can start');
      expect(mockTx.serviceRequest.update).not.toHaveBeenCalled();
    });

    it('approve() releases to In Progress for the designated approver only', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(pendingRow());
      jest
        .spyOn(prisma.approvalStep, 'findMany')
        .mockResolvedValue([pendingStep()]);
      mockTx.serviceRequest.update.mockResolvedValue(
        buildRow({ status: 'In Progress', queueId: 'queue-it' }),
      );

      const result = await service.approve('test-id', {}, LINA);

      expect(result.status).toBe('In Progress');
      expect(mockTx.approvalStep.updateMany).toHaveBeenCalledWith({
        where: { requestId: 'test-id', status: 'pending' },
        data: expect.objectContaining({ status: 'approved', approverId: 'lina.finance-approver' }),
      });
      expect(mockTx.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          from: 'Pending Approval',
          to: 'In Progress',
          action: 'approved',
        }),
      });
    });

    it('approve() forbids unrelated approver, handler, requester, admin', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(pendingRow());
      jest
        .spyOn(prisma.approvalStep, 'findMany')
        .mockResolvedValue([pendingStep()]);

      await expect(service.approve('test-id', {}, SAM)).rejects.toThrow(ForbiddenException);
      await expect(service.approve('test-id', {}, OMAR)).rejects.toThrow(ForbiddenException);
      await expect(service.approve('test-id', {}, MAYA)).rejects.toThrow(ForbiddenException);
      await expect(service.approve('test-id', {}, NORA)).rejects.toThrow(ForbiddenException);
    });

    it('reject() requires a rationale and declines with a rejected audit', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(pendingRow());

      await expect(service.reject('test-id', { rationale: '' }, LINA)).rejects.toThrow(
        'A rejection rationale is required.',
      );
      await expect(
        service.reject('test-id', {} as { rationale: string }, LINA),
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
        LINA,
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

      await expect(service.approve('test-id', {}, LINA)).rejects.toThrow(
        'Only requests pending approval can be approved',
      );
      await expect(
        service.reject('test-id', { rationale: 'nope' }, LINA),
      ).rejects.toThrow('Only requests pending approval can be rejected');
    });

    it('decline() moves Submitted/In Progress/Blocked to Declined with rationale audit', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'In Progress', queueId: 'queue-it' }));
      mockTx.serviceRequest.update.mockResolvedValue(
        buildRow({ status: 'Declined', queueId: 'queue-it' }),
      );

      const result = await service.decline(
        'test-id',
        { rationale: 'Duplicate ticket' },
        NORA,
      );

      expect(result.status).toBe('Declined');
      expect(mockTx.serviceRequest.update).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        data: expect.objectContaining({ status: 'Declined' }),
      });
      expect(mockTx.approvalStep.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestId: 'test-id',
          status: 'rejected',
          rationale: 'Duplicate ticket',
        }),
      });
      expect(mockTx.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          from: 'In Progress',
          to: 'Declined',
          action: 'status_changed',
        }),
      });
    });

    it('decline() requires rationale, forbids non-operators, refuses gate + terminals', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'Submitted', queueId: 'queue-it' }));

      await expect(service.decline('test-id', { rationale: '' }, NORA)).rejects.toThrow(
        'A decline rationale is required.',
      );
      await expect(service.decline('test-id', {}, NORA)).rejects.toThrow(
        'A decline rationale is required.',
      );
      await expect(
        service.decline('test-id', { rationale: 'x' }, MAYA),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.decline('test-id', { rationale: 'x' }, LINA),
      ).rejects.toThrow(ForbiddenException);

      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'Pending Approval', queueId: 'queue-it' }));
      await expect(
        service.decline('test-id', { rationale: 'x' }, NORA),
      ).rejects.toThrow('Only Submitted, In Progress or Blocked requests can be declined here');

      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'Resolved', queueId: 'queue-it' }));
      await expect(
        service.decline('test-id', { rationale: 'x' }, NORA),
      ).rejects.toThrow('Request is immutable and cannot be updated');
    });

    it('listApprovalSteps returns steps oldest-first after scope check', async () => {
      const steps = [
        {
          id: 'step-1',
          requestId: 'test-id',
          approverId: 'lina.finance-approver',
          status: 'rejected',
          rationale: 'Over budget',
          decidedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'Declined', queueId: 'queue-it' }));
      jest.spyOn(prisma.approvalStep, 'findMany').mockResolvedValue(steps);

      const result = await service.listApprovalSteps('test-id', NORA);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ rationale: 'Over budget', status: 'rejected' });
    });

    it('findApprovals is scoped per role (assigned for approvers)', async () => {
      jest.spyOn(prisma.approvalStep, 'findMany').mockResolvedValue([
        pendingStep({ approverId: 'lina.finance-approver' }),
      ]);
      const findMany = jest.spyOn(prisma.serviceRequest, 'findMany').mockResolvedValue([]);
      await service.findApprovals(LINA);
      expect(findMany).toHaveBeenCalledWith({
        where: {
          status: 'Pending Approval',
          id: { in: ['test-id'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      jest.spyOn(prisma.approvalStep, 'findMany').mockResolvedValue([]);
      await expect(service.findApprovals(SAM)).resolves.toEqual([]);
    });
  });

  describe('Step D: Blocking and comments', () => {
    it('blocking without a reason is refused (400)', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'In Progress' }));

      await expect(
        service.updateStatus('test-id', { status: 'Blocked' }, NORA),
      ).rejects.toThrow('A blockage reason is required to block a request.');
      await expect(
        service.updateStatus('test-id', { status: 'Blocked', blockedReason: '  ' }, NORA),
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
      }, NORA);

      expect(result.status).toBe('Blocked');
      expect(result.blockedReason).toBe('Waiting on vendor');
      expect(mockTx.serviceRequest.update).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        data: expect.objectContaining({ blockedReason: 'Waiting on vendor' }),
      });
    });

    it('addComment stores the comment with resolved author (ignores body authorId)', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'In Progress', requesterId: 'maya.requester' }));
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
        { body: '  Any update?  ', authorId: 'mallory' } as never,
        MAYA,
      );

      expect(comment.body).toBe('Any update?');
      expect(comment.authorId).toBe('maya.requester');
      expect(mockTx.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'commented', actorId: 'maya.requester' }),
      });
    });

    it('addComment refuses empty bodies', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'In Progress' }));

      await expect(service.addComment('test-id', { body: '   ' }, NORA)).rejects.toThrow(
        'Comment body is required.',
      );
    });
  });

  describe('Slice 4: Hybrid auto-gating on creation', () => {
    it('Finance >= $1000 opens Pending Approval with a designated step', async () => {
      mockTx.serviceRequest.create.mockImplementation(async (args: {
        data: Record<string, unknown>;
      }) => Promise.resolve({ ...buildRow(), ...(args.data as object), id: 'new-id' }));

      const result = await service.create(
        {
          title: 'Laptops',
          category: 'Finance',
          payloadJson: JSON.stringify({ amount: '4500 USD', costCenter: 'CC-1' }),
        },
        MAYA,
      );

      expect(result.status).toBe('Pending Approval');
      expect(mockTx.serviceRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'Pending Approval' }),
      });
      expect(mockTx.approvalStep.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          approverId: 'lina.finance-approver',
          status: 'pending',
        }),
      });
      expect(mockTx.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ from: null, to: 'Pending Approval' }),
      });
    });

    it('Finance below threshold and non-Finance stay Submitted without steps', async () => {
      mockTx.serviceRequest.create.mockImplementation(async (args: {
        data: Record<string, unknown>;
      }) => Promise.resolve({ ...buildRow(), ...(args.data as object), id: 'new-id' }));
      const stepsBefore = mockTx.approvalStep.create.mock.calls.length;

      const small = await service.create(
        {
          title: 'Cables',
          category: 'Finance',
          payloadJson: JSON.stringify({ amount: '50', costCenter: 'CC-1' }),
        },
        MAYA,
      );
      expect(small.status).toBe('Submitted');

      const it = await service.create(
        {
          title: 'VPN',
          category: 'IT',
          payloadJson: JSON.stringify({ system: 'VPN' }),
        },
        MAYA,
      );
      expect(it.status).toBe('Submitted');
      expect(mockTx.approvalStep.create.mock.calls.length).toBe(stepsBefore);
    });
  });

  describe('Slice 5: Reassignment within the department queue', () => {
    const itQueue = {
      id: 'queue-it',
      name: 'IT Queue',
      category: 'IT',
      ownerId: 'owner-it',
      backupOwnerId: 'backup-it',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('reassigns to a same-department handler with a reassigned audit', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(
          buildRow({ status: 'In Progress', queueId: 'queue-it', ownerId: 'owner-old' }),
        );
      jest.spyOn(prisma.queue, 'findUnique').mockResolvedValue(itQueue);
      mockTx.serviceRequest.update.mockResolvedValue(
        buildRow({ status: 'In Progress', queueId: 'queue-it', ownerId: 'omar.it-handler' }),
      );

      const result = await service.reassign(
        'test-id',
        { ownerId: 'omar.it-handler' },
        NORA,
      );

      expect(result.ownerId).toBe('omar.it-handler');
      expect(mockTx.serviceRequest.update).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        data: expect.objectContaining({ ownerId: 'omar.it-handler' }),
      });
      expect(mockTx.auditEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'reassigned',
          actorId: 'nora.ops-admin',
          from: 'owner-old',
          to: 'omar.it-handler',
        }),
      });
    });

    it('refuses bad input, wrong roles, cross-department targets and terminals', async () => {
      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'Submitted', queueId: 'queue-it' }));
      jest.spyOn(prisma.queue, 'findUnique').mockResolvedValue(itQueue);

      await expect(service.reassign('test-id', {}, NORA)).rejects.toThrow(
        'A new ownerId is required.',
      );
      await expect(service.reassign('test-id', { ownerId: 'ghost' }, NORA)).rejects.toThrow(
        'Unknown owner: ghost.',
      );
      await expect(
        service.reassign('test-id', { ownerId: 'omar.it-handler' }, MAYA),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.reassign('test-id', { ownerId: 'omar.it-handler' }, LINA),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.reassign('test-id', { ownerId: 'priya.hr-handler' }, NORA),
      ).rejects.toThrow('does not serve the IT queue');
      await expect(
        service.reassign('test-id', { ownerId: 'maya.requester' }, NORA),
      ).rejects.toThrow('does not serve the IT queue');

      jest
        .spyOn(prisma.serviceRequest, 'findUnique')
        .mockResolvedValue(buildRow({ status: 'Resolved', queueId: 'queue-it' }));
      await expect(
        service.reassign('test-id', { ownerId: 'omar.it-handler' }, NORA),
      ).rejects.toThrow('Request is immutable and cannot be updated');

      jest.spyOn(prisma.serviceRequest, 'findUnique').mockResolvedValue(null);
      await expect(
        service.reassign('test-id', { ownerId: 'omar.it-handler' }, NORA),
      ).rejects.toThrow('not found');
    });
  });

  describe('Step E: Category intake validation', () => {
    it('refuses intake missing required category fields', async () => {
      await expect(
        service.create({ title: 'Laptop', category: 'IT' }, MAYA),
      ).rejects.toThrow('Missing required fields for IT: system.');
      await expect(
        service.create({
          title: 'Bonus',
          category: 'Finance',
          payloadJson: JSON.stringify({ amount: '100' }),
        }, MAYA),
      ).rejects.toThrow('Missing required fields for Finance: costCenter.');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses malformed payloadJson', async () => {
      await expect(
        service.create({
          title: 'Laptop',
          category: 'IT',
          payloadJson: '{not-json',
        }, MAYA),
      ).rejects.toThrow('payloadJson must be a valid JSON object.');
      await expect(
        service.create({
          title: 'Laptop',
          category: 'IT',
          payloadJson: '["system"]',
        }, MAYA),
      ).rejects.toThrow('payloadJson must be a valid JSON object.');
    });

    it('accepts Legal intake and routes it like any category', async () => {
      mockTx.serviceRequest.create.mockImplementation(async (args: {
        data: Record<string, unknown>;
      }) => buildRow({ ...(args.data as object), status: 'Submitted' }));

      const result = await service.create({
        title: 'Vendor NDA review',
        category: 'Legal',
        payloadJson: JSON.stringify({ reviewType: 'Contract' }),
      }, MAYA);

      expect(result.category).toBe('Legal');
      expect(result.queueId).toBeDefined();
    });
  });
});
