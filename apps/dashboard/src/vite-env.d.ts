/// <reference types="vite/client" />

declare module 'smartfarm_automations/AutomationPanel' {
  import type { ComponentType } from 'react';
  import type { AutomationPanelContractMeta, AutomationPanelPropsV1 } from '@smartfarm/contracts';

  const AutomationPanel: ComponentType<Partial<AutomationPanelPropsV1> & { onNotify?: (message: string) => void }>;
  export default AutomationPanel;
  export const automationPanelContract: AutomationPanelContractMeta;
}
