/**
 * rawResultOverlayStore — raw overlay payload from
 * `/api/execution/runs/{run_id}/results/v1` (backend ResultsContractV1).
 *
 * Schemat backend (NIE jest tożsamy z OverlayPayloadV1!):
 *   elements: { [ref_id]: { kind, metrics: { [code]: { value, unit, ... } }, severity, badges } }
 *
 * Adresuje NO-GO #9 (K30-2): v2 canvas (SldWorkspaceContainer) NIE używa
 * typed OverlayPayloadV1 zbiorów. Raw store przechodzi przez bypass —
 * canvas reader robi prosty lookup po ref_id i renderuje metric text.
 *
 * Założenia:
 * - 1 active run/payload (pojedynczy LOAD_FLOW lub SC_3F naraz)
 * - URL ?run=<id> w App.tsx triggeruje fetch + setRawOverlay
 * - SLD canvas (SldWorkspaceContainer) używa selector getMetric(elementRef, code)
 */
import { create } from 'zustand';

export interface RawMetricValue {
  readonly code: string;
  readonly value: number | null;
  readonly unit: string;
  readonly format_hint?: string;
  readonly source?: string;
}

export interface RawOverlayElement {
  readonly ref_id: string;
  readonly kind: string;
  readonly badges: readonly unknown[];
  readonly metrics: Record<string, RawMetricValue>;
  readonly severity: 'INFO' | 'WARNING' | 'IMPORTANT' | 'CRITICAL' | string;
}

export interface RawOverlayPayload {
  readonly run_id: string;
  readonly analysis_type: string;
  readonly elements: Record<string, RawOverlayElement>;
  /** K30-6: solver quality status z global_results (per ResultsContractV1).
   *  Values: 'passing' | 'failed' | 'partial'. Pokazany w legendzie. */
  readonly quality_status?: string | null;
  /** Proof completeness: 'complete' | 'partial'. */
  readonly proof_status?: string | null;
  /** OVERLAY-TIMESTAMP (dług R3/V12K-165): CZAS UKOŃCZENIA BIEGU — UTC ISO z
   *  realnego rekordu runu (`ResultSetV1.run_finished_at` ← `CanonicalRun.finished_at`).
   *  Domyka brak kontraktu z R3 (pochodzenie wyniku niosło run_id bez czasu; kanon
   *  V12K-159 wym. 6-7 wymaga timestampu w danych pochodzenia). `null`/brak ⇒ badge
   *  pochodzenia NIE renderuje wiersza czasu (uczciwy brak, nie fabrykacja). */
  readonly run_finished_at?: string | null;
}

interface RawResultOverlayStore {
  readonly payload: RawOverlayPayload | null;
  /**
   * R4 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.10/15) — POPRZEDNI payload per
   * `analysis_type` (klucz = dokładny łańcuch `analysis_type`; wymiana przy
   * nadejściu nowego biegu tego samego typu). Wyłącznie frontend, ADDYTYWNIE:
   * gdy nadchodzi nowy payload o TYM SAMYM `analysis_type` i INNYM `run_id`,
   * dotychczasowy trafia tu jako „poprzedni" — źródło Δ/trendu trybu
   * porównawczego. Bieg innego typu NIE nadpisuje poprzednika typu bieżącego
   * (trend porównuje wyłącznie kolejne biegi TEJ SAMEJ analizy). ZERO fizyki —
   * to tylko bufor poprzedniego wyniku solvera.
   */
  readonly previousByAnalysisType: Readonly<Record<string, RawOverlayPayload>>;
  readonly setPayload: (payload: RawOverlayPayload | null) => void;
  readonly clear: () => void;
}

export const useRawResultOverlayStore = create<RawResultOverlayStore>((set, get) => ({
  payload: null,
  previousByAnalysisType: {},
  setPayload: (payload) => {
    if (!payload) {
      set({ payload: null });
      return;
    }
    const current = get().payload;
    if (
      current &&
      current.analysis_type === payload.analysis_type &&
      current.run_id !== payload.run_id
    ) {
      set({
        payload,
        previousByAnalysisType: {
          ...get().previousByAnalysisType,
          [current.analysis_type]: current,
        },
      });
      return;
    }
    set({ payload });
  },
  clear: () => set({ payload: null, previousByAnalysisType: {} }),
}));

/**
 * R4 — poprzedni payload dla danego `analysis_type` (lub `null`). Selektor
 * czysty: brak wpisu / brak typu ⇒ `null` (brak porównania, uczciwie). */
export function previousPayloadForAnalysis(
  previousByAnalysisType: Readonly<Record<string, RawOverlayPayload>>,
  analysisType: string | undefined,
): RawOverlayPayload | null {
  if (!analysisType) return null;
  return previousByAnalysisType[analysisType] ?? null;
}

/**
 * Helper: pobierz wartość metryki dla danego elementu (np. U_kV bus,
 * I_A na branch). Zwraca null gdy element/metric nie istnieje.
 */
export function getMetric(
  payload: RawOverlayPayload | null,
  elementRef: string,
  metricCode: string,
): RawMetricValue | null {
  if (!payload) return null;
  const el = payload.elements[elementRef];
  if (!el) return null;
  return el.metrics?.[metricCode] ?? null;
}

/**
 * Helper: formatuj wartość metryki do display string (np. "15.00 kV").
 */
export function formatMetric(metric: RawMetricValue | null): string {
  if (!metric || metric.value === null || metric.value === undefined) return '—';
  const hint = metric.format_hint ?? 'fixed2';
  const value = metric.value;
  let formatted: string;
  if (hint === 'fixed2') formatted = value.toFixed(2);
  else if (hint === 'fixed1') formatted = value.toFixed(1);
  else if (hint === 'fixed0') formatted = value.toFixed(0);
  else formatted = String(value);
  return `${formatted} ${metric.unit}`;
}
