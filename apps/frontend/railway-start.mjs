// Railway/local production entrypoint for the Next.js frontend.
// Avoids shell `$PORT` expansion (breaks on Windows cmd) and avoids passing
// extra args through `npm run ... -- ...` (which caused
// `next start start -p 8080` -> "Invalid project directory .../start").
// Usage:
//   Railway frontend service Start Command (Root Directory = repo root):
//     npm run start:frontend:railway
// Behaviour:
//   1. Reads PORT from env (Railway injects it), falls back to 3000 locally.
//   2. Binds 0.0.0.0 so Railway's proxy/healthcheck can reach Next.
//   3. Spawns `next start` with SIGTERM/SIGINT forwarding.

import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = dirname(fileURLToPath(import.meta.url));

const rawPort = (process.env.PORT ?? '3000').trim();
const port = Number.parseInt(rawPort, 10);
const effectivePort = Number.isSafeInteger(port) && port >= 0 ? String(port) : '3000';
if (effectivePort !== rawPort) {
  console.log(`[frontend-start] PORT=${JSON.stringify(rawPort)} invalid, falling back to ${effectivePort}`);
} else {
  console.log(`[frontend-start] PORT=${effectivePort}`);
}

console.log(`[frontend-start] starting: next start -H 0.0.0.0 -p ${effectivePort}`);
const child = spawn('npx', ['next', 'start', '-H', '0.0.0.0', '-p', effectivePort], {
  cwd: frontendDir,
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[frontend-start] received ${signal}, forwarding...`);
    if (child.exitCode === null && !child.killed) child.kill(signal);
  });
}

const exitCode = await new Promise((resolvePromise) => {
  child.once('error', (err) => {
    console.error(`[frontend-start] failed to start: ${err?.message ?? err}`);
    resolvePromise(1);
  });
  child.once('exit', (code, signal) => {
    if (signal) {
      console.log(`[frontend-start] exited via signal ${signal}`);
      resolvePromise(signal === 'SIGTERM' || signal === 'SIGINT' ? 0 : 1);
    } else {
      resolvePromise(code ?? 1);
    }
  });
});
process.exit(exitCode);
