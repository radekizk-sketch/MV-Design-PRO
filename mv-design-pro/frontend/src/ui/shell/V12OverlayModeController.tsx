/**
 * V12OverlayModeController — sync work-mode (V12) → overlay visibility.
 *
 * ARCHITECTURE (binding):
 * - Komponent React montowany RAZ w shellu V12 (`AppShellV12`).
 * - Czyta `activeWorkMode` przez `useAppStateStore`.
 * - W `useEffect` woła `useOverlayStore.setVisibleOverlays(...)`.
 * - NIE renderuje DOM (zwraca null).
 * - NIE jest store→store subscription (jednokierunkowe sprzęgnięcie work-mode → overlay).
 *
 * MULTI-MODE MAPPING (F0 baseline; `zero_sequence` dochodzi w F1):
 *   TE → ∅              (czysta edycja)
 *   TW → results, power_flow
 *   TZ → results, protection
 *   TP → diagnostics
 *   TA → results, trace_markers
 *   TN → results
 *
 * DETERMINISM:
 * - `setVisibleOverlays` deduplikuje + lex sort (w overlayStore).
 * - Stała mapa `WORK_MODE_OVERLAYS` jest `Object.freeze`-em.
 *
 * WHITE BOX:
 * - Komponent NIE czyta z `overlayStore` (jednokierunkowo work-mode → overlay).
 */

import { useEffect } from 'react';

import { useAppStateStore } from '../app-state/store';
import type { WorkMode } from '../app-state/store';
import { useOverlayStore } from '../sld-overlay/overlayStore';
import type { OverlayKind } from '../sld-overlay/overlayStore';

/**
 * Mapping work-mode → set of overlay kinds.
 * `zero_sequence` is added in ETAP F1 (after Pakiet E delivers the adapter).
 */
export const WORK_MODE_OVERLAYS: Readonly<Record<WorkMode, ReadonlyArray<OverlayKind>>> =
  Object.freeze({
    TE: Object.freeze([]) as ReadonlyArray<OverlayKind>,
    TW: Object.freeze(['results', 'power_flow']) as ReadonlyArray<OverlayKind>,
    TZ: Object.freeze(['results', 'protection']) as ReadonlyArray<OverlayKind>,
    TP: Object.freeze(['diagnostics']) as ReadonlyArray<OverlayKind>,
    TA: Object.freeze(['results', 'trace_markers']) as ReadonlyArray<OverlayKind>,
    TN: Object.freeze(['results']) as ReadonlyArray<OverlayKind>,
  });

/**
 * Headless controller — mounted once at shell level.
 * Returns null (no DOM).
 */
export function V12OverlayModeController(): null {
  const activeWorkMode = useAppStateStore((s) => s.activeWorkMode);
  const setVisibleOverlays = useOverlayStore((s) => s.setVisibleOverlays);

  useEffect(() => {
    const kinds = WORK_MODE_OVERLAYS[activeWorkMode] ?? [];
    setVisibleOverlays(kinds);
  }, [activeWorkMode, setVisibleOverlays]);

  return null;
}
