import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { request } from '@playwright/test';

const host = 'https://smartfarm-host.vercel.app';
const context = await request.newContext({ baseURL: host,
  storageState: JSON.parse(await readFile(new URL('../../.infra/staging-auth.json', import.meta.url), 'utf8')) });
try {
  const health = await (await context.get('https://default-service-production.up.railway.app/health/ready')).json();
  for (const [key, value] of Object.entries({ appEnv: 'staging', farmMode: 'simulator', liveCommandsEnabled: false, livePumpEnabled: false })) assert.equal(health[key], value);
  const session = await (await context.get('/api/v1/session')).json();
  assert.equal(session.role, 'admin');
  const response = await context.get(`/api/v1/farms/${session.farmId}/diagnostics/database`);
  assert.equal(response.status(), 200);
  assert.match(response.headers()['cache-control'], /no-store/);
  const metrics = await response.json();
  const evidence = { observedAt: new Date().toISOString(), apiSha: health.releaseSha, readOnly: true, ...metrics };
  await writeFile(new URL('../../.infra/staging-database-size.json', import.meta.url), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await context.dispose(); }
