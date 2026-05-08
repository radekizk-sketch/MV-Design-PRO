/**
 * patchSnapshot integration tests (R22-R23) — modal mutacja propaguje
 * end-to-end: store → snapshot → SLD canvas → mini-RMU pokazuje nowe dane.
 *
 * Reference invariant: Inv 4 (Case Immutability Rule) — wyniki obliczeń
 * INVALIDOWANE przez `lastChanges.affected_object_refs[]`.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useSnapshotStore } from '../snapshotStore';
import type { EnergyNetworkModel } from '../../../types/enm';

function makeSnapshot(): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'Test',
      created_at: '2026-05-08T00:00:00Z',
    } as never,
    buses: [],
    branches: [],
    transformers: [
      {
        id: 'tr-1', ref_id: 'tr-1', name: 'TR1', tags: [], meta: {},
        hv_bus_ref: 'b1', lv_bus_ref: 'b2',
        sn_mva: 25, uhv_kv: 110, ulv_kv: 15, uk_percent: 6, pk_kw: 6,
      } as never,
    ],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [
      {
        id: 'bay-1', ref_id: 'bay-1', name: 'bay-1', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'sta-1', bus_ref: 'b1',
        equipment_refs: ['app-1'],
        bay_number: '10', feeder_short_name: 'PST1',
      } as never,
    ],
    junctions: [],
  } as EnergyNetworkModel;
}

describe('snapshotStore.patchSnapshot — R22 lokalna mutacja', () => {
  beforeEach(() => {
    useSnapshotStore.setState({
      snapshot: null,
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

  it('patchSnapshot z null snapshot → no-op (brak crash)', () => {
    const { result } = renderHook(() => useSnapshotStore());
    expect(result.current.snapshot).toBeNull();
    act(() => {
      result.current.patchSnapshot((snap) => snap, ['ref-1']);
    });
    expect(result.current.snapshot).toBeNull();
  });

  it('patchSnapshot mutuje snapshot przez updater function', () => {
    useSnapshotStore.setState({ snapshot: makeSnapshot() });
    const { result } = renderHook(() => useSnapshotStore());

    act(() => {
      result.current.patchSnapshot(
        (snap) => ({
          ...snap,
          bays: (snap.bays ?? []).map((b) =>
            b.ref_id === 'bay-1' ? { ...b, bay_number: '99', feeder_short_name: 'NEW1' } : b,
          ),
        }),
        ['bay-1'],
      );
    });

    const bay = result.current.snapshot?.bays?.find((b) => b.ref_id === 'bay-1');
    expect(bay?.bay_number).toBe('99');
    expect(bay?.feeder_short_name).toBe('NEW1');
  });

  it('patchSnapshot ustawia lastChanges.affected_object_refs (Inv 4)', () => {
    useSnapshotStore.setState({ snapshot: makeSnapshot() });
    const { result } = renderHook(() => useSnapshotStore());

    act(() => {
      result.current.patchSnapshot(
        (snap) => snap,
        ['bay-1', 'sta-1', 'sec-1'],
      );
    });

    expect(result.current.lastChanges?.affected_object_refs).toEqual(['bay-1', 'sta-1', 'sec-1']);
    expect(result.current.lastChanges?.updated.length).toBe(3);
  });

  it('patchSnapshot mutuje transformer (sn_mva, uhv_kv)', () => {
    useSnapshotStore.setState({ snapshot: makeSnapshot() });
    const { result } = renderHook(() => useSnapshotStore());

    act(() => {
      result.current.patchSnapshot(
        (snap) => ({
          ...snap,
          transformers: (snap.transformers ?? []).map((t) =>
            t.ref_id === 'tr-1' ? { ...t, sn_mva: 40, uhv_kv: 110, ulv_kv: 20 } : t,
          ),
        }),
        ['tr-1'],
      );
    });

    const tr = result.current.snapshot?.transformers?.find((t) => t.ref_id === 'tr-1');
    expect(tr?.sn_mva).toBe(40);
    expect(tr?.ulv_kv).toBe(20);
  });

  it('patchSnapshot mutuje meta (coupler_state) zachowując pozostałe fields', () => {
    useSnapshotStore.setState({ snapshot: makeSnapshot() });
    const { result } = renderHook(() => useSnapshotStore());

    act(() => {
      result.current.patchSnapshot(
        (snap) => ({
          ...snap,
          bays: (snap.bays ?? []).map((b) =>
            b.ref_id === 'bay-1'
              ? {
                  ...b,
                  meta: {
                    ...b.meta,
                    coupler_state: 'closed',
                    coupler_auto_mode: 'szr',
                    coupler_comment: 'SZR aktywny w nocy',
                  },
                }
              : b,
          ),
        }),
        ['bay-1'],
      );
    });

    const bay = result.current.snapshot?.bays?.find((b) => b.ref_id === 'bay-1');
    expect(bay?.meta).toMatchObject({
      coupler_state: 'closed',
      coupler_auto_mode: 'szr',
      coupler_comment: 'SZR aktywny w nocy',
    });
    /* Pozostałe pola bay zachowane */
    expect(bay?.bay_number).toBe('10');
    expect(bay?.bay_role).toBe('OUT');
  });

  it('patchSnapshot wielokrotne wywołanie kumuluje zmiany', () => {
    useSnapshotStore.setState({ snapshot: makeSnapshot() });
    const { result } = renderHook(() => useSnapshotStore());

    act(() => {
      result.current.patchSnapshot(
        (snap) => ({
          ...snap,
          bays: (snap.bays ?? []).map((b) =>
            b.ref_id === 'bay-1' ? { ...b, bay_number: '99' } : b,
          ),
        }),
        ['bay-1'],
      );
    });

    act(() => {
      result.current.patchSnapshot(
        (snap) => ({
          ...snap,
          bays: (snap.bays ?? []).map((b) =>
            b.ref_id === 'bay-1' ? { ...b, feeder_short_name: 'NEW2' } : b,
          ),
        }),
        ['bay-1'],
      );
    });

    const bay = result.current.snapshot?.bays?.find((b) => b.ref_id === 'bay-1');
    expect(bay?.bay_number).toBe('99'); // z pierwszego patcha
    expect(bay?.feeder_short_name).toBe('NEW2'); // z drugiego patcha
  });

  it('patchSnapshot zachowuje immutability — original snapshot ref nie zmienia się', () => {
    const original = makeSnapshot();
    useSnapshotStore.setState({ snapshot: original });
    const { result } = renderHook(() => useSnapshotStore());

    act(() => {
      result.current.patchSnapshot(
        (snap) => ({
          ...snap,
          bays: (snap.bays ?? []).map((b) =>
            b.ref_id === 'bay-1' ? { ...b, bay_number: '99' } : b,
          ),
        }),
        ['bay-1'],
      );
    });

    /* Original (przed mutation) ma stary bay_number */
    expect(original.bays?.[0].bay_number).toBe('10');
    /* Snapshot w storze ma nowy */
    expect(result.current.snapshot?.bays?.[0].bay_number).toBe('99');
    /* Reference inny */
    expect(result.current.snapshot).not.toBe(original);
  });
});
