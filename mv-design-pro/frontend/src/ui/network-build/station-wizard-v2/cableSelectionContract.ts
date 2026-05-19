/**
 * Cable Selection Contract — dobór kabla SN.
 *
 * Źródło: Excel MT880 v3 (`obliczenia_do_projekt_w_v3_MT880.xlsx`),
 * sekcje 1-3 ("Dobór kabli na długotrwałą obciążalność i przeciążalność
 * prądową" + spadek napięcia + warunki zwarciowe).
 *
 * 4 kontrakty w jednym module — krok 1 Kreatora Stacji KOMPLETNEGO
 * (Przyłączenie SN — kabel + termika + ΔU):
 *
 *   1. Dobór na obciążalność długotrwałą:
 *      Iobl ≤ I'dd = Idd × f1 × f2 × kg5
 *      gdzie: Idd — prąd dopuszczalny katalogowy
 *             f1 — współczynnik gruntu (rezystywność/obciążenie/temp.)
 *             f2 — współczynnik liczby kabli ułożonych równolegle
 *             kg5 — współczynnik równoległego ułożenia 3 kabli (1 warstwa,
 *                   200 mm odstęp) — standardowo 0.82 per ENEA Standard
 *
 *   2. Sprawdzenie spadku napięcia:
 *      ΔU = (√3 × I × (R·cosφ + X·sinφ) × l) / Un
 *      ΔU% = ΔU / Un × 100
 *      Limit: ΔU% < 2.0% dla obwodów SN (standardowo)
 *
 *   3. Sprawdzenie zwarciowe — żyły robocze (XLPE):
 *      Izw_w (Aluminium 120 mm², τ_pocz=90°C, τ_końc=250°C, tk=1s) = 10 kA
 *      Izw_w ≥ Ik3 (zwarcie 3-fazowe)
 *
 *   4. Sprawdzenie zwarciowe — żyły powrotne:
 *      Izw_p (50 mm², τ_pocz=90°C, τ_końc=350°C, tk=1s) = 10 kA
 *      Izw_p ≥ Ik2 (zwarcie 2-fazowe)
 */

/** Materiał żyły. */
export type CableConductorMaterial = 'Cu' | 'Al' | 'AlAl';

/** Izolacja kabla. */
export type CableInsulation = 'XLPE' | 'EPR' | 'PVC' | 'Paper';

/** Pozycja ułożenia. */
export type CableLayingType = 'ground' | 'air' | 'tray' | 'duct';

/**
 * Współczynniki przelicznikowe dla doboru obciążalności.
 *
 * Wartości z Excel MT880 v3 + ENEA Standard "Dobór kabli SN" 2021-06-30.
 */
export interface CableDeratingFactors {
  /**
   * f1 — współczynnik gruntu (rezystywność termiczna / temperatura).
   * Typowo 0.9 dla: ρ_grunt=1.5 K·m/W, obciążenie=0.7, T_grunt=20°C.
   */
  readonly f1_groundResistivity: number;
  /**
   * f2 — współczynnik liczby kabli w wiązce.
   * Typowo 1.01 dla pojedynczego systemu w ziemi.
   */
  readonly f2_parallelCables: number;
  /**
   * kg5 — współczynnik dla 3 kabli ułożonych równolegle w 1 warstwie,
   * odstęp 200 mm. Standardowo 0.82.
   */
  readonly kg5_parallelGroup: number;
}

/** Domyślne współczynniki dla standardowego ułożenia 3 kabli w ziemi. */
export const DEFAULT_DERATING_GROUND_THREE_PHASE: CableDeratingFactors = {
  f1_groundResistivity: 0.9,
  f2_parallelCables: 1.01,
  kg5_parallelGroup: 0.82,
};

/** Specyfikacja kabla SN z katalogu. */
export interface CableCatalogEntry {
  /** Identyfikator katalogowy, np. "XRUHAKXS 1x120/50 12/20 kV". */
  readonly catalogRef: string;
  readonly conductor: CableConductorMaterial;
  readonly insulation: CableInsulation;
  /** Przekrój żyły roboczej (mm²). */
  readonly conductorCrossSectionMm2: number;
  /** Przekrój żyły powrotnej (mm²). */
  readonly screenCrossSectionMm2: number;
  /** Napięcie znamionowe (kV). */
  readonly voltageKv: number;
  /** Prąd dopuszczalny katalogowy Idd (A). */
  readonly ratedAmpacityA: number;
  /** Rezystancja jednostkowa R0 (Ω/km), 20°C. */
  readonly resistanceOhmPerKm: number;
  /** Reaktancja jednostkowa X0 (Ω/km). */
  readonly reactanceOhmPerKm: number;
  /** Max prąd zwarciowy 1s dla żyły roboczej (kA). */
  readonly shortCircuitConductor1sKa: number;
  /** Max prąd zwarciowy 1s dla żyły powrotnej (kA). */
  readonly shortCircuitScreen1sKa: number;
}

/**
 * Referencyjny kabel z MT880: XRUHAKXS 1x120/50 12/20 kV
 * (typowy SN kabel YHKXS lub XRUHAKXS dla 15 kV).
 */
export const CABLE_REFERENCE_XRUHAKXS_120: CableCatalogEntry = {
  catalogRef: '3xXRUHAKXS 1x120/50 12/20 kV',
  conductor: 'Al',
  insulation: 'XLPE',
  conductorCrossSectionMm2: 120,
  screenCrossSectionMm2: 50,
  voltageKv: 20,
  ratedAmpacityA: 285,
  resistanceOhmPerKm: 0.253,
  reactanceOhmPerKm: 0.115,
  shortCircuitConductor1sKa: 10,
  shortCircuitScreen1sKa: 10,
};

// ============================================================================
// 1. Dobór na obciążalność długotrwałą
// ============================================================================

export interface AmpacityCheckInput {
  readonly cable: CableCatalogEntry;
  readonly factors: CableDeratingFactors;
  /** Prąd obliczeniowy długotrwały Iobl (A). */
  readonly designCurrentA: number;
}

export interface AmpacityCheckResult {
  /** Idd × f1 × f2 × kg5 — efektywny prąd dopuszczalny. */
  readonly effectiveAmpacityA: number;
  readonly designCurrentA: number;
  readonly factorsApplied: CableDeratingFactors;
  readonly ok: boolean;
  /** Procent wykorzystania (Iobl / I'dd × 100). */
  readonly utilizationPct: number;
}

export function checkCableAmpacity(input: AmpacityCheckInput): AmpacityCheckResult {
  const { cable, factors, designCurrentA } = input;
  const effective =
    cable.ratedAmpacityA *
    factors.f1_groundResistivity *
    factors.f2_parallelCables *
    factors.kg5_parallelGroup;
  return {
    effectiveAmpacityA: effective,
    designCurrentA,
    factorsApplied: factors,
    ok: designCurrentA <= effective,
    utilizationPct: (designCurrentA / effective) * 100,
  };
}

// ============================================================================
// 2. Spadek napięcia ΔU
// ============================================================================

export interface VoltageDropInput {
  readonly cable: CableCatalogEntry;
  readonly lengthKm: number;
  readonly currentA: number;
  /** cos φ obciążenia. Standardowo 0.93 → 0.95 (kompensowane). */
  readonly cosPhi: number;
  /** Napięcie nominalne linii (V). */
  readonly lineVoltageV: number;
  /** Limit ΔU% (typowo 2.0%). */
  readonly limitPct: number;
}

export interface VoltageDropResult {
  readonly voltageDropV: number;
  readonly voltageDropPct: number;
  readonly limitPct: number;
  readonly ok: boolean;
}

export function computeCableVoltageDrop(input: VoltageDropInput): VoltageDropResult {
  const { cable, lengthKm, currentA, cosPhi, lineVoltageV, limitPct } = input;
  const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
  const r = cable.resistanceOhmPerKm * lengthKm;
  const x = cable.reactanceOhmPerKm * lengthKm;
  // ΔU = √3 × I × (R·cosφ + X·sinφ) dla linii 3-fazowej.
  const deltaU = Math.sqrt(3) * currentA * (r * cosPhi + x * sinPhi);
  const pct = (deltaU / lineVoltageV) * 100;
  return {
    voltageDropV: deltaU,
    voltageDropPct: pct,
    limitPct,
    ok: pct <= limitPct,
  };
}

// ============================================================================
// 3+4. Sprawdzenie zwarciowe kabla (żyły robocze + powrotne)
// ============================================================================

export interface CableShortCircuitInput {
  readonly cable: CableCatalogEntry;
  /** Spodziewany prąd zwarciowy 3-fazowy (kA). */
  readonly ik3Ka: number;
  /** Spodziewany prąd zwarciowy 2-fazowy (kA). */
  readonly ik2Ka: number;
}

export interface CableShortCircuitResult {
  /** Żyły robocze: Izw_w (cable) ≥ Ik3 (network). */
  readonly conductorOk: boolean;
  readonly conductorMarginKa: number;
  /** Żyły powrotne: Izw_p (cable) ≥ Ik2 (network). */
  readonly screenOk: boolean;
  readonly screenMarginKa: number;
}

export function checkCableShortCircuit(input: CableShortCircuitInput): CableShortCircuitResult {
  const { cable, ik3Ka, ik2Ka } = input;
  return {
    conductorOk: cable.shortCircuitConductor1sKa >= ik3Ka,
    conductorMarginKa: cable.shortCircuitConductor1sKa - ik3Ka,
    screenOk: cable.shortCircuitScreen1sKa >= ik2Ka,
    screenMarginKa: cable.shortCircuitScreen1sKa - ik2Ka,
  };
}

// ============================================================================
// 5. Obliczenia prądów znamionowych z mocy przyłączeniowej
// ============================================================================

export interface PowerCurrentInput {
  /** Moc czynna P (kW). */
  readonly activePowerKw: number;
  /** cos φ. */
  readonly cosPhi: number;
  /** Napięcie sieci U1n (V). */
  readonly lineVoltageV: number;
}

export function computeRatedCurrentFromPower(input: PowerCurrentInput): number {
  // Sn = P / cosφ; I = Sn / (√3 × Un) dla układu 3-fazowego.
  const apparentVa = (input.activePowerKw * 1000) / input.cosPhi;
  return apparentVa / (Math.sqrt(3) * input.lineVoltageV);
}
