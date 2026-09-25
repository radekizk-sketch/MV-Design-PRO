/**
 * CDSE Comprehensive Test Suite
 *
 * Tests:
 * - test_cdse_click_flow: Full click → context → modal → execute flow
 * - test_no_local_graph_state: Verify no local mutations
 * - test_snapshot_update_after_op: Snapshot updated after operation
 * - test_logicalviews_consistency: LogicalViews consistent with context
 * - test_catalog_binding_required: CatalogBinding required for all elements
 * - test_materialization_snapshot_fields: Solver fields materialized
 * - test_readiness_fixaction_cycle: Readiness → fix → resolved
 * - test_overlay_after_operation: Overlay invalidated after op
 * - test_selection_sync: Selection syncs with backend hint
 * - test_catalog_preview: Preview engine shows correct fields
 */

import { describe, it, expect, vi } from 'vitest';

import {
  resolveContext,
  type LogicalViewsProjection,
} from '../contextResolver';

import {
  dispatchModal,
  getAllModalMappings,
  type ModalDispatchTarget,
} from '../modalDispatcher';

import {
  routeSldClick,
  type SldClickEvent,
} from '../sldEventRouter';

import { validatePayload } from '../operationExecutor';

import {
  applySelectionHint,
  applyClickSelection,
  clearSelection,
  createEmptySelection,
  selectionToUrlParams,
  selectionFromUrlParams,
} from '../selectionSync';

import {
  createInitialOverlayState,
  invalidateOverlay,
  applyOverlay,
  clearOverlay,
  needsRefresh,
} from '../overlayUpdater';

import {
  createInitialReadiness,
  syncFromResponse,
  getFixAction,
  hasReadinessIssue,
} from '../readinessSync';

import {
  buildCatalogPreview,
  formatPreviewValue,
  type MaterializationContractDef,
} from '../catalogPreviewEngine';

// ============================================================================
// Test fixtures
// ============================================================================

const MOCK_VIEWS: LogicalViewsProjection = {
  trunks: [
    {
      trunkId: 'trunk_1',
      segments: [
        {
          segmentId: 'seg_1',
          fromTerminal: 'bus_gpz',
          toTerminal: 'bus_b',
          elementIds: ['cable_1'],
        },
      ],
      terminals: ['bus_gpz', 'bus_b'],
    },
  ],
  branches: [
    {
      branchId: 'branch_1',
      fromTerminal: 'bus_b',
      elementIds: ['cable_branch_1'],
    },
  ],
  stations: [
    {
      stationId: 'station_b',
      elementIds: ['trafo_1', 'cb_sn_1'],
    },
  ],
  elementTypeMap: {
    'bus_gpz': 'Bus',
    'bus_b': 'Bus',
    'cable_1': 'CableBranch',
    'trafo_1': 'TransformerBranch',
    'cb_sn_1': 'Switch',
    'cable_branch_1': 'CableBranch',
    'load_1': 'Load',
    'pv_1': 'PVInverter',
    'relay_1': 'Relay',
    'ct_1': 'CT',
  },
};

// ============================================================================
// test_cdse_click_flow
// ============================================================================

describe('CDSE Click Flow — zero fabrykacji (karta W2 pkt 3)', () => {
  // ŻADEN z 13 kontekstów nie ma dziś modala z realnym komponentem w
  // `frontend/src` (patrz inwentarz klasy w komentarzu `modalDispatcher.ts`) —
  // `dispatchModal` zwraca `null` dla KAŻDEGO z nich, nie tylko dla
  // `PROTECTION_DEVICE` nazwanego w audycie. Iloczyn cech: każdy kontekst
  // rozwiązywalny z `MOCK_VIEWS` × oczekiwanie „brak fabrykowanego modala".

  it('trunk terminal click → context resolves, ale modal jest null (AddTrunkSegmentModal nie istnieje)', () => {
    // Click on the last terminal of trunk_1
    const context = resolveContext('bus_b', undefined, MOCK_VIEWS);
    expect(context.contextType).toBe('TRUNK_TERMINAL');
    expect(context.trunkId).toBe('trunk_1');

    expect(dispatchModal(context)).toBeNull();
  });

  it('trunk segment click → context resolves, ale modal jest null (InsertStationModal nie istnieje)', () => {
    const context = resolveContext('cable_1', undefined, MOCK_VIEWS);
    expect(context.contextType).toBe('TRUNK_SEGMENT');
    expect(context.segmentId).toBe('seg_1');

    expect(dispatchModal(context)).toBeNull();
  });

  it('station device click → context resolves, ale modal jest null (EditDeviceModal nie istnieje)', () => {
    const context = resolveContext('trafo_1', undefined, MOCK_VIEWS);
    expect(context.contextType).toBe('STATION_DEVICE');
    expect(context.stationId).toBe('station_b');

    expect(dispatchModal(context)).toBeNull();
  });

  it('load click → context resolves, ale modal jest null (EditLoadModal nie istnieje)', () => {
    const context = resolveContext('load_1', undefined, MOCK_VIEWS);
    expect(context.contextType).toBe('LOAD');
    expect(context.catalogNamespace).toBe('OBCIAZENIE');

    expect(dispatchModal(context)).toBeNull();
  });

  it('PV inverter click → context resolves, ale modal jest null (EditInverterSourceModal nie istnieje)', () => {
    const context = resolveContext('pv_1', undefined, MOCK_VIEWS);
    expect(context.contextType).toBe('INVERTER_SOURCE');
    expect(context.catalogNamespace).toBe('ZRODLO_NN_PV');

    expect(dispatchModal(context)).toBeNull();
  });

  it('relay click → context resolves, ale modal jest null (EditProtectionModal nie istnieje, operacja backendu wyłączona)', () => {
    const context = resolveContext('relay_1', undefined, MOCK_VIEWS);
    expect(context.contextType).toBe('PROTECTION_DEVICE');

    expect(dispatchModal(context)).toBeNull();
  });

  it('CT click → context resolves, ale modal jest null (EditMeasurementModal nie istnieje)', () => {
    const context = resolveContext('ct_1', undefined, MOCK_VIEWS);
    expect(context.contextType).toBe('MEASUREMENT_DEVICE');
    expect(context.catalogNamespace).toBe('CT');

    expect(dispatchModal(context)).toBeNull();
  });

  it('mapa dyspozytora jest PUSTA — żaden z 13 kontekstów nie ma zarejestrowanego modala', () => {
    expect(getAllModalMappings()).toEqual([]);
  });

  it('brak modala → router NIE otwiera modala, spada na SELECTION_ONLY (sldEventRouter.ts, bez zmian)', () => {
    const context = resolveContext('relay_1', undefined, MOCK_VIEWS);
    const onOpenModal = vi.fn();
    const onSelect = vi.fn();
    const onContextMenu = vi.fn();

    const wynik = routeSldClick(
      {
        elementId: 'relay_1',
        screenX: 10,
        screenY: 10,
        shiftKey: false,
        isContextMenu: false,
      },
      MOCK_VIEWS,
      onOpenModal,
      onSelect,
      onContextMenu,
    );

    expect(onOpenModal).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('relay_1', false);
    expect(wynik.action).toBe('SELECTION_ONLY');
    expect(wynik.modalTarget).toBeUndefined();
    expect(context.contextType).toBe('PROTECTION_DEVICE');
  });
});

// ============================================================================
// test_no_local_graph_state
// ============================================================================

describe('No Local Graph State', () => {
  it('context resolver does not modify views', () => {
    const viewsCopy = JSON.parse(JSON.stringify(MOCK_VIEWS));
    resolveContext('cable_1', undefined, MOCK_VIEWS);
    expect(MOCK_VIEWS).toEqual(viewsCopy);
  });

  it('modal dispatcher does not modify context', () => {
    const context = resolveContext('cable_1', undefined, MOCK_VIEWS);
    const contextCopy = { ...context };
    dispatchModal(context);
    expect(context).toEqual(contextCopy);
  });
});

// ============================================================================
// test_snapshot_update_after_op (via overlay invalidation)
// ============================================================================

describe('Snapshot Update After Operation', () => {
  it('overlay is invalidated when model changes', () => {
    let state = createInitialOverlayState();
    state = applyOverlay(state, {
      run_id: 'run-1',
      analysis_type: 'LOAD_FLOW',
      elements: [],
      legend: [],
    });
    expect(state.isStale).toBe(false);

    // After domain operation → model changed
    state = invalidateOverlay(state);
    expect(state.isStale).toBe(true);
  });

  it('needs refresh after invalidation with auto-refresh', () => {
    let state = createInitialOverlayState();
    state = applyOverlay(state, {
      run_id: 'run-1',
      analysis_type: 'SC_3F',
      elements: [],
      legend: [],
    });
    state = invalidateOverlay(state);
    expect(needsRefresh(state)).toBe(true);
  });

  it('clear overlay resets completely', () => {
    let state = createInitialOverlayState();
    state = applyOverlay(state, {
      run_id: 'run-1',
      analysis_type: 'LOAD_FLOW',
      elements: [],
      legend: [],
    });
    state = clearOverlay(state);
    expect(state.payload).toBeNull();
    expect(state.enabled).toBe(false);
    expect(state.isStale).toBe(false);
  });
});

// ============================================================================
// test_logicalviews_consistency
// ============================================================================

describe('LogicalViews Consistency', () => {
  it('all element types in map produce valid context', () => {
    for (const elementId of Object.keys(MOCK_VIEWS.elementTypeMap)) {
      const context = resolveContext(elementId, undefined, MOCK_VIEWS);
      expect(context.contextType).not.toBe('UNKNOWN');
      expect(context.elementId).toBe(elementId);
    }
  });

  it('unknown element produces UNKNOWN context', () => {
    const context = resolveContext('nonexistent', undefined, MOCK_VIEWS);
    expect(context.contextType).toBe('UNKNOWN');
  });

  it('żaden kontekst nie ma modal mappingu — mapa jest PUSTA, dopóki modale nie istnieją (karta W2 pkt 3)', () => {
    // Zastępuje poprzednie „all context types have modal mappings" (true dla
    // 13 kontekstów mapujących na komponenty, których nie ma w `frontend/src`).
    // Ten sam test resolveContext powyżej dowodzi: kontekst rozwiązuje się
    // poprawnie (`not.toBe('UNKNOWN')`), ale zero fabrykacji = zero modala.
    expect(getAllModalMappings()).toEqual([]);
  });
});

// ============================================================================
// test_catalog_binding_required
// ============================================================================

describe('Catalog Binding Required', () => {
  it('cable element resolves to KABEL_SN namespace', () => {
    const context = resolveContext('cable_1', undefined, MOCK_VIEWS);
    expect(context.catalogNamespace).toBe('KABEL_SN');
  });

  it('PV inverter resolves to ZRODLO_NN_PV namespace', () => {
    const context = resolveContext('pv_1', undefined, MOCK_VIEWS);
    expect(context.catalogNamespace).toBe('ZRODLO_NN_PV');
  });

  it('relay resolves to ZABEZPIECZENIE namespace', () => {
    const context = resolveContext('relay_1', undefined, MOCK_VIEWS);
    expect(context.catalogNamespace).toBe('ZABEZPIECZENIE');
  });

  it('CT resolves to CT namespace', () => {
    const context = resolveContext('ct_1', undefined, MOCK_VIEWS);
    expect(context.catalogNamespace).toBe('CT');
  });

  it('load resolves to OBCIAZENIE namespace', () => {
    const context = resolveContext('load_1', undefined, MOCK_VIEWS);
    expect(context.catalogNamespace).toBe('OBCIAZENIE');
  });
});

// ============================================================================
// test_materialization_snapshot_fields
// ============================================================================

describe('Materialization Snapshot Fields', () => {
  const CONTRACT: MaterializationContractDef = {
    namespace: 'KABEL_SN',
    solverFields: ['r_ohm_per_km', 'x_ohm_per_km', 'rated_current_a'],
    uiFields: [
      { fieldName: 'r_ohm_per_km', label_pl: 'R [Ω/km]', unit: 'Ω/km' },
      { fieldName: 'x_ohm_per_km', label_pl: 'X [Ω/km]', unit: 'Ω/km' },
      { fieldName: 'rated_current_a', label_pl: 'Imax [A]', unit: 'A' },
      { fieldName: 'cross_section_mm2', label_pl: 'Przekrój', unit: 'mm²' },
    ],
  };

  const CATALOG_ITEM = {
    id: 'kab_240',
    name: 'XRUHAKXS 1×240/25 mm²',
    version: '2026.02',
    r_ohm_per_km: 0.125,
    x_ohm_per_km: 0.088,
    rated_current_a: 420,
    cross_section_mm2: 240,
  };

  it('builds preview with all solver fields', () => {
    const preview = buildCatalogPreview('KABEL_SN', CATALOG_ITEM, CONTRACT);
    expect(preview.solverFields).toHaveLength(3);
    expect(preview.solverFields[0].fieldName).toBe('r_ohm_per_km');
    expect(preview.solverFields[0].value).toBe(0.125);
    expect(preview.solverFields[0].isSolverField).toBe(true);
  });

  it('builds preview with UI-only fields', () => {
    const preview = buildCatalogPreview('KABEL_SN', CATALOG_ITEM, CONTRACT);
    expect(preview.uiFields).toHaveLength(1);
    expect(preview.uiFields[0].fieldName).toBe('cross_section_mm2');
    expect(preview.uiFields[0].isSolverField).toBe(false);
  });

  it('detects changes on update', () => {
    const currentValues = {
      r_ohm_per_km: 0.130,  // different from catalog
      x_ohm_per_km: 0.088,
      rated_current_a: 420,
      cross_section_mm2: 240,  // same as catalog
    };
    const preview = buildCatalogPreview('KABEL_SN', CATALOG_ITEM, CONTRACT, currentValues);
    expect(preview.isUpdate).toBe(true);
    expect(preview.changedFieldCount).toBe(1);
    expect(preview.solverFields[0].hasChanged).toBe(true);
    expect(preview.solverFields[0].fieldName).toBe('r_ohm_per_km');
  });

  it('formats numeric value with unit', () => {
    const field = { fieldName: 'r', label_pl: 'R', unit: 'Ω/km', value: 0.125, isSolverField: true };
    expect(formatPreviewValue(field)).toBe('0.125 Ω/km');
  });

  it('formats null as dash', () => {
    const field = { fieldName: 'r', label_pl: 'R', unit: '', value: null, isSolverField: true };
    expect(formatPreviewValue(field)).toBe('—');
  });

  it('formats boolean as Polish', () => {
    const field = { fieldName: 'x', label_pl: 'X', unit: '', value: true, isSolverField: false };
    expect(formatPreviewValue(field)).toBe('Tak');
  });
});

// ============================================================================
// test_readiness_fixaction_cycle
// ============================================================================

describe('Readiness Fix Action Cycle', () => {
  it('initial state allows analysis', () => {
    const state = createInitialReadiness();
    expect(state.canRunAnalysis).toBe(true);
    expect(state.blockers).toHaveLength(0);
  });

  it('blockers prevent analysis', () => {
    const state = syncFromResponse(
      {
        blockers: [
          { code: 'source.voltage_invalid', message_pl: 'Brak napięcia źródła', severity: 'BLOCKER', element_id: 'src_1' },
        ],
        warnings: [],
      },
      [
        { code: 'source.voltage_invalid', action_type: 'OPEN_MODAL', modal_type: 'EditSourceModal', label_pl: 'Uzupełnij napięcie' },
      ],
    );

    expect(state.canRunAnalysis).toBe(false);
    expect(state.blockers).toHaveLength(1);
    expect(state.affectedElementIds).toContain('src_1');
  });

  it('fix action resolves to modal', () => {
    const state = syncFromResponse(
      {
        blockers: [
          { code: 'catalog.binding_missing', message_pl: 'Brak typu z katalogu', severity: 'BLOCKER' },
        ],
        warnings: [],
      },
      [
        { code: 'catalog.binding_missing', action_type: 'OPEN_MODAL', modal_type: 'CatalogPicker', label_pl: 'Wybierz typ' },
      ],
    );

    const fixAction = getFixAction(state, 'catalog.binding_missing');
    expect(fixAction).toBeDefined();
    expect(fixAction!.modalType).toBe('CatalogPicker');
    expect(fixAction!.actionType).toBe('OPEN_MODAL');
  });

  it('warnings allow analysis', () => {
    const state = syncFromResponse(
      {
        blockers: [],
        warnings: [
          { code: 'element.low_rating', message_pl: 'Niskie znamionowanie', element_id: 'cable_1' },
        ],
      },
      [],
    );

    expect(state.canRunAnalysis).toBe(true);
    expect(state.warnings).toHaveLength(1);
    expect(state.summary_pl).toContain('Uwagi');
  });

  it('hasReadinessIssue detects affected elements', () => {
    const state = syncFromResponse(
      {
        blockers: [
          { code: 'x', message_pl: 'y', severity: 'BLOCKER', element_id: 'elem_a' },
        ],
        warnings: [],
      },
      [],
    );
    expect(hasReadinessIssue(state, 'elem_a')).toBe(true);
    expect(hasReadinessIssue(state, 'elem_b')).toBe(false);
  });
});

// ============================================================================
// test_overlay_after_operation
// ============================================================================

describe('Overlay After Operation', () => {
  it('overlay invalidated after model change', () => {
    let state = createInitialOverlayState();
    state = applyOverlay(state, {
      run_id: 'run-1',
      analysis_type: 'LOAD_FLOW',
      elements: [],
      legend: [],
    });
    state = invalidateOverlay(state);
    expect(state.isStale).toBe(true);
    expect(needsRefresh(state)).toBe(true);
  });

  it('no invalidation needed if no overlay active', () => {
    const state = createInitialOverlayState();
    const after = invalidateOverlay(state);
    expect(after).toBe(state); // Same object, no change
  });
});

// ============================================================================
// test_selection_sync
// ============================================================================

describe('Selection Sync', () => {
  it('selection hint from backend applied correctly', () => {
    const state = applySelectionHint({
      elementId: 'new_element_1',
      action: 'SELECT',
    });
    expect(state.selectedIds).toEqual(['new_element_1']);
    expect(state.primaryId).toBe('new_element_1');
  });

  it('multi-select adds elements sorted', () => {
    let state = createEmptySelection();
    state = applyClickSelection(state, 'z_elem', false);
    state = applyClickSelection(state, 'a_elem', true);
    expect(state.selectedIds).toEqual(['a_elem', 'z_elem']);
    expect(state.isMultiSelect).toBe(true);
  });

  it('toggle off in multi-select', () => {
    let state = createEmptySelection();
    state = applyClickSelection(state, 'a', false);
    state = applyClickSelection(state, 'b', true);
    state = applyClickSelection(state, 'a', true); // toggle off
    expect(state.selectedIds).toEqual(['b']);
    expect(state.isMultiSelect).toBe(false);
  });

  it('clear selection', () => {
    const state = clearSelection();
    expect(state.selectedIds).toEqual([]);
    expect(state.primaryId).toBeNull();
  });

  it('URL round-trip', () => {
    const state = applyClickSelection(createEmptySelection(), 'elem_1', false);
    const url = selectionToUrlParams(state);
    const restored = selectionFromUrlParams(url);
    expect(restored.selectedIds).toEqual(['elem_1']);
  });
});

// ============================================================================
// test_payload_validation
// ============================================================================

describe('Payload Validation', () => {
  it('valid payload passes', () => {
    const errors = validatePayload({
      operation: 'continue_trunk_segment_sn',
      params: { length_m: 200 },
    });
    expect(errors).toHaveLength(0);
  });

  it('missing operation rejected', () => {
    const errors = validatePayload({
      operation: '',
      params: {},
    });
    expect(errors).toContain('Brak nazwy operacji');
  });
});

// ============================================================================
// SLD event router integration
// ============================================================================

describe('SLD Event Router', () => {
  it('right-click shows context menu', () => {
    let menuShown = false;
    const event: SldClickEvent = {
      elementId: 'cable_1',
      screenX: 100,
      screenY: 200,
      shiftKey: false,
      isContextMenu: true,
    };

    const result = routeSldClick(
      event,
      MOCK_VIEWS,
      () => {},
      () => {},
      () => { menuShown = true; },
    );

    expect(result.action).toBe('CONTEXT_MENU');
    expect(menuShown).toBe(true);
  });

  it('shift-click selects without modal', () => {
    let selectedId = '';
    const event: SldClickEvent = {
      elementId: 'cable_1',
      screenX: 0,
      screenY: 0,
      shiftKey: true,
      isContextMenu: false,
    };

    const result = routeSldClick(
      event,
      MOCK_VIEWS,
      () => {},
      (id) => { selectedId = id; },
      () => {},
    );

    expect(result.action).toBe('SELECTION_ONLY');
    expect(selectedId).toBe('cable_1');
  });

  it('normal click on trunk terminal selects only — brak modala AddTrunkSegmentModal (karta W2 pkt 3, nie istnieje)', () => {
    let openedModal: ModalDispatchTarget | null = null;
    let selectedId: string | null = null;
    const event: SldClickEvent = {
      elementId: 'bus_b',
      screenX: 0,
      screenY: 0,
      shiftKey: false,
      isContextMenu: false,
    };

    const result = routeSldClick(
      event,
      MOCK_VIEWS,
      (target) => { openedModal = target; },
      (id) => { selectedId = id; },
      () => {},
    );

    // Zastępuje poprzednie „opens modal" (SURFACE_OPENED z AddTrunkSegmentModal,
    // komponentem nieistniejącym w `frontend/src`) — router poprawnie spada na
    // SELECTION_ONLY, gdy dyspozytor nie ma mapowania (zero zmian w sldEventRouter.ts).
    expect(result.action).toBe('SELECTION_ONLY');
    expect(openedModal).toBeNull();
    expect(selectedId).toBe('bus_b');
  });
});
