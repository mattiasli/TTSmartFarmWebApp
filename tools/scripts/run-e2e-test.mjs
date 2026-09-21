import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPortFree, killTree, spawnNode, spawnNpm, waitForUrl } from './process.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const testEnv = {
  APP_ENV: 'local', NODE_ENV: 'development', FARM_MODE: 'simulator',
  SIMULATOR_TRANSPORT: 'memory', DATABASE_URL: '',
  LIVE_COMMANDS_ENABLED: 'false', LIVE_PUMP_ENABLED: 'false',
  GITHUB_OAUTH_CLIENT_ID: '', GITHUB_OAUTH_CLIENT_SECRET: '',
  HOST: '127.0.0.1', PORT: '3001',
  PUBLIC_APP_ORIGIN: 'http://127.0.0.1:5173',
  ALLOWED_BROWSER_ORIGINS: 'http://127.0.0.1:5173',
  PUBLIC_WS_URL: 'ws://127.0.0.1:3001/ws',
  VITE_AUTOMATIONS_REMOTE_URL: 'http://127.0.0.1:5174/remoteEntry.js',
  E2E_HOST_URL: 'http://127.0.0.1:5173',
};

await assertPortFree(3001);
await assertPortFree(5173);
await assertPortFree(5174);

const dev = spawnNpm(['run', 'dev'], {
  cwd: root,
  prefix: 'e2e-dev',
  detached: true,
  env: testEnv,
});

const stop = () => killTree(dev);
process.on('SIGINT', () => {
  stop();
  process.exit(1);
});

let exitCode = 0;
try {
  await waitForUrl('http://127.0.0.1:3001/health/live', 90_000);
  await waitForUrl('http://127.0.0.1:5173', 90_000);
  const playwrightCli = path.join(root, 'node_modules/@playwright/test/cli.js');
  if (!existsSync(playwrightCli)) {
    throw new Error('Playwright CLI is missing. Run npm ci first.');
  }
  await new Promise((resolve, reject) => {
    const child = spawnNode([playwrightCli, 'test', '--config', path.join(root, 'playwright.e2e.config.ts')], {
      cwd: root,
      env: testEnv,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`playwright e2e exited ${code}`));
    });
  });
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  stop();
  process.exit(exitCode);
}
