/**
 * Selektywność czasowo-prądowa (Naprawa C.7 — audyt specjalisty zabezpieczeń).
 *
 * Implementuje obliczenie ∆t (time grading) dla par zabezpieczeń
 * upstream/downstream zgodnie z IEC 60255-151:2009.
 *
 * Charakterystyki IDMT:
 *   t(I) = (TMS · k) / ((I/Is)^α - 1)
 *
 * gdzie:
 *   - SI (Standard Inverse): k=0.14, α=0.02
 *   - VI (Very Inverse): k=13.5, α=1
 *   - EI (Extremely Inverse): k=80, α=2
 *   - LTI (Long Time Inverse): k=120, α=1
 *
 * Reguła selektywności (PN-EN 60255):
 *   - ∆t = t_upstream(I_max) - t_downstream(I_max) ≥ 0.3 s
 *   - Margines bezpieczeństwa: 0.4 s w sieciach kablowych, 0.5 s w napowietrznych
 *
 * Zasada NOT-A-SOLVER: te obliczenia są pure-functional dla walidacji UI;
 * pełna analiza koordynacji wykonywana przez backend.protection_iec60255.
 */

export type IecCurveType = 'SI' | 'VI' | 'EI' | 'LTI' | 'DT';

export interface IdmtCurveParams {
  readonly type: IecCurveType;
  /** Time Multiplier Setting (typowo 0.05–1.0). */
  readonly tms: number;
  /** Pickup current Is [A]. */
  readonly pickup_a: number;
  /** Definite time delay [s] dla DT (Definite Time). */
  readonly definite_time_s?: number;
}

const IEC_60255_CONSTANTS: Record<Exclude<IecCurveType, 'DT'>, { k: number; alpha: number }> = {
  SI: { k: 0.14, alpha: 0.02 },
  VI: { k: 13.5, alpha: 1.0 },
  EI: { k: 80.0, alpha: 2.0 },
  LTI: { k: 120.0, alpha: 1.0 },
};

/**
 * Oblicza czas wyzwolenia zabezpieczenia IDMT przy prądzie I [A].
 * Zwraca null gdy I < pickup (zabezpieczenie nie pobudza).
 * Dla DT zwraca stały definite_time_s niezależnie od I (jeśli I > pickup).
 */
export function computeTripTime(curve: IdmtCurveParams, current_a: number): number | null {
  if (current_a <= curve.pickup_a) return null;

  if (curve.type === 'DT') {
    return curve.definite_time_s ?? 0;
  }

  const ratio = current_a / curve.pickup_a;
  const c = IEC_60255_CONSTANTS[curve.type];
  const denominator = Math.pow(ratio, c.alpha) - 1;
  if (denominator <= 0) return null;
  return (curve.tms * c.k) / denominator;
}

export interface TimeGradingResult {
  /** Prąd zwarciowy w punkcie analizy [A]. */
  readonly fault_current_a: number;
  /** Czas wyzwolenia zabezpieczenia nadrzędnego [s]. */
  readonly t_upstream_s: number | null;
  /** Czas wyzwolenia zabezpieczenia podrzędnego [s]. */
  readonly t_downstream_s: number | null;
  /** Margines selektywności ∆t [s]. */
  readonly delta_t_s: number | null;
  /** Wymagane minimum ∆t [s]. */
  readonly required_delta_t_s: number;
  /** Czy selektywność jest zachowana. */
  readonly is_selective: boolean;
  /** Kod statusu. */
  readonly status:
    | 'selective'
    | 'insufficient_margin'
    | 'inverted_grading'
    | 'downstream_no_pickup'
    | 'upstream_no_pickup';
  /** Polski opis statusu. */
  readonly message_pl: string;
}

/**
 * Sprawdza selektywność pary zabezpieczeń przy zadanym prądzie zwarcia.
 *
 * @param upstream Krzywa nadrzędnego zabezpieczenia (bliżej źródła).
 * @param downstream Krzywa podrzędnego zabezpieczenia (bliżej zwarcia).
 * @param fault_current_a Prąd zwarciowy w analizowanym punkcie.
 * @param required_delta_t_s Wymagany margines (domyślnie 0.3 s wg PN-EN 60255).
 */
export function validateTimeGrading(
  upstream: IdmtCurveParams,
  downstream: IdmtCurveParams,
  fault_current_a: number,
  required_delta_t_s: number = 0.3,
): TimeGradingResult {
  const t_up = computeTripTime(upstream, fault_current_a);
  const t_down = computeTripTime(downstream, fault_current_a);

  if (t_down === null) {
    return {
      fault_current_a,
      t_upstream_s: t_up,
      t_downstream_s: null,
      delta_t_s: null,
      required_delta_t_s,
      is_selective: false,
      status: 'downstream_no_pickup',
      message_pl:
        `Zabezpieczenie podrzędne nie pobudza przy I=${fault_current_a.toFixed(0)} A `
        + `(I < pickup ${downstream.pickup_a} A). Brak ochrony — sprawdź ustawienia.`,
    };
  }

  if (t_up === null) {
    return {
      fault_current_a,
      t_upstream_s: null,
      t_downstream_s: t_down,
      delta_t_s: null,
      required_delta_t_s,
      is_selective: false,
      status: 'upstream_no_pickup',
      message_pl:
        `Zabezpieczenie nadrzędne nie pobudza przy I=${fault_current_a.toFixed(0)} A. `
        + `Selektywność jest zachowana, ale wymaga sprawdzenia ochrony rezerwowej.`,
    };
  }

  const delta_t = t_up - t_down;

  if (delta_t < 0) {
    return {
      fault_current_a,
      t_upstream_s: t_up,
      t_downstream_s: t_down,
      delta_t_s: delta_t,
      required_delta_t_s,
      is_selective: false,
      status: 'inverted_grading',
      message_pl:
        `Inwersja koordynacji: t_nadrzędne (${t_up.toFixed(2)} s) < t_podrzędne `
        + `(${t_down.toFixed(2)} s). Nadrzędne wyzwoli pierwsze — błąd selektywności.`,
    };
  }

  if (delta_t < required_delta_t_s) {
    return {
      fault_current_a,
      t_upstream_s: t_up,
      t_downstream_s: t_down,
      delta_t_s: delta_t,
      required_delta_t_s,
      is_selective: false,
      status: 'insufficient_margin',
      message_pl:
        `Niewystarczający margines: ∆t = ${delta_t.toFixed(2)} s < `
        + `${required_delta_t_s} s wymagane (PN-EN 60255). Zwiększ TMS nadrzędnego `
        + `albo zmień charakterystykę.`,
    };
  }

  return {
    fault_current_a,
    t_upstream_s: t_up,
    t_downstream_s: t_down,
    delta_t_s: delta_t,
    required_delta_t_s,
    is_selective: true,
    status: 'selective',
    message_pl:
      `Selektywność OK: ∆t = ${delta_t.toFixed(2)} s ≥ ${required_delta_t_s} s. `
      + `t_podrzędne=${t_down.toFixed(2)} s, t_nadrzędne=${t_up.toFixed(2)} s.`,
  };
}

/**
 * Sprawdza selektywność dla zakresu prądów (od pickup_downstream do I_max).
 * Zwraca rekomendowany ∆t_min dla całego zakresu i listę krytycznych punktów.
 */
export interface TimeGradingRangeResult {
  readonly is_selective_over_range: boolean;
  readonly worst_delta_t_s: number;
  readonly worst_at_current_a: number;
  readonly required_delta_t_s: number;
  readonly samples: ReadonlyArray<TimeGradingResult>;
  readonly summary_pl: string;
}

export function validateTimeGradingRange(
  upstream: IdmtCurveParams,
  downstream: IdmtCurveParams,
  i_min_a: number,
  i_max_a: number,
  required_delta_t_s: number = 0.3,
  samples_count: number = 20,
): TimeGradingRangeResult {
  if (i_max_a <= i_min_a || samples_count < 2) {
    throw new Error('i_max_a musi być > i_min_a i samples_count >= 2');
  }

  const samples: TimeGradingResult[] = [];
  const step = (i_max_a - i_min_a) / (samples_count - 1);
  for (let i = 0; i < samples_count; i++) {
    const I = i_min_a + i * step;
    samples.push(validateTimeGrading(upstream, downstream, I, required_delta_t_s));
  }

  // Znajdź punkt z najgorszym (najmniejszym) ∆t w zakresie gdzie oba pobudzają.
  let worst_delta = Infinity;
  let worst_current = i_max_a;
  let any_non_selective = false;

  for (const s of samples) {
    if (s.delta_t_s !== null && s.delta_t_s < worst_delta) {
      worst_delta = s.delta_t_s;
      worst_current = s.fault_current_a;
    }
    if (!s.is_selective && s.status !== 'upstream_no_pickup') {
      any_non_selective = true;
    }
  }

  const is_selective_over_range = !any_non_selective && worst_delta >= required_delta_t_s;

  return {
    is_selective_over_range,
    worst_delta_t_s: worst_delta === Infinity ? Number.NaN : worst_delta,
    worst_at_current_a: worst_current,
    required_delta_t_s,
    samples,
    summary_pl: is_selective_over_range
      ? `Selektywność zachowana w zakresie ${i_min_a.toFixed(0)}–${i_max_a.toFixed(0)} A. `
        + `Najgorszy margines: ∆t = ${worst_delta.toFixed(2)} s @ I = ${worst_current.toFixed(0)} A.`
      : `Selektywność NIEZACHOWANA. Najgorszy punkt: ∆t = `
        + `${Number.isFinite(worst_delta) ? worst_delta.toFixed(2) : '—'} s @ `
        + `I = ${worst_current.toFixed(0)} A. Wymagane co najmniej ${required_delta_t_s} s.`,
  };
}

/** Zwraca rekomendowany margines ∆t dla typu sieci. */
export function recommendedDeltaT(networkType: 'cable' | 'overhead_line' | 'mixed'): number {
  switch (networkType) {
    case 'cable':
      return 0.3; // Sieci kablowe: krótsze opóźnienia możliwe
    case 'overhead_line':
      return 0.5; // Napowietrzne: dłuższy margines (drgania, wiatr)
    case 'mixed':
      return 0.4; // Mieszane
  }
}
