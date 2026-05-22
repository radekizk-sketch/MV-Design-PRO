/**
 * Short-Circuit Network Contract — analiza sieciowa SN per IEC 60909.
 *
 * Źródło: Excel MT880 v3 sekcja "4. Obliczenia zwarciowe" + "Zestawienie
 * prądów zwarciowych na przewodach SN i dobór parametrów przekładnika
 * prądowego".
 *
 * Wymagania krok 16 Kreatora (Analiza sieciowa) — wyliczenie:
 *   1. Impedancja zwarciowa systemu: Z_sys = U2/Sz (z mocy zwarciowej GPZ)
 *   2. Impedancja linii zasilającej Z_l = √(R² + X²)
 *   3. Całkowita impedancja zwarciowa Z_c = Z_sys + Z_l
 *   4. Prąd zwarciowy początkowy Ik3 = c·U / (√3·Z_c)
 *   5. Współczynnik szczytowy κ = 1.02 + 0.98·exp(-3·R/X)
 *   6. Prąd udarowy ip = κ·√2·Ik3
 *   7. Prąd cieplny zastępczy Ith = Ik3·√(m+n) per IEC 60909-0 §4.8
 *
 * Dobór CT (po obliczeniu Ik3):
 *   - Ith CT ≥ Ith network (przy 1s)
 *   - Idyn CT ≥ ip network
 *   - I1n CT — typowo 2·Iobl ≥ I1n ≥ 1.2·Iobl (zapas 20-100%)
 *
 * Excel MT880 v3 reference (powery z sekcji 4):
 *   Sz GPZ = 270.43 MVA
 *   Ik3 (bezpośrednio na szynach GPZ) ≈ 10.30 kA
 *   Ik2 = (√3/2) × Ik3 ≈ 8.924 kA
 *   tk = 0.36 s (czas własny CB + nastawa zabezpieczenia)
 *   m = 0.2 (skł. nieokresowa)
 *   n = 1.0 (cieplny wpływ skł. okresowej)
 *   κ = 1.27 (per Excel, dla R/X = 0.46)
 *   Ith = 6.61 kA (po uwzględnieniu tk)
 *   ip = 10.81 kA (udarowy)
 *   Z_total = 1.578 Ω
 *   Ik PCC (za kablem) = 6.035 kA
 */

/**
 * Współczynnik napięcia c per IEC 60909-0 Table 1.
 * cmax dla wartości maksymalnej Ik" (zalecane do doboru aparatury).
 */
export const VOLTAGE_FACTOR_C_MAX = 1.10;
export const VOLTAGE_FACTOR_C_MIN = 1.00;

export interface SystemImpedanceInput {
  /** Moc zwarciowa na szynach GPZ (MVA). */
  readonly shortCircuitPowerMva: number;
  /** Napięcie nominalne (kV). */
  readonly nominalVoltageKv: number;
  /** Stosunek R/X systemu (typowo 0.1 dla sieci 15 kV). */
  readonly rxRatio: number;
  /** Współczynnik napięcia c per IEC 60909-0. */
  readonly voltageFactor?: number;
}

export interface SystemImpedanceResult {
  /** Z systemu (Ω). */
  readonly z_ohm: number;
  /** R systemu (Ω). */
  readonly r_ohm: number;
  /** X systemu (Ω). */
  readonly x_ohm: number;
}

/**
 * Z systemu z mocy zwarciowej GPZ.
 * Z = c·U² / Sz  (per IEC 60909-0 § 3.5)
 */
export function computeSystemImpedance(input: SystemImpedanceInput): SystemImpedanceResult {
  const c = input.voltageFactor ?? VOLTAGE_FACTOR_C_MAX;
  const uKv = input.nominalVoltageKv;
  const sMva = input.shortCircuitPowerMva;
  // Z = c·U²/S, gdzie U w kV, S w MVA → wynik w Ω.
  const z = (c * uKv * uKv) / sMva;
  const rx = input.rxRatio;
  // R/X → R = X·rxRatio, więc R = z·rx/√(1+rx²), X = z/√(1+rx²).
  const denominator = Math.sqrt(1 + rx * rx);
  const x = z / denominator;
  const r = x * rx;
  return { z_ohm: z, r_ohm: r, x_ohm: x };
}

export interface CableLineImpedanceInput {
  /** R jednostkowa Ω/km. */
  readonly r0_ohm_per_km: number;
  /** X jednostkowa Ω/km. */
  readonly x0_ohm_per_km: number;
  /** Długość km. */
  readonly lengthKm: number;
}

export interface CableLineImpedanceResult {
  readonly r_ohm: number;
  readonly x_ohm: number;
  readonly z_ohm: number;
}

export function computeCableLineImpedance(
  input: CableLineImpedanceInput,
): CableLineImpedanceResult {
  const r = input.r0_ohm_per_km * input.lengthKm;
  const x = input.x0_ohm_per_km * input.lengthKm;
  const z = Math.sqrt(r * r + x * x);
  return { r_ohm: r, x_ohm: x, z_ohm: z };
}

/**
 * Wynikowy obwód zwarciowy: system + linia.
 */
export interface TotalCircuitImpedanceResult {
  readonly r_total_ohm: number;
  readonly x_total_ohm: number;
  readonly z_total_ohm: number;
  readonly rxRatio: number;
}

export function combineSystemAndCable(
  sys: SystemImpedanceResult,
  cable: CableLineImpedanceResult,
): TotalCircuitImpedanceResult {
  const r = sys.r_ohm + cable.r_ohm;
  const x = sys.x_ohm + cable.x_ohm;
  const z = Math.sqrt(r * r + x * x);
  return {
    r_total_ohm: r,
    x_total_ohm: x,
    z_total_ohm: z,
    rxRatio: x !== 0 ? r / x : 0,
  };
}

/**
 * Prąd zwarciowy początkowy Ik" 3-fazowy (kA).
 * Ik3 = c·U / (√3·Z)   per IEC 60909-0 § 4.2.
 */
export interface ShortCircuitCurrentInput {
  readonly impedance: TotalCircuitImpedanceResult;
  readonly nominalVoltageKv: number;
  readonly voltageFactor?: number;
}

export interface ShortCircuitCurrentResult {
  /** Ik" 3-fazowy (kA). */
  readonly ik3_ka: number;
  /** Ik" 2-fazowy (kA). */
  readonly ik2_ka: number;
}

export function computeShortCircuitCurrent(
  input: ShortCircuitCurrentInput,
): ShortCircuitCurrentResult {
  const c = input.voltageFactor ?? VOLTAGE_FACTOR_C_MAX;
  const uV = input.nominalVoltageKv * 1000;
  const ik3a = (c * uV) / (Math.sqrt(3) * input.impedance.z_total_ohm);
  return {
    ik3_ka: ik3a / 1000,
    ik2_ka: (ik3a * Math.sqrt(3)) / 2 / 1000,
  };
}

/**
 * Współczynnik szczytowy κ per IEC 60909-0 § 4.3:
 *   κ = 1.02 + 0.98 × exp(-3 × R/X)
 *
 * Dla R/X = 0 (czysto indukcyjny) → κ = 2.0.
 * Dla R/X >> 1 (czysto rezystywny) → κ → 1.02.
 */
export function computePeakFactor(rxRatio: number): number {
  return 1.02 + 0.98 * Math.exp(-3 * rxRatio);
}

/**
 * Prąd udarowy ip = κ·√2·Ik" per IEC 60909-0 § 4.3.
 */
export function computePeakCurrent(ik3_ka: number, kappa: number): number {
  return kappa * Math.sqrt(2) * ik3_ka;
}

/**
 * Prąd cieplny zastępczy Ith per IEC 60909-0 § 4.8:
 *   Ith = Ik" × √(m + n)
 *
 * gdzie:
 *   m — współczynnik skł. nieokresowej (Fig. 12, zależy od tk i R/X)
 *   n — współczynnik skł. okresowej (Fig. 13, zależy od tk i Ik"/Ikss")
 *
 * Dla zwarcia odległego (Ik"/Ikss" ≈ 1) i tk ≥ 0.3 s, typowo n ≈ 1.0.
 * m zależy od R/X i tk — odczytane z wykresu lub aproksymacja.
 */
export function computeThermalEquivalentCurrent(
  ik3_ka: number,
  m: number,
  n: number,
): number {
  return ik3_ka * Math.sqrt(m + n);
}

/**
 * Aproksymacja współczynnika m per IEC 60909-0 Figure 12.
 * Dla tk w sekundach + R/X (rxRatio).
 * Wzór uproszczony: m ≈ (1/(2·f·tk·ln κ)) × (κ²−1) / (2·f·tk)
 * Praktyczna tabela dla 50 Hz:
 *   tk=0.1s: m=0.5-0.7
 *   tk=0.3s: m=0.2-0.4
 *   tk=0.5s: m=0.1-0.25
 *   tk=1.0s: m=0.05-0.15
 */
export function approximateMFactor(tkSec: number, kappa: number): number {
  if (kappa <= 1.02) return 0;
  // Aproksymacja per IEC 60909-0 wzór (12):
  //   m = 1/(2·f·tk·ln κ) × (e^(4·f·tk·ln κ) − 1) ... złożone.
  // Uproszczone: korelacja empiryczna.
  const baseExp = Math.exp(-2 * tkSec);
  return (kappa - 1.02) * baseExp;
}

/**
 * Kompleksowa analiza zwarciowa per Excel MT880 v3 sekcja 4.
 */
export interface FullShortCircuitAnalysisInput {
  readonly system: SystemImpedanceInput;
  readonly cable: CableLineImpedanceInput;
  /** Czas trwania zwarcia (s). */
  readonly faultDurationSec: number;
  /** Współczynnik n per IEC 60909-0 (typowo 1.0 dla zwarcia odległego). */
  readonly nFactor?: number;
}

export interface FullShortCircuitAnalysisResult {
  readonly system: SystemImpedanceResult;
  readonly cable: CableLineImpedanceResult;
  readonly total: TotalCircuitImpedanceResult;
  readonly currents: ShortCircuitCurrentResult;
  readonly kappa: number;
  readonly mFactor: number;
  readonly nFactor: number;
  readonly peakCurrentKa: number;
  readonly thermalCurrentKa: number;
}

export function analyzeFullShortCircuit(
  input: FullShortCircuitAnalysisInput,
): FullShortCircuitAnalysisResult {
  const system = computeSystemImpedance(input.system);
  const cable = computeCableLineImpedance(input.cable);
  const total = combineSystemAndCable(system, cable);
  const currents = computeShortCircuitCurrent({
    impedance: total,
    nominalVoltageKv: input.system.nominalVoltageKv,
    voltageFactor: input.system.voltageFactor,
  });
  const kappa = computePeakFactor(total.rxRatio);
  const peakCurrentKa = computePeakCurrent(currents.ik3_ka, kappa);
  const n = input.nFactor ?? 1.0;
  const m = approximateMFactor(input.faultDurationSec, kappa);
  const thermalCurrentKa = computeThermalEquivalentCurrent(currents.ik3_ka, m, n);
  return {
    system,
    cable,
    total,
    currents,
    kappa,
    mFactor: m,
    nFactor: n,
    peakCurrentKa,
    thermalCurrentKa,
  };
}

/**
 * Dobór parametrów CT na podstawie wyników analizy zwarciowej.
 * Sprawdza warunki:
 *   1. Ith CT ≥ Ith network (cieplna 1-sec wytrzymałość)
 *   2. Idyn CT ≥ ip network (dynamiczna)
 *   3. I1n CT — w zakresie typowym (2 × Iobl ≥ I1n ≥ 1.2 × Iobl)
 */
export interface CtRatingCheckInput {
  /** Wybrany CT — I1n (A). */
  readonly ctPrimaryCurrentA: number;
  /** CT — wytrzymałość cieplna 1-sek (kA). */
  readonly ctIth1secKa: number;
  /** CT — wytrzymałość dynamiczna (kA). */
  readonly ctIdynKa: number;
  /** Obliczony prąd cieplny zastępczy sieci (kA). */
  readonly networkIthKa: number;
  /** Obliczony prąd udarowy sieci (kA). */
  readonly networkIpeakKa: number;
  /** Prąd obliczeniowy obciążenia długotrwałego (A). */
  readonly designCurrentA: number;
}

export interface CtRatingCheckResult {
  readonly thermalOk: boolean;
  readonly thermalMarginKa: number;
  readonly dynamicOk: boolean;
  readonly dynamicMarginKa: number;
  readonly primaryRatingOk: boolean;
  /** Stosunek I1n / Iobl — dobre w zakresie 1.2 do 2.0. */
  readonly primaryRatingRatio: number;
}

export function checkCtRating(input: CtRatingCheckInput): CtRatingCheckResult {
  const thermalOk = input.ctIth1secKa >= input.networkIthKa;
  const dynamicOk = input.ctIdynKa >= input.networkIpeakKa;
  const ratio = input.ctPrimaryCurrentA / input.designCurrentA;
  const primaryRatingOk = ratio >= 1.2 && ratio <= 2.0;
  return {
    thermalOk,
    thermalMarginKa: input.ctIth1secKa - input.networkIthKa,
    dynamicOk,
    dynamicMarginKa: input.ctIdynKa - input.networkIpeakKa,
    primaryRatingOk,
    primaryRatingRatio: ratio,
  };
}
