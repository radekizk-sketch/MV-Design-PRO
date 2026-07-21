/**
 * OltcOverlayAdapter — czysta projekcja wyniku regulacji OLTC → overlay
 * (karta SLD-02 §3.5, V12K-045 / V12K-086 overlay wynikowy).
 *
 * Po obliczeniu rozpływu z pętlą OLTC glif transformatora odświeża pozycję
 * zaczepu i pokazuje liczbę przełączeń. Overlay NIGDY nie modyfikuje modelu
 * (sld_rules §B: results as overlay) — czyta wyłącznie `oltc_control`
 * produkowany przez solver (final_positions/switch_counts/converged).
 *
 * RULES (analogiczne do LoadFlow/ZeroSequence adapterów):
 * - NO physics / NO heurystyki — wartości i werdykt z backendu.
 * - Sort element_id ASC (deterministyczny render).
 * - Zero modyfikacji geometrii; tokeny semantyczne, bez hex.
 */

import type { OverlayElement, OverlayPayloadV1, OverlayVisualState } from './overlayTypes';

// =============================================================================
// Backend contract — kształt oltc_control (network_model/solvers/power_flow_oltc)
// =============================================================================

export interface OltcControlResultV1 {
  run_id: string;
  /** Czy pętla regulacji ustabilizowała się (backendowy werdykt). */
  converged: boolean;
  /** Pozycja końcowa zaczepu per gałąź transformatora (branch_id → pozycja). */
  final_positions: Readonly<Record<string, number>>;
  /** Liczba przełączeń per gałąź (branch_id → N). */
  switch_counts?: Readonly<Record<string, number>>;
}

/**
 * Etykieta pozycji zaczepu: "poz. 0", "poz. +3", "poz. −4" (minus typograficzny).
 * Lustro `oltcGlyph.formatTapPositionLabel` — overlay ma własną kopię, by nie
 * wiązać warstwy wyników z warstwą modelu.
 */
export function formatOltcPositionLabel(position: number): string {
  if (position === 0) return 'poz. 0';
  const sign = position > 0 ? '+' : '−';
  return `poz. ${sign}${Math.abs(position)}`;
}

function branchToOverlay(
  branchId: string,
  position: number,
  switchCount: number | undefined,
  converged: boolean,
): OverlayElement {
  const numeric_badges: Record<string, number | null> = {
    tap_position: position,
  };
  if (typeof switchCount === 'number' && Number.isFinite(switchCount)) {
    numeric_badges.switch_count = switchCount;
  }
  // Werdykt z backendu: pętla ustabilizowana → OK; brak zbieżności → ostrzeżenie
  // (regulacja nie osiągnęła nastawy). ZERO fabrykacji — converged to fakt solvera.
  const visual_state: OverlayVisualState = converged ? 'OK' : 'WARNING';
  return {
    element_ref: branchId,
    element_type: 'TransformerBranch',
    visual_state,
    numeric_badges,
    color_token: converged ? 'ok' : 'warning',
    stroke_token: 'normal',
    animation_token: null,
  };
}

/**
 * Główny adapter: OltcControlResultV1 → OverlayPayloadV1.
 *
 * Jeden element overlay per transformator z regulacją (klucz = branch_id).
 * Determinizm: element_id ASC.
 */
export function adaptOltcControlToOverlay(result: OltcControlResultV1): OverlayPayloadV1 {
  const switchCounts = result.switch_counts ?? {};
  const branchIds = Object.keys(result.final_positions).sort((a, b) => a.localeCompare(b));

  const elements = branchIds.map((branchId) =>
    branchToOverlay(branchId, result.final_positions[branchId], switchCounts[branchId], result.converged),
  );

  return {
    run_id: result.run_id,
    analysis_type: 'PF',
    elements,
    legend: [
      {
        label: 'Regulacja ustabilizowana (pozycja końcowa)',
        color_token: 'ok',
        description: null,
      },
      {
        label: 'Brak zbieżności regulacji OLTC',
        color_token: 'warning',
        description: null,
      },
    ],
  };
}
