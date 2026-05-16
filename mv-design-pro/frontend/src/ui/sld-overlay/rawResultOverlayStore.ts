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
}

interface RawResultOverlayStore {
  readonly payload: RawOverlayPayload | null;
  readonly setPayload: (payload: RawOverlayPayload | null) => void;
  readonly clear: () => void;
}

export const useRawResultOverlayStore = create<RawResultOverlayStore>((set) => ({
  payload: null,
  setPayload: (payload) => set({ payload }),
  clear: () => set({ payload: null }),
}));

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
