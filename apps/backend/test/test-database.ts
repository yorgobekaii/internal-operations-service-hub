import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Isolated SQLite test database.
 * E2E tests NEVER touch prisma/dev.db. They use prisma/test.db via
 * DATABASE_URL=file:./test.db (resolved by Prisma relative to prisma/schema.prisma).
 */
export const TEST_DATABASE_URL = 'file:./test.db';

export function getPrismaDir(): string {
  return path.join(__dirname, '..', 'prisma');
}

export function getTestDbPath(): string {
  return path.join(getPrismaDir(), 'test.db');
}

export function getDevDbPath(): string {
  return path.join(getPrismaDir(), 'dev.db');
}

/** Create/migrate prisma/test.db before the Nest app boots. */
export function ensureTestDatabase(): void {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const backendDir = path.join(__dirname, '..');
  execSync('npx prisma db push --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    cwd: backendDir,
    stdio: 'pipe',
  });
  // Start each run clean (schema push keeps tables; wipe rows).
  const testDb = getTestDbPath();
  if (fs.existsSync(testDb)) {
    // Rows are wiped after app boot via deleteMany; file itself is kept.
  }
}

/** Remove all rows from test.db (called in afterAll as belt-and-braces). */
export async function cleanupTestDatabase(
  prisma: PrismaService,
): Promise<void> {
  try {
    await prisma.auditEntry.deleteMany({});
  } catch {
    // Table missing on old DBs — nothing to clean.
  }
  try {
    await prisma.serviceRequest.deleteMany({});
  } catch {
    // App already closed or table missing — nothing to clean.
  }
}
