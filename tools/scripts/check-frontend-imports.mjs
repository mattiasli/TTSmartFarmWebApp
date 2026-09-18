import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const targets = ['apps/dashboard/src', 'apps/automations-remote/src'];
const forbidden = [
  { name: 'mqtt import', pattern: /from ['"]mqtt['"]|require\(['"]mqtt['"]\)/ },
  { name: 'HiveMQ host', pattern: /HIVEMQ_/ },
  { name: 'OAuth client secret', pattern: /GITHUB_OAUTH_CLIENT_SECRET/ },
  { name: 'database URL', pattern: /DATABASE_URL/ },
  { name: 'broker password', pattern: /HIVEMQ_PASSWORD|AUTH_COOKIE_SECRET/ },
];

async function walk(dir, files) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, files);
      continue;
    }
    if (/\.(ts|tsx|js|mjs|css)$/i.test(entry.name)) files.push(full);
  }
}

const hits = [];
for (const target of targets) {
  const files = [];
  await walk(path.join(root, target), files);
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const rule of forbidden) {
      if (rule.pattern.test(text)) hits.push(`${path.relative(root, file)}: ${rule.name}`);
    }
  }
}

if (hits.length) {
  console.error('Forbidden server secrets or MQTT usage in frontend source:');
  for (const hit of hits) console.error(`- ${hit}`);
  process.exit(1);
}

console.log('Frontend source does not import MQTT or server secrets.');
