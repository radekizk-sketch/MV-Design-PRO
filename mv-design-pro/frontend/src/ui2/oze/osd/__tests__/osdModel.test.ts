/*
 * Testy adapterów okna „Odpowiedź na polecenia OSD" (karta P40). Czysta warstwa
 * prezentacji: dobór źródła ze snapshotu, mapowanie parametrów polecenia, karty
 * porównania (delta prezentacji vs delta backendu), tabela napięć BEZ tagów oraz
 * ślad WHITE BOX. Fixtures 1:1 z backendem; zero fizyki, zero ocen lokalnych.
 */

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import {
  kartyPorownaniaOsd,
  kolumnyTabeliOsd,
  krokiSladuOsd,
  opcjeZrodel,
  poleParametrowOsd,
  wierszeTabeliOsd,
} from '../osdModel';
import { snapshotFixture, widokOsdFixture, widokOsdZBrakamiFixture } from './fixtures';

describe('opcjeZrodel — dobór źródła ze snapshotu (recon D7: generators[].ref_id)', () => {
  it('pusty/nieobecny snapshot → brak opcji', () => {
    expect(opcjeZrodel(null)).toEqual([]);
    expect(opcjeZrodel({} as EnergyNetworkModel)).toEqual([]);
  });

  it('mapuje generatory na opcje (ref_id + nazwa PL), sortuje po ref_id', () => {
    const opcje = opcjeZrodel(snapshotFixture());
    expect(opcje).toEqual([
      { refId: 'gen_pv', etykieta: 'Falownik PV' },
      { refId: 'gen_sync', etykieta: 'Generator synchroniczny' },
    ]);
  });

  it('brak nazwy → etykieta z ref_id (rezerwa)', () => {
    const snapshot = {
      generators: [{ ref_id: 'gen_x', name: null, bus_ref: 'bus-a', p_mw: 1 }],
    } as unknown as EnergyNetworkModel;
    expect(opcjeZrodel(snapshot)).toEqual([{ refId: 'gen_x', etykieta: 'gen_x' }]);
  });
});

describe('poleParametrowOsd — pola parametrów per polecenie (1:1 z _resolve_setpoint)', () => {
  it('każde polecenie zwraca właściwy zestaw pól', () => {
    expect(poleParametrowOsd('ograniczenie_p')).toEqual(['limitP']);
    expect(poleParametrowOsd('moc_bierna')).toEqual(['q']);
    expect(poleParametrowOsd('cosfi')).toEqual(['cosfi', 'charakter']);
    expect(poleParametrowOsd('lfsm_o')).toEqual(['czestotliwosc', 'droop', 'strefaMartwa']);
    expect(poleParametrowOsd('lfsm_u')).toEqual(['czestotliwosc', 'droop', 'strefaMartwa']);
  });
});

describe('kartyPorownaniaOsd — karty przed/po z deltami', () => {
  it('buduje cztery karty (P/Q źródła + straty P/Q)', () => {
    const karty = kartyPorownaniaOsd(widokOsdFixture());
    expect(karty.map((k) => k.klucz)).toEqual(['p_zrodla', 'q_zrodla', 'straty_p', 'straty_q']);
  });

  it('delta P źródła = arytmetyka prezentacji (po − przed), znak jawny', () => {
    const karty = kartyPorownaniaOsd(widokOsdFixture());
    const p = karty.find((k) => k.klucz === 'p_zrodla')!;
    expect(p.przed).toBe('2,000');
    expect(p.po).toBe('1,000');
    expect(p.delta).toBe('−1,000');
  });

  it('delta Q źródła zerowa → bez znaku', () => {
    const q = kartyPorownaniaOsd(widokOsdFixture()).find((k) => k.klucz === 'q_zrodla')!;
    expect(q.delta).toBe('0,000');
  });

  it('delta strat WPROST z backendu (_losses)', () => {
    const straty = kartyPorownaniaOsd(widokOsdFixture()).find((k) => k.klucz === 'straty_p')!;
    expect(straty.delta).toBe('−0,030');
  });

  it('braki (null) → kreska w wartości i delcie', () => {
    const karty = kartyPorownaniaOsd(widokOsdZBrakamiFixture());
    const p = karty.find((k) => k.klucz === 'p_zrodla')!;
    expect(p.po).toBe('—');
    expect(p.delta).toBe('—');
    const straty = karty.find((k) => k.klucz === 'straty_p')!;
    expect(straty.delta).toBe('—');
  });
});

describe('kolumnyTabeliOsd / wierszeTabeliOsd — tabela napięć', () => {
  it('cztery kolumny z jednostkami p.u.', () => {
    const kol = kolumnyTabeliOsd();
    expect(kol.map((k) => k.klucz)).toEqual(['wezel', 'u_przed', 'u_po', 'delta_u']);
    expect(kol.filter((k) => k.jednostka === 'p.u.')).toHaveLength(3);
  });

  it('mapuje węzły: nazwa, U przed/po, ΔU ze znakiem + sortKey; BEZ tagów (zero oceny)', () => {
    const wiersze = wierszeTabeliOsd(widokOsdFixture());
    expect(wiersze).toHaveLength(2);
    expect(wiersze[0].wezel.wartosc).toBe('Szyna A');
    expect(wiersze[0].u_przed.wartosc).toBe('1,0200');
    expect(wiersze[0].delta_u.wartosc).toBe('−0,0100');
    expect(wiersze[0].delta_u.sortKey).toBe(-0.01);
    // Odpowiedź nie niesie flagi — żadna komórka nie ma ostrzeżenia.
    for (const wiersz of wiersze) {
      for (const komorka of Object.values(wiersz)) {
        expect(komorka.ostrzezenie).toBeUndefined();
      }
    }
  });

  it('brak nazwy węzła → ref jako rezerwa; braki napięć → kreska', () => {
    const wiersze = wierszeTabeliOsd(widokOsdZBrakamiFixture());
    expect(wiersze[0].wezel.wartosc).toBe('bus-a');
    expect(wiersze[0].u_przed.wartosc).toBe('—');
    expect(wiersze[0].delta_u.wartosc).toBe('—');
  });
});

describe('krokiSladuOsd — ślad WHITE BOX (adapter SladAnalizy)', () => {
  it('trzy kroki: nastaw + bieg bazowy + bieg z poleceniem', () => {
    const kroki = krokiSladuOsd(widokOsdFixture());
    expect(kroki).toHaveLength(3);
    expect(kroki.map((k) => k.symbol)).toEqual(['nastaw', 'bieg bazowy', 'bieg z poleceniem']);
  });

  it('krok nastawu opisuje polecenie i nastawy P/Q przed→po', () => {
    const nastaw = krokiSladuOsd(widokOsdFixture())[0];
    expect(nastaw.substitution_pl).toContain('p_limit_pct = 50');
    expect(nastaw.result_pl).toContain('2,000 → 1,000 MW');
    expect(nastaw.result_pl).toContain('0,500 → 0,500 Mvar');
  });

  it('kroki biegów niosą zbieżność, iteracje i straty z backendu', () => {
    const kroki = krokiSladuOsd(widokOsdFixture());
    expect(kroki[1].result_pl).toContain('zbiezny');
    expect(kroki[1].result_pl).toContain('iteracje = 4');
    expect(kroki[2].result_pl).toContain('iteracje = 5');
    expect(kroki[2].result_pl).toContain('straty P = 0,090 MW');
  });
});
