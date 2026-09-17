import { access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPortFree, killTree, spawnNode, spawnNpm, waitForUrl } from './process.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const remoteDist = path.join(root, 'apps/automations-remote/dist');
const hostDist = path.join(root, 'apps/dashboard/dist');
const remoteUrl = 'http://127.0.0.1:4174/remoteEntry.js';

function run(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnNpm(args, { cwd: root, env });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm ${args.join(' ')} exited ${code}`));
    });
  });
}

await assertPortFree(4173);
await assertPortFree(4174);
await run(['run', 'build', '-w', '@smartfarm/automations-remote'], {
  VITE_REMOTE_PUBLIC_ORIGIN: 'http://127.0.0.1:4174',
  VITE_RELEASE_SHA: 'federation-proof',
});
await access(path.join(remoteDist, 'remoteEntry.js'));
await run(['run', 'build', '-w', '@smartfarm/dashboard'], {
  VITE_AUTOMATIONS_REMOTE_URL: remoteUrl,
  VITE_RELEASE_SHA: 'federation-proof',
});
await access(path.join(hostDist, 'index.html'));

const remote = spawnNpm(['run', 'preview', '-w', '@smartfarm/automations-remote'], {
  cwd: root,
  prefix: 'preview-remote',
});
const host = spawnNpm(['run', 'preview', '-w', '@smartfarm/dashboard'], {
  cwd: root,
  prefix: 'preview-host',
});

const stop = () => {
  killTree(remote);
  killTree(host);
};

process.on('SIGINT', () => {
  stop();
  process.exit(1);
});

try {
  await waitForUrl(remoteUrl);
  await waitForUrl('http://127.0.0.1:4173');
  const playwrightCli = path.join(root, 'node_modules/@playwright/test/cli.js');
  if (!existsSync(playwrightCli)) {
    throw new Error('Playwright CLI is missing. Run npm ci first.');
  }
  await new Promise((resolve, reject) => {
    const child = spawnNode([playwrightCli, 'test', '--config', path.join(root, 'playwright.config.ts')], {
      cwd: root,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`playwright test exited ${code}`));
    });
  });
} finally {
  stop();
}
