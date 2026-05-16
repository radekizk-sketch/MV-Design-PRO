/**
 * K30-50 — SC derived projection: konstruuje SldShortCircuitProjection
 * z RawOverlayPayload (SC_3F / SC_2F / SC_1F analysis types).
 *
 * Pure helper analog do K30-49 `computeLfDerivedMetrics`. Czyta payload
 * elementów typu 'bus' i 'source', mapuje IK_3F_A / IP_A / SK_MVA metrics
 * do shape oczekiwanego przez `SldShortCircuitOverlay`.
 *
 * Mapowanie analysis_type → faultType:
 *   "SC_3F"  → "3F"
 *   "SC_2F"  → "2F"
 *   "SC_1F"  → "1F"
 *   "SC_1F_GROUND" / "SC_1FE" → "1F_GROUND"
 *
 * Source contributions: jeśli payload zawiera elementy typu 'source' z
 * metric "IK_CONTRIB_A", budujemy listę. W przeciwnym razie zwracamy []
 * (overlay nadal renderuje per-bus, bez strzałek).
 */

import { getMetric, type RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';
import type {
  FaultType,
  SldShortCircuitBusResult,
  SldShortCircuitProjection,
  SldShortCircuitSourceContribution,
} from './SldShortCircuitOverlay';

export interface ScBusMeta {
  /** Bus id (ref_id w payload). */
  readonly id: string;
  /** Display label dla chipu (np. "S08 SN"). */
  readonly label?: string;
  /** Pozycja w canvas SVG units. */
  readonly x: number;
  readonly y: number;
  /** Czy ten bus jest fault location (X marker). Backend zwykle ustawia
   *  severity CRITICAL na fault bus — można też explicit flag w meta. */
  readonly isFaultLocation?: boolean;
}

export interface ScSourceMeta {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly kind?: SldShortCircuitSourceContribution['sourceKind'];
  /** Bus id, do którego ten source contributes — match z faultBusId. */
  readonly faultBusId?: string;
}

function mapAnalysisTypeToFault(analysisType: string): FaultType | null {
  const upper = analysisType.toUpperCase();
  if (upper.includes('SC_3F') || upper === 'SC' || upper.includes('3F')) return '3F';
  if (upper.includes('SC_2F') || upper.includes('2F')) return '2F';
  if (upper.includes('1F_GROUND') || upper.includes('1FE') || upper.includes('1F_EARTH')) return '1F_GROUND';
  if (upper.includes('SC_1F') || upper.includes('1F')) return '1F';
  return null;
}

export function computeScProjection(
  payload: RawOverlayPayload | null,
  busMetas: readonly ScBusMeta[],
  sourceMetas: readonly ScSourceMeta[] = [],
): SldShortCircuitProjection | null {
  if (!payload) return null;
  const faultType = mapAnalysisTypeToFault(payload.analysis_type);
  if (faultType === null) return null;

  // Per-bus results
  const busResults: SldShortCircuitBusResult[] = [];
  for (const bus of busMetas) {
    const ik = getMetric(payload, bus.id, 'IK_3F_A');
    if (ik?.value == null || !Number.isFinite(ik.value)) continue;
    const ip = getMetric(payload, bus.id, 'IP_A');
    const ith = getMetric(payload, bus.id, 'ITH_A');
    const ikSteady = getMetric(payload, bus.id, 'IK_A');
    // Convert A → kA
    const toKa = (v: number | null | undefined): number | undefined =>
      v != null && Number.isFinite(v) ? v / 1000 : undefined;
    const ikkA = ik.value / 1000;
    busResults.push({
      busId: bus.id,
      x: bus.x,
      y: bus.y,
      label: bus.label,
      ikkA,
      ipkA: toKa(ip?.value),
      ithkA: toKa(ith?.value),
      ikSteadyKA: toKa(ikSteady?.value),
      isFaultLocation: bus.isFaultLocation
        ?? payload.elements[bus.id]?.severity === 'CRITICAL',
    });
  }
  if (busResults.length === 0) return null;

  // Source contributions (gdy backend dostarcza)
  const sourceContributions: SldShortCircuitSourceContribution[] = [];
  for (const src of sourceMetas) {
    const targetBusId = src.faultBusId
      ?? busResults.find((b) => b.isFaultLocation)?.busId
      ?? busResults[0]?.busId;
    if (!targetBusId) continue;
    const contrib = getMetric(payload, src.id, 'IK_CONTRIB_A');
    if (contrib?.value == null || !Number.isFinite(contrib.value)) continue;
    sourceContributions.push({
      sourceId: src.id,
      sourceLabel: src.label,
      sourceX: src.x,
      sourceY: src.y,
      faultBusId: targetBusId,
      ikContribKA: contrib.value / 1000,
      sourceKind: src.kind,
    });
  }

  return {
    faultType,
    busResults,
    sourceContributions: sourceContributions.length > 0 ? sourceContributions : undefined,
    runId: payload.run_id,
  };
}
