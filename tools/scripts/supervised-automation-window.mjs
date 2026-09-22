/** Always attempt every cleanup action, including after ambiguous enablement. */
export async function supervisedAutomationWindow({ enable, run, pause, stop, restoreSettings, disable }) {
  const errors = [];
  try { await enable(); await run(); } catch (error) { errors.push(error); }
  finally {
    for (const cleanup of [pause, stop, restoreSettings, disable]) {
      try { await cleanup(); } catch (error) { errors.push(error); }
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Supervised automation window incomplete');
}

export function coolingThresholds(temperature) {
  if (!Number.isFinite(temperature) || temperature < 14 || temperature > 44) {
    throw new Error('Temperature outside this supervised test range');
  }
  return {
    on: { fanOn: Math.floor(temperature) - 1, fanOff: Math.floor(temperature) - 3 },
    band: { fanOn: Math.ceil(temperature) + 2, fanOff: Math.floor(temperature) - 2 },
    off: { fanOn: Math.ceil(temperature) + 3, fanOff: Math.ceil(temperature) + 1 },
  };
}
