import { test } from 'vitest';
import assert from 'node:assert/strict';
import { supervisedFanWindow } from './supervised-fan-window.mjs';

for (const failure of [null, 'enable', 'ready', 'on', 'off', 'observe', 'disable']) {
  test(`bounded fan window cleanup: ${failure ?? 'success'}`, async () => {
    const calls = [];
    let clock = 100;
    const action = (name) => async () => {
      calls.push(name);
      if (name === 'on') clock += 300;
      if (failure === name) throw new Error(`injected ${name}`);
    };
    const run = supervisedFanWindow({ enable: action('enable'), ready: action('ready'),
      command: (on) => action(on ? 'on' : 'off')(), observe: action('observe'),
      disable: action('disable'), now: () => clock,
      sleep: async (ms) => { assert.equal(ms, 1700); clock += ms; } });
    if (failure) await assert.rejects(run, AggregateError); else await run;
    assert.equal(calls.at(-1), 'disable');
    assert.equal(calls.filter((name) => name === 'on').length, ['enable', 'ready'].includes(failure) ? 0 : 1);
    assert.equal(calls.includes('off'), calls.includes('on'));
    if (!failure) assert.equal(clock, 2100);
  });
}
