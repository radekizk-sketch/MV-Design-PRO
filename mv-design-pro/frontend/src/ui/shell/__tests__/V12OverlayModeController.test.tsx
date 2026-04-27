/**
 * Tests for V12OverlayModeController — F0.
 *
 * Sprawdza, że zmiana `activeWorkMode` w `useAppStateStore`
 * skutkuje deterministycznym `visibleOverlays` w `useOverlayStore`,
 * BEZ store→store subscription (komponent React headless).
 */

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  V12OverlayModeController,
  WORK_MODE_OVERLAYS,
  WORK_MODE_OVERLAYS_BASE,
  computeVisibleOverlays,
  payloadHasZeroSequence,
} from '../V12OverlayModeController';
import { useAppStateStore } from '../../app-state/store';
import { useOverlayStore } from '../../sld-overlay/overlayStore';
import type { WorkMode } from '../../app-state/store';
import type { OverlayPayloadV1 } from '../../sld-overlay/overlayTypes';

describe('V12OverlayModeController — F0 work-mode → overlay sync', () => {
  beforeEach(() => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TE');
      useOverlayStore.getState().clearOverlay();
      useOverlayStore.getState().setVisibleOverlays([]);
    });
  });

  afterEach(() => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TE');
      useOverlayStore.getState().clearOverlay();
      useOverlayStore.getState().setVisibleOverlays([]);
    });
  });

  it('TE → empty overlay set (czysta edycja)', () => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TE');
    });
    render(<V12OverlayModeController />);
    expect(useOverlayStore.getState().visibleOverlays).toEqual([]);
  });

  it('TW → {power_flow, results} (lex sort)', () => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TW');
    });
    render(<V12OverlayModeController />);
    expect(useOverlayStore.getState().visibleOverlays).toEqual(['power_flow', 'results']);
  });

  it('TZ → {protection, results, zero_sequence} (F1: zero_sequence ZAWSZE w TZ)', () => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TZ');
    });
    render(<V12OverlayModeController />);
    expect(useOverlayStore.getState().visibleOverlays).toEqual([
      'protection',
      'results',
      'zero_sequence',
    ]);
  });

  it('TP → {diagnostics}', () => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TP');
    });
    render(<V12OverlayModeController />);
    expect(useOverlayStore.getState().visibleOverlays).toEqual(['diagnostics']);
  });

  it('TA → {results, trace_markers} (lex sort)', () => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TA');
    });
    render(<V12OverlayModeController />);
    expect(useOverlayStore.getState().visibleOverlays).toEqual(['results', 'trace_markers']);
  });

  it('TN → {results}', () => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TN');
    });
    render(<V12OverlayModeController />);
    expect(useOverlayStore.getState().visibleOverlays).toEqual(['results']);
  });

  it('zmiana trybu reaktywnie aktualizuje visibleOverlays', () => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TE');
    });
    render(<V12OverlayModeController />);
    expect(useOverlayStore.getState().visibleOverlays).toEqual([]);

    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TZ');
    });
    expect(useOverlayStore.getState().visibleOverlays).toEqual([
      'protection',
      'results',
      'zero_sequence',
    ]);

    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TP');
    });
    expect(useOverlayStore.getState().visibleOverlays).toEqual(['diagnostics']);
  });

  it('komponent zwraca null (headless, brak DOM)', () => {
    const { container } = render(<V12OverlayModeController />);
    expect(container.firstChild).toBeNull();
  });

  it('WORK_MODE_OVERLAYS jest aliasem WORK_MODE_OVERLAYS_BASE (backward compat)', () => {
    expect(WORK_MODE_OVERLAYS).toBe(WORK_MODE_OVERLAYS_BASE);
    expect(Object.isFrozen(WORK_MODE_OVERLAYS_BASE)).toBe(true);
    const modes: WorkMode[] = ['TE', 'TW', 'TZ', 'TP', 'TA', 'TN'];
    for (const m of modes) {
      const arr = WORK_MODE_OVERLAYS_BASE[m];
      expect(Object.isFrozen(arr)).toBe(true);
    }
  });

  it('setVisibleOverlays normalizuje (dedup + lex sort)', () => {
    act(() => {
      useOverlayStore
        .getState()
        .setVisibleOverlays(['results', 'protection', 'results', 'diagnostics']);
    });
    expect(useOverlayStore.getState().visibleOverlays).toEqual([
      'diagnostics',
      'protection',
      'results',
    ]);
  });
});

describe('V12OverlayModeController — F1 zero_sequence multi-mode mapping', () => {
  beforeEach(() => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TE');
      useOverlayStore.getState().clearOverlay();
      useOverlayStore.getState().setVisibleOverlays([]);
    });
  });

  afterEach(() => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TE');
      useOverlayStore.getState().clearOverlay();
      useOverlayStore.getState().setVisibleOverlays([]);
    });
  });

  function makeGroundFaultPayload(): OverlayPayloadV1 {
    return {
      run_id: 'R',
      analysis_type: 'EARTHING_GROUND_FAULT_SN',
      elements: [
        {
          element_ref: 'A',
          element_type: 'ZeroSequenceNode',
          visual_state: 'OK',
          numeric_badges: { i0_a: 1.0 },
          color_token: 'ok',
          stroke_token: 'normal',
          animation_token: null,
        },
      ],
      legend: [],
    };
  }

  function makePlainPayload(): OverlayPayloadV1 {
    return {
      run_id: 'R',
      analysis_type: 'LOAD_FLOW',
      elements: [
        {
          element_ref: 'A',
          element_type: 'Bus',
          visual_state: 'OK',
          numeric_badges: { v_pu: 1.0 },
          color_token: 'ok',
          stroke_token: 'normal',
          animation_token: null,
        },
      ],
      legend: [],
    };
  }

  it('payloadHasZeroSequence: EARTHING analysis_type → true', () => {
    expect(payloadHasZeroSequence(makeGroundFaultPayload())).toBe(true);
  });

  it('payloadHasZeroSequence: brak i0/u0 w numeric_badges → false', () => {
    expect(payloadHasZeroSequence(makePlainPayload())).toBe(false);
  });

  it('payloadHasZeroSequence: null → false', () => {
    expect(payloadHasZeroSequence(null)).toBe(false);
  });

  it('TZ → zero_sequence ZAWSZE (nawet bez payload)', () => {
    expect(computeVisibleOverlays('TZ', null)).toContain('zero_sequence');
    expect(computeVisibleOverlays('TZ', makePlainPayload())).toContain('zero_sequence');
  });

  it('TW → zero_sequence TYLKO gdy payload zawiera dane', () => {
    expect(computeVisibleOverlays('TW', null)).not.toContain('zero_sequence');
    expect(computeVisibleOverlays('TW', makePlainPayload())).not.toContain('zero_sequence');
    expect(computeVisibleOverlays('TW', makeGroundFaultPayload())).toContain('zero_sequence');
  });

  it('TA → zero_sequence TYLKO gdy ground_fault payload', () => {
    expect(computeVisibleOverlays('TA', null)).not.toContain('zero_sequence');
    expect(computeVisibleOverlays('TA', makeGroundFaultPayload())).toContain('zero_sequence');
  });

  it('TN → zero_sequence TYLKO gdy ground_fault payload', () => {
    expect(computeVisibleOverlays('TN', null)).not.toContain('zero_sequence');
    expect(computeVisibleOverlays('TN', makeGroundFaultPayload())).toContain('zero_sequence');
  });

  it('TE → NIGDY zero_sequence', () => {
    expect(computeVisibleOverlays('TE', makeGroundFaultPayload())).toEqual([]);
  });

  it('TP → NIGDY zero_sequence', () => {
    expect(computeVisibleOverlays('TP', makeGroundFaultPayload())).not.toContain(
      'zero_sequence',
    );
  });

  it('integracja: TZ + load payload → visibleOverlays zawiera zero_sequence', () => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TZ');
      useOverlayStore.getState().loadOverlay(makeGroundFaultPayload());
    });
    render(<V12OverlayModeController />);
    expect(useOverlayStore.getState().visibleOverlays).toEqual([
      'protection',
      'results',
      'zero_sequence',
    ]);
  });

  it('integracja: TW + load ground_fault → zero_sequence dodane', () => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TW');
      useOverlayStore.getState().loadOverlay(makeGroundFaultPayload());
    });
    render(<V12OverlayModeController />);
    expect(useOverlayStore.getState().visibleOverlays).toContain('zero_sequence');
  });

  it('integracja: clear payload usuwa zero_sequence (TW)', () => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TW');
      useOverlayStore.getState().loadOverlay(makeGroundFaultPayload());
    });
    const { rerender } = render(<V12OverlayModeController />);
    expect(useOverlayStore.getState().visibleOverlays).toContain('zero_sequence');
    act(() => {
      useOverlayStore.getState().clearOverlay();
    });
    rerender(<V12OverlayModeController />);
    expect(useOverlayStore.getState().visibleOverlays).not.toContain('zero_sequence');
  });
});
