/**
 * P20b — Power Flow Results Inspector Tests
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md: RESULT_VIEW mode is READ-ONLY
 * - ui_canonical_parity.md: Deterministic sorting
 * - sld_rules.md: Overlay as separate layer
 *
 * TEST COVERAGE:
 * - Store initial state
 * - Tab selection works
 * - Search/filter functionality
 * - Overlay toggle
 * - Polish labels present
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePowerFlowResultsStore } from '../store';
import type { PowerFlowResultsTab } from '../types';
import {
  POWER_FLOW_TAB_LABELS,
  RESULT_STATUS_LABELS,
  RESULT_STATUS_SEVERITY,
  CONVERGENCE_LABELS,
} from '../types';

// =============================================================================
// Store Reset Helper
// =============================================================================

function resetStore() {
  usePowerFlowResultsStore.getState().reset();
}

// =============================================================================
// Power Flow Results Store Tests
// =============================================================================

describe('Power Flow Results Inspector Store', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('Initial State', () => {
    it('should start with no selected run', () => {
      const { selectedRunId } = usePowerFlowResultsStore.getState();
      expect(selectedRunId).toBeNull();
    });

    it('should start with BUSES as default tab', () => {
      const { activeTab } = usePowerFlowResultsStore.getState();
      expect(activeTab).toBe('BUSES');
    });

    it('should start with overlay visible', () => {
      const { overlayVisible } = usePowerFlowResultsStore.getState();
      expect(overlayVisible).toBe(true);
    });

    it('should start with no cached results', () => {
      const state = usePowerFlowResultsStore.getState();
      expect(state.results).toBeNull();
      expect(state.trace).toBeNull();
      expect(state.runHeader).toBeNull();
    });

    it('should start with empty search query', () => {
      const { searchQuery } = usePowerFlowResultsStore.getState();
      expect(searchQuery).toBe('');
    });

    it('should start with no error', () => {
      const { error } = usePowerFlowResultsStore.getState();
      expect(error).toBeNull();
    });
  });

  describe('Tab Selection', () => {
    it('should change active tab', () => {
      const { setActiveTab } = usePowerFlowResultsStore.getState();

      act(() => {
        setActiveTab('BRANCHES');
      });

      const { activeTab } = usePowerFlowResultsStore.getState();
      expect(activeTab).toBe('BRANCHES');
    });

    it('should support all tab types', () => {
      const tabs: PowerFlowResultsTab[] = ['BUSES', 'BRANCHES', 'SUMMARY', 'TRACE'];
      const { setActiveTab } = usePowerFlowResultsStore.getState();

      for (const tab of tabs) {
        act(() => {
          setActiveTab(tab);
        });
        const { activeTab } = usePowerFlowResultsStore.getState();
        expect(activeTab).toBe(tab);
      }
    });
  });

  describe('Search/Filter', () => {
    it('should update search query', () => {
      const { setSearchQuery } = usePowerFlowResultsStore.getState();

      act(() => {
        setSearchQuery('test-bus');
      });

      const { searchQuery } = usePowerFlowResultsStore.getState();
      expect(searchQuery).toBe('test-bus');
    });

    it('should clear search query', () => {
      const { setSearchQuery } = usePowerFlowResultsStore.getState();

      act(() => {
        setSearchQuery('test');
      });
      act(() => {
        setSearchQuery('');
      });

      const { searchQuery } = usePowerFlowResultsStore.getState();
      expect(searchQuery).toBe('');
    });
  });

  describe('Overlay Toggle', () => {
    it('should toggle overlay visibility', () => {
      const { toggleOverlay } = usePowerFlowResultsStore.getState();

      // Initial: visible
      expect(usePowerFlowResultsStore.getState().overlayVisible).toBe(true);

      act(() => {
        toggleOverlay();
      });

      expect(usePowerFlowResultsStore.getState().overlayVisible).toBe(false);

      act(() => {
        toggleOverlay();
      });

      expect(usePowerFlowResultsStore.getState().overlayVisible).toBe(true);
    });

    it('should set overlay visibility explicitly', () => {
      const { toggleOverlay } = usePowerFlowResultsStore.getState();

      act(() => {
        toggleOverlay(false);
      });

      expect(usePowerFlowResultsStore.getState().overlayVisible).toBe(false);

      act(() => {
        toggleOverlay(true);
      });

      expect(usePowerFlowResultsStore.getState().overlayVisible).toBe(true);
    });
  });

  describe('Store Reset', () => {
    it('should reset to initial state', () => {
      const { setActiveTab, setSearchQuery, toggleOverlay, reset } =
        usePowerFlowResultsStore.getState();

      // Change state
      act(() => {
        setActiveTab('TRACE');
        setSearchQuery('test');
        toggleOverlay(false);
      });

      // Verify changes
      expect(usePowerFlowResultsStore.getState().activeTab).toBe('TRACE');
      expect(usePowerFlowResultsStore.getState().searchQuery).toBe('test');
      expect(usePowerFlowResultsStore.getState().overlayVisible).toBe(false);

      // Reset
      act(() => {
        reset();
      });

      // Verify reset
      const state = usePowerFlowResultsStore.getState();
      expect(state.activeTab).toBe('BUSES');
      expect(state.searchQuery).toBe('');
      expect(state.overlayVisible).toBe(true);
      expect(state.selectedRunId).toBeNull();
    });
  });
});

// =============================================================================
// Polish Labels Tests
// =============================================================================

describe('Power Flow Results Polish Labels', () => {
  it('should have Polish tab labels', () => {
    expect(POWER_FLOW_TAB_LABELS.BUSES).toBe('Szyny');
    expect(POWER_FLOW_TAB_LABELS.BRANCHES).toBe('Gałęzie');
    expect(POWER_FLOW_TAB_LABELS.SUMMARY).toBe('Podsumowanie');
    expect(POWER_FLOW_TAB_LABELS.TRACE).toBe('Ślad obliczeń');
    expect(POWER_FLOW_TAB_LABELS.INTERPRETATION).toBe('Interpretacja');
  });

  it('should have Polish result status labels', () => {
    expect(RESULT_STATUS_LABELS.NONE).toBe('Wyniki nieuruchomione');
    expect(RESULT_STATUS_LABELS.FRESH).toBe('Wyniki aktualne');
    expect(RESULT_STATUS_LABELS.VALID).toBe('Wyniki aktualne');
    expect(RESULT_STATUS_LABELS.OUTDATED).toBe('Wyniki nieaktualne');
  });

  it('should have correct severity mapping', () => {
    expect(RESULT_STATUS_SEVERITY.NONE).toBe('info');
    expect(RESULT_STATUS_SEVERITY.FRESH).toBe('success');
    expect(RESULT_STATUS_SEVERITY.VALID).toBe('success');
    expect(RESULT_STATUS_SEVERITY.OUTDATED).toBe('warning');
  });

  it('should have Polish convergence labels', () => {
    expect(CONVERGENCE_LABELS.true).toBe('Zbieżny');
    expect(CONVERGENCE_LABELS.false).toBe('Niezbieżny');
  });
});

// =============================================================================
// Determinism Tests
// =============================================================================

describe('Power Flow Results Determinism', () => {
  it('should have deterministic tab order', () => {
    const tabs = Object.keys(POWER_FLOW_TAB_LABELS);
    expect(tabs).toEqual(['BUSES', 'BRANCHES', 'SUMMARY', 'TRACE', 'INTERPRETATION']);
  });
});
