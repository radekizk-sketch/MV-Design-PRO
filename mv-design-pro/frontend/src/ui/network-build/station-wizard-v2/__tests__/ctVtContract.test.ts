/**
 * Kontrakt CT/VT wielordzeniowy/wielouzwojeniowy — Excel MT880 1:1.
 *
 * Test wymusza zgodność z referencyjnymi wartościami z Excel'a
 * `obliczenia.xlsx` (bundle KWranPTV) zgodnie z wymaganiem #5 (/goal):
 * konfigurator pól SN obsługuje przekładniki wielordzeniowe (nie losowe
 * symbole) — implementacja eksela 1:1.
 */
import { describe, expect, it } from 'vitest';

import { CT_REFERENCE_200_3CORE } from '../ctMultiCoreContract';
import { VT_REFERENCE_4WINDING } from '../vtMultiWindingContract';

// ============================================================================
// CT — 3-rdzeniowy 200/5/5/5A (MT880)
// ============================================================================

describe('CT 3-rdzeniowy 200/5/5/5A — Excel MT880 reference', () => {
  it('zawiera 3 rdzenie (I metering / II analysis / III protection)', () => {
    expect(CT_REFERENCE_200_3CORE).toHaveLength(3);
    expect(CT_REFERENCE_200_3CORE.map((c) => c.category)).toEqual([
      'metering', 'analysis', 'protection',
    ]);
  });

  it('Rdzeń I: 0.2s · FS5 · 7.5 VA · licznik LZQJ-XC', () => {
    const I = CT_REFERENCE_200_3CORE[0];
    expect(I.accuracyClass).toBe('0.2s');
    expect(I.fsOrAlf).toBe(5);
    expect(I.ratedBurdenVa).toBe(7.5);
    expect(I.destinationPl).toContain('LZQJ-XC');
  });

  it('Rdzeń II: 0.2s · FS5 · 7.5 VA · analizator jakości energii klasy A', () => {
    const II = CT_REFERENCE_200_3CORE[1];
    expect(II.accuracyClass).toBe('0.2s');
    expect(II.fsOrAlf).toBe(5);
    expect(II.ratedBurdenVa).toBe(7.5);
    expect(II.destinationPl).toContain('klasy A');
  });

  it('Rdzeń III: 5P10 · ALF10 · 5 VA · zabezpieczenie e2Tango', () => {
    const III = CT_REFERENCE_200_3CORE[2];
    expect(III.accuracyClass).toBe('5P10');
    expect(III.fsOrAlf).toBe(10);
    expect(III.ratedBurdenVa).toBe(5.0);
    expect(III.destinationPl).toContain('e2Tango');
  });
});

describe('VT 4-uzwojeniowy — Excel MT880 reference', () => {
  it('zawiera 4 uzwojenia (metering / analysis / protection / scada_open_delta)', () => {
    expect(VT_REFERENCE_4WINDING).toHaveLength(4);
    expect(VT_REFERENCE_4WINDING.map((w) => w.category)).toEqual([
      'metering', 'analysis', 'protection', 'scada_open_delta',
    ]);
  });

  it('Uzwojenie I: 0.2 · 7.5 VA · licznik', () => {
    const I = VT_REFERENCE_4WINDING[0];
    expect(I.accuracyClass).toBe('0.2');
    expect(I.ratedBurdenVa).toBe(7.5);
  });

  it('Uzwojenie IV: 3P · 50 VA · SCADA otwarty trójkąt', () => {
    const IV = VT_REFERENCE_4WINDING[3];
    expect(IV.accuracyClass).toBe('3P');
    expect(IV.ratedBurdenVa).toBe(50);
    expect(IV.destinationPl).toContain('otwartego trójkąta');
  });

  it('Wszystkie uzwojenia mają polskie destination labels', () => {
    for (const w of VT_REFERENCE_4WINDING) {
      expect(w.destinationPl.length).toBeGreaterThan(5);
    }
  });
});

// ============================================================================
// BILANSY MOCY WTÓRNEJ CT/VT — USUNIĘTE (K7-B, 2026-07-31)
// ============================================================================
//
// Stały tu asercje na `computeWireResistance` / `computeCtBurden` /
// `checkCtSaturation` (CT, IEC 61869-2 § 5.6) oraz `computeVtWireResistance` /
// `computeVtBurden` / `checkVtVoltageDropLimit` (VT) wraz ze stałymi
// `CT_BURDEN_CONSTANTS` / `VT_BURDEN_CONSTANTS`. Był to rachunek doboru obwodów
// wtórnych wykonywany w przeglądarce — bez śladu WHITE BOX i bez konsumenta
// produkcyjnego: kreator stacji importuje z obu kontraktów wyłącznie katalogi
// referencyjne (`CT_REFERENCE_200_3CORE`, `VT_REFERENCE_4WINDING`), które nadal
// są tu sprawdzane wyżej.
//
// Dane znamionowe przekładników niesie katalog backendu
// (`network_model/catalog/mv_auxiliary_catalog.py`, `VTType`). Samego bilansu
// mocy wtórnej backend dziś nie liczy — luka zapisana imiennie w
// `docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md` §7, a NIE ukryta w allowliście strażnika.
