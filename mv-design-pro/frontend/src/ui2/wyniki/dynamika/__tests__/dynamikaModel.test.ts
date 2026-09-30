/*
 * Model ekranu dynamiki (karta AB-P1) na odpowiedziach REALNEGO biegu backendu
 * (fixtury `harness-fixtures/generated/dynamika_scena_*`, liczone tymi samymi funkcjami,
 * które wołają końcówki). Iloczyn cech:
 *  - kanał × grupa (szyna / gałąź z zaciskiem od i do / miejsce zwarcia / urządzenie) —
 *    każdy kanał w dokładnie jednej grupie, etykieta z NAZW, nigdy z identyfikatora;
 *  - próbka × strona (ciągła / L / P) × wartość (liczba / brak) — wiersz wykresu 1:1;
 *  - pole × typ (liczba / całkowita / wybór / referencja / obiekt) × stan (puste
 *    wymagane / puste dopuszczalne / zły zapis / poprawne) — harmonogram i nastawy;
 *  - element × kolekcja × dyskryminator — typ zaznaczenia na schemacie.
 */

import { describe, expect, it } from 'vitest';

import opis from '../../../../harness-fixtures/generated/dynamika_scena_opis.json';
import przebiegiFixture from '../../../../harness-fixtures/generated/dynamika_scena_przebiegi.json';
import scenariuszeFixture from '../../../../harness-fixtures/generated/dynamika_scena_scenariusze.json';
import wynikFixture from '../../../../harness-fixtures/generated/dynamika_scena_wyniki.json';
import {
  chwileZdarzen,
  domyslneKanaly,
  grupujKanaly,
  kanalyElementu,
  noweZdarzenie,
  nowyElementListy,
  nowyWariant,
  podzialNaWykresy,
  pustyFormularz,
  polaScenariuszaDoFormularza,
  typZaznaczenia,
  wierszeWykresu,
  zakresPola,
  zbudujHarmonogram,
  zbudujNastawy,
  zdarzenieDoFormularza,
  type OpisElementu,
  type OpisScenariusza,
  type PrzebiegiDynamiki,
  type ScenariuszDynamiki,
  type WynikDynamiki,
} from '../model';

const OPIS = opis as unknown as OpisScenariusza;
const WYNIK = wynikFixture as unknown as WynikDynamiki;
const PRZEBIEGI = przebiegiFixture as unknown as PrzebiegiDynamiki;
const SCENARIUSZ = (scenariuszeFixture as unknown as { scenariusze: ScenariuszDynamiki[] })
  .scenariusze[0];
/** Odcinek zwarcia i koniec magistrali sceny (identyfikatory z fixtury, nie wpisane). */
const ODCINEK = WYNIK.zdarzenia_wykonane[0].ref as string;
const KONIEC = WYNIK.zdarzenia_wykonane[1].obszary_odciete[0];

const TEKSTY = {
  brakNazwy: '(bez nazwy)',
  zaciskOd: 'zacisk początkowy',
  zaciskDo: 'zacisk końcowy',
  miejsceZwarcia: 'miejsce zwarcia',
  rodzajMiejscaZwarcia: 'Miejsce zwarcia w gałęzi',
};
const WALIDACJA = { wymagane: 'W', liczba: 'L', calkowita: 'C', brakZdarzen: 'Z' };

describe('grupujKanaly — kanał × grupa', () => {
  const grupy = grupujKanaly(WYNIK.opis_wyniku, TEKSTY);

  it('każdy kanał wyniku jest w DOKŁADNIE jednej grupie', () => {
    const wszystkie = grupy.flatMap((g) => g.kanaly.map((k) => k.klucz));
    expect(new Set(wszystkie).size).toBe(wszystkie.length);
    expect(new Set(wszystkie)).toEqual(new Set(WYNIK.kanaly.map((k) => k.klucz)));
  });

  it('wszystkie cztery grupy występują w biegu ze zwarciem x·L', () => {
    expect(new Set(grupy.map((g) => g.grupa))).toEqual(
      new Set(['szyna', 'galaz', 'miejsce_zwarcia', 'urzadzenie']),
    );
  });

  it('etykiety i nazwy grup z NAZW elementów — żaden identyfikator elementu', () => {
    const refy = Object.keys(WYNIK.opis_wyniku.elementy);
    for (const g of grupy) {
      for (const ref of refy) {
        expect(g.nazwa).not.toContain(ref);
        for (const k of g.kanaly) expect(k.etykieta).not.toContain(ref);
      }
    }
  });

  it('kanał gałęzi nazywa zacisk od/do NAZWĄ szyny zacisku (gałąź z przekładnią ma różne końce)', () => {
    const kabel = grupy.find((g) => g.elementRef === ODCINEK && g.grupa === 'galaz');
    const od = kabel?.kanaly.find((k) => k.klucz === `i_od_pu@${ODCINEK}`);
    const doo = kabel?.kanaly.find((k) => k.klucz === `i_do_pu@${ODCINEK}`);
    const element = WYNIK.opis_wyniku.elementy[ODCINEK];
    expect(od?.etykieta).toContain(`zacisk początkowy: ${element.zacisk_od?.szyna_nazwa}`);
    expect(doo?.etykieta).toContain(`zacisk końcowy: ${element.zacisk_do?.szyna_nazwa}`);
  });

  it('miejsce zwarcia jest osobną grupą z położeniem x', () => {
    const miejsce = grupy.find((g) => g.grupa === 'miejsce_zwarcia');
    expect(miejsce?.rodzaj).toBe('Miejsce zwarcia w gałęzi');
    expect(miejsce?.kanaly.every((k) => k.etykieta.includes('x = 0.5'))).toBe(true);
  });

  it('domyślny wybór = moduł napięcia każdej szyny; kanały elementu po refie', () => {
    const domyslne = domyslneKanaly(WYNIK.opis_wyniku);
    expect(domyslne.length).toBeGreaterThan(0);
    expect(domyslne.every((k) => k.startsWith('u_pu@'))).toBe(true);
    expect(kanalyElementu(WYNIK.opis_wyniku, ODCINEK)).toContain(`i_od_pu@${ODCINEK}`);
  });
});

describe('wierszeWykresu — próbka × strona × wartość', () => {
  const klucze = [`u_pu@${KONIEC}`, `f_hz@${KONIEC}`];
  const wiersze = wierszeWykresu(PRZEBIEGI, klucze);

  it('jeden wiersz na próbkę, w kolejności osi czasu backendu', () => {
    expect(wiersze).toHaveLength(PRZEBIEGI.os_czasu_s.length);
    wiersze.forEach((w, i) => {
      expect(w.t_s).toBe(PRZEBIEGI.os_czasu_s[i]);
      expect(w.strona).toBe(PRZEBIEGI.strona_probki[i]);
      for (const k of klucze) expect(w[k]).toBe(PRZEBIEGI.probki[k][i]);
    });
  });

  it('chwila zdarzenia = dwa wiersze o tym samym czasie (L, potem P), bez interpolacji', () => {
    const iL = wiersze.findIndex((w) => w.strona === 'L');
    expect(iL).toBeGreaterThanOrEqual(0);
    expect(wiersze[iL + 1].strona).toBe('P');
    expect(wiersze[iL + 1].t_s).toBe(wiersze[iL].t_s);
  });

  it('brak wartości zostaje null (przerwa linii), nie zero', () => {
    const iNull = PRZEBIEGI.probki[`f_hz@${KONIEC}`].findIndex((v) => v === null);
    expect(iNull).toBeGreaterThanOrEqual(0);
    expect(wiersze[iNull][`f_hz@${KONIEC}`]).toBeNull();
  });

  it('podział na wykresy wg jednostki i chwile zdarzeń bez powtórzeń', () => {
    const podzial = podzialNaWykresy(WYNIK.opis_wyniku, klucze);
    expect(podzial.map((p) => p.jednostka).sort()).toEqual(
      [...new Set(klucze.map((k) => WYNIK.kanaly.find((c) => c.klucz === k)!.jednostka))].sort(),
    );
    const chwile = chwileZdarzen(WYNIK.zdarzenia_wykonane);
    expect(chwile).toEqual([...new Set(chwile)].sort((a, b) => a - b));
    expect(chwile).toEqual([0.05, 0.15]);
  });
});

describe('harmonogram z formularza — pole × typ × stan', () => {
  it('zapis sceny → formularz → harmonogram: ten sam ładunek (pola puste = null)', () => {
    const pola = polaScenariuszaDoFormularza(OPIS, SCENARIUSZ.dynamika);
    const zdarzenia = SCENARIUSZ.dynamika.zdarzenia.map((z) => zdarzenieDoFormularza(OPIS, z));
    const { harmonogram, bledy } = zbudujHarmonogram(OPIS, pola, zdarzenia, WALIDACJA);
    expect(bledy).toEqual([]);
    // Scena ma detektor (lista × unia × wartość logiczna) — przechodzi w obie strony bez straty.
    expect((SCENARIUSZ.dynamika.detektory as unknown[]).length).toBe(1);
    // Pole trybu stanowiska badawczego nie należy do edytora trybu sieci: zapis sceny niesie
    // je jako `null`, harmonogram edytora go nie ma (ta sama treść scenariusza w backendzie).
    const { stanowisko, ...bezStanowiska } = SCENARIUSZ.dynamika as Record<string, unknown>;
    expect(stanowisko).toBeNull();
    expect(OPIS.pola_scenariusza.some((p) => p.nazwa === 'stanowisko')).toBe(false);
    expect(harmonogram).toEqual(bezStanowiska);
  });

  it('nowe zdarzenie nie ma żadnej wartości domyślnej', () => {
    for (const rodzaj of OPIS.rodzaje_zdarzen) {
      const z = noweZdarzenie(rodzaj);
      const wartosci = JSON.stringify(z.wartosci);
      expect(wartosci).not.toMatch(/\d/);
    }
  });

  it('puste pole wymagane, zły zapis liczby i pusty harmonogram → błędy ze ścieżką', () => {
    const zwarcie = OPIS.rodzaje_zdarzen.find((r) => r.rodzaj === 'zwarcie')!;
    const z = noweZdarzenie(zwarcie);
    const wadliwe = { ...z, wartosci: { ...z.wartosci, t_s: 'abc' } };
    const { harmonogram, bledy } = zbudujHarmonogram(
      OPIS,
      pustyFormularz(OPIS.pola_scenariusza),
      [wadliwe],
      WALIDACJA,
    );
    expect(harmonogram).toBeNull();
    const sciezki = new Map(bledy.map((b) => [b.sciezka, b.komunikat]));
    expect(sciezki.get('horyzont_s')).toBe('W');
    expect(sciezki.get('zdarzenia.0.t_s')).toBe('L');
    expect(sciezki.get('zdarzenia.0.typ')).toBe('W');
    // Pole dopuszczające brak (położenie x) nie jest błędem, gdy puste.
    expect(sciezki.has('zdarzenia.0.polozenie_wzgledne')).toBe(false);
    expect(zbudujHarmonogram(OPIS, {}, [], WALIDACJA).bledy.map((b) => b.sciezka)).toContain(
      'zdarzenia',
    );
  });

  it('pole złożone (obiekt) i przecinek dziesiętny', () => {
    const komenda = OPIS.rodzaje_zdarzen.find((r) => r.rodzaj === 'komenda_regulacji')!;
    const z = noweZdarzenie(komenda);
    const wartosci = { ...z.wartosci, t_s: '0,1', ref_id: 'gen-pv', nastawa: { p_mw: '1,5', q_mvar: '' } };
    const { harmonogram, bledy } = zbudujHarmonogram(
      OPIS,
      { horyzont_s: '1', krok_wyjscia_s: '0,01' },
      [{ rodzaj: 'komenda_regulacji', wartosci }],
      WALIDACJA,
    );
    expect(bledy).toEqual([]);
    expect(harmonogram?.zdarzenia[0]).toEqual({
      rodzaj: 'komenda_regulacji',
      t_s: 0.1,
      ref_id: 'gen-pv',
      nastawa: { p_mw: 1.5, q_mvar: null, u_pu: null },
    });
  });

  it('lista detektorów × wariant unii × wartość logiczna: puste → błędy ze ścieżką, pełne → ładunek', () => {
    const detektory = OPIS.pola_scenariusza.find((p) => p.nazwa === 'detektory')!;
    expect(detektory.typ).toBe('lista');
    const wielkosc = detektory.pola!.find((p) => p.nazwa === 'wielkosc')!;
    expect(wielkosc.typ).toBe('unia');
    const naglowek = { horyzont_s: '0,3', krok_wyjscia_s: '0,02' };
    const zdarzenia = SCENARIUSZ.dynamika.zdarzenia.map((z) => zdarzenieDoFormularza(OPIS, z));
    // Nowy element listy i nowy wariant: wszystkie pola puste (zero wartości domyślnych).
    const pusty = nowyElementListy(detektory);
    expect(JSON.stringify(pusty)).not.toMatch(/\d|tak|nie|w_dol/);
    const bezWariantu = zbudujHarmonogram(OPIS, { ...naglowek, detektory: [pusty] }, zdarzenia, WALIDACJA);
    const sciezki = new Map(bezWariantu.bledy.map((b) => [b.sciezka, b.komunikat]));
    expect(bezWariantu.harmonogram).toBeNull();
    expect(sciezki.get('detektory.0.ident')).toBe('W');
    expect(sciezki.get('detektory.0.wielkosc')).toBe('W');
    expect(sciezki.get('detektory.0.prog')).toBe('W');
    expect(sciezki.get('detektory.0.kierunek')).toBe('W');
    expect(sciezki.get('detektory.0.jednorazowy')).toBe('W');

    const wariant = nowyWariant(wielkosc, 'modul_pradu_zacisku');
    expect(wariant).toEqual({ rodzaj: 'modul_pradu_zacisku', element_ref: '', zacisk: '' });
    const bezPolWariantu = zbudujHarmonogram(
      OPIS,
      { ...naglowek, detektory: [{ ...pusty, wielkosc: wariant }] },
      zdarzenia,
      WALIDACJA,
    );
    const sciezkiWariantu = bezPolWariantu.bledy.map((b) => b.sciezka);
    expect(sciezkiWariantu).toContain('detektory.0.wielkosc.element_ref');
    expect(sciezkiWariantu).toContain('detektory.0.wielkosc.zacisk');

    const pelny = {
      ident: 'Prąd odcinka',
      wielkosc: { ...wariant, element_ref: ODCINEK, zacisk: 'do' },
      prog: '1,2',
      kierunek: 'w_gore',
      jednorazowy: 'nie',
    };
    const { harmonogram, bledy } = zbudujHarmonogram(
      OPIS,
      { ...naglowek, detektory: [pelny] },
      zdarzenia,
      WALIDACJA,
    );
    expect(bledy).toEqual([]);
    expect(harmonogram?.detektory).toEqual([
      {
        ident: 'Prąd odcinka',
        wielkosc: { rodzaj: 'modul_pradu_zacisku', element_ref: ODCINEK, zacisk: 'do' },
        prog: 1.2,
        kierunek: 'w_gore',
        jednorazowy: false,
      },
    ]);
    // Zmiana wariantu czyści pola poprzedniego (nie przenosi wartości między wariantami).
    expect(nowyWariant(wielkosc, 'modul_napiecia')).toEqual({ rodzaj: 'modul_napiecia', bus_ref: '' });
  });

  it('nastawy solvera: komplet pól wymagany (pusta dopuszczająca brak = null), całkowita odrzuca ułamek', () => {
    const puste = zbudujNastawy(OPIS, pustyFormularz(OPIS.nastawy_solvera), WALIDACJA);
    expect(puste.nastawy).toBeNull();
    const dopuszczajaceBrak = OPIS.nastawy_solvera.filter((p) => p.dopuszcza_brak);
    expect(dopuszczajaceBrak.map((p) => p.nazwa)).toEqual(['tolerancja_lokalizacji_zdarzen_s']);
    expect(puste.bledy.map((b) => b.sciezka).sort()).toEqual(
      OPIS.nastawy_solvera
        .filter((p) => !p.dopuszcza_brak)
        .map((p) => `nastawy.${p.nazwa}`)
        .sort(),
    );
    // Komplet bez tolerancji lokalizacji: klucz obecny z wartością null (adapter go przyjmuje).
    const komplet: Record<string, string> = {};
    for (const p of OPIS.nastawy_solvera) {
      komplet[p.nazwa] = p.typ === 'wybor' ? (p.wartosci ?? [])[0].wartosc : p.dopuszcza_brak ? '' : '1';
    }
    const bezTolerancji = zbudujNastawy(OPIS, komplet, WALIDACJA);
    expect(bezTolerancji.bledy).toEqual([]);
    expect(bezTolerancji.nastawy?.tolerancja_lokalizacji_zdarzen_s).toBeNull();
    expect(Object.keys(bezTolerancji.nastawy ?? {}).sort()).toEqual(
      OPIS.nastawy_solvera.map((p) => p.nazwa).sort(),
    );
    const ulamek = zbudujNastawy(OPIS, { max_iteracji_newtona: '2,5' }, WALIDACJA);
    expect(ulamek.bledy.find((b) => b.sciezka === 'nastawy.max_iteracji_newtona')?.komunikat).toBe('C');
  });

  it('zakres pola z kontraktu: granice wyłączne i włączne', () => {
    const horyzont = OPIS.pola_scenariusza.find((p) => p.nazwa === 'horyzont_s')!;
    expect(zakresPola(horyzont)).toBe('(0; 600]');
    const polozenie = OPIS.rodzaje_zdarzen
      .find((r) => r.rodzaj === 'zwarcie')!
      .pola.find((p) => p.nazwa === 'polozenie_wzgledne')!;
    expect(zakresPola(polozenie)).toBe('(0; 1)');
  });
});

describe('typZaznaczenia — kolekcja × dyskryminator', () => {
  const el = (kolekcja: string | null, typ: string | null): OpisElementu => ({
    ref_id: 'x',
    nazwa: 'x',
    rodzaj_pl: 'x',
    kolekcja,
    typ,
  });
  it.each([
    ['buses', null, 'Bus'],
    ['branches', 'line_overhead', 'LineBranch'],
    ['branches', 'cable', 'LineBranch'],
    ['branches', 'switch', 'Switch'],
    ['branches', 'breaker', 'Switch'],
    ['branches', 'disconnector', 'Switch'],
    ['branches', 'fuse', 'Switch'],
    ['transformers', null, 'TransformerBranch'],
    ['generators', null, 'Generator'],
    ['sources', null, 'Source'],
    ['loads', null, 'Load'],
    [null, null, null],
  ] as const)('%s / %s → %s', (kolekcja, typ, oczekiwany) => {
    expect(typZaznaczenia(el(kolekcja, typ))).toBe(oczekiwany);
  });

  it('każdy element wyniku sceny ma typ zaznaczenia (schemat → element istnieje)', () => {
    for (const element of Object.values(WYNIK.opis_wyniku.elementy)) {
      expect(typZaznaczenia(element)).not.toBeNull();
    }
  });
});
