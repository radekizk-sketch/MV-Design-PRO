import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useAppStateStore, useCanCalculate } from '../store';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { makeCalculationReadySnapshot } from '../../../test/enmCalculationSnapshot';

describe('useCanCalculate — bramka gotowości z backendu', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
  });

  it('blokuje obliczenia, gdy readiness.ready = false', () => {
    useAppStateStore.getState().setActiveCase('case-1', 'Zakres 1', 'ShortCircuitCase', 'OUTDATED');
    useSnapshotStore.setState({
      snapshot: makeCalculationReadySnapshot(),
      readiness: {
        ready: false,
        blockers: [
          {
            code: 'catalog.sn_line.missing',
            message_pl: 'Brak katalogu dla linii SN',
            element_ref: 'line_1',
            severity: 'BLOCKER',
          },
        ],
        warnings: [],
      },
    });

    const { result } = renderHook(() => useCanCalculate());

    expect(result.current.allowed).toBe(false);
    expect(result.current.reason).toBe('Brak katalogu dla linii SN');
  });

  it('odblokowuje obliczenia, gdy readiness.ready = true i case aktywny', () => {
    useAppStateStore.getState().setActiveCase('case-1', 'Zakres 1', 'ShortCircuitCase', 'OUTDATED');
    useSnapshotStore.setState({
      snapshot: makeCalculationReadySnapshot(),
      readiness: {
        ready: true,
        blockers: [],
        warnings: [],
      },
    });

    const { result } = renderHook(() => useCanCalculate());

    expect(result.current.allowed).toBe(true);
    expect(result.current.reason).toBeNull();
  });

  it('pozwala uruchomić solver z widoku analiz, gdy układ jest przygotowany', () => {
    useAppStateStore.getState().setActiveCase('case-1', 'Zakres 1', 'ShortCircuitCase', 'OUTDATED');
    useAppStateStore.getState().setActiveMode('RESULT_VIEW');
    useSnapshotStore.setState({
      snapshot: makeCalculationReadySnapshot(),
      readiness: {
        ready: true,
        blockers: [],
        warnings: [],
      },
    });

    const { result } = renderHook(() => useCanCalculate());

    expect(result.current.allowed).toBe(true);
    expect(result.current.reason).toBeNull();
  });

  it('gotowość migawki jest JEDYNYM źródłem bramki — zmiana źródła przełącza bramkę', () => {
    // Intencja zachowana z wersji sprzed KD-1 („readiness ze snapshotu nadrzędne
    // wobec przestarzałego live-store"): po usunięciu drugiego źródła
    // (`readinessLiveStore` — nikt nigdy nie wołał jego `refresh`) bramka ma
    // reagować WYŁĄCZNIE na `useSnapshotStore.readiness`, i to natychmiast.
    useAppStateStore.getState().setActiveCase('case-1', 'Zakres 1', 'ShortCircuitCase', 'OUTDATED');
    useSnapshotStore.setState({
      snapshot: makeCalculationReadySnapshot(),
      readiness: {
        ready: false,
        blockers: [
          {
            code: 'pv_bess.transformer_required',
            message_pl: 'Układ PV wymaga transformatora',
            element_ref: 'pv/converter',
            severity: 'BLOCKER',
          },
        ],
        warnings: [],
      },
    });

    const { result, rerender } = renderHook(() => useCanCalculate());

    expect(result.current.allowed).toBe(false);
    expect(result.current.reason).toBe('Układ PV wymaga transformatora');

    act(() => {
      useSnapshotStore.setState({
        readiness: { ready: true, blockers: [], warnings: [] },
      });
    });
    rerender();

    expect(result.current.allowed).toBe(true);
    expect(result.current.reason).toBeNull();
  });
});
