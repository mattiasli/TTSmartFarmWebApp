import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const canaries = [
  'HIVEMQ_PASSWORD',
  'AUTH_COOKIE_SECRET',
  'GITHUB_OAUTH_CLIENT_SECRET',
  'DATABASE_URL=postgres',
];
const skip = new Set(['node_modules', 'dist', '.git', 'private-setup', 'coverage', 'playwright-report']);

async function walk(dir, found) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, found);
      continue;
    }
    if (!/\.(js|css|map|html|json)$/i.test(entry.name)) continue;
    if (full.includes(`${path.sep}dist${path.sep}`) || entry.name.endsWith('.map')) {
      const text = await readFile(full, 'utf8');
      for (const canary of canaries) {
        if (text.includes(canary)) found.push(`${full}: ${canary}`);
      }
    }
  }
}

const found = [];
for (const dist of ['apps/dashboard/dist', 'apps/automations-remote/dist']) {
  try {
    await stat(path.join(root, dist));
    await walk(path.join(root, dist), found);
  } catch {
    // Build artifacts are checked after a production build.
  }
}

if (found.length) {
  console.error('Secret canaries found in frontend artifacts:');
  for (const item of found) console.error(`- ${item}`);
  process.exit(1);
}

console.log('No secret canaries found in built frontend artifacts.');
