/**
 * Network Build Store — testy selektorów i store.
 *
 * Weryfikuje:
 * - computeBuildPhase zwraca deterministyczne fazy
 * - selectOpenTerminals sortuje po element_id
 * - selectBlockersByCategory grupuje poprawnie
 * - Store zarządza aktywnym formularzem
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeBuildPhase,
  selectOpenTerminals,
  selectConfiguredGridSourceSnFields,
  selectBlockersByCategory,
  selectActiveOperationForm,
  buildPhaseLabel,
  useNetworkBuildStore,
} from '../networkBuildStore';
import type { EnergyNetworkModel, LogicalViewsV1, ReadinessInfo } from '../../../types/enm';
import { ANALYSIS_SURFACE_SCREEN_CODE } from '../../workspace/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function emptyENM(): EnergyNetworkModel {
  return {
    version: '1.0',
    buses: [],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
  } as unknown as EnergyNetworkModel;
}

function enmWithSource(): EnergyNetworkModel {
  return {
    ...emptyENM(),
    sources: [{ ref_id: 'src-1', name: 'GPZ 1', bus_ref: 'bus-1', model: 'thevenin' }],
  } as unknown as EnergyNetworkModel;
}

// ---------------------------------------------------------------------------
// Tests: computeBuildPhase
// ---------------------------------------------------------------------------

describe('computeBuildPhase', () => {
  it('returns NO_SOURCE for null snapshot', () => {
    expect(computeBuildPhase(null, null, null)).toBe('NO_SOURCE');
  });

  it('returns NO_SOURCE for empty sources', () => {
    expect(computeBuildPhase(emptyENM(), null, null)).toBe('NO_SOURCE');
  });

  it('returns HAS_SOURCE when sources exist but no trunks', () => {
    expect(computeBuildPhase(enmWithSource(), { trunks: [], terminals: [], branches: [] } as unknown as LogicalViewsV1, null)).toBe('HAS_SOURCE');
  });

  it('treats a planned trunk with zero segments as not built yet', () => {
    const lv = { trunks: [{ id: 't1', segments: [] }], terminals: [], branches: [] } as unknown as LogicalViewsV1;
    expect(computeBuildPhase(enmWithSource(), lv, null)).toBe('HAS_SOURCE');
  });

  it('returns HAS_TRUNKS when trunks exist but no substations', () => {
    const lv = { trunks: [{ id: 't1', segments: ['seg-1'] }], terminals: [], branches: [] } as unknown as LogicalViewsV1;
    expect(computeBuildPhase(enmWithSource(), lv, null)).toBe('HAS_TRUNKS');
  });

  it('returns READY when readiness.ready is true', () => {
    const enm = { ...enmWithSource(), substations: [{ id: 's1', name: 'S1', station_type: 'terminal', transformer_refs: [], bus_refs: [] }] } as unknown as EnergyNetworkModel;
    const lv = { trunks: [{ id: 't1', segments: ['seg-1'] }], terminals: [], branches: [] } as unknown as LogicalViewsV1;
    const readiness = { ready: true, blockers: [] } as ReadinessInfo;
    expect(computeBuildPhase(enm, lv, readiness)).toBe('READY');
  });
});

// ---------------------------------------------------------------------------
// Tests: selectConfiguredGridSourceSnFields
// ---------------------------------------------------------------------------

describe('selectConfiguredGridSourceSnFields', () => {
  it('rozpoznaje kanoniczne pole SN GPZ zapisane w substation.meta.field_specs', () => {
    const enm = {
      ...emptyENM(),
      sources: [{ ref_id: 'src-1', name: 'GPZ 1', bus_ref: 'bus-gpz', substation_ref: 'gpz-1' }],
      buses: [{ ref_id: 'bus-gpz', name: 'Szyna GPZ', voltage_kv: 15 }],
      substations: [
        {
          id: 'gpz-1',
          ref_id: 'gpz-1',
          name: 'GPZ 1',
          station_type: 'gpz',
          bus_refs: ['bus-gpz'],
          transformer_refs: [],
          meta: {
            field_specs: [
              {
                field_ref: 'bay-sn-out-1',
                name: 'Pole odpływowe SN',
                bay_role: 'OUT',
                bus_ref: 'bus-gpz',
                equipment_refs: [],
                meta: {
                  catalog_binding: {
                    catalog_namespace: 'APARAT_SN',
                    catalog_item_id: 'ap-sn-1',
                  },
                },
              },
            ],
          },
        },
      ],
    } as unknown as EnergyNetworkModel;

    expect(selectConfiguredGridSourceSnFields(enm)).toEqual([
      expect.objectContaining({
        ref_id: 'bay-sn-out-1',
        name: 'Pole odpływowe SN',
        source: 'field_spec',
        bay_role: 'OUT',
      }),
    ]);
  });

  it('nie pokazuje technicznego ref_id jako nazwy skonfigurowanego pola', () => {
    const enm = {
      ...emptyENM(),
      sources: [{ ref_id: 'src-1', name: 'GPZ 1', bus_ref: 'bus-gpz', substation_ref: 'gpz-1' }],
      buses: [{ ref_id: 'bus-gpz', name: 'Szyna GPZ', voltage_kv: 15 }],
      substations: [
        {
          id: 'gpz-1',
          ref_id: 'gpz-1',
          name: 'GPZ 1',
          station_type: 'gpz',
          bus_refs: ['bus-gpz'],
          transformer_refs: [],
          meta: {
            field_specs: [
              {
                field_ref: 'sn/123/bay',
                bay_role: 'OUT',
                bus_ref: 'bus-gpz',
                equipment_refs: [],
                meta: { apparatus_kind: 'BREAKER' },
              },
            ],
          },
        },
      ],
    } as unknown as EnergyNetworkModel;

    expect(selectConfiguredGridSourceSnFields(enm)[0]?.name).toBe('Pole odpływowe SN');
  });
});

// ---------------------------------------------------------------------------
// Tests: selectOpenTerminals
// ---------------------------------------------------------------------------

describe('selectOpenTerminals', () => {
  it('returns empty for null logicalViews', () => {
    expect(selectOpenTerminals(null)).toEqual([]);
  });

  it('filters and sorts by element_id', () => {
    const lv = {
      terminals: [
        { element_id: 'b', status: 'OTWARTY', trunk_id: 't1' },
        { element_id: 'a', status: 'OTWARTY', trunk_id: 't1' },
        { element_id: 'c', status: 'ZAJETY', trunk_id: 't1' },
      ],
    } as unknown as LogicalViewsV1;

    const result = selectOpenTerminals(lv);
    expect(result).toHaveLength(2);
    expect(result[0].element_id).toBe('a');
    expect(result[1].element_id).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// Tests: selectBlockersByCategory
// ---------------------------------------------------------------------------

describe('selectBlockersByCategory', () => {
  it('returns zeroes for null readiness', () => {
    const result = selectBlockersByCategory(null);
    expect(result.total).toBe(0);
  });

  it('categorizes blockers correctly', () => {
    const readiness = {
      ready: false,
      blockers: [
        { code: 'topology_island', element_ref: 'e1' },
        { code: 'no_catalog_ref', element_ref: 'e2' },
        { code: 'switch_state_invalid', element_ref: 'e3' },
        { code: 'unknown_issue', element_ref: 'e4' },
      ],
    } as ReadinessInfo;

    const result = selectBlockersByCategory(readiness);
    expect(result.topologia).toBe(1);
    expect(result.katalogi).toBe(1);
    expect(result.eksploatacja).toBe(1);
    expect(result.analiza).toBe(1);
    expect(result.total).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Tests: buildPhaseLabel
// ---------------------------------------------------------------------------

describe('buildPhaseLabel', () => {
  it('returns Polish labels for all phases', () => {
    expect(buildPhaseLabel('NO_SOURCE')).toContain('Brak');
    expect(buildPhaseLabel('HAS_SOURCE')).toContain('GPZ');
    expect(buildPhaseLabel('HAS_TRUNKS')).toContain('Magistrala');
    expect(buildPhaseLabel('HAS_STATIONS')).toContain('Stacje');
    expect(buildPhaseLabel('READY')).toContain('gotowy');
  });
});

// ---------------------------------------------------------------------------
// Tests: Store
// ---------------------------------------------------------------------------

describe('useNetworkBuildStore', () => {
  beforeEach(() => {
    useNetworkBuildStore.getState().reset();
  });

  it('starts with null active operation form projection', () => {
    expect(selectActiveOperationForm(useNetworkBuildStore.getState())).toBeNull();
  });

  it('openOperationForm sets the form', () => {
    useNetworkBuildStore.getState().openOperationForm('add_grid_source_sn', { bus_ref: 'b1' });
    const form = selectActiveOperationForm(useNetworkBuildStore.getState());
    expect(form).not.toBeNull();
    expect(form!.op).toBe('add_grid_source_sn');
  });

  it('closeOperationForm clears the form', () => {
    useNetworkBuildStore.getState().openOperationForm('add_grid_source_sn');
    useNetworkBuildStore.getState().closeOperationForm();
    expect(selectActiveOperationForm(useNetworkBuildStore.getState())).toBeNull();
  });

  it('toggleSection adds/removes from collapsedSections', () => {
    useNetworkBuildStore.getState().toggleSection('section-1');
    expect(useNetworkBuildStore.getState().collapsedSections.has('section-1')).toBe(true);
    useNetworkBuildStore.getState().toggleSection('section-1');
    expect(useNetworkBuildStore.getState().collapsedSections.has('section-1')).toBe(false);
  });

  it('builds a canonical surface stack for nested object and technical surfaces', () => {
    useNetworkBuildStore.getState().openObjectCard({ kind: 'station', elementId: 'station-1' });
    useNetworkBuildStore.getState().openObjectCard({ kind: 'bay', elementId: 'bay-1' });
    useNetworkBuildStore.getState().openInspectorPanel('field_protection', 'relay-1', 'Switch');

    const state = useNetworkBuildStore.getState();
    expect(state.surfaceStack).toHaveLength(3);
    expect(state.surfaceStack[0]?.screenCode).toBe('E-13');
    expect(state.surfaceStack[1]?.screenCode).toBe('E-11');
    expect(state.surfaceStack[2]?.screenCode).toBe('E-11');

    state.closeActiveSurface();
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-11');
  });

  it('opens canonical route-managed analysis surface and clears it without touching shell state', () => {
    useNetworkBuildStore.getState().openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, { tabId: 'compare' });

    let state = useNetworkBuildStore.getState();
    expect(state.activeSurface?.surfaceKind).toBe('analityczny');
    expect(state.activeSurface?.screenCode).toBe(ANALYSIS_SURFACE_SCREEN_CODE);
    expect(state.activeSurface?.routeState.route).toBe('analysis');
    expect(state.activeSurface?.tabId).toBe('compare');

    useNetworkBuildStore.getState().clearRouteManagedSurface();
    state = useNetworkBuildStore.getState();
    expect(state.activeSurface).toBeNull();
    expect(state.surfaceStack).toEqual([]);
  });

  it('collapses stack to selected breadcrumb target', () => {
    useNetworkBuildStore.getState().openObjectCard({ kind: 'station', elementId: 'station-1' });
    useNetworkBuildStore.getState().openObjectCard({ kind: 'bay', elementId: 'bay-1' });

    const stationSurfaceId = useNetworkBuildStore.getState().surfaceStack[0]?.surfaceId;
    expect(stationSurfaceId).toBeTruthy();

    useNetworkBuildStore.getState().collapseSurfaceStackTo(stationSurfaceId ?? null);
    const state = useNetworkBuildStore.getState();
    expect(state.surfaceStack).toHaveLength(1);
    expect(state.activeSurface?.surfaceId).toBe(stationSurfaceId);
  });
});
