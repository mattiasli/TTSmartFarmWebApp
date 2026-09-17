import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

export const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export function spawnNpm(args, { cwd, env, prefix } = {}) {
  const child = spawn(npmBin, args, {
    cwd,
    env: { ...process.env, ...env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const write = (chunk, stream) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (line.length === 0) continue;
      stream.write(prefix ? `[${prefix}] ${line}\n` : `${line}\n`);
    }
  };

  child.stdout?.on('data', (chunk) => write(chunk, process.stdout));
  child.stderr?.on('data', (chunk) => write(chunk, process.stderr));
  return child;
}

export function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  child.kill('SIGTERM');
}

export function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () =>
      reject(
        new Error(
          `Port ${port} is already in use. Stop the other local SmartFarm command (Ctrl+C) or close the leftover preview from test:federation.`,
        ),
      ),
    );
    server.listen(port, '127.0.0.1', () => server.close(() => resolve()));
  });
}

export async function waitForUrl(url, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
