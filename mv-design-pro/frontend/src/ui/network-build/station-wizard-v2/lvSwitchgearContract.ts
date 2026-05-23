/**
 * LV Switchgear Contract — krok 10 Kreatora KOMPLETNEGO (Strona nN).
 *
 * Rozdzielnica nN (LV switchgear) per IEC 61439:
 *   Type-tested assembly (TTA) lub Partially-tested (PTTA).
 *   Klasy: PSC-system (per IEC 61439-2 § 5.3).
 *
 * Typowe pola nN:
 *   incoming (z TR SN/nN przez kabel)
 *   feeder (odpływy nN do odbiorców / DER)
 *   measurement (analizator pomiarów)
 *   capacitor (kompensacja mocy biernej, opcjonalnie)
 */

export type LvSwitchgearForm =
  | 'Form 1' | 'Form 2a' | 'Form 2b'  // IEC 61439-2 §8.101
  | 'Form 3a' | 'Form 3b'
  | 'Form 4a' | 'Form 4b';

export type LvBayKind =
  | 'incoming_main'      // pole główne zasilające z TR
  | 'feeder'             // pole odpływowe (obciążenie)
  | 'der_source'         // pole DER (PV/BESS)
  | 'measurement'        // pole pomiarowe
  | 'capacitor';         // kompensacja mocy biernej

export interface LvBaySpec {
  readonly kind: LvBayKind;
  readonly designation: string;        // np. "0F1"
  readonly ratedCurrentA: number;      // In odgał. (typ. 100-400 A dla feeder)
  readonly breakerType: 'MCCB' | 'ACB' | 'MCB';
  readonly icc_ka: number;             // Wyłączalność (typ. 25-50 kA)
  readonly labelPl: string;
}

/** Strona nN — pełna specyfikacja rozdzielnicy. */
export interface LvSwitchgearSpec {
  readonly catalogRef: string;
  readonly manufacturerRef: string;
  /** Prąd znamionowy szyny nN (A). */
  readonly busbarRatedCurrentA: number;
  /** Prąd zwarciowy 1-sek szyny (kA). */
  readonly busbarShortTimeCurrentKa: number;
  readonly form: LvSwitchgearForm;
  readonly ipRating: string;           // np. "IP31", "IP54"
  readonly bays: ReadonlyArray<LvBaySpec>;
  /** Maksymalna liczba pól (chassis limit). */
  readonly maxBays: number;
}

/** Typowe pola nN dla stacji SN/nN 630 kVA. */
export const LV_SWITCHGEAR_STANDARD_630: LvSwitchgearSpec = {
  catalogRef: 'ABB MNS-1250-50kA',
  manufacturerRef: 'ABB',
  busbarRatedCurrentA: 1250,
  busbarShortTimeCurrentKa: 50,
  form: 'Form 3b',
  ipRating: 'IP31',
  bays: [
    {
      kind: 'incoming_main',
      designation: '0Q1',
      ratedCurrentA: 1000,
      breakerType: 'ACB',
      icc_ka: 50,
      labelPl: 'Pole główne — wejście z TR',
    },
    {
      kind: 'measurement',
      designation: '0M1',
      ratedCurrentA: 5,
      breakerType: 'MCB',
      icc_ka: 6,
      labelPl: 'Pole pomiarowe (analizator)',
    },
    {
      kind: 'feeder',
      designation: '0F1',
      ratedCurrentA: 250,
      breakerType: 'MCCB',
      icc_ka: 36,
      labelPl: 'Odpływ liniowy 1',
    },
    {
      kind: 'feeder',
      designation: '0F2',
      ratedCurrentA: 250,
      breakerType: 'MCCB',
      icc_ka: 36,
      labelPl: 'Odpływ liniowy 2',
    },
    {
      kind: 'der_source',
      designation: '0D1',
      ratedCurrentA: 400,
      breakerType: 'MCCB',
      icc_ka: 36,
      labelPl: 'Wejście PV/BESS',
    },
  ],
  maxBays: 12,
};

/**
 * Sprawdzenie obciążalności szyny nN.
 *   Σ_feeder In × diversity_factor ≤ busbar rated
 */
export interface LvBalanceCheckInput {
  readonly switchgear: LvSwitchgearSpec;
  readonly diversityFactor: number;  // typ. 0.6-0.8
}

export function checkLvBusbarBalance(
  input: LvBalanceCheckInput,
): {
  readonly totalFeederA: number;
  readonly diversifiedA: number;
  readonly busbarRatedA: number;
  readonly utilizationPct: number;
  readonly ok: boolean;
} {
  const feeders = input.switchgear.bays.filter(
    (b) => b.kind === 'feeder' || b.kind === 'der_source',
  );
  const total = feeders.reduce((s, b) => s + b.ratedCurrentA, 0);
  const diversified = total * input.diversityFactor;
  return {
    totalFeederA: total,
    diversifiedA: diversified,
    busbarRatedA: input.switchgear.busbarRatedCurrentA,
    utilizationPct: (diversified / input.switchgear.busbarRatedCurrentA) * 100,
    ok: diversified <= input.switchgear.busbarRatedCurrentA,
  };
}
