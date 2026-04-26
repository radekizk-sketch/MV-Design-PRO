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
} from '../V12OverlayModeController';
import { useAppStateStore } from '../../app-state/store';
import { useOverlayStore } from '../../sld-overlay/overlayStore';
import type { WorkMode } from '../../app-state/store';

describe('V12OverlayModeController — F0 work-mode → overlay sync', () => {
  beforeEach(() => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TE');
      useOverlayStore.getState().setVisibleOverlays([]);
    });
  });

  afterEach(() => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TE');
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

  it('TZ → {protection, results} (lex sort)', () => {
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TZ');
    });
    render(<V12OverlayModeController />);
    expect(useOverlayStore.getState().visibleOverlays).toEqual(['protection', 'results']);
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
    expect(useOverlayStore.getState().visibleOverlays).toEqual(['protection', 'results']);

    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TP');
    });
    expect(useOverlayStore.getState().visibleOverlays).toEqual(['diagnostics']);
  });

  it('komponent zwraca null (headless, brak DOM)', () => {
    const { container } = render(<V12OverlayModeController />);
    expect(container.firstChild).toBeNull();
  });

  it('WORK_MODE_OVERLAYS jest zamrożoną mapą (determinism)', () => {
    expect(Object.isFrozen(WORK_MODE_OVERLAYS)).toBe(true);
    const modes: WorkMode[] = ['TE', 'TW', 'TZ', 'TP', 'TA', 'TN'];
    for (const m of modes) {
      const arr = WORK_MODE_OVERLAYS[m];
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
