// Execution requires a separately authorized, supervised window. This module
// contains no provider credentials, network access or pump commands.
export function outputChecks(scope = 'lights') {
  if (!['lights', 'outputs'].includes(scope)) throw new Error('Unknown supervised scope');
  const checks = [
    { name: 'LED', request: { type: 'light.set', on: true },
      restore: { type: 'light.set', on: false }, wire: 'led', active: 1, restored: 0, holdMs: 2000 },
    { name: 'LCD backlight', request: { type: 'lcd.setBacklight', on: false },
      restore: { type: 'lcd.setBacklight', on: true }, wire: 'bl', active: 0, restored: 1, holdMs: 2000 },
  ];
  if (scope === 'outputs') checks.push(
    { name: 'Short beep', request: { type: 'buzzer.beep', frequencyHz: 880 },
      restore: { type: 'buzzer.stop' }, wire: 'buzz', restored: 0, holdMs: 1000 },
    { name: 'Feeder', request: { type: 'feeder.set', open: true },
      restore: { type: 'feeder.set', open: false }, wire: 'feed', active: 1, restored: 0, holdMs: 2000 },
    { name: 'LCD text', request: { type: 'lcd.setText', line1: 'SMARTFARM TEST 1', line2: '1234567890123456' },
      restore: { type: 'lcd.showStatus' }, holdMs: 5000 },
  );
  return checks;
}

export async function supervisedOutputSequence({ scope, enable, ready, command,
  verify, disable, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const checks = outputChecks(scope);
  const errors = [];
  try {
    // Cleanup also runs when enablement's response is uncertain.
    await enable();
    await ready();
    for (const check of checks) {
      try {
        await command(check.request, check.name);
        await sleep(check.holdMs);
        if (check.active !== undefined) await verify(check.wire, check.active);
      } catch (error) { errors.push(error); }
      finally {
        try {
          // Restore even if the activation request failed after being published.
          await command(check.restore, `${check.name} restore`);
          if (check.restored !== undefined) await verify(check.wire, check.restored);
        } catch (error) { errors.push(error); }
      }
      if (errors.length) break; // Never proceed to another output after uncertainty.
    }
  } catch (error) { errors.push(error); }
  finally {
    try { await disable(); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'Supervised output test incomplete');
}
