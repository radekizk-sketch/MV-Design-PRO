/*
 * Test kolektora rejestru „Co wymaga uwagi" (karta A1 / V12K-098).
 * `przekroczeniaRozplywu` — czysta projekcja szyn z napięciem poza przedziałem
 * na znormalizowaną pozycję przekroczenia. Werdykt spójny z adapterem tabeli szyn.
 */
import { describe, it, expect } from 'vitest';

import { przekroczeniaRozplywu } from '../model';
import { CO_WYMAGA_UWAGI_STRINGS as T } from '../strings';
import { busResultFixture, powerFlowResultFixture } from '../../rozplyw/__tests__/fixtures';

describe('przekroczeniaRozplywu — konsolidacja przekroczeń napięć szyn', () => {
  it('null (brak wyniku) → pusta lista', () => {
    expect(przekroczeniaRozplywu(null)).toEqual([]);
  });

  it('wszystkie szyny w przedziale → brak przekroczeń', () => {
    const wynik = powerFlowResultFixture({
      bus_results: [busResultFixture({ v_pu: 1.0 }), busResultFixture({ bus_id: 'SZ-2', v_pu: 0.97 })],
    });
    expect(przekroczeniaRozplywu(wynik)).toEqual([]);
  });

  it('szyna poniżej 0,95 p.u. → przekroczenie „napięcie niskie", element Bus', () => {
    const wynik = powerFlowResultFixture({
      bus_results: [busResultFixture({ bus_id: 'SZ-ST2', v_pu: 0.941 })],
    });
    const [p] = przekroczeniaRozplywu(wynik);
    expect(p).toMatchObject({
      analizaPL: T.analizaRozplyw,
      elementRef: 'SZ-ST2',
      elementTyp: 'Bus',
      elementNazwa: 'SZ-ST2',
      opis: T.opisNapiecieNiskie,
    });
    expect(p.wartosc).toContain('0,9410');
    expect(p.klucz).toBe('rozplyw::napiecie::SZ-ST2');
  });

  it('szyna powyżej 1,05 p.u. → przekroczenie „napięcie wysokie"', () => {
    const wynik = powerFlowResultFixture({
      bus_results: [busResultFixture({ bus_id: 'SZ-GEN', v_pu: 1.062 })],
    });
    const [p] = przekroczeniaRozplywu(wynik);
    expect(p.opis).toBe(T.opisNapiecieWysokie);
  });

  it('filtruje tylko szyny poza przedziałem, zachowując kolejność źródłową', () => {
    const wynik = powerFlowResultFixture({
      bus_results: [
        busResultFixture({ bus_id: 'A', v_pu: 1.0 }),
        busResultFixture({ bus_id: 'B', v_pu: 0.94 }),
        busResultFixture({ bus_id: 'C', v_pu: 1.06 }),
      ],
    });
    expect(przekroczeniaRozplywu(wynik).map((p) => p.elementRef)).toEqual(['B', 'C']);
  });

  it('jest deterministyczne: to samo wejście → identyczne wyjście', () => {
    const wynik = powerFlowResultFixture();
    expect(przekroczeniaRozplywu(wynik)).toEqual(przekroczeniaRozplywu(wynik));
  });
});
