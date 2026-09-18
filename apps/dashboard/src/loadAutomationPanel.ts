import { assertCompatibleContract } from '@smartfarm/domain';

export const REMOTE_LOAD_TIMEOUT_MS = 8_000;

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function loadAutomationPanel() {
  const mod = await withTimeout(
    import('smartfarm_automations/AutomationPanel'),
    REMOTE_LOAD_TIMEOUT_MS,
    'Automation editor timed out. Sensors, Pause, and All off stay on this host page.',
  );
  assertCompatibleContract(mod.automationPanelContract);
  return { default: mod.default };
}
