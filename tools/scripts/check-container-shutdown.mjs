import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
const id = docker(['run', '-d', '--network', 'none',
  '-e', 'APP_ENV=staging', '-e', 'FARM_MODE=simulator', '-e', 'SIMULATOR_TRANSPORT=memory',
  '-e', 'LIVE_COMMANDS_ENABLED=false', '-e', 'LIVE_PUMP_ENABLED=false',
  '-e', 'RELEASE_SHA=container-signal-test', 'smartfarm-g08-shutdown:local']);
assert.match(id, /^[a-f0-9]{64}$/);
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const result = docker(['exec', id, 'node', '-e',
        "fetch('http://127.0.0.1:3001/health/ready').then(r=>r.json()).then(r=>console.log(JSON.stringify(r)))"]);
      const health = JSON.parse(result);
      assert.equal(health.controller, 'owner');
      assert.equal(health.farmMode, 'simulator');
      assert.equal(health.liveCommandsEnabled, false);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  assert.ok(ready, 'Container did not become ready.');
  const started = Date.now();
  docker(['stop', '--time', '15', id]);
  const elapsedMs = Date.now() - started;
  assert.equal(docker(['inspect', '--format', '{{.State.ExitCode}}', id]), '0');
  const logs = docker(['logs', id]);
  assert.match(logs, /API draining after SIGTERM/);
  assert.match(logs, /API shutdown complete/);
  assert.ok(elapsedMs < 15_000);
  console.log(JSON.stringify({ containerSignal: 'SIGTERM', exitCode: 0, elapsedMs, shutdownComplete: true }));
} finally {
  docker(['rm', '-f', id]);
}
