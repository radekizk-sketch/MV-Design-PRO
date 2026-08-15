/*
 * Model okna „Kontyngencje N-1" — czyste projekcje do wspólnego wzorca ekranu
 * analizy (`ui2/wyniki/wzorzec`): kolumny deklaratywne, wiersze `WartoscKomorki`,
 * założenia. ZERO fizyki i ZERO ocen lokalnych: liczniki dotkliwości, progi,
 * werdykty i uzasadnienia przepisywane WPROST z odpowiedzi backendu.
 *
 * Wybór przebiegu rozpływu — reużycie `przebiegRozplywu` z modelu okna „Jakość
 * wyników" (jedno źródło prawdy doboru przebiegu LOAD_FLOW/DONE, tak samo jak
 * w oknie „Wrażliwość").
 */

import type { DefinicjaKolumny, WierszTabeli, WierszZalozenia } from '../wzorzec';
import type { KryteriaOceny, PozycjaRankingu, ZakresResponse } from './api';
import {
  KONTYNGENCJE_STRINGS as T,
  etykietaRodzaju,
  fmtLiczba,
  fmtLicznik,
  nazwaElementu,
} from './strings';

export { przebiegRozplywu } from '../jakosc/jakoscModel';

/** Klucz wiersza rankingu = `element_ref` (stabilny przy sortowaniu i wyborze). */
export const KLUCZ_WIERSZA_RANKINGU = 'elementRef';

export const KOLUMNY_RANKINGU: DefinicjaKolumny[] = [
  { klucz: 'pozycja', etykieta: T.kolPozycja, mono: true },
  { klucz: 'element', etykieta: T.kolElement, mono: false, wyrownanie: 'lewo' },
  { klucz: 'rodzaj', etykieta: T.kolRodzaj, mono: false, wyrownanie: 'lewo' },
  { klucz: 'odbiory', etykieta: T.kolOdbiory, mono: true },
  { klucz: 'mocOdciazona', etykieta: T.kolMocOdciazona, jednostka: T.jednMw, mono: true },
  { klucz: 'przeciazenia', etykieta: T.kolPrzeciazenia, mono: true },
  { klucz: 'napiecia', etykieta: T.kolNapiecia, mono: true },
  { klucz: 'pominiete', etykieta: T.kolPominiete, mono: true },
  { klucz: 'elementRef', etykieta: T.kolIdentyfikator, mono: true, tylkoEkspercki: true },
];

/**
 * Ranking → wiersze wzorca.
 *
 * `ostrzezenie` zapala się TAM, GDZIE BACKEND POLICZYŁ NIEZEROWY LICZNIK — to
 * odczyt jego werdyktu, nie własny próg okna (żadnej wartości nie porównujemy
 * tu z granicą; granice zna wyłącznie backend). Licznik `null` (nie policzono)
 * nie jest ostrzeżeniem ani zerem — pokazuje się jako „—".
 */
export function naWierszeRankingu(ranking: readonly PozycjaRankingu[]): WierszTabeli[] {
  return ranking.map((pozycja) => ({
    [KLUCZ_WIERSZA_RANKINGU]: { wartosc: pozycja.element_ref },
    pozycja: { wartosc: pozycja.pozycja, sortKey: pozycja.pozycja },
    element: { wartosc: nazwaElementu(pozycja.element_name, pozycja.element_ref) },
    rodzaj: { wartosc: etykietaRodzaju(pozycja.element_kind) },
    odbiory: {
      wartosc: fmtLicznik(pozycja.dotkliwosc.odbiory_bez_zasilania),
      sortKey: pozycja.dotkliwosc.odbiory_bez_zasilania ?? undefined,
      ostrzezenie: (pozycja.dotkliwosc.odbiory_bez_zasilania ?? 0) > 0,
    },
    mocOdciazona: {
      wartosc: fmtLiczba(pozycja.dotkliwosc.moc_odciazona_mw, 3),
      sortKey: pozycja.dotkliwosc.moc_odciazona_mw ?? undefined,
    },
    przeciazenia: {
      wartosc: fmtLicznik(pozycja.dotkliwosc.przeciazenia),
      sortKey: pozycja.dotkliwosc.przeciazenia ?? undefined,
      ostrzezenie: (pozycja.dotkliwosc.przeciazenia ?? 0) > 0,
    },
    napiecia: {
      wartosc: fmtLicznik(pozycja.dotkliwosc.naruszenia_napiecia),
      sortKey: pozycja.dotkliwosc.naruszenia_napiecia ?? undefined,
      ostrzezenie: (pozycja.dotkliwosc.naruszenia_napiecia ?? 0) > 0,
    },
    pominiete: {
      wartosc: fmtLicznik(pozycja.dotkliwosc.kryteria_pominiete),
      sortKey: pozycja.dotkliwosc.kryteria_pominiete ?? undefined,
    },
    // Kolumna identyfikatora (tryb ekspercki) NIE ma osobnego wpisu: jej klucz
    // to `KLUCZ_WIERSZA_RANKINGU`, więc wartość ustawiona wyżej obsługuje OBIE
    // role — klucz wiersza i widoczną kolumnę. Drugi wpis o tej samej nazwie był
    // duplikatem pola (błąd typów TS1117), a nie dodatkową daną.
  }));
}

/**
 * Założenia macierzy — progi i pochodzenie kryteriów WPROST z backendu
 * („założenia są częścią wyniku": czytelnik ma widzieć, wg czego oceniono).
 */
export function naZalozeniaMacierzy(
  kryteria: KryteriaOceny,
  liczbaKontyngencji: number,
): WierszZalozenia[] {
  return [
    {
      etykieta: T.kryteriaObciazenie,
      wartosc: kryteria.obciazenie.granica_fail_pct,
      jednostka: T.jednProcent,
      uwaga: `${kryteria.obciazenie.zrodlo_progu_pl} ${kryteria.obciazenie.zrodlo_obciazalnosci_pl}`,
    },
    {
      etykieta: T.kryteriaNapiecie,
      wartosc: `±${kryteria.napiecie.granica_fail_pct}`,
      jednostka: T.jednProcent,
      uwaga: `${kryteria.napiecie.zrodlo_progu_pl} ${kryteria.napiecie.zrodlo_napiecia_pl}`,
    },
    {
      etykieta: T.kryteriaZasilanie,
      wartosc: T.kreska,
      uwaga: kryteria.zasilanie.zrodlo_pl,
    },
    {
      etykieta: T.kryteriaRanking,
      wartosc: T.kreska,
      uwaga: kryteria.ranking.definicja_pl,
    },
    {
      etykieta: T.kryteriaPozaZakresem,
      wartosc: T.kreska,
      uwaga: kryteria.poza_zakresem_pl,
    },
    {
      etykieta: T.rankingTytul,
      wartosc: liczbaKontyngencji,
      uwaga: T.opisWstep,
    },
  ];
}

/**
 * Refy do wysłania przy starcie biegu.
 *
 * `null` = bieg PEŁNY (parametr pomijany). W trybie zawężonym zwracamy zaznaczone
 * refy w kolejności zakresu — deterministycznie, bez własnego doboru: zbiór
 * pochodzi z zapowiedzi backendu, okno tylko przepuszcza wybór inżyniera.
 * SKRACANIE listy heurystyką jest zakazane, więc żadnego filtra „ciekawych"
 * elementów tu nie ma i być nie może.
 */
export function refyDoBiegu(
  tryb: 'pelny' | 'wybrane',
  zakres: ZakresResponse | null,
  zaznaczone: ReadonlySet<string>,
): readonly string[] | null {
  if (tryb === 'pelny') return null;
  const kolejnosc = zakres?.elementy.map((element) => element.element_ref) ?? [];
  return kolejnosc.filter((ref) => zaznaczone.has(ref));
}
