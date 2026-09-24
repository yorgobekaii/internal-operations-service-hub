import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { USER_ROLE_HEADER } from '@internal/shared';
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
    await prisma.serviceRequest.deleteMany({});
  }, 60000);

  afterAll(async () => {
    if (createdIds.length > 0) {
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

  async function createRequest(title = 'E2E Test DB', category = 'Finance') {
    const res = await request(app.getHttpServer())
      .post('/service-requests')
      .send({ title, category })
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

  it('Approval gating: Submitted -> Pending Approval -> In Progress succeeds', async () => {
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

    await request(app.getHttpServer())
      .patch(`/service-requests/${id}/status`)
      .set(USER_ROLE_HEADER, 'admin')
      .send({ status: 'In Progress' })
      .expect(200)
      .expect((res) => {
        if (res.body.status !== 'In Progress')
          throw new Error('Expected In Progress');
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
      .send({ title: 'E2E Priority', category: 'Finance', priority: 'High' })
      .expect(201);
    createdIds.push(res.body.id);
    expect(res.body.priority).toBe('High');
  });

  it('Step A: POST creates an audit entry with actor + slaDueAt (backward compat 3-field payload)', async () => {
    const res = await request(app.getHttpServer())
      .post('/service-requests')
      .send({ title: 'E2E Audit Create', category: 'IT' })
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
});
