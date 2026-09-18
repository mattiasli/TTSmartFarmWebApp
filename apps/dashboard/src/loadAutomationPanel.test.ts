import { describe, expect, it } from 'vitest';
import { assertCompatibleContract } from '@smartfarm/domain';
import { withTimeout } from './loadAutomationPanel';

describe('federated editor loader', () => {
  it('T083 times out a hung remote import without waiting forever', async () => {
    await expect(withTimeout(new Promise(() => undefined), 20, 'Automation editor timed out.')).rejects.toThrow(
      /timed out/,
    );
  });

  it('resolves when the remote returns before the deadline', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, 'timed out')).resolves.toBe('ok');
  });

  it('T086 rejects an unsupported contract major before render', () => {
    expect(() => assertCompatibleContract({ contractVersion: 99 })).toThrow(/not supported/);
  });
});
