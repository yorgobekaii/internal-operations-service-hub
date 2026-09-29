import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ensureTestDatabase, TEST_DATABASE_URL } from './test-database';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.AI_PROVIDER = 'mock';

describe('Admin command center E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testUserId = 'admin-visibility-test';

  beforeAll(async () => {
    ensureTestDatabase();
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.adminAuditEntry.deleteMany({ where: { entityId: testUserId } });
  });

  afterAll(async () => {
    await prisma.adminAuditEntry.deleteMany({ where: { entityId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await app.close();
  });

  it('protects all admin routes from non-admin actors', async () => {
    await request(app.getHttpServer()).get('/admin/users').set('x-user-id', 'maya.requester').expect(403);
    await request(app.getHttpServer()).get('/admin/settings').set('x-user-id', 'omar.it-handler').expect(403);
    await request(app.getHttpServer()).get('/admin/audit').expect(403);
    await request(app.getHttpServer()).get('/metrics/queue-health').set('x-user-id', 'maya.requester').expect(403);
  });

  it('supports all-time and date-filtered queue health snapshots', async () => {
    const allTime = await request(app.getHttpServer()).get('/metrics/queue-health').set('x-user-id', 'nora.ops-admin').expect(200);
    const dated = await request(app.getHttpServer()).get('/metrics/queue-health?asOf=2030-01-01').set('x-user-id', 'nora.ops-admin').expect(200);
    expect(allTime.body).toHaveProperty('backlog');
    expect(dated.body).toHaveProperty('backlog');
    expect(new Date(dated.body.generatedAt).toISOString()).toBe('2030-01-01T23:59:59.999Z');
  });

  it('creates, edits, hides, resolves, and deactivates a teaching actor', async () => {
    const department = await prisma.department.findUnique({ where: { name: 'IT' } });
    expect(department).toBeTruthy();
    await request(app.getHttpServer()).post('/admin/users').set('x-user-id', 'nora.ops-admin').send({
      id: testUserId, name: 'Visibility Test', email: 'visibility.test@internal.local', role: 'requester', departmentId: department?.id,
    }).expect(201);

    await request(app.getHttpServer()).patch(`/admin/users/${testUserId}`).set('x-user-id', 'nora.ops-admin').send({
      name: 'Renamed Test', role: 'handler', pickerVisible: false, departmentId: department?.id,
    }).expect(200);

    const roster = await request(app.getHttpServer()).get('/actors').expect(200);
    expect(roster.body.map((actor: { id: string }) => actor.id)).not.toContain(testUserId);

    await request(app.getHttpServer()).get('/actors/me').set('x-user-id', testUserId).expect(200).expect((res) => {
      expect(res.body).toMatchObject({ id: testUserId, name: 'Renamed Test', role: 'handler', pickerVisible: false });
    });

    await request(app.getHttpServer()).post(`/admin/users/${testUserId}/deactivate`).set('x-user-id', 'nora.ops-admin').send({}).expect(201);
    await request(app.getHttpServer()).get('/actors/me').set('x-user-id', testUserId).expect(403);

    const audit = await request(app.getHttpServer()).get('/admin/audit').set('x-user-id', 'nora.ops-admin').expect(200);
    expect(audit.body.some((entry: { entityId: string; action: string }) => entry.entityId === testUserId && entry.action === 'updated')).toBe(true);
    expect(audit.body.some((entry: { entityId: string; action: string }) => entry.entityId === testUserId && entry.action === 'deactivated')).toBe(true);
  });
});
