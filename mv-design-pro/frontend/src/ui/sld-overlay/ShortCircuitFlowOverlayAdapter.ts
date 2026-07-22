/**
 * ShortCircuitFlowOverlayAdapter — czysta projekcja rozpływu prądu zwarciowego
 * → overlay (karta W-C, ZWARCIA-PRO F4 pkt 7; rodzina adapterów wynikowych jak
 * LoadFlow/ZeroSequence/OLTC).
 *
 * Wejście = wiersz kanoniczny wyniku zwarciowego (ZWARCIA-PRO F4 pkt 1):
 * `ShortCircuitRow.branch_contributions` — wkłady źródeł falownikowych do
 * prądów gałęzi z FROZEN solvera (`_build_branch_contributions_for_inverters`,
 * superpozycja) + punkt zwarcia (element_id wiersza). Overlay NIGDY nie
 * modyfikuje modelu (sld_rules §B) i NICZEGO nie liczy poza względną skalą
 * PREZENTACYJNĄ grubości/koloru (proporcja wartości backendu do największej
 * wartości payloadu — klasa przekształceń prezentacyjnych, zero fizyki).
 *
 * RULES (analogiczne do pozostałych adapterów rodziny):
 * - NO physics / NO heurystyki — wartości z backendu; skala względna to
 *   wyłącznie dobór tokenów prezentacji (jak `computeStrokeWidth` prymitywu
 *   `FaultContributionArrow`).
 * - Sort element_ref ASC (deterministyczny render); znacznik punktu zwarcia
 *   zawsze pierwszy.
 * - Tokeny semantyczne, bez hex; badge = pary {źródło: wkład [kA]} z danych.
 * - KIERUNEK: kontrakt danych NIESIE kierunek per wpis ("from_to"/"to_from"),
 *   ale kontrakt `OverlayPayloadV1` (lustro backendu 1:1) nie ma kanału
 *   kierunku — Adapter NIE fabrykuje animacji kierunkowej. DOMKNIĘTE kartą
 *   S-B (ZWARCIA-PRO pkt 7): kierunek płynie OSOBNYM, czysto frontowym
 *   kanałem `useOverlayStore.faultFlow` (`ShortCircuitFlowOverlayInput`) do
 *   kanwy v3 — `v3/canvas/overlay.ts::buildFaultFlowOverlayFromScene` buduje
 *   wpisy per gałąź, `SldCanvasV3` rysuje strzałki prymitywem
 *   `FaultContributionArrow` (skala/kolor tercylowe TEJ SAMEJ klasy co niżej,
 *   jedna prawda: `faultFlowColorTokenForWeight`).
 */

import type { OverlayElement, OverlayPayloadV1, OverlayVisualState } from './overlayTypes';

// =============================================================================
// Kontrakt wejścia — kształt 1:1 z wiersza kanonicznego
// (`enm/canonical_analysis.py::_sc_rozplyw_galeziowy`)
// =============================================================================

export interface ShortCircuitBranchFlowV1 {
  branch_id: string;
  branch_name: string;
  source_id: string;
  from_node_id: string;
  from_node_name: string;
  to_node_id: string;
  to_node_name: string;
  /** Wkład |I| w gałęzi [kA] (projekcja A→kA wykonana w backendzie). */
  i_ka: number | null;
  /** Kierunek z solvera: "from_to" | "to_from". */
  direction: string;
}

export interface ShortCircuitFlowOverlayInput {
  run_id: string;
  /** Token rodzaju zwarcia wiersza kanonicznego („3F"/„2F"/„2F+Z"/„1F"). */
  fault_type: string | null;
  /** Ref elementu punktu zwarcia (element_id wiersza kanonicznego). */
  fault_element_ref: string;
  /** Wpisy rozpływu wiersza kanonicznego (per źródło × gałąź). */
  flows: readonly ShortCircuitBranchFlowV1[];
}

/** Mapowanie tokenu rodzaju zwarcia na `analysis_type` overlay (dane, nie domysł). */
export function faultTypeToOverlayAnalysisType(faultType: string | null): string {
  const token = (faultType ?? '').trim().toUpperCase().replace(/^SC_/, '');
  if (token === '1F') return 'SC_1F';
  if (token === '2F' || token === '2F+Z') return 'SC_2F';
  // „3F" oraz wiersze bez tokenu (defensywnie — wiersz kanoniczny niosący
  // rozpływ zawsze niesie fault_type) → typ trójfazowy rodziny SC.
  return 'SC_3F';
}

// =============================================================================
// Skala prezentacyjna (WYŁĄCZNIE dobór tokenów — zero fizyki)
// =============================================================================

/**
 * Względna waga wkładu gałęzi = największy wkład tej gałęzi / największy wkład
 * payloadu. Deterministyczna proporcja dwóch wartości backendu — ta sama klasa
 * co `computeStrokeWidth` (grubość ∝ wartość, clipping); dobór tokenów niżej.
 */
export function relativeFlowWeight(branchMaxKa: number, payloadMaxKa: number): number {
  if (!Number.isFinite(branchMaxKa) || branchMaxKa <= 0) return 0;
  if (!Number.isFinite(payloadMaxKa) || payloadMaxKa <= 0) return 0;
  return Math.min(branchMaxKa / payloadMaxKa, 1);
}

/** Progi tercyli skali prezentacyjnej (legendy niżej opisują znaczenie). */
const WEIGHT_HIGH = 2 / 3;
const WEIGHT_MID = 1 / 3;

/** Token koloru rozpływu zwarciowego wg tercyli skali względnej — JEDNA
 *  prawda klasyfikacji dla payloadu overlay (niżej) ORAZ strzałek kanwy v3
 *  (karta S-B: `buildFaultFlowOverlayFromScene`). Czysta funkcja progowa —
 *  dobór tokenu prezentacji, zero fizyki. */
export type FaultFlowColorToken = 'ok' | 'warning' | 'critical';

export function faultFlowColorTokenForWeight(weight: number): FaultFlowColorToken {
  if (weight >= WEIGHT_HIGH) return 'critical';
  if (weight >= WEIGHT_MID) return 'warning';
  return 'ok';
}

function weightToVisualState(weight: number): OverlayVisualState {
  const token = faultFlowColorTokenForWeight(weight);
  return token === 'critical' ? 'CRITICAL' : token === 'warning' ? 'WARNING' : 'OK';
}

const VISUAL_STATE_TO_COLOR_TOKEN: Readonly<Record<OverlayVisualState, string>> = Object.freeze({
  OK: 'ok',
  WARNING: 'warning',
  CRITICAL: 'critical',
  INACTIVE: 'inactive',
});

// =============================================================================
// Adapter główny
// =============================================================================

interface BranchGroup {
  branchId: string;
  /** Pary {source_id → i_ka} — wprost z danych, klucze posortowane ASC. */
  badges: Record<string, number | null>;
  maxKa: number;
}

function groupFlowsByBranch(flows: readonly ShortCircuitBranchFlowV1[]): BranchGroup[] {
  const byBranch = new Map<string, ShortCircuitBranchFlowV1[]>();
  for (const flow of flows) {
    const list = byBranch.get(flow.branch_id) ?? [];
    list.push(flow);
    byBranch.set(flow.branch_id, list);
  }
  const branchIds = [...byBranch.keys()].sort((a, b) => a.localeCompare(b));
  return branchIds.map((branchId) => {
    const entries = (byBranch.get(branchId) ?? [])
      .slice()
      .sort((a, b) => a.source_id.localeCompare(b.source_id));
    const badges: Record<string, number | null> = {};
    let maxKa = 0;
    for (const entry of entries) {
      badges[entry.source_id] = entry.i_ka;
      if (entry.i_ka !== null && Number.isFinite(entry.i_ka) && entry.i_ka > maxKa) {
        maxKa = entry.i_ka;
      }
    }
    return { branchId, badges, maxKa };
  });
}

/**
 * Główny adapter: rozpływ wiersza kanonicznego → OverlayPayloadV1.
 *
 * Elementy: znacznik punktu zwarcia (pierwszy, animacja `pulse` — znacznik
 * miejsca, NIE kierunek) + jeden element per gałąź z wkładem (element_ref =
 * branch_id, badges = wkłady per źródło [kA], tokeny grubości/koloru wg skali
 * względnej). Puste wejście → payload z samym znacznikiem punktu zwarcia.
 * Determinizm: gałęzie ASC, źródła ASC.
 */
export function adaptShortCircuitFlowToOverlay(
  input: ShortCircuitFlowOverlayInput,
): OverlayPayloadV1 {
  const groups = groupFlowsByBranch(input.flows);
  const payloadMaxKa = groups.reduce((acc, g) => (g.maxKa > acc ? g.maxKa : acc), 0);

  const faultMarker: OverlayElement = {
    element_ref: input.fault_element_ref,
    element_type: 'Bus',
    visual_state: 'CRITICAL',
    numeric_badges: {},
    color_token: 'critical',
    stroke_token: 'bold',
    animation_token: 'pulse',
  };

  const branchElements = groups.map((group): OverlayElement => {
    const weight = relativeFlowWeight(group.maxKa, payloadMaxKa);
    const visual_state = weightToVisualState(weight);
    return {
      element_ref: group.branchId,
      element_type: 'LineBranch',
      visual_state,
      numeric_badges: group.badges,
      color_token: VISUAL_STATE_TO_COLOR_TOKEN[visual_state],
      stroke_token: weight >= WEIGHT_MID ? 'bold' : 'normal',
      animation_token: null,
    };
  });

  return {
    run_id: input.run_id,
    analysis_type: faultTypeToOverlayAnalysisType(input.fault_type),
    elements: [faultMarker, ...branchElements],
    legend: [
      { label: 'Miejsce zwarcia (wybrany punkt)', color_token: 'critical', description: null },
      {
        label: 'Wkład falownikowy duży (≥ 66% największego wkładu)',
        color_token: 'critical',
        description: 'Skala względna prezentacji — wartości [kA] z solvera IEC 60909.',
      },
      {
        label: 'Wkład falownikowy średni (33–66%)',
        color_token: 'warning',
        description: null,
      },
      {
        label: 'Wkład falownikowy mały (< 33%)',
        color_token: 'ok',
        description: null,
      },
    ],
  };
}
