/**
 * SLD Project Mode Store (Zustand) — RUN #3H §4.
 *
 * CANONICAL CONTRACT:
 * - Zarzadza trybem projektowym (CAD) i nadpisaniami geometrii.
 * - Overrides ladowane z backendu, walidowane, zapisywane.
 * - applyDelta() dodaje/aktualizuje override per elementId.
 * - dirty flag kontroluje zapis.
 * - validate() sprawdza overrides przeciwko aktualnemu LayoutResultV1.
 *
 * RULES:
 * - Tryb projektowy NIE modyfikuje LayoutResultV1.
 * - Overrides sa OSOBNA warstwa.
 * - Zapis blokowany jesli walidacja nie przechodzi.
 * - 100% PL w UI.
 */

import { create } from 'zustand';

import type {
  ProjectGeometryOverridesV1,
  GeometryOverrideItemV1,
  GeometryOverridePayloadV1,
  OverrideValidationErrorV1,
} from './core/geometryOverrides';
import {
  OVERRIDES_VERSION as _OVERRIDES_VERSION,
  OverrideScopeV1,
  OverrideOperationV1,
  emptyOverrides,
  canonicalizeOverrides,
  computeOverridesHash,
  validateOverridesAgainstLayout,
  snapDeltaToGrid,
} from './core/geometryOverrides';

import type { LayoutResultV1 } from './core/layoutResult';

import {
  fetchSldOverrides,
  saveSldOverrides,
  resetSldOverrides,
  mapResponseToOverrides,
} from './core/overridesApi';

// =============================================================================
// Types
// =============================================================================

export interface SldProjectModeState {
  /** Czy tryb projektowy jest aktywny. */
  projectModeActive: boolean;

  /** Aktualne overrides (z backendu lub lokalne). */
  overrides: ProjectGeometryOverridesV1 | null;

  /** Czy sa niezapisane zmiany. */
  dirty: boolean;

  /** Bledy walidacji overrides. */
  validationErrors: readonly OverrideValidationErrorV1[];

  /** Czy trwa ladowanie/zapis. */
  loading: boolean;

  /** Blad operacji (null jesli OK). */
  error: string | null;

  /** Hash ostatnio zapisanych overrides. */
  lastSavedHash: string | null;

  // --- Actions ---

  /** Wlacz/wylacz tryb projektowy. */
  setProjectMode: (active: boolean) => void;

  /** Zaladuj overrides z backendu. */
  loadOverrides: (caseId: string) => Promise<void>;

  /** Zapisz overrides do backendu. */
  saveOverrides: (caseId: string) => Promise<void>;

  /** Reset overrides do pustych. */
  resetOverrides: (caseId: string) => Promise<void>;

  /**
   * Dodaj/zaktualizuj override dla elementu.
   * snap-to-grid aplikowany automatycznie dla MOVE_DELTA.
   */
  applyDelta: (
    elementId: string,
    scope: OverrideScopeV1,
    operation: OverrideOperationV1,
    payload: GeometryOverridePayloadV1,
  ) => void;

  /**
   * Dodaj lub zamien override (wygodne API dla drag hook).
   * Rownowazne applyDelta() ale z gotowym OverrideItemV1.
   */
  addOrReplaceOverride: (item: GeometryOverrideItemV1) => void;

  /**
   * Usun override dla elementu (po elementId+scope).
   */
  removeOverride: (elementId: string, scope: OverrideScopeV1) => void;

  /** Waliduj overrides przeciwko layoutowi. */
  validate: (layout: LayoutResultV1) => void;

  /**
   * Waliduj overrides i sprawdz kolizje (pelna walidacja).
   * Zwraca bledy walidacji (ustawia validationErrors w stanie).
   */
  validateOverrides: (layout: LayoutResultV1) => readonly OverrideValidationErrorV1[];
}

// =============================================================================
// Store
// =============================================================================

export const useSldProjectModeStore = create<SldProjectModeState>((set, get) => ({
  projectModeActive: false,
  overrides: null,
  dirty: false,
  validationErrors: [],
  loading: false,
  error: null,
  lastSavedHash: null,

  setProjectMode: (active) => {
    set({ projectModeActive: active });
    if (!active) {
      // Wylaczenie trybu — wyczysc dirty i errors
      set({ dirty: false, validationErrors: [], error: null });
    }
  },

  loadOverrides: async (caseId) => {
    set({ loading: true, error: null });
    try {
      const response = await fetchSldOverrides(caseId);
      const overrides = mapResponseToOverrides(response);
      set({
        overrides,
        dirty: false,
        lastSavedHash: response.overrides_hash,
        loading: false,
      });
    } catch (err) {
      set({
        error: `Nie udalo sie zaladowac nadpisan: ${err instanceof Error ? err.message : String(err)}`,
        loading: false,
      });
    }
  },

  saveOverrides: async (caseId) => {
    const { overrides } = get();
    if (!overrides) return;

    set({ loading: true, error: null });
    try {
      const response = await saveSldOverrides(
        caseId,
        overrides.snapshotHash,
        overrides.items,
      );
      set({
        overrides: mapResponseToOverrides(response),
        dirty: false,
        lastSavedHash: response.overrides_hash,
        loading: false,
      });
    } catch (err) {
      set({
        error: `Nie udalo sie zapisac nadpisan: ${err instanceof Error ? err.message : String(err)}`,
        loading: false,
      });
    }
  },

  resetOverrides: async (caseId) => {
    set({ loading: true, error: null });
    try {
      const response = await resetSldOverrides(caseId);
      set({
        overrides: mapResponseToOverrides(response),
        dirty: false,
        lastSavedHash: response.overrides_hash,
        validationErrors: [],
        loading: false,
      });
    } catch (err) {
      set({
        error: `Nie udalo sie zresetowac nadpisan: ${err instanceof Error ? err.message : String(err)}`,
        loading: false,
      });
    }
  },

  applyDelta: (elementId, scope, operation, payload) => {
    const { overrides } = get();
    const base = overrides ?? emptyOverrides('', '');

    // snap-to-grid for MOVE_DELTA
    let finalPayload = payload;
    if (operation === OverrideOperationV1.MOVE_DELTA) {
      const p = payload as { dx: number; dy: number };
      finalPayload = snapDeltaToGrid(p.dx, p.dy);
    }

    // Replace existing item for same elementId+scope, or add new
    const existingIndex = base.items.findIndex(
      (item) => item.elementId === elementId && item.scope === scope,
    );

    const newItem: GeometryOverrideItemV1 = {
      elementId,
      scope,
      operation,
      payload: finalPayload,
    };

    let newItems: GeometryOverrideItemV1[];
    if (existingIndex >= 0) {
      newItems = [...base.items];
      newItems[existingIndex] = newItem;
    } else {
      newItems = [...base.items, newItem];
    }

    const newOverrides = canonicalizeOverrides({
      ...base,
      items: newItems,
    });

    set({ overrides: newOverrides, dirty: true });
  },

  addOrReplaceOverride: (item) => {
    const { overrides } = get();
    const base = overrides ?? emptyOverrides('', '');

    const existingIndex = base.items.findIndex(
      (existing) => existing.elementId === item.elementId && existing.scope === item.scope,
    );

    let newItems: GeometryOverrideItemV1[];
    if (existingIndex >= 0) {
      newItems = [...base.items];
      newItems[existingIndex] = item;
    } else {
      newItems = [...base.items, item];
    }

    const newOverrides = canonicalizeOverrides({
      ...base,
      items: newItems,
    });

    set({ overrides: newOverrides, dirty: true });
  },

  removeOverride: (elementId, scope) => {
    const { overrides } = get();
    if (!overrides) return;

    const newItems = overrides.items.filter(
      (item) => !(item.elementId === elementId && item.scope === scope),
    );

    set({
      overrides: {
        ...overrides,
        items: newItems,
      },
      dirty: true,
    });
  },

  validate: (layout) => {
    const { overrides } = get();
    if (!overrides || overrides.items.length === 0) {
      set({ validationErrors: [] });
      return;
    }

    const nodeIds = new Set(layout.nodePlacements.map((p) => p.nodeId));
    const blockIds = new Set(layout.switchgearBlocks.map((b) => b.blockId));

    const result = validateOverridesAgainstLayout(overrides, nodeIds, blockIds);
    set({ validationErrors: result.errors });
  },

  validateOverrides: (layout) => {
    const { overrides } = get();
    if (!overrides || overrides.items.length === 0) {
      set({ validationErrors: [] });
      return [];
    }

    const nodeIds = new Set(layout.nodePlacements.map((p) => p.nodeId));
    const blockIds = new Set(layout.switchgearBlocks.map((b) => b.blockId));

    const result = validateOverridesAgainstLayout(overrides, nodeIds, blockIds);
    set({ validationErrors: result.errors });
    return result.errors;
  },
}));

// =============================================================================
// Derived Hooks
// =============================================================================

/** Czy tryb projektowy aktywny. */
export function useIsProjectMode(): boolean {
  return useSldProjectModeStore((s) => s.projectModeActive);
}

/** Aktualne overrides (null jesli brak). */
export function useCurrentOverrides(): ProjectGeometryOverridesV1 | null {
  return useSldProjectModeStore((s) => s.overrides);
}

/** Czy sa niezapisane zmiany. */
export function useOverridesDirty(): boolean {
  return useSldProjectModeStore((s) => s.dirty);
}

/** Bledy walidacji. */
export function useOverridesValidationErrors(): readonly OverrideValidationErrorV1[] {
  return useSldProjectModeStore((s) => s.validationErrors);
}

/** Hash ostatnich overrides (null jesli brak). */
export function useOverridesHash(): string | null {
  const overrides = useSldProjectModeStore((s) => s.overrides);
  if (!overrides) return null;
  return computeOverridesHash(overrides);
}
