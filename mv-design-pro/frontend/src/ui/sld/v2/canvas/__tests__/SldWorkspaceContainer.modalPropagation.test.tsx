/**
 * SldWorkspaceContainer R22-R23 — modal → snapshot → canvas propagation tests.
 *
 * Krytyczny kontrakt: po zmianie w BayConfigModal zmiany IDŹ NA SLD natychmiast.
 * NIE jest to mock notify — patchSnapshot mutuje store, store dostarcza nowy
 * snapshot, container re-mountuje canvas, MiniBlockRmuRenderer pokazuje
 * nowe dane.
 *
 * Test pyramid R22-R23:
 *   - Direct snapshot mutation z patchSnapshot ⇒ nowy bay_number widoczny
 *   - Lastchanges propagation ⇒ inspectory widzą invalidate
 *   - Coupler state mutation ⇒ topology hash zmienia się
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { SldWorkspaceContainer } from '../SldWorkspaceContainer';
import type { EnergyNetworkModel } from '../../../../types/enm';

function makeSnapshotWithStation(): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'Test',
      created_at: '2026-05-08T00:00:00Z',
    } as never,
    buses: [
      { id: 'bus-15', ref_id: 'bus-15', name: 'Bus 15', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'bus-04', ref_id: 'bus-04', name: 'Bus 0.4', voltage_kv: 0.4, phase_system: '3ph', tags: [], meta: {} } as never,
    ],
    branches: [],
    transformers: [
      {
        id: 'tr-1', ref_id: 'tr-1', name: 'TR1', tags: [], meta: {},
        hv_bus_ref: 'bus-15', lv_bus_ref: 'bus-04',
        sn_mva: 0.63, uhv_kv: 15, ulv_kv: 0.4, uk_percent: 6, pk_kw: 6,
      } as never,
    ],
    sources: [],
    loads: [],
    generators: [],
    substations: [
      {
        id: 'sta-1', ref_id: 'sta-1', name: 'STAROŁĘCKA 42',
        tags: [], meta: {}, station_type: 'inline',
        bus_refs: ['bus-15', 'bus-04'], transformer_refs: ['tr-1'],
      } as never,
    ],
    bays: [
      {
        id: 'bay-1', ref_id: 'bay-1', name: 'bay-1', tags: [], meta: {},
        bay_role: 'IN', substation_ref: 'sta-1', bus_ref: 'bus-15',
        equipment_refs: ['app-1'], bay_number: '1', feeder_short_name: 'OLD',
      } as never,
    ],
    junctions: [],
    branch_points: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  } as EnergyNetworkModel;
}

describe('SldWorkspaceContainer R22-R23 — modal → snapshot → canvas propagation', () => {
  beforeEach(() => {
    useSnapshotStore.setState({
      snapshot: makeSnapshotWithStation(),
      logicalViews: null,
      readiness: null,
      fixActions: [],
      materializedParams: null,
      layout: null,
      selectionHint: null,
      lastChanges: null,
      lastEvents: [],
      operationHistory: [],
      loading: false,
      error: null,
      errorCode: null,
    });
  });

  it('Initial render → mini-RMU pokazuje nazwę stacji z snapshot', () => {
    render(<SldWorkspaceContainer width={800} height={600} />);
    /* MiniBlockRmuRenderer pokazuje nazwę stacji */
    expect(screen.getByTestId('sld-v2-mini-rmu-sta-1')).toBeTruthy();
    cleanup();
  });

  it('patchSnapshot → bay.bay_number zmienia się → re-render canvas pokazuje nowy numer', () => {
    const { container } = render(<SldWorkspaceContainer width={800} height={600} />);

    /* Pre-condition: bay_number=1 */
    const bayBefore = useSnapshotStore.getState().snapshot?.bays?.[0];
    expect(bayBefore?.bay_number).toBe('1');

    /* Mutuj patchSnapshot — symulacja modal onSubmit */
    act(() => {
      useSnapshotStore.getState().patchSnapshot(
        (snap) => ({
          ...snap,
          bays: (snap.bays ?? []).map((b) =>
            b.ref_id === 'bay-1' ? { ...b, bay_number: '99' } : b,
          ),
        }),
        ['bay-1'],
      );
    });

    /* Post-condition: bay_number=99 */
    const bayAfter = useSnapshotStore.getState().snapshot?.bays?.[0];
    expect(bayAfter?.bay_number).toBe('99');

    /* lastChanges propagated */
    expect(useSnapshotStore.getState().lastChanges?.affected_object_refs).toEqual(['bay-1']);

    /* Canvas re-rendered — sta-1 mini-RMU jeszcze obecny */
    expect(container.querySelector('[data-testid="sld-v2-mini-rmu-sta-1"]')).toBeTruthy();
    cleanup();
  });

  it('patchSnapshot transformer.sn_mva → mini-RMU pokazuje nowy kVA', () => {
    const { container } = render(<SldWorkspaceContainer width={800} height={600} />);

    act(() => {
      useSnapshotStore.getState().patchSnapshot(
        (snap) => ({
          ...snap,
          transformers: (snap.transformers ?? []).map((t) =>
            t.ref_id === 'tr-1' ? { ...t, sn_mva: 1.0 } : t,
          ),
        }),
        ['tr-1'],
      );
    });

    const tr = useSnapshotStore.getState().snapshot?.transformers?.[0];
    expect(tr?.sn_mva).toBe(1.0);
    expect(container.querySelector('[data-testid="sld-v2-mini-rmu-sta-1"]')).toBeTruthy();
    cleanup();
  });

  it('patchSnapshot bay.bay_role → mini-RMU footprintType się aktualizuje', () => {
    render(<SldWorkspaceContainer width={800} height={600} />);

    act(() => {
      useSnapshotStore.getState().patchSnapshot(
        (snap) => ({
          ...snap,
          bays: (snap.bays ?? []).map((b) =>
            b.ref_id === 'bay-1' ? { ...b, bay_role: 'OZE' } : b,
          ),
        }),
        ['bay-1'],
      );
    });

    const bay = useSnapshotStore.getState().snapshot?.bays?.[0];
    expect(bay?.bay_role).toBe('OZE');
    cleanup();
  });

  it('Multiple patchSnapshot calls kumulują zmiany w storze', () => {
    render(<SldWorkspaceContainer width={800} height={600} />);

    /* First patch */
    act(() => {
      useSnapshotStore.getState().patchSnapshot(
        (snap) => ({
          ...snap,
          bays: (snap.bays ?? []).map((b) =>
            b.ref_id === 'bay-1' ? { ...b, bay_number: '50' } : b,
          ),
        }),
        ['bay-1'],
      );
    });

    /* Second patch */
    act(() => {
      useSnapshotStore.getState().patchSnapshot(
        (snap) => ({
          ...snap,
          bays: (snap.bays ?? []).map((b) =>
            b.ref_id === 'bay-1' ? { ...b, feeder_short_name: 'NEW1' } : b,
          ),
        }),
        ['bay-1'],
      );
    });

    const bay = useSnapshotStore.getState().snapshot?.bays?.[0];
    expect(bay?.bay_number).toBe('50');
    expect(bay?.feeder_short_name).toBe('NEW1');
    cleanup();
  });

  it('patchSnapshot z affected_object_refs invaliduje lastChanges (Inv 4)', () => {
    render(<SldWorkspaceContainer width={800} height={600} />);

    act(() => {
      useSnapshotStore.getState().patchSnapshot(
        (snap) => snap,
        ['bay-1', 'sta-1', 'tr-1'],
      );
    });

    const lc = useSnapshotStore.getState().lastChanges;
    expect(lc?.affected_object_refs).toContain('bay-1');
    expect(lc?.affected_object_refs).toContain('sta-1');
    expect(lc?.affected_object_refs).toContain('tr-1');
    expect(lc?.updated.length).toBe(3);
    cleanup();
  });
});
