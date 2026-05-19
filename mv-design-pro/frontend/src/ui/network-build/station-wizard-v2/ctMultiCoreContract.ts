/**
 * Multi-core CT contract — IEC 61869-2 + bilans obciążeń.
 *
 * Źródło danych: Excel MT880 (`project/data/obliczenia.xlsx` z bundle
 * KWranPTV) + prototyp `Przekladniki i pomiary CAD.html`. Wymaganie
 * #5 z `/goal`: konfigurator pól SN musi obsłużyć przekładniki
 * wielordzeniowe (nie losowe symbole).
 *
 * Standard pomiarowy w stacji 15/0.4 kV: 200/5/5/5A przekładnik prądowy
 * 3-rdzeniowy:
 *   I:   0.2s · FS5 · 7.5 VA → licznik LZQJ-XC (rozliczenie OSD)
 *   II:  0.2s · FS5 · 7.5 VA → analizator MT880 (jakość energii)
 *   III: 5P10 · ALF10 · 5 VA → zabezpieczenie e2Tango (relay)
 *
 * Bilans obciążenia wtórnego per IEC 61869-2 § 5.6:
 *   Sn ≥ S2obl = Sl + Sz + Sp
 *   gdzie:
 *     Sl — moc znamionowa odbiornika (VA)
 *     Sz — straty zestykowe (typ. 0.1 VA per zacisk)
 *     Sp — straty w przewodach Cu: Sp = I²2n × Rp
 *     Rp = 2 × L / (γ × s)
 *     L  — długość przewodu (m, dwustronnie!)
 *     γ  — konduktywność Cu = 56 m/(Ω·mm²)
 *     s  — przekrój przewodu (mm²)
 *     I2n — prąd znamionowy wtórny (typ. 5 A)
 */

/** Klasa dokładności CT per IEC 61869-2. */
export type CtAccuracyClass =
  | '0.1' | '0.2' | '0.2s'    // pomiarowe (s = special — szerszy zakres)
  | '0.5' | '0.5s'
  | '1' | '3' | '5'           // pomiarowe (niższa dokładność)
  | '5P10' | '5P20' | '5P30'  // zabezpieczeniowe — ALF
  | '10P10' | '10P20';        // zabezpieczeniowe

/** Klasa rdzenia per przeznaczenie. */
export type CtCoreCategory = 'metering' | 'protection' | 'analysis';

/** Konstanty fizyczne dla bilansu wtórnego. */
export const CT_BURDEN_CONSTANTS = {
  /** Konduktywność miedzi przy 20°C, m/(Ω·mm²). */
  COPPER_CONDUCTIVITY: 56,
  /** Typowa strata zestykowa per rdzeń (VA). */
  TERMINAL_CONTACT_LOSS_VA: 0.1,
  /** Standardowy prąd wtórny IEC. */
  STANDARD_SECONDARY_CURRENT_A: 5,
} as const;

/** Pojedynczy rdzeń CT. */
export interface CtCore {
  /** Oznaczenie rdzenia (I/II/III…). */
  readonly id: string;
  /** Klasa dokładności. */
  readonly accuracyClass: CtAccuracyClass;
  /** Moc znamionowa rdzenia Sn (VA) — wartość katalogowa. */
  readonly ratedBurdenVa: number;
  /** Przeznaczenie. */
  readonly category: CtCoreCategory;
  /** Czynnik bezpieczeństwa FS dla metering / ALF dla protection. */
  readonly fsOrAlf: number;
  /** Odbiornik podłączony (label PL). */
  readonly destinationPl: string;
}

/** Konfiguracja okablowania per rdzeń. */
export interface CtWiring {
  /** Długość obwodu wtórnego (m, jednostronnie — funkcja sama liczy ×2). */
  readonly lengthM: number;
  /** Przekrój przewodu (mm²). */
  readonly crossSectionMm2: number;
  /** Materiał przewodu — Cu standardowo. */
  readonly material: 'Cu' | 'Al';
  /** Konduktywność (m/Ω·mm²) — Cu=56, Al=35. */
  readonly conductivityMperOhmMm2: number;
  /** Moc znamionowa odbiornika Sl (VA). */
  readonly loadVa: number;
}

/** Rezultat bilansu wtórnego rdzenia. */
export interface CtBurdenResult {
  readonly coreId: string;
  /** Rezystancja przewodów Rp (Ω). */
  readonly wireResistanceOhm: number;
  /** Strata mocy w przewodach Sp (VA). */
  readonly wireLossVa: number;
  /** Strata zestykowa Sz (VA). */
  readonly contactLossVa: number;
  /** Moc obliczeniowa wtórna S2obl (VA). */
  readonly computedBurdenVa: number;
  /** Moc znamionowa rdzenia Sn (VA). */
  readonly ratedBurdenVa: number;
  /** Czy bilans spełniony (Sn ≥ S2obl). */
  readonly ok: boolean;
  /** Margines % vs Sn. */
  readonly marginPct: number;
}

/**
 * Oblicza rezystancję przewodów wtórnych: Rp = 2*L / (γ*s).
 * Mnożenie ×2 dla pętli (do odbiornika + powrót).
 */
export function computeWireResistance(wiring: CtWiring): number {
  return (2 * wiring.lengthM) / (wiring.conductivityMperOhmMm2 * wiring.crossSectionMm2);
}

/**
 * Bilans wtórny pojedynczego rdzenia per IEC 61869-2 § 5.6.
 */
export function computeCtBurden(
  core: CtCore,
  wiring: CtWiring,
  secondaryCurrentA: number = CT_BURDEN_CONSTANTS.STANDARD_SECONDARY_CURRENT_A,
): CtBurdenResult {
  const rp = computeWireResistance(wiring);
  const sp = secondaryCurrentA * secondaryCurrentA * rp;
  const sz = CT_BURDEN_CONSTANTS.TERMINAL_CONTACT_LOSS_VA;
  const sl = wiring.loadVa;
  const computed = sl + sz + sp;
  const ok = core.ratedBurdenVa >= computed;
  const margin = ((core.ratedBurdenVa - computed) / core.ratedBurdenVa) * 100;
  return {
    coreId: core.id,
    wireResistanceOhm: rp,
    wireLossVa: sp,
    contactLossVa: sz,
    computedBurdenVa: computed,
    ratedBurdenVa: core.ratedBurdenVa,
    ok,
    marginPct: margin,
  };
}

/**
 * Sprawdza ALF (Accuracy Limit Factor) dla rdzenia zabezpieczeniowego.
 * ALF mówi do ilu In rdzeń wiernie odwzorowuje prąd. Jeśli Ik/I1n > ALF,
 * rdzeń się nasyci → zabezpieczenie może działać nieprawidłowo.
 *
 * Reguła: ALF effective = ALF nominal × (Sn / S2obl)
 *        sat = (Ik/I1n) > ALF effective
 */
export interface AlfSaturationCheck {
  readonly nominalAlf: number;
  /** ALF effective po uwzględnieniu bilansu wtórnego. */
  readonly effectiveAlf: number;
  /** Ratio Ik/I1n dla scenariusza zwarciowego. */
  readonly ikRatio: number;
  /** Czy nasycenie wystąpi. */
  readonly saturated: boolean;
}

export function checkCtSaturation(
  core: CtCore,
  burden: CtBurdenResult,
  shortCircuitCurrentA: number,
  primaryCurrentA: number,
): AlfSaturationCheck {
  const nominalAlf = core.fsOrAlf;
  // ALF effective = ALF nominal × (Sn / S2obl) — gdy S2obl < Sn, ALF rośnie.
  const effectiveAlf = burden.computedBurdenVa > 0
    ? nominalAlf * (core.ratedBurdenVa / burden.computedBurdenVa)
    : nominalAlf;
  const ikRatio = shortCircuitCurrentA / primaryCurrentA;
  return {
    nominalAlf,
    effectiveAlf,
    ikRatio,
    saturated: ikRatio > effectiveAlf,
  };
}

/**
 * Referencyjny standard 3-rdzeniowy przekładnik 200/5/5/5A
 * (Excel MT880 — `obliczenia.xlsx` z bundle).
 */
export const CT_REFERENCE_200_3CORE: readonly CtCore[] = [
  {
    id: 'I',
    accuracyClass: '0.2s',
    ratedBurdenVa: 7.5,
    category: 'metering',
    fsOrAlf: 5,
    destinationPl: 'Licznik rozliczeniowy LZQJ-XC',
  },
  {
    id: 'II',
    accuracyClass: '0.2s',
    ratedBurdenVa: 7.5,
    category: 'analysis',
    fsOrAlf: 5,
    destinationPl: 'Analizator MT880',
  },
  {
    id: 'III',
    accuracyClass: '5P10',
    ratedBurdenVa: 5.0,
    category: 'protection',
    fsOrAlf: 10,
    destinationPl: 'Zabezpieczenie e2Tango',
  },
];
