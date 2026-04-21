/**
 * SLD Mode Store (Zustand)
 *
 * PR-SLD-06: Warstwa diagnostyczna wynikow na schemacie
 * PR-SLD-09: Widok zabezpieczeniowy (nastawy i kryteria)
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § B: Results as Overlay (never modifies model)
 * - sld_rules.md § C.2: RESULT_VIEW mode
 * - ui_canonical_parity.md § A.3: URL reflects navigation state
 * - 100% POLISH UI
 *
 * Store dla trybu SLD:
 * - EDYCJA: pelna funkcjonalnosc edycji
 * - WYNIKI: tylko odczyt, warstwa diagnostyczna aktywna
 * - ZABEZPIECZENIA: tylko odczyt, warstwa nastaw zabezpieczen aktywna
 *
 * RULES:
 * - Tryb WYNIKI = 100% read-only
 * - Tryb ZABEZPIECZENIA = 100% read-only
 * - Warstwa diagnostyczna NIE zapisuje sie do modelu
 * - Brak wpływu na auto-layout ani routing
 */

import { create } from 'zustand';
import {
  readSldModeFromUrl,
  updateUrlWithSldMode,
} from '../navigation/urlState';

// =============================================================================
// Types
// =============================================================================

/**
 * Tryby SLD zgodne z PR-SLD-06, PR-SLD-09.
 */
export type SldMode = 'EDYCJA' | 'WYNIKI' | 'ZABEZPIECZENIA';

/**
 * Etykiety trybów po polsku.
 */
export const SLD_MODE_LABELS_PL: Record<SldMode, string> = {
  EDYCJA: 'Edycja',
  WYNIKI: 'Wyniki',
  ZABEZPIECZENIA: 'Zabezpieczenia',
};

// =============================================================================
// Store State Interface
// =============================================================================

interface SldModeStoreState {
  /** Aktualny tryb SLD */
  mode: SldMode;

  /** Czy warstwa diagnostyczna jest widoczna (tylko w trybie WYNIKI) */
  diagnosticLayerVisible: boolean;

  /** Czy warstwa zabezpieczen jest widoczna (tylko w trybie ZABEZPIECZENIA) */
  protectionLayerVisible: boolean;

  /** Zmien tryb SLD */
  setMode: (mode: SldMode) => void;

  /** Przelacz na tryb EDYCJA */
  switchToEditMode: () => void;

  /** Przelacz na tryb WYNIKI */
  switchToResultsMode: () => void;

  /** Przelacz na tryb ZABEZPIECZENIA (PR-SLD-09) */
  switchToProtectionMode: () => void;

  /** Czy tryb WYNIKI (read-only) */
  isResultsMode: () => boolean;

  /** Czy tryb EDYCJA */
  isEditMode: () => boolean;

  /** Czy tryb ZABEZPIECZENIA (read-only) (PR-SLD-09) */
  isProtectionMode: () => boolean;

  /** Czy dowolny tryb read-only (WYNIKI lub ZABEZPIECZENIA) */
  isReadOnlyMode: () => boolean;

  /** Przelacz widocznosc warstwy diagnostycznej */
  toggleDiagnosticLayer: (visible?: boolean) => void;

  /** Przelacz widocznosc warstwy zabezpieczen (PR-SLD-09) */
  toggleProtectionLayer: (visible?: boolean) => void;

  /** Reset do domyslnego stanu */
  resetMode: () => void;
}

// =============================================================================
// Initial State (from URL if available)
// =============================================================================

/**
 * Pobierz stan poczatkowy z URL lub domyslny.
 */
function getInitialState(): { mode: SldMode; diagnosticLayerVisible: boolean; protectionLayerVisible: boolean } {
  if (typeof window === 'undefined') {
    return {
      mode: 'EDYCJA',
      diagnosticLayerVisible: false,
      protectionLayerVisible: false,
    };
  }
  const urlState = readSldModeFromUrl();
  return {
    mode: urlState.mode,
    diagnosticLayerVisible: urlState.diagnosticLayerVisible,
    protectionLayerVisible: urlState.protectionLayerVisible,
  };
}

const initialState = getInitialState();

// =============================================================================
// Store
// =============================================================================

/**
 * Zustand store dla trybu SLD.
 *
 * @example
 * ```tsx
 * const { mode, setMode, isResultsMode } = useSldModeStore();
 *
 * // Sprawdz czy blokować edycję
 * if (isResultsMode()) {
 *   // Blokuj wszystkie operacje edycji
 * }
 * ```
 */
export const useSldModeStore = create<SldModeStoreState>((set, get) => ({
  ...initialState,

  /**
   * Ustaw tryb SLD.
   * Synchronizuje z URL.
   */
  setMode: (mode) =>
    set((state) => {
      // Synchronizuj z URL
      updateUrlWithSldMode({
        mode,
        diagnosticLayerVisible: mode === 'WYNIKI' ? true : state.diagnosticLayerVisible,
        protectionLayerVisible: mode === 'ZABEZPIECZENIA' ? true : state.protectionLayerVisible,
      });
      return {
        mode,
        // Auto-wlacz warstwe diagnostyczna przy przelaczeniu na WYNIKI
        diagnosticLayerVisible: mode === 'WYNIKI' ? true : state.diagnosticLayerVisible,
        // Auto-wlacz warstwe zabezpieczen przy przelaczeniu na ZABEZPIECZENIA
        protectionLayerVisible: mode === 'ZABEZPIECZENIA' ? true : state.protectionLayerVisible,
      };
    }),

  /**
   * Przelacz na tryb EDYCJA.
   */
  switchToEditMode: () => {
    get().setMode('EDYCJA');
  },

  /**
   * Przelacz na tryb WYNIKI.
   */
  switchToResultsMode: () => {
    get().setMode('WYNIKI');
  },

  /**
   * Przelacz na tryb ZABEZPIECZENIA (PR-SLD-09).
   */
  switchToProtectionMode: () => {
    get().setMode('ZABEZPIECZENIA');
  },

  /**
   * Czy tryb WYNIKI (read-only).
   */
  isResultsMode: () => {
    return get().mode === 'WYNIKI';
  },

  /**
   * Czy tryb EDYCJA.
   */
  isEditMode: () => {
    return get().mode === 'EDYCJA';
  },

  /**
   * Czy tryb ZABEZPIECZENIA (read-only) (PR-SLD-09).
   */
  isProtectionMode: () => {
    return get().mode === 'ZABEZPIECZENIA';
  },

  /**
   * Czy dowolny tryb read-only (WYNIKI lub ZABEZPIECZENIA).
   */
  isReadOnlyMode: () => {
    const mode = get().mode;
    return mode === 'WYNIKI' || mode === 'ZABEZPIECZENIA';
  },

  /**
   * Przelacz widocznosc warstwy diagnostycznej.
   * Jesli `visible` podane - ustaw na ta wartosc.
   * W przeciwnym razie przelacz.
   */
  toggleDiagnosticLayer: (visible) =>
    set((state) => {
      const newVisible = visible !== undefined ? visible : !state.diagnosticLayerVisible;
      // Synchronizuj z URL
      updateUrlWithSldMode({
        mode: state.mode,
        diagnosticLayerVisible: newVisible,
        protectionLayerVisible: state.protectionLayerVisible,
      });
      return { diagnosticLayerVisible: newVisible };
    }),

  /**
   * Przelacz widocznosc warstwy zabezpieczen (PR-SLD-09).
   * Jesli `visible` podane - ustaw na ta wartosc.
   * W przeciwnym razie przelacz.
   */
  toggleProtectionLayer: (visible) =>
    set((state) => {
      const newVisible = visible !== undefined ? visible : !state.protectionLayerVisible;
      // Synchronizuj z URL
      updateUrlWithSldMode({
        mode: state.mode,
        diagnosticLayerVisible: state.diagnosticLayerVisible,
        protectionLayerVisible: newVisible,
      });
      return { protectionLayerVisible: newVisible };
    }),

  /**
   * Reset do domyslnego stanu.
   */
  resetMode: () => {
    updateUrlWithSldMode({ mode: 'EDYCJA', diagnosticLayerVisible: false, protectionLayerVisible: false });
    set({ mode: 'EDYCJA', diagnosticLayerVisible: false, protectionLayerVisible: false });
  },
}));

// =============================================================================
// Derived Hooks
// =============================================================================

/**
 * Hook: Pobierz aktualny tryb SLD.
 */
export function useSldMode(): SldMode {
  return useSldModeStore((state) => state.mode);
}

/**
 * Hook: Czy tryb WYNIKI (read-only).
 */
export function useIsResultsMode(): boolean {
  return useSldModeStore((state) => state.mode === 'WYNIKI');
}

/**
 * Hook: Czy tryb EDYCJA.
 */
export function useIsEditMode(): boolean {
  return useSldModeStore((state) => state.mode === 'EDYCJA');
}

/**
 * Hook: Czy warstwa diagnostyczna widoczna.
 */
export function useDiagnosticLayerVisible(): boolean {
  return useSldModeStore((state) => state.diagnosticLayerVisible);
}

/**
 * Hook: Czy tryb ZABEZPIECZENIA (read-only) (PR-SLD-09).
 */
export function useIsProtectionMode(): boolean {
  return useSldModeStore((state) => state.mode === 'ZABEZPIECZENIA');
}

/**
 * Hook: Czy warstwa zabezpieczen widoczna (PR-SLD-09).
 */
export function useProtectionLayerVisible(): boolean {
  return useSldModeStore((state) => state.protectionLayerVisible);
}

/**
 * Hook: Czy dowolny tryb read-only (WYNIKI lub ZABEZPIECZENIA).
 */
export function useIsReadOnlyMode(): boolean {
  return useSldModeStore((state) => state.mode === 'WYNIKI' || state.mode === 'ZABEZPIECZENIA');
}

/**
 * Hook: Etykieta aktualnego trybu po polsku.
 */
export function useSldModeLabel(): string {
  const mode = useSldModeStore((state) => state.mode);
  return SLD_MODE_LABELS_PL[mode];
}
