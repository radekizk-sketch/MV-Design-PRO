/**
 * Dane modułu NC RfG generatora (`daneModulu.ts`) — lustro JEDNEGO walidatora backendu
 * `enm/deklaracje_modulu.py::pola_nc_rfg_generatora` (plan AB O-50 pkt 5–6). Iloczyn cech:
 * pole (art. 4 × data × nastawy × flagi × liczby × źródło) × stan (puste / poprawne / spoza
 * kontraktu) × kierunek (model → formularz → pola kontraktu → model).
 */

import { describe, expect, it } from 'vitest';

import {
  POLA_FLAG_DEKLARACJI,
  POLA_LICZBOWE_DEKLARACJI,
  PUSTE_DANE_MODULU,
  formularzDanychModuluZModelu,
  jestDataKalendarzowa,
  polaNcRfgDoPayloadu,
  zbudujPolaNcRfgGeneratora,
  zmienionePolaNcRfg,
  type DaneModuluGeneratora,
  type FormularzDanychModulu,
} from '../daneModulu';

const MODEL_PUSTY: DaneModuluGeneratora = {
  modul_istniejacy: null,
  data_umowy_przylaczeniowej: null,
  nastawy_zabezpieczen: null,
  deklaracje_modulu: null,
};

function bledy(f: FormularzDanychModulu): string[] {
  const wynik = zbudujPolaNcRfgGeneratora(f);
  return wynik.stan === 'blad' ? Object.keys(wynik.bledy).sort() : [];
}

describe('zbudujPolaNcRfgGeneratora', () => {
  it('formularz pusty → wszystkie pola `null` (stan „nieustalone", nigdy wartość typowa)', () => {
    expect(zbudujPolaNcRfgGeneratora(PUSTE_DANE_MODULU)).toEqual({
      stan: 'ok',
      pola: MODEL_PUSTY,
    });
    expect(polaNcRfgDoPayloadu(PUSTE_DANE_MODULU)).toEqual({});
  });

  it.each([
    ['2025-05-12', true],
    ['2024-02-29', true],
    ['2025-02-29', false],
    ['2025-13-01', false],
    ['12.05.2025', false],
    ['1735689600', false],
    ['2025-5-12', false],
  ] as const)('data umowy %s → kalendarzowa: %s (lustro `DataUmowy`)', (data, ok) => {
    expect(jestDataKalendarzowa(data)).toBe(ok);
    expect(bledy({ ...PUSTE_DANE_MODULU, dataUmowy: data })).toEqual(
      ok ? [] : ['data_umowy_przylaczeniowej'],
    );
  });

  it('każda flaga deklaracji: trzy stany → `null`/`true`/`false`; źródło wymagane przy wartości', () => {
    for (const pole of POLA_FLAG_DEKLARACJI) {
      for (const [stan, wartosc] of [
        ['tak', true],
        ['nie', false],
      ] as const) {
        const f = { ...PUSTE_DANE_MODULU, flagi: { ...PUSTE_DANE_MODULU.flagi, [pole]: stan } };
        expect(bledy(f), pole).toEqual(['zrodlo_deklaracji']);
        const wynik = zbudujPolaNcRfgGeneratora({ ...f, zrodloDeklaracji: 'karta katalogowa' });
        expect(wynik.stan === 'ok' && wynik.pola.deklaracje_modulu?.[pole], pole).toBe(wartosc);
        // Pozostałe flagi: nie zadeklarowano = `null`, nie `false`.
        const inna = POLA_FLAG_DEKLARACJI.find((p) => p !== pole)!;
        expect(wynik.stan === 'ok' && wynik.pola.deklaracje_modulu?.[inna]).toBeNull();
      }
    }
  });

  it('każda liczba deklaracji: wartość poza dziedziną kontraktu → nazwany błąd pola', () => {
    for (const pole of POLA_LICZBOWE_DEKLARACJI) {
      const f = {
        ...PUSTE_DANE_MODULU,
        liczby: { ...PUSTE_DANE_MODULU.liczby, [pole]: '-1' },
        zrodloDeklaracji: 'karta',
      };
      expect(bledy(f), pole).toContain(pole);
      const tekst = { ...f, liczby: { ...f.liczby, [pole]: 'abc' } };
      expect(bledy(tekst), pole).toContain(pole);
    }
  });

  it('nastawy: wartość bez źródła i próg górny ≤ dolny → nazwane błędy', () => {
    const f: FormularzDanychModulu = {
      ...PUSTE_DANE_MODULU,
      nastawy: {
        wartosci: { ...PUSTE_DANE_MODULU.nastawy.wartosci, f_min_hz: '51', f_max_hz: '50' },
        zrodlo: '',
      },
    };
    expect(bledy(f)).toEqual(['f_max_hz', 'zrodlo_pl']);
  });

  it('samo źródło deklaracji bez wartości → blok deklaracji ze źródłem i polami `null`', () => {
    const wynik = zbudujPolaNcRfgGeneratora({ ...PUSTE_DANE_MODULU, zrodloDeklaracji: 'karta' });
    expect(wynik.stan).toBe('ok');
    expect(wynik.stan === 'ok' && wynik.pola.deklaracje_modulu?.zrodlo_pl).toBe('karta');
  });
});

describe('model → formularz → pola (odczyt i zapis zmienionych)', () => {
  const MODEL: DaneModuluGeneratora = {
    modul_istniejacy: true,
    data_umowy_przylaczeniowej: '2019-04-27',
    nastawy_zabezpieczen: { u_min_pu: 0.8, zrodlo_pl: 'karta nastaw' },
    deklaracje_modulu: { has_scada_communication: false, p_min_kw: 0, zrodlo_pl: 'deklaracja' },
  };

  it('odczyt 1:1 (zero i `false` zachowane, brak = pusto/„nieustalone")', () => {
    const f = formularzDanychModuluZModelu(MODEL);
    expect(f.modulIstniejacy).toBe('tak');
    expect(f.dataUmowy).toBe('2019-04-27');
    expect(f.nastawy.wartosci.u_min_pu).toBe('0.8');
    expect(f.nastawy.wartosci.f_min_hz).toBe('');
    expect(f.flagi.has_scada_communication).toBe('nie');
    expect(f.flagi.has_disturbance_recorder).toBe('nieustalone');
    expect(f.liczby.p_min_kw).toBe('0');
  });

  it('bez zmian → zero pól do zapisu; zmiana jednego pola → tylko ono', () => {
    const f = formularzDanychModuluZModelu(MODEL);
    const bez = zbudujPolaNcRfgGeneratora(f);
    expect(bez.stan === 'ok' && zmienionePolaNcRfg(bez.pola, MODEL)).toEqual({});
    const zmieniony = zbudujPolaNcRfgGeneratora({ ...f, modulIstniejacy: 'nieustalone' });
    expect(zmieniony.stan === 'ok' && zmienionePolaNcRfg(zmieniony.pola, MODEL)).toEqual({
      modul_istniejacy: null,
    });
  });
});
