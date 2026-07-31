/**
 * K30-49: derived LF metrics — voltage deviation per station + loading %
 * per cable run.
 *
 * Wyciąga z raw overlay payload pochodne wartości używane przez K30-44
 * (voltage deviation classifier) i K30-45 (cable loading overlay):
 *
 * - `stationVoltageDeviationPct[stationId]` =
 *     ((U_actual_kV - U_nominal_kV) / U_nominal_kV) × 100
 *
 * - `cableLoadingPct[runId]` = max po segmentach z metryki `LOADING_PCT`
 *   POLICZONEJ PRZEZ BACKEND (interpretacja kanoniczna: `enm/canonical_analysis.py`,
 *   mapowanie na overlay: `domain/result_builder_v1.py`).
 *
 * OBCIĄŻENIE NIE JEST JUŻ LICZONE TUTAJ (K7-B, 2026-07-31). Do tej karty ten plik
 * dzielił prąd z wyniku przez ampacyjność ZGADYWANĄ z poziomu napięcia
 * (`defaultAmpacityForVoltage`: 1200 / 400 / 300 / 200 A „dla typowych przekrojów").
 * Projektant widział procent wykorzystania kabla wyliczony względem przekroju,
 * którego w modelu nie ma — a backend całą tę drogę przechodzi na rzeczywistym
 * prądzie znamionowym gałęzi i wystawia gotową metrykę. Brak `LOADING_PCT` w wyniku
 * daje teraz BRAK wartości (klucz nieobecny), a nie liczbę z powietrza.
 *
 * Funkcja jest pure — nie subskrybuje store ani nie używa hooks. Caller
 * (SldCanvasV2) decyduje kiedy ją wywołać (typically useMemo z payload deps).
 */

import { getMetric, type RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';

export interface StationLfMeta {
  /** Station ref_id (matches payload elements key after '/sn_bus' translation). */
  readonly id: string;
  /** Nominal voltage at SN bus [kV] — z busVoltageKv z adaptera. */
  readonly busVoltageKv?: number | null;
}

export interface CableRunLfMeta {
  /** Cable run id (matches CableRunRendererPropsLight.id). */
  readonly id: string;
  /** Segment refs należące do tego ciągu — używane do lookup payload metrics. */
  readonly segmentRefs?: readonly string[];
}

export interface LfDerivedMetrics {
  /** Voltage deviation [%] per station id. Brak metryki → klucz nie obecny. */
  readonly voltageDeviationPctByStationId: ReadonlyMap<string, number>;
  /** Cable run loading [%] per run id. Max po segmentach. */
  readonly cableLoadingPctByRunId: ReadonlyMap<string, number>;
}

/** Translate station id → SN bus ref_id (kanon "stn/{hash}/sn_bus"). */
function snBusRefForStation(stationId: string): string {
  return stationId.endsWith('/station')
    ? `${stationId.slice(0, -'/station'.length)}/sn_bus`
    : `${stationId}/sn_bus`;
}

export function computeLfDerivedMetrics(
  payload: RawOverlayPayload | null,
  stations: readonly StationLfMeta[],
  cableRuns: readonly CableRunLfMeta[],
): LfDerivedMetrics {
  const voltageDeviationPctByStationId = new Map<string, number>();
  const cableLoadingPctByRunId = new Map<string, number>();

  if (!payload) {
    return { voltageDeviationPctByStationId, cableLoadingPctByRunId };
  }

  // Tylko LF results dostarczają U_kV / I_A — SC results odrzucamy
  // (mają IK_3F_A który semantycznie różny).
  const isLoadFlow = payload.analysis_type.toLowerCase().includes('load_flow')
    || payload.analysis_type.toLowerCase().includes('power_flow');
  if (!isLoadFlow) {
    return { voltageDeviationPctByStationId, cableLoadingPctByRunId };
  }

  // Per-station ΔU%
  for (const station of stations) {
    const nominalKv = station.busVoltageKv;
    if (nominalKv == null || !Number.isFinite(nominalKv) || nominalKv <= 0) continue;
    const snBusRef = snBusRefForStation(station.id);
    const uMetric = getMetric(payload, snBusRef, 'U_kV');
    if (uMetric?.value == null || !Number.isFinite(uMetric.value)) continue;
    const devPct = ((uMetric.value - nominalKv) / nominalKv) * 100;
    voltageDeviationPctByStationId.set(station.id, devPct);
  }

  // Obciążenie ciągu kablowego [%] — max po segmentach, WPROST z wyniku backendu.
  for (const run of cableRuns) {
    const refs = run.segmentRefs ?? [];
    if (refs.length === 0) continue;
    let maxLoadingPct: number | null = null;
    for (const segRef of refs) {
      const loadingMetric = getMetric(payload, segRef, 'LOADING_PCT');
      if (loadingMetric?.value == null || !Number.isFinite(loadingMetric.value)) continue;
      if (maxLoadingPct === null || loadingMetric.value > maxLoadingPct) {
        maxLoadingPct = loadingMetric.value;
      }
    }
    if (maxLoadingPct !== null) {
      cableLoadingPctByRunId.set(run.id, maxLoadingPct);
    }
  }

  return { voltageDeviationPctByStationId, cableLoadingPctByRunId };
}
