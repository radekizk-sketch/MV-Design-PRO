/*
 * Testy adapterów okna „Walidacja modelu falownika" (karta U4 P38). Weryfikują
 * czyste projekcje: opcje modułów DER (typ przekształtnika / brak typu), opcje
 * operatorów, serie wykresu (trajektoria + obwiednia), napięcie skrajne (min/max
 * projekcja), kolumny/wiersze tabeli scenariuszy (tagi, marginesy, kreska) oraz
 * agregację słownikową werdyktu całości. Zero fizyki, zero ocen lokalnych.
 */

import { describe, expect, it } from 'vitest';

import type { StationDerConnection } from '../../../../ui/network-build/station-der';
import {
  kolumnyTabeliFrt,
  napiecieSkrajneFrt,
  opcjeModulowFrt,
  opcjeOperatorowFrt,
  punktyObwiedniFrt,
  punktyTrajektoriiFrt,
  werdyktCalosciFrt,
  wierszeTabeliFrt,
} from '../frtModel';
import {
  katalogNcRfgFixture,
  widokHvrtWObwiedniFixture,
  widokLvrtWObwiedniFixture,
  widokModulWypadlFixture,
  widokPozaObwiedniaFixture,
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
    const opcje = opcjeOperatorowFrt(katalogNcRfgFixture().operators);
    expect(opcje.map((o) => o.id)).toEqual(['pse', 'pge']);
    expect(opcje[0].etykieta).toContain('PSE');
  });
});

describe('serie wykresu', () => {
  it('punktyTrajektoriiFrt rzutuje pola trajektorii (czas/napięcie/iq/p)', () => {
    const widok = widokLvrtWObwiedniFixture();
    const punkty = punktyTrajektoriiFrt(widok.scenariusze[0]);
    expect(punkty).toHaveLength(widok.scenariusze[0].trajektoria.length);
    expect(punkty[0]).toEqual({ czas: 0.0, napiecie: 1.0, iq: 0.0, p: 1.0 });
  });

  it('punktyObwiedniFrt rzutuje łamaną obwiedni profilu (czas/napięcie)', () => {
    const punkty = punktyObwiedniFrt(widokLvrtWObwiedniFixture());
    expect(punkty).toHaveLength(5);
    expect(punkty[0]).toEqual({ czas: 0.0, napiecie: 0.05 });
  });
});

describe('napiecieSkrajneFrt (projekcja min/max trajektorii)', () => {
  it('LVRT → minimum napięcia trajektorii (najgłębszy zapad)', () => {
    const widok = widokLvrtWObwiedniFixture();
    expect(napiecieSkrajneFrt(widok.scenariusze[0], 'lvrt')).toBe(0.05);
  });

  it('HVRT → maksimum napięcia trajektorii (najwyższy wzrost)', () => {
    const widok = widokHvrtWObwiedniFixture();
    expect(napiecieSkrajneFrt(widok.scenariusze[0], 'hvrt')).toBe(1.3);
  });
});

describe('tabela scenariuszy', () => {
  it('kolumnyTabeliFrt deklaruje jednostki (p.u. / s)', () => {
    const kolumny = kolumnyTabeliFrt();
    const klucze = kolumny.map((k) => k.klucz);
    expect(klucze).toEqual([
      'scenariusz',
      'glebokosc',
      'utrzymanie',
      'margines_s',
      'margines_pu',
      'odzysk',
      'werdykt',
    ]);
    expect(kolumny.find((k) => k.klucz === 'glebokosc')?.jednostka).toBe('p.u.');
    expect(kolumny.find((k) => k.klucz === 'odzysk')?.jednostka).toBe('s');
  });

  it('wiersz „w obwiedni": utrzymanie Tak (bez ostrzeżenia), werdykt z backendu', () => {
    const wiersze = wierszeTabeliFrt(widokLvrtWObwiedniFixture());
    expect(wiersze).toHaveLength(1);
    expect(wiersze[0].utrzymanie.wartosc).toBe('Tak');
    expect(wiersze[0].utrzymanie.ostrzezenie).toBe(false);
    expect(wiersze[0].werdykt.wartosc).toBe('w obwiedni');
    expect(wiersze[0].glebokosc.wartosc).toBe('0,050');
  });

  it('wiersz „moduł wypadł": utrzymanie Nie z tagiem ostrzegawczym, odzysk = kreska', () => {
    const wiersze = wierszeTabeliFrt(widokModulWypadlFixture());
    expect(wiersze[0].utrzymanie.wartosc).toBe('Nie');
    expect(wiersze[0].utrzymanie.ostrzezenie).toBe(true);
    expect(wiersze[0].odzysk.wartosc).toBe('—');
    expect(wiersze[0].margines_pu.ostrzezenie).toBe(true);
  });

  it('margines w p.u. ujemny → tag ostrzegawczy (flaga z pola solvera)', () => {
    const wiersze = wierszeTabeliFrt(widokPozaObwiedniaFixture());
    expect(wiersze[0].margines_pu.wartosc).toBe('-0,020');
    expect(wiersze[0].margines_pu.ostrzezenie).toBe(true);
  });
});

describe('werdyktCalosciFrt (agregacja słownikowa najgorszego)', () => {
  it('„w obwiedni" → istotność ok', () => {
    const w = werdyktCalosciFrt(widokLvrtWObwiedniFixture());
    expect(w.istotnosc).toBe('ok');
    expect(w.tekst).toContain('odzwierciedla wymagania profilu');
  });

  it('„poza obwiednią" → istotność warn', () => {
    const w = werdyktCalosciFrt(widokPozaObwiedniaFixture());
    expect(w.istotnosc).toBe('warn');
    expect(w.tekst).toContain('poza obwiednię');
  });

  it('„moduł wypadł" → istotność err', () => {
    const w = werdyktCalosciFrt(widokModulWypadlFixture());
    expect(w.istotnosc).toBe('err');
    expect(w.tekst).toContain('wypadł');
  });

  it('agreguje najgorszy werdykt spośród wielu scenariuszy', () => {
    const bazowy = widokLvrtWObwiedniFixture();
    const wypadl = widokModulWypadlFixture();
    const zlozony = {
      ...bazowy,
      scenariusze: [...bazowy.scenariusze, ...wypadl.scenariusze],
    };
    expect(werdyktCalosciFrt(zlozony).istotnosc).toBe('err');
  });
});
