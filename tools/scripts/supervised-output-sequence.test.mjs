import { expect, it } from 'vitest';
import { farmCommandRequestSchema } from '../../packages/contracts/src/commands.ts';
import { outputChecks, supervisedOutputSequence } from './supervised-output-sequence.mjs';

it('limits each scope to the listed non-pump outputs', () => {
  expect(outputChecks('lights').map(({ name }) => name)).toEqual(['LED', 'LCD backlight']);
  const checks = outputChecks('outputs');
  for (const { request, restore } of checks) {
    expect(farmCommandRequestSchema.safeParse(request).success).toBe(true);
    expect(farmCommandRequestSchema.safeParse(restore).success).toBe(true);
  }
  expect(checks.map(({ name }) => name)).toEqual(['LED', 'LCD backlight', 'Short beep', 'Feeder', 'LCD text']);
  expect(checks.flatMap(({ request, restore }) => [request.type, restore.type])
    .every((type) => /^(light\.|lcd\.|buzzer\.|feeder\.)/.test(type))).toBe(true);
  expect(checks.at(-1).request.line1).toHaveLength(16);
  expect(checks.at(-1).request.line2).toHaveLength(16);
  expect(() => outputChecks('pump')).toThrow();
});

for (const failure of [null, 'enable', 'ready', 'LED', 'led=1', 'LED restore', 'led=0', 'disable']) {
  it(`restores outputs and disables commands after ${failure ?? 'a successful sequence'}`, async () => {
    const calls = [];
    const call = async (name) => { calls.push(name); if (name === failure) throw new Error(name); };
    const result = supervisedOutputSequence({ scope: 'outputs',
      enable: () => call('enable'), ready: () => call('ready'), disable: () => call('disable'),
      command: (_request, name) => call(name), verify: (wire, value) => call(`${wire}=${value}`),
      sleep: async () => {} });
    if (failure) await expect(result).rejects.toThrow(AggregateError); else await result;
    expect(calls.at(-1)).toBe('disable');
    if (calls.includes('LED')) expect(calls).toContain('LED restore');
    if (failure && failure !== 'disable') expect(calls).not.toContain('Feeder');
    if (!failure) {
      expect(calls).toContain('LCD text restore');
      expect(calls).not.toContain('buzz=1'); // Short beeps and LCD text have no device acknowledgement.
    }
  });
}
