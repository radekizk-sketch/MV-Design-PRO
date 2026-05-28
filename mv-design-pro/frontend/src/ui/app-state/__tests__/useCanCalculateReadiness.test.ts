import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useAppStateStore, useCanCalculate } from '../store';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useReadinessLiveStore } from '../../engineering-readiness/readinessLiveStore';
import { makeCalculationReadySnapshot } from '../../../test/enmCalculationSnapshot';

describe('useCanCalculate — bramka gotowości z backendu', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useReadinessLiveStore.getState().clear();
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

  it('traktuje readiness ze snapshotu jako nadrzędne wobec przestarzałego live-store', () => {
    useAppStateStore.getState().setActiveCase('case-1', 'Zakres 1', 'ShortCircuitCase', 'OUTDATED');
    useSnapshotStore.setState({
      snapshot: makeCalculationReadySnapshot(),
      readiness: {
        ready: true,
        blockers: [],
        warnings: [],
      },
    });
    useReadinessLiveStore.setState({
      ready: false,
      status: 'FAIL',
      issues: [
        {
          code: 'pv_bess.transformer_required',
          severity: 'BLOCKER',
          message_pl: 'Stary komunikat live-store',
          element_ref: 'pv/stale/converter',
          element_refs: ['pv/stale/converter'],
          wizard_step_hint: null,
          suggested_fix: null,
        },
      ],
      bySeverity: { BLOCKER: 1, IMPORTANT: 0, INFO: 0 },
    });

    const { result } = renderHook(() => useCanCalculate());

    expect(result.current.allowed).toBe(true);
    expect(result.current.reason).toBeNull();
  });
});
