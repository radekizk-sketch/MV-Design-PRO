/**
 * Testy `rozpakujWartoscSladu` (karta WB-2) — jedynego miejsca rozpakowania
 * surowej wartości kroku śladu WHITE BOX, zastępującego trzy (a po
 * doszukaniu klasy — pięć) niezależnych kopii tego samego duck-typingu.
 *
 * Pokrycie jako ILOCZYN CECH (nie przykład z karty): skalar liczbowy ×
 * łańcuch × boolean × null × undefined × {re, im} × opakowany TraceValue
 * {value, unit, label} × TraceValue z value = {re, im} × TraceValue z
 * value = null × nieznany obiekt bez `value` × tablica × NaN — plus
 * kombinacje brzegowe (obecność/brak unit i label niezależnie, re/im razem
 * z `value` na tym samym poziomie — precedens z dotychczasowego
 * `unwrapTraceValue`/`rozpakujWartosc`).
 */
import { describe, expect, it } from 'vitest';

import { rozpakujWartoscSladu } from '../traceValue';

describe('rozpakujWartoscSladu — skalar wprost (kształt realnie emitowany przez WhiteBoxTracer.add)', () => {
  it('liczba dodatnia', () => {
    expect(rozpakujWartoscSladu(5611.281490619905)).toEqual({ wartosc: 5611.281490619905 });
  });

  it('liczba zero (falsy, ale nie brak)', () => {
    expect(rozpakujWartoscSladu(0)).toEqual({ wartosc: 0 });
  });

  it('łańcuch', () => {
    expect(rozpakujWartoscSladu('C')).toEqual({ wartosc: 'C' });
  });

  it('łańcuch pusty (falsy, ale nie brak)', () => {
    expect(rozpakujWartoscSladu('')).toEqual({ wartosc: '' });
  });

  it('boolean — true', () => {
    expect(rozpakujWartoscSladu(true)).toEqual({ wartosc: true });
  });

  it('boolean — false (falsy, ale nie brak)', () => {
    expect(rozpakujWartoscSladu(false)).toEqual({ wartosc: false });
  });

  it('null', () => {
    expect(rozpakujWartoscSladu(null)).toEqual({ wartosc: null });
  });

  it('undefined', () => {
    expect(rozpakujWartoscSladu(undefined)).toEqual({ wartosc: null });
  });

  it('NaN przekazane WPROST jako liczba — formatowanie (nie rozpakowanie) decyduje o prezentacji', () => {
    const wynik = rozpakujWartoscSladu(NaN);
    expect(typeof wynik.wartosc).toBe('number');
    expect(Number.isNaN(wynik.wartosc)).toBe(true);
  });
});

describe('rozpakujWartoscSladu — liczba zespolona {re, im} wprost (serialize_complex solvera)', () => {
  it('oba pola number → re/im przeniesione, wartosc null (formatowanie zespolone zostaje przy wywołującym)', () => {
    expect(rozpakujWartoscSladu({ re: 0.0821, im: 0.7734 })).toEqual({
      wartosc: null,
      re: 0.0821,
      im: 0.7734,
    });
  });

  it('im ujemne — znak zachowany bez zmian (nie rozpakowanie decyduje o prezentacji znaku)', () => {
    expect(rozpakujWartoscSladu({ re: 1, im: -2 })).toEqual({ wartosc: null, re: 1, im: -2 });
  });

  it('re i im oba zero — nadal rozpoznane jako zespolona (0 to liczba, nie brak)', () => {
    expect(rozpakujWartoscSladu({ re: 0, im: 0 })).toEqual({ wartosc: null, re: 0, im: 0 });
  });

  it('re/im obecne jako łańcuchy (nie number) — NIE rozpoznane jako zespolona, uczciwy brak', () => {
    expect(rozpakujWartoscSladu({ re: '1', im: '2' })).toEqual({ wartosc: null });
  });

  it('tylko re bez im — NIE rozpoznane jako zespolona, uczciwy brak', () => {
    expect(rozpakujWartoscSladu({ re: 1 })).toEqual({ wartosc: null });
  });
});

describe('rozpakujWartoscSladu — opakowany TraceValue {value, unit, label} (zgodność wsteczna — starsze/testowe fixture)', () => {
  it('value liczbowe + unit, bez label', () => {
    expect(rozpakujWartoscSladu({ value: 12.345, unit: 'kA' })).toEqual({
      wartosc: 12.345,
      unit: 'kA',
    });
  });

  it('value łańcuchowe, bez unit i bez label', () => {
    expect(rozpakujWartoscSladu({ value: 'IEC 60909' })).toEqual({ wartosc: 'IEC 60909' });
  });

  it('value boolean + label, bez unit', () => {
    expect(rozpakujWartoscSladu({ value: true, label: 'Zbieżność' })).toEqual({
      wartosc: true,
      label: 'Zbieżność',
    });
  });

  it('value + unit + label razem (wszystkie trzy pola opakowania)', () => {
    expect(
      rozpakujWartoscSladu({ value: 3, unit: 'x', label: 'Wielkość pomocnicza' }),
    ).toEqual({
      wartosc: 3,
      unit: 'x',
      label: 'Wielkość pomocnicza',
    });
  });

  it('value liczbowe = 0 — opakowanie rozpoznane, wartosc 0 (nie brak)', () => {
    expect(rozpakujWartoscSladu({ value: 0, unit: 'A' })).toEqual({ wartosc: 0, unit: 'A' });
  });

  it('value = {re, im} → re/im przeniesione wprost, wartosc null, unit/label opakowania zachowane', () => {
    expect(
      rozpakujWartoscSladu({ value: { re: 0.0821, im: 0.7734 }, unit: 'Ω', label: 'Z1' }),
    ).toEqual({
      wartosc: null,
      re: 0.0821,
      im: 0.7734,
      unit: 'Ω',
      label: 'Z1',
    });
  });

  it('value = {re, im} bez unit/label opakowania — same re/im', () => {
    expect(rozpakujWartoscSladu({ value: { re: 1, im: 2 } })).toEqual({
      wartosc: null,
      re: 1,
      im: 2,
    });
  });

  it('value = null — uczciwy brak, unit opakowania zachowany', () => {
    expect(rozpakujWartoscSladu({ value: null, unit: 'kV' })).toEqual({
      wartosc: null,
      unit: 'kV',
    });
  });

  it('value = undefined (klucz obecny) — traktowane jak brak wartości opakowania', () => {
    expect(rozpakujWartoscSladu({ value: undefined, unit: 'kV' })).toEqual({
      wartosc: null,
      unit: 'kV',
    });
  });

  it('value = tablica (kształt nierozpoznany wewnątrz opakowania) — uczciwy brak, label zachowany', () => {
    expect(rozpakujWartoscSladu({ value: [1, 2], label: 'Lista' })).toEqual({
      wartosc: null,
      label: 'Lista',
    });
  });

  it('unit spoza typu string (np. liczba) — pomijane (uczciwy brak jednostki, nie zgadywanie)', () => {
    expect(rozpakujWartoscSladu({ value: 5, unit: 42 })).toEqual({ wartosc: 5 });
  });

  it('label spoza typu string (np. liczba) — pomijane (uczciwy brak etykiety, nie zgadywanie)', () => {
    expect(rozpakujWartoscSladu({ value: 5, label: 42 })).toEqual({ wartosc: 5 });
  });
});

describe('rozpakujWartoscSladu — re/im razem z `value` na tym samym poziomie (precedens dotychczasowego unwrapTraceValue/rozpakujWartosc: re/im wygrywają, NIE traktowane jako opakowanie)', () => {
  it('{value, re, im} — re/im wygrywają, .value ignorowane', () => {
    expect(rozpakujWartoscSladu({ value: 999, re: 1, im: 2 })).toEqual({
      wartosc: null,
      re: 1,
      im: 2,
    });
  });
});

describe('rozpakujWartoscSladu — nieznany obiekt bez rozpoznanego kształtu (uczciwy brak, nigdy "[object Object]")', () => {
  it('obiekt bez pola value i bez re/im', () => {
    expect(rozpakujWartoscSladu({ foo: 'bar' })).toEqual({ wartosc: null });
  });

  it('obiekt pusty {}', () => {
    expect(rozpakujWartoscSladu({})).toEqual({ wartosc: null });
  });
});

describe('rozpakujWartoscSladu — tablica (uczciwy brak; element listy formatuje wywołujący, nie ta funkcja)', () => {
  it('tablica liczb', () => {
    expect(rozpakujWartoscSladu([1, 2, 3])).toEqual({ wartosc: null });
  });

  it('tablica pusta', () => {
    expect(rozpakujWartoscSladu([])).toEqual({ wartosc: null });
  });

  it('tablica liczb zespolonych (np. v_nodes_pu dla wielu szyn)', () => {
    expect(rozpakujWartoscSladu([{ re: 1, im: 0 }, { re: 0.98, im: -0.01 }])).toEqual({
      wartosc: null,
    });
  });
});
