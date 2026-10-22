/**
 * Karta SC-IB-ITH-ZRODLA — reguła danych t_b po stronie formularza = reguła backendu
 * (`network_model/core/czas_wylaczenia.py::czas_tb_z_danych`): puste = `null` (karta
 * TB-WARTOSC-ROBOCZA: t_b rozstrzygany w punkcie zwarcia — pola lokalne, inaczej wartość robocza),
 * liczba skończona dodatnia = t_b, reszta = odmowa z kodem `fault.czas_tb_niepoprawny`.
 * Iloczyn cech: {puste, spacje, kropka, przecinek, zero, ujemna, napis, nieskończoność} ×
 * {pole → wartość, konfiguracja → tekst pola, konfiguracja → opis listy}.
 */
import { describe, expect, it } from 'vitest';
import {
  DOMYSLNE_POLA_C,
  KOD_CZAS_TB_NIEPOPRAWNY,
  czasWylaczeniaZPola,
  konfiguracjaZwarciaZPol,
  OPIS_CZASU_TB_W_PUNKCIE,
  opisCzasuWylaczenia,
  poleCzasuWylaczenia,
} from '../wspolczynnikC';
import type { ShortCircuitConfig } from '../types';

describe('czasWylaczeniaZPola', () => {
  it.each([
    ['', null],
    ['   ', null],
    ['0.1', 0.1],
    ['0,25', 0.25],
    [' 0.02 ', 0.02],
  ])('„%s" → %s', (tekst, oczekiwane) => {
    expect(czasWylaczeniaZPola(tekst)).toEqual({ ok: true, wartosc: oczekiwane });
  });

  it.each(['0', '-0.1', 'abc', 'Infinity', '0,0'])('„%s" → odmowa nazwana', (tekst) => {
    const wynik = czasWylaczeniaZPola(tekst);
    expect(wynik.ok).toBe(false);
    if (!wynik.ok) {
      expect(wynik.kod).toBe(KOD_CZAS_TB_NIEPOPRAWNY);
      expect(wynik.blad).toContain('Czas wyłączenia t_b');
    }
  });
});

describe('konfiguracjaZwarciaZPol × t_b', () => {
  it('puste t_b → brak klucza (pole addytywne, backend exclude_none)', () => {
    const w = konfiguracjaZwarciaZPol(DOMYSLNE_POLA_C, 1, false, '');
    expect(w.ok).toBe(true);
    if (w.ok) expect(w.config).not.toHaveProperty('breaking_time_seconds');
  });

  it('t_b 0,1 → klucz z liczbą', () => {
    const w = konfiguracjaZwarciaZPol(DOMYSLNE_POLA_C, 1, false, '0,1');
    expect(w.ok).toBe(true);
    if (w.ok) expect(w.config.breaking_time_seconds).toBe(0.1);
  });

  it('t_b 0 → odmowa, brak konfiguracji', () => {
    const w = konfiguracjaZwarciaZPol(DOMYSLNE_POLA_C, 1, false, '0');
    expect(w).toMatchObject({ ok: false, kod: KOD_CZAS_TB_NIEPOPRAWNY });
  });
});

describe('poleCzasuWylaczenia / opisCzasuWylaczenia', () => {
  const konfig: ShortCircuitConfig = {
    scenariusz: 'MAX',
    nadpisanie_c: null,
    thermal_time_seconds: 1,
    include_branch_contributions: false,
  };

  it.each([
    [undefined, '', OPIS_CZASU_TB_W_PUNKCIE],
    [null, '', OPIS_CZASU_TB_W_PUNKCIE],
    [0.1, '0.1', '0,1 s'],
    [0.25, '0.25', '0,25 s'],
  ])('t_b %s → pole „%s", opis „%s"', (tb, pole, opis) => {
    const config: ShortCircuitConfig = { ...konfig, ...(tb === undefined ? {} : { breaking_time_seconds: tb }) };
    expect(poleCzasuWylaczenia(config)).toBe(pole);
    expect(opisCzasuWylaczenia(config)).toBe(opis);
  });

  it('brak konfiguracji → pole puste i reguła punktu zwarcia (bez liczby udającej t_b)', () => {
    expect(poleCzasuWylaczenia(null)).toBe('');
    expect(opisCzasuWylaczenia(undefined)).toBe(OPIS_CZASU_TB_W_PUNKCIE);
    expect(OPIS_CZASU_TB_W_PUNKCIE).not.toMatch(/\d/);
  });
});
