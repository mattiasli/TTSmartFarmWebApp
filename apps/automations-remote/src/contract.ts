import type { AutomationPanelContractMeta } from '@smartfarm/contracts';
import { FEDERATION_CONTRACT_MAJOR } from '@smartfarm/contracts';

export const automationPanelContract: AutomationPanelContractMeta = {
  contractVersion: FEDERATION_CONTRACT_MAJOR,
  releaseSha: import.meta.env.VITE_RELEASE_SHA ?? 'dev',
};
