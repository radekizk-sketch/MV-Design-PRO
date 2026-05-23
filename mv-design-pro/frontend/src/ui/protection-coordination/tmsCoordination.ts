/**
 * tmsCoordination — TMS coordination helper (Etap 7 z planu).
 *
 * IEC 60255-151 IDMT — koordynacja selektywności w sekwencji
 * zabezpieczeń (downstream → upstream).
 *
 * Reguła: czas zadziałania upstream ≥ czas downstream + ∆t (CTI, coordination time interval).
 * CTI = 0.2-0.4s dla IEC SI / VI / EI.
 *
 * Rekomendacja: jeśli ∆t < CTI_min, zwiększ TMS upstream tak aby spełnić CTI.
 */

export type CurveType = 'SI' | 'VI' | 'EI' | 'LTI' | 'DT';

export interface IdmtPoint {
  multipleOfPickup: number;
  timeSeconds: number;
}

export interface ProtectionPair {
  downstream: { tms: number; pickup: number; curve: CurveType };
  upstream: { tms: number; pickup: number; curve: CurveType };
  faultCurrent: number; // A
  ctiMin?: number; // s (default 0.3)
}

export interface CoordinationVerdict {
  selective: boolean;
  actualCti: number;
  recommendedTmsAdjustment?: number;
  message: string;
}

const DEFAULT_CTI_S = 0.3;

const IEC_CONSTANTS: Record<CurveType, { k: number; alpha: number }> = {
  SI: { k: 0.14, alpha: 0.02 },
  VI: { k: 13.5, alpha: 1.0 },
  EI: { k: 80.0, alpha: 2.0 },
  LTI: { k: 120, alpha: 1.0 },
  DT: { k: 0, alpha: 0 },
};

/**
 * IEC 60255-151 IDMT operate time:
 *   t(I) = TMS × k / ((I / Ipickup)^alpha - 1)
 */
export function idmtTime(
  current: number,
  pickup: number,
  tms: number,
  curve: CurveType,
): number {
  if (curve === 'DT') {
    return tms; // definite time
  }
  const ratio = current / pickup;
  if (ratio <= 1) return Infinity;
  const { k, alpha } = IEC_CONSTANTS[curve];
  return (tms * k) / (Math.pow(ratio, alpha) - 1);
}

/**
 * Oceń koordynację pary downstream/upstream. Zwraca werdykt + ew. rekomendację TMS.
 */
export function evaluateCoordination(pair: ProtectionPair): CoordinationVerdict {
  const ctiMin = pair.ctiMin ?? DEFAULT_CTI_S;
  const tDownstream = idmtTime(
    pair.faultCurrent,
    pair.downstream.pickup,
    pair.downstream.tms,
    pair.downstream.curve,
  );
  const tUpstream = idmtTime(
    pair.faultCurrent,
    pair.upstream.pickup,
    pair.upstream.tms,
    pair.upstream.curve,
  );

  if (!Number.isFinite(tDownstream) || !Number.isFinite(tUpstream)) {
    return {
      selective: false,
      actualCti: 0,
      message: 'Prąd zwarcia poniżej pickupa — koordynacja niemożliwa.',
    };
  }

  const actualCti = tUpstream - tDownstream;
  if (actualCti >= ctiMin) {
    return {
      selective: true,
      actualCti,
      message: `Koordynacja zachowana: ∆t = ${actualCti.toFixed(3)} s ≥ CTI_min = ${ctiMin.toFixed(2)} s.`,
    };
  }

  // Niekoordynacja — wylicz potrzebny TMS upstream
  const deltaTime = ctiMin - actualCti;
  const tUpstreamRequired = tDownstream + ctiMin;
  const ratio = pair.faultCurrent / pair.upstream.pickup;
  const { k, alpha } = IEC_CONSTANTS[pair.upstream.curve];
  const denominator = Math.pow(ratio, alpha) - 1;
  const newTms =
    pair.upstream.curve === 'DT' ? tUpstreamRequired : (tUpstreamRequired * denominator) / k;
  const tmsAdjustment = newTms - pair.upstream.tms;

  return {
    selective: false,
    actualCti,
    recommendedTmsAdjustment: Math.round(tmsAdjustment * 1000) / 1000,
    message: `Brak selektywności: ∆t = ${actualCti.toFixed(3)} s < CTI_min = ${ctiMin.toFixed(2)} s. Zwiększ TMS upstream o ${tmsAdjustment.toFixed(3)} (deficit ${deltaTime.toFixed(3)} s).`,
  };
}
