// @vitest-environment node
/**
 * Karta KATALOG-PRZEJECIE-PR — jedna reguła stosunku R/X sieci zasilającej w kreatorze źródła
 * i w siatce właściwości (konfigurator GPZ: `Etap3Configurators.test.tsx`, ta sama funkcja).
 *
 * Do karty były trzy wersje: kreator ≥ 0 (backend odmawiał zera), siatka (0; 1] bez podstawy
 * normowej, konfigurator bez walidacji. Iloczyn cech: wartość (zero, ujemna, typowa 110 kV,
 * powyżej 1, NaN, nieskończoność) × miejsce (kreator strona SN, kreator strona 110 kV, siatka)
 * × para MAX/MIN. Werdykt każdego miejsca ma być równy `stosunekRxPoprawny` — jedno źródło.
 */

import { describe, expect, it } from 'vitest';

import type { PropertyField } from '../../../ui/types';
import { validateField } from '../../../ui/property-grid/validation';
import { DANE_DOMYSLNE, walidujFormularz, type GridSourceFormData } from '../../kreatory/zrodlo/zrodloModel';
import { KOMUNIKAT_STOSUNKU_RX, KOMUNIKAT_STOSUNKU_RX_MIN, stosunekRxPoprawny } from '../stosunekRxZrodla';

const WARTOSCI: ReadonlyArray<[string, number, boolean]> = [
  ['zero', 0, false],
  ['ujemna', -0.1, false],
  ['typowa sieci 110 kV', 0.05, true],
  ['równoważnik SN powyżej 1', 1.5, true],
  ['NaN', Number.NaN, false],
  ['nieskończoność', Number.POSITIVE_INFINITY, false],
];

function kreator(strona: 'SN' | 'HV_110', nadpisz: Partial<GridSourceFormData>): GridSourceFormData {
  return {
    ...DANE_DOMYSLNE,
    gpz_line_field_apparatus_catalog_ref: 'APP-001',
    manual_mode: true,
    catalog_ref: null,
    short_circuit_input_side: strona,
    hv_voltage_kv: strona === 'HV_110' ? 110 : DANE_DOMYSLNE.hv_voltage_kv,
    sk3_hv_mva: strona === 'HV_110' ? 3000 : DANE_DOMYSLNE.sk3_hv_mva,
    ...nadpisz,
  };
}

function poleSiatki(klucz: string, value: number): PropertyField {
  return { key: klucz, label: klucz, value, editable: true, type: 'number', source: 'instance' };
}

describe('stosunek R/X — jedna reguła kreatora i siatki', () => {
  it.each(WARTOSCI)('reguła: %s', (_opis, wartosc, poprawna) => {
    expect(stosunekRxPoprawny(wartosc)).toBe(poprawna);
  });

  for (const strona of ['SN', 'HV_110'] as const) {
    it.each(WARTOSCI)(`kreator (strona ${strona}) R/X MAX: %s`, (_opis, wartosc, poprawna) => {
      const bledy = walidujFormularz(kreator(strona, { rx_ratio: wartosc }));
      expect(bledy.some((b) => b.field === 'rx_ratio' && b.message === KOMUNIKAT_STOSUNKU_RX)).toBe(!poprawna);
    });

    it.each(WARTOSCI)(`kreator (strona ${strona}) R/X MIN: %s`, (_opis, wartosc, poprawna) => {
      const bledy = walidujFormularz(kreator(strona, { rx_ratio_min: wartosc, sk3_min_mva: 100 }));
      expect(bledy.some((b) => b.field === 'rx_ratio_min' && b.message === KOMUNIKAT_STOSUNKU_RX_MIN)).toBe(
        !poprawna,
      );
    });
  }

  it.each(WARTOSCI)('siatka Source.rx_ratio: %s', (_opis, wartosc, poprawna) => {
    const wynik = validateField('Source', poleSiatki('rx_ratio', wartosc), wartosc);
    expect(wynik.valid).toBe(poprawna);
    if (!poprawna) expect(wynik.message).toBe(KOMUNIKAT_STOSUNKU_RX);
  });

  it.each(WARTOSCI)('siatka Source.rx_ratio_min: %s', (_opis, wartosc, poprawna) => {
    const wynik = validateField('Source', poleSiatki('rx_ratio_min', wartosc), wartosc);
    expect(wynik.valid).toBe(poprawna);
    if (!poprawna) expect(wynik.message).toBe(KOMUNIKAT_STOSUNKU_RX_MIN);
  });
});
