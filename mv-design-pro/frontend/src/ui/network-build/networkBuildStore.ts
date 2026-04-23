import { create } from 'zustand';

import { useActiveCaseId } from '../app-state';
import { useReadinessLiveStore } from '../engineering-readiness/readinessLiveStore';
import { resolveReadinessVisualState } from '../engineering-readiness/readinessVisualState';
import { isOperationalBus } from '../shared/enmVisibility';
import { deriveOperationalWorkspaceBlockStateFromSnapshot } from '../topology/liveReadiness';
import { getOperationSurfaceByOp } from '../topology/modals/operationSurfaceRegistry';
import { useSnapshotStore } from '../topology/snapshotStore';
import type { ElementType } from '../types';
import type { ReadinessIssue } from '../types';
import {
  canonicalOperationInput,
} from '../../types/domainOps';
import type {
  EnergyNetworkModel,
  LogicalViewsV1,
  ReadinessInfo,
  TerminalRef,
} from '../../types/enm';
import { buildBlockerCountsByElement } from './liveReadiness';
import type {
  EntityTypeCode,
  HelperSurfaceCode,
  SurfaceLifecycleState,
  SurfaceStackInvariantViolation,
  WorkspaceBreadcrumb,
  WorkspaceOpenMode,
  WorkspaceRouteKey,
  WorkspaceScreenCode,
  WorkspaceSurfaceCode,
  WorkspaceSurfaceDescriptor,
  WorkspaceSurfaceSession,
  WorkspaceSurfaceStackLevel,
} from '../workspace/types';
import {
  ANALYSIS_SURFACE_SCREEN_CODE,
  REPORT_SURFACE_SCREEN_CODE,
  createWorkspaceSurfaceSession,
  HELPER_SURFACE_REGISTRY,
  isHelperSurfaceCode,
  ROUTE_MANAGED_ROUTE_KEYS,
  SCREEN_MATRIX,
  SURFACE_REGISTRY,
  validateSurfaceStack,
} from '../workspace/types';
import type {
  ActiveInspectorPanel,
  ActiveObjectCard,
  NetworkBuildOperationName,
} from './internal/legacySurfaceTypes';

export type BuildPhase =
  | 'NO_SOURCE'
  | 'HAS_SOURCE'
  | 'HAS_TRUNKS'
  | 'HAS_STATIONS'
  | 'READY';

export type SurfaceSessionPatch = Partial<WorkspaceSurfaceSession>;
export type RouteSurfaceKind = WorkspaceSurfaceCode;

export interface RouteSurfaceOptions {
  tabId?: string | null;
  entityRef?: string | null;
  entityType?: EntityTypeCode | null;
  subjectKind?: WorkspaceSurfaceDescriptor['subjectKind'];
  subjectRef?: WorkspaceSurfaceDescriptor['subjectRef'];
  titlePl?: string;
  payload?: Record<string, unknown>;
  screenCode?: WorkspaceSurfaceCode;
  sizeClass?: 'B' | 'C';
  stackLevel?: WorkspaceSurfaceStackLevel;
  openMode?: WorkspaceOpenMode;
  supportsMiniSld?: boolean;
  parentSurfaceId?: string | null;
  route?: WorkspaceRouteKey;
}

function createSurfaceId(prefix: string, entityRef?: string | null): string {
  return entityRef ? `${prefix}:${entityRef}` : `${prefix}:active`;
}

function mapElementTypeToEntityTypeCode(
  elementType: ElementType | null | undefined,
): EntityTypeCode | null {
  switch (elementType) {
    case 'Station':
      return 'station';
    case 'BaySN':
      return 'sn_bay';
    case 'BranchPole':
      return 'branch_pole';
    case 'ZKSN':
      return 'zksn';
    case 'Source':
      return 'pv_source';
    default:
      return null;
  }
}

function mapOperationToEntityTypeCode(op: NetworkBuildOperationName): EntityTypeCode | null {
  switch (op) {
    case 'add_grid_source_sn':
      return 'gpz';
    case 'add_sn_bay':
      return 'sn_bay';
    case 'continue_trunk_segment_sn':
      return 'segment';
    case 'insert_station_on_segment_sn':
    case 'add_transformer_sn_nn':
      return 'station';
    case 'insert_branch_pole_on_segment_sn':
      return 'branch_pole';
    case 'insert_zksn_on_segment_sn':
      return 'zksn';
    case 'start_branch_segment_sn':
      return 'branch';
    case 'connect_secondary_ring_sn':
      return 'ring';
    case 'set_normal_open_point':
      return 'nop';
    case 'add_converter_source':
      return 'pv_source';
    default:
      return null;
  }
}

function inferRouteKey(target: WorkspaceSurfaceCode): WorkspaceRouteKey {
  if (isHelperSurfaceCode(target)) {
    switch (target) {
      case 'variants_runs':
        return 'variants';
      case 'catalog_admin':
      case 'catalog_picker':
        return 'catalog';
      case 'case_context':
        return 'conditions';
    }
  }

  switch (target) {
    case ANALYSIS_SURFACE_SCREEN_CODE:
    case 'E-04':
    case 'E-28':
    case 'E-29':
    case 'E-30':
    case 'E-31':
    case 'E-32':
    case 'E-33':
    case 'E-34':
      return 'analysis';
    case REPORT_SURFACE_SCREEN_CODE:
      return 'report';
    default:
      return 'sld';
  }
}

function helperSurfaceDefaults(helperCode: HelperSurfaceCode): {
  sizeClass: 'B' | 'C';
  openMode: WorkspaceOpenMode;
  supportsMiniSld: boolean;
  route: WorkspaceRouteKey;
} {
  switch (helperCode) {
    case 'variants_runs':
      return {
        sizeClass: 'C',
        openMode: 'expand_workspace',
        supportsMiniSld: true,
        route: 'variants',
      };
    case 'catalog_admin':
    case 'catalog_picker':
      return {
        sizeClass: 'B',
        openMode: 'replace_right_panel',
        supportsMiniSld: false,
        route: 'catalog',
      };
    case 'case_context':
      return {
        sizeClass: 'B',
        openMode: 'replace_right_panel',
        supportsMiniSld: false,
        route: 'conditions',
      };
  }
}

function inferLifecycleState(
  session: Partial<WorkspaceSurfaceSession>,
): SurfaceLifecycleState {
  if (session.blockState?.blocked) {
    return 'blocked';
  }
  if (session.hasUnsavedChanges || session.isDirty) {
    return 'dirty';
  }
  return session.lifecycleState ?? 'ready';
}

function buildSurfaceBreadcrumbs(
  titlePl: string,
  parent: WorkspaceSurfaceDescriptor | null,
): WorkspaceBreadcrumb[] {
  if (!parent) {
    return [{ surfaceId: null, labelPl: 'Schemat' }, { surfaceId: null, labelPl: titlePl }];
  }
  return [...parent.breadcrumbs, { surfaceId: parent.surfaceId, labelPl: titlePl }];
}

function buildSurfaceSession(
  overrides: Partial<WorkspaceSurfaceSession> = {},
): WorkspaceSurfaceSession {
  return createWorkspaceSurfaceSession(overrides);
}

function buildOperationSurfaceDescriptor(
  op: NetworkBuildOperationName,
  context?: Record<string, unknown>,
  parentSurface: WorkspaceSurfaceDescriptor | null = null,
): { descriptor: WorkspaceSurfaceDescriptor; session: WorkspaceSurfaceSession } {
  const normalized = canonicalOperationInput(op, context);
  const entry = getOperationSurfaceByOp(normalized.canonicalOp);
  const screenCode = entry?.screenCode ?? 'E-10';
  const screenMatrixEntry = SCREEN_MATRIX[screenCode];
  const elementRef =
    typeof normalized.context?.element_ref === 'string'
      ? normalized.context.element_ref
      : null;
  const parentSurfaceId = parentSurface?.surfaceId ?? null;
  const stackLevel = parentSurface
    ? (Math.min(parentSurface.stackLevel + 1, 3) as WorkspaceSurfaceStackLevel)
    : 1;
  const titlePl = entry?.labelPl ?? normalized.canonicalOp;
  const surfaceId = createSurfaceId(normalized.canonicalOp, elementRef);

  return {
    descriptor: {
      surfaceId,
      screenCode,
      surfaceKind: screenMatrixEntry.surfaceKind,
      sizeClass: entry?.sizeClass ?? screenMatrixEntry.sizeClass,
      stackLevel,
      entityType: mapOperationToEntityTypeCode(normalized.canonicalOp),
      entityRef: elementRef ?? normalized.canonicalOp,
      subjectKind: 'entity',
      subjectRef: elementRef ?? normalized.canonicalOp,
      parentSurfaceId,
      tabId: entry?.defaultTab ?? screenMatrixEntry.defaultTabId,
      titlePl,
      breadcrumbs: buildSurfaceBreadcrumbs(titlePl, parentSurface),
      supportsMiniSld: entry?.supportsMiniSld ?? screenMatrixEntry.supportsMiniSld,
      openMode: entry?.openMode ?? 'replace_right_panel',
      routeState: {
        route: 'sld',
        tabId: entry?.defaultTab ?? screenMatrixEntry.defaultTabId,
        payload: {
          delegate: 'operation_form',
          operation: normalized.canonicalOp,
          context: normalized.context,
        },
      },
    },
    session: buildSurfaceSession({
      surfaceRef: surfaceId,
      screenCode,
      saveMode: entry?.saveMode ?? screenMatrixEntry.saveMode,
      parentSurfaceRef: parentSurfaceId,
      activeEntityRef: elementRef ?? normalized.canonicalOp,
      activeTabId: entry?.defaultTab ?? screenMatrixEntry.defaultTabId,
      leaveGuardPolicy: screenMatrixEntry.leaveGuardPolicy,
      restorePolicy: screenMatrixEntry.restorePolicy,
      draftKey: `${normalized.canonicalOp}:${elementRef ?? 'active'}`,
      lifecycleState: 'editing',
    }),
  };
}

function buildObjectCardSurfaceDescriptor(
  card: Exclude<ActiveObjectCard, null>,
  parentSurface: WorkspaceSurfaceDescriptor | null = null,
): { descriptor: WorkspaceSurfaceDescriptor; session: WorkspaceSurfaceSession } {
  const entityRef = 'elementId' in card ? card.elementId : card.corridorRef;
  const stackLevel = parentSurface
    ? (Math.min(parentSurface.stackLevel + 1, 3) as WorkspaceSurfaceStackLevel)
    : 1;
  const titleMap: Record<Exclude<ActiveObjectCard, null>['kind'], string> = {
    source: 'Zrodlo zasilania GPZ',
    trunk: 'Ciag glowny',
    station: 'Stacja SN/nN',
    line_segment: 'Odcinek SN',
    transformer: 'Transformator',
    switch: 'Lacznik',
    bay: 'Pole SN',
    nn_switchgear: 'Rozdzielnica nN',
    renewable_source: 'Zrodlo OZE',
    branch_pole: 'Slup rozgalezny',
    zksn: 'Zlacze kablowe SN',
  };
  const screenMap: Record<Exclude<ActiveObjectCard, null>['kind'], WorkspaceScreenCode> = {
    source: 'E-10',
    trunk: 'E-03',
    station: 'E-13',
    line_segment: 'E-03',
    transformer: 'E-15',
    switch: 'E-14',
    bay: 'E-14',
    nn_switchgear: 'E-16',
    renewable_source: 'E-17',
    branch_pole: 'E-20',
    zksn: 'E-19',
  };

  const screenCode = screenMap[card.kind];
  const screenMatrixEntry = SCREEN_MATRIX[screenCode];
  const titlePl = titleMap[card.kind];
  const surfaceId = createSurfaceId(`card:${card.kind}`, entityRef);
  const entityType =
    card.kind === 'station'
      ? 'station'
      : card.kind === 'switch'
        ? 'sn_bay'
        : card.kind === 'bay'
          ? 'sn_bay'
          : card.kind === 'zksn'
            ? 'zksn'
            : card.kind === 'branch_pole'
              ? 'branch_pole'
              : card.kind === 'nn_switchgear'
                ? 'station_lv_side'
                : card.kind === 'trunk' || card.kind === 'line_segment'
                  ? 'segment'
                  : 'pv_source';

  return {
    descriptor: {
      surfaceId,
      screenCode,
      surfaceKind: screenMatrixEntry.surfaceKind,
      sizeClass: screenMatrixEntry.sizeClass,
      stackLevel,
      entityType,
      entityRef,
      subjectKind: 'entity',
      subjectRef: entityRef,
      parentSurfaceId: parentSurface?.surfaceId ?? null,
      tabId: screenMatrixEntry.defaultTabId,
      titlePl,
      breadcrumbs: buildSurfaceBreadcrumbs(titlePl, parentSurface),
      supportsMiniSld: screenMatrixEntry.supportsMiniSld,
      openMode: 'replace_right_panel',
      routeState: {
        route: 'sld',
        payload: {
          delegate: 'object_card',
          card,
        },
      },
    },
    session: buildSurfaceSession({
      surfaceRef: surfaceId,
      screenCode,
      parentSurfaceRef: parentSurface?.surfaceId ?? null,
      activeEntityRef: entityRef,
      saveMode: screenMatrixEntry.saveMode,
      leaveGuardPolicy: screenMatrixEntry.leaveGuardPolicy,
      restorePolicy: screenMatrixEntry.restorePolicy,
      draftKey: `card:${card.kind}:${entityRef}`,
    }),
  };
}

function mapInspectorPanelMeta(
  panel: Exclude<ActiveInspectorPanel, null>,
): {
  screenCode: WorkspaceSurfaceCode;
  sizeClass: 'B' | 'C';
  titlePl: string;
  route: WorkspaceRouteKey;
  openMode: WorkspaceOpenMode;
  supportsMiniSld: boolean;
  stackLevel: WorkspaceSurfaceStackLevel;
} {
  switch (panel.kind) {
    case 'field_control':
      return { screenCode: 'E-14', sizeClass: 'B', titlePl: 'Sterowanie polem', route: 'sld', openMode: 'replace_right_panel', supportsMiniSld: true, stackLevel: 2 };
    case 'field_protection':
      return { screenCode: 'E-14', sizeClass: 'B', titlePl: 'Zabezpieczenia pola', route: 'sld', openMode: 'replace_right_panel', supportsMiniSld: true, stackLevel: 2 };
    case 'field_measurements':
      return { screenCode: 'E-14', sizeClass: 'B', titlePl: 'Pomiary pola', route: 'sld', openMode: 'replace_right_panel', supportsMiniSld: true, stackLevel: 2 };
    case 'field_source_contributions':
      return { screenCode: 'E-32', sizeClass: 'B', titlePl: 'Wkłady źródeł', route: 'analysis', openMode: 'replace_right_panel', supportsMiniSld: true, stackLevel: 2 };
    case 'field_earth_fault':
      return { screenCode: 'E-29', sizeClass: 'B', titlePl: 'Sieć zerowa i składowe symetryczne', route: 'analysis', openMode: 'replace_right_panel', supportsMiniSld: true, stackLevel: 2 };
    case 'field_work_safety':
      return { screenCode: 'E-14', sizeClass: 'B', titlePl: 'Bezpieczeństwo do pracy', route: 'sld', openMode: 'replace_right_panel', supportsMiniSld: true, stackLevel: 2 };
    case 'field_compare':
      return { screenCode: ANALYSIS_SURFACE_SCREEN_CODE, sizeClass: 'C', titlePl: 'Porównanie pól', route: 'analysis', openMode: 'expand_workspace', supportsMiniSld: true, stackLevel: 2 };
    case 'report':
      return { screenCode: REPORT_SURFACE_SCREEN_CODE, sizeClass: 'C', titlePl: 'Generator raportu', route: 'report', openMode: 'expand_workspace', supportsMiniSld: true, stackLevel: 1 };
    case 'readiness':
      return { screenCode: 'E-04', sizeClass: 'B', titlePl: 'Gotowość modelu i lista braków', route: 'analysis', openMode: 'replace_right_panel', supportsMiniSld: false, stackLevel: 1 };
    case 'history':
      return { screenCode: 'variants_runs', sizeClass: 'C', titlePl: 'Zakresy obliczeń i wyniki', route: 'variants', openMode: 'expand_workspace', supportsMiniSld: true, stackLevel: 1 };
    case 'topology':
    case 'secondary_links':
      return { screenCode: 'E-29', sizeClass: 'B', titlePl: 'Składowe symetryczne i sieć zerowa', route: 'analysis', openMode: 'replace_right_panel', supportsMiniSld: true, stackLevel: 1 };
    case 'results':
    case 'trace':
      return { screenCode: ANALYSIS_SURFACE_SCREEN_CODE, sizeClass: 'C', titlePl: 'Poziom analityczny', route: 'analysis', openMode: 'expand_workspace', supportsMiniSld: true, stackLevel: 1 };
    case 'coordination':
      return { screenCode: 'E-28', sizeClass: 'C', titlePl: 'Koordynacja zabezpieczeń', route: 'analysis', openMode: 'expand_workspace', supportsMiniSld: true, stackLevel: 1 };
  }
}

function buildInspectorSurfaceDescriptor(
  panel: Exclude<ActiveInspectorPanel, null>,
  parentSurface: WorkspaceSurfaceDescriptor | null = null,
): { descriptor: WorkspaceSurfaceDescriptor; session: WorkspaceSurfaceSession } {
  const meta = mapInspectorPanelMeta(panel);
  const screenCode = meta.screenCode;
  const isHelper = isHelperSurfaceCode(screenCode);
  const screenDefinition = isHelper ? null : SURFACE_REGISTRY[screenCode];
  const screenMatrixEntry = isHelper ? null : SCREEN_MATRIX[screenCode];
  const surfaceKind = isHelper ? 'pomocniczy' : screenDefinition!.surfaceKind;
  const subjectKind = isHelper ? 'helper_context' : screenDefinition!.subjectKind;
  const stackLevel = parentSurface
    ? (Math.min(parentSurface.stackLevel + 1, 3) as WorkspaceSurfaceStackLevel)
    : meta.stackLevel;
  const surfaceId = createSurfaceId(`panel:${panel.kind}`, panel.elementId);

  return {
    descriptor: {
      surfaceId,
      screenCode,
      surfaceKind,
      sizeClass: meta.sizeClass,
      stackLevel,
      entityType: mapElementTypeToEntityTypeCode(panel.elementType),
      entityRef: panel.elementId,
      subjectKind,
      subjectRef: panel.elementId,
      parentSurfaceId: parentSurface?.surfaceId ?? null,
      tabId: panel.kind,
      titlePl: meta.titlePl,
      breadcrumbs: buildSurfaceBreadcrumbs(meta.titlePl, parentSurface),
      supportsMiniSld: meta.supportsMiniSld,
      openMode: meta.openMode,
      routeState: {
        route: meta.route,
        tabId: panel.kind,
        payload: {
          delegate: 'read_only_panel',
          panel,
        },
      },
    },
    session: buildSurfaceSession({
      surfaceRef: surfaceId,
      screenCode,
      parentSurfaceRef: parentSurface?.surfaceId ?? null,
      activeEntityRef: panel.elementId,
      activeTabId: panel.kind,
      saveMode: panel.kind === 'field_control' ? 'auto' : screenMatrixEntry?.saveMode ?? 'read_only',
      leaveGuardPolicy: screenMatrixEntry?.leaveGuardPolicy ?? 'free',
      restorePolicy: screenMatrixEntry?.restorePolicy ?? 'none',
      draftKey: `panel:${panel.kind}:${panel.elementId}`,
      lifecycleState: panel.kind === 'field_control' ? 'editing' : 'ready',
    }),
  };
}

function buildRouteSurfaceDescriptor(
  kind: RouteSurfaceKind,
  options: RouteSurfaceOptions = {},
): { descriptor: WorkspaceSurfaceDescriptor; session: WorkspaceSurfaceSession } {
  const screenCode = options.screenCode ?? kind;
  const isHelper = isHelperSurfaceCode(screenCode);
  const helperDefaults = isHelper ? helperSurfaceDefaults(screenCode) : null;
  const helperDefinition = isHelper ? HELPER_SURFACE_REGISTRY[screenCode] : null;
  const screenDefinition = isHelper ? null : SURFACE_REGISTRY[screenCode];
  const screenMatrixEntry = isHelper ? null : SCREEN_MATRIX[screenCode];
  const titlePl = options.titlePl ?? (isHelper ? helperDefinition!.titlePl : screenDefinition!.titlePl);
  const sizeClass = options.sizeClass ?? helperDefaults?.sizeClass ?? (isHelper ? 'B' : screenDefinition!.sizeClass);
  const openMode =
    options.openMode
    ?? helperDefaults?.openMode
    ?? (sizeClass === 'C' ? 'expand_workspace' : 'replace_right_panel');
  const entityRef = options.entityRef ?? null;
  const subjectKind = options.subjectKind ?? (isHelper ? 'helper_context' : screenDefinition!.subjectKind);
  const subjectRef = options.subjectRef ?? entityRef;
  const route = options.route ?? helperDefaults?.route ?? inferRouteKey(screenCode);
  const resolvedTabId = options.tabId ?? (isHelper ? null : screenMatrixEntry!.defaultTabId);
  const surfaceId = createSurfaceId(kind, entityRef ?? options.subjectRef ?? resolvedTabId);
  const surfaceKind = isHelper ? 'pomocniczy' : screenDefinition!.surfaceKind;

  return {
    descriptor: {
      surfaceId,
      screenCode,
      surfaceKind,
      sizeClass,
      stackLevel: options.stackLevel ?? 1,
      entityType: options.entityType ?? screenMatrixEntry?.entityType ?? null,
      entityRef,
      subjectKind,
      subjectRef,
      parentSurfaceId: options.parentSurfaceId ?? null,
      tabId: resolvedTabId,
      titlePl,
      breadcrumbs: buildSurfaceBreadcrumbs(titlePl, null),
      supportsMiniSld: options.supportsMiniSld ?? helperDefaults?.supportsMiniSld ?? (isHelper ? false : screenDefinition!.supportsMiniSld),
      openMode,
      routeState: {
        route,
        tabId: resolvedTabId,
        payload: options.payload,
      },
    },
    session: buildSurfaceSession({
      surfaceRef: surfaceId,
      screenCode,
      parentSurfaceRef: options.parentSurfaceId ?? null,
      activeEntityRef: entityRef,
      activeTabId: resolvedTabId,
      saveMode: screenMatrixEntry?.saveMode ?? 'read_only',
      leaveGuardPolicy: screenMatrixEntry?.leaveGuardPolicy ?? 'free',
      restorePolicy: screenMatrixEntry?.restorePolicy ?? 'none',
      draftKey: entityRef ? `${kind}:${entityRef}` : kind,
      lifecycleState: inferLifecycleState({
        screenCode,
        saveMode: screenMatrixEntry?.saveMode ?? 'read_only',
      }),
    }),
  };
}

function reduceSurfaceStack(
  stack: WorkspaceSurfaceDescriptor[],
  nextSurface: WorkspaceSurfaceDescriptor | null,
): WorkspaceSurfaceDescriptor[] {
  if (!nextSurface) {
    return [];
  }

  if (nextSurface.stackLevel <= 1) {
    return [nextSurface];
  }

  if (nextSurface.parentSurfaceId) {
    const parentIndex = stack.findIndex((surface) => surface.surfaceId === nextSurface.parentSurfaceId);
    if (parentIndex >= 0) {
      return [...stack.slice(0, parentIndex + 1), nextSurface];
    }
  }

  const preserved = stack.filter((surface) => surface.stackLevel < nextSurface.stackLevel);
  return [...preserved, nextSurface];
}

const ROUTE_MANAGED_ROUTE_KEY_SET = new Set<WorkspaceRouteKey>(ROUTE_MANAGED_ROUTE_KEYS);

function isRouteManagedDescriptor(
  surface: WorkspaceSurfaceDescriptor | null | undefined,
): boolean {
  if (!surface) {
    return false;
  }
  return ROUTE_MANAGED_ROUTE_KEY_SET.has(surface.routeState.route);
}

function hasDelegate(
  surface: WorkspaceSurfaceDescriptor | null | undefined,
  delegate: 'operation_form' | 'object_card' | 'read_only_panel',
): boolean {
  return surface?.routeState.payload?.delegate === delegate;
}

function buildInvariantErrorMessage(
  violations: SurfaceStackInvariantViolation[],
): string {
  return violations[0]?.messagePl ?? 'Naruszono inwariant stosu powierzchni.';
}

function resolveValidatedStack(
  previousStack: WorkspaceSurfaceDescriptor[],
  nextStack: WorkspaceSurfaceDescriptor[],
): {
  stack: WorkspaceSurfaceDescriptor[];
  violations: SurfaceStackInvariantViolation[];
} {
  const violations = validateSurfaceStack(nextStack);
  if (violations.length > 0) {
    return {
      stack: previousStack,
      violations,
    };
  }
  return { stack: nextStack, violations: [] };
}

export interface AvailableBranchPort {
  stationId: string;
  stationName: string;
  bayId: string;
  bayRole: string;
  busRef: string;
}

export interface RingCandidate {
  terminalA: TerminalRef;
  terminalB: TerminalRef;
}

export interface StationSummary {
  id: string;
  name: string;
  stationType: string;
  trunkRef: string | null;
  hasTransformer: boolean;
  hasNnPart: boolean;
  freeBranchPorts: number;
  readinessOk: boolean;
}

export interface TransformerSummary {
  id: string;
  name: string;
  stationRef: string | null;
  stationName: string | null;
  catalogRef: string | null;
  snKva: number;
  ukPercent: number;
}

export interface OzeSourceSummary {
  id: string;
  name: string;
  genType: string;
  stationRef: string | null;
  pMw: number;
  connectionVariant: string | null;
  hasTransformer: boolean;
}

export interface NetworkBuildState {
  activeSurface: WorkspaceSurfaceDescriptor | null;
  surfaceStack: WorkspaceSurfaceDescriptor[];
  surfaceSessions: Record<string, WorkspaceSurfaceSession>;
  collapsedSections: Set<string>;
  openSurface: (surface: WorkspaceSurfaceDescriptor, session?: WorkspaceSurfaceSession) => void;
  closeActiveSurface: () => void;
  collapseSurfaceStackTo: (surfaceId: string | null) => void;
  openRouteSurface: (kind: RouteSurfaceKind, options?: RouteSurfaceOptions) => void;
  clearRouteManagedSurface: () => void;
  patchSurfaceSession: (surfaceId: string, patch: SurfaceSessionPatch) => void;
  openOperationForm: (op: NetworkBuildOperationName, context?: Record<string, unknown>) => void;
  closeOperationForm: () => void;
  openObjectCard: (card: Exclude<ActiveObjectCard, null>) => void;
  closeObjectCard: () => void;
  openInspectorPanel: (
    kind: NonNullable<ActiveInspectorPanel>['kind'],
    elementId: string,
    elementType: ElementType,
  ) => void;
  closeInspectorPanel: () => void;
  toggleSection: (sectionId: string) => void;
  reset: () => void;
}

export const useNetworkBuildStore = create<NetworkBuildState>((set, get) => ({
  activeSurface: null,
  surfaceStack: [],
  surfaceSessions: {},
  collapsedSections: new Set<string>(),

  openSurface: (surface, session) =>
    set((state) => {
      const nextStackCandidate = reduceSurfaceStack(state.surfaceStack, surface);
      const { stack: nextStack, violations } = resolveValidatedStack(state.surfaceStack, nextStackCandidate);
      const blocked = violations.length > 0;
      const nextSessions = {
        ...state.surfaceSessions,
        [surface.surfaceId]:
          blocked
            ? buildSurfaceSession({
                ...(session ?? state.surfaceSessions[surface.surfaceId] ?? buildSurfaceSession()),
                surfaceRef: surface.surfaceId,
                screenCode: surface.screenCode,
                blockState: {
                  blocked: true,
                  reason: 'invalid_route',
                  messagePl: buildInvariantErrorMessage(violations),
                  repairSurface: surface.parentSurfaceId ? state.activeSurface?.screenCode ?? null : null,
                },
                lifecycleState: 'blocked',
              })
            : (session ?? state.surfaceSessions[surface.surfaceId] ?? buildSurfaceSession({
                surfaceRef: surface.surfaceId,
                screenCode: surface.screenCode,
              })),
      };

      if (blocked) {
        return {
          surfaceSessions: nextSessions,
        };
      }

      return {
        activeSurface: surface,
        surfaceStack: nextStack,
        surfaceSessions: nextSessions,
      };
    }),

  closeActiveSurface: () =>
    set((state) => {
      const nextStackCandidate = state.surfaceStack.slice(0, -1);
      const { stack: nextStack } = resolveValidatedStack(state.surfaceStack, nextStackCandidate);
      const nextSurface = nextStack.length > 0 ? nextStack[nextStack.length - 1] : null;
      return {
        activeSurface: nextSurface,
        surfaceStack: nextStack,
      };
    }),

  collapseSurfaceStackTo: (surfaceId) =>
    set((state) => {
      if (surfaceId === null) {
        return {
          activeSurface: null,
          surfaceStack: [],
        };
      }

      const targetIndex = state.surfaceStack.findIndex((surface) => surface.surfaceId === surfaceId);
      if (targetIndex < 0) {
        return {};
      }

      const nextStackCandidate = state.surfaceStack.slice(0, targetIndex + 1);
      const { stack: nextStack } = resolveValidatedStack(state.surfaceStack, nextStackCandidate);
      const nextSurface = nextStack[targetIndex] ?? nextStack[nextStack.length - 1] ?? null;
      return {
        activeSurface: nextSurface,
        surfaceStack: nextStack,
      };
    }),

  openRouteSurface: (kind, options) => {
    const { descriptor, session } = buildRouteSurfaceDescriptor(kind, options);
    get().openSurface(descriptor, session);
  },

  clearRouteManagedSurface: () =>
    set((state) => {
      if (!isRouteManagedDescriptor(state.activeSurface)) {
        return {};
      }

      const nextStackCandidate = state.surfaceStack.filter((surface) => !isRouteManagedDescriptor(surface));
      const { stack: nextStack } = resolveValidatedStack(state.surfaceStack, nextStackCandidate);
      const nextSurface = nextStack.length > 0 ? nextStack[nextStack.length - 1] : null;
      return {
        activeSurface: nextSurface,
        surfaceStack: nextStack,
      };
    }),

  patchSurfaceSession: (surfaceId, patch) =>
    set((state) => ({
      surfaceSessions: {
        ...state.surfaceSessions,
        [surfaceId]: buildSurfaceSession({
          ...(state.surfaceSessions[surfaceId] ?? buildSurfaceSession()),
          ...patch,
          lastInteractionAt: new Date().toISOString(),
          lifecycleState: inferLifecycleState({
            ...(state.surfaceSessions[surfaceId] ?? {}),
            ...patch,
          }),
        }),
      },
    })),

  openOperationForm: (op, context) => {
    const { descriptor, session } = buildOperationSurfaceDescriptor(op, context, get().activeSurface);
    get().openSurface(descriptor, session);
  },

  closeOperationForm: () => {
    if (hasDelegate(get().activeSurface, 'operation_form')) {
      get().closeActiveSurface();
    }
  },

  openObjectCard: (card) => {
    const { descriptor, session } = buildObjectCardSurfaceDescriptor(card, get().activeSurface);
    get().openSurface(descriptor, session);
  },

  closeObjectCard: () => {
    if (hasDelegate(get().activeSurface, 'object_card')) {
      get().closeActiveSurface();
    }
  },

  openInspectorPanel: (kind, elementId, elementType) => {
    const { descriptor, session } = buildInspectorSurfaceDescriptor(
      { kind, elementId, elementType },
      get().activeSurface,
    );
    get().openSurface(descriptor, session);
  },

  closeInspectorPanel: () => {
    if (hasDelegate(get().activeSurface, 'read_only_panel')) {
      get().closeActiveSurface();
    }
  },

  toggleSection: (sectionId) =>
    set((state) => {
      const collapsedSections = new Set(state.collapsedSections);
      if (collapsedSections.has(sectionId)) {
        collapsedSections.delete(sectionId);
      } else {
        collapsedSections.add(sectionId);
      }
      return { collapsedSections };
    }),

  reset: () =>
    set({
      activeSurface: null,
      surfaceStack: [],
      surfaceSessions: {},
      collapsedSections: new Set<string>(),
    }),
}));

export function computeBuildPhase(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
  readiness: ReadinessInfo | null,
): BuildPhase {
  if (!snapshot) return 'NO_SOURCE';
  if (snapshot.sources.length === 0) return 'NO_SOURCE';

  const hasTrunks = (logicalViews?.trunks?.length ?? 0) > 0;
  if (!hasTrunks) return 'HAS_SOURCE';

  const hasStations = (snapshot.substations?.length ?? 0) > 0;
  if (!hasStations) return 'HAS_TRUNKS';

  if (readiness?.ready) return 'READY';

  return 'HAS_STATIONS';
}

export function selectOpenTerminals(logicalViews: LogicalViewsV1 | null): TerminalRef[] {
  if (!logicalViews?.terminals) return [];
  return logicalViews.terminals
    .filter((t) => t.status === 'OTWARTY')
    .sort((a, b) => a.element_id.localeCompare(b.element_id));
}

export function selectRingReservedTerminals(logicalViews: LogicalViewsV1 | null): TerminalRef[] {
  if (!logicalViews?.terminals) return [];
  return logicalViews.terminals
    .filter((t) => t.status === 'ZAREZERWOWANY_DLA_RINGU')
    .sort((a, b) => a.element_id.localeCompare(b.element_id));
}

export function selectAvailableBranchPorts(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
): AvailableBranchPort[] {
  if (!snapshot) return [];

  const usedBusRefs = new Set<string>();
  for (const branch of logicalViews?.branches ?? []) {
    usedBusRefs.add(branch.from_element_id);
  }

  const result: AvailableBranchPort[] = [];
  for (const bay of snapshot.bays ?? []) {
    if (bay.bay_role !== 'OUT' && bay.bay_role !== 'FEEDER' && bay.bay_role !== 'OZE') continue;
    if (usedBusRefs.has(bay.bus_ref)) continue;

    const station = snapshot.substations?.find((s) => s.id === bay.substation_ref);
    if (!station) continue;

    result.push({
      stationId: station.id,
      stationName: station.name,
      bayId: bay.id,
      bayRole: bay.bay_role,
      busRef: bay.bus_ref,
    });
  }

  return result.sort((a, b) => a.stationId.localeCompare(b.stationId));
}

export function selectRingCandidates(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
): RingCandidate[] {
  if (!snapshot || !logicalViews) return [];

  const openTerminals = selectOpenTerminals(logicalViews);
  if (openTerminals.length < 2) return [];

  const busVoltage = new Map<string, number>();
  for (const bus of (snapshot.buses ?? []).filter((entry) => isOperationalBus(entry))) {
    busVoltage.set(bus.ref_id, bus.voltage_kv);
  }

  const candidates: RingCandidate[] = [];
  for (let i = 0; i < openTerminals.length; i += 1) {
    for (let j = i + 1; j < openTerminals.length; j += 1) {
      const a = openTerminals[i];
      const b = openTerminals[j];

      if (a.trunk_id && b.trunk_id && a.trunk_id === b.trunk_id) continue;

      const vA = busVoltage.get(a.element_id);
      const vB = busVoltage.get(b.element_id);
      if (vA !== undefined && vB !== undefined && vA === vB) {
        candidates.push({ terminalA: a, terminalB: b });
      }
    }
  }

  return candidates;
}

export function selectStationSummaries(
  snapshot: EnergyNetworkModel | null,
  blockerCountsByElement: Map<string, number> | null,
): StationSummary[] {
  if (!snapshot) return [];

  return (snapshot.substations ?? [])
    .map((s) => {
      const stationBays = (snapshot.bays ?? []).filter((b) => b.substation_ref === s.id);
      const branchBays = stationBays.filter(
        (b) => b.bay_role === 'OUT' || b.bay_role === 'FEEDER' || b.bay_role === 'OZE',
      );
      const hasTransformer = s.transformer_refs.length > 0;
      const nnBuses = (snapshot.buses ?? []).filter(
        (bus) => isOperationalBus(bus) && bus.voltage_kv < 1 && s.bus_refs.includes(bus.ref_id),
      );

      return {
        id: s.id,
        name: s.name,
        stationType: s.station_type,
        trunkRef: null,
        hasTransformer,
        hasNnPart: nnBuses.length > 0,
        freeBranchPorts: branchBays.length,
        readinessOk: !blockerCountsByElement?.has(s.id),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function selectTransformerSummaries(
  snapshot: EnergyNetworkModel | null,
): TransformerSummary[] {
  if (!snapshot) return [];

  return (snapshot.transformers ?? [])
    .map((t) => {
      const station = (snapshot.substations ?? []).find((s) =>
        s.transformer_refs.includes(t.ref_id),
      );

      return {
        id: t.ref_id,
        name: t.name,
        stationRef: station?.id ?? null,
        stationName: station?.name ?? null,
        catalogRef: t.catalog_ref ?? null,
        snKva: t.sn_mva * 1000,
        ukPercent: t.uk_percent,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function selectOzeSourceSummaries(
  snapshot: EnergyNetworkModel | null,
): OzeSourceSummary[] {
  if (!snapshot) return [];

  return (snapshot.generators ?? [])
    .filter((g) =>
      g.gen_type === 'pv_inverter'
      || g.gen_type === 'wind_inverter'
      || g.gen_type === 'bess',
    )
    .map((g) => ({
      id: g.ref_id,
      name: g.name,
      genType: g.gen_type ?? 'unknown',
      stationRef: g.station_ref ?? null,
      pMw: g.p_mw,
      connectionVariant: g.connection_variant ?? null,
      hasTransformer: g.blocking_transformer_ref != null || g.connection_variant === 'nn_side',
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function selectBlockersByCategory(
  readinessOrIssues: ReadinessInfo | Pick<ReadinessIssue, 'code'>[] | null,
): {
  topologia: number;
  katalogi: number;
  eksploatacja: number;
  analiza: number;
  total: number;
} {
  const result = { topologia: 0, katalogi: 0, eksploatacja: 0, analiza: 0, total: 0 };
  const blockers = Array.isArray(readinessOrIssues)
    ? readinessOrIssues
    : readinessOrIssues?.blockers ?? [];
  if (blockers.length === 0) return result;

  for (const b of blockers) {
    const code = b.code.toLowerCase();
    if (
      code.includes('topology')
      || code.includes('island')
      || code.includes('disconnected')
      || code.includes('voltage_mismatch')
      || code.includes('grounding')
      || code.includes('isolated')
    ) {
      result.topologia += 1;
    } else if (
      code.includes('catalog')
      || code.includes('missing_type')
      || code.includes('no_catalog')
      || code.includes('impedance')
      || code.includes('zero_seq')
      || code.includes('missing_rating')
    ) {
      result.katalogi += 1;
    } else if (
      code.includes('switch_state')
      || code.includes('nop')
      || code.includes('normal_state')
      || code.includes('coupler')
      || code.includes('tap_position')
      || code.includes('operating')
    ) {
      result.eksploatacja += 1;
    } else {
      result.analiza += 1;
    }
    result.total += 1;
  }

  return result;
}

export function buildPhaseLabel(phase: BuildPhase): string {
  switch (phase) {
    case 'NO_SOURCE':
      return 'Brak źródła zasilania';
    case 'HAS_SOURCE':
      return 'GPZ zdefiniowany - dodaj pole SN GPZ i pierwszy odcinek';
    case 'HAS_TRUNKS':
      return 'Magistrala wyprowadzona z pola GPZ - osadź stacje i ZKSN';
    case 'HAS_STATIONS':
      return 'Stacje osadzone - uzupełnij dane';
    case 'READY':
      return 'Gotowy do analizy';
  }
}

export function useNetworkBuildDerived() {
  const activeCaseId = useActiveCaseId();
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const logicalViews = useSnapshotStore((s) => s.logicalViews);
  const fixActions = useSnapshotStore((s) => s.fixActions);
  const readinessIssues = useReadinessLiveStore((s) => s.issues);
  const readinessStatus = useReadinessLiveStore((s) => s.status);
  const readinessReady = useReadinessLiveStore((s) => s.ready);
  const readinessLoading = useReadinessLiveStore((s) => s.loading);
  const blockerCountsByElement = buildBlockerCountsByElement(readinessIssues);

  const sourceCount = snapshot?.sources?.length ?? 0;
  const trunkCount = logicalViews?.trunks?.length ?? 0;
  const branchCount = logicalViews?.branches?.length ?? 0;
  const stationCount = snapshot?.substations?.length ?? 0;
  const transformerCount = snapshot?.transformers?.length ?? 0;
  const generatorCount = snapshot?.generators?.length ?? 0;
  const readinessBlockers = readinessIssues.filter((issue) => issue.severity === 'BLOCKER');
  const workspaceBlockState = deriveOperationalWorkspaceBlockStateFromSnapshot(
    snapshot,
    activeCaseId !== null,
  );
  const readinessVisualState = resolveReadinessVisualState({
    issues: readinessIssues,
    status: readinessStatus,
    ready: readinessReady,
    loading: readinessLoading,
    workspaceBlockState,
  });

  const buildPhase = readinessVisualState === 'ready' && sourceCount > 0
    ? 'READY'
    : computeBuildPhase(snapshot, logicalViews, null);
  const openTerminals = selectOpenTerminals(logicalViews);
  const ringReservedTerminals = selectRingReservedTerminals(logicalViews);
  const availableBranchPorts = selectAvailableBranchPorts(snapshot, logicalViews);
  const ringCandidates = selectRingCandidates(snapshot, logicalViews);
  const stationSummaries = selectStationSummaries(snapshot, blockerCountsByElement);
  const transformerSummaries = selectTransformerSummaries(snapshot);
  const ozeSourceSummaries = selectOzeSourceSummaries(snapshot);
  const blockersByCategory = selectBlockersByCategory(readinessBlockers);
  const isReady = readinessVisualState === 'ready' && sourceCount > 0;
  const readiness = {
    ready: readinessReady,
    blockers: readinessIssues.filter((issue) => issue.severity === 'BLOCKER'),
    warnings: readinessIssues.filter((issue) => issue.severity !== 'BLOCKER'),
  };

  return {
    buildPhase,
    buildPhaseLabel: workspaceBlockState?.title ?? buildPhaseLabel(buildPhase),
    snapshot,
    logicalViews,
    fixActions,
    openTerminals,
    ringReservedTerminals,
    availableBranchPorts,
    ringCandidates,
    stationSummaries,
    transformerSummaries,
    ozeSourceSummaries,
    blockersByCategory,
    sourceCount,
    trunkCount,
    branchCount,
    stationCount,
    transformerCount,
    generatorCount,
    isReady,
    readiness,
    workspaceBlockState,
    readinessLoading,
  };
}

export {
  selectActiveInspectorPanel,
  selectActiveObjectCard,
  selectActiveOperationContext,
  selectActiveOperationForm,
  useActiveInspectorPanel,
  useActiveObjectCard,
  useActiveOperationContext,
  useActiveOperationForm,
} from './internal/legacySurfaceAdapters';
export type {
  ActiveInspectorPanel,
  ActiveObjectCard,
  ActiveOperationForm,
  NetworkBuildOperationName,
} from './internal/legacySurfaceTypes';
