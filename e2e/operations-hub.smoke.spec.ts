import { expect, Page, test } from '@playwright/test';

async function setActorCookie(page: Page, actorId: string) {
  await page.context().addCookies([
    {
      name: 'x-user-id',
      value: actorId,
      url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3001',
    },
  ]);
  await page.goto('/');
}

test.describe('Operations Hub critical teaching journeys', () => {
  test('stale actor sessions recover to role selection', async ({ page }) => {
    await page.context().addCookies([
      {
        name: 'x-user-id',
        value: 'stale.actor',
        url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3001',
      },
    ]);

    await page.goto('/');
    await page.waitForURL('**/select-role');
    await expect(page.getByRole('heading', { name: 'Select your role' })).toBeVisible();
    await expect.poll(async () => (await page.context().cookies()).find((cookie) => cookie.name === 'x-user-id')?.value ?? '').toBe('');
  });

  test('requester can use advisory triage and submit an IT request', async ({ page }) => {
    const title = `Playwright IT smoke ${Date.now()}`;

    await page.goto('/select-role');
    await page.getByLabel('Select a role').selectOption('maya.requester');
    await page.waitForURL('**/');
    await expect.poll(async () => (await page.context().cookies()).find((cookie) => cookie.name === 'x-user-id')?.value ?? '').toBe('maya.requester');
    await expect(page.getByRole('heading', { name: 'Service requests, managed with clarity.' })).toBeVisible();

    await page.locator('#ai-description').fill('My laptop screen is flickering and will not turn on');
    await page.getByRole('button', { name: 'Suggest with AI' }).click();
    await expect(page.getByRole('button', { name: /Continue in intake form/ })).toBeVisible();
    await page.getByRole('button', { name: 'Discard' }).click();

    await page.getByRole('link', { name: '+ New request' }).click();
    await page.locator('input[name="title"]').fill(title);
    await page.locator('select[name="category"]').selectOption('IT');
    await page.locator('input[name="system"]').fill('Playwright laptop');
    await page.getByRole('button', { name: 'Submit request' }).click();
    await page.waitForURL(/\/requests\/.+/);
    await expect(page.getByText(title)).toBeVisible();
  });

  test('handler can start and resolve an IT request created by a requester', async ({ page }) => {
    const title = `Playwright handler smoke ${Date.now()}`;

    await page.goto('/select-role');
    await page.getByLabel('Select a role').selectOption('maya.requester');
    await page.waitForURL('**/');
    await page.getByRole('link', { name: '+ New request' }).click();
    await page.locator('input[name="title"]').fill(title);
    await page.locator('select[name="category"]').selectOption('IT');
    await page.locator('input[name="system"]').fill('Handler smoke asset');
    await page.getByRole('button', { name: 'Submit request' }).click();
    await page.waitForURL(/\/requests\/.+/);

    await setActorCookie(page, 'omar.it-handler');

    const row = page.locator('tr.queue-row').filter({ hasText: title });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Start work' }).click();
    await expect(row).toContainText('In Progress');
    await row.getByRole('button', { name: 'Resolve' }).click();
    await expect(row).toContainText('Resolved');
    await expect(row.getByText('Completed')).toBeVisible();
  });

  test('designated approver can approve a high-cost Finance request', async ({ page }) => {
    const title = `Playwright approval smoke ${Date.now()}`;

    await page.goto('/select-role');
    await page.getByLabel('Select a role').selectOption('maya.requester');
    await page.waitForURL('**/');
    await page.getByRole('link', { name: '+ New request' }).click();
    await page.locator('input[name="title"]').fill(title);
    await page.locator('select[name="category"]').selectOption('Finance');
    await page.locator('input[name="amount"]').fill('4500 USD');
    await page.locator('input[name="costCenter"]').fill('PW-001');
    await page.getByRole('button', { name: 'Submit request' }).click();
    await page.waitForURL(/\/requests\/.+/);

    await setActorCookie(page, 'lina.finance-approver');
    await page.getByRole('link', { name: /Approvals/ }).click();
    const row = page.locator('tr.queue-row').filter({ hasText: title });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Approve' }).click();
    await page.reload();
    await expect(page.locator('tr.queue-row').filter({ hasText: title })).toHaveCount(0);
  });
});
