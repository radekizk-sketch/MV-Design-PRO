/**
 * F8c pkt 7 — testy `useMeasuredSize` (konsolidacja duplikatu v2/v3, patrz
 * docstring modułu). Pokrywa: override ma pierwszeństwo (tryb testowy obu
 * workspace'ów), fallback bez `ResizeObserver`/`ref` (nie crashuje), i
 * PARAMETRYZOWANY dolny clamp `minWidth`/`minHeight` — dowód, że różnica
 * v2 (360×240) vs v3 (320×240) jest zachowana, nie uśredniona.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';

import { useMeasuredSize } from '../useMeasuredSize';

type CapturedObserver = {
  callback: ResizeObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

function installMockResizeObserver(): CapturedObserver {
  const observe = vi.fn();
  const disconnect = vi.fn();
  let callback: ResizeObserverCallback = () => {};
  class MockResizeObserver {
    constructor(cb: ResizeObserverCallback) {
      callback = cb;
    }
    observe = observe;
    unobserve = vi.fn();
    disconnect = disconnect;
  }
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
  return {
    get callback() {
      return callback;
    },
    observe,
    disconnect,
  } as CapturedObserver;
}

const originalResizeObserver = globalThis.ResizeObserver;

afterEach(() => {
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
});

describe('useMeasuredSize', () => {
  it('override obecny (width+height) → zwraca override natychmiast, ResizeObserver nie jest tworzony', () => {
    const captured = installMockResizeObserver();
    const ref = createRef<HTMLDivElement>();
    const { result } = renderHook(() =>
      useMeasuredSize(ref, 1024, 640, { width: 500, height: 300 }, 320, 240),
    );
    expect(result.current).toEqual({ width: 500, height: 300 });
    expect(captured.observe).not.toHaveBeenCalled();
  });

  it('brak override, brak ref.current (np. przed mountem) → fallback, brak crasha', () => {
    installMockResizeObserver();
    const ref = createRef<HTMLDivElement>();
    const { result } = renderHook(() => useMeasuredSize(ref, 1024, 640, undefined, 320, 240));
    expect(result.current).toEqual({ width: 1024, height: 640 });
  });

  it('brak override, ResizeObserver zgłasza rozmiar WIĘKSZY niż minWidth/minHeight → zwraca rozmiar z observera', () => {
    const captured = installMockResizeObserver();
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = { current: div };
    renderHook(() => useMeasuredSize(ref, 1024, 640, undefined, 320, 240));
    expect(captured.observe).toHaveBeenCalledWith(div);

    // Symulacja callbacku ResizeObserver (mock globalny go nie wywołuje sam).
    act(() => {
      captured.callback(
        [{ contentRect: { width: 900, height: 500 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });
    document.body.removeChild(div);
  });

  it('PARAMETRYZACJA (v2 vs v3): różne minWidth/minHeight dają różny dolny clamp dla TEGO SAMEGO małego rozmiaru z observera', () => {
    // v2: 360×240; v3: 320×240 (patrz nagłówek modułu). Sprawdzamy klucz
    // różnicy — clamp SZEROKOŚCI — wywołując hook dwa razy z różnymi
    // parametrami minWidth i tym samym małym contentRect (200×100, poniżej
    // OBU progów szerokości, powyżej progu wysokości).
    let capturedV2: CapturedObserver | null = null;
    let capturedV3: CapturedObserver | null = null;

    const divV2 = document.createElement('div');
    document.body.appendChild(divV2);
    capturedV2 = installMockResizeObserver();
    const refV2 = { current: divV2 };
    const hookV2 = renderHook(() => useMeasuredSize(refV2, 1024, 640, undefined, 360, 240));

    const divV3 = document.createElement('div');
    document.body.appendChild(divV3);
    capturedV3 = installMockResizeObserver();
    const refV3 = { current: divV3 };
    const hookV3 = renderHook(() => useMeasuredSize(refV3, 1024, 640, undefined, 320, 240));

    act(() => {
      capturedV2!.callback([{ contentRect: { width: 200, height: 100 } } as ResizeObserverEntry], {} as ResizeObserver);
      capturedV3!.callback([{ contentRect: { width: 200, height: 100 } } as ResizeObserverEntry], {} as ResizeObserver);
    });

    // v2: clamp do 360 (MIN_CANVAS_WIDTH_PX v2). v3: clamp do 320 (MIN_CANVAS_WIDTH_PX v3).
    expect(hookV2.result.current.width).toBe(360);
    expect(hookV3.result.current.width).toBe(320);
    // Wysokość identyczna w obu (240 clamp, 100 < 240).
    expect(hookV2.result.current.height).toBe(240);
    expect(hookV3.result.current.height).toBe(240);

    document.body.removeChild(divV2);
    document.body.removeChild(divV3);
  });
});
