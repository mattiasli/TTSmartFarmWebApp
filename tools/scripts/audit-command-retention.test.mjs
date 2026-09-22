import { expect, it } from 'vitest';
import { connectAsync } from 'mqtt';
import { startLoopbackBroker } from '../simulator/src/broker.ts';
import { auditCommandRetention } from './audit-command-retention.mjs';

it('observes retained commands across firmware filters without publishing or clearing them', async () => {
  const broker = await startLoopbackBroker(0);
  const url = `mqtt://127.0.0.1:${broker.port}`;
  const publisher = await connectAsync(url);
  try {
    for (const topic of ['smartfarm/cmd/fan', 'smartfarm/cmd/nested/led', 'smartfarm/fan/set']) {
      await publisher.publishAsync(topic, 'on', { retain: true, qos: 1 });
    }
    const first = await auditCommandRetention(url, {}, 150);
    expect(first.subscribed).toBe(true);
    expect(first.commandPublishCalls).toBe(0);
    expect(first.retainedCommands.map(({ topic }) => topic).sort()).toEqual([
      'smartfarm/cmd/fan', 'smartfarm/cmd/nested/led', 'smartfarm/fan/set',
    ]);
    expect(first.noRetainedCommandsObserved).toBe(false);
    const second = await auditCommandRetention(url, {}, 150);
    expect(second.retainedCommands).toHaveLength(3);
    expect(second.commandPublishCalls).toBe(0);
  } finally { await publisher.endAsync(true); await broker.close(); }
});
