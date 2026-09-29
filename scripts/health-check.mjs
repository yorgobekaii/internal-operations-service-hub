const url = process.env.HEALTH_URL ?? 'http://127.0.0.1:3000/health';

const response = await fetch(url);
if (!response.ok) {
  throw new Error(`Health check failed with HTTP ${response.status}`);
}

const body = await response.json();
if (body?.status !== 'ok' || typeof body.timestamp !== 'string' || Number.isNaN(Date.parse(body.timestamp))) {
  throw new Error(`Health check returned an invalid response from ${url}`);
}

console.log(`Health check passed: ${url} status=${body.status} timestamp=${body.timestamp}`);
