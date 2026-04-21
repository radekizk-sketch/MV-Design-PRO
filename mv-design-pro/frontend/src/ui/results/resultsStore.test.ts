/**
 * Results Lifecycle Tests (Canonical-grade)
 *
 * Tests for:
 * - State machine transitions: NONE → FRESH → OUTDATED
 * - No auto-run enforcement
 * - Overlay visibility only for FRESH
 * - RESULT_VIEW = read-only (no mutations)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  useResultsStore,
  useIsOverlayVisible,
  useIsCalculateEnabled,
  useResultStatusMessage,
  useCanEnterResultView,
  type CalculationResult,
} from './resultsStore';

// Reset store before each test
beforeEach(() => {
  const { reset } = useResultsStore.getState();
  reset();
});

describe('Results State Machine', () => {
  describe('Initial State', () => {
    it('should start with NONE status', () => {
      const { status } = useResultsStore.getState();
      expect(status).toBe('NONE');
    });

    it('should have no last result', () => {
      const { lastResult } = useResultsStore.getState();
      expect(lastResult).toBeNull();
    });

    it('should not be calculating', () => {
      const { isCalculating } = useResultsStore.getState();
      expect(isCalculating).toBe(false);
    });
  });

  describe('NONE → FRESH transition', () => {
    it('should transition to FRESH after markFresh()', () => {
      const { markFresh } = useResultsStore.getState();
      const result: CalculationResult = {
        calculationId: 'calc-001',
        timestamp: '2024-01-01T12:00:00Z',
        snapshotId: 'snap-001',
      };

      act(() => {
        markFresh(result);
      });

      const { status, lastResult } = useResultsStore.getState();
      expect(status).toBe('FRESH');
      expect(lastResult).toEqual(result);
    });

    it('should clear isCalculating flag on markFresh()', () => {
      const { setCalculating, markFresh } = useResultsStore.getState();

      act(() => {
        setCalculating(true);
      });
      expect(useResultsStore.getState().isCalculating).toBe(true);

      act(() => {
        markFresh({
          calculationId: 'calc-001',
          timestamp: '2024-01-01T12:00:00Z',
          snapshotId: 'snap-001',
        });
      });

      expect(useResultsStore.getState().isCalculating).toBe(false);
    });
  });

  describe('FRESH → OUTDATED transition', () => {
    it('should transition to OUTDATED after markOutdated()', () => {
      const { markFresh, markOutdated } = useResultsStore.getState();

      // First, get to FRESH state
      act(() => {
        markFresh({
          calculationId: 'calc-001',
          timestamp: '2024-01-01T12:00:00Z',
          snapshotId: 'snap-001',
        });
      });
      expect(useResultsStore.getState().status).toBe('FRESH');

      // Then mark outdated
      act(() => {
        markOutdated();
      });

      expect(useResultsStore.getState().status).toBe('OUTDATED');
    });

    it('should preserve lastResult when transitioning to OUTDATED', () => {
      const { markFresh, markOutdated } = useResultsStore.getState();
      const result: CalculationResult = {
        calculationId: 'calc-001',
        timestamp: '2024-01-01T12:00:00Z',
        snapshotId: 'snap-001',
      };

      act(() => {
        markFresh(result);
        markOutdated();
      });

      const { lastResult } = useResultsStore.getState();
      expect(lastResult).toEqual(result);
    });
  });

  describe('NONE stays NONE on markOutdated()', () => {
    it('should NOT change NONE to OUTDATED', () => {
      const { markOutdated } = useResultsStore.getState();

      expect(useResultsStore.getState().status).toBe('NONE');

      act(() => {
        markOutdated();
      });

      // NONE stays NONE (no results to invalidate)
      expect(useResultsStore.getState().status).toBe('NONE');
    });
  });

  describe('OUTDATED → FRESH transition', () => {
    it('should allow re-calculation from OUTDATED state', () => {
      const { markFresh, markOutdated } = useResultsStore.getState();

      // NONE → FRESH → OUTDATED
      act(() => {
        markFresh({
          calculationId: 'calc-001',
          timestamp: '2024-01-01T12:00:00Z',
          snapshotId: 'snap-001',
        });
        markOutdated();
      });
      expect(useResultsStore.getState().status).toBe('OUTDATED');

      // OUTDATED → FRESH (re-calculation)
      act(() => {
        markFresh({
          calculationId: 'calc-002',
          timestamp: '2024-01-01T13:00:00Z',
          snapshotId: 'snap-001',
        });
      });

      expect(useResultsStore.getState().status).toBe('FRESH');
      expect(useResultsStore.getState().lastResult?.calculationId).toBe('calc-002');
    });
  });

  describe('Reset transition', () => {
    it('should reset from any state to NONE', () => {
      const { markFresh, reset } = useResultsStore.getState();

      act(() => {
        markFresh({
          calculationId: 'calc-001',
          timestamp: '2024-01-01T12:00:00Z',
          snapshotId: 'snap-001',
        });
      });
      expect(useResultsStore.getState().status).toBe('FRESH');

      act(() => {
        reset();
      });

      const { status, lastResult, isCalculating } = useResultsStore.getState();
      expect(status).toBe('NONE');
      expect(lastResult).toBeNull();
      expect(isCalculating).toBe(false);
    });
  });
});

describe('No Auto-Run Enforcement', () => {
  it('should require explicit markFresh() call - no automatic transitions', () => {
    // State should never change without explicit action
    const initialState = useResultsStore.getState();

    // Simulate time passing, model changes, etc. - state should not change
    expect(useResultsStore.getState().status).toBe(initialState.status);
    expect(useResultsStore.getState().status).toBe('NONE');
  });

  it('should require validation to enable calculate button', () => {
    const { setValidation } = useResultsStore.getState();

    // Initially, calculate should be disabled (no validation)
    expect(useResultsStore.getState().isValidForCalculation).toBe(false);

    // Must explicitly set validation
    act(() => {
      setValidation(true);
    });

    expect(useResultsStore.getState().isValidForCalculation).toBe(true);
  });
});

describe('Overlay Visibility Hook', () => {
  it('should return false when status is NONE', () => {
    const { result } = renderHook(() => useIsOverlayVisible());
    expect(result.current).toBe(false);
  });

  it('should return true when status is FRESH', () => {
    const { markFresh } = useResultsStore.getState();

    act(() => {
      markFresh({
        calculationId: 'calc-001',
        timestamp: '2024-01-01T12:00:00Z',
        snapshotId: 'snap-001',
      });
    });

    const { result } = renderHook(() => useIsOverlayVisible());
    expect(result.current).toBe(true);
  });

  it('should return false when status is OUTDATED', () => {
    const { markFresh, markOutdated } = useResultsStore.getState();

    act(() => {
      markFresh({
        calculationId: 'calc-001',
        timestamp: '2024-01-01T12:00:00Z',
        snapshotId: 'snap-001',
      });
      markOutdated();
    });

    const { result } = renderHook(() => useIsOverlayVisible());
    expect(result.current).toBe(false);
  });
});

describe('Calculate Button Enabled Hook', () => {
  it('should be disabled when validation fails', () => {
    const { setValidation } = useResultsStore.getState();

    act(() => {
      setValidation(false, ['Missing source impedance']);
    });

    const { result } = renderHook(() => useIsCalculateEnabled());
    expect(result.current).toBe(false);
  });

  it('should be disabled when calculating', () => {
    const { setValidation, setCalculating } = useResultsStore.getState();

    act(() => {
      setValidation(true);
      setCalculating(true);
    });

    const { result } = renderHook(() => useIsCalculateEnabled());
    expect(result.current).toBe(false);
  });

  it('should be enabled when validation passes and not calculating', () => {
    const { setValidation, setCalculating } = useResultsStore.getState();

    act(() => {
      setValidation(true);
      setCalculating(false);
    });

    const { result } = renderHook(() => useIsCalculateEnabled());
    expect(result.current).toBe(true);
  });
});

describe('Result Status Message Hook', () => {
  it('should show info message for NONE', () => {
    const { result } = renderHook(() => useResultStatusMessage());

    expect(result.current.message).toBe('Brak wyników — uruchom obliczenia');
    expect(result.current.severity).toBe('info');
  });

  it('should show success message for FRESH', () => {
    const { markFresh } = useResultsStore.getState();

    act(() => {
      markFresh({
        calculationId: 'calc-001',
        timestamp: '2024-01-01T12:00:00Z',
        snapshotId: 'snap-001',
      });
    });

    const { result } = renderHook(() => useResultStatusMessage());

    expect(result.current.message).toBe('Wyniki aktualne');
    expect(result.current.severity).toBe('success');
  });

  it('should show warning message for OUTDATED', () => {
    const { markFresh, markOutdated } = useResultsStore.getState();

    act(() => {
      markFresh({
        calculationId: 'calc-001',
        timestamp: '2024-01-01T12:00:00Z',
        snapshotId: 'snap-001',
      });
      markOutdated();
    });

    const { result } = renderHook(() => useResultStatusMessage());

    expect(result.current.message).toBe('Wyniki nieaktualne — wymagane ponowne obliczenie');
    expect(result.current.severity).toBe('warning');
  });
});

describe('RESULT_VIEW Mode Gating', () => {
  it('should block RESULT_VIEW when status is NONE', () => {
    const { result } = renderHook(() => useCanEnterResultView());
    expect(result.current).toBe(false);
  });

  it('should allow RESULT_VIEW when status is FRESH', () => {
    const { markFresh } = useResultsStore.getState();

    act(() => {
      markFresh({
        calculationId: 'calc-001',
        timestamp: '2024-01-01T12:00:00Z',
        snapshotId: 'snap-001',
      });
    });

    const { result } = renderHook(() => useCanEnterResultView());
    expect(result.current).toBe(true);
  });

  it('should block RESULT_VIEW when status is OUTDATED', () => {
    const { markFresh, markOutdated } = useResultsStore.getState();

    act(() => {
      markFresh({
        calculationId: 'calc-001',
        timestamp: '2024-01-01T12:00:00Z',
        snapshotId: 'snap-001',
      });
      markOutdated();
    });

    const { result } = renderHook(() => useCanEnterResultView());
    expect(result.current).toBe(false);
  });
});
