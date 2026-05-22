/**
 * Multi-winding VT contract — IEC 61869-3 + bilans obciążeń.
 *
 * Źródło: Excel MT880 + `Przekladniki i pomiary CAD.html` z bundle KWranPTV.
 *
 * Standard pomiarowy: VT 4-uzwojeniowy (np. VTB-20), 15:√3 / 0.1:√3 kV:
 *   I:   0.2 · 7.5 VA  → licznik rozliczeniowy
 *   II:  0.2 · 7.5 VA  → analizator
 *   III: 0.5 · 10 VA   → relay (zabezpieczenie napięciowe)
 *   IV:  3P · 50 VA    → SCADA + uzwojenie otwartego trójkąta (V0)
 *
 * Bilans wtórny VT per IEC 61869-3 § 5.5:
 *   Sn ≥ S2obl = Sl + Sz + Sp
 *   Sp (VT) = U2n² × (R_wire / Z_load²)  [małe]
 *
 * Sprawdzenie ΔU obwodów wtórnych:
 *   ΔU% = (Rp × I_wire / U2n) × 100
 *   Limit: ΔU < 0.5% (klasy pomiarowe) lub < 1% (klasy zabezpieczeniowe).
 */

/** Klasa dokładności VT per IEC 61869-3. */
export type VtAccuracyClass =
  | '0.1' | '0.2' | '0.5' | '1' | '3' | '3P' | '6P';

/** Kategoria uzwojenia. */
export type VtWindingCategory =
  | 'metering' | 'protection' | 'analysis' | 'scada_open_delta';

export interface VtWinding {
  readonly id: string;
  readonly accuracyClass: VtAccuracyClass;
  readonly ratedBurdenVa: number;
  readonly category: VtWindingCategory;
  readonly destinationPl: string;
}

export interface VtWiring {
  /** Długość przewodów wtórnych (m). */
  readonly lengthM: number;
  /** Przekrój przewodu (mm²). */
  readonly crossSectionMm2: number;
  readonly material: 'Cu' | 'Al';
  readonly conductivityMperOhmMm2: number;
  /** Moc znamionowa odbiornika Sl (VA). */
  readonly loadVa: number;
}

export interface VtBurdenResult {
  readonly windingId: string;
  readonly wireResistanceOhm: number;
  readonly contactLossVa: number;
  readonly computedBurdenVa: number;
  readonly ratedBurdenVa: number;
  readonly ok: boolean;
  readonly marginPct: number;
  /** Spadek napięcia wtórny (%). */
  readonly voltageDropPct: number;
}

export const VT_BURDEN_CONSTANTS = {
  COPPER_CONDUCTIVITY: 56,
  TERMINAL_CONTACT_LOSS_VA: 0.1,
  /** Napięcie wtórne IEC standardowe (V) — uzwojenie gwiazdowe 0.1/√3 kV. */
  STANDARD_SECONDARY_VOLTAGE_V: 100 / Math.sqrt(3),
  /** Limit ΔU dla klas pomiarowych (%). */
  VOLTAGE_DROP_LIMIT_METERING_PCT: 0.5,
  /** Limit ΔU dla klas zabezpieczeniowych (%). */
  VOLTAGE_DROP_LIMIT_PROTECTION_PCT: 1.0,
} as const;

export function computeVtWireResistance(wiring: VtWiring): number {
  return (2 * wiring.lengthM) / (wiring.conductivityMperOhmMm2 * wiring.crossSectionMm2);
}

export function computeVtBurden(
  winding: VtWinding,
  wiring: VtWiring,
  secondaryVoltageV: number = VT_BURDEN_CONSTANTS.STANDARD_SECONDARY_VOLTAGE_V,
): VtBurdenResult {
  const rp = computeVtWireResistance(wiring);
  const sz = VT_BURDEN_CONSTANTS.TERMINAL_CONTACT_LOSS_VA;
  // Dla VT bilans dominowany przez Sl + Sz (przewody mają znikomy wpływ
  // przy U2n ≈ 100 V i typowych prądach <50mA).
  const computed = wiring.loadVa + sz;
  // ΔU% obwodu wtórnego: I_wire = Sl / U2n; spadek = Rp × I_wire / U2n × 100.
  const iWire = wiring.loadVa / secondaryVoltageV;
  const voltageDropPct = (rp * iWire / secondaryVoltageV) * 100;
  const ok = winding.ratedBurdenVa >= computed;
  return {
    windingId: winding.id,
    wireResistanceOhm: rp,
    contactLossVa: sz,
    computedBurdenVa: computed,
    ratedBurdenVa: winding.ratedBurdenVa,
    ok,
    marginPct: ((winding.ratedBurdenVa - computed) / winding.ratedBurdenVa) * 100,
    voltageDropPct,
  };
}

/**
 * Sprawdza limit ΔU% per kategoria uzwojenia.
 */
export function checkVtVoltageDropLimit(
  winding: VtWinding,
  burden: VtBurdenResult,
): { withinLimit: boolean; limit: number; actual: number } {
  const limit = winding.category === 'protection'
    ? VT_BURDEN_CONSTANTS.VOLTAGE_DROP_LIMIT_PROTECTION_PCT
    : VT_BURDEN_CONSTANTS.VOLTAGE_DROP_LIMIT_METERING_PCT;
  return {
    withinLimit: burden.voltageDropPct <= limit,
    limit,
    actual: burden.voltageDropPct,
  };
}

/**
 * Referencyjny VT 4-uzwojeniowy 15:√3 / 0.1:√3 kV.
 */
export const VT_REFERENCE_4WINDING: readonly VtWinding[] = [
  {
    id: 'I',
    accuracyClass: '0.2',
    ratedBurdenVa: 7.5,
    category: 'metering',
    destinationPl: 'Licznik rozliczeniowy',
  },
  {
    id: 'II',
    accuracyClass: '0.2',
    ratedBurdenVa: 7.5,
    category: 'analysis',
    destinationPl: 'Analizator jakości energii',
  },
  {
    id: 'III',
    accuracyClass: '0.5',
    ratedBurdenVa: 10.0,
    category: 'protection',
    destinationPl: 'Zabezpieczenie napięciowe (27/59)',
  },
  {
    id: 'IV',
    accuracyClass: '3P',
    ratedBurdenVa: 50.0,
    category: 'scada_open_delta',
    destinationPl: 'SCADA + uzwojenie otwartego trójkąta (V0)',
  },
];
