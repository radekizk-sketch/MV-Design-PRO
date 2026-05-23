/**
 * Network Build Module — Panel procesowy budowy sieci SN.
 *
 * Zastępuje Wizard K1-K10 panelem procesowym opartym na operacjach domenowych.
 */

export { ProcessPanel } from './ProcessPanel';
export { ReadinessBar } from './ReadinessBar';
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
  NetworkBuildState,
  AvailableBranchPort,
  RingCandidate,
  StationSummary,
  TransformerSummary,
  OzeSourceSummary,
} from './networkBuildStore';

// Krok V — Context menu, visual modes, catalog, search, mass review, modals
export { CatalogBrowser } from './CatalogBrowser';
export { GlobalSearch } from './GlobalSearch';
export { TopContextBar } from './TopContextBar';
export type { TopContextBarProps } from './TopContextBar';
export { ProjectMetadataModal } from './ProjectMetadataModal';
export type { ProjectMetadataModalProps, ProjectMetadata } from './ProjectMetadataModal';
// SnapshotHistoryModal removed (Phase 0 #3) - historia migawek dostępna przez E-09 audit screen

// Cards
export * from './cards';

// Mass review
export { MassReviewPanel, MissingCatalogReview, TransformerReview, SwitchReview, OzeReview } from './mass-review';
export type { MassReviewPanelProps, ReviewTab } from './mass-review';

// Forms
export * from './forms';
