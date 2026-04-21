/**
 * Network Build Module — Panel procesowy budowy sieci SN.
 *
 * Zastępuje Wizard K1-K10 panelem procesowym opartym na operacjach domenowych.
 */

export { ProcessPanel } from './ProcessPanel';
export { OperationFormRouter } from './OperationFormRouter';
export { ReadinessBar } from './ReadinessBar';
export { InspectorEngineeringView } from './InspectorEngineeringView';
export {
  useNetworkBuildStore,
  useNetworkBuildDerived,
  computeBuildPhase,
  buildPhaseLabel,
  selectOpenTerminals,
  selectRingReservedTerminals,
  selectAvailableBranchPorts,
  selectRingCandidates,
  selectStationSummaries,
  selectTransformerSummaries,
  selectOzeSourceSummaries,
  selectBlockersByCategory,
} from './networkBuildStore';

export type {
  BuildPhase,
  ActiveOperationForm,
  ActiveObjectCard,
  NetworkBuildState,
  AvailableBranchPort,
  RingCandidate,
  StationSummary,
  TransformerSummary,
  OzeSourceSummary,
} from './networkBuildStore';

// Krok V — Context menu, visual modes, catalog, search, mass review, modals
export { buildContextMenuForElement, getContextMenuTitle } from './contextMenuIntegration';
export type { ContextMenuRequest, ContextMenuHandlers } from './contextMenuIntegration';
export { SldVisualModes } from './SldVisualModes';
export { CatalogBrowser } from './CatalogBrowser';
export { GlobalSearch } from './GlobalSearch';
export { TopContextBar } from './TopContextBar';
export type { TopContextBarProps } from './TopContextBar';
export { ProjectMetadataModal } from './ProjectMetadataModal';
export type { ProjectMetadataModalProps, ProjectMetadata } from './ProjectMetadataModal';
export { SnapshotHistoryModal, OP_LABELS } from './SnapshotHistoryModal';
export type { SnapshotHistoryModalProps, SnapshotHistoryEntry } from './SnapshotHistoryModal';

// Cards
export * from './cards';

// Mass review
export { MassReviewPanel, MissingCatalogReview, TransformerReview, SwitchReview, OzeReview } from './mass-review';
export type { MassReviewPanelProps, ReviewTab } from './mass-review';

// Forms
export * from './forms';
