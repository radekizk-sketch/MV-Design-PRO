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
import { useStudyCasesStore } from '../study-cases/store';
import { createProject } from '../projects/api';
import { notify } from '../notifications/store';
import { useReadinessLiveStore } from '../engineering-readiness';
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
import { navigateToVariants } from '../navigation/routes';
import {
  readExplicitCatalogNamespace,
  readExplicitCatalogVersion,
} from '../catalog/catalogSnapshot';
import { resolveBusSnRef, resolveStationRef } from '../network-build/forms/enmResolvers';
import { projectEnmToSldCadV12 } from './SldCadEngineV12';
import type { InteractionPortRole } from './types';
import type { FixAction, ReadinessIssue } from '../types';
import type { ElementType, SelectedElement } from '../types';
import { executeFixActionSurface } from '../shared/fixActionSurfaceExecutor';
import { useActiveVariant } from '../sld-overlay/variantStore';
import {
  buildSemanticDiagnosticsReport,
  createSemanticSelectedElement,
  type EngineeringElement,
  type EngineeringSemanticModel,
  type SemanticDiagnosticsReport,
} from '../engineering-semantic';

function resolveSemanticOutgoingPortRef(element: EngineeringElement | null): string | null {
  if (!element || element.elementKind !== 'MV_BAY') return null;
  return element.outgoingPortRefId
    ?? element.ports.find((port) => port.role === 'BAY_SN_OUT')?.portId
    ?? null;
}

function portRefToZaciskLabel(portRef: string | null): string {
  const normalized = portRef?.toUpperCase() ?? '';
  if (normalized.includes('BRANCH')) return 'zacisk odgalezieniowy SN';
  if (normalized.includes('OUT')) return 'zacisk wyjsciowy pola SN';
  if (normalized.includes('IN')) return 'zacisk wejsciowy pola SN';
  return 'zacisk pola SN';
}

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
  id?: string;
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
    description: 'Powiąż element z katalogiem technicznym bez bocznych adapterów.',
  },
  delete_element: {
    label: 'Usuń element',
    description: 'Usuń element z modelu wraz z kontrolą skutków topologicznych.',
  },
  add_grid_source_sn: {
    label: 'Dodaj źródło zasilania GPZ',
    description: 'Rozpocznij model od GPZ w trybie uproszczonym albo pełnym.',
  },
  continue_trunk_segment_sn: {
    label: 'Wyprowadź ciąg główny',
    description: 'Wskaż port pola SN. Formularz wymusi wybór kabla SN albo linii napowietrznej SN.',
  },
  insert_station_on_segment_sn: {
    label: 'Wstaw stację w ciąg',
    description: 'Dodaj stację topologiczną SN/nN w wybrany odcinek ciągu głównego.',
  },
  start_branch_segment_sn: {
    label: 'Rozpocznij odgałęzienie',
    description: 'Utwórz odgałęzienie z dopuszczonego portu lub punktu rozgałęźnego.',
  },
  connect_secondary_ring_sn: {
    label: 'Domknij pierścień',
    description: 'Połącz dwa porty pomocnicze w pierścień z kontrolą typu odcinka.',
  },
  set_normal_open_point: {
    label: 'Ustaw punkt normalnie otwarty',
    description: 'Wybierz łącznik w pierścieniu i ustaw scenariuszowy stan otwarcia.',
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

function hasSemanticGpzSupplyNode(semanticModel: EngineeringSemanticModel | null): boolean {
  if (!semanticModel) {
    return false;
  }

  return semanticModel.elements.some(
    (element) => element.engineeringRole === 'GPZ_SUPPLY_NODE' && element.elementKind === 'GPZ',
  );
}

function hasSemanticRingOrNormalOpenPoint(semanticModel: EngineeringSemanticModel | null): boolean {
  if (!semanticModel) {
    return false;
  }

  const elementsByRef = new Map(semanticModel.elements.map((element) => [element.refId, element]));
  if (semanticModel.elements.some((element) => element.engineeringRole === 'MV_NORMAL_OPEN_POINT')) {
    return true;
  }

  const ownerByPort = new Map<string, string>();
  for (const element of semanticModel.elements) {
    for (const port of element.ports) {
      ownerByPort.set(port.portId, element.refId);
    }
  }

  const powerConnections = semanticModel.connections.filter(
    (connection) => connection.connectionKind === 'TOR_MOCY' && connection.voltageDomain === 'SN',
  );

  if (
    powerConnections.some((connection) => {
      const switchingDevice = connection.switchingDeviceRefId
        ? elementsByRef.get(connection.switchingDeviceRefId)
        : null;
      return connection.normalState === 'ROZLACZONE'
        || switchingDevice?.engineeringRole === 'MV_NORMAL_OPEN_POINT';
    })
  ) {
    return true;
  }

  const parent = new Map<string, string>();
  const find = (node: string): string => {
    const parentNode = parent.get(node);
    if (!parentNode || parentNode === node) {
      parent.set(node, node);
      return node;
    }
    const root = find(parentNode);
    parent.set(node, root);
    return root;
  };

  const union = (left: string, right: string): boolean => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) {
      return true;
    }
    parent.set(leftRoot, rightRoot);
    return false;
  };

  return powerConnections.some((connection) => {
    const fromOwner = ownerByPort.get(connection.fromPortId);
    const toOwner = ownerByPort.get(connection.toPortId);
    if (!fromOwner || !toOwner || fromOwner === toOwner) {
      return false;
    }
    return union(fromOwner, toOwner);
  });
}

function isCatalogNamespace(value: unknown): value is CatalogNamespace {
  return typeof value === 'string' && value in NAMESPACE_TO_PICKER_CATEGORY;
}

function asEnmLookupEntries(value: unknown): EnmLookupEntry[] {
  return Array.isArray(value) ? (value as unknown as EnmLookupEntry[]) : [];
}

function collectEnmElementRefIds(snapshot: EnergyNetworkModel | null): string[] {
  if (!snapshot) {
    return [];
  }

  const ids = new Set<string>();
  for (const collection of ENM_LOOKUP_COLLECTIONS) {
    for (const entry of asEnmLookupEntries(snapshot[collection])) {
      const refId = typeof entry.ref_id === 'string' && entry.ref_id.length > 0
        ? entry.ref_id
        : typeof entry.id === 'string' && entry.id.length > 0
          ? entry.id
          : null;
      if (refId) {
        ids.add(refId);
      }
    }
  }

  return Array.from(ids).sort((left, right) => left.localeCompare(right));
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
  const setActiveSnapshot = useAppStateStore((state) => state.setActiveSnapshot);
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
  const [isFirstVariantDialogOpen, setIsFirstVariantDialogOpen] = useState(false);
  const [firstVariantProjectName, setFirstVariantProjectName] = useState('');
  const [firstVariantName, setFirstVariantName] = useState('');
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
    port_role?: InteractionPortRole;
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
    () => projectEnmToSldCadV12(
      (enmSnapshot ?? null) as Record<string, unknown> | null,
      logicalViews ?? null,
      { zoom: 1, hasActiveResults: resultStatusLabel !== 'Brak wynikow' },
    ),
    [enmSnapshot, logicalViews, resultStatusLabel],
  );

  const semanticDiagnosticsReport = useMemo<SemanticDiagnosticsReport | null>(() => {
    if (!enmProjection.semanticModel || !enmProjection.diagnostics) {
      return null;
    }

    return buildSemanticDiagnosticsReport({
      enmElementRefIds: collectEnmElementRefIds(enmSnapshot ?? null),
      semanticModel: enmProjection.semanticModel,
      diagnosticsProjection: enmProjection.diagnostics,
      sldViewModel: enmProjection.sldBaseProjection,
      legacyMappings: [],
    });
  }, [
    enmProjection.diagnostics,
    enmProjection.semanticModel,
    enmProjection.sldBaseProjection,
    enmSnapshot,
  ]);

  const buildSelectedElement = useCallback((
    elementRef: string,
    fallbackType: ElementType = 'Bus',
    fallbackName?: string,
  ): SelectedElement => {
    const enmElement = findEnmElementByRef(elementRef);
    const name = typeof enmElement?.name === 'string' && enmElement.name.trim()
      ? enmElement.name.trim()
      : fallbackName ?? elementRef;

    return createSemanticSelectedElement(
      elementRef,
      fallbackType,
      name,
      enmProjection.semanticModel,
    );
  }, [enmProjection.semanticModel, findEnmElementByRef]);

  useEffect(() => {
    if (!selectedElement || !enmProjection.semanticModel) {
      return;
    }

    const existsInSemanticModel = enmProjection.semanticModel.elements.some(
      (element) => element.refId === selectedElement.id,
    );
    const existsInCurrentEnm = Boolean(findEnmElementByRef(selectedElement.id));

    if (!existsInSemanticModel && !existsInCurrentEnm) {
      clearSelection();
      setSelectedSegment(null);
    }
  }, [
    clearSelection,
    enmProjection.semanticModel,
    findEnmElementByRef,
    selectedElement,
  ]);

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
    () => {
      if (enmProjection.semanticModel) {
        return hasSemanticGpzSupplyNode(enmProjection.semanticModel);
      }

        // Legacy fallback: pre-semantic snapshots do not expose GPZ engineering roles.
      return (enmSnapshot?.sources?.length ?? 0) > 0
        || symbols.some((symbol) => symbol.elementType === 'Source');
    },
    [enmProjection.semanticModel, enmSnapshot, symbols],
  );
  const hasCanonicalTrunkStart = useMemo(
    () => (logicalViews?.terminals ?? []).some((terminal) => terminal.status === 'OTWARTY'),
    [logicalViews],
  );
  const primaryOpenTrunkTerminal = useMemo(
    () => (logicalViews?.terminals ?? []).find((terminal) => terminal.status === 'OTWARTY') ?? null,
    [logicalViews],
  );
  const primaryLineFeederBay = useMemo(
    () =>
      (enmProjection.semanticModel?.elements ?? []).find(
        (element) =>
          element.elementKind === 'MV_BAY'
          && element.engineeringRole === 'LINE_FEEDER_BAY'
          && element.voltageDomain === 'SN',
      ) ?? null,
    [enmProjection.semanticModel],
  );
  const primaryTrunkRef = useMemo(
    () => logicalViews?.trunks?.[0]?.corridor_ref ?? null,
    [logicalViews],
  );
  const hasRing = useMemo(
    () => {
      if (enmProjection.semanticModel) {
        return hasSemanticRingOrNormalOpenPoint(enmProjection.semanticModel);
      }

      // Legacy fallback: older SLD symbols carried ring/NOP only in display names.
      return symbols.some((symbol) => {
        const normalizedName = (symbol.elementName ?? '').toLowerCase();
        return normalizedName.includes('ring') || normalizedName.includes('nop');
      });
    },
    [enmProjection.semanticModel, symbols],
  );
  const modelSummary = useMemo(
    () => {
      const canonical = enmProjection.canonicalAnnotations;
      const canonicalBranches =
        (canonical?.trunkSegments.length ?? 0)
        + (canonical?.branchPoints.length ?? 0);

      return {
        buses: enmSnapshot?.buses?.length ?? 0,
        branches: Math.max(enmSnapshot?.branches?.length ?? 0, canonicalBranches),
        transformers: enmSnapshot?.transformers?.length ?? 0,
        stations: Math.max(enmSnapshot?.substations?.length ?? 0, canonical?.stationChains.length ?? 0),
        openTerminals: (logicalViews?.terminals ?? []).filter((terminal) => terminal.status === 'OTWARTY').length,
      };
    },
    [enmProjection.canonicalAnnotations, enmSnapshot, logicalViews],
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
          className="w-full rounded border border-scada-border bg-scada-bg px-3 py-2 text-sm text-scada-text outline-none transition placeholder:text-scada-muted focus:border-scada-sn focus:ring-2 focus:ring-scada-sn/20"
        />
        <div
          data-testid="project-tree"
          data-empty={filteredProjectTreeNodes.length === 0}
          className="max-h-[320px] space-y-3 overflow-y-auto rounded border border-scada-border bg-scada-bg p-2"
        >
          {filteredProjectTreeNodes.length === 0 ? (
            <div className="rounded border border-dashed border-scada-border bg-scada-surface px-3 py-4 text-xs text-scada-muted">
              Brak elementow pasujacych do filtra.
            </div>
          ) : (
            Object.entries(groupedNodes).map(([group, nodes]) => (
              <div key={group} className="space-y-1">
                <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-scada-muted">
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
                        if (activeTool === 'insert_station_on_segment_sn' && node.type === 'LineBranch') {
                          openOperationForm('insert_station_on_segment_sn', {
                            source: 'project_tree',
                            segment_id: node.id,
                            segment_ref: node.id,
                            position_on_segment: 0.5,
                            station_type: 'inline',
                          });
                          setActiveTool('select');
                          const msg = `Otwarto formularz wstawienia stacji na odcinku: ${node.label}.`;
                          setInteractionMessage(msg);
                          notify(msg, 'info');
                          return;
                        }
                        selectElement(buildSelectedElement(node.id, node.type, node.label));
                        centerSldOnElement(node.id);
                        setInteractionMessage(`Wybrano element z drzewa modelu: ${node.label}.`);
                      }}
                      className={`flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left transition ${
                        isActive
                          ? 'border-scada-sn bg-scada-active text-scada-sn'
                          : 'border-scada-border bg-scada-surface text-scada-text hover:bg-scada-active'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{node.label}</span>
                        <span className="block truncate text-[11px] text-scada-muted">{node.subtitle}</span>
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-scada-muted">
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
    activeTool,
    centerSldOnElement,
    filteredProjectTreeNodes,
    openOperationForm,
    projectTreeQuery,
    buildSelectedElement,
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
    setActiveTool('select');
    openOperationForm('add_grid_source_sn', {
      source: 'sld_empty_state',
      gpz_model_kind: 'UPROSZCZONY_PARAMETRY_NA_SZYNIE_SN',
    });
    setInteractionMessage('Otwarto formularz GPZ uproszczonego z szyna SN.');
    notify('Otwarto formularz GPZ uproszczonego.', 'info');
  }, [openOperationForm]);

  const handleActivateFullGpzPlacement = useCallback(() => {
    setActiveTool('select');
    openOperationForm('add_grid_source_sn', {
      source: 'sld_empty_state',
      gpz_model_kind: 'PELNY_WN_TRANSFORMATOR_SN',
    });
    setInteractionMessage(
      'Otwarto formularz pelnego GPZ z torem WN, transformatorem WN/SN i szyna SN.',
    );
    notify('Otwarto formularz pelnego GPZ.', 'info');
  }, [openOperationForm]);

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
    const zaciskElementRef = primaryOpenTrunkTerminal?.element_id ?? primaryLineFeederBay?.refId ?? null;
    const zaciskPortRef =
      primaryOpenTrunkTerminal?.port_id
      ?? resolveSemanticOutgoingPortRef(primaryLineFeederBay)
      ?? null;

    if (zaciskElementRef) {
      const zaciskName = portRefToZaciskLabel(zaciskPortRef);
      openOperationForm('continue_trunk_segment_sn', {
        source: 'work_dock',
        field_ref: zaciskElementRef,
        terminal_id: zaciskElementRef,
        from_terminal_id: zaciskElementRef,
        terminal_port_id: zaciskPortRef ?? undefined,
        trunk_id: primaryOpenTrunkTerminal?.trunk_id ?? primaryTrunkRef ?? undefined,
        branch_id: primaryOpenTrunkTerminal?.branch_id ?? undefined,
        terminal_name: zaciskName,
        terminal_voltage_label: 'SN',
        segment_kind: 'KABEL_SN',
      });
      setActiveTool('select');
      const msg =
        'Otwarto formularz odcinka SN z wybranego zacisku pola. Wybierz kabel albo linie i parametry katalogowe.';
      setInteractionMessage(msg);
      notify(msg, 'info');
      return;
    }

    setActiveTool('continue_trunk_segment_sn');
    const msg =
      'Wskaz port pola SN. Formularz wymusi wybor kabla SN albo linii napowietrznej SN.';
    setInteractionMessage(msg);
    notify(msg, 'info');
  }, [openOperationForm, primaryLineFeederBay, primaryOpenTrunkTerminal, primaryTrunkRef]);

  const openCaseContextSurface = useCallback(() => {
    if (!hasActiveCase) {
      if (!isCreatingFirstCase) {
        setFirstVariantProjectName(activeProjectName?.trim() ?? '');
        setFirstVariantName('');
        setIsFirstVariantDialogOpen(true);
      }
      return;
    }

    if (onOpenCaseHelper) {
      onOpenCaseHelper();
      return;
    }
    navigateToVariants();
  }, [activeProjectName, hasActiveCase, isCreatingFirstCase, onOpenCaseHelper]);

  const openExecutionSurface = useCallback(() => {
    openCaseContextSurface();
    notify('Otwarto menedzer przypadkow — wybierz przypadek i uruchom obliczenia.', 'info');
  }, [openCaseContextSurface]);

  const dockContextItems = useMemo(
    () => [
      {
        label: 'Projekt',
        value: activeProjectName ?? activeProjectId ?? 'Nie wybrano',
      },
      {
        label: 'Zakres obliczeń',
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
        label: 'Ostatnie obliczenie',
        value: activeRunId ?? 'Brak',
      },
      {
        label: 'Wyniki',
        value: resultStatusLabel,
        tone:
          resultStatusLabel === 'Wyniki aktualne'
            ? ('ok' as const)
            : resultStatusLabel === 'Brak wynikow'
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
        return 'Najpierw wybierz aktywny zakres obliczeń.';
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
        title: 'Aktywuj wariant pracy',
        description:
          'Budowa modelu, wyniki i raporty sa zwiazane z jednym aktywnym wariantem pracy.',
        actionLabel: 'Skonfiguruj pierwszy wariant',
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
        title: 'Uruchom analize dla aktywnego przypadku',
        description:
          'Model ma juz wymagany kontekst i gotowosc obliczeniowa. Przejdz do wariantow i uruchomien.',
        actionLabel: 'Otworz warianty i uruchomienia',
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

  useEffect(() => {
    const snapshotHash = enmSnapshot?.header?.hash_sha256;
    if (snapshotHash && snapshotHash !== activeSnapshotId) {
      setActiveSnapshot(snapshotHash);
    }
  }, [activeSnapshotId, enmSnapshot?.header?.hash_sha256, setActiveSnapshot]);

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

  const handleCreateFirstCase = useCallback(() => {
    if (isCreatingFirstCase) {
      return;
    }
    setFirstVariantProjectName(activeProjectName?.trim() ?? '');
    setFirstVariantName('');
    setIsFirstVariantDialogOpen(true);
  }, [activeProjectName, isCreatingFirstCase]);

  const handleCloseFirstVariantDialog = useCallback(() => {
    if (isCreatingFirstCase) {
      return;
    }
    setIsFirstVariantDialogOpen(false);
  }, [isCreatingFirstCase]);

  const handleSubmitFirstVariant = useCallback(async () => {
    if (isCreatingFirstCase) {
      return;
    }

    const normalizedProjectName = firstVariantProjectName.trim();
    const normalizedVariantName = firstVariantName.trim();
    if (!activeProjectId && normalizedProjectName.length === 0) {
      notify('Podaj nazwę projektu.', 'warning');
      return;
    }
    if (normalizedVariantName.length === 0) {
      notify('Podaj nazwę wariantu pracy.', 'warning');
      return;
    }

    setIsCreatingFirstCase(true);
    try {
      let projectId = activeProjectId;
      if (!projectId) {
        const project = await withTimeout(createProject({ name: normalizedProjectName }));
        projectId = project.id;
        setActiveProject(project.id, project.name);
      }

      if (!projectId) {
        notify('Nie mozna skonfigurowac wariantu: brak aktywnego projektu.', 'warning');
        return;
      }

      const createdCase = await withTimeout(
        createCase({
          project_id: projectId,
          name: normalizedVariantName,
          description: 'Pierwszy wariant przygotowany bezposrednio ze schematu jednokreskowego.',
          set_active: true,
        }),
      );

      setActiveCase(createdCase.id, createdCase.name, 'ShortCircuitCase', createdCase.result_status);
      setIsFirstVariantDialogOpen(false);
      notify(`Skonfigurowano aktywny wariant pracy: ${createdCase.name}.`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nieznany blad';
      if (message === 'TIMEOUT_API_CREATE_CASE') {
        notify('Brak odpowiedzi API podczas przygotowania wariantu pracy. Sprobuj ponownie.', 'warning');
        return;
      }
      notify(`Nie udalo sie przygotowac pierwszego wariantu pracy. Szczegoly techniczne: ${message}`, 'error');
    } finally {
      setIsCreatingFirstCase(false);
    }
  }, [
    activeProjectId,
    createCase,
    firstVariantName,
    firstVariantProjectName,
    isCreatingFirstCase,
    setActiveCase,
    setActiveProject,
    withTimeout,
  ]);

  // BLOK 8: Uruchom obliczenia â€” otwiera menedĹĽer przypadkĂłw z widokiem obliczeniowym
  const handleCalculate = useCallback(() => {
    openExecutionSurface();
  }, [openExecutionSurface]);

  // UX 10/10: ReadinessLivePanel callbacks
  const handleReadinessNavigate = useCallback((elementRef: string) => {
    selectElement(buildSelectedElement(elementRef));
    centerSldOnElement(elementRef);
  }, [buildSelectedElement, selectElement, centerSldOnElement]);

  const handleReadinessFixAction = useCallback((fixAction: FixAction, elementRef: string | null) => {
    if (elementRef) {
      selectElement(buildSelectedElement(elementRef));
      centerSldOnElement(elementRef);
    }
    executeFixActionSurface(fixAction, {
      snapshot: enmSnapshot,
      openOperationForm,
      selectElement,
      centerSldOnElement,
      notify,
    });
  }, [buildSelectedElement, centerSldOnElement, enmSnapshot, openOperationForm, selectElement]);

  // UX 10/10: DataGapPanel callbacks
  const handleDataGapQuickFix = useCallback((issue: ReadinessIssue) => {
    const fixAction = issue.fix_action;
    const elementId = issue.element_ref ?? issue.element_refs[0] ?? null;
    if (elementId) {
      selectElement(buildSelectedElement(elementId));
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
  }, [buildSelectedElement, centerSldOnElement, enmSnapshot, openOperationForm, selectElement]);

  // Show inspector when selection changes
  useEffect(() => {
    if (activeTool !== 'connect_secondary_ring_sn' && pendingRingTerminal) {
      setPendingRingTerminal(null);
    }
  }, [activeTool, pendingRingTerminal]);

  const runResolvedAction = useCallback(async (
    tool: CreatorTool,
    target: { id: string; type: any; name: string },
    interaction: { kind: 'canvas' | 'element' | 'port'; portRole?: InteractionPortRole },
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
      const reason = resolved.reasonPl ?? 'NarzÄ™dzie chwilowo niedostÄ™pne.';
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
        const msg = 'Wybierz drugi port ringu, aby otworzyÄ‡ formularz domkniÄ™cia pierĹ›cienia.';
        setInteractionMessage(msg);
        notify(msg, 'info');
        return;
      }

      if (pendingRingTerminal.id === target.id) {
        const msg = 'WskaĹĽ drugi, rĂłĹĽny port ringu.';
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
          `${pendingRingTerminal.label} â†’ ${target.name ?? target.id}`,
        )
      ) {
        setPendingRingTerminal(null);
        const msg = 'Wybierz typ kabla lub linii dla domkniÄ™cia ringu.';
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
        ? `Wykonano ${resolved.canonicalOp} przez zacisk ${interaction.portRole}.`
        : `Wykonano ${resolved.canonicalOp} dla ${target.name}.`;
      setInteractionMessage(msg);
      notify(msg, 'success');
      setActiveTool('select');
    } else {
      const err = `Operacja ${resolved.canonicalOp} nie powiodĹ‚a siÄ™.`;
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
    interaction: { kind: 'canvas' | 'element' | 'port'; portRole?: InteractionPortRole },
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
      className="flex h-full w-full overflow-hidden bg-[#07111a]"
    >
      {false && (
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
      )}

      {/* SLD View (main area) - ALWAYS rendered */}
      <div className="relative flex-1 min-w-0 overflow-hidden bg-[#07111a]">
        <SLDView
          symbols={symbols}
          connections={enmProjection.connections}
          semanticModel={enmProjection.semanticModel}
          semanticDiagnosticsReport={semanticDiagnosticsReport}
          selectedElement={selectedElement}
          showGrid={true}
          fitOnMount={symbols.length > 0}
          minFitZoom={0.55}
          fitPadding={34}
          hideChrome
          canonicalAnnotations={enmProjection.canonicalAnnotations}
          onCalculateClick={handleCalculate}
          onCanvasClick={() => {
            setHoveredElementName(null);
            setInteractionPreview(null);
            if (activeTool === 'add_grid_source_sn') {
              void runResolvedAction(
                'add_grid_source_sn',
                { id: 'canvas', type: 'Bus', name: 'pĹ‚Ăłtna' } as any,
                { kind: 'canvas' },
              );
              return;
            }
            setInteractionMessage('KlikniÄ™to tĹ‚o pĹ‚Ăłtna.');
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

        {/* Empty state overlay is opt-in only; the active shell keeps the SLD canvas visually dominant. */}
        {forceEmptyState && emptyState && (
          <SldEmptyOverlay
            state={emptyState}
            hasSource={hasSource}
            hasCases={studyCasesCount > 0}
            onSelectCase={handleEmptyAction}
            onCreateCase={handleCreateFirstCase}
            onCreateSimpleGpz={handleActivateGpzPlacement}
            onCreateFullGpz={handleActivateFullGpzPlacement}
            isCreatingCase={isCreatingFirstCase}
            createGpzDisabled={!hasActiveCase || hasSource}
            createGpzDisabledReason={
              !hasActiveCase
                ? 'Najpierw skonfiguruj wariant pracy.'
                : hasSource
                  ? 'Model ma juz aktywne zrodlo zasilania GPZ.'
                  : undefined
            }
          />
        )}

        {isFirstVariantDialogOpen && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(2,8,23,0.74)] px-4"
            data-testid="first-variant-quickstart"
          >
            <div className="w-full max-w-xl rounded-[18px] border border-[#1d3446] bg-[#091622] shadow-[0_24px_64px_rgba(2,8,23,0.58)]">
              <div className="border-b border-[#173042] px-6 py-5">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7dd3fc]">
                  Start projektu
                </div>
                <h3 className="mt-2 text-xl font-semibold text-[#e6edf5]">
                  Skonfiguruj pierwszy wariant pracy
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#94a7b8]">
                  Ten przebieg tworzy jawny punkt startowy: projekt, aktywny wariant pracy i kontekst do dalszego modelowania na schemacie.
                </p>
              </div>

              <div className="grid gap-5 px-6 py-5">
                {!activeProjectId && (
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-[#d5e0ea]">Nazwa projektu</span>
                    <input
                      data-testid="first-variant-project-name"
                      value={firstVariantProjectName}
                      onChange={(event) => setFirstVariantProjectName(event.target.value)}
                      className="rounded-[12px] border border-[#284458] bg-[#0b1d2a] px-3 py-2 text-sm text-[#f2f7fb] outline-none transition focus:border-[#38bdf8]"
                      placeholder="Nazwa projektu"
                    />
                  </label>
                )}

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-[#d5e0ea]">Nazwa wariantu pracy</span>
                  <input
                    data-testid="first-variant-name"
                    value={firstVariantName}
                    onChange={(event) => setFirstVariantName(event.target.value)}
                    className="rounded-[12px] border border-[#284458] bg-[#0b1d2a] px-3 py-2 text-sm text-[#f2f7fb] outline-none transition focus:border-[#38bdf8]"
                    placeholder="Nazwa wariantu"
                  />
                </label>

                <div className="rounded-[14px] border border-[#163245] bg-[#08131d] px-4 py-3 text-sm text-[#9fb0bf]">
                  Po zapisaniu system aktywuje wariant, odswiezy pasek kontekstu i zdejmie blokade pustego schematu.
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#173042] px-6 py-4">
                <button
                  type="button"
                  onClick={handleCloseFirstVariantDialog}
                  disabled={isCreatingFirstCase}
                  className="rounded-[12px] border border-[#294153] bg-[#0b1823] px-4 py-2 text-sm font-medium text-[#c7d4df] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  data-testid="first-variant-submit"
                  onClick={handleSubmitFirstVariant}
                  disabled={isCreatingFirstCase || firstVariantName.trim().length === 0 || (!activeProjectId && firstVariantProjectName.trim().length === 0)}
                  className="rounded-[12px] border border-[#0ea5e9] bg-[#0ea5e9]/16 px-4 py-2 text-sm font-semibold text-[#e0f2fe] disabled:cursor-not-allowed disabled:border-[#294153] disabled:bg-[#10202d] disabled:text-[#6e8192]"
                >
                  {isCreatingFirstCase ? 'Zapisywanie...' : 'Aktywuj wariant'}
                </button>
              </div>
            </div>
          </div>
        )}

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
                  success ? `Przypisano typ katalogowy: ${typeName}.` : 'Nie udaĹ‚o siÄ™ przypisaÄ‡ typu katalogowego.',
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

