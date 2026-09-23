import * as path from 'path';
import { config as loadEnv } from 'dotenv';
// Load env explicitly so apps/backend/.env works no matter the cwd:
// - workspace runs (cwd = apps/backend) hit the default loadEnv()
// - root runs (cwd = repo root) need the explicit fallbacks below.
// Existing shell exports always win (dotenv never overrides them).
loadEnv();
loadEnv({ path: path.resolve(process.cwd(), 'apps/backend/.env') });
loadEnv({ path: path.resolve(__dirname, '..', '.env') });
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(3000);
}
bootstrap();
