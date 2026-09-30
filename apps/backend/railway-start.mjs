// Railway-only entrypoint: persistent SQLite on the /data volume + schema push + boot.
// Local usage is unchanged — `npm run start:backend` / `start:prod` never touch this file.
// Railway Start Command (Root Directory = repo root):
//   npm run start:railway --workspace=@internal/backend
//
// Env contract on Railway:
//   DATABASE_URL=file:/data/prod.db   (volume mount /data on the backend service ONLY)
//   SEED_DB_PATH=(optional) absolute path of an uploaded dev.db copy to import once.
//   PORT=(injected by Railway)         respected by src/main.ts
// Behaviour:
//   1. Defaults DATABASE_URL to file:/data/prod.db when unset (local .env still wins locally).
//   2. mkdir -p the sqlite parent dir (creates /data on Railway; no-op locally).
//   3. One-time seed: if SEED_DB_PATH (or prisma/seed.db) exists and target is missing/empty, copy it.
//   4. Runs `prisma db push --accept-data-loss` (idempotent; creates tables on first boot, no-op after).
//   5. Boots `node dist/src/main` (built by the Railway build command).

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = dirname(fileURLToPath(import.meta.url));
const prismaDir = resolve(backendDir, 'prisma');

// dotenv is already a backend dependency; reuse it so a local .env is honoured
// when DATABASE_URL is not exported (mirrors src/main.ts: shell exports win).
try {
  const { config } = await import('dotenv');
  config();
  config({ path: resolve(process.cwd(), 'apps/backend/.env') });
  config({ path: resolve(backendDir, '.env') });
} catch {
  // dotenv unavailable — fall through to env/defaults.
}

function stripFilePrefix(url) {
  const trimmed = (url ?? '').trim().replace(/^["']|["']$/g, '');
  const withoutPrefix = trimmed.startsWith('file:') ? trimmed.slice('file:'.length) : trimmed;
  // Drop query params (e.g. file:/data/prod.db?connection_limit=1) for filesystem ops.
  return withoutPrefix.split('?')[0];
}

const databaseUrl = process.env.DATABASE_URL?.trim() || 'file:/data/prod.db';
process.env.DATABASE_URL = databaseUrl;

const rawPath = stripFilePrefix(databaseUrl);
const dbPath = isAbsolute(rawPath) ? rawPath : resolve(prismaDir, rawPath);
mkdirSync(dirname(dbPath), { recursive: true });
console.log(`[railway-start] DATABASE_URL=${databaseUrl}`);
console.log(`[railway-start] sqlite file=${dbPath}`);

// One-time import of local dev.db data (user chose Import dev.db).
// Set SEED_DB_PATH to the uploaded copy, or place it at prisma/seed.db for one deploy,
// then remove it. Never overwrites a non-empty prod db.
const seedCandidates = [process.env.SEED_DB_PATH, resolve(prismaDir, 'seed.db')].filter(Boolean);
const targetMissingOrEmpty = !existsSync(dbPath) || statSync(dbPath).size === 0;
if (targetMissingOrEmpty) {
  const seed = seedCandidates.find((p) => existsSync(p));
  if (seed) {
    copyFileSync(seed, dbPath);
    console.log(`[railway-start] seeded ${dbPath} from ${seed}`);
  } else {
    console.log('[railway-start] no seed file found, starting from empty db (prisma db push will create schema)');
  }
} else {
  console.log('[railway-start] existing db kept (seed skipped to protect prod data)');
}

console.log('[railway-start] prisma db push --accept-data-loss');
const push = spawnSync('npx', ['prisma', 'db', 'push', '--accept-data-loss'], {
  cwd: backendDir,
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (push.status !== 0) {
  console.error(`[railway-start] prisma db push failed with code ${push.status}`);
  process.exit(push.status ?? 1);
}

console.log('[railway-start] starting backend: node dist/src/main');
const boot = spawnSync('node', [resolve(backendDir, 'dist/src/main')], {
  cwd: backendDir,
  env: process.env,
  stdio: 'inherit',
  shell: false,
});
process.exit(boot.status ?? 1);
