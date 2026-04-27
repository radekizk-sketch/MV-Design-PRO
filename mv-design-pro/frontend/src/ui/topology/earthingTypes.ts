/**
 * earthingTypes — typy 5 elementów uziemienia (Pakiet E).
 *
 * 5 osobnych kategorii (NIE jeden typ):
 *   1. GpzEarthing — punkt neutralny GPZ (transformator 110/SN strona SN)
 *   2. TransformerEarthing — uziemienie strony nN trafa SN/nN
 *   3. BusbarEarthing — sieć szyny SN (isolated/petersen/R/direct)
 *   4. CableScreenEarthing — uziemienie ekranu kabla SN (single/both/cross-bonded)
 *   5. PetersenCoil — osobny element ENM (cewka kompensacyjna)
 *
 * INVARIANT: każdy typ ma osobny kontrakt + osobne operacje store.
 */

// ============================================================================
// Tryby uziemienia szyny SN
// ============================================================================

export type BusbarEarthingMode =
  | 'isolated' // sieć izolowana
  | 'petersen' // sieć skompensowana (cewka Petersena)
  | 'resistor_grounded' // uziemienie przez rezystor
  | 'directly_grounded'; // bezpośrednio uziemione

export const BUSBAR_EARTHING_MODE_LABELS_PL: Readonly<Record<BusbarEarthingMode, string>> =
  Object.freeze({
    isolated: 'Sieć izolowana',
    petersen: 'Sieć skompensowana (Petersen)',
    resistor_grounded: 'Uziemienie przez rezystor',
    directly_grounded: 'Bezpośrednio uziemione',
  });

// ============================================================================
// 1. GpzEarthing
// ============================================================================

export interface GpzEarthing {
  /** ID transformatora GPZ */
  gpz_id: string;
  /** Tryb uziemienia po stronie SN */
  mode: BusbarEarthingMode;
  /** Reaktancja zerowa X0 [Ω] (gdy mode != isolated) */
  x0_ohm?: number;
  /** Rezystancja zerowa R0 [Ω] (gdy mode != isolated) */
  r0_ohm?: number;
  /** Pojemność doziemna C0 [µF] całej sieci podłączonej do GPZ */
  c0_uf?: number;
}

// ============================================================================
// 2. TransformerEarthing (strona nN trafo SN/nN)
// ============================================================================

export interface TransformerEarthing {
  transformer_id: string;
  /** Czy strona nN jest uziemiona */
  ln_grounded: boolean;
  /** Rezystancja uziemienia gwiazdy R_E [Ω] */
  r_e_ohm?: number;
  /** Reaktancja uziemienia X_E [Ω] (zwykle 0 dla bezpośredniego) */
  x_e_ohm?: number;
}

// ============================================================================
// 3. BusbarEarthing
// ============================================================================

export interface BusbarEarthing {
  busbar_id: string;
  mode: BusbarEarthingMode;
  /** Pojemność doziemna sieci C0 [µF] */
  c0_uf?: number;
  /** Rezystancja uziemienia (gdy resistor_grounded) [Ω] */
  r_grounding_ohm?: number;
}

// ============================================================================
// 4. CableScreenEarthing
// ============================================================================

export type CableScreenMode = 'single_end' | 'both_ends' | 'cross_bonded';

export const CABLE_SCREEN_MODE_LABELS_PL: Readonly<Record<CableScreenMode, string>> =
  Object.freeze({
    single_end: 'Jednostronne',
    both_ends: 'Dwustronne',
    cross_bonded: 'Cross-bonded',
  });

export interface CableScreenEarthing {
  cable_id: string;
  mode: CableScreenMode;
  /** Rezystancja uziemienia ekranu na końcach [Ω] */
  r_screen_ohm?: number;
}

// ============================================================================
// 5. PetersenCoil (osobny element ENM)
// ============================================================================

export interface PetersenCoil {
  /** ID elementu Petersen w ENM */
  coil_id: string;
  /** Indukcyjność cewki L [H] */
  l_h: number;
  /** Rezystancja równoległa R_par [Ω] (do tłumienia rezonansu) */
  r_par_ohm?: number;
  /** Procent kompensacji prądu doziemnego [50–110%] */
  compensation_percent: number;
  /** Tryb regulacji */
  control_mode: 'manual' | 'auto';
}

/**
 * Walidacja kompensacji Petersen: typowy zakres 50–110%
 * (poniżej 50 — niedokompensowanie, powyżej 110 — przekompensowanie ryzykowne).
 */
export function validatePetersenCompensation(percent: number): string | null {
  if (!Number.isFinite(percent)) return 'Kompensacja musi być liczbą.';
  if (percent < 50) return `Kompensacja ${percent}% < 50% (niedokompensowanie).`;
  if (percent > 110) return `Kompensacja ${percent}% > 110% (przekompensowanie).`;
  return null;
}

/**
 * Walidacja parametrów Petersen: L > 0, R_par ≥ 0.
 */
export function validatePetersenCoilParams(coil: PetersenCoil): string | null {
  if (!(coil.l_h > 0)) return 'Indukcyjność L musi być dodatnia.';
  if (coil.r_par_ohm !== undefined && coil.r_par_ohm < 0) {
    return 'Rezystancja R_par nie może być ujemna.';
  }
  return validatePetersenCompensation(coil.compensation_percent);
}
