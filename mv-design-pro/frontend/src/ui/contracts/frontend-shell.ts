import type { CanonicalIssueCode, CanonicalWritePreconditionEvaluation, RepairSurfaceDescriptor } from './shared';
import { CANONICAL_SCREEN_CODES } from '../workspace/screenCanonRegistry';

export const SCREEN_CODES = CANONICAL_SCREEN_CODES;

export const ROUTE_ALIAS_CODES = ['sld', 'network_build', 'analysis', 'report'] as const;
export const HELPER_SURFACE_CODES = [
  'variants_runs',
  'catalog_picker',
  'catalog_admin',
  'case_context',
] as const;

export type ScreenCode = (typeof SCREEN_CODES)[number];
export type RouteAliasCode = (typeof ROUTE_ALIAS_CODES)[number];
export type HelperSurfaceCode = (typeof HELPER_SURFACE_CODES)[number];
export type SurfaceKind = 'editor' | 'object_window' | 'analysis' | 'report' | 'helper';
export type SizeClass = 'full' | 'wide' | 'panel' | 'rail' | 'dialog';
export type EditLockScope = 'entity' | 'subtree' | 'revision';

export interface SurfaceCommitPolicy {
  screenCode: ScreenCode;
  commitScope: 'self_only' | 'parent_scope' | 'transaction_scope';
  saveOwnerSurface: ScreenCode | 'self' | 'parent';
  writesDirectlyToModel: boolean;
  writesToParentDraft: boolean;
}

export interface EditingLease {
  leaseRef: string;
  ownerSurface: ScreenCode;
  entityRef: string;
  lockScope: EditLockScope;
  revisionRef: string;
  mode: 'exclusive_model' | 'runtime_command';
  holderTabRef: string;
  status: 'active' | 'expired' | 'stolen' | 'orphaned';
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string | null;
}

export type DraftStoragePolicy = 'memory_only' | 'session_storage' | 'workspace_storage';
export type DraftConflictResolution = 'manual_merge' | 'parent_wins' | 'child_rebase' | 'discard_child';

export interface SurfaceDraftRecord {
  draftRef: string;
  ownerSurface: ScreenCode;
  entityRef: string;
  parentDraftRef: string | null;
  actorRef: string;
  baseRevision: string;
  storagePolicy: DraftStoragePolicy;
  conflictResolution: DraftConflictResolution;
  payloadRef: string;
  payloadSchemaVersion: string;
  dirtyFieldPaths: string[];
  updatedAt: string;
  expiresAt: string | null;
}

export type SurfaceLifecycleState =
  | 'opening'
  | 'restoring'
  | 'active_clean'
  | 'active_dirty'
  | 'blocked'
  | 'child_active'
  | 'committing'
  | 'revision_conflict'
  | 'failed'
  | 'closing'
  | 'closed';

export type SurfaceLifecycleEvent =
  | 'OPEN'
  | 'RESTORE'
  | 'EDIT'
  | 'SAVE_DRAFT'
  | 'OPEN_CHILD'
  | 'RETURN_CHILD'
  | 'REQUEST_CLOSE'
  | 'COMMIT_START'
  | 'COMMIT_OK'
  | 'COMMIT_FAIL'
  | 'REVISION_CHANGE'
  | 'CONTEXT_CHANGE'
  | 'LOCK_DENIED'
  | 'DISCARD'
  | 'FORCE_CLOSE';

export interface SurfaceBlockState {
  blocked: boolean;
  reason:
    | 'missing_prerequisite'
    | 'parent_dirty'
    | 'revision_conflict'
    | 'lock_conflict'
    | 'stale_results'
    | 'runtime_only'
    | 'export_blocked'
    | 'invalid_route'
    | 'entity_deleted'
    | 'context_changed'
    | 'child_active'
    | 'historical_record'
    | 'migration_incomplete'
    | null;
  issueCode: CanonicalIssueCode | null;
  messagePl: string | null;
  blockingEntityRef: string | null;
  repairSurface: RepairSurfaceDescriptor | null;
}

export interface WorkspaceRouteState {
  activeAlias: RouteAliasCode;
  activeSurfaceSessionId: string | null;
  serializedStateRef: string | null;
  historyPolicy: 'push' | 'replace' | 'compress_helper' | 'no_history';
  lastRestoredAt: string | null;
}

export interface WorkspaceSurfaceSession {
  sessionId: string;
  surfaceId: ScreenCode | HelperSurfaceCode;
  parentSessionId: string | null;
  rootSessionId: string;
  entityRef: string | null;
  revisionBase: string;
  revisionCurrent: string;
  draftRef: string | null;
  lifecycleState: SurfaceLifecycleState;
  blockState: SurfaceBlockState;
  commitPolicy: SurfaceCommitPolicy;
  editLockScope: EditLockScope;
  openedFrom:
    | { kind: 'screen'; screen: ScreenCode }
    | { kind: 'helper'; helper: HelperSurfaceCode }
    | { kind: 'schemat' }
    | { kind: 'inspektor' }
    | { kind: 'raport' };
  allowedOpenTargets: Array<ScreenCode | HelperSurfaceCode>;
  restoreToken: { token: string; expiresAt: string } | null;
  returnAnchor: { targetSessionId: string; targetTabId: string | null } | null;
  scrollState: { x: number; y: number } | null;
  splitterState: Record<string, number> | null;
  filterStateRef: { ref: string; kind: 'table' | 'tree' | 'chart' | 'overlay' } | null;
  dirtyFields: string[];
  analysisCaseContextRef: string | null;
}

export interface WorkspaceEditingSession {
  workspaceSessionId: string;
  browserInstanceRef: string;
  tabRef: string;
  startedAt: string;
  isPrimaryForEntity: boolean;
  activeSurfaceSessionId: string | null;
  leases: EditingLease[];
  drafts: SurfaceDraftRecord[];
  pendingWriteChecks: CanonicalWritePreconditionEvaluation[];
  routeState: WorkspaceRouteState;
}

export interface MiniSldPolicy {
  mode: 'required' | 'optional' | 'forbidden';
  renderer: 'canonical_field_renderer';
  compression: 'viewport_only';
  preserveOrder: true;
  preserveSemantics: true;
  hideTechnicalElements: false;
  allowWithoutResults: boolean;
  allowPartialResults: boolean;
  allowFailedState: boolean;
  allowNotApplicableState: boolean;
  overlayFamily: 'structural' | 'results' | 'protection';
  overlayMode: 'inherit_active_overlay';
}

export interface ScreenMatrixEntry {
  screenCode: ScreenCode;
  titlePl: string;
  surfaceKind: SurfaceKind;
  sizeClass: SizeClass;
  defaultTabId: string | null;
  primaryEntity: string | null;
  parentSurface: ScreenCode | HelperSurfaceCode | null;
  commitPolicy: SurfaceCommitPolicy;
  editLockScope: EditLockScope;
  leaveGuard: 'none' | 'dirty_check' | 'blocking';
  restorePolicy: 'none' | 'session_state' | 'session_state_with_scroll';
  miniSldPolicy: MiniSldPolicy;
  requiresAnalysisCaseContext: boolean;
  prerequisites: CanonicalIssueCode[];
  allowedOpenFrom:
    Array<
      | { kind: 'screen'; screen: ScreenCode }
      | { kind: 'helper'; helper: HelperSurfaceCode }
      | { kind: 'schemat' }
      | { kind: 'inspektor' }
      | { kind: 'raport' }
    >;
  allowedOpenTargets: Array<ScreenCode | HelperSurfaceCode>;
  historyPolicy: 'push' | 'replace' | 'compress_helper' | 'no_history';
  exportPolicyKey: string | null;
}

export interface ScreenTransitionPolicy {
  allowed: boolean;
  openMode: 'replace' | 'push_child' | 'modal_blocking';
  closeReturnsTo: ScreenCode | HelperSurfaceCode | null;
  invalidRouteFallback: 'error_surface' | 'parent_surface' | 'analysis_home';
  forcedIntermediateSteps: Array<ScreenCode | HelperSurfaceCode>;
  preserveParentState: boolean;
  requiresCleanParent: boolean;
  requiresResolvedChildren: boolean;
}
