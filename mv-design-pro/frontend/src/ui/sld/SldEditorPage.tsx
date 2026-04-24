/**
 * SLD Editor Page â€” Canonical/CANONICAL Style Main Editor View
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Layout narzÄ™dziowy ZAWSZE renderowany
 * - wizard_screens.md Â§ 2.1: GĹ‚Ăłwna struktura okna
 * - sld_rules.md: SLD â†” selection synchronization
 *
 * CANONICAL RULE:
 * > Layout narzÄ™dziowy ZAWSZE jest renderowany.
 * > Brak danych = komunikat w obszarze roboczym, a NIE brak UI.
 *
 * FEATURES:
 * - Full SLD editor with toolbar, canvas, grid
 * - Empty state overlay when no model (keeps tools visible)
 * - Integrates with CanonicalLayout
 * - Mode-aware (MODEL_EDIT, CASE_CONFIG, RESULT_VIEW)
 * - 100% Polish UI
 *
 * This is the DEFAULT view for the application.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { SLDView } from './SLDView';
import { SldEmptyOverlay, type SldEmptyState } from './SldEmptyOverlay';
import { SldReadinessStack } from './SldReadinessStack';
import { SldWorkDock } from './SldWorkDock';
import { useSldEditorStore } from '../sld-editor/SldEditorStore';
import { useSelectionStore } from '../selection/store';
import {
  useAppStateStore,
  useHasActiveCase,
  useActiveMode,
  useResultStatusLabel,
} from '../app-state';
import { SegmentInspectorPanel } from './SegmentInspectorPanel';
import type { AnySldSymbol } from '../sld-editor/types';
import { useStudyCasesStore } from '../study-cases/store';
import { createProject } from '../projects/api';
import { notify } from '../notifications/store';
import { useReadinessLiveStore } from '../engineering-readiness';
import { OperationalModeToolbar } from './OperationalModeToolbar';
import { LabelModeToolbar } from './LabelModeToolbar';
import type { CreatorTool } from '../topology/editorPalette';
import { useSnapshotStore } from '../topology/snapshotStore';
import type { EnergyNetworkModel } from '../../types/enm';
import type { CanonicalOpName } from '../../types/domainOps';
import { resolveToolAction } from './interactionController';
import { TypePicker } from '../catalog/TypePicker';
import { useCatalogAssignment } from '../catalog/useCatalogAssignment';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import { ProcessPanel } from '../network-build/ProcessPanel';
import { buildCatalogBinding } from '../catalog/catalogBinding';
import { NAMESPACE_TO_PICKER_CATEGORY } from '../catalog/elementCatalogRegistry';
import type { CatalogNamespace, TypeCategory } from '../catalog/types';
import { checkCatalogGate } from '../context-menu/catalogGate';
import { navigateToConditions } from '../navigation/routes';
import {
  readExplicitCatalogNamespace,
  readExplicitCatalogVersion,
} from '../catalog/catalogSnapshot';
import { resolveBusSnRef, resolveStationRef } from '../network-build/forms/enmResolvers';
import { projectEnmSnapshotToSld } from './enmSnapshotToSldSymbols';
import type { FixAction, ReadinessIssue } from '../types';
import type { ElementType } from '../types';
import { executeFixActionSurface } from '../shared/fixActionSurfaceExecutor';
import { useActiveVariant } from '../sld-overlay/variantStore';

/**
 * Demo symbols for development/testing.
 * In production, these come from the network model via SldEditorStore.
 */
const DEMO_SYMBOLS: AnySldSymbol[] = [
  {
    id: 'bus_main',
    elementId: 'bus_main',
    elementType: 'Bus',
    elementName: 'Szyna gĹ‚Ăłwna SN',
    position: { x: 400, y: 200 },
    inService: true,
    width: 100,
    height: 10,
  } as any,
  {
    id: 'bus_dist',
    elementId: 'bus_dist',
    elementType: 'Bus',
    elementName: 'Szyna dystrybucyjna',
    position: { x: 400, y: 350 },
    inService: true,
    width: 80,
    height: 8,
  } as any,
  {
    id: 'source_grid',
    elementId: 'source_grid',
    elementType: 'Source',
    elementName: 'Sie? zasilaj?ca',
    position: { x: 400, y: 40 },
    inService: true,
    connectedToNodeId: 'bus_main',
  } as any,
  {
    id: 'trafo_1',
    elementId: 'trafo_1',
    elementType: 'TransformerBranch',
    elementName: 'TR1 110/15kV',
    position: { x: 400, y: 150 },
    inService: true,
    fromNodeId: 'bus_main',
    toNodeId: 'bus_dist',
    points: [],
  } as any,
  {
    id: 'line_1',
    elementId: 'line_1',
    elementType: 'LineBranch',
    elementName: 'Linia L1',
    position: { x: 300, y: 275 },
    inService: true,
    fromNodeId: 'bus_main',
    toNodeId: 'bus_dist',
    points: [],
  } as any,
  {
    id: 'line_2',
    elementId: 'line_2',
    elementType: 'LineBranch',
    elementName: 'Linia L2',
    position: { x: 500, y: 275 },
    inService: true,
    fromNodeId: 'bus_main',
    toNodeId: 'bus_dist',
    points: [],
  } as any,
  {
    id: 'sw_1',
    elementId: 'sw_1',
    elementType: 'Switch',
    elementName: 'Q1',
    position: { x: 300, y: 230 },
    inService: true,
    fromNodeId: 'bus_main',
    toNodeId: 'line_1',
    switchState: 'CLOSED',
    switchType: 'BREAKER',
  } as any,
  {
    id: 'sw_2',
    elementId: 'sw_2',
    elementType: 'Switch',
    elementName: 'Q2',
    position: { x: 500, y: 230 },
    inService: true,
    fromNodeId: 'bus_main',
    toNodeId: 'line_2',
    switchState: 'OPEN',
    switchType: 'BREAKER',
  } as any,
  {
    id: 'load_1',
    elementId: 'load_1',
    elementType: 'Load',
    elementName: 'Odbior O1',
    position: { x: 250, y: 420 },
    inService: true,
    connectedToNodeId: 'bus_dist',
  } as any,
  {
    id: 'load_2',
    elementId: 'load_2',
    elementType: 'Load',
    elementName: 'Odbior O2',
    position: { x: 400, y: 420 },
    inService: true,
    connectedToNodeId: 'bus_dist',
  } as any,
  {
    id: 'load_3',
    elementId: 'load_3',
    elementType: 'Load',
    elementName: 'Odbior O3',
    position: { x: 550, y: 420 },
    inService: false,
    connectedToNodeId: 'bus_dist',
  } as any,
];

type EnmLookupCollection = keyof Pick<
  EnergyNetworkModel,
  | 'buses'
  | 'branches'
  | 'transformers'
  | 'sources'
  | 'loads'
  | 'generators'
  | 'substations'
  | 'bays'
  | 'junctions'
  | 'corridors'
  | 'measurements'
  | 'protection_assignments'
  | 'branch_points'
>;

type EnmLookupEntry = Record<string, unknown> & {
  ref_id?: string;
  catalog_ref?: string | null;
  voltage_kv?: number | null;
};

const ENM_LOOKUP_COLLECTIONS: readonly EnmLookupCollection[] = [
  'buses',
  'branches',
  'transformers',
  'sources',
  'loads',
  'generators',
  'substations',
  'bays',
  'junctions',
  'corridors',
  'measurements',
  'protection_assignments',
  'branch_points',
];

const DOCK_TOOL_COPY: Record<
  Exclude<CreatorTool, null>,
  { label: string; description: string }
> = {
  select: {
    label: 'Wybierz element',
    description: 'Zaznacz obiekt na schemacie i przejdz do jego inspektora.',
  },
  move: {
    label: 'Przesun geometrie',
    description: 'Koryguj polozenie geometrii i powiazan schematu.',
  },
  edit_properties: {
    label: 'Edytuj parametry',
    description: 'Otworz edycje parametrow dla wskazanego elementu.',
  },
  assign_catalog: {
    label: 'Przypisz typ katalogowy',
    description: 'Powiaz element z katalogiem technicznym bez bocznych adapterow.',
  },
  delete_element: {
    label: 'Usun element',
    description: 'Usun element z modelu wraz z kontrola skutkow topologicznych.',
  },
  add_grid_source_sn: {
    label: 'Dodaj zrodlo zasilania GPZ',
    description: 'Rozpocznij model od GPZ w trybie uproszczonym albo pelnym.',
  },
  continue_trunk_segment_sn: {
    label: 'Wyprowadz ciag glowny',
    description: 'Wskaz port pola SN. Formularz wymusi wybor kabla SN albo linii napowietrznej SN.',
  },
  insert_station_on_segment_sn: {
    label: 'Wstaw stacje w ciag',
    description: 'Dodaj stacje topologiczna SN/nN w wybrany odcinek ciagu glownego.',
  },
  start_branch_segment_sn: {
    label: 'Rozpocznij odgalezienie',
    description: 'Utworz odgalezienie z dopuszczonego portu lub punktu rozgaleznego.',
  },
  connect_secondary_ring_sn: {
    label: 'Domknij pierscien',
    description: 'Polacz dwa porty pomocnicze w pierscien z kontrola typu odcinka.',
  },
  set_normal_open_point: {
    label: 'Ustaw punkt normalnie otwarty',
    description: 'Wybierz lacznik w pierscieniu i ustaw scenariuszowy stan otwarcia.',
  },
  add_converter_source_pv: {
    label: 'Dodaj zrodlo fotowoltaiczne',
    description: 'Dodaj zrodlo po stronie nN z jawna sciezka przylaczeniowa.',
  },
  add_converter_source_bess: {
    label: 'Dodaj magazyn energii',
    description: 'Dodaj magazyn energii po stronie nN z kontrola wariantu pracy.',
  },
};

const DOCK_OBJECT_PALETTE = [
  {
    label: 'GPZ',
    description: 'Punkt startowy sieci SN. Po zrodle zawsze dodaj pole SN przed wyprowadzeniem ciagu.',
  },
  {
    label: 'Stacja koncowa SN/nN',
    description: 'Zamyka ciag bez dalszego wyprowadzenia po stronie SN.',
  },
  {
    label: 'Stacja przelotowa SN/nN',
    description: 'Utrzymuje ciag glowny i przepuszcza go przez stacje.',
  },
  {
    label: 'Stacja odgalezna SN/nN',
    description: 'Tworzy odgalezienie z ciagu glownego lub punktu rozgaleznego.',
  },
  {
    label: 'Stacja sekcyjna SN/nN',
    description: 'Dzieli ciag na sekcje i wspiera scenariusze przelaczeniowe oraz N-1.',
  },
  {
    label: 'Zlacze kablowe SN',
    description: 'Obiekt terenowy do rozcinki i rozgalezien kablowych bez drugiego modelu pola.',
  },
  {
    label: 'Slup rozgalezny',
    description: 'Punkt terenowy dla odgalezien i dalszej kontynuacji sieci napowietrznej.',
  },
  {
    label: 'Zrodlo fotowoltaiczne i magazyn energii',
    description: 'Zrodla po stronie nN, spinane z wariantem pracy, jakoscia danych i wynikami.',
  },
];

interface DockProjectTreeNode {
  id: string;
  label: string;
  subtitle: string;
  type: ElementType;
  group: string;
  searchText: string;
}

interface DockProjectTreeEntry {
  ref_id?: string;
  id?: string;
  name?: string | null;
}

function isCatalogNamespace(value: unknown): value is CatalogNamespace {
  return typeof value === 'string' && value in NAMESPACE_TO_PICKER_CATEGORY;
}

function asEnmLookupEntries(value: unknown): EnmLookupEntry[] {
  return Array.isArray(value) ? (value as unknown as EnmLookupEntry[]) : [];
}

function buildDockProjectTreeNodes(snapshot: EnergyNetworkModel | null): DockProjectTreeNode[] {
  if (!snapshot) {
    return [];
  }

  const nodes: DockProjectTreeNode[] = [];
  const pushNode = (
    group: string,
    entry: DockProjectTreeEntry,
    type: ElementType,
    subtitle: string,
  ) => {
    const id = typeof entry.ref_id === 'string' && entry.ref_id.length > 0
      ? entry.ref_id
      : typeof entry.id === 'string' && entry.id.length > 0
        ? entry.id
        : null;
    if (!id) {
      return;
    }

    const label = typeof entry.name === 'string' && entry.name.trim()
      ? entry.name.trim()
      : id;

    nodes.push({
      id,
      label,
      subtitle,
      type,
      group,
      searchText: `${label} ${id} ${subtitle}`.toLowerCase(),
    });
  };

  snapshot.sources?.forEach((source) => pushNode('GPZ i zrodla', source, 'Source', 'Zrodlo zasilania GPZ'));
  snapshot.buses?.forEach((bus) => pushNode('Szyny', bus, 'Bus', 'Szyna SN'));
  snapshot.branches?.forEach((branch) => pushNode('Odcinki SN', branch, 'LineBranch', String(branch.type ?? 'Odcinek SN')));
  snapshot.substations?.forEach((station) => pushNode('Stacje', station, 'Station', String(station.station_type ?? 'Stacja SN/nN')));
  snapshot.transformers?.forEach((transformer) => pushNode('Transformatory', transformer, 'TransformerBranch', 'Transformator SN/nN'));
  snapshot.branch_points?.forEach((branchPoint) => {
    const branchPointType = String(branchPoint.branch_point_type ?? 'Punkt rozgalezny');
    pushNode(
      'Punkty rozgalezne',
      branchPoint,
      branchPointType === 'ZKSN' ? 'ZKSN' : 'BranchPole',
      branchPointType,
    );
  });

  return nodes.sort((left, right) => {
    const groupCompare = left.group.localeCompare(right.group, 'pl');
    if (groupCompare !== 0) {
      return groupCompare;
    }
    return left.label.localeCompare(right.label, 'pl');
  });
}

void DEMO_SYMBOLS;

/**
 * Props for SldEditorPage.
 */
export interface SldEditorPageProps {
  /** Use demo data (for development) */
  useDemo?: boolean;

  /** Force show empty overlay */
  forceEmptyState?: SldEmptyState;

  /** Open canonical case helper callback */
  onOpenCaseHelper?: () => void;
}

/**
 * SLD Editor Page component.
 * This is the main editing view for the network model.
 *
 * ALWAYS shows:
 * - Toolbar with tools
 * - Canvas with grid
 * - Zoom/pan controls
 *
 * Shows empty overlay when:
 * - No active case selected
 * - No model data loaded
 */
export const SldEditorPage: React.FC<SldEditorPageProps> = ({
  useDemo = false,
  forceEmptyState,
  onOpenCaseHelper,
}) => {
  void useDemo;
  // Get symbols from store
  const storeSymbols = useSldEditorStore((state) => Array.from(state.symbols.values()));
  const setSldSymbols = useSldEditorStore((state) => state.setSymbols);
  // App state
  const hasActiveCase = useHasActiveCase();
  const activeMode = useActiveMode();
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const activeProjectName = useAppStateStore((state) => state.activeProjectName);
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const activeSnapshotId = useAppStateStore((state) => state.activeSnapshotId);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const setActiveProject = useAppStateStore((state) => state.setActiveProject);
  const setActiveCase = useAppStateStore((state) => state.setActiveCase);
  const createCase = useStudyCasesStore((state) => state.createCase);
  const resultStatusLabel = useResultStatusLabel();
  const activeVariant = useActiveVariant();

  // Selection state
  const selectedElement = useSelectionStore((state) => state.selectedElements[0] ?? null);

  // Selection store actions for navigation
  const selectElement = useSelectionStore((state) => state.selectElement);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const centerSldOnElement = useSelectionStore((state) => state.centerSldOnElement);

  // Readiness live store â€” real data from API
  const readinessIssues = useReadinessLiveStore((state) => state.issues);
  const readinessStatus = useReadinessLiveStore((state) => state.status);
  const readinessLoading = useReadinessLiveStore((state) => state.loading);
  const readinessCollapsedGroups = useReadinessLiveStore((state) => state.collapsedGroups);
  const readinessToggleGroup = useReadinessLiveStore((state) => state.toggleGroup);
  const readinessRefresh = useReadinessLiveStore((state) => state.refresh);

  // Study cases â€” for hasCases wiring
  const studyCasesCount = useStudyCasesStore((state) => state.cases.length);

  const [isCreatingFirstCase, setIsCreatingFirstCase] = useState(false);
  const [activeTool, setActiveTool] = useState<CreatorTool>('select');
  const [interactionMessage, setInteractionMessage] = useState<string | null>(null);
  const [hoveredElementName, setHoveredElementName] = useState<string | null>(null);
  const [pendingRingTerminal, setPendingRingTerminal] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<{
    segment_ref: string;
    edge_id: string;
    from_ref: string;
    to_ref: string;
    segment_kind: 'TRUNK' | 'BRANCH' | 'RING' | 'SECONDARY';
  } | null>(null);
  const [hoveredSegmentRef, setHoveredSegmentRef] = useState<string | null>(null);
  const [interactionPreview, setInteractionPreview] = useState<{
    target_kind: 'canvas' | 'element' | 'segment' | 'port';
    target_id: string;
    valid: boolean;
    message_pl: string;
    port_role?: 'TRUNK_IN' | 'TRUNK_OUT' | 'BRANCH_OUT' | 'RING' | 'NN_SOURCE';
  } | null>(null);
  const executeEnmOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const resetEnmStore = useSnapshotStore((state) => state.reset);
  const enmSnapshot = useSnapshotStore((state) => state.snapshot);
  const logicalViews = useSnapshotStore((state) => state.logicalViews);
  const enmReadiness = useSnapshotStore((state) => state.readiness);
  const enmFixActions = useSnapshotStore((state) => state.fixActions);
  const enmMaterializedParams = useSnapshotStore((state) => state.materializedParams);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const [segmentLengthKmDraft, setSegmentLengthKmDraft] = useState<string>('');
  const [segmentStatusDraft, setSegmentStatusDraft] = useState<string>('closed');
  const [projectTreeQuery, setProjectTreeQuery] = useState('');
  const [catalogAssignmentState, catalogAssignmentActions] = useCatalogAssignment();
  const [toolCatalogPickerState, setToolCatalogPickerState] = useState<{
    isOpen: boolean;
    category: TypeCategory | null;
    namespace: CatalogNamespace | null;
    pendingOp: {
      canonicalOp: CanonicalOpName;
      payload: Record<string, unknown>;
      targetName: string;
    } | null;
  }>({ isOpen: false, category: null, namespace: null, pendingOp: null });
  const [segmentCatalogDraft, setSegmentCatalogDraft] = useState<string>('');

  const findEnmElementByRef = useCallback((refId: string): EnmLookupEntry | null => {
    if (!enmSnapshot) {
      return null;
    }

    for (const collection of ENM_LOOKUP_COLLECTIONS) {
      const entries = asEnmLookupEntries(enmSnapshot[collection]);
      const found = entries.find((entry) => entry.ref_id === refId);
      if (found) {
        return found;
      }
    }

    return null;
  }, [enmSnapshot]);

  const selectedSegmentBranch = useMemo<Record<string, unknown> | null>(() => {
    if (!selectedSegment || !enmSnapshot) return null;
    const branches = asEnmLookupEntries(enmSnapshot.branches);
    return branches.find((branch) => branch.ref_id === selectedSegment.segment_ref) ?? null;
  }, [selectedSegment, enmSnapshot]);

  const selectedSegmentBusVoltageKv = useMemo<number | null>(() => {
    if (!selectedSegment || !enmSnapshot) return null;
    const buses = asEnmLookupEntries(enmSnapshot.buses);
    const fromBus = buses.find((bus) => bus.ref_id === selectedSegment.from_ref);
    const voltage = fromBus?.voltage_kv;
    return typeof voltage === 'number' ? voltage : null;
  }, [selectedSegment, enmSnapshot]);

  const selectedSegmentFixActions = useMemo(
    () => enmFixActions.filter((action) => action.element_ref === selectedSegment?.segment_ref),
    [enmFixActions, selectedSegment],
  );

  const selectedSegmentCatalogInfo = useMemo(() => {
    if (!selectedSegmentBranch) {
      return null;
    }

    const catalogRef = selectedSegmentBranch.catalog_ref;
    if (typeof catalogRef !== 'string' || !catalogRef.trim()) {
      return null;
    }

    const refId = selectedSegmentBranch.ref_id;
    const materializedEntry = (
      typeof refId === 'string' && enmMaterializedParams
        ? enmMaterializedParams.lines_sn?.[refId] ?? null
        : null
    );

    return {
      namespace: readExplicitCatalogNamespace(selectedSegmentBranch),
      catalogRef,
      version: readExplicitCatalogVersion(selectedSegmentBranch) ?? 'BRAK',
      isMaterialized: materializedEntry !== null,
    };
  }, [selectedSegmentBranch, enmMaterializedParams]);

  const selectedSegmentParameterSourceInfo = useMemo(() => {
    if (!selectedSegmentBranch) {
      return null;
    }

    const snapshotMaterialized =
      selectedSegmentBranch.materialized_params && typeof selectedSegmentBranch.materialized_params === 'object';
    const manualOverrides =
      selectedSegmentBranch.manual_overrides && typeof selectedSegmentBranch.manual_overrides === 'object'
        ? Object.keys(selectedSegmentBranch.manual_overrides as Record<string, unknown>).length
        : 0;
    const sourceMode =
      typeof selectedSegmentBranch.source_mode === 'string'
        ? selectedSegmentBranch.source_mode
        : selectedSegmentCatalogInfo
        ? 'KATALOG'
        : 'BRAK';

    return {
      sourceMode,
      manualOverrideCount: manualOverrides,
      hasMaterializedParams: Boolean(selectedSegmentCatalogInfo?.isMaterialized || snapshotMaterialized),
    };
  }, [selectedSegmentBranch, selectedSegmentCatalogInfo]);

  useEffect(() => {
    const length = selectedSegmentBranch?.length_km;
    const status = selectedSegmentBranch?.status;
    const catalogRef = selectedSegmentBranch?.catalog_ref;
    setSegmentLengthKmDraft(typeof length === 'number' ? String(length) : '');
    setSegmentStatusDraft(typeof status === 'string' ? status : 'closed');
    setSegmentCatalogDraft(typeof catalogRef === 'string' ? catalogRef : '');
  }, [selectedSegmentBranch]);

  const enmProjection = useMemo(
    () => projectEnmSnapshotToSld((enmSnapshot ?? null) as Record<string, unknown> | null),
    [enmSnapshot],
  );

  const openCatalogPickerForSelectedSegment = useCallback(() => {
    if (!selectedSegment || !selectedSegmentBranch) {
      notify('Brak segmentu do przypisania katalogu.', 'warning');
      return;
    }

    catalogAssignmentActions.openPicker({
      elementRef: selectedSegment.segment_ref,
      enmElementType: String(selectedSegmentBranch.type ?? 'cable'),
      currentCatalogRef:
        typeof selectedSegmentBranch.catalog_ref === 'string' ? selectedSegmentBranch.catalog_ref : null,
    });
  }, [catalogAssignmentActions, selectedSegment, selectedSegmentBranch]);

  const openToolCatalogPicker = useCallback((
    canonicalOp: CanonicalOpName,
    payload: Record<string, unknown>,
    targetName: string,
  ): boolean => {
    const gate = checkCatalogGate(canonicalOp);
    if (!gate.required || !gate.namespace) {
      return false;
    }

    if (!isCatalogNamespace(gate.namespace)) {
      notify(`Operacja ${canonicalOp} nie wskazuje jawnie poprawnej kategorii katalogu.`, 'error');
      return true;
    }

    const category = NAMESPACE_TO_PICKER_CATEGORY[gate.namespace] ?? null;
    if (!category) {
      notify(`Brak kategorii pickera dla katalogu ${gate.label ?? gate.namespace}.`, 'error');
      return true;
    }

    setToolCatalogPickerState({
      isOpen: true,
      category,
      namespace: gate.namespace,
      pendingOp: {
        canonicalOp,
        payload,
        targetName,
      },
    });
    return true;
  }, []);

  const closeToolCatalogPicker = useCallback(() => {
    setToolCatalogPickerState({ isOpen: false, category: null, namespace: null, pendingOp: null });
  }, []);

  const handleToolCatalogTypeSelected = useCallback((typeId: string, typeName: string) => {
    const pending = toolCatalogPickerState.pendingOp;
    const namespace = toolCatalogPickerState.namespace;
    if (!pending || !namespace) {
      return;
    }

    openOperationForm(pending.canonicalOp, {
      ...pending.payload,
      catalog_binding: buildCatalogBinding(namespace, typeId),
      catalog_name: typeName,
      source_mode: 'KATALOG',
    });
    setToolCatalogPickerState({ isOpen: false, category: null, namespace: null, pendingOp: null });
    const msg = `Wybrano typ ${typeName} i otwarto formularz ${pending.canonicalOp} dla ${pending.targetName}.`;
    setInteractionMessage(msg);
    notify(msg, 'success');
    setActiveTool('select');
  }, [openOperationForm, toolCatalogPickerState]);

  const withTimeout = useCallback(async <T,>(promise: Promise<T>, timeoutMs = 15000): Promise<T> => {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        window.setTimeout(() => reject(new Error('TIMEOUT_API_CREATE_CASE')), timeoutMs);
      }),
    ]);
  }, []);

  // Determine symbols to display from canonical store only
  const symbols = useMemo(() => storeSymbols, [storeSymbols]);
  const hasSource = useMemo(
    () => symbols.some((symbol) => symbol.elementType === 'Source'),
    [symbols],
  );
  const hasCanonicalTrunkStart = useMemo(
    () => (logicalViews?.terminals ?? []).some((terminal) => terminal.status === 'OTWARTY'),
    [logicalViews],
  );
  const hasRing = useMemo(
    () =>
      symbols.some((symbol) => {
        const normalizedName = (symbol.elementName ?? '').toLowerCase();
        return normalizedName.includes('ring') || normalizedName.includes('nop');
      }),
    [symbols],
  );
  const modelSummary = useMemo(
    () => ({
      buses: enmSnapshot?.buses?.length ?? 0,
      branches: enmSnapshot?.branches?.length ?? 0,
      transformers: enmSnapshot?.transformers?.length ?? 0,
      stations: enmSnapshot?.substations?.length ?? 0,
      openTerminals: (logicalViews?.terminals ?? []).filter((terminal) => terminal.status === 'OTWARTY').length,
    }),
    [enmSnapshot, logicalViews],
  );
  const projectTreeNodes = useMemo(
    () => buildDockProjectTreeNodes(enmSnapshot ?? null),
    [enmSnapshot],
  );
  const filteredProjectTreeNodes = useMemo(() => {
    const normalizedQuery = projectTreeQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return projectTreeNodes;
    }
    return projectTreeNodes.filter((node) => node.searchText.includes(normalizedQuery));
  }, [projectTreeNodes, projectTreeQuery]);
  const projectTreeContent = useMemo(() => {
    const groupedNodes = filteredProjectTreeNodes.reduce<Record<string, DockProjectTreeNode[]>>((acc, node) => {
      acc[node.group] ??= [];
      acc[node.group].push(node);
      return acc;
    }, {});

    return (
      <div className="space-y-3">
        <input
          data-testid="project-tree-search-input"
          type="search"
          value={projectTreeQuery}
          onChange={(event) => setProjectTreeQuery(event.target.value)}
          placeholder="Filtruj elementy..."
          className="w-full rounded-[12px] border border-[#294153] bg-[#091721] px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-[#5f778b] focus:border-cyan-400/35 focus:ring-2 focus:ring-cyan-500/10"
        />
        <div
          data-testid="project-tree"
          data-empty={filteredProjectTreeNodes.length === 0}
          className="max-h-[320px] space-y-3 overflow-y-auto rounded-[14px] border border-[#22384a] bg-[#08141d] p-2"
        >
          {filteredProjectTreeNodes.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-[#294153] bg-[#091721] px-3 py-4 text-xs text-[#8ea6ba]">
              Brak elementow pasujacych do filtra.
            </div>
          ) : (
            Object.entries(groupedNodes).map(([group, nodes]) => (
              <div key={group} className="space-y-1">
                <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6f8ca4]">
                  {group}
                </div>
                {nodes.map((node) => {
                  const isActive = selectedElement?.id === node.id;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => {
                        setSelectedSegment(null);
                        selectElement({ id: node.id, type: node.type, name: node.label });
                        centerSldOnElement(node.id);
                        setInteractionMessage(`Wybrano element z drzewa modelu: ${node.label}.`);
                      }}
                      className={`flex w-full items-start justify-between gap-3 rounded-[12px] border px-3 py-2 text-left transition ${
                        isActive
                          ? 'border-cyan-400/35 bg-cyan-500/14 text-cyan-50'
                          : 'border-[#274154] bg-[#0d1c29] text-slate-100 hover:bg-[#112433]'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{node.label}</span>
                        <span className="block truncate text-[11px] text-[#8ea6ba]">{node.subtitle}</span>
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-[#6f8ca4]">
                        {node.type}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }, [
    centerSldOnElement,
    filteredProjectTreeNodes,
    projectTreeQuery,
    selectElement,
    selectedElement?.id,
  ]);
  const primarySourceRef = useMemo(() => {
    const firstSource = enmSnapshot?.sources?.[0];
    return firstSource?.ref_id ?? firstSource?.id ?? null;
  }, [enmSnapshot]);
  const primaryStationRef = useMemo(
    () => resolveStationRef(primarySourceRef ? { element_ref: primarySourceRef } : undefined, enmSnapshot),
    [enmSnapshot, primarySourceRef],
  );
  const primarySnBusRef = useMemo(
    () => resolveBusSnRef(primarySourceRef ? { element_ref: primarySourceRef } : undefined, enmSnapshot),
    [enmSnapshot, primarySourceRef],
  );

  const handleActivateGpzPlacement = useCallback(() => {
    setActiveTool('add_grid_source_sn');
    setInteractionMessage('Kliknij na schemacie, aby wstawic zrodlo zasilania GPZ.');
    notify('Wlaczono dodawanie GPZ. Wskaz miejsce na schemacie.', 'info');
  }, []);

  const handleOpenSnBayFlow = useCallback(() => {
    if (!primaryStationRef || !primarySnBusRef) {
      const msg =
        'Nie udalo sie ustalic szyny SN dla pola. Wybierz szynie GPZ albo uzyj menu kontekstowego na obiekcie.';
      setInteractionMessage(msg);
      notify(msg, 'warning');
      return;
    }

    openOperationForm('add_sn_bay', {
      station_ref: primaryStationRef,
      bus_ref: primarySnBusRef,
      bay_role: 'OUT',
      apparatus_kind: 'BREAKER',
      source: 'work_dock',
    });
    setInteractionMessage('Otwarto formularz pola SN dla glownej szyny GPZ.');
    notify('Otwarto formularz pola SN.', 'info');
  }, [openOperationForm, primarySnBusRef, primaryStationRef]);

  const handleActivateTrunkFlow = useCallback(() => {
    setActiveTool('continue_trunk_segment_sn');
    const msg =
      'Wskaz port pola SN. Formularz wymusi wybor kabla SN albo linii napowietrznej SN.';
    setInteractionMessage(msg);
    notify(msg, 'info');
  }, []);

  const openCaseContextSurface = useCallback(() => {
    if (onOpenCaseHelper) {
      onOpenCaseHelper();
      return;
    }
    navigateToConditions();
  }, [onOpenCaseHelper]);

  const openExecutionSurface = useCallback(() => {
    openCaseContextSurface();
    notify('Otwarto warunki obliczen — wybierz zakres i wykonaj obliczenia.', 'info');
  }, [openCaseContextSurface]);

  const dockContextItems = useMemo(
    () => [
      {
        label: 'Projekt',
        value: activeProjectName ?? activeProjectId ?? 'Nie wybrano',
      },
      {
        label: 'Zakres obliczen',
        value: activeCaseName ?? activeCaseId ?? 'Nie wybrano',
        tone: hasActiveCase ? ('default' as const) : ('warn' as const),
      },
      {
        label: 'Wariant pracy',
        value: activeVariant?.name ?? 'Brak',
      },
      {
        label: 'Wersja modelu',
        value: activeSnapshotId ?? 'Brak',
      },
      {
        label: 'Wyniki',
        value: activeRunId ?? 'Brak',
      },
      {
        label: 'Wyniki',
        value: resultStatusLabel,
        tone:
          resultStatusLabel === 'Wyniki aktualne'
            ? ('ok' as const)
            : resultStatusLabel === 'Brak wynik?w'
              ? ('warn' as const)
              : ('danger' as const),
      },
    ],
    [
      activeCaseId,
      activeCaseName,
      activeProjectId,
      activeProjectName,
      activeRunId,
      activeSnapshotId,
      activeVariant?.name,
      hasActiveCase,
      resultStatusLabel,
    ],
  );

  const dockInteractionHint = useMemo(() => {
    if (hoveredSegmentRef) {
      return `Segment pod kursorem: ${hoveredSegmentRef}`;
    }
    if (hoveredElementName && activeTool && activeTool !== 'select' && activeTool !== 'move') {
      return `Podglad operacji ${DOCK_TOOL_COPY[activeTool].label.toLowerCase()} dla: ${hoveredElementName}`;
    }
    if (activeTool && activeTool !== 'select' && activeTool !== 'move') {
      return `Aktywne narzedzie: ${DOCK_TOOL_COPY[activeTool].label}. Wskaz poprawny element, segment albo port.`;
    }
    return null;
  }, [activeTool, hoveredElementName, hoveredSegmentRef]);

  const dockActionGroups = useMemo(() => {
    const toolDisabledReason = (toolId: Exclude<CreatorTool, null>): string | null => {
      if (!activeCaseId) {
        return 'Najpierw wybierz aktywny zakres obliczen.';
      }
      if (toolId !== 'add_grid_source_sn' && !hasSource) {
        return 'Najpierw dodaj zrodlo zasilania GPZ.';
      }
      if (toolId === 'continue_trunk_segment_sn' && !hasCanonicalTrunkStart) {
        return 'Najpierw dodaj pole SN do GPZ.';
      }
      if (toolId === 'set_normal_open_point' && !hasRing) {
        return 'Punkt normalnie otwarty jest dostepny dopiero dla pierscienia.';
      }
      if (toolId === 'connect_secondary_ring_sn' && !hasRing) {
        return 'Domkniecie pierscienia wymaga dwoch zgodnych portow ringu.';
      }
      if (toolId === 'add_grid_source_sn' && hasSource) {
        return 'Model ma juz aktywne zrodlo zasilania GPZ.';
      }
      return null;
    };

    const groups = [
      {
        title: 'Operacje modelu',
        toolIds: ['select', 'move', 'edit_properties', 'assign_catalog', 'delete_element'] as const,
      },
      {
        title: 'Budowa sieci SN i nN',
        toolIds: [
          'add_grid_source_sn',
          'continue_trunk_segment_sn',
          'insert_station_on_segment_sn',
          'start_branch_segment_sn',
          'connect_secondary_ring_sn',
          'set_normal_open_point',
          'add_converter_source_pv',
          'add_converter_source_bess',
        ] as const,
      },
    ];

    return groups.map((group) => ({
      title: group.title,
      actions: group.toolIds.map((toolId) => {
        const disabledReason = toolDisabledReason(toolId);
        return {
          id: toolId,
          label: DOCK_TOOL_COPY[toolId].label,
          description: DOCK_TOOL_COPY[toolId].description,
          enabled: disabledReason === null,
          active: activeTool === toolId,
          disabledReason,
          onSelect: () => {
            if (disabledReason !== null) {
              return;
            }
            setActiveTool(activeTool === toolId ? null : toolId);
            setInteractionMessage(
              activeTool === toolId
                ? `Wylaczono narzedzie: ${DOCK_TOOL_COPY[toolId].label}.`
                : `Aktywne narzedzie: ${DOCK_TOOL_COPY[toolId].label}. ${DOCK_TOOL_COPY[toolId].description}`,
            );
          },
        };
      }),
    }));
  }, [
    activeCaseId,
    activeTool,
    hasCanonicalTrunkStart,
    hasRing,
    hasSource,
  ]);

  const dockNextStep = useMemo(() => {
    if (!hasActiveCase) {
      return {
        title: 'Aktywuj zakres obliczen',
        description:
          'Budowa modelu, wyniki i raporty sa zwiazane z jednym aktywnym zakresem obliczen.',
        actionLabel: 'Otworz warunki obliczen',
        onAction: openCaseContextSurface,
      };
    }

    if (!hasSource) {
      return {
        title: 'Dodaj zrodlo zasilania GPZ',
        description:
          'Model sieci zaczyna sie od GPZ. Po dodaniu zrodla system otworzy dalsze kroki budowy.',
        actionLabel: 'Wstaw GPZ na schemat',
        onAction: handleActivateGpzPlacement,
      };
    }

    if (!hasCanonicalTrunkStart) {
      const missingContext = !primaryStationRef || !primarySnBusRef;
      return {
        title: 'Dodaj pole SN do szyny GPZ',
        description:
          'Ciag glowny mozna wyprowadzic dopiero z pola SN. Pole musi byc przypiete do szyny SN w GPZ.',
        actionLabel: 'Otworz formularz pola SN',
        onAction: handleOpenSnBayFlow,
        disabled: missingContext,
        disabledReason: missingContext
          ? 'Brak jednoznacznej szyny SN lub stacji GPZ dla nowego pola.'
          : null,
      };
    }

    if (enmReadiness?.ready && modelSummary.branches > 0) {
      return {
        title: 'Wykonaj analize dla aktywnego zakresu',
        description:
          'Model ma juz wymagany kontekst i gotowosc obliczeniowa. Przejdz do zakresow obliczen i wynikow.',
        actionLabel: 'Otworz zakresy obliczen i wyniki',
        onAction: openExecutionSurface,
      };
    }

    return {
      title: 'Wyprowadz ciag glowny z pola SN',
      description:
        'Wskaz port pola SN, aby kontynuowac budowe. Formularz wymusi wybor kabla SN albo linii napowietrznej SN.',
      actionLabel: 'Wlacz wyprowadzenie ciagu',
      onAction: handleActivateTrunkFlow,
    };
  }, [
    enmReadiness?.ready,
    handleActivateGpzPlacement,
    handleActivateTrunkFlow,
    handleOpenSnBayFlow,
    hasActiveCase,
    hasCanonicalTrunkStart,
    hasSource,
    modelSummary.branches,
    openCaseContextSurface,
    openExecutionSurface,
    primarySnBusRef,
    primaryStationRef,
  ]);

  // Refresh readiness data when active case changes
  useEffect(() => {
    if (activeCaseId) {
      resetEnmStore();
      void executeEnmOperation(activeCaseId, 'refresh_snapshot', {});
      readinessRefresh(activeCaseId);
    }
  }, [activeCaseId, executeEnmOperation, readinessRefresh, resetEnmStore]);

  useEffect(() => {
    setSldSymbols(enmProjection.symbols);
  }, [enmProjection.symbols, setSldSymbols]);

  // Determine empty state
  const emptyState: SldEmptyState | null = useMemo(() => {
    if (forceEmptyState) {
      return forceEmptyState;
    }
    if (!hasActiveCase) {
      return 'NO_CASE';
    }
    if (symbols.length === 0) {
      return 'NO_MODEL';
    }
    return null;
  }, [forceEmptyState, hasActiveCase, symbols.length]);

  // Handle action from empty overlay
  const handleEmptyAction = useCallback(() => {
    openCaseContextSurface();
  }, [openCaseContextSurface]);

  const handleCreateFirstCase = useCallback(async () => {
    if (isCreatingFirstCase) {
      return;
    }

    setIsCreatingFirstCase(true);
    try {
      let projectId = activeProjectId;
      if (!projectId) {
        const project = await withTimeout(createProject({ name: 'Projekt 1' }));
        projectId = project.id;
        setActiveProject(project.id, project.name);
      }

      if (!projectId) {
        notify('Nie mo?na utworzy? zakresu oblicze?: brak aktywnego projektu. Otw?rz projekt i utw?rz zakres oblicze?.', 'warning');
        return;
      }

      const createdCase = await withTimeout(
        createCase({
          project_id: projectId,
          name: 'Zakres 1',
          description: '',
          set_active: true,
        })
      );

      setActiveCase(createdCase.id, createdCase.name, 'ShortCircuitCase', createdCase.result_status);
      notify(`Utworzono i aktywowano zakres obliczen: ${createdCase.name}.`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nieznany b??d';
      if (message === 'TIMEOUT_API_CREATE_CASE') {
        notify('Brak odpowiedzi API podczas tworzenia zakresu oblicze? (limit 15 s). Sprawd? po??czenie i spr?buj ponownie.', 'warning');
        return;
      }
      notify(`Nie uda?o si? utworzy? zakresu oblicze?. Szczeg??y techniczne: ${message}`, 'error');
    } finally {
      setIsCreatingFirstCase(false);
    }
  }, [isCreatingFirstCase, activeProjectId, withTimeout, setActiveProject, createCase, setActiveCase]);

  // BLOK 8: Uruchom obliczenia â€” otwiera menedĹĽer przypadkĂłw z widokiem obliczeniowym
  const handleCalculate = useCallback(() => {
    openExecutionSurface();
  }, [openExecutionSurface]);

  // UX 10/10: ReadinessLivePanel callbacks
  const handleReadinessNavigate = useCallback((elementRef: string) => {
    selectElement({ id: elementRef, type: 'Bus', name: elementRef });
    centerSldOnElement(elementRef);
  }, [selectElement, centerSldOnElement]);

  const handleReadinessFixAction = useCallback((fixAction: FixAction, elementRef: string | null) => {
    if (elementRef) {
      selectElement({ id: elementRef, type: 'Bus', name: elementRef });
      centerSldOnElement(elementRef);
    }
    executeFixActionSurface(fixAction, {
      snapshot: enmSnapshot,
      openOperationForm,
      selectElement,
      centerSldOnElement,
      notify,
    });
  }, [centerSldOnElement, enmSnapshot, openOperationForm, selectElement]);

  // UX 10/10: DataGapPanel callbacks
  const handleDataGapQuickFix = useCallback((issue: ReadinessIssue) => {
    const fixAction = issue.fix_action;
    const elementId = issue.element_ref ?? issue.element_refs[0] ?? null;
    if (elementId) {
      selectElement({ id: elementId, type: 'Bus', name: elementId });
      centerSldOnElement(elementId);
    }
    if (!fixAction) {
      notify('Brak kanonicznej akcji naprawczej dla tego braku.', 'warning');
      return;
    }
    executeFixActionSurface(fixAction, {
      snapshot: enmSnapshot,
      openOperationForm,
      selectElement,
      centerSldOnElement,
      notify,
    });
  }, [centerSldOnElement, enmSnapshot, openOperationForm, selectElement]);

  // Show inspector when selection changes
  useEffect(() => {
    if (activeTool !== 'connect_secondary_ring_sn' && pendingRingTerminal) {
      setPendingRingTerminal(null);
    }
  }, [activeTool, pendingRingTerminal]);

  const runResolvedAction = useCallback(async (
    tool: CreatorTool,
    target: { id: string; type: any; name: string },
    interaction: { kind: 'canvas' | 'element' | 'port'; portRole?: 'TRUNK_IN' | 'TRUNK_OUT' | 'BRANCH_OUT' | 'RING' | 'NN_SOURCE' },
  ) => {
    const resolved = resolveToolAction(tool, target as any, {
      hasSource,
      hasCanonicalTrunkStart,
      hasRing,
      activeCaseId,
    }, interaction);

    const formDrivenOps = new Set([
      'add_grid_source_sn',
      'continue_trunk_segment_sn',
      'insert_station_on_segment_sn',
      'start_branch_segment_sn',
      'add_transformer_sn_nn',
      'add_converter_source',
      'assign_catalog_to_element',
      'update_element_parameters',
    ]);

    if (resolved.mode !== 'DOMAIN_OP' || !resolved.canonicalOp) {
      const reason = resolved.reasonPl ?? 'Narz?dzie chwilowo niedost?pne.';
      setInteractionMessage(reason);
      notify(reason, 'warning');
      return;
    }

    if (resolved.canonicalOp === 'connect_secondary_ring_sn') {
      if (!pendingRingTerminal) {
        setPendingRingTerminal({
          id: target.id,
          label: target.name ?? target.id,
        });
        const msg = 'Wybierz drugi port ringu, aby otworzy? formularz domkni?cia pier?cienia.';
        setInteractionMessage(msg);
        notify(msg, 'info');
        return;
      }

      if (pendingRingTerminal.id === target.id) {
        const msg = 'Wska? drugi, r??ny port ringu.';
        setInteractionMessage(msg);
        notify(msg, 'warning');
        return;
      }

      const ringPayload = {
        terminalA_id: pendingRingTerminal.id,
        terminal_a_id: pendingRingTerminal.id,
        terminalA_label: pendingRingTerminal.label,
        terminalB_id: target.id,
        terminal_b_id: target.id,
        terminalB_label: target.name ?? target.id,
        source: 'sld_tool',
      };
      if (
        openToolCatalogPicker(
          'connect_secondary_ring_sn',
          ringPayload,
          `${pendingRingTerminal.label} ? ${target.name ?? target.id}`,
        )
      ) {
        setPendingRingTerminal(null);
        const msg = 'Wybierz typ kabla lub linii dla domkni?cia ringu.';
        setInteractionMessage(msg);
        notify(msg, 'info');
        return;
      }

      openOperationForm('connect_secondary_ring_sn', ringPayload);
      setPendingRingTerminal(null);
      const msg = `Otworzono formularz ${resolved.canonicalOp} dla portĂłw ${pendingRingTerminal.label} i ${target.name}.`;
      setInteractionMessage(msg);
      notify(msg, 'success');
      setActiveTool('select');
      return;
    }

    if (formDrivenOps.has(resolved.canonicalOp)) {
      if (resolved.canonicalOp === 'assign_catalog_to_element') {
        const enmElement = findEnmElementByRef(target.id);
        catalogAssignmentActions.openPicker({
          elementRef: target.id,
          enmElementType: String(enmElement?.type ?? target.type),
          currentCatalogRef:
            typeof enmElement?.catalog_ref === 'string' ? enmElement.catalog_ref : null,
        });
        const msg = `Wybierz typ katalogowy dla ${target.name}.`;
        setInteractionMessage(msg);
        notify(msg, 'info');
        setActiveTool('select');
        return;
      }

      if (
        resolved.catalogRequired
        && openToolCatalogPicker(
          resolved.canonicalOp,
          {
            ...resolved.payload,
            source_mode: 'KATALOG',
          },
          target.name,
        )
      ) {
        const msg = resolved.catalogLabelPl
          ? `Wybierz typ z katalogu: ${resolved.catalogLabelPl}.`
          : 'Wybierz typ z katalogu przed otwarciem formularza.';
        setInteractionMessage(msg);
        notify(msg, 'info');
        return;
      }

      openOperationForm(resolved.canonicalOp, resolved.payload);
      const msg = `Otworzono formularz ${resolved.canonicalOp} dla ${target.name}.`;
      setInteractionMessage(msg);
      notify(msg, 'success');
      setActiveTool('select');
      return;
    }

    const result = await executeEnmOperation(activeCaseId!, resolved.canonicalOp, resolved.payload);
    if (result) {
      const msg = interaction.kind === 'port'
        ? `Wykonano ${resolved.canonicalOp} przez port ${interaction.portRole}.`
        : `Wykonano ${resolved.canonicalOp} dla ${target.name}.`;
      setInteractionMessage(msg);
      notify(msg, 'success');
      setActiveTool('select');
    } else {
      const err = `Operacja ${resolved.canonicalOp} nie powiod?a si?.`;
      setInteractionMessage(err);
      notify(err, 'error');
    }
  }, [
    hasCanonicalTrunkStart,
    hasSource,
    hasRing,
    activeCaseId,
    executeEnmOperation,
    openOperationForm,
    pendingRingTerminal,
    catalogAssignmentActions,
    findEnmElementByRef,
    openToolCatalogPicker,
  ]);

  const buildPreview = useCallback((
    tool: CreatorTool,
    target: { id: string; type: any; name: string },
    interaction: { kind: 'canvas' | 'element' | 'port'; portRole?: 'TRUNK_IN' | 'TRUNK_OUT' | 'BRANCH_OUT' | 'RING' | 'NN_SOURCE' },
  ) => {
    if (!tool || tool === 'select' || tool === 'move') {
      setInteractionPreview(null);
      return;
    }
    const resolved = resolveToolAction(tool, target as any, {
      hasSource,
      hasCanonicalTrunkStart,
      hasRing,
      activeCaseId,
    }, interaction);
    setInteractionPreview({
      target_kind: interaction.kind === 'port' ? 'port' : interaction.kind,
      target_id: target.id,
      valid: resolved.mode === 'DOMAIN_OP',
      message_pl:
        resolved.reasonPl
        ?? (resolved.catalogRequired && resolved.catalogLabelPl
          ? `Wymagany typ z katalogu: ${resolved.catalogLabelPl}`
          : `Gotowe: ${resolved.canonicalOp}`),
      port_role: interaction.portRole,
    });
  }, [hasCanonicalTrunkStart, hasSource, hasRing, activeCaseId]);

  return (
    <div
      data-testid="sld-editor-page"
      className="flex h-full w-full overflow-hidden rounded-[20px] border border-[#173041] bg-[linear-gradient(180deg,#030b11_0%,#06111a_100%)] shadow-[0_24px_60px_rgba(2,8,23,0.44),inset_0_1px_0_rgba(148,163,184,0.06)]"
    >
      <SldWorkDock
        contextItems={dockContextItems}
        nextStep={dockNextStep}
        actionGroups={dockActionGroups}
        objectPalette={DOCK_OBJECT_PALETTE}
        modelSummary={modelSummary}
        interactionMessage={interactionMessage}
        interactionHint={dockInteractionHint}
        projectTreeContent={projectTreeContent}
        processContent={<ProcessPanel className="h-full" />}
        readinessContent={
          <SldReadinessStack
            activeCaseId={activeCaseId}
            className="pointer-events-auto"
            workspaceBlockState={null}
            issues={readinessIssues}
            status={readinessStatus}
            ready={Boolean(enmReadiness?.ready)}
            loading={readinessLoading}
            collapsedGroups={readinessCollapsedGroups}
            onToggleGroup={readinessToggleGroup}
            onNavigateToElement={handleReadinessNavigate}
            onFixAction={handleReadinessFixAction}
            onQuickFix={handleDataGapQuickFix}
          />
        }
      />

      {/* SLD View (main area) - ALWAYS rendered */}
      <div className="relative flex-1 min-w-0 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(14,116,144,0.12),transparent_28%),linear-gradient(180deg,#06111a_0%,#08131d_100%)]">
        <SLDView
          symbols={symbols}
          connections={enmProjection.connections}
          selectedElement={selectedElement}
          showGrid={true}
          fitOnMount={symbols.length > 0}
          canonicalAnnotations={enmProjection.canonicalAnnotations}
          onCalculateClick={handleCalculate}
          onCanvasClick={() => {
            setHoveredElementName(null);
            setInteractionPreview(null);
            if (activeTool === 'add_grid_source_sn') {
              void runResolvedAction(
                'add_grid_source_sn',
                { id: 'canvas', type: 'Bus', name: 'p??tna' } as any,
                { kind: 'canvas' },
              );
              return;
            }
            setInteractionMessage('Klikni?to t?o p??tna.');
          }}
          onElementHover={(element) => {
            setHoveredElementName(element?.name ?? null);
            if (element) {
              buildPreview(activeTool, element, { kind: 'element' });
            } else {
              setInteractionPreview(null);
            }
          }}
          onSegmentHover={(segment) => {
            setHoveredSegmentRef(segment?.segment_ref ?? null);
            if (segment) {
              buildPreview(activeTool, {
                id: segment.segment_ref,
                type: 'LineBranch',
                name: segment.segment_ref,
              } as any, { kind: 'element' });
            }
          }}
          onPortHover={(target, role) => {
            if (!target || !role) {
              setInteractionPreview(null);
              return;
            }
            buildPreview(activeTool, target, { kind: 'port', portRole: role });
          }}
          interactionPreview={interactionPreview}
          onSegmentClick={async (segment) => {
            setSelectedSegment(segment);
            clearSelection();
            if (activeTool === 'insert_station_on_segment_sn') {
              await runResolvedAction(activeTool, {
                id: segment.segment_ref,
                type: 'LineBranch',
                name: segment.segment_ref,
              } as any, { kind: 'element' });
              return;
            }
            setInteractionMessage(`Wybrano segment ${segment.segment_ref} (${segment.segment_kind}).`);
          }}
          onPortClick={async (target, role) => {
            if (!activeTool || activeTool === 'select' || activeTool === 'move') {
              return;
            }
            setSelectedSegment(null);
            await runResolvedAction(activeTool, target, { kind: 'port', portRole: role });
          }}
          onElementClick={async (element) => {
            setSelectedSegment(null);
            selectElement(element);
            if (!activeTool || activeTool === 'select' || activeTool === 'move') {
              setInteractionMessage(`Wybrano element: ${element.name}`);
              return;
            }
            await runResolvedAction(activeTool, element, { kind: 'element' });
          }}
        />

        {/* Empty state overlay - rendered ON TOP of canvas */}
        {emptyState && (
          <SldEmptyOverlay
            state={emptyState}
            hasCases={studyCasesCount > 0}
            onSelectCase={handleEmptyAction}
            onCreateCase={handleCreateFirstCase}
            isCreatingCase={isCreatingFirstCase}
          />
        )}

        {/* UX 10/10: OperationalModeToolbar + LabelModeToolbar â€” bottom-right corner */}
        <div
          className="absolute bottom-4 right-4 z-20 flex items-center gap-2"
          data-testid="sld-bottom-right-toolbars"
        >
          <div className="flex items-center gap-2 rounded-[18px] border border-[#1d3446] bg-[rgba(7,19,28,0.88)] px-2 py-2 shadow-[0_16px_32px_rgba(2,8,23,0.42),inset_0_1px_0_rgba(148,163,184,0.06)] backdrop-blur">
            <LabelModeToolbar compact />
            <OperationalModeToolbar />
          </div>
        </div>
      </div>

      {!selectedElement && selectedSegment && activeMode === 'MODEL_EDIT' && (
        <SegmentInspectorPanel
          title="Inspektor odcinka"
          displayName={String(selectedSegmentBranch?.name ?? selectedSegment.segment_ref)}
          technicalRef={selectedSegment.segment_ref}
          kindLabel={selectedSegment.segment_kind}
          fromLabel={selectedSegment.from_ref}
          toLabel={selectedSegment.to_ref}
          statusLabel={String(selectedSegmentBranch?.status ?? '—')}
          voltageKv={selectedSegmentBusVoltageKv}
          lengthKm={segmentLengthKmDraft}
          branchTypeLabel={String(selectedSegmentBranch?.type ?? '—')}
          catalogRef={String(selectedSegmentBranch?.catalog_ref ?? 'BRAK')}
          catalogNamespaceLabel={String(selectedSegmentCatalogInfo?.namespace ?? 'BRAK')}
          catalogVersion={String(selectedSegmentCatalogInfo?.version ?? 'BRAK')}
          parameterSourceLabel={String(selectedSegmentParameterSourceInfo?.sourceMode ?? 'BRAK')}
          hasMaterializedParams={Boolean(selectedSegmentParameterSourceInfo?.hasMaterializedParams)}
          manualOverrideCount={selectedSegmentParameterSourceInfo?.manualOverrideCount ?? 0}
          readiness={{
            ready: Boolean(enmReadiness?.ready),
            blockerCount: enmReadiness?.blockers.length ?? 0,
            warningCount: enmReadiness?.warnings.length ?? 0,
          }}
          fixActionMessages={selectedSegmentFixActions.map((action) => action.message_pl)}
          lengthDraft={segmentLengthKmDraft}
          statusDraft={segmentStatusDraft as 'closed' | 'open'}
          catalogDraft={segmentCatalogDraft}
          onLengthDraftChange={setSegmentLengthKmDraft}
          onStatusDraftChange={setSegmentStatusDraft}
          onSave={() => {
            if (!activeCaseId) {
              notify('Brak aktywnego przypadku do zapisu segmentu.', 'warning');
              return;
            }
            const length = Number(segmentLengthKmDraft);
            if (!Number.isFinite(length) || length <= 0) {
              notify('Podaj poprawną dodatnią długość segmentu.', 'warning');
              return;
            }
            void executeEnmOperation(activeCaseId, 'update_element_parameters', {
              element_ref: selectedSegment.segment_ref,
              parameters: {
                length_km: length,
                status: segmentStatusDraft,
              },
            });
            notify('Zapisano parametry segmentu.', 'success');
          }}
          onOpenCatalogPicker={openCatalogPickerForSelectedSegment}
          onClose={() => setSelectedSegment(null)}
        />
      )}

      {toolCatalogPickerState.isOpen
        && toolCatalogPickerState.category
        && (
          <TypePicker
            isOpen={toolCatalogPickerState.isOpen}
            category={toolCatalogPickerState.category}
            onClose={closeToolCatalogPicker}
            onSelectType={handleToolCatalogTypeSelected}
          />
        )}

      {catalogAssignmentState.isPickerOpen
        && catalogAssignmentState.pickerCategory
        && activeCaseId && (
          <TypePicker
            isOpen={catalogAssignmentState.isPickerOpen}
            category={catalogAssignmentState.pickerCategory}
            currentTypeId={catalogAssignmentState.target?.currentCatalogRef ?? null}
            onClose={catalogAssignmentActions.closePicker}
            onSelectType={(typeId, typeName) => {
              void (async () => {
                const success = await catalogAssignmentActions.confirmAssignment(
                  typeId,
                  typeName,
                  executeEnmOperation,
                  activeCaseId,
                );
                notify(
                  success ? `Przypisano typ katalogowy: ${typeName}.` : 'Nie uda?o si? przypisa? typu katalogowego.',
                  success ? 'success' : 'error',
                );
              })();
            }}
          />
        )}
    </div>
  );
};

export default SldEditorPage;

