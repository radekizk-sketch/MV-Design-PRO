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
 *   II:  0.2s · FS5 · 7.5 VA → analizator jakości energii klasy A
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

/*
 * BILANS MOCY WTÓRNEJ I NASYCENIE RDZENIA — USUNIĘTE (K7-B, 2026-07-31).
 *
 * Stały tu `CT_BURDEN_CONSTANTS`, typy `CtWiring` / `CtBurdenResult` /
 * `AlfSaturationCheck` oraz trzy rachunki: `computeWireResistance` (Rp = 2L/(γ·s)),
 * `computeCtBurden` (S2obl = SL + Sz + I2²·Rp wg IEC 61869-2 § 5.6) i
 * `checkCtSaturation` (ALF_eff = ALF·Sn/S2obl; nasycenie gdy Ik/I1n > ALF_eff).
 * Poza własnym testem nikt ich nie wołał — kreator stacji importuje z tego pliku
 * wyłącznie katalog referencyjny `CT_REFERENCE_200_3CORE`.
 *
 * Dane znamionowe przekładników prądowych (moc wtórna, ALF/Fs, klasa) niesie
 * katalog backendu `network_model/catalog/mv_auxiliary_catalog.py`. Samego
 * bilansu mocy wtórnej backend dziś NIE liczy — luka zapisana imiennie w
 * `docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md` §7 (nie została ukryta w allowliście
 * strażnika, bo to byłaby zgoda na fizykę w prezentacji).
 */

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
    destinationPl: 'Analizator jakości energii klasy A',
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
