import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useAppStateStore, useCanCalculate } from '../store';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { makeCalculationReadySnapshot } from '../../../test/enmCalculationSnapshot';

describe('useCanCalculate — bramka gotowości z backendu', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
  });

  it('blokuje obliczenia, gdy readiness.ready = false', () => {
    useAppStateStore.getState().setActiveCase('case-1', 'Przypadek 1', 'ShortCircuitCase', 'OUTDATED');
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
    useAppStateStore.getState().setActiveCase('case-1', 'Przypadek 1', 'ShortCircuitCase', 'OUTDATED');
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
});
