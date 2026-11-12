/*
 * Karta stacji w inspektorze (karta INSPEKTOR-I-NAWIGACJA I.1, werdykt właściciela B-02) na
 * migawce wygenerowanej przez backend (6 stacji). ILOCZYN CECH:
 *  - rodzaj stacji {GPZ, odgałęźna, przelotowa, sekcyjna, końcowa, końcowa odgałęzienia};
 *  - układ rozdzielnicy {jedna sekcja, dwie sekcje ze sprzęgłem};
 *  - funkcja pola {liniowe, transformatorowe, sprzęgło};
 *  - prądy znamionowe transformatora {policzone przez backend, brak odpowiedzi}.
 * Kryteria: nagłówek „S02 · Stacja Sekcyjna” z napięciami z modelu, etykiety identyfikacji,
 * układ i sekcje z modelu (nie nazwa szyny „— sekcja B”), tabela pól bez kolumny „Rola”
 * i bez „stanu pola” (położenie ma łącznik — oznaczenie jak na rysunku), sprzęgło w obu
 * sekcjach, transformator jednym wierszem danych znamionowych z prądami z obliczeń i przejściem
 * do własnej karty, bez powtórzenia tabliczki.
 */
import { describe, expect, it } from 'vitest';

import fikstura from '../../../../harness-fixtures/generated/geometria_stacji_zamkniete.json';
import type { EnergyNetworkModel } from '../../../../types/enm';
import type { DaneElementuKanwy } from '../daneElementuKanwy';
import {
  buildKartaTechniczna,
  kluczPradowZnamionowych,
  KATALOGI_PUSTE,
  type KartaTechniczna,
  type ObliczeniaKarty,
} from '../kartaTechnicznaElementu';

const model = (fikstura as unknown as { snapshot: EnergyNetworkModel }).snapshot;
const stacja = (nazwa: string) => (model.substations ?? []).find((s) => s.name === nazwa)!;

function karta(nazwa: string, obliczenia?: ObliczeniaKarty): KartaTechniczna {
  const k = buildKartaTechniczna(model, { kind: 'station', elementId: stacja(nazwa).ref_id } as DaneElementuKanwy, KATALOGI_PUSTE, obliczenia);
  expect(k).not.toBeNull();
  return k!;
}
const sekcja = (k: KartaTechniczna, id: string) => k.sekcje.find((s) => s.id === id)!;
const wiersz = (k: KartaTechniczna, id: string, klucz: string) => sekcja(k, id).wiersze.find((w) => w.klucz === klucz)!;

const TR_SEKCYJNEJ = (model.transformers ?? []).find((t) => t.ref_id === stacja('Stacja Sekcyjna').transformer_refs?.[0])!;
const OBLICZENIA: ObliczeniaKarty = {
  pradyZnamionowe: new Map([[kluczPradowZnamionowych(TR_SEKCYJNEJ)!, { pierwotnyA: 24.2487, wtornyA: 909.327, podstawaPl: 'IEC 60076-1' }]]),
};

describe('karta stacji: Stacja Sekcyjna', () => {
  const k = karta('Stacja Sekcyjna', OBLICZENIA);

  it('nagłówek: oznaczenie na schemacie, nazwa, rodzaj i napięcia z modelu', () => {
    expect(k.oznaczenieSchematu).toMatch(/^S\d{2}$/);
    expect(k.nazwa).toBe('Stacja Sekcyjna');
    expect(k.napieciaPl).toBe('15/0,4 kV');
  });

  it('identyfikacja: oznaczenie eksploatacyjne i na schemacie, wykonanie stacji', () => {
    expect(wiersz(k, 'identyfikacja', 'oznaczenie')).toMatchObject({ etykieta: 'Oznaczenie eksploatacyjne', wartosc: null, brakPl: 'Nie nadano' });
    expect(wiersz(k, 'identyfikacja', 'kod')).toMatchObject({ etykieta: 'Oznaczenie na schemacie', wartosc: k.oznaczenieSchematu });
    expect(wiersz(k, 'identyfikacja', 'wykonanie')).toMatchObject({ etykieta: 'Wykonanie stacji', wartosc: null, brakPl: 'Nie określono' });
  });

  it('rozdzielnica SN: dwie sekcje ze sprzęgłem, sekcje z liczbą pól', () => {
    expect(wiersz(k, 'rozdzielnica_sn', 'uklad_sn').wartosc).toBe('dwie sekcje szyn ze sprzęgłem');
    expect(wiersz(k, 'rozdzielnica_sn', 'sekcje_sn').lista).toEqual([
      'Sekcja 1 · 15 kV — pola: 1 liniowe, 1 transformatorowe, 1 sprzęgła',
      'Sekcja 2 · 15 kV — pola: 1 liniowe, 1 sprzęgła',
    ]);
    expect(JSON.stringify(sekcja(k, 'rozdzielnica_sn'))).not.toContain('sekcja B');
  });

  it('tabela pól: oznaczenie, funkcja, sekcja, aparaty z położeniem łącznika; sprzęgło w obu sekcjach', () => {
    const tabela = sekcja(k, 'rozdzielnica_sn').tabele!.find((t) => t.klucz === 'pola_sn')!;
    expect(tabela.kolumny.map((c) => c.etykieta)).toEqual(['Pole', 'Funkcja', 'Sekcja', 'Aparaty']);
    const wiersze = tabela.wiersze.map((w) => w.komorki);
    // Łączniki pola z oznaczeniami z rekordów aparatów w modelu (wyłącznik Q0, odłączniki Q1/Q9,
    // uziemnik Q8; sprzęgło — odłącznik szyny drugiej sekcji Q2) i położeniem z modelu.
    const LACZNIKI = 'Q1 — zamknięty, Q0 — zamknięty, Q9 — zamknięty, Q8 — otwarty';
    expect(wiersze).toEqual([
      { pole: 'F01', funkcja: 'Pole liniowe wejściowe', sekcja: 'Sekcja 1', aparaty: LACZNIKI },
      { pole: 'F02', funkcja: 'Pole liniowe wyjściowe', sekcja: 'Sekcja 2', aparaty: LACZNIKI },
      { pole: 'F03', funkcja: 'Pole sprzęgła', sekcja: 'Sekcja 2 – Sekcja 1', aparaty: 'Q1 — zamknięty, Q0 — zamknięty, Q2 — zamknięty, Q8 — otwarty' },
      { pole: 'F04', funkcja: 'Pole transformatorowe', sekcja: 'Sekcja 1', aparaty: LACZNIKI },
    ]);
    for (const w of wiersze) expect(Object.keys(w)).not.toContain('stan');
  });

  it('transformator: dane znamionowe jednym wierszem, prądy z obliczeń, przejście do karty, bez tabliczki', () => {
    const tr = sekcja(k, 'transformator');
    expect(wiersz(k, 'transformator', 'tr_dane').wartosc).toBe('630 kVA · 15/0,4 kV · Dyn11');
    expect(wiersz(k, 'transformator', 'tr_prady')).toMatchObject({ wartosc: '24,2 A / 909 A', zrodloPl: 'obliczone: IEC 60076-1' });
    expect(tr.wiersze.map((w) => w.klucz)).not.toContain('tr_uk');
    // „T1” tylko z modelu: rekord pola bez oznaczenia transformatora — brak wiersza oznaczenia.
    expect(tr.wiersze.map((w) => w.klucz)).not.toContain('tr_oznaczenie');
    const przejscie = tr.tabele!.find((t) => t.klucz === 'tr_karta')!.wiersze[0];
    expect(przejscie.cel).toEqual({ rodzaj: 'transformator', transformatorRef: TR_SEKCYJNEJ.ref_id });
  });

  it('prądy znamionowe bez odpowiedzi serwera: brak z przyczyną, nigdy liczba z frontu', () => {
    const bez = karta('Stacja Sekcyjna');
    expect(wiersz(bez, 'transformator', 'tr_prady')).toMatchObject({ wartosc: null, brakPl: 'obliczenie prądów znamionowych bez odpowiedzi serwera' });
  });
});

describe.each((model.substations ?? []).filter((s) => s.station_type !== 'gpz').map((s) => [s.name] as const))(
  'karta stacji %s: układ i sekcje z modelu',
  (nazwa) => {
    it('jedna sekcja bez sprzęgła albo dwie ze sprzęgłem; każde pole w tabeli raz', () => {
      const k = karta(nazwa);
      const uklad = wiersz(k, 'rozdzielnica_sn', 'uklad_sn').wartosc;
      expect(uklad).toBe(nazwa === 'Stacja Sekcyjna' ? 'dwie sekcje szyn ze sprzęgłem' : 'jedna sekcja szyn');
      const tabela = sekcja(k, 'rozdzielnica_sn').tabele!.find((t) => t.klucz === 'pola_sn')!;
      const refy = tabela.wiersze.map((w) => w.klucz);
      expect(new Set(refy).size).toBe(refy.length);
      for (const w of tabela.wiersze) expect(w.komorki.aparaty).not.toContain('zamknięty zamknięty');
      expect(k.napieciaPl).toMatch(/^15\/0,4 kV$/);
    });
  },
);

// Karta szyny (I.2) — iloczyn: strona {SN sekcja 1, SN sekcja 2, nN} × stacja Sekcyjna.
describe('karta szyny: Stacja Sekcyjna', () => {
  const S = stacja('Stacja Sekcyjna');
  const kartaSzyny = (ref: string) => buildKartaTechniczna(model, { kind: 'bus', elementId: ref } as DaneElementuKanwy)!;
  const klucze = (k: KartaTechniczna) => k.sekcje.flatMap((s) => s.wiersze.map((w) => w.klucz));
  const wartosc = (k: KartaTechniczna, klucz: string) => k.sekcje.flatMap((s) => s.wiersze).find((w) => w.klucz === klucz)!;

  it('szyna nN: nagłówek ze stacją, kolejność wierszy, tor zasilania z transformatora', () => {
    const k = kartaSzyny(S.bus_refs.find((r) => r.endsWith('/nn_bus'))!);
    expect(k.nazwa).toBe('Stacja Sekcyjna · Szyna nN');
    expect(k.oznaczenieSchematu).toMatch(/^S\d{2}$/);
    expect(k.napieciaPl).toBe('0,4 kV');
    expect(klucze(k)).toEqual(['oznaczenie', 'stacja', 'napiecie', 'sekcja', 'tor_zasilania', 'stan_toru', 'aparaty', 'przylaczenia']);
    expect(wartosc(k, 'stacja').wartosc).toBe('Stacja Sekcyjna · rozdzielnica nN');
    expect(wartosc(k, 'sekcja').wartosc).toBe('Sekcja 1');
    expect(wartosc(k, 'tor_zasilania').lista).toEqual(['Transformator SN/nN · 630 kVA · z pola Pole transformatorowe 4']);
    expect(wartosc(k, 'stan_toru').lista).toEqual(['Pole transformatorowe 4: Q1 — zamknięty, Q0 — zamknięty, Q9 — zamknięty, Q8 — otwarty']);
    // „Wyłącznik główny nN” raz — w aparatach szyny, nie powtórzony w przyłączeniach.
    const wszystko = JSON.stringify(k.sekcje);
    expect(wszystko.split('Wyłącznik główny nN').length - 1).toBe(1);
    expect(wartosc(k, 'przylaczenia').lista!.every((p) => !p.startsWith('Wyłącznik'))).toBe(true);
  });

  it.each([
    ['sn_bus', 'Sekcja 1'],
    ['sn_bus_b', 'Sekcja 2'],
  ] as const)('szyna SN %s: sekcja z modelu, łączniki pól nie są przyłączeniami', (sufiks, sekcjaOczekiwana) => {
    const k = kartaSzyny(S.bus_refs.find((r) => r.endsWith(`/${sufiks}`))!);
    expect(k.nazwa).toBe('Stacja Sekcyjna · Szyna SN');
    expect(wartosc(k, 'sekcja').wartosc).toBe(sekcjaOczekiwana);
    expect(wartosc(k, 'przylaczenia').lista!.some((p) => p.startsWith('Wyłącznik'))).toBe(false);
    // Sekcja z modelu (pozycja szyny w stacji), nie z nazwy rekordu („— sekcja B”).
    expect(wartosc(k, 'sekcja').wartosc).not.toContain('B');
    // Tor zasilania: pole wejściowe sekcji, a sekcja bez niego — sprzęgło.
    expect(wartosc(k, 'tor_zasilania').lista).toEqual([sufiks === 'sn_bus' ? 'Pole liniowe wejściowe 1' : 'Pole sprzęgła 3']);
  });
});
