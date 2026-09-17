import { fileURLToPath } from 'node:url';
import { assertPortFree, killTree, spawnNpm, waitForUrl } from './process.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const services = [
  { prefix: 'api', args: ['run', 'dev', '-w', '@smartfarm/api'], port: 3001, url: 'http://127.0.0.1:3001/health/live' },
  {
    prefix: 'remote',
    args: ['run', 'dev', '-w', '@smartfarm/automations-remote'],
    port: 5174,
    url: 'http://127.0.0.1:5174/',
  },
  { prefix: 'host', args: ['run', 'dev', '-w', '@smartfarm/dashboard'], port: 5173, url: 'http://127.0.0.1:5173' },
];

console.log('Starting SmartFarm local servers. This command stays running until you press Ctrl+C.');
console.log('  Dashboard: http://127.0.0.1:5173');
console.log('  Remote:    http://127.0.0.1:5174');
console.log('  API:       http://127.0.0.1:3001/health/live');
console.log('');

for (const service of services) await assertPortFree(service.port);

const children = services.map((service) =>
  spawnNpm(service.args, { cwd: root, prefix: service.prefix }),
);

let stopping = false;
function shutDown() {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping local servers…');
  for (const child of children) killTree(child);
}

process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);

for (const child of children) {
  child.on('exit', (code) => {
    if (stopping) return;
    if (code && code !== 0) {
      console.error(`A local server exited with code ${code}. Stopping the others.`);
      shutDown();
      process.exitCode = code;
    }
  });
}

try {
  for (const service of services) await waitForUrl(service.url);
  console.log('');
  console.log('Local servers are ready. Leave this terminal open and open http://127.0.0.1:5173');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutDown();
  process.exitCode = 1;
}
