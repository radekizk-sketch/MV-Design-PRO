/**
 * snapshotStore.undoSnapshot/redoSnapshot tests (R33).
 *
 * Operacyjny use case: dyspozytor klika prawym → "Otwórz okno pola" →
 * zmienia bay_number → klika Zapisz → patchSnapshot → później klika Ctrl+Z →
 * undoSnapshot przywraca poprzedni stan.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useSnapshotStore } from '../snapshotStore';
import type { EnergyNetworkModel } from '../../../types/enm';

function makeSnapshot(bayNum: string = '1'): EnergyNetworkModel {
  return {
    header: { enm_version: '1.0', name: 'Test', created_at: '2026-05-08T00:00:00Z' } as never,
    buses: [],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [
      {
        id: 'bay-1', ref_id: 'bay-1', name: 'bay-1', tags: [], meta: {},
        bay_role: 'OUT', substation_ref: 'sta-1', bus_ref: 'b1',
        equipment_refs: ['app-1'],
        bay_number: bayNum, feeder_short_name: 'PST1',
      } as never,
    ],
    junctions: [],
  } as EnergyNetworkModel;
}

describe('snapshotStore — undo/redo (R33)', () => {
  beforeEach(() => {
    useSnapshotStore.getState().reset();
    useSnapshotStore.setState({ snapshot: makeSnapshot('1') });
  });

  it('Bez patchSnapshot → canUndo=false', () => {
    const { result } = renderHook(() => useSnapshotStore());
    expect(result.current.canUndo()).toBe(false);
    expect(result.current.canRedo()).toBe(false);
  });

  it('Po patchSnapshot → canUndo=true, undoSnapshot przywraca poprzedni stan', () => {
    const { result } = renderHook(() => useSnapshotStore());
    /* Initial: bay_number='1' */
    expect(result.current.snapshot?.bays?.[0].bay_number).toBe('1');

    /* Patch: bay_number='99' */
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
    expect(result.current.snapshot?.bays?.[0].bay_number).toBe('99');
    expect(result.current.canUndo()).toBe(true);

    /* Undo: powinien przywrócić bay_number='1' */
    act(() => {
      result.current.undoSnapshot();
    });
    expect(result.current.snapshot?.bays?.[0].bay_number).toBe('1');
    expect(result.current.canRedo()).toBe(true);
    expect(result.current.canUndo()).toBe(false);
  });

  it('Po undo → redoSnapshot przywraca patched stan', () => {
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
      result.current.undoSnapshot();
    });
    expect(result.current.snapshot?.bays?.[0].bay_number).toBe('1');
    /* Redo */
    act(() => {
      result.current.redoSnapshot();
    });
    expect(result.current.snapshot?.bays?.[0].bay_number).toBe('99');
  });

  it('Multiple patches → undo restores krok po kroku', () => {
    const { result } = renderHook(() => useSnapshotStore());
    /* Patch 1: '1' → '50' */
    act(() => {
      result.current.patchSnapshot(
        (snap) => ({ ...snap, bays: (snap.bays ?? []).map((b) =>
          b.ref_id === 'bay-1' ? { ...b, bay_number: '50' } : b
        )}),
        ['bay-1'],
      );
    });
    /* Patch 2: '50' → '99' */
    act(() => {
      result.current.patchSnapshot(
        (snap) => ({ ...snap, bays: (snap.bays ?? []).map((b) =>
          b.ref_id === 'bay-1' ? { ...b, bay_number: '99' } : b
        )}),
        ['bay-1'],
      );
    });
    expect(result.current.snapshot?.bays?.[0].bay_number).toBe('99');
    /* Undo: '99' → '50' */
    act(() => { result.current.undoSnapshot(); });
    expect(result.current.snapshot?.bays?.[0].bay_number).toBe('50');
    /* Undo: '50' → '1' */
    act(() => { result.current.undoSnapshot(); });
    expect(result.current.snapshot?.bays?.[0].bay_number).toBe('1');
    /* Brak więcej undos */
    expect(result.current.canUndo()).toBe(false);
  });

  it('patchSnapshot po undo → czyści redo stack', () => {
    const { result } = renderHook(() => useSnapshotStore());
    act(() => {
      result.current.patchSnapshot((snap) => ({ ...snap, bays: (snap.bays ?? []).map((b) =>
        b.ref_id === 'bay-1' ? { ...b, bay_number: '50' } : b) }), ['bay-1']);
    });
    act(() => { result.current.undoSnapshot(); });
    expect(result.current.canRedo()).toBe(true);

    /* Nowy patch po undo → redo stack wyczyszczony */
    act(() => {
      result.current.patchSnapshot((snap) => ({ ...snap, bays: (snap.bays ?? []).map((b) =>
        b.ref_id === 'bay-1' ? { ...b, bay_number: '88' } : b) }), ['bay-1']);
    });
    expect(result.current.canRedo()).toBe(false);
    expect(result.current.snapshot?.bays?.[0].bay_number).toBe('88');
  });

  it('reset() czyści undo/redo stacks', () => {
    const { result } = renderHook(() => useSnapshotStore());
    act(() => {
      result.current.patchSnapshot((snap) => ({ ...snap }), ['bay-1']);
    });
    expect(result.current.canUndo()).toBe(true);

    act(() => { result.current.reset(); });
    expect(result.current.canUndo()).toBe(false);
    expect(result.current.canRedo()).toBe(false);
  });

  it('undoSnapshot z empty stack → return false (no-op)', () => {
    const { result } = renderHook(() => useSnapshotStore());
    let returnValue = false;
    act(() => {
      returnValue = result.current.undoSnapshot();
    });
    expect(returnValue).toBe(false);
  });

  it('Limit MAX_UNDO=20 — 25 patchów, undo działa tylko 20 razy', () => {
    const { result } = renderHook(() => useSnapshotStore());
    for (let i = 0; i < 25; i++) {
      const target = String(i + 100);
      act(() => {
        result.current.patchSnapshot((snap) => ({ ...snap, bays: (snap.bays ?? []).map((b) =>
          b.ref_id === 'bay-1' ? { ...b, bay_number: target } : b) }), ['bay-1']);
      });
    }
    /* Po 25 patchów stack ma max 20. Undo można wykonać 20 razy */
    let undoCount = 0;
    while (result.current.canUndo()) {
      act(() => { result.current.undoSnapshot(); });
      undoCount++;
      if (undoCount > 30) break; // safety
    }
    expect(undoCount).toBe(20);
  });
});
