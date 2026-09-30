import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const useShell = process.platform === 'win32';
const releaseEnv = {
  ...process.env,
  PORT: '3000',
  DATABASE_URL: 'file:./playwright.db',
  AI_PROVIDER: 'mock',
  NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3000',
  PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:3001',
  PLAYWRIGHT_SKIP_WEBSERVER: '1',
  HEALTH_URL: 'http://127.0.0.1:3000/health',
};
const testEnv = { ...releaseEnv, DATABASE_URL: 'file:./test.db' };

function run(args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, args, {
      cwd: root,
      env,
      stdio: 'inherit',
      shell: useShell,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${code ?? signal}): npm ${args.join(' ')}`));
    });
  });
}

function start(args, env) {
  const child = spawn(npmCommand, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: useShell,
  });
  child.once('error', (error) => console.error(error));
  return child;
}

function stop(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

async function waitForHealth() {
  const deadline = Date.now() + 60000;
  let lastError = 'backend has not started';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(releaseEnv.HEALTH_URL);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${releaseEnv.HEALTH_URL}: ${lastError}`);
}

const staticGate = [
  ['run', 'build:shared'],
  ['run', 'prisma:validate', '--workspace=@internal/backend'],
  ['run', 'build:backend'],
  ['run', 'lint', '--workspace=frontend'],
  ['run', 'build', '--workspace=frontend'],
  ['run', 'test:backend'],
  ['run', 'test:backend:e2e'],
  ['run', 'eval:triage'],
];

let backend;
let frontend;
try {
  for (const args of staticGate) await run(args, testEnv);

  // The isolated Jest gate has already created and validated the schema. Copy
  // that clean schema database into the separate browser target; this avoids
  // Windows schema-engine creation failures while never touching dev.db.
  copyFileSync(
    join(root, 'apps/backend/prisma/test.db'),
    join(root, 'apps/backend/prisma/playwright.db'),
  );
  backend = start(['run', 'start:prod', '--workspace=@internal/backend'], releaseEnv);
  await waitForHealth();
  await run(['run', 'health:check'], releaseEnv);

  // Playwright browsers are not downloaded by `npm install`. Install chromium
  // here so `verify:release` is self-healing on fresh clones; the install is
  // idempotent and skips when the browser is already present.
  try {
    await run(['run', 'playwright:install']);
  } catch {
    throw new Error(
      'Playwright chromium runtime is missing. Run `npm run playwright:install` (or `npx playwright install chromium`) and retry `npm run verify:release`.',
    );
  }

  frontend = start(['run', 'start', '--workspace=frontend', '--', '-p', '3001'], releaseEnv);
  await run(['run', 'test:e2e:frontend'], releaseEnv);
  console.log('\nRelease verification passed.');
} finally {
  stop(frontend);
  stop(backend);
}
