/**
 * SLD Overlay Store — PR-16 Zustand State Management
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § B: Results as Overlay (never modifies model)
 * - SYSTEM_SPEC.md: Overlay = pure projection of ResultSet
 *
 * STATE:
 * - activeRunId: Currently loaded run (null = no overlay)
 * - overlay: Full OverlayPayloadV1 from backend
 * - enabled: Toggle for overlay visibility
 *
 * INVARIANTS:
 * - NO physics calculations
 * - NO interpretation of results
 * - NO model mutations
 * - Store is a pure data holder + visibility toggle
 * - Clearing overlay resets ALL state to initial
 * - Loading new overlay replaces ALL previous state
 */

import { create } from 'zustand';
import type { OverlayPayloadV1 } from './overlayTypes';
import type { ShortCircuitFlowOverlayInput } from './ShortCircuitFlowOverlayAdapter';

/**
 * V12 Overlay kinds — discrete categories driven by work-mode.
 * Lexical sort enforced in `setVisibleOverlays` for determinism.
 */
export type OverlayKind =
  | 'diagnostics'
  | 'power_flow'
  | 'protection'
  | 'results'
  | 'trace_markers'
  | 'zero_sequence';

/**
 * All known overlay kinds — used for validation and lexical sorting.
 */
export const ALL_OVERLAY_KINDS: readonly OverlayKind[] = Object.freeze([
  'diagnostics',
  'power_flow',
  'protection',
  'results',
  'trace_markers',
  'zero_sequence',
]);

/**
 * Overlay store state interface.
 */
interface OverlayStoreState {
  /** Currently active run ID (null = no overlay loaded) */
  activeRunId: string | null;

  /** Full overlay payload from backend (null = not loaded) */
  overlay: OverlayPayloadV1 | null;

  /** Whether overlay is visually enabled/visible */
  enabled: boolean;

  /**
   * Karta S-B (ZWARCIA-PRO pkt 7) — kanał KIERUNKU rozpływu prądu
   * zwarciowego: wejście adaptera W-C (`ShortCircuitFlowOverlayInput`,
   * wiersz kanoniczny `branch_contributions` z kierunkiem "from_to"/
   * "to_from" per wpis), którego `OverlayPayloadV1` (lustro backendu 1:1)
   * NIE niesie. Konsument: kanwa v3 (`SldCanvasV3Workspace` →
   * `buildFaultFlowOverlayFromScene` → strzałki `FaultContributionArrow`).
   * `null` = brak rozpływu zwarciowego do pokazania (strzałki wyłączone).
   * Czysty holder danych backendu — zero fizyki, zero interpretacji.
   */
  faultFlow: ShortCircuitFlowOverlayInput | null;

  /**
   * V12 — set of overlay kinds currently visible.
   * Lexically sorted (deterministic). Driven by V12OverlayModeController.
   */
  visibleOverlays: ReadonlyArray<OverlayKind>;

  /**
   * Load overlay payload for a specific run.
   * Replaces any existing overlay completely (including faultFlow —
   * wołający chcący strzałek kierunku woła `loadFaultFlow` PO `loadOverlay`).
   */
  loadOverlay: (payload: OverlayPayloadV1) => void;

  /**
   * Karta S-B: załaduj kanał kierunku rozpływu zwarciowego (po
   * `loadOverlay` tego samego przebiegu — patrz `pokazNaSchemacie.ts`).
   */
  loadFaultFlow: (input: ShortCircuitFlowOverlayInput) => void;

  /**
   * Clear all overlay state.
   * Resets to initial (no overlay, no run).
   */
  clearOverlay: () => void;

  /**
   * Toggle overlay visibility.
   * If forced is provided, sets to that value.
   */
  toggleOverlay: (forced?: boolean) => void;

  /**
   * V12 — set the discrete overlay kinds visible.
   * Input is normalized: deduplicated and lexically sorted.
   */
  setVisibleOverlays: (kinds: Iterable<OverlayKind>) => void;
}

/**
 * Initial state values.
 */
const initialState = {
  activeRunId: null as string | null,
  overlay: null as OverlayPayloadV1 | null,
  enabled: true,
  visibleOverlays: [] as ReadonlyArray<OverlayKind>,
  faultFlow: null as ShortCircuitFlowOverlayInput | null,
};

/**
 * Normalize a set of overlay kinds: dedup + lexical sort (deterministic).
 */
function normalizeOverlayKinds(kinds: Iterable<OverlayKind>): ReadonlyArray<OverlayKind> {
  const unique = new Set<OverlayKind>();
  for (const k of kinds) unique.add(k);
  return Object.freeze(Array.from(unique).sort());
}

/**
 * Zustand store for SLD Overlay Runtime.
 *
 * USAGE:
 * - loadOverlay(): Feed payload from backend API response
 * - clearOverlay(): Reset when switching runs/projects
 * - toggleOverlay(): User toggle for visibility
 */
export const useOverlayStore = create<OverlayStoreState>((set) => ({
  ...initialState,

  loadOverlay: (payload) => {
    set({
      activeRunId: payload.run_id,
      overlay: payload,
      enabled: true,
      // Invariant „loading new overlay replaces ALL previous state":
      // kanał kierunku CUDZEGO przebiegu nie może przeżyć podmiany overlay
      // (np. orkiestrator legacy ładuje wynik LF ⇒ strzałki SC znikają).
      faultFlow: null,
    });
  },

  loadFaultFlow: (input) => {
    set({ faultFlow: input });
  },

  clearOverlay: () => {
    set(initialState);
  },

  toggleOverlay: (forced) => {
    set((state) => ({
      enabled: forced !== undefined ? forced : !state.enabled,
    }));
  },

  setVisibleOverlays: (kinds) => {
    set({ visibleOverlays: normalizeOverlayKinds(kinds) });
  },
}));
