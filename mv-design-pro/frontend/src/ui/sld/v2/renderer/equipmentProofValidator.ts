/**
 * equipmentProofValidator — walidacja obciążalności aparatury (Etap 7 z planu).
 *
 * "Equipment proof UI (warning Ith/Idyn) (Etap 7)"
 *
 * Po obliczeniu zwarcia I_k i I_p sprawdza czy aparatura wytrzyma:
 * - I_th (obciążalność termiczna 1s): I_th_aparatu ≥ I_k × √(t_z / 1s)
 * - I_dyn (obciążalność dynamiczna): I_dyn_aparatu ≥ i_p (wartość szczytowa)
 *
 * Norma: IEC 60909-0, IEC 62271 (aparatura SN).
 */

export type EquipmentKind = 'breaker' | 'disconnector' | 'load_switch' | 'earth_switch' | 'cable' | 'busbar';

export interface EquipmentRatings {
  ratedShortTimeCurrentKa: number;
  ratedShortTimeDurationS: number;
  ratedPeakWithstandKa: number;
  ratedCurrentA: number;
}

export interface ShortCircuitData {
  initialSymKa: number;
  peakKa: number;
  thermalEquivalentKa: number;
  faultDurationS: number;
  steadyStateKa: number;
}

export interface EquipmentProofInput {
  equipmentKind: EquipmentKind;
  ratings: EquipmentRatings;
  faultData: ShortCircuitData;
  loadCurrentA: number;
}

export type ProofVerdict = 'pass' | 'warning' | 'fail';

export interface EquipmentProofResult {
  verdict: ProofVerdict;
  thermalCheckPass: boolean;
  dynamicCheckPass: boolean;
  loadCheckPass: boolean;
  thermalMarginPercent: number;
  dynamicMarginPercent: number;
  loadMarginPercent: number;
  failures: string[];
  warnings: string[];
}

const WARNING_MARGIN_PERCENT = 20;

export function validateEquipmentProof({
  equipmentKind,
  ratings,
  faultData,
  loadCurrentA,
}: EquipmentProofInput): EquipmentProofResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  // Thermal check: I_th_equip × √t_rated ≥ I_k_thermal × √t_fault
  const thermalCapacityKa2s = ratings.ratedShortTimeCurrentKa ** 2 * ratings.ratedShortTimeDurationS;
  const thermalRequiredKa2s = faultData.thermalEquivalentKa ** 2 * faultData.faultDurationS;
  const thermalMargin = (thermalCapacityKa2s - thermalRequiredKa2s) / thermalCapacityKa2s;
  const thermalMarginPercent = Math.round(thermalMargin * 1000) / 10;
  const thermalCheckPass = thermalCapacityKa2s >= thermalRequiredKa2s;

  if (!thermalCheckPass) {
    failures.push(
      `Wytrzymałość termiczna niewystarczająca: I_th_eq=${ratings.ratedShortTimeCurrentKa} kA/${ratings.ratedShortTimeDurationS}s < I_th_fault=${faultData.thermalEquivalentKa} kA/${faultData.faultDurationS}s.`,
    );
  } else if (thermalMargin * 100 < WARNING_MARGIN_PERCENT) {
    warnings.push(
      `Margines termiczny ${thermalMarginPercent.toFixed(1)}% < ${WARNING_MARGIN_PERCENT}%.`,
    );
  }

  // Dynamic check: I_dyn_equip ≥ i_p
  const dynamicMargin =
    (ratings.ratedPeakWithstandKa - faultData.peakKa) / ratings.ratedPeakWithstandKa;
  const dynamicMarginPercent = Math.round(dynamicMargin * 1000) / 10;
  const dynamicCheckPass = ratings.ratedPeakWithstandKa >= faultData.peakKa;

  if (!dynamicCheckPass) {
    failures.push(
      `Wytrzymałość dynamiczna niewystarczająca: i_p_eq=${ratings.ratedPeakWithstandKa} kA < i_p_fault=${faultData.peakKa} kA.`,
    );
  } else if (dynamicMargin * 100 < WARNING_MARGIN_PERCENT) {
    warnings.push(
      `Margines dynamiczny ${dynamicMarginPercent.toFixed(1)}% < ${WARNING_MARGIN_PERCENT}%.`,
    );
  }

  // Load current check: I_n_equip ≥ I_n_load
  const loadMargin = (ratings.ratedCurrentA - loadCurrentA) / ratings.ratedCurrentA;
  const loadMarginPercent = Math.round(loadMargin * 1000) / 10;
  const loadCheckPass = ratings.ratedCurrentA >= loadCurrentA;

  if (!loadCheckPass) {
    failures.push(
      `Prąd znamionowy niewystarczający: I_n_eq=${ratings.ratedCurrentA} A < I_load=${loadCurrentA} A.`,
    );
  } else if (loadMargin * 100 < WARNING_MARGIN_PERCENT) {
    warnings.push(
      `Margines prądu znamionowego ${loadMarginPercent.toFixed(1)}% < ${WARNING_MARGIN_PERCENT}%.`,
    );
  }

  // Earth switch nie wymaga full thermal — relaxed check
  if (equipmentKind === 'earth_switch') {
    // OK — uziemnik nie wyłącza prądu, tylko musi wytrzymać zwarcie 1s
  }

  let verdict: ProofVerdict;
  if (failures.length > 0) {
    verdict = 'fail';
  } else if (warnings.length > 0) {
    verdict = 'warning';
  } else {
    verdict = 'pass';
  }

  return {
    verdict,
    thermalCheckPass,
    dynamicCheckPass,
    loadCheckPass,
    thermalMarginPercent,
    dynamicMarginPercent,
    loadMarginPercent,
    failures,
    warnings,
  };
}

export function describeProofVerdict(verdict: ProofVerdict): string {
  return {
    pass: 'Aparat wytrzymuje warunki zwarcia (PASS).',
    warning: 'Aparat wytrzymuje, ale margines bezpieczeństwa niski.',
    fail: 'Aparat NIE wytrzymuje warunków zwarcia — wymiana wymagana.',
  }[verdict];
}
