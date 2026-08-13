export { EngineeringReadinessPanel } from './EngineeringReadinessPanel';
export { useEngineeringReadinessStore } from './store';
export { ReadinessLivePanel, classifyIssueGroup } from './ReadinessLivePanel';
export type { ReadinessGroup, ReadinessLivePanelProps } from './ReadinessLivePanel';
// KD-1 (dług V12K-286): `readinessLiveStore` usunięty — jedyną prawdą gotowości
// jest `ui2/spaces/gotowosc/adapters/gotowoscAdapter` nad `useSnapshotStore`.

// UX 10/10: Data Gap Panel (Braki danych do obliczeń)
export {
  DataGapPanel,
  classifyDataGapGroup,
  resolveQuickFixLabel,
} from './DataGapPanel';
export type { DataGapPanelProps, DataGapGroup } from './DataGapPanel';
