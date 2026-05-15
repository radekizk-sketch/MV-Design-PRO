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
 * - `cableLoadingPct[runId]` = max over segments of (I_actual_A / I_max_A) × 100
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
  /** Voltage classification — używane do oszacowania default ampacity gdy
   *  catalog nie zawiera explicit I_max. */
  readonly voltageKv?: number | null;
}

export interface LfDerivedMetrics {
  /** Voltage deviation [%] per station id. Brak metryki → klucz nie obecny. */
  readonly voltageDeviationPctByStationId: ReadonlyMap<string, number>;
  /** Cable run loading [%] per run id. Max po segmentach. */
  readonly cableLoadingPctByRunId: ReadonlyMap<string, number>;
}

/**
 * K30-49: domyślna ampacity per voltage class — używana gdy brak explicit
 * I_max w payload. Wartości typowe dla najczęstszych przekrojów PN-HD 620 S2:
 * - WN (110 kV) → 1200 A (linia napowietrzna AFL-240)
 * - SN (15-30 kV) → 400 A (typowy kabel SN 1×185 XLPE Al)
 * - SN niskie (6-10 kV) → 300 A
 * - nN (0.4-1 kV) → 200 A
 * - default → 400 A
 */
function defaultAmpacityForVoltage(kv: number | null | undefined): number {
  if (kv == null || !Number.isFinite(kv)) return 400;
  if (kv >= 100) return 1200;
  if (kv >= 12) return 400;
  if (kv >= 5) return 300;
  if (kv >= 0.2) return 200;
  return 400;
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

  // Per-cable loading % (max over segments)
  for (const run of cableRuns) {
    const refs = run.segmentRefs ?? [];
    if (refs.length === 0) continue;
    const ampacityA = defaultAmpacityForVoltage(run.voltageKv);
    let maxLoadingPct: number | null = null;
    for (const segRef of refs) {
      const iMetric = getMetric(payload, segRef, 'I_A');
      if (iMetric?.value == null || !Number.isFinite(iMetric.value) || iMetric.value <= 0) continue;
      const loadingPct = (iMetric.value / ampacityA) * 100;
      if (maxLoadingPct === null || loadingPct > maxLoadingPct) {
        maxLoadingPct = loadingPct;
      }
    }
    if (maxLoadingPct !== null) {
      cableLoadingPctByRunId.set(run.id, maxLoadingPct);
    }
  }

  return { voltageDeviationPctByStationId, cableLoadingPctByRunId };
}
