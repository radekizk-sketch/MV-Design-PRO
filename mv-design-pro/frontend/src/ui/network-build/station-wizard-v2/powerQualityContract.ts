/**
 * Power Quality Contract — krok 12 Kreatora KOMPLETNEGO.
 *
 * Standardy:
 *   PN-EN 50160 — Jakość energii elektrycznej w sieciach publicznych
 *   IEEE 519 — Recommended Practice for Harmonic Control
 *   IEC 61000-3-7 — Flicker (PST/PLT) limits
 *   IEC 61000-2-4 — Compatibility levels w sieci HV/MV
 *
 * Limity dla SN (15-20 kV) per PN-EN 50160:
 *   THDu ≤ 8% (Total Harmonic Distortion napięcia)
 *   THDi ≤ 5% (prądowe — limity per IEEE 519 zależne od Isc/IL ratio)
 *   PST ≤ 1.0 (Short-term flicker, 10-min)
 *   PLT ≤ 0.8 (Long-term flicker, 2-h)
 *   ΔU < 4% (skoki napięcia przy załączeniu DER)
 *   Asymetria napięcia < 2%
 */

/** Profil rzędu harmonicznej per PN-EN 50160 Table 1. */
export interface HarmonicProfile {
  /** Rząd harmonicznej (2, 3, 5, ...). */
  readonly order: number;
  /** Limit napięciowy U_h/U1 (%). */
  readonly voltageLimitPct: number;
}

/** Limity PN-EN 50160 Table 1 — sieci publiczne (LV/MV). */
export const EN_50160_HARMONIC_LIMITS: readonly HarmonicProfile[] = [
  { order: 2, voltageLimitPct: 2.0 },
  { order: 3, voltageLimitPct: 5.0 },
  { order: 4, voltageLimitPct: 1.0 },
  { order: 5, voltageLimitPct: 6.0 },
  { order: 6, voltageLimitPct: 0.5 },
  { order: 7, voltageLimitPct: 5.0 },
  { order: 9, voltageLimitPct: 1.5 },
  { order: 11, voltageLimitPct: 3.5 },
  { order: 13, voltageLimitPct: 3.0 },
  { order: 15, voltageLimitPct: 0.5 },
  { order: 17, voltageLimitPct: 2.0 },
  { order: 19, voltageLimitPct: 1.5 },
  { order: 21, voltageLimitPct: 0.5 },
  { order: 23, voltageLimitPct: 1.5 },
  { order: 25, voltageLimitPct: 1.5 },
];

/** THDu limit per PN-EN 50160 § 4.2.2. */
export const EN_50160_THDU_LIMIT_PCT = 8.0;

/** Flicker PST limit per IEC 61000-3-7. */
export const FLICKER_PST_LIMIT = 1.0;

/** Flicker PLT limit per IEC 61000-3-7. */
export const FLICKER_PLT_LIMIT = 0.8;

/** Voltage change limit przy załączeniu DER (PN-EN 50160). */
export const VOLTAGE_CHANGE_DMAX_PCT = 4.0;

/** Pomiar harmonicznej (rząd + amplituda). */
export interface HarmonicMeasurement {
  readonly order: number;
  /** Amplituda Uh/U1 (%). */
  readonly amplitudePct: number;
}

/** Wynik sprawdzenia harmonicznych. */
export interface HarmonicComplianceResult {
  readonly thduPct: number;
  readonly thduWithinLimit: boolean;
  /** Lista naruszeń per rząd. */
  readonly violations: ReadonlyArray<{
    readonly order: number;
    readonly measured: number;
    readonly limit: number;
  }>;
}

/**
 * Sprawdzenie zgodności harmonicznych z PN-EN 50160.
 *   THDu = √(Σ Uh² / U1²) × 100% dla h = 2..50
 */
export function checkHarmonicCompliance(
  measurements: readonly HarmonicMeasurement[],
): HarmonicComplianceResult {
  // THDu = sqrt(sum of squares of all harmonic amplitudes).
  const thduSquared = measurements.reduce((s, m) => s + m.amplitudePct * m.amplitudePct, 0);
  const thdu = Math.sqrt(thduSquared);
  const violations: Array<{ order: number; measured: number; limit: number }> = [];
  for (const m of measurements) {
    const profile = EN_50160_HARMONIC_LIMITS.find((p) => p.order === m.order);
    if (!profile) continue;
    if (m.amplitudePct > profile.voltageLimitPct) {
      violations.push({
        order: m.order,
        measured: m.amplitudePct,
        limit: profile.voltageLimitPct,
      });
    }
  }
  return {
    thduPct: thdu,
    thduWithinLimit: thdu <= EN_50160_THDU_LIMIT_PCT,
    violations,
  };
}

/** Sprawdzenie flicker PST/PLT. */
export interface FlickerComplianceResult {
  readonly pst: number;
  readonly pstWithinLimit: boolean;
  readonly plt: number;
  readonly pltWithinLimit: boolean;
}

export function checkFlickerCompliance(
  pst: number,
  plt: number,
): FlickerComplianceResult {
  return {
    pst,
    pstWithinLimit: pst <= FLICKER_PST_LIMIT,
    plt,
    pltWithinLimit: plt <= FLICKER_PLT_LIMIT,
  };
}

/** Hosting Capacity — maksymalna moc DER w PCC bez naruszenia limitów. */
export interface HostingCapacityInput {
  /** Sk" PCC (MVA) — moc zwarciowa. */
  readonly scCapacityMva: number;
  /** Sk"/Sr ratio for DER (typ. 20 dla LV, 50+ dla MV). */
  readonly scRatioMin: number;
  /** Napięcie znamionowe PCC (kV). */
  readonly nominalVoltageKv: number;
  /** Wymagany margin dla wahań napięcia (%). */
  readonly voltageMarginPct: number;
  /** Aktualne obciążenie linii (% Ith cable). */
  readonly currentLoadingPct: number;
}

export interface HostingCapacityResult {
  /** Max moc DER ograniczona przez Sk"/Sr. */
  readonly limitedBySc_kva: number;
  /** Max moc DER ograniczona przez termikę (% Ith pozostałe). */
  readonly limitedByThermal_kva: number;
  /** Max moc DER ograniczona przez napięcie (ΔU < limit). */
  readonly limitedByVoltage_kva: number;
  /** Min z trzech (wynik finalny). */
  readonly hostingCapacity_kva: number;
}

export function computeHostingCapacity(input: HostingCapacityInput): HostingCapacityResult {
  // Sk constraint: Sr_max = Sk / minRatio
  const limitedBySc = (input.scCapacityMva * 1000) / input.scRatioMin;
  // Thermal: maksymalna rezerwa termiczna (100 - currentLoading%).
  // Aproksymacja: jeśli linia obciążona 50%, można dołożyć 50% jej znamionowej mocy.
  // Konwersja na kVA wymaga znanej Sn linii — tutaj uproszczone × 1000 (representative).
  const thermalReservePct = 100 - input.currentLoadingPct;
  const limitedByThermal = (thermalReservePct / 100) * (input.scCapacityMva * 1000) / 10;
  // Voltage: ΔU = (P·R + Q·X)/U². Aproksymacja: max P ≈ ΔU_limit × U² / R_eq.
  // R_eq ≈ U²/Sk. Stąd: max P_kva = ΔU_limit × Sk × 1000.
  const limitedByVoltage = (input.voltageMarginPct / 100) * input.scCapacityMva * 1000;
  const hosting = Math.min(limitedBySc, limitedByThermal, limitedByVoltage);
  return {
    limitedBySc_kva: limitedBySc,
    limitedByThermal_kva: limitedByThermal,
    limitedByVoltage_kva: limitedByVoltage,
    hostingCapacity_kva: hosting,
  };
}
