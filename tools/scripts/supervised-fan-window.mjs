/** One authorized fan pulse. Callbacks must enforce their own request timeouts. */
export async function supervisedFanWindow({ enable, ready, command, observe, disable,
  durationMs = 2000, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  let mayBeEnabled = false;
  let mayBeOn = false;
  const errors = [];
  try {
    mayBeEnabled = true; // Even an ambiguous provider failure requires restoration.
    await enable();
    await ready();
    mayBeOn = true; // A lost HTTP response does not prove the fan stayed off.
    const started = now();
    await command(true);
    await sleep(Math.max(0, durationMs - (now() - started)));
  } catch (error) { errors.push(error); }
  finally {
    if (mayBeOn) {
      try { await command(false); await observe(); }
      catch (error) { errors.push(error); }
    }
    if (mayBeEnabled) {
      try { await disable(); }
      catch (error) { errors.push(error); }
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Fan test incomplete; inspect stop and restoration evidence.');
}
