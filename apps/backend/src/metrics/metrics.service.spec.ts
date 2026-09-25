import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import { PrismaService } from '../prisma/prisma.service';

const NOW = new Date('2026-09-25T12:00:00Z');
const h = (n: number) => new Date(NOW.getTime() - n * 60 * 60 * 1000);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r-x',
    title: 'Metric fixture',
    category: 'IT',
    status: 'Submitted',
    priority: 'Standard',
    description: null,
    requesterId: null,
    queueId: 'q-it',
    ownerId: null,
    backupOwnerId: null,
    blockedReason: null,
    slaDueAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    payloadJson: null,
    createdAt: h(1),
    updatedAt: h(1),
    ...overrides,
  };
}

const QUEUES = [
  {
    id: 'q-it',
    name: 'IT Queue',
    category: 'IT',
    ownerId: null,
    backupOwnerId: null,
    createdAt: h(100),
    updatedAt: h(100),
  },
];

describe('MetricsService', () => {
  let service: MetricsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        {
          provide: PrismaService,
          useValue: {
            serviceRequest: { findMany: jest.fn().mockResolvedValue([]) },
            queue: { findMany: jest.fn().mockResolvedValue(QUEUES) },
          },
        },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('reports zeros and nulls on an empty store', async () => {
    const report = await service.getQueueHealth(NOW);

    expect(report.backlog).toBe(0);
    expect(report.breachedOpen).toBe(0);
    expect(report.breachedOpenIds).toEqual([]);
    expect(report.resolvedLate).toBe(0);
    expect(report.avgQueueAgeHours).toBeNull();
    expect(report.avgCycleHours).toBeNull();
    expect(report.volume).toEqual({ total: 0, last24h: 0 });
    expect(report.perQueue).toEqual([]);
  });

  it('computes backlog, breaches, late resolutions, ages and cycles', async () => {
    jest.spyOn(prisma.serviceRequest, 'findMany').mockResolvedValue([
      row({ id: 'r1', status: 'In Progress', createdAt: h(10), updatedAt: h(9), slaDueAt: h(2) }),
      row({ id: 'r2', status: 'Submitted', createdAt: h(2), updatedAt: h(2), slaDueAt: new Date(NOW.getTime() + 70 * 60 * 60 * 1000) }),
      row({ id: 'r3', status: 'Resolved', queueId: 'q-hr', createdAt: h(48), updatedAt: h(46), slaDueAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000) }),
      row({ id: 'r4', status: 'Resolved', queueId: 'q-fin', createdAt: h(100), updatedAt: h(10), slaDueAt: h(76) }),
      row({ id: 'r5', status: 'Declined', queueId: null, createdAt: h(30), updatedAt: h(29) }),
    ]);

    const report = await service.getQueueHealth(NOW);

    expect(report.volume.total).toBe(5);
    expect(report.volume.last24h).toBe(2);
    expect(report.backlog).toBe(2);
    expect(report.breachedOpen).toBe(1);
    expect(report.breachedOpenIds).toEqual(['r1']);
    expect(report.resolvedLate).toBe(1);
    expect(report.avgQueueAgeHours).toBeCloseTo(6, 5);
    expect(report.avgCycleHours).toBeCloseTo(46, 5);
    expect(report.perQueue).toHaveLength(1);
    expect(report.perQueue[0]).toMatchObject({
      queueId: 'q-it',
      category: 'IT',
      open: 2,
      breached: 1,
    });
    expect(report.perQueue[0].avgAgeHours).toBeCloseTo(6, 5);
  });

  it('buckets unrouted open requests separately', async () => {
    jest.spyOn(prisma.serviceRequest, 'findMany').mockResolvedValue([
      row({ id: 'r9', queueId: null, createdAt: h(4), updatedAt: h(4) }),
    ]);

    const report = await service.getQueueHealth(NOW);

    expect(report.backlog).toBe(1);
    expect(report.perQueue).toHaveLength(1);
    expect(report.perQueue[0]).toMatchObject({
      queueId: null,
      category: '—',
      name: 'Unrouted',
      open: 1,
    });
  });
});
