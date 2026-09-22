import { expect, test } from '@playwright/test';

for (const permission of [false, undefined, true]) {
  test(`watering permission ${String(permission)} survives WebSocket updates without blocking other controls`, async ({ page }) => {
    let snapshots = 0;
    await page.routeWebSocket('ws://127.0.0.1:5173/ws', (socket) => {
      const server = socket.connectToServer();
      server.onMessage((message) => {
        const envelope = JSON.parse(String(message));
        if (envelope.type === 'snapshot') {
          snapshots++;
          envelope.data.permissions.canControl = true;
          if (permission === undefined) delete envelope.data.permissions.canPump;
          else envelope.data.permissions.canPump = permission;
        }
        socket.send(JSON.stringify(envelope));
      });
    });
    await page.goto('/');
    await expect.poll(() => snapshots, { timeout: 20_000 }).toBeGreaterThan(1);
    const watering = page.getByRole('button', { name: 'Water briefly', exact: true });
    if (permission === true) await expect(watering).toBeEnabled();
    else {
      await expect(watering).toBeDisabled();
      await expect(page.getByText('Watering is disabled. Other controls remain available.', { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('switch', { name: 'Fan', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Beep', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Stop pump', exact: true })).toBeEnabled();
    await expect(page.getByTestId('start-automations')).toBeEnabled();
  });
}

test('WebSocket read-only permissions keep controls disabled for an operator session', async ({ page }) => {
  let snapshots = 0;
  await page.routeWebSocket('ws://127.0.0.1:5173/ws', (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      const envelope = JSON.parse(String(message));
      if (envelope.type === 'snapshot') {
        snapshots++;
        envelope.data.permissions.canControl = false;
      }
      socket.send(JSON.stringify(envelope));
    });
  });
  await page.goto('/');
  await expect.poll(() => snapshots, { timeout: 20_000 }).toBeGreaterThan(1);
  await expect(page.getByText('Read-only', { exact: true })).toBeVisible();
  await expect(page.getByTestId('start-automations')).toBeDisabled();
  await expect(page.getByTestId('host-all-off')).toBeDisabled();
  await expect(page.getByRole('switch', { name: 'Fan', exact: true })).toBeDisabled();
});

test('dashboard shows simulated sensors and accepts a fan command', async ({ page, request }) => {
  const health = await (await request.get('http://127.0.0.1:3001/health/ready')).json();
  expect(health).toMatchObject({ appEnv: 'local', farmMode: 'simulator', liveCommandsEnabled: false, livePumpEnabled: false });
  await page.goto('/');
  await expect(page.getByText('Commands go to a local farm model, not the physical ESP32.')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('24°C', { exact: true })).toBeVisible();
  const fan = page.getByRole('switch', { name: 'Fan' });
  await expect(fan).toBeVisible();
  await fan.click();
  await expect(fan).toBeChecked();
  await expect(page.getByTestId('host-all-off')).toBeVisible();
});
