/**
 * ZeroSequenceOverlayAdapter — pure projection backend results → overlay (Pakiet E).
 *
 * RULES (analogiczne do LoadFlowOverlayAdapter):
 * - NO physics calculations (interpretacja w backendzie)
 * - NO heuristics (severity z backendu)
 * - Sort element_id ASC (deterministic render order)
 * - Zero geometry modifications
 *
 * Overlay states dla zero-sequence:
 * - OK: 3I0 / 3U0 w normie
 * - WARNING: 3I0 zbliżone do progu zwarcia doziemnego
 * - CRITICAL: 3U0 wysokie (zwarcie doziemne aktywne)
 */

import type {
  OverlayElement,
  OverlayPayloadV1,
  OverlayVisualState,
} from './overlayTypes';

// =============================================================================
// Backend contract — minimal shape (matches `EARTHING_GROUND_FAULT_SN` proof)
// =============================================================================

export type ZeroSequenceSeverity = 'INFO' | 'WARN' | 'HIGH';

export interface ZeroSequenceElementResult {
  /** Stable element ID (used as overlay key) */
  element_id: string;
  /** 3I0 — prąd kolejności zerowej [A] */
  i0_a?: number;
  /** 3U0 — napięcie kolejności zerowej [kV] */
  u0_kv?: number;
  /** Kierunek prądu doziemnego (komentarz: 'forward'|'reverse'|'none') */
  direction?: 'forward' | 'reverse' | 'none';
  /** Severity z backendowej interpretacji */
  severity: ZeroSequenceSeverity;
}

export interface ZeroSequenceResultV1 {
  run_id: string;
  /** Czy zwarcie doziemne aktywne (gdy true → tworzymy CRITICAL marker) */
  ground_fault_active: boolean;
  /** Per-element results */
  elements: ReadonlyArray<ZeroSequenceElementResult>;
}

// =============================================================================
// Severity → visual state (deterministic, no physics)
// =============================================================================

const SEVERITY_TO_VISUAL_STATE: Readonly<Record<ZeroSequenceSeverity, OverlayVisualState>> =
  Object.freeze({
    INFO: 'OK',
    WARN: 'WARNING',
    HIGH: 'CRITICAL',
  });

const SEVERITY_TO_COLOR_TOKEN: Readonly<Record<ZeroSequenceSeverity, string>> = Object.freeze({
  INFO: 'ok',
  WARN: 'warning',
  HIGH: 'critical',
});

/**
 * Konwersja per-element result → OverlayElement.
 */
function elementToOverlay(el: ZeroSequenceElementResult): OverlayElement {
  const numeric_badges: Record<string, number | null> = {};
  if (el.i0_a !== undefined) numeric_badges.i0_a = el.i0_a;
  if (el.u0_kv !== undefined) numeric_badges.u0_kv = el.u0_kv;

  // direction is encoded as animation token (forward = pulse, reverse = pulse-reverse)
  let animation_token: string | null = null;
  if (el.direction === 'forward') animation_token = 'flow_forward';
  else if (el.direction === 'reverse') animation_token = 'flow_reverse';

  return {
    element_ref: el.element_id,
    element_type: 'ZeroSequenceNode',
    visual_state: SEVERITY_TO_VISUAL_STATE[el.severity],
    numeric_badges,
    color_token: SEVERITY_TO_COLOR_TOKEN[el.severity],
    stroke_token: el.severity === 'HIGH' ? 'thick' : 'normal',
    animation_token,
  };
}

/**
 * Główny adapter: ZeroSequenceResultV1 → OverlayPayloadV1.
 *
 * Determinizm: element_id ASC sort.
 */
export function adaptZeroSequenceToOverlay(
  result: ZeroSequenceResultV1,
): OverlayPayloadV1 {
  const sortedElements = [...result.elements].sort((a, b) =>
    a.element_id.localeCompare(b.element_id),
  );

  const overlayElements = sortedElements.map(elementToOverlay);

  return {
    run_id: result.run_id,
    analysis_type: 'EARTHING_GROUND_FAULT_SN',
    elements: overlayElements,
    legend: [
      {
        label: 'OK (3I₀ / 3U₀ w normie)',
        color_token: 'ok',
        description: null,
      },
      {
        label: 'Ostrzeżenie (zbliżenie do progu)',
        color_token: 'warning',
        description: null,
      },
      {
        label: result.ground_fault_active
          ? 'Zwarcie doziemne aktywne'
          : 'Krytyczne 3U₀',
        color_token: 'critical',
        description: null,
      },
    ],
  };
}
