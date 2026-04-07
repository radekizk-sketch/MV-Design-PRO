/**
 * SLD Editor Page â€” PowerFactory/ETAP Style Main Editor View
 *
 * CANONICAL ALIGNMENT:
 * - powerfactory_ui_parity.md: Layout narzÄ™dziowy ZAWSZE renderowany
 * - wizard_screens.md Â§ 2.1: GĹ‚Ăłwna struktura okna
 * - sld_rules.md: SLD â†” selection synchronization
 *
 * POWERFACTORY/ETAP RULE:
 * > Layout narzÄ™dziowy ZAWSZE jest renderowany.
 * > Brak danych = komunikat w obszarze roboczym, a NIE brak UI.
 *
 * FEATURES:
 * - Full SLD editor with toolbar, canvas, grid
 * - Empty state overlay when no model (keeps tools visible)
 * - Integrates with PowerFactoryLayout
 * - Mode-aware (MODEL_EDIT, CASE_CONFIG, RESULT_VIEW)
 * - 100% Polish UI
 *
 * This is the DEFAULT view for the application.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { SLDView } from './SLDView';
import { SldEmptyOverlay, type SldEmptyState } from './SldEmptyOverlay';
import { useSldEditorStore } from '../sld-editor/SldEditorStore';
import { useSelectionStore } from '../selection/store';
import { useAppStateStore, useHasActiveCase, useActiveMode } from '../app-state';
import { SldInspectorPanel } from './inspector';
import { SldFixActionsPanel } from './SldFixActionsPanel';
import type { AnySldSymbol } from '../sld-editor/types';
import { useStudyCasesStore } from '../study-cases/store';
import { createProject } from '../projects/api';
import { notify } from '../notifications/store';
import { ReadinessLivePanel, DataGapPanel } from '../engineering-readiness';
import { useReadinessLiveStore } from '../engineering-readiness';
import { EngineeringInspector } from '../property-grid';
import { SldResultsAccess } from './SldResultsAccess';
import type { ElementResultsSummary } from './SldResultsAccess';
import { useResultsInspectorStore } from '../results-inspector/store';
import { OperationalModeToolbar } from './OperationalModeToolbar';
import { LabelModeToolbar } from './LabelModeToolbar';
import { CreatorToolbar } from '../topology/CreatorToolbar';
import type { CreatorTool } from '../topology/editorPalette';
import { useSnapshotStore } from '../topology/snapshotStore';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import type { EnergyNetworkModel } from '../../types/enm';
import { getToolStatusTable, resolveToolAction } from './interactionController';
import { TypePicker } from '../catalog/TypePicker';
import { useCatalogAssignment } from '../catalog/useCatalogAssignment';
import {
  getDefaultBindingForElement,
  inferCatalogNamespaceFromElement,
  inferCatalogVersionFromElement,
} from './catalogDefaults';
import { enmSnapshotToSldSymbols } from './enmSnapshotToSldSymbols';

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
    elementName: 'SieÄ‡ zasilajÄ…ca',
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

function asEnmLookupEntries(value: unknown): EnmLookupEntry[] {
  return Array.isArray(value) ? (value as unknown as EnmLookupEntry[]) : [];
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

  /** Open case manager callback */
  onOpenCaseManager?: () => void;
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
  onOpenCaseManager,
}) => {
  void useDemo;
  // Get symbols from store
  const storeSymbols = useSldEditorStore((state) => Array.from(state.symbols.values()));
  const setSldSymbols = useSldEditorStore((state) => state.setSymbols);
    // App state
  const hasActiveCase = useHasActiveCase();
  const activeMode = useActiveMode();
  const toggleCaseManager = useAppStateStore((state) => state.toggleCaseManager);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const setActiveProject = useAppStateStore((state) => state.setActiveProject);
  const setActiveCase = useAppStateStore((state) => state.setActiveCase);
  const createCase = useStudyCasesStore((state) => state.createCase);

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

  // Results inspector store â€” for SldResultsAccess
  const busResults = useResultsInspectorStore((state) => state.busResults);
  const branchResults = useResultsInspectorStore((state) => state.branchResults);
  const shortCircuitResults = useResultsInspectorStore((state) => state.shortCircuitResults);

  // Study cases â€” for hasCases wiring
  const studyCasesCount = useStudyCasesStore((state) => state.cases.length);

  // Inspector panel state
  const [inspectorPanelVisible, setInspectorPanelVisible] = useState(true);
  const [isCreatingFirstCase, setIsCreatingFirstCase] = useState(false);
  const [activeTool, setActiveTool] = useState<CreatorTool>('select');
  const [interactionMessage, setInteractionMessage] = useState<string | null>(null);
  const [hoveredElementName, setHoveredElementName] = useState<string | null>(null);
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
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const resetEnmStore = useSnapshotStore((state) => state.reset);
  const enmSnapshot = useSnapshotStore((state) => state.snapshot);
  const enmReadiness = useSnapshotStore((state) => state.readiness);
  const enmFixActions = useSnapshotStore((state) => state.fixActions);
  const enmMaterializedParams = useSnapshotStore((state) => state.materializedParams);
  const [segmentLengthKmDraft, setSegmentLengthKmDraft] = useState<string>('');
  const [segmentStatusDraft, setSegmentStatusDraft] = useState<string>('closed');
  const [catalogAssignmentState, catalogAssignmentActions] = useCatalogAssignment();
  const [segmentCatalogDraft, setSegmentCatalogDraft] = useState<string>('');

  // UX 10/10: Results mode flag â€” true when RESULT_VIEW mode and results available
  const isResultsMode = activeMode === 'RESULT_VIEW';

  // Resolve element data from SLD editor store for EngineeringInspector
  const selectedSymbol = useSldEditorStore((state) =>
    selectedElement ? state.symbols.get(selectedElement.id) ?? null : null,
  );

  const selectedEnmElement = useMemo<EnmLookupEntry | null>(() => {
    if (!selectedElement || !enmSnapshot) {
      return null;
    }

    for (const collection of ENM_LOOKUP_COLLECTIONS) {
      const entries = asEnmLookupEntries(enmSnapshot[collection]);
      const found = entries.find((entry) => entry.ref_id === selectedElement.id);
      if (found) {
        return found;
      }
    }

    return null;
  }, [selectedElement, enmSnapshot]);

  const elementData = useMemo<Record<string, unknown>>(() => {
    if (!selectedSymbol && !selectedEnmElement) return {};
    const data: Record<string, unknown> = {};
    for (const source of [selectedSymbol, selectedEnmElement]) {
      if (!source) {
        continue;
      }
      for (const [key, value] of Object.entries(source)) {
        if (key !== 'id' && key !== 'position' && value !== undefined) {
          data[key] = value;
        }
      }
    }
    return data;
  }, [selectedSymbol, selectedEnmElement]);

  const selectedElementCatalogInfo = useMemo(() => {
    if (!selectedEnmElement) {
      return null;
    }

    const catalogRef = selectedEnmElement.catalog_ref;
    if (typeof catalogRef !== 'string' || !catalogRef.trim()) {
      return null;
    }

    const namespace = inferCatalogNamespaceFromElement(selectedEnmElement);
    if (!namespace) {
      return null;
    }

    const refId = selectedEnmElement.ref_id;
    const materializedEntry = (
      typeof refId === 'string' && enmMaterializedParams
        ? enmMaterializedParams.lines_sn?.[refId] ?? enmMaterializedParams.transformers_sn_nn?.[refId] ?? null
        : null
    );

    return {
      namespace,
      typeId: catalogRef,
      typeName: catalogRef,
      version: inferCatalogVersionFromElement(selectedEnmElement),
      isMaterialized: materializedEntry !== null,
      hasDrift: false,
    };
  }, [selectedEnmElement, enmMaterializedParams]);

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
      namespace: inferCatalogNamespaceFromElement(selectedSegmentBranch),
      catalogRef,
      version: inferCatalogVersionFromElement(selectedSegmentBranch),
      isMaterialized: materializedEntry !== null,
    };
  }, [selectedSegmentBranch, enmMaterializedParams]);

  useEffect(() => {
    const length = selectedSegmentBranch?.length_km;
    const status = selectedSegmentBranch?.status;
    const catalogRef = selectedSegmentBranch?.catalog_ref;
    setSegmentLengthKmDraft(typeof length === 'number' ? String(length) : '');
    setSegmentStatusDraft(typeof status === 'string' ? status : 'closed');
    setSegmentCatalogDraft(typeof catalogRef === 'string' ? catalogRef : '');
  }, [selectedSegmentBranch]);

  const openCatalogPickerForSelectedElement = useCallback(() => {
    if (!selectedEnmElement || !selectedElement) {
      notify('Brak elementu do przypisania katalogu.', 'warning');
      return;
    }

    catalogAssignmentActions.openPicker({
      elementRef: selectedElement.id,
      enmElementType: String(selectedEnmElement.type ?? selectedElement.type),
      currentCatalogRef:
        typeof selectedEnmElement.catalog_ref === 'string' ? selectedEnmElement.catalog_ref : null,
    });
  }, [catalogAssignmentActions, selectedElement, selectedEnmElement]);

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

  const refreshCatalogForSelectedElement = useCallback(async () => {
    if (!activeCaseId || !selectedElement || !selectedEnmElement) {
      notify('Brak aktywnego przypadku lub elementu do odĹ›wieĹĽenia katalogu.', 'warning');
      return;
    }

    const binding = getDefaultBindingForElement(selectedEnmElement);
    if (!binding) {
      notify('Nie moĹĽna odtworzyÄ‡ bindingu katalogowego dla elementu.', 'warning');
      return;
    }

    const result = await executeEnmOperation(activeCaseId, 'assign_catalog_to_element', {
      element_ref: selectedElement.id,
      catalog_item_id: binding.catalog_item_id,
      catalog_namespace: binding.catalog_namespace,
      catalog_item_version: binding.catalog_item_version,
      source_mode: 'KATALOG',
    });
    notify(
      result ? 'OdĹ›wieĹĽono parametry elementu z katalogu.' : 'Nie udaĹ‚o siÄ™ odĹ›wieĹĽyÄ‡ parametrĂłw z katalogu.',
      result ? 'success' : 'error',
    );
  }, [activeCaseId, executeEnmOperation, selectedElement, selectedEnmElement]);

  const clearCatalogForSelectedSegment = useCallback(async () => {
    if (!activeCaseId || !selectedSegment || !selectedSegmentBranch) {
      notify('Brak aktywnego przypadku lub segmentu do wyczyszczenia katalogu.', 'warning');
      return;
    }

    const result = await executeEnmOperation(activeCaseId, 'assign_catalog_to_element', {
      element_ref: selectedSegment.segment_ref,
      catalog_item_id: null,
      catalog_namespace: inferCatalogNamespaceFromElement(selectedSegmentBranch),
    });
    notify(
      result ? 'UsuniÄ™to przypisanie katalogu segmentu.' : 'Nie udaĹ‚o siÄ™ usunÄ…Ä‡ katalogu segmentu.',
      result ? 'success' : 'error',
    );
  }, [activeCaseId, executeEnmOperation, selectedSegment, selectedSegmentBranch]);

  // Resolve results summary for SldResultsAccess
  const resultsSummary = useMemo<ElementResultsSummary | null>(() => {
    if (!selectedElement || !isResultsMode) return null;
    const elId = selectedElement.id;
    const elType = selectedElement.type;

    // Look up bus results (BusResults.rows: BusResultRow[])
    if (busResults?.rows) {
      const busRow = busResults.rows.find((b) => b.bus_id === elId);
      if (busRow) {
        return {
          elementId: elId,
          elementType: elType,
          elementName: selectedElement.name ?? elId,
          hasLoadFlowResults: true,
          hasScResults: !!shortCircuitResults,
          voltageKv: busRow.u_kv ?? undefined,
          voltagePu: busRow.u_pu ?? undefined,
        };
      }
    }

    // Look up branch results (BranchResults.rows: BranchResultRow[])
    if (branchResults?.rows) {
      const brRow = branchResults.rows.find((b) => b.branch_id === elId);
      if (brRow) {
        return {
          elementId: elId,
          elementType: elType,
          elementName: selectedElement.name ?? elId,
          hasLoadFlowResults: true,
          hasScResults: !!shortCircuitResults,
          loadingPct: brRow.loading_pct ?? undefined,
          pKw: brRow.p_mw != null ? brRow.p_mw * 1000 : undefined,
          qKvar: brRow.q_mvar != null ? brRow.q_mvar * 1000 : undefined,
        };
      }
    }

    // Minimal summary when no results available
    return {
      elementId: elId,
      elementType: elType,
      elementName: selectedElement.name ?? elId,
      hasLoadFlowResults: false,
      hasScResults: false,
    };
  }, [selectedElement, isResultsMode, busResults, branchResults, shortCircuitResults]);

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
  const hasRing = useMemo(
    () =>
      symbols.some((symbol) => {
        const normalizedName = (symbol.elementName ?? '').toLowerCase();
        return normalizedName.includes('ring') || normalizedName.includes('nop');
      }),
    [symbols],
  );
  const toolStatusTable = useMemo(() => getToolStatusTable(), []);

  // Refresh readiness data when active case changes
  useEffect(() => {
    if (activeCaseId) {
      resetEnmStore();
      void executeEnmOperation(activeCaseId, 'refresh_snapshot', {});
      readinessRefresh(activeCaseId);
    }
  }, [activeCaseId, executeEnmOperation, readinessRefresh, resetEnmStore]);

  useEffect(() => {
    setSldSymbols(enmSnapshotToSldSymbols(enmSnapshot as Record<string, unknown> | null));
  }, [enmSnapshot, setSldSymbols]);

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
    if (onOpenCaseManager) {
      onOpenCaseManager();
    } else {
      toggleCaseManager(true);
    }
  }, [onOpenCaseManager, toggleCaseManager]);

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
        notify('Nie moĹĽna utworzyÄ‡ przypadku: brak aktywnego projektu. OtwĂłrz MenedĹĽer przypadkĂłw i utwĂłrz projekt.', 'warning');
        return;
      }

      const createdCase = await withTimeout(
        createCase({
          project_id: projectId,
          name: 'Przypadek 1',
          description: '',
          set_active: true,
        })
      );

      setActiveCase(createdCase.id, createdCase.name, 'ShortCircuitCase', createdCase.result_status);
      notify(`Utworzono i aktywowano przypadek: ${createdCase.name}.`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nieznany bĹ‚Ä…d';
      if (message === 'TIMEOUT_API_CREATE_CASE') {
        notify('Brak odpowiedzi API podczas tworzenia przypadku (limit 15 s). SprawdĹş poĹ‚Ä…czenie i sprĂłbuj ponownie.', 'warning');
        return;
      }
      notify(`Nie udaĹ‚o siÄ™ utworzyÄ‡ przypadku. SzczegĂłĹ‚y techniczne: ${message}`, 'error');
    } finally {
      setIsCreatingFirstCase(false);
    }
  }, [isCreatingFirstCase, activeProjectId, withTimeout, setActiveProject, createCase, setActiveCase]);

  // Handle inspector close
  const handleInspectorClose = useCallback(() => {
    setInspectorPanelVisible(false);
  }, []);

  // BLOK 8: Uruchom obliczenia â€” otwiera menedĹĽer przypadkĂłw z widokiem obliczeniowym
  const handleCalculate = useCallback(() => {
    if (onOpenCaseManager) {
      onOpenCaseManager();
    } else {
      toggleCaseManager(true);
    }
    notify('Otwarto menedĹĽer przypadkĂłw â€” wybierz przypadek i uruchom obliczenia.', 'info');
  }, [onOpenCaseManager, toggleCaseManager]);

  // BLOK 2: Nawigacja do elementu z panelu FixActions
  const handleGoToElement = useCallback((elementId: string) => {
    selectElement({ id: elementId, type: 'Bus', name: elementId });
    centerSldOnElement(elementId);
  }, [selectElement, centerSldOnElement]);

  // UX 10/10: ReadinessLivePanel callbacks
  const handleReadinessNavigate = useCallback((elementRef: string) => {
    selectElement({ id: elementRef, type: 'Bus', name: elementRef });
    centerSldOnElement(elementRef);
  }, [selectElement, centerSldOnElement]);

  const handleReadinessFixAction = useCallback((_fixAction: unknown, elementRef: string | null) => {
    if (elementRef) {
      selectElement({ id: elementRef, type: 'Bus', name: elementRef });
      centerSldOnElement(elementRef);
    }
    notify('Akcja naprawcza uruchomiona.', 'info');
  }, [selectElement, centerSldOnElement]);

  // UX 10/10: DataGapPanel callbacks
  const handleDataGapNavigate = useCallback((elementId: string) => {
    selectElement({ id: elementId, type: 'Bus', name: elementId });
    centerSldOnElement(elementId);
  }, [selectElement, centerSldOnElement]);

  const handleDataGapQuickFix = useCallback((elementId: string, fixAction: string) => {
    selectElement({ id: elementId, type: 'Bus', name: elementId });
    centerSldOnElement(elementId);
    notify(`Szybka naprawa: ${fixAction} dla ${elementId}`, 'info');
  }, [selectElement, centerSldOnElement]);

  // Show inspector when selection changes
  useEffect(() => {
    if (selectedElement) {
      setInspectorPanelVisible(true);
    }
  }, [selectedElement]);

  const runResolvedAction = useCallback(async (
    tool: CreatorTool,
    target: { id: string; type: any; name: string },
    interaction: { kind: 'canvas' | 'element' | 'port'; portRole?: 'TRUNK_IN' | 'TRUNK_OUT' | 'BRANCH_OUT' | 'RING' | 'NN_SOURCE' },
  ) => {
    const resolved = resolveToolAction(tool, target as any, {
      hasSource,
      hasRing,
      activeCaseId,
    }, interaction);

    if (resolved.mode === 'BLOCKED' || !resolved.canonicalOp) {
      const reason = resolved.reasonPl ?? 'NarzÄ™dzie chwilowo niedostÄ™pne.';
      setInteractionMessage(reason);
      notify(reason, 'warning');
      return;
    }

    if (resolved.mode === 'OPEN_FORM') {
      openOperationForm(resolved.canonicalOp, resolved.payload);
      const msg = interaction.kind === 'port'
        ? 'Otworzono formularz ' + resolved.canonicalOp + ' dla portu ' + interaction.portRole + '.'
        : 'Otworzono formularz ' + resolved.canonicalOp + ' dla ' + target.name + '.';
      setInteractionMessage(msg);
      notify(msg, 'info');
      setActiveTool('select');
      return;
    }

    const result = await executeEnmOperation(activeCaseId!, resolved.canonicalOp, resolved.payload);
    if (result && !result.error) {
      const msg = interaction.kind === 'port'
        ? 'Wykonano ' + resolved.canonicalOp + ' przez port ' + interaction.portRole + '.'
        : 'Wykonano ' + resolved.canonicalOp + ' dla ' + target.name + '.';
      setInteractionMessage(msg);
      notify(msg, 'success');
      setActiveTool('select');
      return;
    }

    const err = 'Operacja ' + resolved.canonicalOp + ' nie powiodĹ‚a siÄ™.';
    setInteractionMessage(err);
    notify(err, 'error');
  }, [hasSource, hasRing, activeCaseId, executeEnmOperation, openOperationForm]);

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
      hasRing,
      activeCaseId,
    }, interaction);
    setInteractionPreview({
      target_kind: interaction.kind === 'port' ? 'port' : interaction.kind,
      target_id: target.id,
      valid: resolved.mode === 'DOMAIN_OP' || resolved.mode === 'OPEN_FORM',
      message_pl:
        resolved.reasonPl ??
        (resolved.mode === 'OPEN_FORM'
          ? 'Gotowe: formularz ' + resolved.canonicalOp
          : 'Gotowe: ' + resolved.canonicalOp),
      port_role: interaction.portRole,
    });
  }, [hasSource, hasRing, activeCaseId]);

  return (
    <div
      data-testid="sld-editor-page"
      className="h-full w-full flex relative"
    >
      <aside className="w-80 border-r border-gray-200 bg-gray-50 flex flex-col">
        <CreatorToolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          hasSource={hasSource}
          hasRing={hasRing}
          disabled={!activeCaseId}
        />
        <div className="p-3 text-xs border-t border-gray-200 bg-white overflow-auto">
          <div className="font-semibold text-gray-700 mb-2">Status narzÄ™dzi ENM_OP</div>
          <div className="space-y-1" data-testid="interaction-tool-status-table">
            {toolStatusTable.map((row) => (
              <div key={row.tool} className="flex items-start justify-between gap-2">
                <span className="text-gray-600">{row.tool}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    row.status === 'DZIALA'
                      ? 'bg-emerald-100 text-emerald-700'
                      : row.status === 'MAPOWANIE'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {row.status}
                </span>
              </div>
            ))}
          </div>
          {interactionMessage && (
            <div className="mt-3 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">
              {interactionMessage}
            </div>
          )}
          {activeTool && activeTool !== 'select' && activeTool !== 'move' && (
            <div
              className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700"
              data-testid="sld-tool-preview-hint"
            >
              {hoveredElementName
                ? `PodglÄ…d operacji ${activeTool} na: ${hoveredElementName}`
                : `Tryb ${activeTool}: wskaĹĽ poprawny element, segment lub port.`}
            </div>
          )}
          {hoveredSegmentRef && (
            <div className="mt-2 rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700">
              Segment pod kursorem: {hoveredSegmentRef}
            </div>
          )}
        </div>
      </aside>

      {/* SLD View (main area) - ALWAYS rendered */}
      <div className="flex-1 min-w-0 relative">
        <SLDView
          symbols={symbols}
          selectedElement={selectedElement}
          showGrid={true}
          fitOnMount={symbols.length > 0}
          onCalculateClick={handleCalculate}
          onCanvasClick={() => {
            setHoveredElementName(null);
            setInteractionPreview(null);
            if (activeTool === 'add_gpz') {
              void runResolvedAction(
                'add_gpz',
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
            if (activeTool === 'insert_station') {
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

        {/* BLOK 2: Panel naprawczy â€” floating bottom-left */}
        {activeCaseId && (
          <div className="pointer-events-none absolute bottom-12 left-4 z-20">
            <SldFixActionsPanel
              caseId={activeCaseId}
              onGoToElement={handleGoToElement}
              defaultExpanded={false}
            />
          </div>
        )}

        {/* UX 10/10: panel gotowoĹ›ci + panel brakĂłw danych â€” lewy dolny rĂłg, nad panelem szybkich napraw */}
        {activeCaseId && (
          <div
            className="pointer-events-none absolute bottom-28 left-4 z-20 flex w-80 flex-col gap-2 xl:w-96"
            data-testid="sld-readiness-stack"
          >
            <ReadinessLivePanel
              issues={readinessIssues}
              status={readinessStatus}
              loading={readinessLoading}
              collapsedGroups={readinessCollapsedGroups}
              onToggleGroup={readinessToggleGroup}
              onNavigateToElement={handleReadinessNavigate}
              onFixAction={handleReadinessFixAction}
            />
            <DataGapPanel
              onNavigateToElement={handleDataGapNavigate}
              onQuickFix={handleDataGapQuickFix}
              compact
            />
          </div>
        )}

        {/* UX 10/10: OperationalModeToolbar + LabelModeToolbar â€” bottom-right corner */}
        <div
          className="absolute bottom-4 right-4 z-20 flex items-center gap-2"
          data-testid="sld-bottom-right-toolbars"
        >
          <LabelModeToolbar compact />
          <OperationalModeToolbar />
        </div>
      </div>

      {/* Inspector Panel (PR-SLD-07) - Only in read-only or when something selected */}
      {inspectorPanelVisible && selectedElement && activeMode !== 'MODEL_EDIT' && (
        <SldInspectorPanel
          onClose={handleInspectorClose}
        />
      )}

      {/* UX 10/10: EngineeringInspector â€” replaces SldInspectorPanel in MODEL_EDIT mode */}
      {inspectorPanelVisible && selectedElement && activeMode === 'MODEL_EDIT' && (
        <div data-testid="sld-engineering-inspector-wrapper" className="flex-shrink-0">
          <EngineeringInspector
            elementId={selectedElement.id}
            elementType={selectedElement.type}
            elementData={elementData}
            catalogInfo={selectedElementCatalogInfo}
            onFieldChange={(field, value) => {
              if (!activeCaseId || !selectedElement) {
                notify('Brak aktywnego przypadku lub elementu do zapisu.', 'warning');
                return;
              }
              void executeEnmOperation(activeCaseId, 'update_element_parameters', {
                element_ref: selectedElement.id,
                parameters: {
                  [field]: value,
                },
              });
              notify(`Zmieniono pole: ${field}`, 'info');
            }}
            onChangeCatalogType={openCatalogPickerForSelectedElement}
            onRefreshFromCatalog={refreshCatalogForSelectedElement}
            onNavigateToResults={() => {
              notify('PrzejĹ›cie do wynikĂłw elementu...', 'info');
            }}
            onEditProtection={() => {
              notify('Edycja zabezpieczeĹ„ elementu...', 'info');
            }}
            onDeleteElement={async () => {
              if (!activeCaseId || !selectedElement) {
                notify('Brak aktywnego przypadku lub elementu do usuniÄ™cia.', 'warning');
                return;
              }
              const result = await executeEnmOperation(activeCaseId, 'delete_element', {
                element_ref: selectedElement.id,
              });
              if (result) {
                notify(`UsuniÄ™to element: ${selectedElement.name ?? selectedElement.id}.`, 'success');
              } else {
                notify('Nie udaĹ‚o siÄ™ usunÄ…Ä‡ elementu z modelu.', 'error');
              }
            }}
          />
        </div>
      )}

      {inspectorPanelVisible && !selectedElement && selectedSegment && activeMode === 'MODEL_EDIT' && (
        <aside className="w-80 border-l border-gray-200 bg-white p-3 text-sm" data-testid="sld-segment-inspector">
          <h3 className="font-semibold text-gray-800">Inspektor segmentu</h3>
          <div className="mt-2 space-y-1 text-xs text-gray-700">
            <div><span className="font-medium">segment_ref:</span> {selectedSegment.segment_ref}</div>
            <div><span className="font-medium">edge_id:</span> {selectedSegment.edge_id}</div>
            <div><span className="font-medium">typ logiczny:</span> {selectedSegment.segment_kind}</div>
            <div><span className="font-medium">from:</span> {selectedSegment.from_ref}</div>
            <div><span className="font-medium">to:</span> {selectedSegment.to_ref}</div>
            <div data-testid="sld-segment-inspector-status">
              <span className="font-medium">status:</span> {String(selectedSegmentBranch?.status ?? 'â€”')}
            </div>
            <div data-testid="sld-segment-inspector-voltage">
              <span className="font-medium">napiÄ™cie:</span> {selectedSegmentBusVoltageKv ?? 'â€”'} kV
            </div>
            <div data-testid="sld-segment-inspector-length">
              <span className="font-medium">dĹ‚ugoĹ›Ä‡:</span> {String(selectedSegmentBranch?.length_km ?? 'â€”')} km
            </div>
            <div data-testid="sld-segment-inspector-type">
              <span className="font-medium">typ linii/kabla:</span> {String(selectedSegmentBranch?.type ?? 'â€”')}
            </div>
            <div data-testid="sld-segment-inspector-catalog">
              <span className="font-medium">katalog:</span> {String(selectedSegmentBranch?.catalog_ref ?? 'BRAK')}
            </div>
            <div data-testid="sld-segment-inspector-namespace">
              <span className="font-medium">kategoria katalogu:</span> {String(selectedSegmentCatalogInfo?.namespace ?? 'BRAK')}
            </div>
            <div data-testid="sld-segment-inspector-version">
              <span className="font-medium">wersja:</span> {String(selectedSegmentCatalogInfo?.version ?? 'BRAK')}
            </div>
          </div>

          <div className="mt-3 rounded border border-gray-200 p-2">
            <div className="text-xs font-semibold text-gray-700">GotowoĹ›Ä‡ obliczeĹ„ i Szybkie naprawy</div>
            <div className="mt-1 text-[11px] text-gray-600" data-testid="sld-segment-readiness-status">
              Gotowy: {enmReadiness?.ready ? 'TAK' : 'NIE'} | Blockery: {enmReadiness?.blockers.length ?? 0} | OstrzeĹĽenia: {enmReadiness?.warnings.length ?? 0}
            </div>
            <ul className="mt-1 list-disc pl-4 text-[11px] text-gray-700" data-testid="sld-segment-fix-actions">
              {selectedSegmentFixActions.length === 0 ? (
                <li>Brak akcji naprawczych dla segmentu.</li>
              ) : (
                selectedSegmentFixActions.map((action) => (
                  <li key={`${action.code}-${action.element_ref ?? 'global'}`}>
                    {action.message_pl}
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="mt-3 rounded border border-gray-200 p-2">
            <div className="text-xs font-semibold text-gray-700">Edycja segmentu (ENM_OP)</div>
            <label className="mt-2 block text-[11px] text-gray-600">
              DĹ‚ugoĹ›Ä‡ [km]
              <input
                data-testid="sld-segment-input-length"
                type="number"
                step="0.001"
                value={segmentLengthKmDraft}
                onChange={(event) => setSegmentLengthKmDraft(event.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              />
            </label>
            <label className="mt-2 block text-[11px] text-gray-600">
              Status
              <select
                data-testid="sld-segment-input-status"
                value={segmentStatusDraft}
                onChange={(event) => setSegmentStatusDraft(event.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="closed">closed</option>
                <option value="open">open</option>
              </select>
            </label>
            <button
              data-testid="sld-segment-save-button"
              type="button"
              className="mt-2 w-full rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
              onClick={() => {
                if (!activeCaseId) {
                  notify('Brak aktywnego przypadku do zapisu segmentu.', 'warning');
                  return;
                }
                const length = Number(segmentLengthKmDraft);
                if (!Number.isFinite(length) || length <= 0) {
                  notify('Podaj poprawnÄ… dodatniÄ… dĹ‚ugoĹ›Ä‡ segmentu.', 'warning');
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
            >
              Zapisz parametry segmentu
            </button>
          </div>

          <div className="mt-3 rounded border border-gray-200 p-2">
            <div className="text-xs font-semibold text-gray-700">Katalog segmentu</div>
            <div className="mt-1 text-[11px] text-gray-600" data-testid="sld-segment-catalog-status">
              {selectedSegmentCatalogInfo
                ? `Przypisano ${selectedSegmentCatalogInfo.catalogRef} (${selectedSegmentCatalogInfo.version})`
                : 'Brak przypisanego katalogu segmentu.'}
            </div>
            <button
              data-testid="sld-segment-open-catalog-picker"
              type="button"
              className="mt-2 w-full rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
              onClick={openCatalogPickerForSelectedSegment}
            >
              ZmieĹ„ typ z katalogu
            </button>
            <button
              data-testid="sld-segment-clear-catalog-button"
              type="button"
              className="mt-2 w-full rounded border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedSegmentCatalogInfo}
              onClick={() => {
                void clearCatalogForSelectedSegment();
              }}
            >
              UsuĹ„ przypisanie katalogu
            </button>
            <input
              data-testid="sld-segment-input-catalog"
              type="text"
              value={segmentCatalogDraft}
              onChange={(event) => setSegmentCatalogDraft(event.target.value)}
              placeholder="np. YAKXS_3x120"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
            />
            <button
              data-testid="sld-segment-assign-catalog-button"
              type="button"
              className="mt-2 w-full rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
              onClick={() => {
                if (!activeCaseId) {
                  notify('Brak aktywnego przypadku do przypisania katalogu.', 'warning');
                  return;
                }
                if (!segmentCatalogDraft.trim()) {
                  notify('Podaj identyfikator katalogu segmentu.', 'warning');
                  return;
                }
                void executeEnmOperation(activeCaseId, 'assign_catalog_to_element', {
                  element_ref: selectedSegment.segment_ref,
                  catalog_item_id: segmentCatalogDraft.trim(),
                });
                notify('Przypisano katalog segmentu.', 'success');
              }}
            >
              Przypisz katalog
            </button>
          </div>
          <button
            type="button"
            className="mt-3 w-full rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
            onClick={() => setSelectedSegment(null)}
          >
            Zamknij inspektor segmentu
          </button>
        </aside>
      )}

      {/* UX 10/10: SldResultsAccess â€” floating right panel in results mode */}
      {isResultsMode && selectedElement && (
        <div data-testid="sld-results-access-wrapper" className="flex-shrink-0">
          <SldResultsAccess
            selectedElementId={selectedElement.id}
            resultsSummary={resultsSummary}
            onShowWhiteBox={(elId) => {
              notify(`Otwarcie Ĺ›ladu obliczeĹ„ dla: ${elId}`, 'info');
            }}
            onShowFullResults={(elId) => {
              notify(`PeĹ‚ne wyniki dla: ${elId}`, 'info');
            }}
            onExportResults={(elId, format) => {
              notify(`Eksport wynikĂłw (${format}) dla: ${elId}`, 'info');
            }}
            onShowProtectionCoverage={(elId) => {
              notify(`Pokrycie zabezpieczeniowe: ${elId}`, 'info');
            }}
          />
        </div>
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
