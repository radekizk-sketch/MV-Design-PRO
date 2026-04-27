/**
 * V12OverlayModeController — sync work-mode (V12) → overlay visibility.
 *
 * ARCHITECTURE (binding):
 * - Komponent React montowany RAZ w shellu V12 (`AppShellV12`).
 * - Czyta `activeWorkMode` przez `useAppStateStore`.
 * - Czyta `overlay` (payload) — żeby decydować, czy `zero_sequence` aktywne.
 * - W `useEffect` woła `useOverlayStore.setVisibleOverlays(...)`.
 * - NIE renderuje DOM (zwraca null).
 * - NIE jest store→store subscription — `useEffect` w komponencie React.
 *
 * MULTI-MODE MAPPING (F0 + F1 final):
 *   TE → ∅              (czysta edycja)
 *   TW → results, power_flow, [zero_sequence gdy LF zawiera 3I0/3U0]
 *   TZ → results, protection, zero_sequence (zawsze — testowanie zabezpieczeń)
 *   TP → diagnostics
 *   TA → results, trace_markers, [zero_sequence gdy ground-fault scenario]
 *   TN → results, [zero_sequence gdy ground-fault scenario]
 *
 * DETERMINISM:
 * - `setVisibleOverlays` deduplikuje + lex sort (w overlayStore).
 * - Stałe `WORK_MODE_OVERLAYS_BASE` i `ZERO_SEQ_MODES` są frozen.
 *
 * WHITE BOX:
 * - Czytanie payloadu jest read-only — komponent nie pisze do payloadu.
 */

import { useEffect, useMemo } from 'react';

import { useAppStateStore } from '../app-state/store';
import type { WorkMode } from '../app-state/store';
import { useOverlayStore } from '../sld-overlay/overlayStore';
import type { OverlayKind } from '../sld-overlay/overlayStore';
import type { OverlayPayloadV1 } from '../sld-overlay/overlayTypes';

/**
 * Bazowy mapping work-mode → overlay kinds (BEZ zero_sequence).
 * zero_sequence dodawany dynamicznie zależnie od trybu i obecności danych w payloadzie.
 */
export const WORK_MODE_OVERLAYS_BASE: Readonly<
  Record<WorkMode, ReadonlyArray<OverlayKind>>
> = Object.freeze({
  TE: Object.freeze([]) as ReadonlyArray<OverlayKind>,
  TW: Object.freeze(['results', 'power_flow']) as ReadonlyArray<OverlayKind>,
  TZ: Object.freeze(['results', 'protection']) as ReadonlyArray<OverlayKind>,
  TP: Object.freeze(['diagnostics']) as ReadonlyArray<OverlayKind>,
  TA: Object.freeze(['results', 'trace_markers']) as ReadonlyArray<OverlayKind>,
  TN: Object.freeze(['results']) as ReadonlyArray<OverlayKind>,
});

/**
 * BACKWARD COMPATIBILITY alias for F0 contract.
 * @deprecated use WORK_MODE_OVERLAYS_BASE
 */
export const WORK_MODE_OVERLAYS = WORK_MODE_OVERLAYS_BASE;

/**
 * Tryby, w których zero_sequence ZAWSZE jest aktywne (TZ).
 */
const ZERO_SEQ_ALWAYS_MODES: ReadonlySet<WorkMode> = Object.freeze(new Set<WorkMode>(['TZ']));

/**
 * Tryby, w których zero_sequence jest aktywne TYLKO gdy payload zawiera dane.
 */
const ZERO_SEQ_CONDITIONAL_MODES: ReadonlySet<WorkMode> = Object.freeze(
  new Set<WorkMode>(['TW', 'TA', 'TN']),
);

/**
 * Sprawdza, czy overlay payload zawiera dane sieci kolejności zerowej.
 * Pozytywny: analysis_type === 'EARTHING_GROUND_FAULT_SN' albo elementy mają
 * numeric_badges z i0_a / u0_kv.
 */
export function payloadHasZeroSequence(overlay: OverlayPayloadV1 | null): boolean {
  if (!overlay) return false;
  if (overlay.analysis_type === 'EARTHING_GROUND_FAULT_SN') return true;
  return overlay.elements.some(
    (el) => el.numeric_badges?.i0_a !== undefined || el.numeric_badges?.u0_kv !== undefined,
  );
}

/**
 * Wylicza pełny zestaw overlay kinds dla aktualnego trybu i payloadu.
 * Czysta funkcja — łatwo testowalna.
 */
export function computeVisibleOverlays(
  workMode: WorkMode,
  overlay: OverlayPayloadV1 | null,
): ReadonlyArray<OverlayKind> {
  const base = WORK_MODE_OVERLAYS_BASE[workMode] ?? [];
  const includeZeroSeq =
    ZERO_SEQ_ALWAYS_MODES.has(workMode) ||
    (ZERO_SEQ_CONDITIONAL_MODES.has(workMode) && payloadHasZeroSequence(overlay));
  if (includeZeroSeq) {
    return [...base, 'zero_sequence'];
  }
  return base;
}

/**
 * Headless controller — mounted once at shell level.
 * Returns null (no DOM).
 */
export function V12OverlayModeController(): null {
  const activeWorkMode = useAppStateStore((s) => s.activeWorkMode);
  const overlay = useOverlayStore((s) => s.overlay);
  const setVisibleOverlays = useOverlayStore((s) => s.setVisibleOverlays);

  const kinds = useMemo(
    () => computeVisibleOverlays(activeWorkMode, overlay),
    [activeWorkMode, overlay],
  );

  useEffect(() => {
    setVisibleOverlays(kinds);
  }, [kinds, setVisibleOverlays]);

  return null;
}
