import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { LOCAL_FARM_ID } from '@smartfarm/contracts';
import { createIsolatedDatabase } from './postgres';

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate test port.');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

function startApi(port: number, databaseUrl: string) {
  let output = '';
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/main.ts'], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: {
      ...process.env, NODE_ENV: 'test', APP_ENV: 'local', FARM_MODE: 'simulator',
      SIMULATOR_TRANSPORT: 'memory', DATABASE_URL: databaseUrl,
      PORT: String(port), HOST: '127.0.0.1', FARM_ID: LOCAL_FARM_ID,
      LIVE_COMMANDS_ENABLED: 'false', LIVE_PUMP_ENABLED: 'false',
      GITHUB_OAUTH_CLIENT_ID: '', GITHUB_OAUTH_CLIENT_SECRET: '',
      RELEASE_SHA: 'process-shutdown-test',
    },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  });
  child.stdout.on('data', (chunk: Buffer) => { output = (output + chunk.toString()).slice(-16_384); });
  // Drain stderr without including possible connection error details in assertions.
  child.stderr.resume();
  return { child, exited, output: () => output, origin: `http://127.0.0.1:${port}` };
}

async function health(origin: string) {
  try {
    const response = await fetch(`${origin}/health/ready`, { signal: AbortSignal.timeout(1_000) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

async function stop(child: ChildProcess, exited: Promise<number | null>) {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await exited;
}

// Windows kill('SIGTERM') forcibly terminates Node; the actual Unix signal path
// is exercised by Linux CI and the local Linux Docker image, not simulated here.
it.skipIf(process.platform === 'win32')('T078/T079 real process SIGTERM drains and hands ownership to a paused successor', async () => {
  const db = await createIsolatedDatabase();
  const first = startApi(await freePort(), db.url);
  let second: ReturnType<typeof startApi> | undefined;
  try {
    await expect.poll(async () => (await health(first.origin))?.controller, { timeout: 20_000 }).toBe('owner');
    const login = await fetch(`${first.origin}/api/v1/local/login`, { method: 'POST' });
    expect(login.status).toBe(200);
    const session = await login.json();
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const farm = `/api/v1/farms/${LOCAL_FARM_ID}`;
    const start = await fetch(`${first.origin}${farm}/automations/start`, {
      method: 'POST', headers: { cookie, 'x-csrf-token': session.csrfToken, 'idempotency-key': crypto.randomUUID() },
    });
    expect(start.status).toBe(200);
    expect((await start.json()).automations.runtime.masterEnabled).toBe(true);

    second = startApi(await freePort(), db.url);
    await expect.poll(async () => (await health(second!.origin))?.controller, { timeout: 20_000 }).toBe('waiting_for_owner');
    expect((await health(second.origin))?.releaseSha).toBe('process-shutdown-test');

    expect(first.child.kill('SIGTERM')).toBe(true);
    expect(await first.exited).toBe(0);
    expect(first.output()).toContain('API draining after SIGTERM.');
    expect(first.output()).toContain('API shutdown complete.');
    await expect.poll(async () => (await health(second!.origin))?.controller, { timeout: 5_000 }).toBe('owner');
    const response = await fetch(`${second.origin}${farm}/snapshot`, { headers: { cookie } });
    expect(response.status).toBe(200);
    expect((await response.json()).automations.runtime.masterEnabled).toBe(false);

    expect(second.child.kill('SIGTERM')).toBe(true);
    expect(await second.exited).toBe(0);
    expect(second.output()).toContain('API shutdown complete.');
  } finally {
    await stop(first.child, first.exited);
    if (second) await stop(second.child, second.exited);
    await db.close();
  }
}, 60_000);
