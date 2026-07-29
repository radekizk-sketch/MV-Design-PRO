/**
 * RawToTypedOverlayAdapter — rekoncyliacja dwóch kontraktów overlay (V12K-088).
 *
 * Produkcyjny backend `/results/v1` zwraca `overlay_payload` z `elements` jako
 * SŁOWNIK (RawOverlayPayload: ref_id → RawOverlayElement). Typowana warstwa
 * runtime (OverlayPayloadV1 + useOverlayStore + V12OverlayModeController +
 * useOverlayRuntime) oczekuje `elements` jako TABLICY (OverlayElement). Dotąd
 * `loadOverlay` NIE był wołany w produkcji (`void useOverlayStore; // future`),
 * więc typowana rodzina adapterów (LoadFlow/ZeroSequence/OLTC) nie miała
 * producenta. Ten czysty adapter zamyka lukę: raw → typed.
 *
 * RULES (jak pozostałe adaptery overlay):
 * - NO physics / NO heurystyki — wartości i severity z backendu.
 * - Sort element_ref ASC (deterministyczny render).
 * - Tokeny semantyczne (bez hex); metryki jako numeric_badges (display-only).
 */

import type { RawOverlayPayload } from './rawResultOverlayStore';
import type { OverlayElement, OverlayPayloadV1, OverlayVisualState } from './overlayTypes';

const SEVERITY_TO_VISUAL_STATE: Readonly<Record<string, OverlayVisualState>> = Object.freeze({
  INFO: 'OK',
  WARNING: 'WARNING',
  IMPORTANT: 'WARNING',
  CRITICAL: 'CRITICAL',
});

const VISUAL_STATE_TO_COLOR_TOKEN: Readonly<Record<OverlayVisualState, string>> = Object.freeze({
  OK: 'ok',
  WARNING: 'warning',
  CRITICAL: 'critical',
  INACTIVE: 'inactive',
});

function rawSeverityToVisualState(severity: string): OverlayVisualState {
  return SEVERITY_TO_VISUAL_STATE[severity] ?? 'OK';
}

function rawElementToTyped(ref: string, raw: RawOverlayPayload['elements'][string]): OverlayElement {
  const visual_state = rawSeverityToVisualState(raw.severity);
  const numeric_badges: Record<string, number | null> = {};
  const metrics = raw.metrics ?? {};
  for (const code of Object.keys(metrics).sort((a, b) => a.localeCompare(b))) {
    numeric_badges[code] = metrics[code]?.value ?? null;
  }
  return {
    element_ref: raw.ref_id || ref,
    element_type: raw.kind,
    visual_state,
    numeric_badges,
    color_token: VISUAL_STATE_TO_COLOR_TOKEN[visual_state],
    stroke_token: visual_state === 'CRITICAL' ? 'thick' : 'normal',
    animation_token: null,
  };
}

/**
 * Konwersja produkcyjnego RawOverlayPayload (elements: dict) → typowanego
 * OverlayPayloadV1 (elements: array), konsumowanego przez useOverlayStore.
 * Determinizm: element_ref ASC. Pusty payload → pusty overlay (uczciwy stan
 * zerowy). Zwraca null gdy brak elementów (nic do załadowania).
 */
export function adaptRawOverlayToTyped(raw: RawOverlayPayload | null): OverlayPayloadV1 | null {
  if (!raw || !raw.elements) return null;
  const refs = Object.keys(raw.elements).sort((a, b) => a.localeCompare(b));
  if (refs.length === 0) return null;

  const elements = refs.map((ref) => rawElementToTyped(ref, raw.elements[ref]));
  return {
    run_id: raw.run_id,
    analysis_type: raw.analysis_type,
    elements,
    legend: [],
  };
}
