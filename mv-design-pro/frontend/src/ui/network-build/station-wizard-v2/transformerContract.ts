/**
 * Transformer Contract — krok 8 Kreatora KOMPLETNEGO.
 *
 * Per IEC 60076 (transformer specs) + IEC 60076-7 (loading guide) +
 * IEC 60076-11 (dry-type) + Excel MT880 v3 (OLTC, chłodzenie, inrush).
 *
 * Standard SN/nN dla stacji elektroenergetycznej:
 *   Sn:        100, 250, 400, 630, 800, 1000, 1600 kVA (typowe)
 *   U1/U2:     15/0.4 kV (standard ENEA) lub 20/0.4 kV (PSE)
 *   uk:        4-6% (krótkozwarciowe)
 *   grupa:     Dyn5, Dyn11, YNyn0 (transformatory SN/nN)
 *   chłodzenie: ONAN (oil natural) / ONAF (oil natural air forced)
 *   OLTC:      Off-load (DETC) ±2×2.5% lub On-load ±9% (rzadko w SN)
 *
 * Inrush — prąd włączenia transformatora pod napięcie:
 *   Iinrush ≈ 8-12 × In (max przy zerowym przepływie)
 *   Tk ≈ 0.1-0.5 s (czas zaniku do 90%)
 */

export type TransformerCoolingType =
  | 'ONAN'      // Oil Natural Air Natural
  | 'ONAF'      // Oil Natural Air Forced
  | 'OFAF'      // Oil Forced Air Forced
  | 'AN';       // Air Natural (dry-type)

export type TransformerInsulation = 'oil' | 'dry_resin' | 'dry_air';

/** Grupa połączeń per IEC 60076-1 § Table 3. */
export type VectorGroup =
  | 'Yyn0'
  | 'Yzn5' | 'Yzn11'
  | 'YNyn0'
  | 'Dyn5' | 'Dyn11'
  | 'Yd5'  | 'Yd11'
  | 'Dd0';

/** Stopnie OLTC (On-Load Tap Changer) lub DETC (De-Energized). */
export interface TapChangerSpec {
  readonly type: 'OLTC' | 'DETC' | 'fixed';
  readonly tapCount: number;          // np. 5 (±2 + nominal)
  readonly stepPct: number;            // % na stopień (np. 2.5)
  readonly rangeMinPct: number;        // -5%
  readonly rangeMaxPct: number;        // +5%
}

export interface TransformerCatalogEntry {
  readonly catalogRef: string;
  readonly ratedPowerKva: number;     // Sn
  readonly primaryVoltageKv: number;  // U1n
  readonly secondaryVoltageKv: number; // U2n
  readonly shortCircuitVoltagePct: number; // uk%
  readonly noLoadLossW: number;       // P0 (straty jałowe)
  readonly loadLossW: number;         // Pk (straty obciążeniowe)
  readonly noLoadCurrentPct: number;  // i0% (prąd jałowy)
  readonly vectorGroup: VectorGroup;
  readonly cooling: TransformerCoolingType;
  readonly insulation: TransformerInsulation;
  readonly tapChanger?: TapChangerSpec;
  readonly inrushFactor: number;      // Iinrush/In (typ. 8-12)
  readonly manufacturerRef: string;
  readonly weightKg?: number;
}

/**
 * Katalog referencyjny transformatorów SN/nN — typowe wartości
 * dla stacji 15/0.4 kV ENEA.
 */
export const TRANSFORMER_REFERENCE_CATALOG: readonly TransformerCatalogEntry[] = [
  {
    catalogRef: 'ABB TR-630-15-0.4-Dyn5',
    ratedPowerKva: 630,
    primaryVoltageKv: 15,
    secondaryVoltageKv: 0.4,
    shortCircuitVoltagePct: 6.0,
    noLoadLossW: 580,
    loadLossW: 6500,
    noLoadCurrentPct: 0.8,
    vectorGroup: 'Dyn5',
    cooling: 'ONAN',
    insulation: 'oil',
    tapChanger: {
      type: 'DETC',
      tapCount: 5,
      stepPct: 2.5,
      rangeMinPct: -5,
      rangeMaxPct: 5,
    },
    inrushFactor: 10,
    manufacturerRef: 'ABB',
    weightKg: 1950,
  },
  {
    catalogRef: 'Siemens GEAFOL-630-15-0.4-Dyn5',
    ratedPowerKva: 630,
    primaryVoltageKv: 15,
    secondaryVoltageKv: 0.4,
    shortCircuitVoltagePct: 6.0,
    noLoadLossW: 1100,
    loadLossW: 6700,
    noLoadCurrentPct: 1.0,
    vectorGroup: 'Dyn5',
    cooling: 'AN',
    insulation: 'dry_resin',
    tapChanger: {
      type: 'DETC',
      tapCount: 5,
      stepPct: 2.5,
      rangeMinPct: -5,
      rangeMaxPct: 5,
    },
    inrushFactor: 12,
    manufacturerRef: 'Siemens',
    weightKg: 2200,
  },
  {
    catalogRef: 'Schneider TRIHAL-1000-15-0.4-Dyn5',
    ratedPowerKva: 1000,
    primaryVoltageKv: 15,
    secondaryVoltageKv: 0.4,
    shortCircuitVoltagePct: 6.0,
    noLoadLossW: 1500,
    loadLossW: 9000,
    noLoadCurrentPct: 0.9,
    vectorGroup: 'Dyn5',
    cooling: 'AN',
    insulation: 'dry_resin',
    inrushFactor: 11,
    manufacturerRef: 'Schneider',
    weightKg: 3100,
  },
];

/**
 * Wyznaczenie prądu znamionowego po stronie pierwotnej i wtórnej.
 */
export function computeTransformerNominalCurrents(t: TransformerCatalogEntry): {
  readonly primaryNominalA: number;
  readonly secondaryNominalA: number;
} {
  // In = Sn / (√3 × Un)
  const i1 = (t.ratedPowerKva * 1000) / (Math.sqrt(3) * t.primaryVoltageKv * 1000);
  const i2 = (t.ratedPowerKva * 1000) / (Math.sqrt(3) * t.secondaryVoltageKv * 1000);
  return {
    primaryNominalA: i1,
    secondaryNominalA: i2,
  };
}

/**
 * Prąd inrush (maksymalny):
 *   Iinrush = inrushFactor × In1
 */
export function computeInrushCurrent(t: TransformerCatalogEntry): number {
  const { primaryNominalA } = computeTransformerNominalCurrents(t);
  return t.inrushFactor * primaryNominalA;
}

/**
 * Wymagania zabezpieczeniowe transformatora:
 *   1. Bezpiecznik HRC w polu TR — Inb ≥ 2 × In1 (dla obrony przed inrush)
 *   2. Setting Q1 LBS na inrush blocking
 *   3. Ith CT in TR bay ≥ inrush dla relay zabezpieczenia
 */
export interface TransformerProtectionInput {
  readonly transformer: TransformerCatalogEntry;
  /** Wybrany bezpiecznik HRC (A). */
  readonly fuseRatingA: number;
  /** CT po stronie 15 kV (I1n). */
  readonly ctPrimaryRatingA: number;
}

export interface TransformerProtectionResult {
  readonly nominalPrimaryA: number;
  readonly inrushPeakA: number;
  /** Bezpiecznik za mały (przepali się przy inrush). */
  readonly fuseInrushOk: boolean;
  /** Bezpiecznik za duży (nie zadziała przy zwarciu wewnętrznym TR). */
  readonly fuseSelectiveOk: boolean;
  /** CT primary OK dla pomiaru + zabezpieczenia. */
  readonly ctRatingOk: boolean;
}

export function evaluateTransformerProtection(
  input: TransformerProtectionInput,
): TransformerProtectionResult {
  const { transformer, fuseRatingA, ctPrimaryRatingA } = input;
  const { primaryNominalA } = computeTransformerNominalCurrents(transformer);
  const inrush = computeInrushCurrent(transformer);
  // Bezpiecznik: musi wytrzymać inrush (nieprzepalenie przy załączeniu).
  // Typowo: fuse min = 2 × In1; max = 4-6 × In1.
  const fuseInrushOk = fuseRatingA >= 2 * primaryNominalA;
  const fuseSelectiveOk = fuseRatingA <= 6 * primaryNominalA;
  // CT primary: 1.2 × In ≤ I1n ≤ 2 × In.
  const ctOk =
    ctPrimaryRatingA >= 1.2 * primaryNominalA &&
    ctPrimaryRatingA <= 2.0 * primaryNominalA;
  return {
    nominalPrimaryA: primaryNominalA,
    inrushPeakA: inrush,
    fuseInrushOk,
    fuseSelectiveOk,
    ctRatingOk: ctOk,
  };
}

/**
 * Straty transformatora przy danym obciążeniu:
 *   P_load(β) = P0 + β² × Pk
 *   gdzie β = S_actual / Sn (load factor 0..1)
 */
export function computeTransformerLosses(
  t: TransformerCatalogEntry,
  loadFactor: number,
): { readonly noLoadW: number; readonly loadW: number; readonly totalW: number } {
  const noLoad = t.noLoadLossW;
  const load = loadFactor * loadFactor * t.loadLossW;
  return {
    noLoadW: noLoad,
    loadW: load,
    totalW: noLoad + load,
  };
}

/**
 * Sprawność transformatora przy obciążeniu β + cos φ:
 *   η = (β × Sn × cosφ) / (β × Sn × cosφ + P0 + β² × Pk) × 100%
 */
export function computeTransformerEfficiency(
  t: TransformerCatalogEntry,
  loadFactor: number,
  cosPhi: number,
): number {
  const sOut = loadFactor * t.ratedPowerKva * 1000 * cosPhi;
  const losses = computeTransformerLosses(t, loadFactor);
  if (sOut === 0) return 0;
  return (sOut / (sOut + losses.totalW)) * 100;
}
