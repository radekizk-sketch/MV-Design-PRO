import {
  CANONICAL_SCREEN_CODES,
  getScreenDefinition,
  type CanonScreenId,
} from './screenCanonRegistry';

export type WorkspaceScreenCode = CanonScreenId;

export type HelperSurfaceCode =
  | 'variants_runs'
  | 'catalog_picker'
  | 'catalog_admin'
  | 'case_context'
  | 'switchgear_wizard';

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

export const ANALYSIS_SURFACE_SCREEN_CODE = 'E-35';
export const REPORT_SURFACE_SCREEN_CODE = 'E-37';

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
  'switchgear',
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

export const SCREEN_CODES: WorkspaceScreenCode[] = [...CANONICAL_SCREEN_CODES];

export const HELPER_SURFACE_CODES: HelperSurfaceCode[] = [
  'variants_runs',
  'catalog_picker',
  'catalog_admin',
  'case_context',
  'switchgear_wizard',
];

const ROUTE_MANAGED_SCREEN_CODES = new Set<WorkspaceSurfaceCode>([
  'E-06',
  'E-26',
  'E-27',
  ANALYSIS_SURFACE_SCREEN_CODE,
  REPORT_SURFACE_SCREEN_CODE,
  'E-28',
  'E-29',
  'E-30',
  'E-31',
  'E-32',
  'E-33',
  'E-34',
  'E-36',
  'E-38',
  'E-39',
  ...HELPER_SURFACE_CODES,
]);

export const SURFACE_REGISTRY: Record<WorkspaceScreenCode, WorkspaceSurfaceDefinition> =
  CANONICAL_SCREEN_CODES.reduce((registry, screenCode) => {
    const definition = getScreenDefinition(screenCode);
    registry[screenCode] = {
      screenCode,
      titlePl: definition.labelFull,
      componentRef: definition.componentKey,
      sizeClass: definition.sizeClass,
      surfaceKind: definition.surfaceKind,
      subjectKind: definition.subjectKind,
      supportsMiniSld: definition.supportsMiniSld,
      supportsChildren: definition.supportsChildren,
      requiresSession: definition.requiresSession,
    };
    return registry;
  }, {} as Record<WorkspaceScreenCode, WorkspaceSurfaceDefinition>);

export const HELPER_SURFACE_REGISTRY: Record<HelperSurfaceCode, HelperSurfaceDefinition> = {
  variants_runs: {
    helperCode: 'variants_runs',
    titlePl: 'Przebiegi obliczen',
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
    titlePl: 'Parametry analizy',
    componentRef: 'CaseContextHelperSurface',
    allowedCapabilities: ['read_context', 'select_context', 'open_canonical_surface'],
    mayWriteModel: false,
    mayOwnResults: false,
    mayOwnReportState: false,
  },
  switchgear_wizard: {
    helperCode: 'switchgear_wizard',
    titlePl: 'Rozdzielnica: pola i aparaty',
    componentRef: 'SwitchgearWizardHelperSurface',
    allowedCapabilities: ['read_context', 'open_canonical_surface'],
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
  'E-35',
  'E-36',
  'E-37',
  'E-38',
  'E-39',
]);

const TRANSACTIONAL_SCREENS = new Set<WorkspaceScreenCode>([
  'E-07',
  'E-08',
  'E-10',
  'E-11',
  'E-12',
  'E-13',
  'E-14',
  'E-15',
  'E-16',
  'E-17',
  'E-18',
  'E-19',
  'E-20',
  'E-21',
  'E-22',
  'E-23',
  'E-24',
  'E-25',
]);

const BLOCKING_SCREENS = new Set<WorkspaceScreenCode>([
  'E-07',
  'E-08',
  'E-10',
  'E-11',
  'E-12',
  'E-13',
  'E-14',
  'E-15',
  'E-16',
  'E-17',
  'E-18',
  'E-19',
  'E-20',
  'E-21',
  'E-22',
  'E-23',
  'E-24',
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
  'E-36',
  'E-37',
]);

const ANALYSIS_CONTEXT_SCREENS = new Set<WorkspaceScreenCode>([
  'E-06',
  'E-26',
  'E-27',
  ANALYSIS_SURFACE_SCREEN_CODE,
  REPORT_SURFACE_SCREEN_CODE,
  'E-28',
  'E-29',
  'E-30',
  'E-31',
  'E-32',
  'E-33',
  'E-34',
  'E-36',
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
        : screenCode === 'E-12'
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
  'E-06': screen('E-06', 'analysis_run', ['wartosci', 'napiecia', 'prady', 'zwarcia', 'zabezpieczenia'], 'wartosci', ['analysis_case_context'], 'E-01'),
  'E-07': screen('E-07', 'analysis_case', ['lista', 'parametry', 'kompletnosc'], 'lista', [], 'E-01'),
  'E-08': screen('E-08', 'analysis_case', ['wariant', 'przelaczenia', 'n-1', 'punkt-normalnie-otwarty'], 'wariant', [], 'E-07'),
  'E-09': screen('E-09', 'analysis_run', ['migawki', 'uruchomienia', 'historia'], 'migawki', [], 'E-07'),
  'E-10': screen('E-10', 'gpz', ['uproszczony', 'pelny', 'szyny-sn'], 'uproszczony', [], 'E-01'),
  'E-11': screen('E-11', 'sn_bay', ['identyfikacja', 'aparatura', 'przekladniki', 'zabezpieczenia'], 'identyfikacja', ['E-10'], 'E-10'),
  'E-12': screen('E-12', 'segment', ['kabel-sn', 'linia-napowietrzna-sn'], 'kabel-sn', ['E-11'], 'E-11'),
  'E-13': screen('E-13', 'station', ['topologia', 'transformatory', 'rozdzielnia-sn', 'strona-nn'], 'topologia', ['E-12'], 'E-12'),
  'E-14': screen('E-14', 'zksn', ['identyfikacja', 'pole', 'topologia'], 'identyfikacja', ['E-12'], 'E-12'),
  'E-15': screen('E-15', 'branch_pole', ['identyfikacja', 'topologia'], 'identyfikacja', ['E-12'], 'E-12'),
  'E-16': screen('E-16', 'branch', ['rodzina-odgalezienia', 'parametry'], 'rodzina-odgalezienia', ['E-15'], 'E-15'),
  'E-17': screen('E-17', 'nop', ['domkniecie-pierscienia', 'punkt-normalnie-otwarty'], 'punkt-normalnie-otwarty', ['E-16'], 'E-16'),
  'E-18': screen('E-18', 'station', ['transformator', 'parametry-znamionowe', 'zaczepy'], 'transformator', ['E-13'], 'E-13'),
  'E-19': screen('E-19', 'station_lv_side', ['odplywy', 'zrodla', 'pomiar'], 'odplywy', ['E-13'], 'E-13'),
  'E-20': screen('E-20', 'station_lv_side', ['obciazenie', 'profil', 'jakosc-danych'], 'obciazenie', ['E-19'], 'E-19'),
  'E-21': screen('E-21', 'pv_source', ['identyfikacja', 'parametry-elektryczne', 'frt'], 'identyfikacja', [], 'E-01'),
  'E-22': screen('E-22', 'bess_source', ['identyfikacja', 'sterowanie', 'frt'], 'identyfikacja', [], 'E-01'),
  'E-23': screen('E-23', 'fw_source', ['identyfikacja', 'generator', 'frt'], 'identyfikacja', [], 'E-01'),
  'E-24': screen('E-24', null, ['operator', 'zrodlo', 'jakosc-danych'], 'operator', [], 'E-21'),
  'E-25': screen('E-25', null, ['q-u', 'cos-phi-p', 'pochodzenie'], 'q-u', [], 'E-24'),
  'E-26': screen('E-26', 'analysis_run', ['lvrt', 'hvrt', 'frt', 'wynik'], 'frt', ['analysis_case_context'], 'E-35'),
  'E-27': screen('E-27', 'analysis_run', ['zabezpieczenia', 'automatyka', 'spz-szr-sco-fdir'], 'zabezpieczenia', ['analysis_case_context'], 'E-35'),
  'E-28': screen('E-28', 'analysis_run', ['tcc', 'nastawy', 'selektywnosc', 'spz', 'uzasadnienie'], 'tcc', ['analysis_case_context'], 'E-06'),
  'E-29': screen('E-29', 'analysis_run', ['z1-z2-z0', 'siec-zerowa', 'petersen', '3i0-3u0', 'uzasadnienie'], 'z1-z2-z0', ['analysis_case_context'], 'E-06'),
  'E-30': screen('E-30', 'analysis_run', ['nr', 'gs', 'fd', 'zbieznosc', 'oltc'], 'nr', ['analysis_case_context'], 'E-35'),
  'E-31': screen('E-31', 'analysis_run', ['fazy', 'asymetria', 'jakosc'], 'fazy', ['analysis_case_context'], 'E-35'),
  'E-32': screen('E-32', 'analysis_run', ['zrodla', 'wezly', 'galezie', 'pola', 'uzasadnienie'], 'zrodla', ['analysis_case_context'], 'E-06'),
  'E-33': screen('E-33', 'analysis_run', ['tor', 'cieplna', 'dynamiczna', 'najsłabszy-element', 'uzasadnienie'], 'tor', ['analysis_case_context'], 'E-06'),
  'E-34': screen('E-34', 'analysis_run', ['cieplna', 'dynamiczna', 'i2t', 'uzasadnienie'], 'cieplna', ['analysis_case_context'], 'E-35'),
  'E-35': screen('E-35', 'analysis_run', [...ANALYSIS_ROUTE_TAB_IDS], ANALYSIS_ROUTE_DEFAULT_TAB, ['analysis_case_context'], 'E-01'),
  'E-36': screen('E-36', 'proof_pack', ['wejscie', 'procedura', 'wynik', 'ograniczenia'], 'wejscie', ['analysis_case_context'], 'E-35'),
  'E-37': screen('E-37', 'report', ['zakres', 'podglad', 'eksport', 'uzasadnienia'], 'zakres', ['analysis_case_context'], 'E-35'),
  'E-38': screen('E-38', null, ['katalogi', 'wyszukiwarka', 'powiazania'], 'katalogi', [], 'catalog_admin'),
  'E-39': screen('E-39', 'analysis_run', ['migawki', 'uruchomienia', 'audyt'], 'audyt', [], 'E-09'),
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
  'E-01': transition('E-01', ['E-00'], ['E-02', 'E-03', 'E-04', 'E-05', 'E-06', 'E-07', 'E-08', 'E-09', 'E-10', 'E-35', 'E-37', 'E-38', 'case_context', 'variants_runs', 'catalog_admin'], 'E-00', 'E-00'),
  'E-02': transition('E-02', ['E-00', 'E-01'], ['E-03', 'E-10', 'E-11', 'E-12', 'E-13', 'E-14', 'E-15', 'E-16', 'E-17', 'E-18', 'E-19', 'E-20', 'E-21', 'E-22', 'E-23', 'E-24', 'E-25', 'E-38'], 'parent', 'E-01'),
  'E-03': transition('E-03', ['E-01', 'E-02', 'E-05', 'E-06', 'E-35'], ['E-11', 'E-24', 'E-25', 'E-35', 'E-36'], 'parent', 'E-01'),
  'E-04': transition('E-04', ['E-01', 'E-02', 'E-06', 'E-35', 'case_context'], ['E-10', 'E-11', 'E-12', 'E-13', 'E-14', 'E-15', 'E-16', 'E-17', 'E-18', 'E-19', 'E-20', 'E-21', 'E-22', 'E-23', 'E-24', 'E-25', 'E-26', 'E-27', 'E-35'], 'parent', 'E-01'),
  'E-05': transition('E-05', ['E-01', 'E-02', 'E-03', 'E-11'], ['E-10', 'E-11', 'E-12', 'E-13', 'E-14', 'E-15', 'E-16', 'E-17', 'E-18', 'E-19', 'E-20', 'E-21', 'E-22', 'E-23', 'E-24', 'E-25', 'E-27', 'E-28', 'E-36', 'E-37'], 'parent', 'E-01'),
  'E-06': transition('E-06', ['E-01', 'E-35', 'E-37'], ['E-28', 'E-29', 'E-30', 'E-31', 'E-32', 'E-33', 'E-34', 'E-36', 'E-37'], 'parent', 'E-01'),
  'E-07': transition('E-07', ['E-00', 'E-01', 'case_context'], ['E-08', 'E-09', 'E-35', 'E-37'], 'parent', 'E-01'),
  'E-08': transition('E-08', ['E-01', 'E-07', 'variants_runs'], ['E-09', 'E-17', 'E-35', 'E-37'], 'parent', 'E-07'),
  'E-09': transition('E-09', ['E-01', 'E-07', 'E-08', 'E-39', 'variants_runs'], ['E-35', 'E-37', 'E-39'], 'parent', 'E-07'),
  'E-10': transition('E-10', ['E-01', 'E-02', 'E-04'], ['E-11'], 'parent', 'E-01'),
  'E-11': transition('E-11', ['E-03', 'E-05', 'E-10'], ['E-12', 'E-18', 'E-24', 'E-27', 'E-28', 'E-29', 'E-33', 'E-36'], 'parent', 'E-10'),
  'E-12': transition('E-12', ['E-02', 'E-11'], ['E-13', 'E-14', 'E-15', 'E-16', 'E-20'], 'parent', 'E-11'),
  'E-13': transition('E-13', ['E-02', 'E-12'], ['E-18', 'E-19', 'E-20', 'E-24', 'E-25'], 'parent', 'E-12'),
  'E-14': transition('E-14', ['E-02', 'E-12'], ['E-16', 'E-24', 'E-25'], 'parent', 'E-12'),
  'E-15': transition('E-15', ['E-02', 'E-12'], ['E-16', 'E-24', 'E-25'], 'parent', 'E-12'),
  'E-16': transition('E-16', ['E-02', 'E-12', 'E-14', 'E-15'], ['E-17', 'E-20', 'E-24', 'E-25'], 'parent', 'E-15'),
  'E-17': transition('E-17', ['E-01', 'E-08', 'E-16'], ['E-24', 'E-25', 'E-35'], 'parent', 'E-16'),
  'E-18': transition('E-18', ['E-02', 'E-11', 'E-13'], ['E-19', 'E-29', 'E-34', 'E-36'], 'parent', 'E-13'),
  'E-19': transition('E-19', ['E-02', 'E-13', 'E-18'], ['E-20', 'E-21', 'E-22', 'E-23', 'E-24'], 'parent', 'E-13'),
  'E-20': transition('E-20', ['E-02', 'E-12', 'E-16', 'E-19'], ['E-24', 'E-25', 'E-30'], 'parent', 'E-19'),
  'E-21': transition('E-21', ['E-01', 'E-02', 'E-19'], ['E-24', 'E-25', 'E-26', 'E-33', 'E-36'], 'parent', 'E-01'),
  'E-22': transition('E-22', ['E-01', 'E-02', 'E-19'], ['E-24', 'E-25', 'E-26', 'E-33', 'E-36'], 'parent', 'E-01'),
  'E-23': transition('E-23', ['E-01', 'E-02', 'E-19'], ['E-24', 'E-25', 'E-26', 'E-33', 'E-36'], 'parent', 'E-01'),
  'E-24': transition('E-24', ['E-02', 'E-03', 'E-11', 'E-13', 'E-14', 'E-15', 'E-16', 'E-17', 'E-18', 'E-19', 'E-20', 'E-21', 'E-22', 'E-23'], ['E-25', 'E-26', 'E-36'], 'parent', 'E-01'),
  'E-25': transition('E-25', ['E-03', 'E-21', 'E-22', 'E-23', 'E-24'], ['E-26', 'E-36'], 'parent', 'E-24'),
  'E-26': transition('E-26', ['E-21', 'E-22', 'E-23', 'E-24', 'E-25', 'E-35'], ['E-36', 'E-37'], 'parent', 'E-35'),
  'E-27': transition('E-27', ['E-11', 'E-35'], ['E-28', 'E-36', 'E-37'], 'parent', 'E-35'),
  'E-28': transition('E-28', ['E-11', 'E-27', 'E-35'], ['E-36', 'E-37'], 'parent', 'E-35'),
  'E-29': transition('E-29', ['E-11', 'E-18', 'E-35'], ['E-36', 'E-37'], 'parent', 'E-35'),
  'E-30': transition('E-30', ['E-20', 'E-35'], ['E-36', 'E-37'], 'parent', 'E-35'),
  'E-31': transition('E-31', ['E-35', 'case_context'], ['E-36', 'E-37'], 'parent', 'E-35'),
  'E-32': transition('E-32', ['E-21', 'E-22', 'E-23', 'E-35'], ['E-36', 'E-37'], 'parent', 'E-35'),
  'E-33': transition('E-33', ['E-21', 'E-22', 'E-23', 'E-35'], ['E-36', 'E-37'], 'parent', 'E-35'),
  'E-34': transition('E-34', ['E-12', 'E-18', 'E-35'], ['E-36', 'E-37'], 'parent', 'E-35'),
  'E-35': transition('E-35', ['E-01', 'E-06', 'E-07', 'E-08', 'E-09', 'E-37', 'variants_runs', 'case_context'], ['E-06', 'E-26', 'E-27', 'E-28', 'E-29', 'E-30', 'E-31', 'E-32', 'E-33', 'E-34', 'E-36', 'E-37'], 'parent', 'E-01'),
  'E-36': transition('E-36', ['E-26', 'E-27', 'E-28', 'E-29', 'E-30', 'E-31', 'E-32', 'E-33', 'E-34', 'E-35', 'E-37'], ['E-37'], 'parent', 'E-35'),
  'E-37': transition('E-37', ['E-01', 'E-35', 'E-36', 'variants_runs', 'case_context'], ['E-35', 'E-36'], 'parent', 'E-35'),
  'E-38': transition('E-38', ['E-01', 'E-02', 'catalog_admin', 'catalog_picker'], ['catalog_picker', 'E-24', 'E-25', 'E-26'], 'parent', 'E-01'),
  'E-39': transition('E-39', ['E-00', 'E-01', 'E-07', 'E-08', 'E-09', 'E-37'], ['E-09', 'E-35', 'E-36', 'E-37'], 'parent', 'E-01'),
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
  'E-39': 'snapshot',
};

export const ISSUE_MATRIX: Record<string, CanonicalIssuePolicy> = {
  'surface.revision_conflict': {
    severity: 'critical',
    scope: 'surface',
    defaultMessagePl: 'Wykryto konflikt rewizji powierzchni.',
    repairTarget: { screenCode: 'E-39', entityType: 'analysis_run', entityRef: null, tabId: 'audyt', subtabId: null, fieldAnchor: null },
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
      repairTarget: { screenCode: 'E-37', entityType: 'report', entityRef: null, tabId: 'zakres', subtabId: null, fieldAnchor: null },
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
