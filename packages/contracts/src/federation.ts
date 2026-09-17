import type {
  AutomationReadingsView,
  AutomationRuntimeView,
  AutomationSettings,
  RuleId,
  SaveResult,
} from './automations';
import type { FarmMode } from './realtime';

export const FEDERATION_CONTRACT_MAJOR = 1;

export type AutomationPanelPropsV1 = {
  contractVersion: 1;
  farmName: string;
  settings: AutomationSettings;
  settingsRevision: number;
  runtime: AutomationRuntimeView;
  readings: AutomationReadingsView;
  permissions: { canEdit: boolean; canResume: boolean };
  connection: { fresh: boolean; controllerReady: boolean; mode: FarmMode };
  onSave: (draft: AutomationSettings, expectedRevision: number) => Promise<SaveResult>;
  onResumeRule: (rule: RuleId) => Promise<void>;
  onResetIrrigation: () => Promise<void>;
  onSyncGuard: (expectedRevision: number) => Promise<void>;
};

export type AutomationPanelContractMeta = {
  contractVersion: typeof FEDERATION_CONTRACT_MAJOR;
  releaseSha: string;
};
