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

/*
 * BILANS MOCY WTÓRNEJ VT I ΔU OBWODU WTÓRNEGO — USUNIĘTE (K7-B, 2026-07-31).
 *
 * Stały tu `VT_BURDEN_CONSTANTS`, typy `VtWiring` / `VtBurdenResult` oraz
 * `computeVtWireResistance` (Rp = 2L/(γ·s)), `computeVtBurden` (S2obl = Sl + Sz
 * plus ΔU% = Rp·I/U2n·100) i `checkVtVoltageDropLimit` (limit 0,5% dla klas
 * pomiarowych, 1,0% dla zabezpieczeniowych). Poza własnym testem nikt ich nie
 * wołał — kreator stacji importuje z tego pliku wyłącznie
 * `VT_REFERENCE_4WINDING`. Ta sama klasa co usunięty tą kartą bilans wtórny CT
 * (`ctMultiCoreContract.ts`).
 *
 * Uwaga na precedens: stała `STANDARD_SECONDARY_VOLTAGE_V` (100/√3 V) była w R2
 * (2026-07-18) rozstrzygnięta jako DANA KATALOGOWA IEC 61869-3, nie fizyka —
 * i jako dana wróci, gdy backend dostanie tę zdolność. Znika tutaj razem z
 * jedynym rachunkiem, który jej używał. Dane znamionowe przekładników
 * napięciowych niesie katalog backendu (`VTType`, V12K-255/257).
 * BRAK dostawcy backendowego dla bilansu wtórnego VT — luka zapisana imiennie
 * w `docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md` §7.
 */

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
