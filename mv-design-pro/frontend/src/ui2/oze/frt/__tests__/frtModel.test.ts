/*
 * Testy adapterów okna „Walidacja modelu falownika" (karta U4 P38). Weryfikują
 * czyste projekcje: opcje modułów DER (typ przekształtnika / brak typu), opcje
 * operatorów, serie wykresu (trajektoria + obwiednia), napięcie skrajne (min/max
 * projekcja), kolumny/wiersze tabeli pierwszego planu (echo + etykieta oceny z
 * rekordu) i tabeli audytowej pól solvera (bez tagów). Zero fizyki, zero ocen lokalnych.
 *
 * Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): agregacja „werdyktu całości"
 * skasowana razem z werdyktem FRT (tautologia wobec profilu wejściowego) — brak
 * eksportu pilnuje `uczciwosc.test.tsx`.
 */

import { describe, expect, it } from 'vitest';

import type { StationDerConnection } from '../../../../ui/network-build/station-der';
import {
  kolumnyAudytuFrt,
  kolumnyTabeliFrt,
  napiecieSkrajneFrt,
  opcjeModulowFrt,
  opcjeOperatorowFrt,
  punktyObwiedniFrt,
  punktyTrajektoriiFrt,
  wierszeAudytuFrt,
  wierszeTabeliFrt,
} from '../frtModel';
import {
  katalogNcRfgFixture,
  widokHvrtFixture,
  widokLvrtFixture,
  widokModulOdlaczonyFixture,
} from './fixtures';

/** Minimalny moduł DER dla testów adapterów (pola nieistotne pominięte przez rzutowanie). */
function der(
  id: string,
  deviceRef: string | null,
  name = 'Moduł',
): StationDerConnection {
  return {
    id,
    name,
    der_kind: 'PV',
    catalogs: { device_catalog_ref: deviceRef },
  } as unknown as StationDerConnection;
}

describe('opcjeModulowFrt', () => {
  it('mapuje moduł z typem przekształtnika (derRef = device_catalog_ref)', () => {
    const opcje = opcjeModulowFrt([der('der-1', 'conv-pv-1mw-15kv', 'Farma PV')]);
    expect(opcje).toHaveLength(1);
    expect(opcje[0].derId).toBe('der-1');
    expect(opcje[0].derRef).toBe('conv-pv-1mw-15kv');
    expect(opcje[0].etykieta).toContain('Farma PV');
    expect(opcje[0].etykieta).not.toContain('brak wskazanego typu');
  });

  it('oznacza moduł bez typu przekształtnika (derRef null + adnotacja)', () => {
    const opcje = opcjeModulowFrt([der('der-2', null, 'Magazyn')]);
    expect(opcje[0].derRef).toBeNull();
    expect(opcje[0].etykieta).toContain('brak wskazanego typu przekształtnika');
  });
});

describe('opcjeOperatorowFrt', () => {
  it('mapuje operatorów katalogu NC RfG na nazwy PL', () => {
    // Intencja zachowana: operatorzy w kolejności źródłowej z nazwą PL. Zmiana kanonu
    // (2026-09-23): fixtura to odpowiedź katalogu V2 wygenerowana z backendu (pięciu
    // operatorów profilu), nie dwa wpisy złożone ręcznie.
    const katalog = katalogNcRfgFixture();
    const opcje = opcjeOperatorowFrt(katalog.operators);
    expect(opcje.map((o) => o.id)).toEqual(katalog.operators.map((op) => op.operator_id));
    const pse = opcje.find((o) => o.id === 'pse');
    expect(pse?.etykieta).toContain('PSE');
  });
});

describe('serie wykresu', () => {
  it('punktyTrajektoriiFrt rzutuje pola trajektorii (czas/napięcie/iq/p)', () => {
    const widok = widokLvrtFixture();
    const punkty = punktyTrajektoriiFrt(widok.scenariusze[0]);
    expect(punkty).toHaveLength(widok.scenariusze[0].trajektoria.length);
    expect(punkty[0]).toEqual({ czas: 0.0, napiecie: 1.0, iq: 0.0, p: 1.0 });
  });

  it('punktyObwiedniFrt rzutuje łamaną obwiedni profilu (czas/napięcie)', () => {
    const punkty = punktyObwiedniFrt(widokLvrtFixture());
    expect(punkty).toHaveLength(5);
    expect(punkty[0]).toEqual({ czas: 0.0, napiecie: 0.05 });
  });
});

describe('napiecieSkrajneFrt (projekcja min/max trajektorii)', () => {
  it('LVRT → minimum napięcia trajektorii (najgłębszy zapad)', () => {
    const widok = widokLvrtFixture();
    expect(napiecieSkrajneFrt(widok.scenariusze[0], 'lvrt')).toBe(0.05);
  });

  it('HVRT → maksimum napięcia trajektorii (najwyższy wzrost)', () => {
    const widok = widokHvrtFixture();
    expect(napiecieSkrajneFrt(widok.scenariusze[0], 'hvrt')).toBe(1.3);
  });
});

describe('tabela scenariuszy (pierwszy plan)', () => {
  it('kolumnyTabeliFrt: echo scenariusza + etykieta oceny, bez pól solvera', () => {
    const kolumny = kolumnyTabeliFrt();
    expect(kolumny.map((k) => k.klucz)).toEqual(['scenariusz', 'glebokosc', 'ocena']);
    expect(kolumny.find((k) => k.klucz === 'glebokosc')?.jednostka).toBe('p.u.');
  });

  it('wiersz niesie etykietę z rekordu oceny backendu i echo zapadu', () => {
    const wiersze = wierszeTabeliFrt(widokLvrtFixture());
    expect(wiersze).toHaveLength(1);
    expect(wiersze[0].ocena.wartosc).toBe('Ocena niewykonana');
    expect(wiersze[0].glebokosc.wartosc).toBe('0,050');
    expect(Object.keys(wiersze[0])).not.toContain('utrzymanie');
  });
});

describe('tabela audytowa pól solvera', () => {
  it('kolumnyAudytuFrt deklaruje pola solvera z jednostkami (p.u. / s)', () => {
    const kolumny = kolumnyAudytuFrt();
    expect(kolumny.map((k) => k.klucz)).toEqual([
      'scenariusz',
      'status',
      'utrzymanie',
      'margines_s',
      'margines_pu',
      'odzysk',
    ]);
    expect(kolumny.find((k) => k.klucz === 'odzysk')?.jednostka).toBe('s');
  });

  // Intencja zachowana: pola solvera (utrzymanie, margines, odzysk) prezentowane 1:1.
  // Zmiana kanonu: bez tagu ostrzegawczego — kolor z tautologii byłby oceną.
  it('meldunek odłączenia: „Nie", margines ujemny i odzysk „—" — bez tagów ostrzegawczych', () => {
    const wiersze = wierszeAudytuFrt(widokModulOdlaczonyFixture());
    expect(wiersze[0].utrzymanie.wartosc).toBe('Nie');
    expect(wiersze[0].margines_pu.wartosc).toBe('-0,050');
    expect(wiersze[0].odzysk.wartosc).toBe('—');
    expect(wiersze[0].status.wartosc).toBe('moduł odłączył się w modelu uproszczonym');
    for (const komorka of Object.values(wiersze[0])) {
      expect(komorka.ostrzezenie).toBeUndefined();
    }
  });

  it('meldunek utrzymania: „Tak" i status opisowy, nie ocena', () => {
    const wiersze = wierszeAudytuFrt(widokLvrtFixture());
    expect(wiersze[0].utrzymanie.wartosc).toBe('Tak');
    expect(wiersze[0].status.wartosc).toBe('moduł nie odłączył się w modelu uproszczonym');
  });
});
