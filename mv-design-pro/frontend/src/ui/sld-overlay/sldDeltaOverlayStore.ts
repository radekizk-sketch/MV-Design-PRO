/**
 * SLD Delta Overlay Store -- PR-21 (Zustand)
 *
 * State management for delta overlay on SLD.
 * Loads OverlayPayloadV1 from comparison endpoint and
 * integrates with the existing overlay runtime (PR-16).
 *
 * INVARIANTS:
 * - NO physics calculations
 * - NO model mutations
 * - Overlay data comes exclusively from backend
 * - Store is a pure data holder + integration bridge
 * - Loading triggers overlay store (PR-16) update
 */

import { create } from 'zustand';
import type { DeltaOverlayPayload } from '../comparison/sldDeltaOverlay.types';
import type { OverlayPayloadV1 } from './overlayTypes';
import { fetchDeltaOverlay } from '../comparison/sldDeltaOverlay.api';
import { useOverlayStore } from './overlayStore';

interface SldDeltaOverlayState {
  /** Currently loaded comparison ID (null = no delta overlay) */
  activeComparisonId: string | null;

  /** Delta overlay payload from backend (null = not loaded) */
  deltaPayload: DeltaOverlayPayload | null;

  /** Content hash for determinism verification */
  contentHash: string | null;

  /** Whether delta overlay is enabled */
  enabled: boolean;

  /** Loading state */
  isLoading: boolean;

  /** Error message */
  error: string | null;

  /**
   * Load delta overlay for a comparison.
   * Fetches from backend and pushes to PR-16 overlay store.
   */
  loadDeltaOverlay: (comparisonId: string) => Promise<void>;

  /**
   * Clear delta overlay and reset PR-16 overlay store.
   */
  clearDeltaOverlay: () => void;

  /**
   * Toggle delta overlay visibility.
   */
  toggleDeltaOverlay: (forced?: boolean) => void;
}

const initialState = {
  activeComparisonId: null as string | null,
  deltaPayload: null as DeltaOverlayPayload | null,
  contentHash: null as string | null,
  enabled: true,
  isLoading: false,
  error: null as string | null,
};

export const useSldDeltaOverlayStore = create<SldDeltaOverlayState>(
  (set, get) => ({
    ...initialState,

    loadDeltaOverlay: async (comparisonId) => {
      set({ isLoading: true, error: null });
      try {
        const payload = await fetchDeltaOverlay(comparisonId);

        set({
          activeComparisonId: comparisonId,
          deltaPayload: payload,
          contentHash: payload.content_hash,
          enabled: true,
          isLoading: false,
        });

        // Convert to OverlayPayloadV1 and push to PR-16 overlay store
        const overlayPayload: OverlayPayloadV1 = {
          run_id: payload.run_id,
          analysis_type: payload.analysis_type,
          elements: payload.elements,
          legend: payload.legend,
        };

        useOverlayStore.getState().loadOverlay(overlayPayload);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Blad ladowania nakladki delta';
        set({ error: message, isLoading: false });
      }
    },

    clearDeltaOverlay: () => {
      set(initialState);
      useOverlayStore.getState().clearOverlay();
    },

    toggleDeltaOverlay: (forced) => {
      const newEnabled = forced !== undefined ? forced : !get().enabled;
      set({ enabled: newEnabled });
      useOverlayStore.getState().toggleOverlay(newEnabled);
    },
  })
);
