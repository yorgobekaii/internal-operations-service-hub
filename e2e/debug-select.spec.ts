import { expect, test } from '@playwright/test';

test('debug select role', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (msg) => logs.push(`CONSOLE ${msg.type()}: ${msg.text()}`));
  page.on('request', (req) => {
    if (req.url().includes('/actors') || req.url().endsWith('/') || req.url().includes('select-role')) {
      logs.push(`REQ ${req.method()} ${req.url()} cookies=${req.headers()['cookie'] ?? ''} x-user-id=${req.headers()['x-user-id'] ?? ''}`);
    }
  });
  page.on('response', async (res) => {
    if (res.url().includes('/actors')) {
      let body = '';
      try { body = (await res.text()).slice(0, 500); } catch { /* ignore */ }
      logs.push(`RES ${res.status()} ${res.url()} body=${body}`);
    }
  });

  await page.goto('/select-role');
  await expect(page.getByRole('heading', { name: 'Select your role' })).toBeVisible();
  console.log('BEFORE cookies:', JSON.stringify(await page.context().cookies()));
  console.log('BEFORE doc.cookie:', await page.evaluate(() => document.cookie));

  await page.getByLabel('Select a role').selectOption('maya.requester');
  // give hard nav + client effects time
  await page.waitForTimeout(4000);
  console.log('AFTER url:', page.url());
  console.log('AFTER cookies:', JSON.stringify(await page.context().cookies()));
  console.log('AFTER doc.cookie:', await page.evaluate(() => document.cookie));
  console.log('AFTER content snippet:', (await page.content()).slice(0, 2000));
  for (const l of logs) console.log(l);
});
