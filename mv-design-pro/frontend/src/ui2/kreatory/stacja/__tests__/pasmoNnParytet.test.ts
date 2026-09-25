/**
 * Parytet predykatu „napięcie w paśmie nN” — kreator stacji SN/nN ↔ bramki backendu.
 *
 * Backend (`enm/pole_transformatorowe.py::w_pasmie_nn`) odmawia stacji SN/nN ze stroną dolną
 * spoza pasma nN (`station.*.nn_voltage_not_nn_band`), operacji strony dolnej
 * (`nn.bus_not_nn_band`) i analiz nN. Kreator waliduje to samo pole TYM SAMYM warunkiem, żeby
 * formularz nie wysyłał operacji, którą backend odrzuci (kontrolka bez pokrycia = phantom).
 * Oba testy chodzą po jednej tablicy decyzyjnej `backend/schemas/pasmo_nn_parytet_v1.json`.
 *
 * Iloczyn cech: napięcie strony nN {0,23, 0,4, 0,69, 0,999, 1 (granica), 6, 15, 110, 0,
 * ujemne, brak} × warstwa {predykat, walidacja formularza kreatora}.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { DANE_DOMYSLNE, walidujFormularz, wPasmieNn, type StacjaFormData } from '../stacjaModel';

interface Wiersz {
  readonly napiecie_kv: number | null;
  readonly w_pasmie_nn: boolean;
}

const TABLICA = path.resolve(__dirname, '../../../../../../backend/schemas/pasmo_nn_parytet_v1.json');

function wiersze(): readonly Wiersz[] {
  return (JSON.parse(readFileSync(TABLICA, 'utf-8')) as { wiersze: readonly Wiersz[] }).wiersze;
}

function dane(nn_voltage_kv: number): StacjaFormData {
  return {
    ...DANE_DOMYSLNE,
    catalog_ref: 'trafo-630-15-04',
    manufacturer_ref: 'ZPUE_WLOSZCZOWA',
    nn_voltage_kv,
  };
}

describe('pasmo nN — parytet z bramkami backendu', () => {
  it('tablica decyzyjna jest niepusta i obejmuje granicę 1 kV', () => {
    expect(wiersze().some((w) => w.napiecie_kv === 1)).toBe(true);
  });

  it.each(wiersze().map((w) => [w.napiecie_kv, w.w_pasmie_nn] as const))(
    'predykat: %s kV → w paśmie nN = %s',
    (napiecie, oczekiwane) => {
      expect(wPasmieNn(napiecie)).toBe(oczekiwane);
    },
  );

  it.each(
    wiersze()
      .filter((w) => w.napiecie_kv !== null && w.napiecie_kv > 0)
      .map((w) => [w.napiecie_kv as number, w.w_pasmie_nn] as const),
  )('kreator: napięcie strony nN %s kV → formularz poprawny = %s', (napiecie, oczekiwane) => {
    const bledy = walidujFormularz(dane(napiecie)).filter((e) => e.field === 'nn_voltage_kv');
    expect(bledy.length === 0).toBe(oczekiwane);
  });
});
