import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { USER_ID_HEADER, USER_ROLE_HEADER } from '@internal/shared';
import {
  TEST_DATABASE_URL,
  cleanupTestDatabase,
  ensureTestDatabase,
} from './test-database';

// Belt-and-braces: guarantee isolation even if jest setupFiles is bypassed.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.AI_PROVIDER = 'mock';

describe('AppController (e2e) [isolated test.db]', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdIds: string[] = [];

  beforeAll(async () => {
    // Automated pre-test migration: create/migrate prisma/test.db (never dev.db).
    ensureTestDatabase();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    // Start clean inside the isolated DB.
    await prisma.auditEntry.deleteMany({}).catch(() => undefined);
    await prisma.approvalStep.deleteMany({}).catch(() => undefined);
    await prisma.comment.deleteMany({}).catch(() => undefined);
    await prisma.serviceRequest.deleteMany({});
    await prisma.queue.deleteMany({}).catch(() => undefined);
    await prisma.user.deleteMany({}).catch(() => undefined);
  }, 60000);

  afterAll(async () => {
    if (createdIds.length > 0) {
      try {
        await prisma.comment.deleteMany({
          where: { requestId: { in: createdIds } },
        });
      } catch {
        // Comment table missing or app torn down — nothing to clean.
      }
      try {
        await prisma.auditEntry.deleteMany({
          where: { requestId: { in: createdIds } },
        });
      } catch {
        // Audit table missing or app torn down — nothing to clean.
      }
      try {
        await prisma.serviceRequest.deleteMany({
          where: { id: { in: createdIds } },
        });
      } catch {
        // App may already be torn down in failure paths.
      }
    }
    await cleanupTestDatabase(prisma);
    await app.close();
  });

  /** Minimal valid category extras (Step E intake contracts). */
  function extrasFor(category: string): Record<string, string> {
    switch (category) {
      case 'IT':
        return { system: 'Jira' };
      case 'HR':
        return { topic: 'Leave' };
      case 'Finance':
        return { amount: '100', costCenter: 'CC-1' };
      case 'Operations':
        return { location: 'HQ' };
      case 'Legal':
        return { reviewType: 'Contract' };
      default:
        return {};
    }
  }

  function validPayload(title: string, category: string, extra?: Record<string, unknown>) {
    return {
      title,
      category,
      payloadJson: JSON.stringify({ ...extrasFor(category), ...(extra ?? {}) }),
    };
  }

  async function createRequest(title = 'E2E Test DB', category = 'Finance') {
    const res = await request(app.getHttpServer())
      .post('/service-requests')
      .send(validPayload(title, category))
      .expect(201);
    createdIds.push(res.body.id);
    return res;
  }

  it('2-Backend-to-database integration test: Should persist and retrieve a ServiceRequest via SQLite', async () => {
    const postRes = await createRequest('E2E Test DB', 'Finance');

    expect(postRes.body.id).toBeDefined();
    expect(postRes.body.title).toBe('E2E Test DB');

    const getRes = await request(app.getHttpServer())
      .get(`/service-requests/${postRes.body.id}`)
      .expect(200);

    expect(getRes.body.id).toBe(postRes.body.id);
    expect(getRes.body.title).toBe('E2E Test DB');
  });

  it('3-Meaningful E2E test: Full POST -> PATCH -> GET lifecycle (Submitted -> In Progress -> Resolved)', async () => {
    const postRes = await createRequest('E2E Lifecycle', 'IT');
    const id = postRes.body.id;
    expect(postRes.body.status).toBe('Submitted');

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'In Progress' })
      .expect(200)
      .expect((res) => {
        if (res.body.status !== 'In Progress')
          throw new Error('Expected In Progress');
      });

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'admin')
      .send({ status: 'Resolved' })
      .expect(200)
      .expect((res) => {
        if (res.body.status !== 'Resolved')
          throw new Error('Expected Resolved');
      });

    const getRes = await request(app.getHttpServer())
      .get(`/service-requests/${id}`)
      .expect(200);
    expect(getRes.body.status).toBe('Resolved');
  });

  it('Authorization allowed: PATCH with x-user-role operator succeeds (200)', async () => {
    const postRes = await createRequest('E2E Auth Allowed', 'HR');
    await request(app.getHttpServer())
      .patch(`/service-requests/${postRes.body.id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'In Progress' })
      .expect(200);
  });

  it('Authorization denied: PATCH without role header returns 403', async () => {
    const postRes = await createRequest('E2E Auth Denied', 'HR');
    await request(app.getHttpServer())
      .patch(`/service-requests/${postRes.body.id}/status`)
      .send({ status: 'In Progress' })
      .expect(403);
  });

  it('Authorization denied: PATCH with non-operator role returns 403', async () => {
    const postRes = await createRequest('E2E Auth Wrong Role', 'HR');
    await request(app.getHttpServer())
      .patch(`/service-requests/${postRes.body.id}/status`)
      .set(USER_ROLE_HEADER, 'viewer')
      .send({ status: 'In Progress' })
      .expect(403);
  });

  it('Invalid request: POST with empty title returns 400', async () => {
    await request(app.getHttpServer())
      .post('/service-requests')
      .send({ title: '', category: 'IT' })
      .expect(400);
  });

  it('Invalid request: POST with missing category returns 400', async () => {
    await request(app.getHttpServer())
      .post('/service-requests')
      .send({ title: 'No category' })
      .expect(400);
  });

  it('Invalid request: PATCH with unknown status returns 400', async () => {
    const postRes = await createRequest('E2E Bad Status', 'IT');
    await request(app.getHttpServer())
      .patch(`/service-requests/${postRes.body.id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'Flying' })
      .expect(400);
  });

  it('Invalid transition: Submitted -> Resolved returns 400', async () => {
    const postRes = await createRequest('E2E Illegal Skip', 'IT');
    await request(app.getHttpServer())
      .patch(`/service-requests/${postRes.body.id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'Resolved' })
      .expect(400);
  });

  it('Expected failure: GET non-existent ID returns 404', async () => {
    await request(app.getHttpServer())
      .get('/service-requests/non-existent-id-12345')
      .expect(404);
  });

  it('Expected failure: PATCH non-existent ID returns 404', async () => {
    await request(app.getHttpServer())
      .patch('/service-requests/non-existent-id-12345/status')
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'In Progress' })
      .expect(404);
  });

  it('Immutable: PATCH on Resolved request returns 422', async () => {
    const postRes = await createRequest('E2E Immutable', 'Operations');
    const id = postRes.body.id;

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'In Progress' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'Resolved' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'In Progress' })
      .expect(422);
  });

  it('Invalid request: POST with unknown category returns 400', async () => {
    await request(app.getHttpServer())
      .post('/service-requests')
      .send({ title: 'Bad category', category: 'Flying' })
      .expect(400);
  });

  it('Approval gating: Submitted -> Pending Approval opens a step; direct PATCH to In Progress is 422 until approved', async () => {
    const postRes = await createRequest('E2E Approval Gate', 'Finance');
    const id = postRes.body.id;
    expect(postRes.body.status).toBe('Submitted');

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'Pending Approval' })
      .expect(200)
      .expect((res) => {
        if (res.body.status !== 'Pending Approval')
          throw new Error('Expected Pending Approval');
      });

    // Gate enforced: fulfillment cannot start while approval is pending.
    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'admin')
      .send({ status: 'In Progress' })
      .expect(422);

    await request(app.getHttpServer())
      .post(`/service-requests/${id}/approve`)
      .set(USER_ROLE_HEADER, 'admin')
      .send({})
      .expect(201)
      .expect((res) => {
        if (res.body.status !== 'In Progress')
          throw new Error('Expected In Progress after approval');
      });
  });

  it('Immutable: PATCH on Declined request returns 422', async () => {
    const postRes = await createRequest('E2E Declined Immutable', 'IT');
    const id = postRes.body.id;

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'In Progress' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'Declined' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'In Progress' })
      .expect(422);
  });

  it('AI triage: POST /ai-triage suggests IT advisory (200, no DB write)', async () => {
    const res = await request(app.getHttpServer())
      .post('/service-requests/ai-triage')
      .send({ description: "My laptop screen is flickering and won't turn on" })
      .expect(200);
    expect(res.body.category).toBe('IT');
    expect(res.body.title).toBeDefined();
    expect(res.body.priority).toBeDefined();
    expect(res.body.modelVersion).toBeDefined();
  });

  it('AI triage: POST /ai-triage with empty description returns 400', async () => {
    await request(app.getHttpServer())
      .post('/service-requests/ai-triage')
      .send({ description: '' })
      .expect(400);
  });

  it('Priority persists: POST with priority High returns High', async () => {
    const res = await request(app.getHttpServer())
      .post('/service-requests')
      .send({ ...validPayload('E2E Priority', 'Finance'), priority: 'High' })
      .expect(201);
    createdIds.push(res.body.id);
    expect(res.body.priority).toBe('High');
  });

  it('Step A: POST creates an audit entry with actor + slaDueAt (backward compat 3-field payload)', async () => {
    const res = await request(app.getHttpServer())
      .post('/service-requests')
      .send(validPayload('E2E Audit Create', 'IT'))
      .expect(201);
    createdIds.push(res.body.id);
    expect(res.body.status).toBe('Submitted');
    expect(res.body.slaDueAt).toBeDefined();

    const audit = await request(app.getHttpServer())
      .get(`/service-requests/${res.body.id}/audit`)
      .expect(200);
    expect(Array.isArray(audit.body)).toBe(true);
    expect(audit.body).toHaveLength(1);
    expect(audit.body[0]).toMatchObject({
      requestId: res.body.id,
      to: 'Submitted',
      action: 'created',
    });
    expect(audit.body[0].actorId).toBeDefined();
  });

  it('Step A: PATCH appends a status_changed audit entry with header actor', async () => {
    const postRes = await createRequest('E2E Audit Patch', 'HR');
    const id = postRes.body.id;

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'In Progress' })
      .expect(200);

    const audit = await request(app.getHttpServer())
      .get(`/service-requests/${id}/audit`)
      .expect(200);
    expect(audit.body).toHaveLength(2);
    expect(audit.body[0]).toMatchObject({ action: 'created', to: 'Submitted' });
    expect(audit.body[1]).toMatchObject({
      from: 'Submitted',
      to: 'In Progress',
      action: 'status_changed',
    });
    expect(audit.body[1].actorId).toBe('operator');
  });

  it('Step A: GET audit for non-existent ID returns 404', async () => {
    await request(app.getHttpServer())
      .get('/service-requests/non-existent-id-12345/audit')
      .expect(404);
  });

  it('Step B: POST auto-routes to the category queue with owner + backup', async () => {
    const res = await request(app.getHttpServer())
      .post('/service-requests')
      .send(validPayload('E2E Routed', 'IT'))
      .expect(201);
    createdIds.push(res.body.id);

    expect(res.body.queueId).toBeDefined();
    expect(res.body.ownerId).toBeDefined();
    expect(res.body.backupOwnerId).toBeDefined();
    expect(res.body.ownerId).not.toBe(res.body.backupOwnerId);

    const queues = await request(app.getHttpServer())
      .get('/queues')
      .expect(200);
    const itQueue = queues.body.find((q: { category: string }) => q.category === 'IT');
    expect(itQueue).toBeDefined();
    expect(res.body.queueId).toBe(itQueue.id);
  });

  it('Step B: requester isolation — alice sees own, bob does not', async () => {
    const res = await request(app.getHttpServer())
      .post('/service-requests')
      .set(USER_ID_HEADER, 'alice@internal.local')
      .set(USER_ROLE_HEADER, 'requester')
      .send(validPayload('E2E Alice Own', 'HR'))
      .expect(201);
    createdIds.push(res.body.id);
    expect(res.body.requesterId).toBe('alice@internal.local');

    const aliceList = await request(app.getHttpServer())
      .get('/service-requests')
      .set(USER_ID_HEADER, 'alice@internal.local')
      .set(USER_ROLE_HEADER, 'requester')
      .expect(200);
    expect(aliceList.body.map((r: { id: string }) => r.id)).toContain(res.body.id);

    const bobList = await request(app.getHttpServer())
      .get('/service-requests')
      .set(USER_ID_HEADER, 'bob@internal.local')
      .set(USER_ROLE_HEADER, 'requester')
      .expect(200);
    expect(bobList.body.map((r: { id: string }) => r.id)).not.toContain(res.body.id);

    await request(app.getHttpServer())
      .get(`/service-requests/${res.body.id}`)
      .set(USER_ID_HEADER, 'bob@internal.local')
      .set(USER_ROLE_HEADER, 'requester')
      .expect(403);

    // Legacy callers without identity keep the old open behavior.
    const legacyList = await request(app.getHttpServer())
      .get('/service-requests')
      .expect(200);
    expect(legacyList.body.map((r: { id: string }) => r.id)).toContain(res.body.id);
  });

  it('Step B: department operator is confined to their queue', async () => {
    const itRes = await request(app.getHttpServer())
      .post('/service-requests')
      .send(validPayload('E2E IT Scoped', 'IT'))
      .expect(201);
    createdIds.push(itRes.body.id);
    const hrRes = await request(app.getHttpServer())
      .post('/service-requests')
      .send(validPayload('E2E HR Scoped', 'HR'))
      .expect(201);
    createdIds.push(hrRes.body.id);

    const itList = await request(app.getHttpServer())
      .get('/service-requests')
      .set(USER_ID_HEADER, 'it.op@internal.local')
      .set(USER_ROLE_HEADER, 'operator')
      .set('x-user-dept', 'IT')
      .expect(200);
    const ids = itList.body.map((r: { id: string }) => r.id);
    expect(ids).toContain(itRes.body.id);
    expect(ids).not.toContain(hrRes.body.id);

    await request(app.getHttpServer())
      .patch(`/service-requests/${hrRes.body.id}/status`)
      .set(USER_ID_HEADER, 'it.op@internal.local')
      .set(USER_ROLE_HEADER, 'operator')
      .set('x-user-dept', 'IT')
      .send({ status: 'In Progress' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/service-requests/${itRes.body.id}/status`)
      .set(USER_ID_HEADER, 'it.op@internal.local')
      .set(USER_ROLE_HEADER, 'operator')
      .set('x-user-dept', 'IT')
      .send({ status: 'In Progress' })
      .expect(200);
  });

  it('Step B: GET /queues/:id/requests filters + paginates', async () => {
    const queues = await request(app.getHttpServer())
      .get('/queues')
      .expect(200);
    expect(queues.body.length).toBeGreaterThanOrEqual(4);
    const finance = queues.body.find((q: { category: string }) => q.category === 'Finance');
    expect(finance.openCount).toBeDefined();

    const one = await request(app.getHttpServer())
      .post('/service-requests')
      .send(validPayload('E2E Queue Page', 'Finance'))
      .expect(201);
    createdIds.push(one.body.id);

    const page = await request(app.getHttpServer())
      .get(`/queues/${finance.id}/requests?status=Submitted&limit=1&page=1`)
      .expect(200);
    expect(page.body.total).toBeGreaterThanOrEqual(1);
    expect(page.body.data.length).toBeLessThanOrEqual(1);
    expect(page.body.data[0].queueId).toBe(finance.id);

    await request(app.getHttpServer())
      .get(`/queues/${finance.id}/requests?status=Flying`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/queues/no-such-queue/requests')
      .expect(404);
  });

  it('Step C: reject requires rationale, then declines with rejected audit', async () => {
    const postRes = await createRequest('E2E Reject Flow', 'Finance');
    const id = postRes.body.id;

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'Pending Approval' })
      .expect(200);

    // Missing rationale is refused; state unchanged.
    await request(app.getHttpServer())
      .post(`/service-requests/${id}/reject`)
      .set(USER_ROLE_HEADER, 'admin')
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .post(`/service-requests/${id}/reject`)
      .set(USER_ROLE_HEADER, 'admin')
      .set(USER_ID_HEADER, 'cfo@internal.local')
      .send({ rationale: 'Over budget for Q3' })
      .expect(201)
      .expect((res) => {
        if (res.body.status !== 'Declined') throw new Error('Expected Declined');
      });

    const audit = await request(app.getHttpServer())
      .get(`/service-requests/${id}/audit`)
      .expect(200);
    const last = audit.body[audit.body.length - 1];
    expect(last).toMatchObject({
      from: 'Pending Approval',
      to: 'Declined',
      action: 'rejected',
      actorId: 'cfo@internal.local',
    });

    const steps = await prisma.approvalStep.findMany({ where: { requestId: id } });
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ status: 'rejected', rationale: 'Over budget for Q3' });
  });

  it('Step C: approve records approver + approved audit; double-decide is refused', async () => {
    const postRes = await createRequest('E2E Approve Flow', 'IT');
    const id = postRes.body.id;

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'Pending Approval' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/service-requests/${id}/approve`)
      .set(USER_ROLE_HEADER, 'operator')
      .set(USER_ID_HEADER, 'it.lead@internal.local')
      .send({})
      .expect(201);

    const audit = await request(app.getHttpServer())
      .get(`/service-requests/${id}/audit`)
      .expect(200);
    const last = audit.body[audit.body.length - 1];
    expect(last).toMatchObject({
      from: 'Pending Approval',
      to: 'In Progress',
      action: 'approved',
      actorId: 'it.lead@internal.local',
    });

    // Decided twice is refused: no longer pending.
    await request(app.getHttpServer())
      .post(`/service-requests/${id}/approve`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post(`/service-requests/${id}/reject`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ rationale: 'too late' })
      .expect(400);
  });

  it('Step C: approve/reject need operator role; GET /approvals lists the gate', async () => {
    const postRes = await createRequest('E2E Approvals Queue', 'Operations');
    const id = postRes.body.id;

    await request(app.getHttpServer())
      .post(`/service-requests/${id}/approve`)
      .send({})
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'Pending Approval' })
      .expect(200);

    const queue = await request(app.getHttpServer()).get('/approvals').expect(200);
    expect(queue.body.map((r: { id: string }) => r.id)).toContain(id);

    // Requester sees only their own gated items.
    const other = await request(app.getHttpServer())
      .get('/approvals')
      .set(USER_ID_HEADER, 'stranger@internal.local')
      .set(USER_ROLE_HEADER, 'requester')
      .expect(200);
    expect(other.body.map((r: { id: string }) => r.id)).not.toContain(id);
  });

  it('Step D: blocking requires a reason, which is then visible', async () => {
    const postRes = await createRequest('E2E Blocked Reason', 'IT');
    const id = postRes.body.id;

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'In Progress' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'Blocked' })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'Blocked', blockedReason: 'Waiting on vendor part' })
      .expect(200)
      .expect((res) => {
        if (res.body.blockedReason !== 'Waiting on vendor part')
          throw new Error('Expected blockedReason to persist');
      });

    const getRes = await request(app.getHttpServer())
      .get(`/service-requests/${id}`)
      .expect(200);
    expect(getRes.body.blockedReason).toBe('Waiting on vendor part');

    // Resuming clears the reason.
    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'In Progress' })
      .expect(200)
      .expect((res) => {
        if (res.body.blockedReason !== null)
          throw new Error('Expected blockedReason to clear on resume');
      });
  });

  it('Step D: comments post, list oldest-first, and audit the thread', async () => {
    const postRes = await request(app.getHttpServer())
      .post('/service-requests')
      .set(USER_ID_HEADER, 'alice@internal.local')
      .set(USER_ROLE_HEADER, 'requester')
      .send(validPayload('E2E Comments', 'HR'))
      .expect(201);
    createdIds.push(postRes.body.id);
    const id = postRes.body.id;

    await request(app.getHttpServer())
      .post(`/service-requests/${id}/comments`)
      .send({})
      .expect(400);

    const first = await request(app.getHttpServer())
      .post(`/service-requests/${id}/comments`)
      .set(USER_ID_HEADER, 'alice@internal.local')
      .send({ body: 'Any update on this?' })
      .expect(201);
    expect(first.body).toMatchObject({
      requestId: id,
      authorId: 'alice@internal.local',
      body: 'Any update on this?',
    });

    await request(app.getHttpServer())
      .post(`/service-requests/${id}/comments`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ body: 'On it today.' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/service-requests/${id}/comments`)
      .expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body[0].body).toBe('Any update on this?');
    expect(list.body[1].body).toBe('On it today.');

    const audit = await request(app.getHttpServer())
      .get(`/service-requests/${id}/audit`)
      .expect(200);
    expect(
      audit.body.filter((e: { action: string }) => e.action === 'commented'),
    ).toHaveLength(2);

    await request(app.getHttpServer())
      .get('/service-requests/non-existent-id-12345/comments')
      .expect(404);
    await request(app.getHttpServer())
      .post('/service-requests/non-existent-id-12345/comments')
      .send({ body: 'hello' })
      .expect(404);
  });

  it('Step E: intake without required category fields is refused with guidance', async () => {
    await request(app.getHttpServer())
      .post('/service-requests')
      .send({ title: 'Bare IT ask', category: 'IT' })
      .expect(400)
      .expect((res) => {
        const msg = JSON.stringify(res.body.message ?? res.body);
        if (!msg.includes('system')) throw new Error(`Expected missing-field guidance, got: ${msg}`);
      });

    await request(app.getHttpServer())
      .post('/service-requests')
      .send({
        title: 'Bare finance ask',
        category: 'Finance',
        payloadJson: JSON.stringify({ amount: '50' }),
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/service-requests')
      .send({ title: 'Broken bag', category: 'IT', payloadJson: '{oops' })
      .expect(400);
  });

  it('Step E: Legal intake routes end-to-end with its own queue', async () => {
    const res = await request(app.getHttpServer())
      .post('/service-requests')
      .send(validPayload('Vendor NDA review', 'Legal'))
      .expect(201);
    createdIds.push(res.body.id);
    expect(res.body.category).toBe('Legal');
    expect(res.body.queueId).toBeDefined();
    expect(res.body.ownerId).toBeDefined();
    expect(JSON.parse(res.body.payloadJson)).toMatchObject({ reviewType: 'Contract' });

    const queues = await request(app.getHttpServer()).get('/queues').expect(200);
    const legal = queues.body.find((q: { category: string }) => q.category === 'Legal');
    expect(legal).toBeDefined();
    expect(res.body.queueId).toBe(legal.id);

    const triage = await request(app.getHttpServer())
      .post('/service-requests/ai-triage')
      .send({ description: 'Need legal counsel to review a vendor NDA before signing' })
      .expect(200);
    expect(triage.body.category).toBe('Legal');
  });

  it('Step F: GET /metrics/queue-health reflects volume, backlog, breaches and cycles', async () => {
    const open = await createRequest('E2E Metrics Open', 'IT');
    const cycled = await createRequest('E2E Metrics Cycle', 'HR');

    await request(app.getHttpServer())
      .patch(`/service-requests/${cycled.body.id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'In Progress' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/service-requests/${cycled.body.id}/status`)
      .set(USER_ROLE_HEADER, 'operator')
      .send({ status: 'Resolved' })
      .expect(200);

    // Force the open ticket past its SLA directly (deterministic breach).
    await prisma.serviceRequest.update({
      where: { id: open.body.id },
      data: { slaDueAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    const metrics = await request(app.getHttpServer())
      .get('/metrics/queue-health')
      .expect(200);
    expect(metrics.body.backlog).toBeGreaterThanOrEqual(1);
    expect(metrics.body.breachedOpen).toBeGreaterThanOrEqual(1);
    expect(metrics.body.breachedOpenIds).toContain(open.body.id);
    expect(metrics.body.volume.total).toBeGreaterThanOrEqual(2);
    expect(metrics.body.volume.last24h).toBeGreaterThanOrEqual(2);
    expect(metrics.body.avgCycleHours).not.toBeNull();
    expect(Array.isArray(metrics.body.perQueue)).toBe(true);
    const itQueue = metrics.body.perQueue.find(
      (q: { category: string }) => q.category === 'IT',
    );
    expect(itQueue).toBeDefined();
    expect(itQueue.open).toBeGreaterThanOrEqual(1);
  });
});
