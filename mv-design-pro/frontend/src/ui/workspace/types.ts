export type WorkspaceScreenCode =
  | 'E-00'
  | 'E-01'
  | 'E-02'
  | 'E-03'
  | 'E-04'
  | 'E-05'
  | 'E-06'
  | 'E-07'
  | 'E-08'
  | 'E-09'
  | 'E-10'
  | 'E-11'
  | 'E-12'
  | 'E-13'
  | 'E-14'
  | 'E-15'
  | 'E-16'
  | 'E-17'
  | 'E-18'
  | 'E-19'
  | 'E-20'
  | 'E-21'
  | 'E-22'
  | 'E-23'
  | 'E-24'
  | 'E-25'
  | 'E-26'
  | 'E-27'
  | 'E-28'
  | 'E-29'
  | 'E-30'
  | 'E-31'
  | 'E-32'
  | 'E-33'
  | 'E-34';

export type HelperSurfaceCode =
  | 'variants_runs'
  | 'catalog_picker'
  | 'catalog_admin'
  | 'case_context';

export type WorkspaceSurfaceCode = WorkspaceScreenCode | HelperSurfaceCode;

export type EntityTypeCode =
  | 'project'
  | 'gpz'
  | 'gpz_section'
  | 'sn_bay'
  | 'station'
  | 'station_lv_side'
  | 'segment'
  | 'zksn'
  | 'branch_pole'
  | 'branch'
  | 'ring'
  | 'nop'
  | 'pv_source'
  | 'bess_source'
  | 'fw_source'
  | 'analysis_case'
  | 'analysis_run'
  | 'proof_pack'
  | 'report'
  | 'export_artifact';

export type SurfaceSubjectKind =
  | 'entity'
  | 'analysis_case'
  | 'analysis_run'
  | 'proof_pack'
  | 'report'
  | 'export_artifact'
  | 'helper_context';

export interface SurfaceSubjectRef {
  subjectKind: SurfaceSubjectKind;
  subjectRef: string | null;
}

export type WorkspaceSurfaceKind =
  | 'obiektowy'
  | 'edycyjny'
  | 'analityczny'
  | 'raportowy'
  | 'pomocniczy';

export type WorkspaceSurfaceSizeClass = 'A' | 'B' | 'C';
export type WorkspaceSurfaceStackLevel = 0 | 1 | 2 | 3;
export type WorkspaceSurfaceSaveMode = 'auto' | 'manual' | 'transactional' | 'read_only';
export type WorkspaceLeaveGuardPolicy = 'free' | 'confirm' | 'block_until_resolved';
export type WorkspaceRestorePolicy = 'none' | 'restore_if_compatible' | 'restore_parent';
export type WorkspaceOpenMode = 'replace_right_panel' | 'expand_workspace';
export type RouteHistoryPolicy = 'push_new_entry' | 'replace_current_entry' | 'silent_internal_change';

export const ANALYSIS_SURFACE_SCREEN_CODE = 'E-06';
export const REPORT_SURFACE_SCREEN_CODE = 'E-27';

export const ANALYSIS_ROUTE_TAB_IDS = [
  'results',
  'trace',
  'protection',
  'power-flow',
  'compare',
] as const;

export type AnalysisRouteTabId = (typeof ANALYSIS_ROUTE_TAB_IDS)[number];

export const ANALYSIS_ROUTE_DEFAULT_TAB: AnalysisRouteTabId = 'results';

export const ROUTE_MANAGED_ROUTE_KEYS = [
  'analysis',
  'report',
  'variants',
  'catalog',
  'case-config',
] as const;

export type RouteManagedRouteKey = (typeof ROUTE_MANAGED_ROUTE_KEYS)[number];

export type WorkspaceRouteKey =
  | 'sld'
  | RouteManagedRouteKey
  | 'enm-inspector'
  | 'fault-scenarios'
  | 'sld-view'
  | 'unknown';

export type SurfaceLifecycleState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'editing'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'error'
  | 'blocked'
  | 'restoring'
  | 'disposed';

export type SurfaceLifecycleEvent =
  | 'open_requested'
  | 'open_succeeded'
  | 'open_failed'
  | 'edit_started'
  | 'field_changed'
  | 'save_requested'
  | 'save_succeeded'
  | 'save_failed'
  | 'restore_requested'
  | 'restore_succeeded'
  | 'restore_rejected'
  | 'leave_requested'
  | 'leave_confirmed'
  | 'leave_cancelled'
  | 'revision_conflict_detected'
  | 'context_invalidated'
  | 'dispose_requested'
  | 'disposed';

export type SurfaceBlockReason =
  | 'leave_guard'
  | 'revision_conflict'
  | 'context_changed'
  | 'missing_prerequisites'
  | 'entity_deleted'
  | 'invalid_route';

export interface SurfaceBlockState {
  blocked: boolean;
  reason: SurfaceBlockReason | null;
  messagePl: string | null;
  repairSurface: WorkspaceSurfaceCode | null;
}

export interface WorkspaceBreadcrumb {
  surfaceId: string | null;
  labelPl: string;
}

export interface WorkspaceRouteState {
  route: WorkspaceRouteKey;
  tabId?: string | null;
  payload?: Record<string, unknown>;
  activeSurfaceRef?: string | null;
  activeScreenCode?: WorkspaceSurfaceCode | null;
  activeEntityRef?: string | null;
  activeTab?: string | null;
  snapshotRef?: string | null;
  variantRef?: string | null;
  runRef?: string | null;
  stackRefs?: string[];
}

export interface WorkspaceSurfaceDescriptor extends SurfaceSubjectRef {
  surfaceId: string;
  screenCode: WorkspaceSurfaceCode;
  surfaceKind: WorkspaceSurfaceKind;
  sizeClass: WorkspaceSurfaceSizeClass;
  stackLevel: WorkspaceSurfaceStackLevel;
  entityType: EntityTypeCode | null;
  entityRef: string | null;
  parentSurfaceId: string | null;
  tabId: string | null;
  titlePl: string;
  breadcrumbs: WorkspaceBreadcrumb[];
  supportsMiniSld: boolean;
  openMode: WorkspaceOpenMode;
  routeState: WorkspaceRouteState;
}

export interface WorkspaceSurfaceSession {
  surfaceRef: string;
  screenCode: WorkspaceSurfaceCode;
  lifecycleState: SurfaceLifecycleState;
  saveMode: WorkspaceSurfaceSaveMode;
  hasUnsavedChanges: boolean;
  isRestorable: boolean;
  parentSurfaceRef: string | null;
  originSurfaceRef: string | null;
  activeEntityRef: string | null;
  activeTabId: string | null;
  activeSubtabId: string | null;
  selectionRef: string | null;
  returnAnchor: string | null;
  scrollState: { x: number; y: number } | null;
  splitterState: Record<string, number> | null;
  filterStateRef: string | null;
  openedAt: string;
  lastInteractionAt: string;
  restorePayloadRef: string | null;
  lastErrorCode: string | null;
  leaveGuardPolicy: WorkspaceLeaveGuardPolicy;
  restorePolicy: WorkspaceRestorePolicy;
  baseModelRevision: string;
  activeSnapshotRef: string | null;
  activeVariantRef: string | null;
  activeRunRef: string | null;
  blockState: SurfaceBlockState;
  isDirty: boolean;
  canNavigateAway: boolean;
  draftKey: string | null;
}

export type HelperSurfaceCapability =
  | 'read_context'
  | 'select_context'
  | 'open_canonical_surface'
  | 'pick_catalog_item';

export interface WorkspaceSurfaceDefinition {
  screenCode: WorkspaceScreenCode;
  titlePl: string;
  componentRef: string;
  sizeClass: WorkspaceSurfaceSizeClass;
  surfaceKind: WorkspaceSurfaceKind;
  subjectKind: SurfaceSubjectKind;
  supportsMiniSld: boolean;
  supportsChildren: boolean;
  requiresSession: boolean;
}

export interface HelperSurfaceDefinition {
  helperCode: HelperSurfaceCode;
  titlePl: string;
  componentRef: string;
  allowedCapabilities: HelperSurfaceCapability[];
  mayWriteModel: false;
  mayOwnResults: false;
  mayOwnReportState: false;
}

export interface WorkspaceScreenMatrixEntry {
  screenCode: WorkspaceScreenCode;
  titlePl: string;
  surfaceKind: WorkspaceSurfaceKind;
  sizeClass: WorkspaceSurfaceSizeClass;
  entityType: EntityTypeCode | null;
  parentScreenCode: WorkspaceSurfaceCode | null;
  allowedTabIds: string[];
  defaultTabId: string | null;
  saveMode: WorkspaceSurfaceSaveMode;
  leaveGuardPolicy: WorkspaceLeaveGuardPolicy;
  restorePolicy: WorkspaceRestorePolicy;
  supportsMiniSld: boolean;
  historyPolicy: RouteHistoryPolicy;
  requiresAnalysisCaseContext: boolean;
  prerequisiteCodes: string[];
}

export interface ScreenTransitionPolicy {
  screenCode: WorkspaceScreenCode;
  allowedOpenFrom: WorkspaceSurfaceCode[];
  allowedOpenTargets: WorkspaceSurfaceCode[];
  forcedIntermediateSteps: WorkspaceSurfaceCode[];
  closeReturnsTo: WorkspaceSurfaceCode | 'parent';
  invalidRouteFallback: WorkspaceSurfaceCode;
}

export interface SurfaceStackInvariantViolation {
  code: string;
  surfaceRef: string;
  messagePl: string;
}

export interface SurfaceCommitPolicy {
  screenCode: WorkspaceScreenCode;
  commitScope: 'self_only' | 'parent_scope' | 'transaction_scope';
  saveOwnerSurface: WorkspaceScreenCode | 'self' | 'parent';
  writesDirectlyToModel: boolean;
  writesToParentDraft: boolean;
}

export type EditLockScope = 'entity' | 'subtree' | 'snapshot';

export interface WorkspaceEditingSession {
  editingSessionRef: string;
  browserInstanceRef: string;
  tabRef: string;
  entityRef: string | null;
  snapshotRef: string | null;
  variantRef: string | null;
  startedAt: string;
  isPrimaryForEntity: boolean;
}

export interface EditingLease {
  editingSessionRef: string;
  entityRef: string;
  lockScope: EditLockScope;
  holderTabRef: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'taken_over' | 'released' | 'invalid_due_to_revision' | 'abandoned';
}

export interface SurfaceDraftRecord {
  draftRef: string;
  surfaceRef: string;
  screenCode: WorkspaceSurfaceCode;
  entityRef: string | null;
  baseModelRevision: string;
  savedAt: string;
  expiresAt: string;
  payload: Record<string, unknown>;
  payloadSchemaVersion: string;
  actorRef: string | null;
  status: 'active' | 'expired' | 'invalid_due_to_revision' | 'abandoned';
}

export interface DraftStoragePolicy {
  storageScope: 'session' | 'browser_local';
  expiresAfterMinutes: number;
  crossTabSync: boolean;
  requiresRevisionMatch: boolean;
}

export type DraftConflictResolution =
  | 'discard'
  | 'manual_review'
  | 'follow_successor_if_safe';

export interface CanonicalWritePrecondition {
  expectedRevisionToken: string;
  expectedSnapshotRef: string;
  expectedLineageRef: string | null;
}

export interface CanonicalWritePreconditionSet {
  entityPreconditions: Array<{
    entityRef: string;
    expectedRevisionToken: string;
    expectedSnapshotRef: string;
    expectedLineageRef: string | null;
  }>;
}

export interface ConcurrencyConflictError {
  code: 'revision_conflict';
  entityRef: string;
  actualRevisionToken: string;
  expectedRevisionToken: string;
  messagePl: string;
}

export interface BaseModelRevisionDescriptor {
  entityRef: string;
  entityType: EntityTypeCode;
  snapshotRef: string;
  lineageRef: string | null;
  revisionToken: string;
  revisionCreatedAt: string;
}

export type RevisionComparisonResult =
  | 'same_revision'
  | 'same_entity_newer_revision'
  | 'entity_deleted'
  | 'entity_recreated'
  | 'different_context';

export type GeometryOverrideRetentionPolicy =
  | 'keep_unconditionally'
  | 'keep_if_entity_survives'
  | 'drop_if_entity_replaced';

export interface GeometryOverrideBinding {
  entityRef: string;
  overrideRef: string;
  retentionPolicy: GeometryOverrideRetentionPolicy;
}

export interface GeometryOverrideImpact {
  keptOverrideRefs: string[];
  movedOverrideRefs: Array<{ oldRef: string; newRef: string }>;
  droppedOverrideRefs: string[];
}

export interface EntitySuccessorMapping {
  oldRef: string;
  oldType: EntityTypeCode;
  successorRef: string | null;
  successorType: EntityTypeCode | null;
  successorReason: 'merged' | 'recreated' | 'split' | 'removed_without_successor' | 'retyped';
  uiFollowAllowed: boolean;
  uiFollowMessagePl: string | null;
}

export interface EntitySuccessorResolution {
  successorMapping: EntitySuccessorMapping[];
  geometryImpact: GeometryOverrideImpact;
  uiFollowAction: 'follow_successor' | 'return_to_parent' | 'block_for_manual_resolution';
}

export interface OperationTransactionResult {
  transactionRef: string;
  operationName: string;
  status: 'success' | 'partial' | 'failed';
  createdRefs: string[];
  updatedRefs: string[];
  removedRefs: string[];
  successorRefs: Record<string, string | null>;
  invalidatedSurfaceRefs: string[];
  invalidatedRunRefs: string[];
  warnings: string[];
  rollbackPossible: boolean;
  rollbackToken: string | null;
  actorRef: string | null;
  actorReasonPl: string | null;
  sourceSurfaceRef: string | null;
  createdAt: string;
  geometryImpact: GeometryOverrideImpact;
}

export interface RepairTargetDescriptor {
  screenCode: WorkspaceSurfaceCode;
  entityType: EntityTypeCode | null;
  entityRef: string | null;
  tabId: string | null;
  subtabId: string | null;
  fieldAnchor: string | null;
}

export interface CanonicalIssue {
  code: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  scope: 'surface' | 'entity' | 'transaction' | 'analysis_case' | 'run' | 'report' | 'documentation';
  entityRef: string | null;
  screenCode: WorkspaceSurfaceCode | null;
  messagePl: string;
  repairSurface: WorkspaceSurfaceCode | null;
}

export interface CanonicalIssuePolicy {
  severity: CanonicalIssue['severity'];
  scope: CanonicalIssue['scope'];
  defaultMessagePl: string;
  repairTarget: RepairTargetDescriptor | null;
  blocksSave: boolean;
  blocksAnalysis: boolean;
  blocksReport: boolean;
  allowedInPartial: boolean;
}

export interface ExportArtifact {
  exportRef: string;
  exportKind: 'pdf' | 'docx' | 'csv' | 'xlsx' | 'json' | 'whitebox_package';
  analysisCaseRef: string | null;
  proofPackRef: string | null;
  resultHash: string | null;
  inputHash: string | null;
  generatedAt: string;
  generatedByVersion: string;
  completenessStatus: 'complete' | 'partial' | 'failed' | 'not_applicable';
}

export interface ExportPolicyEntry {
  exportKind: ExportArtifact['exportKind'];
  allowsPartial: boolean;
  requiresPartialConfirmation: boolean;
  carriesAnalysisCaseContext: boolean;
  carriesProofPackRef: boolean;
  carriesResultHash: boolean;
  carriesInputHash: boolean;
  carriesGeneratedAt: boolean;
  carriesGeneratedByVersion: boolean;
  nullRendering: 'dash' | 'empty_cell' | 'null';
  notApplicableRendering: 'label' | 'empty_cell';
  partialRendering: 'warning_block' | 'blocked' | 'worksheet_warning' | 'status_field';
}

export interface AnalysisCaseContextReproducibility {
  solverFamily: string;
  solverVersion: string;
  methodVersion: string;
  formulaSetVersion: string;
  standardBasisRef: string[];
  inputHash: string;
  resultHash: string | null;
  domainModelVersion: string;
  bayContractVersion: string;
  resultsContractVersion: string;
  proofRendererVersion: string;
  catalogSnapshotRef: string;
  catalogSchemaVersion: string;
  tolerancePolicyRef: string;
  roundingPolicyRef: string;
  qualityGatePolicyVersion: string;
}

export type ResultCompletenessStatus = 'complete' | 'partial' | 'failed' | 'not_applicable';

export interface ResultCompleteness {
  status: ResultCompletenessStatus;
  completedModules: string[];
  missingModules: string[];
  missingPrerequisites: string[];
}

export const SCREEN_CODES: WorkspaceScreenCode[] = [
  'E-00', 'E-01', 'E-02', 'E-03', 'E-04', 'E-05', 'E-06', 'E-07', 'E-08', 'E-09', 'E-10', 'E-11',
  'E-12', 'E-13', 'E-14', 'E-15', 'E-16', 'E-17', 'E-18', 'E-19', 'E-20', 'E-21', 'E-22', 'E-23',
  'E-24', 'E-25', 'E-26', 'E-27', 'E-28', 'E-29', 'E-30', 'E-31', 'E-32', 'E-33', 'E-34',
];

export const HELPER_SURFACE_CODES: HelperSurfaceCode[] = [
  'variants_runs',
  'catalog_picker',
  'catalog_admin',
  'case_context',
];

const ROUTE_MANAGED_SCREEN_CODES = new Set<WorkspaceSurfaceCode>([
  ANALYSIS_SURFACE_SCREEN_CODE,
  REPORT_SURFACE_SCREEN_CODE,
  'E-28',
  'E-29',
  'E-30',
  'E-31',
  'E-32',
  'E-33',
  'E-34',
  ...HELPER_SURFACE_CODES,
]);

const SCREEN_DEFINITIONS: Record<WorkspaceScreenCode, WorkspaceSurfaceDefinition> = {
  'E-00': { screenCode: 'E-00', titlePl: 'Pulpit projektu', componentRef: 'ProjectDashboardSurface', sizeClass: 'C', surfaceKind: 'pomocniczy', subjectKind: 'entity', supportsMiniSld: false, supportsChildren: true, requiresSession: false },
  'E-01': { screenCode: 'E-01', titlePl: 'Glowne okno robocze ze schematem jednokreskowym', componentRef: 'CanonicalLayout', sizeClass: 'C', surfaceKind: 'obiektowy', subjectKind: 'entity', supportsMiniSld: true, supportsChildren: true, requiresSession: false },
  'E-02': { screenCode: 'E-02', titlePl: 'Drzewo modelu sieci', componentRef: 'NetworkTreeSurface', sizeClass: 'B', surfaceKind: 'obiektowy', subjectKind: 'entity', supportsMiniSld: false, supportsChildren: false, requiresSession: false },
  'E-03': { screenCode: 'E-03', titlePl: 'Inspektor elementu', componentRef: 'ElementInspectorSurface', sizeClass: 'B', surfaceKind: 'obiektowy', subjectKind: 'entity', supportsMiniSld: true, supportsChildren: true, requiresSession: false },
  'E-04': { screenCode: 'E-04', titlePl: 'Gotowosc modelu i lista brakow', componentRef: 'ModelGapsSurface', sizeClass: 'B', surfaceKind: 'analityczny', subjectKind: 'analysis_case', supportsMiniSld: false, supportsChildren: false, requiresSession: true },
  'E-05': { screenCode: 'E-05', titlePl: 'Menu kontekstowe schematu', componentRef: 'SchematicContextMenuSurface', sizeClass: 'B', surfaceKind: 'pomocniczy', subjectKind: 'entity', supportsMiniSld: true, supportsChildren: false, requiresSession: false },
  'E-06': { screenCode: 'E-06', titlePl: 'Nakladka wynikowa na schemacie', componentRef: 'AnalysisWorkspaceSurface', sizeClass: 'C', surfaceKind: 'analityczny', subjectKind: 'analysis_run', supportsMiniSld: true, supportsChildren: true, requiresSession: true },
  'E-07': { screenCode: 'E-07', titlePl: 'Zakres i warunki obliczeń', componentRef: 'AnalysisCasesSurface', sizeClass: 'B', surfaceKind: 'analityczny', subjectKind: 'analysis_case', supportsMiniSld: false, supportsChildren: false, requiresSession: true },
  'E-08': { screenCode: 'E-08', titlePl: 'Warianty pracy i przelaczenia', componentRef: 'VariantSwitchingSurface', sizeClass: 'B', surfaceKind: 'analityczny', subjectKind: 'analysis_case', supportsMiniSld: true, supportsChildren: false, requiresSession: true },
  'E-09': { screenCode: 'E-09', titlePl: 'Historia modelu i obliczeń', componentRef: 'RunHistorySurface', sizeClass: 'B', surfaceKind: 'analityczny', subjectKind: 'analysis_run', supportsMiniSld: false, supportsChildren: false, requiresSession: true },
  'E-10': { screenCode: 'E-10', titlePl: 'Zrodlo zasilania GPZ', componentRef: 'GpzSupplySourceSurface', sizeClass: 'B', surfaceKind: 'edycyjny', subjectKind: 'entity', supportsMiniSld: false, supportsChildren: true, requiresSession: true },
  'E-11': { screenCode: 'E-11', titlePl: 'Nowy odcinek ciagu glownego', componentRef: 'MainTrunkSegmentSurface', sizeClass: 'A', surfaceKind: 'edycyjny', subjectKind: 'entity', supportsMiniSld: false, supportsChildren: true, requiresSession: true },
  'E-12': { screenCode: 'E-12', titlePl: 'Stacja transformatorowa - kreator uproszczony', componentRef: 'StationSimpleSurface', sizeClass: 'B', surfaceKind: 'edycyjny', subjectKind: 'entity', supportsMiniSld: false, supportsChildren: true, requiresSession: true },
  'E-13': { screenCode: 'E-13', titlePl: 'Stacja transformatorowa - konfigurator pelny', componentRef: 'StationAdvancedSurface', sizeClass: 'C', surfaceKind: 'edycyjny', subjectKind: 'entity', supportsMiniSld: true, supportsChildren: true, requiresSession: true },
  'E-14': { screenCode: 'E-14', titlePl: 'Pole SN - aparatura, przekladniki i zabezpieczenia', componentRef: 'FieldWorkspaceSurface', sizeClass: 'C', surfaceKind: 'edycyjny', subjectKind: 'entity', supportsMiniSld: true, supportsChildren: true, requiresSession: true },
  'E-15': { screenCode: 'E-15', titlePl: 'Transformator SN/nN', componentRef: 'TransformerSurface', sizeClass: 'B', surfaceKind: 'edycyjny', subjectKind: 'entity', supportsMiniSld: true, supportsChildren: true, requiresSession: true },
  'E-16': { screenCode: 'E-16', titlePl: 'Strona nN i odplywy', componentRef: 'StationLvSideSurface', sizeClass: 'B', surfaceKind: 'edycyjny', subjectKind: 'entity', supportsMiniSld: false, supportsChildren: true, requiresSession: true },
  'E-17': { screenCode: 'E-17', titlePl: 'Zrodlo fotowoltaiczne', componentRef: 'PvSourceSurface', sizeClass: 'B', surfaceKind: 'edycyjny', subjectKind: 'entity', supportsMiniSld: false, supportsChildren: true, requiresSession: true },
  'E-18': { screenCode: 'E-18', titlePl: 'Magazyn energii', componentRef: 'BessSourceSurface', sizeClass: 'B', surfaceKind: 'edycyjny', subjectKind: 'entity', supportsMiniSld: false, supportsChildren: true, requiresSession: true },
  'E-19': { screenCode: 'E-19', titlePl: 'Zlacze kablowe SN', componentRef: 'ZksnSurface', sizeClass: 'B', surfaceKind: 'edycyjny', subjectKind: 'entity', supportsMiniSld: true, supportsChildren: true, requiresSession: true },
  'E-20': { screenCode: 'E-20', titlePl: 'Slup rozgalezny', componentRef: 'BranchPoleSurface', sizeClass: 'B', surfaceKind: 'edycyjny', subjectKind: 'entity', supportsMiniSld: false, supportsChildren: true, requiresSession: true },
  'E-21': { screenCode: 'E-21', titlePl: 'Odgalezienie', componentRef: 'BranchSurface', sizeClass: 'A', surfaceKind: 'edycyjny', subjectKind: 'entity', supportsMiniSld: false, supportsChildren: false, requiresSession: true },
  'E-22': { screenCode: 'E-22', titlePl: 'Domkniecie pierscienia i punkt normalnie otwarty', componentRef: 'RingNopSurface', sizeClass: 'B', surfaceKind: 'edycyjny', subjectKind: 'entity', supportsMiniSld: false, supportsChildren: true, requiresSession: true },
  'E-23': { screenCode: 'E-23', titlePl: 'Obciazenie nN', componentRef: 'NnLoadSurface', sizeClass: 'B', surfaceKind: 'edycyjny', subjectKind: 'entity', supportsMiniSld: false, supportsChildren: false, requiresSession: true },
  'E-24': { screenCode: 'E-24', titlePl: 'Edycja parametrow elementu', componentRef: 'ElementParametersSurface', sizeClass: 'B', surfaceKind: 'edycyjny', subjectKind: 'entity', supportsMiniSld: true, supportsChildren: false, requiresSession: true },
  'E-25': { screenCode: 'E-25', titlePl: 'Potwierdzenie usuniecia i skutki topologiczne', componentRef: 'DestructiveTransactionSurface', sizeClass: 'B', surfaceKind: 'edycyjny', subjectKind: 'entity', supportsMiniSld: false, supportsChildren: false, requiresSession: true },
  'E-26': { screenCode: 'E-26', titlePl: 'Katalogi techniczne', componentRef: 'CatalogAdminSurface', sizeClass: 'B', surfaceKind: 'pomocniczy', subjectKind: 'helper_context', supportsMiniSld: false, supportsChildren: false, requiresSession: true },
  'E-27': { screenCode: 'E-27', titlePl: 'Raporty i eksporty', componentRef: 'ReportWorkspaceSurface', sizeClass: 'C', surfaceKind: 'raportowy', subjectKind: 'report', supportsMiniSld: true, supportsChildren: true, requiresSession: true },
  'E-28': { screenCode: 'E-28', titlePl: 'Koordynacja zabezpieczen', componentRef: 'ProtectionCoordinationSurface', sizeClass: 'C', surfaceKind: 'analityczny', subjectKind: 'analysis_run', supportsMiniSld: true, supportsChildren: false, requiresSession: true },
  'E-29': { screenCode: 'E-29', titlePl: 'Skladowe symetryczne i siec zerowa', componentRef: 'SymmetricalComponentsSurface', sizeClass: 'C', surfaceKind: 'analityczny', subjectKind: 'analysis_run', supportsMiniSld: true, supportsChildren: false, requiresSession: true },
  'E-30': { screenCode: 'E-30', titlePl: 'Wymagania przylaczeniowe i kodeks sieciowy', componentRef: 'ComplianceSurface', sizeClass: 'C', surfaceKind: 'analityczny', subjectKind: 'analysis_run', supportsMiniSld: true, supportsChildren: false, requiresSession: true },
  'E-31': { screenCode: 'E-31', titlePl: 'Rejestr zalozen i jakosci danych', componentRef: 'AssumptionsQualitySurface', sizeClass: 'B', surfaceKind: 'analityczny', subjectKind: 'analysis_case', supportsMiniSld: false, supportsChildren: false, requiresSession: true },
  'E-32': { screenCode: 'E-32', titlePl: 'Wklady zrodel', componentRef: 'SourceContributionsSurface', sizeClass: 'C', surfaceKind: 'analityczny', subjectKind: 'analysis_run', supportsMiniSld: true, supportsChildren: false, requiresSession: true },
  'E-33': { screenCode: 'E-33', titlePl: 'Weryfikacja cieplna i dynamiczna toru pradowego', componentRef: 'ThermalDynamicSurface', sizeClass: 'C', surfaceKind: 'analityczny', subjectKind: 'analysis_run', supportsMiniSld: true, supportsChildren: false, requiresSession: true },
  'E-34': { screenCode: 'E-34', titlePl: 'Zbieznosc rozplywu mocy i regulacja zaczepow', componentRef: 'ConvergenceOltcSurface', sizeClass: 'B', surfaceKind: 'analityczny', subjectKind: 'analysis_run', supportsMiniSld: true, supportsChildren: false, requiresSession: true },
};

export const SURFACE_REGISTRY: Record<WorkspaceScreenCode, WorkspaceSurfaceDefinition> = SCREEN_DEFINITIONS;

export const HELPER_SURFACE_REGISTRY: Record<HelperSurfaceCode, HelperSurfaceDefinition> = {
  variants_runs: {
    helperCode: 'variants_runs',
    titlePl: 'Zakres i warunki obliczeń',
    componentRef: 'VariantsRunsHelperSurface',
    allowedCapabilities: ['read_context', 'select_context', 'open_canonical_surface'],
    mayWriteModel: false,
    mayOwnResults: false,
    mayOwnReportState: false,
  },
  catalog_picker: {
    helperCode: 'catalog_picker',
    titlePl: 'WybĂłr pozycji katalogowej',
    componentRef: 'CatalogPickerHelperSurface',
    allowedCapabilities: ['read_context', 'pick_catalog_item', 'open_canonical_surface'],
    mayWriteModel: false,
    mayOwnResults: false,
    mayOwnReportState: false,
  },
  catalog_admin: {
    helperCode: 'catalog_admin',
    titlePl: 'Katalogi',
    componentRef: 'CatalogAdminHelperSurface',
    allowedCapabilities: ['read_context', 'pick_catalog_item'],
    mayWriteModel: false,
    mayOwnResults: false,
    mayOwnReportState: false,
  },
  case_context: {
    helperCode: 'case_context',
    titlePl: 'Warunki obliczeń',
    componentRef: 'CaseContextHelperSurface',
    allowedCapabilities: ['read_context', 'select_context', 'open_canonical_surface'],
    mayWriteModel: false,
    mayOwnResults: false,
    mayOwnReportState: false,
  },
};

const READ_ONLY_SCREENS = new Set<WorkspaceScreenCode>([
  'E-00',
  'E-01',
  'E-02',
  'E-03',
  'E-04',
  'E-05',
  'E-06',
  'E-09',
  'E-26',
  'E-27',
  'E-28',
  'E-29',
  'E-30',
  'E-31',
  'E-32',
  'E-33',
  'E-34',
]);

const TRANSACTIONAL_SCREENS = new Set<WorkspaceScreenCode>([
  'E-07',
  'E-08',
  'E-10',
  'E-13',
  'E-14',
  'E-15',
  'E-16',
  'E-17',
  'E-18',
  'E-19',
  'E-20',
  'E-22',
  'E-25',
]);

const BLOCKING_SCREENS = new Set<WorkspaceScreenCode>([
  'E-07',
  'E-08',
  'E-10',
  'E-13',
  'E-14',
  'E-15',
  'E-19',
  'E-20',
  'E-22',
  'E-25',
]);

const RESTORE_PARENT_SCREENS = new Set<WorkspaceScreenCode>([
  'E-03',
  'E-04',
  'E-10',
  'E-11',
  'E-12',
  'E-13',
  'E-14',
  'E-15',
  'E-16',
  'E-19',
  'E-20',
  'E-21',
  'E-22',
  'E-23',
  'E-24',
  'E-25',
  'E-27',
]);

const ANALYSIS_CONTEXT_SCREENS = new Set<WorkspaceScreenCode>([
  ANALYSIS_SURFACE_SCREEN_CODE,
  REPORT_SURFACE_SCREEN_CODE,
  'E-28',
  'E-29',
  'E-30',
  'E-31',
  'E-32',
  'E-33',
  'E-34',
]);

const screen = (
  screenCode: WorkspaceScreenCode,
  entityType: EntityTypeCode | null,
  allowedTabIds: string[],
  defaultTabId: string | null,
  prerequisiteCodes: string[],
  parentScreenCode: WorkspaceSurfaceCode | null = null,
): WorkspaceScreenMatrixEntry => ({
  screenCode,
  titlePl: SURFACE_REGISTRY[screenCode].titlePl,
  surfaceKind: SURFACE_REGISTRY[screenCode].surfaceKind,
  sizeClass: SURFACE_REGISTRY[screenCode].sizeClass,
  entityType,
  parentScreenCode,
  allowedTabIds,
  defaultTabId,
  saveMode:
    READ_ONLY_SCREENS.has(screenCode)
      ? 'read_only'
      : TRANSACTIONAL_SCREENS.has(screenCode)
        ? 'transactional'
        : screenCode === 'E-11'
          ? 'auto'
          : 'manual',
  leaveGuardPolicy: BLOCKING_SCREENS.has(screenCode)
    ? 'block_until_resolved'
    : READ_ONLY_SCREENS.has(screenCode)
      ? 'free'
      : 'confirm',
  restorePolicy:
    screenCode === 'E-00'
      ? 'none'
      : RESTORE_PARENT_SCREENS.has(screenCode)
        ? 'restore_parent'
        : 'restore_if_compatible',
  supportsMiniSld: SURFACE_REGISTRY[screenCode].supportsMiniSld,
  historyPolicy:
    screenCode === 'E-00' || screenCode === 'E-01'
      ? 'replace_current_entry'
      : screenCode === 'E-05'
        ? 'silent_internal_change'
        : 'push_new_entry',
  requiresAnalysisCaseContext: ANALYSIS_CONTEXT_SCREENS.has(screenCode),
  prerequisiteCodes,
});

export const SCREEN_MATRIX: Record<WorkspaceScreenCode, WorkspaceScreenMatrixEntry> = {
  'E-00': screen('E-00', 'project', ['model', 'gotowosc', 'warianty', 'zdarzenia'], 'model', []),
  'E-01': screen('E-01', 'project', [], null, []),
  'E-02': screen('E-02', 'project', ['drzewo', 'selekcja'], 'drzewo', [], 'E-01'),
  'E-03': screen('E-03', null, ['tozsamosc-techniczna', 'dane-projektowe', 'dane-obliczeniowe', 'wyniki', 'uzasadnienie', 'pochodzenie', 'jakosc'], 'tozsamosc-techniczna', [], 'E-01'),
  'E-04': screen('E-04', 'analysis_case', ['braki', 'naprawy', 'gotowosc'], 'braki', [], 'E-01'),
  'E-05': screen('E-05', null, [], null, [], 'E-01'),
  'E-06': screen('E-06', 'analysis_run', [...ANALYSIS_ROUTE_TAB_IDS], ANALYSIS_ROUTE_DEFAULT_TAB, ['analysis_case_context'], 'E-01'),
  'E-07': screen('E-07', 'analysis_case', ['lista', 'parametry', 'kompletnosc'], 'lista', [], 'E-01'),
  'E-08': screen('E-08', 'analysis_case', ['wariant', 'przelaczenia', 'n-1', 'punkt-normalnie-otwarty'], 'wariant', [], 'E-07'),
  'E-09': screen('E-09', 'analysis_run', ['wersje', 'obliczenia', 'historia'], 'wersje', [], 'E-07'),
  'E-10': screen('E-10', 'gpz', ['uproszczony', 'pelny', 'szyny-sn'], 'uproszczony', [], 'E-01'),
  'E-11': screen('E-11', 'segment', ['kabel-sn', 'linia-napowietrzna-sn'], 'kabel-sn', ['E-14'], 'E-14'),
  'E-12': screen('E-12', 'station', ['typ-topologiczny', 'ustawienia-podstawowe'], 'typ-topologiczny', ['E-11'], 'E-11'),
  'E-13': screen('E-13', 'station', ['topologia', 'transformatory', 'rozdzielnia-sn', 'strona-nn'], 'topologia', ['E-12'], 'E-12'),
  'E-14': screen('E-14', 'sn_bay', ['identyfikacja', 'aparatura', 'przekladniki', 'zabezpieczenia'], 'identyfikacja', ['E-10'], 'E-10'),
  'E-15': screen('E-15', 'station', ['transformator', 'parametry-znamionowe', 'zaczepy'], 'transformator', ['E-13'], 'E-13'),
  'E-16': screen('E-16', 'station_lv_side', ['odplywy', 'zrodla', 'pomiar'], 'odplywy', ['E-13'], 'E-13'),
  'E-17': screen('E-17', 'pv_source', ['identyfikacja', 'parametry-elektryczne', 'frt'], 'identyfikacja', [], 'E-01'),
  'E-18': screen('E-18', 'bess_source', ['identyfikacja', 'sterowanie', 'frt'], 'identyfikacja', [], 'E-01'),
  'E-19': screen('E-19', 'zksn', ['identyfikacja', 'pole', 'topologia'], 'identyfikacja', ['E-11'], 'E-11'),
  'E-20': screen('E-20', 'branch_pole', ['identyfikacja', 'topologia'], 'identyfikacja', ['E-11'], 'E-11'),
  'E-21': screen('E-21', 'branch', ['rodzina-odgalezienia', 'parametry'], 'rodzina-odgalezienia', ['E-20'], 'E-20'),
  'E-22': screen('E-22', 'ring', ['domkniecie-pierscienia', 'punkt-normalnie-otwarty'], 'domkniecie-pierscienia', ['E-21'], 'E-21'),
  'E-23': screen('E-23', 'station_lv_side', ['obciazenie', 'profil', 'jakosc-danych'], 'obciazenie', ['E-16'], 'E-16'),
  'E-24': screen('E-24', null, ['parametry', 'jakosc-danych', 'pochodzenie'], 'parametry', [], 'E-03'),
  'E-25': screen('E-25', null, ['potwierdzenie', 'skutki-topologiczne'], 'potwierdzenie', [], 'E-03'),
  'E-26': screen('E-26', null, ['katalogi', 'wyszukiwarka', 'powiazania'], 'katalogi', [], 'catalog_admin'),
  'E-27': screen('E-27', 'report', ['zakres', 'podglad', 'eksport', 'uzasadnienia'], 'zakres', ['analysis_case_context'], 'E-06'),
  'E-28': screen('E-28', 'analysis_run', ['tcc', 'nastawy', 'selektywnosc', 'spz', 'uzasadnienie'], 'tcc', ['analysis_case_context'], 'E-06'),
  'E-29': screen('E-29', 'analysis_run', ['z1-z2-z0', 'siec-zerowa', 'petersen', '3i0-3u0', 'uzasadnienie'], 'z1-z2-z0', ['analysis_case_context'], 'E-06'),
  'E-30': screen('E-30', 'analysis_run', ['reguly', 'p(f)', 'q(u)', 'frt', 'wynik'], 'reguly', ['analysis_case_context'], 'E-06'),
  'E-31': screen('E-31', 'analysis_case', ['zalozenia', 'jakosc', 'pochodzenie'], 'zalozenia', ['analysis_case_context'], 'E-06'),
  'E-32': screen('E-32', 'analysis_run', ['zrodla', 'wezly', 'galezie', 'pola', 'uzasadnienie'], 'zrodla', ['analysis_case_context'], 'E-06'),
  'E-33': screen('E-33', 'analysis_run', ['tor', 'cieplna', 'dynamiczna', 'najsłabszy-element', 'uzasadnienie'], 'tor', ['analysis_case_context'], 'E-06'),
  'E-34': screen('E-34', 'analysis_run', ['iteracje', 'pv-pq', 'q-limits', 'oltc', 'uzasadnienie'], 'iteracje', ['analysis_case_context'], 'E-06'),
};

const transition = (
  screenCode: WorkspaceScreenCode,
  allowedOpenFrom: WorkspaceSurfaceCode[],
  allowedOpenTargets: WorkspaceSurfaceCode[],
  closeReturnsTo: WorkspaceSurfaceCode | 'parent',
  invalidRouteFallback: WorkspaceSurfaceCode,
  forcedIntermediateSteps: WorkspaceSurfaceCode[] = [],
): ScreenTransitionPolicy => ({
  screenCode,
  allowedOpenFrom,
  allowedOpenTargets,
  forcedIntermediateSteps,
  closeReturnsTo,
  invalidRouteFallback,
});

export const SCREEN_TRANSITIONS: Record<WorkspaceScreenCode, ScreenTransitionPolicy> = {
  'E-00': transition('E-00', ['E-00'], SCREEN_CODES.filter((code) => code !== 'E-00'), 'parent', 'E-00'),
  'E-01': transition('E-01', ['E-00'], ['E-02', 'E-03', 'E-04', 'E-07', 'E-08', 'E-09', 'E-10', 'E-26', 'variants_runs', 'catalog_admin', 'case_context'], 'E-00', 'E-00'),
  'E-02': transition('E-02', ['E-00', 'E-01'], ['E-03', 'E-10', 'E-12', 'E-13', 'E-14', 'E-15', 'E-16', 'E-17', 'E-18', 'E-19', 'E-20', 'E-21', 'E-22', 'E-23', 'E-24', 'E-25'], 'parent', 'E-01'),
  'E-03': transition('E-03', ['E-01', 'E-02', 'E-06'], ['E-14', 'E-24', 'E-25'], 'parent', 'E-01'),
  'E-04': transition('E-04', ['E-01', 'E-02', 'E-06', 'case_context'], ['E-10', 'E-11', 'E-12', 'E-13', 'E-14', 'E-15', 'E-16', 'E-17', 'E-18', 'E-19', 'E-20', 'E-21', 'E-22', 'E-23', 'E-26'], 'parent', 'E-01'),
  'E-05': transition('E-05', ['E-01', 'E-02', 'E-03', 'E-14'], ['E-10', 'E-11', 'E-12', 'E-13', 'E-14', 'E-15', 'E-16', 'E-17', 'E-18', 'E-19', 'E-20', 'E-21', 'E-22', 'E-23', 'E-24', 'E-25', 'E-26'], 'parent', 'E-01'),
  'E-06': transition('E-06', ['E-01', 'E-07', 'E-08', 'E-09', 'variants_runs', 'case_context', 'E-27'], ['E-27', 'E-28', 'E-29', 'E-30', 'E-31', 'E-32', 'E-33', 'E-34'], 'parent', 'E-01'),
  'E-07': transition('E-07', ['E-00', 'E-01', 'case_context'], ['E-08', 'E-09', 'E-06', 'E-27'], 'parent', 'E-01'),
  'E-08': transition('E-08', ['E-01', 'E-07', 'variants_runs'], ['E-06', 'E-09', 'E-27'], 'parent', 'E-07'),
  'E-09': transition('E-09', ['E-01', 'E-07', 'E-08', 'variants_runs'], ['E-06', 'E-27'], 'parent', 'E-07'),
  'E-10': transition('E-10', ['E-01', 'E-02', 'E-04'], ['E-14'], 'parent', 'E-01'),
  'E-11': transition('E-11', ['E-14'], ['E-12', 'E-13', 'E-19', 'E-20', 'E-21', 'E-22', 'E-23'], 'parent', 'E-14'),
  'E-12': transition('E-12', ['E-11', 'E-02'], ['E-13', 'E-15', 'E-16', 'E-23'], 'parent', 'E-11'),
  'E-13': transition('E-13', ['E-12', 'E-02'], ['E-14', 'E-15', 'E-16', 'E-24', 'E-25'], 'parent', 'E-12'),
  'E-14': transition('E-14', ['E-03', 'E-10', 'E-13'], ['E-11', 'E-24', 'E-28', 'E-29', 'E-32'], 'parent', 'E-10'),
  'E-15': transition('E-15', ['E-12', 'E-13'], ['E-16', 'E-24', 'E-29', 'E-33', 'E-34'], 'parent', 'E-13'),
  'E-16': transition('E-16', ['E-12', 'E-13', 'E-15'], ['E-23', 'E-24'], 'parent', 'E-13'),
  'E-17': transition('E-17', ['E-01', 'E-02', 'E-16'], ['E-24', 'E-30', 'E-32'], 'parent', 'E-01'),
  'E-18': transition('E-18', ['E-01', 'E-02', 'E-16'], ['E-24', 'E-30', 'E-32'], 'parent', 'E-01'),
  'E-19': transition('E-19', ['E-11', 'E-02'], ['E-24', 'E-25'], 'parent', 'E-11'),
  'E-20': transition('E-20', ['E-11', 'E-02'], ['E-21', 'E-24', 'E-25'], 'parent', 'E-11'),
  'E-21': transition('E-21', ['E-11', 'E-20', 'E-02'], ['E-24', 'E-25'], 'parent', 'E-11'),
  'E-22': transition('E-22', ['E-11', 'E-21', 'E-02'], ['E-08', 'E-24', 'E-25'], 'parent', 'E-11'),
  'E-23': transition('E-23', ['E-11', 'E-12', 'E-16', 'E-02'], ['E-24', 'E-25'], 'parent', 'E-16'),
  'E-24': transition('E-24', ['E-02', 'E-03', 'E-11', 'E-12', 'E-13', 'E-14', 'E-15', 'E-16', 'E-17', 'E-18', 'E-19', 'E-20', 'E-21', 'E-22', 'E-23'], ['E-06', 'E-25', 'E-26'], 'parent', 'E-01'),
  'E-25': transition('E-25', ['E-03', 'E-13', 'E-19', 'E-20', 'E-21', 'E-22', 'E-23', 'E-24'], ['E-02', 'E-04'], 'parent', 'E-01'),
  'E-26': transition('E-26', ['E-01', 'E-04', 'catalog_admin', 'catalog_picker'], ['catalog_picker', 'E-24'], 'parent', 'E-01'),
  'E-27': transition('E-27', ['E-01', 'E-06', 'E-07', 'E-08', 'E-09', 'variants_runs', 'case_context'], ['E-28', 'E-29', 'E-30', 'E-31', 'E-32', 'E-33', 'E-34'], 'parent', 'E-06'),
  'E-28': transition('E-28', ['E-06', 'E-14', 'E-27'], [], 'parent', 'E-06'),
  'E-29': transition('E-29', ['E-06', 'E-14', 'E-15', 'E-27'], [], 'parent', 'E-06'),
  'E-30': transition('E-30', ['E-06', 'E-17', 'E-18', 'E-27'], [], 'parent', 'E-06'),
  'E-31': transition('E-31', ['E-06', 'case_context', 'E-27'], [], 'parent', 'E-06'),
  'E-32': transition('E-32', ['E-06', 'E-14', 'E-17', 'E-18', 'E-27'], [], 'parent', 'E-06'),
  'E-33': transition('E-33', ['E-06', 'E-14', 'E-15', 'E-27'], [], 'parent', 'E-06'),
  'E-34': transition('E-34', ['E-06', 'E-15', 'E-27'], [], 'parent', 'E-06'),
};

export const SURFACE_COMMIT_POLICY_MATRIX: Partial<Record<WorkspaceScreenCode, SurfaceCommitPolicy>> = {
  'E-07': { screenCode: 'E-07', commitScope: 'transaction_scope', saveOwnerSurface: 'self', writesDirectlyToModel: false, writesToParentDraft: false },
  'E-08': { screenCode: 'E-08', commitScope: 'transaction_scope', saveOwnerSurface: 'self', writesDirectlyToModel: false, writesToParentDraft: false },
  'E-10': { screenCode: 'E-10', commitScope: 'self_only', saveOwnerSurface: 'self', writesDirectlyToModel: false, writesToParentDraft: false },
  'E-11': { screenCode: 'E-11', commitScope: 'self_only', saveOwnerSurface: 'self', writesDirectlyToModel: true, writesToParentDraft: false },
  'E-12': { screenCode: 'E-12', commitScope: 'parent_scope', saveOwnerSurface: 'parent', writesDirectlyToModel: false, writesToParentDraft: true },
  'E-13': { screenCode: 'E-13', commitScope: 'transaction_scope', saveOwnerSurface: 'self', writesDirectlyToModel: false, writesToParentDraft: false },
  'E-14': { screenCode: 'E-14', commitScope: 'transaction_scope', saveOwnerSurface: 'self', writesDirectlyToModel: false, writesToParentDraft: false },
  'E-15': { screenCode: 'E-15', commitScope: 'transaction_scope', saveOwnerSurface: 'self', writesDirectlyToModel: false, writesToParentDraft: false },
  'E-16': { screenCode: 'E-16', commitScope: 'parent_scope', saveOwnerSurface: 'parent', writesDirectlyToModel: false, writesToParentDraft: true },
  'E-17': { screenCode: 'E-17', commitScope: 'self_only', saveOwnerSurface: 'self', writesDirectlyToModel: false, writesToParentDraft: false },
  'E-18': { screenCode: 'E-18', commitScope: 'self_only', saveOwnerSurface: 'self', writesDirectlyToModel: false, writesToParentDraft: false },
  'E-19': { screenCode: 'E-19', commitScope: 'transaction_scope', saveOwnerSurface: 'self', writesDirectlyToModel: false, writesToParentDraft: false },
  'E-20': { screenCode: 'E-20', commitScope: 'transaction_scope', saveOwnerSurface: 'self', writesDirectlyToModel: false, writesToParentDraft: false },
  'E-21': { screenCode: 'E-21', commitScope: 'self_only', saveOwnerSurface: 'self', writesDirectlyToModel: true, writesToParentDraft: false },
  'E-22': { screenCode: 'E-22', commitScope: 'transaction_scope', saveOwnerSurface: 'self', writesDirectlyToModel: false, writesToParentDraft: false },
  'E-23': { screenCode: 'E-23', commitScope: 'self_only', saveOwnerSurface: 'self', writesDirectlyToModel: true, writesToParentDraft: false },
  'E-24': { screenCode: 'E-24', commitScope: 'self_only', saveOwnerSurface: 'self', writesDirectlyToModel: false, writesToParentDraft: false },
  'E-25': { screenCode: 'E-25', commitScope: 'transaction_scope', saveOwnerSurface: 'self', writesDirectlyToModel: false, writesToParentDraft: false },
};

export const DEFAULT_LOCK_SCOPE_BY_SCREEN: Partial<Record<WorkspaceScreenCode, EditLockScope>> = {
  'E-13': 'subtree',
  'E-14': 'entity',
  'E-15': 'subtree',
  'E-17': 'entity',
  'E-18': 'entity',
  'E-19': 'subtree',
  'E-20': 'subtree',
  'E-22': 'subtree',
  'E-25': 'subtree',
  'E-31': 'snapshot',
};

export const ISSUE_MATRIX: Record<string, CanonicalIssuePolicy> = {
  'surface.revision_conflict': {
    severity: 'critical',
    scope: 'surface',
    defaultMessagePl: 'Wykryto konflikt rewizji powierzchni.',
    repairTarget: { screenCode: 'E-31', entityType: 'analysis_case', entityRef: null, tabId: 'quality', subtabId: null, fieldAnchor: null },
    blocksSave: true,
    blocksAnalysis: false,
    blocksReport: false,
    allowedInPartial: false,
  },
  'surface.leave_guard_blocked': {
    severity: 'warning',
    scope: 'surface',
    defaultMessagePl: 'Powierzchnia zawiera nierozstrzygniete zmiany.',
    repairTarget: null,
    blocksSave: false,
    blocksAnalysis: false,
    blocksReport: false,
    allowedInPartial: true,
  },
  'route.invalid_target': {
    severity: 'error',
    scope: 'surface',
    defaultMessagePl: 'Zadana trasa nie prowadzi do poprawnego celu.',
    repairTarget: { screenCode: 'E-00', entityType: 'project', entityRef: null, tabId: null, subtabId: null, fieldAnchor: null },
    blocksSave: false,
    blocksAnalysis: false,
    blocksReport: false,
    allowedInPartial: false,
  },
  'entity.deleted': {
    severity: 'critical',
    scope: 'entity',
    defaultMessagePl: 'Byt zostal usuniety.',
    repairTarget: { screenCode: 'E-00', entityType: 'project', entityRef: null, tabId: null, subtabId: null, fieldAnchor: null },
    blocksSave: true,
    blocksAnalysis: true,
    blocksReport: true,
    allowedInPartial: false,
  },
  'analysis.partial_missing_z0': {
    severity: 'warning',
    scope: 'analysis_case',
    defaultMessagePl: 'Wynik jest czesciowy z powodu brakow danych Z0.',
      repairTarget: { screenCode: 'E-29', entityType: 'analysis_run', entityRef: null, tabId: 'z1-z2-z0', subtabId: null, fieldAnchor: null },
    blocksSave: false,
    blocksAnalysis: false,
    blocksReport: false,
    allowedInPartial: true,
  },
  'analysis.not_applicable': {
    severity: 'info',
    scope: 'analysis_case',
    defaultMessagePl: 'Modul nie dotyczy biezacego przypadku.',
    repairTarget: null,
    blocksSave: false,
    blocksAnalysis: false,
    blocksReport: false,
    allowedInPartial: true,
  },
  'report.partial_confirmation_required': {
    severity: 'warning',
    scope: 'report',
    defaultMessagePl: 'Raport wymaga potwierdzenia dla wyniku czesciowego.',
      repairTarget: { screenCode: 'E-27', entityType: 'report', entityRef: null, tabId: 'zakres', subtabId: null, fieldAnchor: null },
    blocksSave: false,
    blocksAnalysis: false,
    blocksReport: false,
    allowedInPartial: true,
  },
  'migration.legacy_payload_incomplete': {
    severity: 'error',
    scope: 'documentation',
    defaultMessagePl: 'Legacy payload nie zostal w pelni zmigrowany do kanonu V12.5.',
      repairTarget: { screenCode: 'E-04', entityType: 'analysis_case', entityRef: null, tabId: 'naprawy', subtabId: null, fieldAnchor: null },
    blocksSave: false,
    blocksAnalysis: true,
    blocksReport: true,
    allowedInPartial: false,
  },
  'docs.archived_source_referenced': {
    severity: 'error',
    scope: 'documentation',
    defaultMessagePl: 'Aktywna dokumentacja odwoluje sie do archiwum jako zrodla prawdy.',
    repairTarget: null,
    blocksSave: false,
    blocksAnalysis: false,
    blocksReport: true,
    allowedInPartial: false,
  },
};

export const EXPORT_POLICY_MATRIX: Record<ExportArtifact['exportKind'], ExportPolicyEntry> = {
  pdf: { exportKind: 'pdf', allowsPartial: true, requiresPartialConfirmation: true, carriesAnalysisCaseContext: true, carriesProofPackRef: true, carriesResultHash: true, carriesInputHash: true, carriesGeneratedAt: true, carriesGeneratedByVersion: true, nullRendering: 'dash', notApplicableRendering: 'label', partialRendering: 'warning_block' },
  docx: { exportKind: 'docx', allowsPartial: true, requiresPartialConfirmation: true, carriesAnalysisCaseContext: true, carriesProofPackRef: true, carriesResultHash: true, carriesInputHash: true, carriesGeneratedAt: true, carriesGeneratedByVersion: true, nullRendering: 'dash', notApplicableRendering: 'label', partialRendering: 'warning_block' },
  csv: { exportKind: 'csv', allowsPartial: false, requiresPartialConfirmation: false, carriesAnalysisCaseContext: true, carriesProofPackRef: false, carriesResultHash: true, carriesInputHash: true, carriesGeneratedAt: true, carriesGeneratedByVersion: true, nullRendering: 'empty_cell', notApplicableRendering: 'empty_cell', partialRendering: 'blocked' },
  xlsx: { exportKind: 'xlsx', allowsPartial: true, requiresPartialConfirmation: true, carriesAnalysisCaseContext: true, carriesProofPackRef: true, carriesResultHash: true, carriesInputHash: true, carriesGeneratedAt: true, carriesGeneratedByVersion: true, nullRendering: 'empty_cell', notApplicableRendering: 'label', partialRendering: 'worksheet_warning' },
  json: { exportKind: 'json', allowsPartial: true, requiresPartialConfirmation: false, carriesAnalysisCaseContext: true, carriesProofPackRef: true, carriesResultHash: true, carriesInputHash: true, carriesGeneratedAt: true, carriesGeneratedByVersion: true, nullRendering: 'null', notApplicableRendering: 'label', partialRendering: 'status_field' },
  whitebox_package: { exportKind: 'whitebox_package', allowsPartial: true, requiresPartialConfirmation: false, carriesAnalysisCaseContext: true, carriesProofPackRef: true, carriesResultHash: true, carriesInputHash: true, carriesGeneratedAt: true, carriesGeneratedByVersion: true, nullRendering: 'null', notApplicableRendering: 'label', partialRendering: 'status_field' },
};

export const DEFAULT_DRAFT_STORAGE_POLICY: DraftStoragePolicy = {
  storageScope: 'session',
  expiresAfterMinutes: 480,
  crossTabSync: false,
  requiresRevisionMatch: true,
};

export const DEFAULT_BLOCK_STATE: SurfaceBlockState = {
  blocked: false,
  reason: null,
  messagePl: null,
  repairSurface: null,
};

export const DEFAULT_WORKSPACE_SESSION: WorkspaceSurfaceSession = {
  surfaceRef: 'surface:unbound',
  screenCode: 'E-00',
  lifecycleState: 'idle',
  saveMode: 'manual',
  hasUnsavedChanges: false,
  isRestorable: false,
  parentSurfaceRef: null,
  originSurfaceRef: null,
  activeEntityRef: null,
  activeTabId: null,
  activeSubtabId: null,
  selectionRef: null,
  returnAnchor: null,
  scrollState: null,
  splitterState: null,
  filterStateRef: null,
  openedAt: new Date(0).toISOString(),
  lastInteractionAt: new Date(0).toISOString(),
  restorePayloadRef: null,
  lastErrorCode: null,
  leaveGuardPolicy: 'free',
  restorePolicy: 'none',
  baseModelRevision: 'rev:unbound',
  activeSnapshotRef: null,
  activeVariantRef: null,
  activeRunRef: null,
  blockState: DEFAULT_BLOCK_STATE,
  isDirty: false,
  canNavigateAway: true,
  draftKey: null,
};

export function createWorkspaceSurfaceSession(
  overrides: Partial<WorkspaceSurfaceSession> = {},
): WorkspaceSurfaceSession {
  const now = new Date().toISOString();
  const session: WorkspaceSurfaceSession = {
    ...DEFAULT_WORKSPACE_SESSION,
    openedAt: now,
    lastInteractionAt: now,
    ...overrides,
  };
  return {
    ...session,
    isDirty: overrides.isDirty ?? session.hasUnsavedChanges,
    canNavigateAway:
      overrides.canNavigateAway
      ?? (!session.hasUnsavedChanges && !session.blockState.blocked),
  };
}

export function resolveSaveModeLabel(saveMode: WorkspaceSurfaceSaveMode): string {
  switch (saveMode) {
    case 'auto':
      return 'natychmiastowy';
    case 'manual':
      return 'roboczy';
    case 'transactional':
      return 'transakcyjny';
    case 'read_only':
      return 'tylko odczyt';
  }
}

export function isHelperSurfaceCode(value: string | null | undefined): value is HelperSurfaceCode {
  return value != null && HELPER_SURFACE_CODES.includes(value as HelperSurfaceCode);
}

export function isScreenCode(value: string | null | undefined): value is WorkspaceScreenCode {
  return value != null && SCREEN_CODES.includes(value as WorkspaceScreenCode);
}

export function isRouteManagedSurface(
  surface: WorkspaceSurfaceDescriptor | null | undefined,
): boolean {
  return surface != null && ROUTE_MANAGED_SCREEN_CODES.has(surface.screenCode);
}

export function validateSurfaceStack(
  stack: WorkspaceSurfaceDescriptor[],
): SurfaceStackInvariantViolation[] {
  const violations: SurfaceStackInvariantViolation[] = [];
  if (stack.length === 0) {
    return violations;
  }

  const seen = new Set<string>();
  for (const surface of stack) {
    if (seen.has(surface.surfaceId)) {
      violations.push({
        code: 'surface.duplicate_surface_ref',
        surfaceRef: surface.surfaceId,
        messagePl: 'Powierzchnia wystepuje wielokrotnie na stosie.',
      });
    }
    seen.add(surface.surfaceId);
  }

  for (let index = 0; index < stack.length; index += 1) {
    const surface = stack[index];
    if (index === 0 && surface.screenCode === 'E-00') {
      continue;
    }
    if (index > 0 && surface.parentSurfaceId === null && surface.stackLevel > 1) {
      violations.push({
        code: 'surface.missing_parent',
        surfaceRef: surface.surfaceId,
        messagePl: 'Powierzchnia potomna nie ma rodzica.',
      });
    }
    if (surface.parentSurfaceId != null) {
      const parentExists = stack.some((candidate) => candidate.surfaceId === surface.parentSurfaceId);
      if (!parentExists) {
        violations.push({
          code: 'surface.parent_not_found',
          surfaceRef: surface.surfaceId,
          messagePl: 'Powierzchnia wskazuje rodzica, ktory nie istnieje na stosie.',
        });
      }
    }
  }

  return violations;
}
