/*
 * Model i adaptery okna „Dobór kompensacji" (karta P42, D8). Czyste, read-only
 * odwzorowanie odpowiedzi końcówki compensation-sizing (`../api`) na struktury
 * prezentacji (kolumny/wiersze wzorca tabeli + ślad pełnej jawności obliczeń). Zero fizyki, zero
 * ocen lokalnych — wszystkie wielkości i werdykty pochodzą WYŁĄCZNIE z backendu.
 * Zero mutacji, zero wołań API stąd.
 *
 * WIĄŻĄCY WYMÓG WŁAŚCICIELA (V12K-040, opcja B): tabela kandydatów rozdziela DWIE
 * wielkości cosφ pod jednoznacznie różnymi etykietami:
 *  - kolumny DECYZYJNE = „cosφ punktu kompensowanego" (dzień/noc) — na nich opiera się
 *    werdykt `spelnia`; tag ostrzegawczy (tokeny --mvd-*) pojawia się WYŁĄCZNIE przy
 *    tej wielkości, gdy kandydat NIE spełnia progu,
 *  - kolumny INFORMACYJNE = „cosφ przekroju sieciowego" (dzień/noc) — bez werdyktu,
 *    wyraźnie odsunięte za kolumnę werdyktu; NIE sterują doborem.
 *
 * Ślad obliczeń dopasowany ADAPTEREM (nie kopią) do kontraktu `SladAnalizy` z
 * pulpitu (`KrokSladuSily`: symbol → formula_latex → substitution_pl → result_pl).
 */

import type { DefinicjaKolumny, WierszTabeli } from '../../wyniki/wzorzec/wzorzecModel';
import type { KandydatKompensacji, KrokSladuSily, WhiteboxKompensacji } from '../api';
import { KOMPENSACJA_STRINGS as T, fmtCosfiKomp, fmtMvarKomp } from './strings';

// ---------------------------------------------------------------------------
// Kolumny tabeli kandydatów — wzorzec `TabelaWynikow` (ui2/wyniki/wzorzec)
// ---------------------------------------------------------------------------

/** Werdykt spełnienia progu (PL). */
export function werdyktKompPL(spelnia: boolean): string {
  return spelnia ? T.werdyktSpelnia : T.werdyktNieSpelnia;
}

/**
 * Deklaratywne kolumny tabeli kandydatów. Kolejność świadomie grupuje blok DECYZYJNY
 * (cosφ punktu + werdykt) przed blokiem INFORMACYJNYM (cosφ przekroju), aby obie
 * wielkości cosφ były rozdzielone także wizualnie (wymóg właściciela). Kolumny nocne
 * dokładane tylko gdy scenariusz nocny jest uwzględniony.
 */
export function kolumnyTabeliKompensacji(uwzglednijNoc: boolean): DefinicjaKolumny[] {
  const kolumny: DefinicjaKolumny[] = [
    { klucz: 'rekord', etykieta: T.kolRekord, sortowalna: false },
    { klucz: 'moc', etykieta: T.kolMoc, jednostka: T.jednMvar, mono: true },
    { klucz: 'q_cap_dzien', etykieta: T.kolQcapDzien, jednostka: T.jednMvar, mono: true },
    { klucz: 'q_netto_dzien', etykieta: T.kolQnettoDzien, jednostka: T.jednMvar, mono: true },
    // Blok DECYZYJNY — cosφ punktu kompensowanego (podstawa doboru):
    { klucz: 'cosfi_punktu_dzien', etykieta: T.kolCosfiPunktuDzien, mono: true },
  ];
  if (uwzglednijNoc) {
    kolumny.push({ klucz: 'cosfi_punktu_noc', etykieta: T.kolCosfiPunktuNoc, mono: true });
  }
  kolumny.push({ klucz: 'werdykt', etykieta: T.kolWerdykt, sortowalna: false });
  // Blok INFORMACYJNY — cosφ przekroju sieciowego (nie steruje doborem):
  kolumny.push({
    klucz: 'cosfi_przekroju_dzien',
    etykieta: T.kolCosfiPrzekrojuDzien,
    mono: true,
  });
  if (uwzglednijNoc) {
    kolumny.push({
      klucz: 'cosfi_przekroju_noc',
      etykieta: T.kolCosfiPrzekrojuNoc,
      mono: true,
    });
  }
  return kolumny;
}

/**
 * Adapter jednego kandydata → wiersz wzorca tabeli. `ostrzezenie` (tag tokenowy)
 * ustawiane WYŁĄCZNIE na kolumnach cosφ punktu kompensowanego (dzień/noc), gdy dany
 * scenariusz NIE spełnia progu — werdykt jest przypisany do wielkości decyzyjnej,
 * nigdy do cosφ przekroju.
 */
function wierszKandydata(kandydat: KandydatKompensacji, uwzglednijNoc: boolean): WierszTabeli {
  const wiersz: WierszTabeli = {
    rekord: { wartosc: kandydat.name },
    moc: { wartosc: fmtMvarKomp(kandydat.rated_mvar), sortKey: kandydat.rated_mvar ?? undefined },
    q_cap_dzien: {
      wartosc: fmtMvarKomp(kandydat.q_cap_eff_dzien_mvar),
      sortKey: kandydat.q_cap_eff_dzien_mvar ?? undefined,
    },
    q_netto_dzien: {
      wartosc: fmtMvarKomp(kandydat.q_netto_punktu_dzien_mvar),
      sortKey: kandydat.q_netto_punktu_dzien_mvar ?? undefined,
    },
    // DECYZJA (dzień): tag ostrzegawczy, gdy cosφ punktu nie spełnia progu.
    cosfi_punktu_dzien: {
      wartosc: fmtCosfiKomp(kandydat.cosfi_punktu_dzien),
      sortKey: kandydat.cosfi_punktu_dzien ?? undefined,
      ostrzezenie: !kandydat.spelnia_dzien,
    },
    werdykt: { wartosc: werdyktKompPL(kandydat.spelnia) },
    // INFORMACJA (dzień): cosφ przekroju — bez werdyktu, bez tagu.
    cosfi_przekroju_dzien: {
      wartosc: fmtCosfiKomp(kandydat.cosfi_przekroju_dzien),
      sortKey: kandydat.cosfi_przekroju_dzien ?? undefined,
    },
  };
  if (uwzglednijNoc) {
    wiersz.cosfi_punktu_noc = {
      wartosc: fmtCosfiKomp(kandydat.cosfi_punktu_noc),
      sortKey: kandydat.cosfi_punktu_noc ?? undefined,
      ostrzezenie: kandydat.spelnia_noc === false,
    };
    wiersz.cosfi_przekroju_noc = {
      wartosc: fmtCosfiKomp(kandydat.cosfi_przekroju_noc),
      sortKey: kandydat.cosfi_przekroju_noc ?? undefined,
    };
  }
  return wiersz;
}

/** Adapter: kandydaci widoku → wiersze tabeli (kolejność źródłowa = rosnąco po mocy). */
export function wierszeTabeliKompensacji(
  candidates: readonly KandydatKompensacji[],
  uwzglednijNoc: boolean,
): WierszTabeli[] {
  return candidates.map((kandydat) => wierszKandydata(kandydat, uwzglednijNoc));
}

// ---------------------------------------------------------------------------
// Ślad pełnej jawności obliczeń — adapter do kontraktu `SladAnalizy` (KrokSladuSily)
// ---------------------------------------------------------------------------

/**
 * Adapter śladu doboru → kroki `SladAnalizy` (KrokSladuSily). Pięć kroków: źródło
 * P/Q, cosφ punktu (podstawa doboru), cosφ przekroju (informacyjne), konwencja
 * kanoniczna znaku, decyzja doboru. Treści (opisy) pochodzą WPROST z backendu;
 * formuły to czysty LaTeX renderowany KaTeX-em (dyrektywa właściciela 2026-07-29);
 * kroki konwencji i decyzji są opisowe (bez wzoru — `formula_latex` puste, treść
 * z backendu może nieść wzory inline `$...$` renderowane przez `TekstZWzorami`).
 */
export function krokiSladuKompensacji(whitebox: WhiteboxKompensacji): KrokSladuSily[] {
  const noc = whitebox.night_scenario ?? T.sladNocPominiety;
  return [
    {
      symbol: T.sladSymbolPQ,
      formula_latex: T.sladWzorPQ,
      substitution_pl: `${T.sladPodstawienieKandydaci} = ${whitebox.candidate_count}`,
      result_pl: whitebox.pq_source,
    },
    {
      symbol: T.sladSymbolCosfiPunktu,
      formula_latex: T.sladWzorCosfiPunktu,
      substitution_pl: `${T.sladPodstawienieNoc} = ${noc}`,
      result_pl: whitebox.cosfi_punktu,
    },
    {
      symbol: T.sladSymbolCosfiPrzekroju,
      formula_latex: T.sladWzorCosfiPrzekroju,
      substitution_pl: '',
      result_pl: whitebox.cosfi_przekroju,
    },
    {
      symbol: T.sladSymbolKonwencja,
      formula_latex: '',
      substitution_pl: '',
      result_pl: whitebox.konwencja_kanoniczna,
    },
    {
      symbol: T.sladSymbolDecyzja,
      formula_latex: '',
      substitution_pl: '',
      result_pl: whitebox.decyzja,
    },
  ];
}
