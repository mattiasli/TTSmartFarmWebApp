import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPortFree, killTree, spawnNode, spawnNpm, waitForUrl } from './process.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

await assertPortFree(3001);
await assertPortFree(5173);
await assertPortFree(5174);

const dev = spawnNpm(['run', 'dev'], {
  cwd: root,
  prefix: 'e2e-dev',
  detached: true,
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
