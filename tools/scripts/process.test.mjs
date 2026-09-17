import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveNpmCli } from './process.mjs';

describe('resolveNpmCli', () => {
  it('finds a real npm-cli.js for this Node install', () => {
    const npmCli = resolveNpmCli();
    expect(npmCli).toBeTruthy();
    expect(npmCli.endsWith('npm-cli.js')).toBe(true);
    expect(existsSync(npmCli)).toBe(true);
  });
});
