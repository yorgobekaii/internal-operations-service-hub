import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('2-Backend-to-database integration test: Should persist and retrieve a ServiceRequest via SQLite', async () => {
    const postRes = await request(app.getHttpServer())
      .post('/service-requests')
      .send({ title: 'E2E Test DB', category: 'Finance' })
      .expect(201);
      
    expect(postRes.body.id).toBeDefined();
    expect(postRes.body.title).toBe('E2E Test DB');

    const getRes = await request(app.getHttpServer())
      .get(`/service-requests/${postRes.body.id}`)
      .expect(200);

    expect(getRes.body.id).toBe(postRes.body.id);
    expect(getRes.body.title).toBe('E2E Test DB');
  });
});
