/**
 * Load Flow Overlay Mode — stan store'u i etykiety PL (PR-LF-04)
 *
 * Karta AB-1a Pakiet L (2026-09-23): komponent `PowerFlowSldOverlay.tsx` (LEGACY_USUNAC
 * E15 inwentarza werdyktów — domyślny stan 'OK', brak konsumenta produkcyjnego) skasowany
 * razem z sekcjami §1–§6, które czytały WYŁĄCZNIE jego źródło. Zostaje to, co ma
 * żywego właściciela: tryb nakładki w `usePowerFlowResultsStore` i polskie etykiety
 * `LOAD_FLOW_OVERLAY_MODE_LABELS`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { usePowerFlowResultsStore } from '../store';
import type { LoadFlowOverlayMode } from '../types';
import { LOAD_FLOW_OVERLAY_MODE_LABELS } from '../types';

// =============================================================================
// Store Reset
// =============================================================================

function resetStore() {
  usePowerFlowResultsStore.getState().reset();
}

describe('PR-LF-04: Overlay — Polish mode labels', () => {
  it('should have Polish mode labels', () => {
    expect(LOAD_FLOW_OVERLAY_MODE_LABELS.voltage).toBe('Napięcia');
    expect(LOAD_FLOW_OVERLAY_MODE_LABELS.loading).toBe('Obciążenie');
    expect(LOAD_FLOW_OVERLAY_MODE_LABELS.flow).toBe('Kierunek przepływu');
  });
});

// =============================================================================
// Store Overlay Mode Management
// =============================================================================

describe('PR-LF-04: Overlay — Store Mode Management', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should start with voltage as default overlay mode', () => {
    const { overlayMode } = usePowerFlowResultsStore.getState();
    expect(overlayMode).toBe('voltage');
  });

  it('should change overlay mode', () => {
    const { setOverlayMode } = usePowerFlowResultsStore.getState();

    const modes: LoadFlowOverlayMode[] = ['voltage', 'loading', 'flow'];
    for (const mode of modes) {
      act(() => {
        setOverlayMode(mode);
      });
      expect(usePowerFlowResultsStore.getState().overlayMode).toBe(mode);
    }
  });

  it('should preserve overlay mode across tab changes', () => {
    const { setOverlayMode, setActiveTab } = usePowerFlowResultsStore.getState();

    act(() => {
      setOverlayMode('loading');
    });
    act(() => {
      setActiveTab('BRANCHES');
    });

    expect(usePowerFlowResultsStore.getState().overlayMode).toBe('loading');
  });

  it('should reset overlay mode on store reset', () => {
    const { setOverlayMode, reset } = usePowerFlowResultsStore.getState();

    act(() => {
      setOverlayMode('flow');
    });
    expect(usePowerFlowResultsStore.getState().overlayMode).toBe('flow');

    act(() => {
      reset();
    });
    expect(usePowerFlowResultsStore.getState().overlayMode).toBe('voltage');
  });
});
