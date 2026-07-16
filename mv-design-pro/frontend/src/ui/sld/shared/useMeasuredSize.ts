/**
 * `useMeasuredSize` — F8c pkt 7 (REBUILD_PLAN_V3 §F8c, checklista bramkująca
 * usunięcie v2, pozycja 7 „Konsolidacja `useMeasuredSize`"): jedna wspólna
 * implementacja pomiaru rozmiaru kontenera kanwy, wyciągnięta z DWÓCH
 * duplikatów:
 *   - `v2/canvas/SldWorkspaceContainer.tsx` (nieeksportowana funkcja
 *     modułowa, `MIN_CANVAS_WIDTH_PX = 360`, `MIN_CANVAS_HEIGHT_PX = 240`),
 *   - `v3/canvas/SldCanvasV3Workspace.tsx` (nieeksportowana funkcja
 *     modułowa, `MIN_CANVAS_WIDTH_PX = 320`, `MIN_CANVAS_HEIGHT_PX = 240`,
 *     nagłówek F8a: „analogiczny do `useMeasuredSize` w
 *     `SldWorkspaceContainer.tsx` — duplikat lokalny").
 *
 * PORÓWNANIE LINIA PO LINII (przed wyciągnięciem): logika identyczna —
 * `ResizeObserver` na `ref.current`, override (`width`/`height` z propsów,
 * używany w testach/embeddingu) ma pierwszeństwo i pomija obserwator,
 * `setSize` porównuje `current`/`next` przed aktualizacją (stabilna
 * referencja gdy rozmiar się nie zmienił), brak `ResizeObserver` w
 * środowisku (np. starsze jsdom) → hook zwraca fallback/override bez
 * crasha. JEDYNA RÓŻNICA: dolny clamp SZEROKOŚCI w `ResizeObserver`
 * callbacku — v2 wymusza min. 360px, v3 min. 320px (WYSOKOŚĆ identyczna,
 * 240px w obu). To realna różnica semantyki (nie przypadkowa rozbieżność
 * do uśrednienia po cichu) — zachowana przez PARAMETRY `minWidth`/
 * `minHeight` (dwie liczby, nie jeden obiekt — każdy wołający przekazuje
 * swoją dotychczasową stałą modułową jako literał, więc wartość jest
 * stabilna między renderami, tak jak w oryginałach, gdzie
 * `MIN_CANVAS_WIDTH_PX`/`MIN_CANVAS_HEIGHT_PX` były stałymi modułowymi
 * używanymi wewnątrz efektu bez figurowania w tablicy zależności).
 */
import { useEffect, useState, type RefObject } from 'react';

export interface UseMeasuredSizeOverride {
  readonly width?: number;
  readonly height?: number;
}

export interface MeasuredSize {
  readonly width: number;
  readonly height: number;
}

export function useMeasuredSize(
  ref: RefObject<HTMLDivElement>,
  fallbackWidth: number,
  fallbackHeight: number,
  override: UseMeasuredSizeOverride | undefined,
  minWidth: number,
  minHeight: number,
): MeasuredSize {
  const [size, setSize] = useState<MeasuredSize>(() => ({
    width: override?.width ?? fallbackWidth,
    height: override?.height ?? fallbackHeight,
  }));

  useEffect(() => {
    if (override?.width !== undefined && override?.height !== undefined) {
      const next = { width: override.width, height: override.height };
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
      return;
    }
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const next = {
        width: Math.max(minWidth, entry.contentRect.width),
        height: Math.max(minHeight, entry.contentRect.height),
      };
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [override?.width, override?.height, ref, minWidth, minHeight]);

  return size;
}
