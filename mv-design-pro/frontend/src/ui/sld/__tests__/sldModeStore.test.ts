/**
 * TESTY MAGAZYNU TRYBU SLD — Testy magazynu trybu SLD (PR-SLD-06)
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § C.2: Tryb RESULT_VIEW
 * - ui_canonical_parity.md § A.3: URL odzwierciedla stan nawigacji
 *
 * ZAKRES TESTOW:
 * - Przelaczanie trybow EDYCJA/WYNIKI
 * - Automatyczne wlaczanie warstwy diagnostycznej w trybie WYNIKI
 * - Utrwalanie stanu w adresie URL
 * - Pochodne funkcje pomocnicze
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// Mock URL state functions before importing the store
vi.mock('../../navigation/urlState', () => ({
  readSldModeFromUrl: () => ({
    mode: 'EDYCJA' as const,
    diagnosticLayerVisible: false,
    protectionLayerVisible: false,
  }),
  updateUrlWithSldMode: vi.fn(),
}));

// Import after mocking
import {
  useSldModeStore,
  useSldMode,
  useIsResultsMode,
  useIsEditMode,
  useDiagnosticLayerVisible,
  useSldModeLabel,
  SLD_MODE_LABELS_PL,
} from '../sldModeStore';
import { updateUrlWithSldMode } from '../../navigation/urlState';

// Get the mocked function for assertions
const mockUpdateUrlWithSldMode = vi.mocked(updateUrlWithSldMode);

// =============================================================================
// SETUP
// =============================================================================

describe('sldModeStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    const store = useSldModeStore.getState();
    store.resetMode();
    vi.clearAllMocks();
  });

  // =============================================================================
  // BASIC MODE SWITCHING
  // =============================================================================

  describe('Mode Switching', () => {
    it('should start in EDYCJA mode by default', () => {
      const { result } = renderHook(() => useSldModeStore((state) => state.mode));
      expect(result.current).toBe('EDYCJA');
    });

    it('should switch to WYNIKI mode', () => {
      const { result } = renderHook(() => useSldModeStore());

      act(() => {
        result.current.setMode('WYNIKI');
      });

      expect(result.current.mode).toBe('WYNIKI');
    });

    it('should switch back to EDYCJA mode', () => {
      const { result } = renderHook(() => useSldModeStore());

      act(() => {
        result.current.setMode('WYNIKI');
        result.current.setMode('EDYCJA');
      });

      expect(result.current.mode).toBe('EDYCJA');
    });

    it('should provide switchToEditMode helper', () => {
      const { result } = renderHook(() => useSldModeStore());

      act(() => {
        result.current.setMode('WYNIKI');
        result.current.switchToEditMode();
      });

      expect(result.current.mode).toBe('EDYCJA');
    });

    it('should provide switchToResultsMode helper', () => {
      const { result } = renderHook(() => useSldModeStore());

      act(() => {
        result.current.switchToResultsMode();
      });

      expect(result.current.mode).toBe('WYNIKI');
    });
  });

  // =============================================================================
  // DIAGNOSTIC LAYER VISIBILITY
  // =============================================================================

  describe('Diagnostic Layer Visibility', () => {
    it('should start with diagnostic layer hidden', () => {
      const { result } = renderHook(() => useSldModeStore((state) => state.diagnosticLayerVisible));
      expect(result.current).toBe(false);
    });

    it('should auto-enable diagnostic layer when switching to WYNIKI mode', () => {
      const { result } = renderHook(() => useSldModeStore());

      act(() => {
        result.current.setMode('WYNIKI');
      });

      expect(result.current.diagnosticLayerVisible).toBe(true);
    });

    it('should toggle diagnostic layer visibility', () => {
      const { result } = renderHook(() => useSldModeStore());

      act(() => {
        result.current.setMode('WYNIKI');
        result.current.toggleDiagnosticLayer(false);
      });

      expect(result.current.diagnosticLayerVisible).toBe(false);

      act(() => {
        result.current.toggleDiagnosticLayer(true);
      });

      expect(result.current.diagnosticLayerVisible).toBe(true);
    });

    it('should toggle without argument to flip value', () => {
      const { result } = renderHook(() => useSldModeStore());

      act(() => {
        result.current.setMode('WYNIKI'); // enables layer
        result.current.toggleDiagnosticLayer(); // should disable
      });

      expect(result.current.diagnosticLayerVisible).toBe(false);

      act(() => {
        result.current.toggleDiagnosticLayer(); // should enable
      });

      expect(result.current.diagnosticLayerVisible).toBe(true);
    });
  });

  // =============================================================================
  // MODE CHECK HELPERS
  // =============================================================================

  describe('Mode Check Helpers', () => {
    it('should return true for isResultsMode when in WYNIKI', () => {
      const { result } = renderHook(() => useSldModeStore());

      act(() => {
        result.current.setMode('WYNIKI');
      });

      expect(result.current.isResultsMode()).toBe(true);
    });

    it('should return false for isResultsMode when in EDYCJA', () => {
      const { result } = renderHook(() => useSldModeStore());

      expect(result.current.isResultsMode()).toBe(false);
    });

    it('should return true for isEditMode when in EDYCJA', () => {
      const { result } = renderHook(() => useSldModeStore());

      expect(result.current.isEditMode()).toBe(true);
    });

    it('should return false for isEditMode when in WYNIKI', () => {
      const { result } = renderHook(() => useSldModeStore());

      act(() => {
        result.current.setMode('WYNIKI');
      });

      expect(result.current.isEditMode()).toBe(false);
    });
  });

  // =============================================================================
  // URL SYNCHRONIZATION
  // =============================================================================

  describe('URL Synchronization', () => {
    it('should call updateUrlWithSldMode when mode changes', () => {
      const { result } = renderHook(() => useSldModeStore());

      act(() => {
        result.current.setMode('WYNIKI');
      });

      expect(mockUpdateUrlWithSldMode).toHaveBeenCalledWith({
        mode: 'WYNIKI',
        diagnosticLayerVisible: true,
        protectionLayerVisible: false,
      });
    });

    it('should call updateUrlWithSldMode when diagnostic layer toggles', () => {
      const { result } = renderHook(() => useSldModeStore());

      act(() => {
        result.current.setMode('WYNIKI');
      });

      mockUpdateUrlWithSldMode.mockClear();

      act(() => {
        result.current.toggleDiagnosticLayer(false);
      });

      expect(mockUpdateUrlWithSldMode).toHaveBeenCalledWith({
        mode: 'WYNIKI',
        diagnosticLayerVisible: false,
        protectionLayerVisible: false,
      });
    });

    it('should call updateUrlWithSldMode on reset', () => {
      const { result } = renderHook(() => useSldModeStore());

      act(() => {
        result.current.setMode('WYNIKI');
      });

      mockUpdateUrlWithSldMode.mockClear();

      act(() => {
        result.current.resetMode();
      });

      expect(mockUpdateUrlWithSldMode).toHaveBeenCalledWith({
        mode: 'EDYCJA',
        diagnosticLayerVisible: false,
        protectionLayerVisible: false,
      });
    });
  });

  // =============================================================================
  // RESET
  // =============================================================================

  describe('Reset', () => {
    it('should reset to default state', () => {
      const { result } = renderHook(() => useSldModeStore());

      act(() => {
        result.current.setMode('WYNIKI');
        result.current.toggleDiagnosticLayer(true);
        result.current.resetMode();
      });

      expect(result.current.mode).toBe('EDYCJA');
      expect(result.current.diagnosticLayerVisible).toBe(false);
    });
  });
});

// =============================================================================
// TESTY POCHODNYCH FUNKCJI POMOCNICZYCH
// =============================================================================

describe('Pochodne funkcje pomocnicze', () => {
  beforeEach(() => {
    const store = useSldModeStore.getState();
    store.resetMode();
  });

  describe('useSldMode', () => {
    it('should return current mode', () => {
      const { result } = renderHook(() => useSldMode());
      expect(result.current).toBe('EDYCJA');
    });
  });

  describe('useIsResultsMode', () => {
    it('should return true when in WYNIKI mode', () => {
      const store = useSldModeStore.getState();

      act(() => {
        store.setMode('WYNIKI');
      });

      const { result } = renderHook(() => useIsResultsMode());
      expect(result.current).toBe(true);
    });

    it('should return false when in EDYCJA mode', () => {
      const { result } = renderHook(() => useIsResultsMode());
      expect(result.current).toBe(false);
    });
  });

  describe('useIsEditMode', () => {
    it('should return true when in EDYCJA mode', () => {
      const { result } = renderHook(() => useIsEditMode());
      expect(result.current).toBe(true);
    });

    it('should return false when in WYNIKI mode', () => {
      const store = useSldModeStore.getState();

      act(() => {
        store.setMode('WYNIKI');
      });

      const { result } = renderHook(() => useIsEditMode());
      expect(result.current).toBe(false);
    });
  });

  describe('useDiagnosticLayerVisible', () => {
    it('should return diagnostic layer visibility', () => {
      const store = useSldModeStore.getState();

      act(() => {
        store.setMode('WYNIKI');
      });

      const { result } = renderHook(() => useDiagnosticLayerVisible());
      expect(result.current).toBe(true);
    });
  });

  describe('useSldModeLabel', () => {
    it('should return Polish label for EDYCJA', () => {
      const { result } = renderHook(() => useSldModeLabel());
      expect(result.current).toBe('Edycja');
    });

    it('should return Polish label for WYNIKI', () => {
      const store = useSldModeStore.getState();

      act(() => {
        store.setMode('WYNIKI');
      });

      const { result } = renderHook(() => useSldModeLabel());
      expect(result.current).toBe('Wyniki');
    });
  });
});

// =============================================================================
// SLD_MODE_LABELS_PL TESTS
// =============================================================================

describe('SLD_MODE_LABELS_PL', () => {
  it('should have Polish label for EDYCJA', () => {
    expect(SLD_MODE_LABELS_PL.EDYCJA).toBe('Edycja');
  });

  it('should have Polish label for WYNIKI', () => {
    expect(SLD_MODE_LABELS_PL.WYNIKI).toBe('Wyniki');
  });
});
