import { expect, test } from '@playwright/test';

test('host loads a separately built Fluent remote with shared React hooks', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));

  await page.goto('/');
  await expect(page.getByTestId('federation-probe')).toBeVisible();
  await expect(page.getByTestId('hook-count')).toHaveText('Hook count: 0');
  await page.getByTestId('increment-hook').click();
  await expect(page.getByTestId('hook-count')).toHaveText('Hook count: 1');

  await page.getByTestId('open-dialog').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByTestId('notify-host').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('federation-host-message')).toContainText('notified the host', {
    timeout: 10_000,
  });
  await expect(page.getByTestId('host-all-off')).toBeVisible();
  expect(failures, failures.join('\n')).toEqual([]);
});
