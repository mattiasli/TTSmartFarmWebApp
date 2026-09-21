import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

export function resolveNpmCli() {
  const fromEnv = process.env.npm_execpath;
  if (fromEnv?.endsWith('.js') && existsSync(fromEnv)) return fromEnv;

  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeDir, 'node_modules/npm/bin/npm-cli.js'),
    path.join(nodeDir, '../lib/node_modules/npm/bin/npm-cli.js'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function spawnNpm(args, { cwd, env, prefix, detached = false } = {}) {
  const npmCli = resolveNpmCli();
  const options = {
    cwd,
    env: { ...process.env, ...env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: Boolean(detached) && process.platform !== 'win32',
  };
  const child = npmCli
    ? spawn(process.execPath, [npmCli, ...args], options)
    : spawn('npm', args, { ...options, shell: process.platform === 'win32' });

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

export function spawnNode(args, { cwd, env, prefix } = {}) {
  const child = spawn(process.execPath, args, {
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
  child.stdout?.destroy();
  child.stderr?.destroy();
  if (process.platform === 'win32') {
    // Complete cleanup before a harness exits; an unawaited taskkill can leave
    // Vite/tsx grandchildren listening after their parent has disappeared.
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 10_000,
    });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // Already exited.
    }
  }
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
