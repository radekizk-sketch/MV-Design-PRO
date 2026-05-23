/**
 * SLD Delta Overlay Store Tests -- PR-21
 *
 * Tests for the delta overlay store integration.
 * Verifies backend fetch, PR-16 overlay store integration,
 * and determinism.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSldDeltaOverlayStore } from '../sldDeltaOverlayStore';
import { useOverlayStore } from '../overlayStore';
import type { DeltaOverlayPayload } from '../../comparison/sldDeltaOverlay.types';

// Mock the API
vi.mock('../../comparison/sldDeltaOverlay.api', () => ({
  fetchDeltaOverlay: vi.fn(),
}));

import { fetchDeltaOverlay } from '../../comparison/sldDeltaOverlay.api';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DELTA_PAYLOAD: DeltaOverlayPayload = {
  run_id: '00000000-0000-0000-0000-000000000001',
  analysis_type: 'DELTA_SC_3F',
  elements: [
    {
      element_ref: 'source_A',
      element_type: 'Source',
      visual_state: 'WARNING',
      numeric_badges: {
        i_contrib_a_base: 600,
        i_contrib_a_other: 630,
        i_contrib_a_abs: 30,
        i_contrib_a_rel: 0.05,
      },
      color_token: 'delta_change',
      stroke_token: 'bold',
      animation_token: null,
    },
    {
      element_ref: 'branch_B',
      element_type: 'Branch',
      visual_state: 'OK',
      numeric_badges: {
        i_contrib_a_base: 200,
        i_contrib_a_other: 200,
        i_contrib_a_abs: 0,
        i_contrib_a_rel: 0,
      },
      color_token: 'delta_none',
      stroke_token: 'normal',
      animation_token: null,
    },
  ],
  legend: [
    { color_token: 'delta_none', label: 'Bez zmian', description: 'Identyczne wartosci' },
    { color_token: 'delta_change', label: 'Zmiana', description: 'Rozne wartosci' },
    { color_token: 'delta_inactive', label: 'Brak danych', description: null },
  ],
  content_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SldDeltaOverlayStore', () => {
  beforeEach(() => {
    // Reset both stores
    useSldDeltaOverlayStore.setState({
      activeComparisonId: null,
      deltaPayload: null,
      contentHash: null,
      enabled: true,
      isLoading: false,
      error: null,
    });
    useOverlayStore.setState({
      activeRunId: null,
      overlay: null,
      enabled: true,
    });
    vi.clearAllMocks();
  });

  describe('Initial state', () => {
    it('starts with no active overlay', () => {
      const state = useSldDeltaOverlayStore.getState();
      expect(state.activeComparisonId).toBeNull();
      expect(state.deltaPayload).toBeNull();
      expect(state.contentHash).toBeNull();
      expect(state.enabled).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('loadDeltaOverlay', () => {
    it('fetches payload and updates both stores', async () => {
      vi.mocked(fetchDeltaOverlay).mockResolvedValue(DELTA_PAYLOAD);

      await useSldDeltaOverlayStore.getState().loadDeltaOverlay('comp-123');

      // Delta overlay store updated
      const deltaState = useSldDeltaOverlayStore.getState();
      expect(deltaState.activeComparisonId).toBe('comp-123');
      expect(deltaState.deltaPayload).toBe(DELTA_PAYLOAD);
      expect(deltaState.contentHash).toBe(DELTA_PAYLOAD.content_hash);
      expect(deltaState.enabled).toBe(true);
      expect(deltaState.isLoading).toBe(false);

      // PR-16 overlay store also updated
      const overlayState = useOverlayStore.getState();
      expect(overlayState.activeRunId).toBe(DELTA_PAYLOAD.run_id);
      expect(overlayState.overlay).not.toBeNull();
      expect(overlayState.overlay!.analysis_type).toBe('DELTA_SC_3F');
      expect(overlayState.overlay!.elements).toHaveLength(2);
      expect(overlayState.overlay!.legend).toHaveLength(3);
    });

    it('handles fetch error', async () => {
      vi.mocked(fetchDeltaOverlay).mockRejectedValue(
        new Error('Porownanie nie istnieje')
      );

      await useSldDeltaOverlayStore.getState().loadDeltaOverlay('comp-999');

      const state = useSldDeltaOverlayStore.getState();
      expect(state.error).toBe('Porownanie nie istnieje');
      expect(state.isLoading).toBe(false);
      expect(state.deltaPayload).toBeNull();
    });
  });

  describe('clearDeltaOverlay', () => {
    it('resets delta overlay and PR-16 overlay store', async () => {
      // Set up loaded state
      vi.mocked(fetchDeltaOverlay).mockResolvedValue(DELTA_PAYLOAD);
      await useSldDeltaOverlayStore.getState().loadDeltaOverlay('comp-123');

      // Verify loaded
      expect(useSldDeltaOverlayStore.getState().activeComparisonId).toBe('comp-123');
      expect(useOverlayStore.getState().overlay).not.toBeNull();

      // Clear
      useSldDeltaOverlayStore.getState().clearDeltaOverlay();

      // Delta store cleared
      const deltaState = useSldDeltaOverlayStore.getState();
      expect(deltaState.activeComparisonId).toBeNull();
      expect(deltaState.deltaPayload).toBeNull();
      expect(deltaState.contentHash).toBeNull();

      // PR-16 store also cleared
      const overlayState = useOverlayStore.getState();
      expect(overlayState.overlay).toBeNull();
      expect(overlayState.activeRunId).toBeNull();
    });
  });

  describe('toggleDeltaOverlay', () => {
    it('toggles enabled state', () => {
      expect(useSldDeltaOverlayStore.getState().enabled).toBe(true);

      useSldDeltaOverlayStore.getState().toggleDeltaOverlay();
      expect(useSldDeltaOverlayStore.getState().enabled).toBe(false);

      useSldDeltaOverlayStore.getState().toggleDeltaOverlay();
      expect(useSldDeltaOverlayStore.getState().enabled).toBe(true);
    });

    it('accepts forced value', () => {
      useSldDeltaOverlayStore.getState().toggleDeltaOverlay(false);
      expect(useSldDeltaOverlayStore.getState().enabled).toBe(false);

      useSldDeltaOverlayStore.getState().toggleDeltaOverlay(true);
      expect(useSldDeltaOverlayStore.getState().enabled).toBe(true);
    });

    it('syncs with PR-16 overlay store', () => {
      useSldDeltaOverlayStore.getState().toggleDeltaOverlay(false);
      expect(useOverlayStore.getState().enabled).toBe(false);

      useSldDeltaOverlayStore.getState().toggleDeltaOverlay(true);
      expect(useOverlayStore.getState().enabled).toBe(true);
    });
  });

  describe('No hex colors in payload', () => {
    it('delta payload contains no hex color strings', async () => {
      vi.mocked(fetchDeltaOverlay).mockResolvedValue(DELTA_PAYLOAD);
      await useSldDeltaOverlayStore.getState().loadDeltaOverlay('comp-123');

      const payload = useSldDeltaOverlayStore.getState().deltaPayload!;
      const payloadStr = JSON.stringify(payload);

      // No hex color patterns (#RGB, #RRGGBB, #RRGGBBAA)
      const hexPattern = /#[0-9a-fA-F]{3,8}/;
      expect(hexPattern.test(payloadStr)).toBe(false);
    });
  });
});
