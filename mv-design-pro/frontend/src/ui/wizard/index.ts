/**
 * Wizard module exports — Kreator budowy sieci SN/nN
 */
export { WizardSldPreview } from './WizardSldPreview';
export { computeWizardState, getStepStatusColor, getOverallStatusLabel } from './wizardStateMachine';
export type { WizardState, StepState, ReadinessMatrix } from './wizardStateMachine';
export { useWizardStore, useCurrentStepId, useCanProceedForward, useStepIssues, useTransitionBlockers } from './useWizardStore';
export type { WizardStoreState, ApplyStepResponse, WizardIssueApi } from './useWizardStore';

// --- Switchgear wizard (RUN #3G) ---
export { SwitchgearWizardPage } from './switchgear';
export type {
  StationListRowV1,
  StationEditDataV1,
  FieldEditDataV1,
  FieldSummaryV1,
  GeneratorSourceEntryV1,
  DeviceEntryV1,
  DeviceBindingV1,
  FieldFixActionV1,
  CatalogEntryV1,
  FixActionNavigationV1,
} from './switchgear';
