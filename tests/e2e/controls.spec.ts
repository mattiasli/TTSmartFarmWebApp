import { expect, test } from '@playwright/test';

test('dashboard shows simulated sensors and accepts a fan command', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Commands go to a local farm model, not the physical ESP32.')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('24°C')).toBeVisible();
  const fan = page.getByRole('switch', { name: 'Fan' });
  await expect(fan).toBeVisible();
  await fan.click();
  await expect(fan).toBeChecked();
  await expect(page.getByTestId('host-all-off')).toBeVisible();
});
