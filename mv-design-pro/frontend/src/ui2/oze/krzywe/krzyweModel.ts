/*
 * Model i adaptery okna „Krzywe zdolności P–Q" (karta P41). Czyste, read-only
 * odwzorowanie odpowiedzi końcówki pq-coverage (`../api`) na struktury prezentacji
 * (opcje doboru / wykres / tabela wzorcowa / ślad WHITE BOX). Zero fizyki, zero
 * ocen lokalnych — pokrycie, marginesy i werdykt pochodzą WYŁĄCZNIE z backendu.
 * Zero mutacji, zero wołań API stąd.
 *
 * Ślad WHITE BOX dopasowany ADAPTEREM (nie kopią) do kontraktu `SladAnalizy`
 * z pulpitu (`KrokSladuSily`: symbol → formula_latex → substitution_pl → result_pl).
 */

import type {
  KrokSladuSily,
  ProfilOperatoraNcRfg,
  PunktPokryciaPQ,
  RekordKonwertera,
  WidokPokryciaPQ,
} from '../api';
import type { DefinicjaKolumny, WierszTabeli } from '../../wyniki/wzorzec/wzorzecModel';
import { KRZYWE_STRINGS, fmtMWPQ, fmtMvarPQ } from './strings';

// ---------------------------------------------------------------------------
// Dobór typu falownika — krzywa producenta obecna?
// ---------------------------------------------------------------------------

/** Czy typ katalogowy ma krzywą producenta (warunek biegu P–Q). */
export function typMaKrzywaPQ(rekord: RekordKonwertera): boolean {
  return Array.isArray(rekord.pq_curve) && rekord.pq_curve.length > 0;
}

/** Opcja doboru typu falownika (nazwa PL + adnotacja braku krzywej). */
export interface OpcjaTypuPQ {
  readonly id: string;
  readonly etykieta: string;
  readonly maKrzywa: boolean;
}

/** Adapter: rekordy katalogu → opcje doboru (kolejność źródłowa, bez sortowania). */
export function opcjeTypowPQ(rekordy: readonly RekordKonwertera[]): OpcjaTypuPQ[] {
  return rekordy.map((rekord) => {
    const maKrzywa = typMaKrzywaPQ(rekord);
    return {
      id: rekord.id,
      etykieta: maKrzywa
        ? rekord.name
        : `${rekord.name} (${KRZYWE_STRINGS.brakKrzywej})`,
      maKrzywa,
    };
  });
}

/** Opcja doboru operatora OSD (nazwa PL na pierwszym planie). */
export interface OpcjaOperatoraPQ {
  readonly id: string;
  readonly etykieta: string;
}

/** Adapter: operatorzy katalogu NC RfG → opcje doboru (kolejność źródłowa). */
export function opcjeOperatorowPQ(
  operatorzy: readonly ProfilOperatoraNcRfg[],
): OpcjaOperatoraPQ[] {
  return operatorzy.map((op) => ({ id: op.operator_id, etykieta: op.operator_name_pl }));
}

// ---------------------------------------------------------------------------
// Wykres P–Q — pasmo producenta (q_min/q_max vs P)
// ---------------------------------------------------------------------------

/** Punkt wykresu P–Q: pasmo producenta w danej mocy czynnej. */
export interface PunktWykresuPQ {
  readonly p: number;
  readonly qMin: number;
  readonly qMax: number;
}

/** Adapter: punkty pokrycia → punkty wykresu (kolejność źródłowa = rosnące P). */
export function punktyWykresuPQ(widok: WidokPokryciaPQ): PunktWykresuPQ[] {
  return widok.punkty.map((pt) => ({ p: pt.p_mw, qMin: pt.q_min_mvar, qMax: pt.q_max_mvar }));
}

// ---------------------------------------------------------------------------
// Tabela punktów — wzorzec `TabelaWynikow` (ui2/wyniki/wzorzec)
// ---------------------------------------------------------------------------

/** Deklaratywne kolumny tabeli punktów P–Q (etykiety PL, jednostki zawsze). */
export function kolumnyTabeliPQ(): DefinicjaKolumny[] {
  return [
    { klucz: 'moc', etykieta: KRZYWE_STRINGS.kolMoc, jednostka: KRZYWE_STRINGS.jednMW, mono: true },
    {
      klucz: 'pasmo',
      etykieta: KRZYWE_STRINGS.kolPasmoProducenta,
      jednostka: KRZYWE_STRINGS.jednMvar,
      mono: true,
      sortowalna: false,
    },
    {
      klucz: 'wymaganie',
      etykieta: KRZYWE_STRINGS.kolWymaganie,
      jednostka: KRZYWE_STRINGS.jednMvar,
      mono: true,
      sortowalna: false,
    },
    {
      klucz: 'margines',
      etykieta: KRZYWE_STRINGS.kolMargines,
      jednostka: KRZYWE_STRINGS.jednMvar,
      mono: true,
    },
    { klucz: 'status', etykieta: KRZYWE_STRINGS.kolStatus },
  ];
}

/** Sformatowane pasmo „min … max" [Mvar] (deterministyczne, przecinek PL). */
function pasmoMvar(min: number, max: number): string {
  return `${fmtMvarPQ(min)}${KRZYWE_STRINGS.rozdzielaczPasma}${fmtMvarPQ(max)}`;
}

/** Adapter jednego punktu pokrycia → wiersz wzorca tabeli (semantyka `ValueRow`). */
function wierszPunktuPQ(pt: PunktPokryciaPQ): WierszTabeli {
  return {
    moc: { wartosc: fmtMWPQ(pt.p_mw), sortKey: pt.p_mw },
    pasmo: { wartosc: pasmoMvar(pt.q_min_mvar, pt.q_max_mvar) },
    wymaganie: { wartosc: pasmoMvar(pt.q_wymagane_min_mvar, pt.q_wymagane_max_mvar) },
    margines: { wartosc: fmtMvarPQ(pt.margines_mvar), sortKey: pt.margines_mvar },
    // `ostrzezenie` (tag) czyta WYŁĄCZNIE flagę `pokryty` z backendu — bez oceny lokalnej.
    status: {
      wartosc: pt.pokryty ? KRZYWE_STRINGS.statusPokryty : KRZYWE_STRINGS.statusNiepokryty,
      ostrzezenie: !pt.pokryty,
    },
  };
}

/** Adapter: widok pokrycia → wiersze tabeli punktów (kolejność źródłowa). */
export function wierszeTabeliPQ(widok: WidokPokryciaPQ): WierszTabeli[] {
  return widok.punkty.map(wierszPunktuPQ);
}

// ---------------------------------------------------------------------------
// Ślad WHITE BOX — adapter do kontraktu `SladAnalizy` (KrokSladuSily)
// ---------------------------------------------------------------------------

/**
 * Adapter śladu pokrycia (wzór/dane/podstawienie/wynik) → kroki `SladAnalizy`.
 * Dwa kroki: (1) wyznaczenie wymagania z udziału i Pn, (2) porównanie pasm
 * punkt po punkcie. Wzory traktowane jako zapis symboliczny (ASCII), spójnie
 * ze śladem pulpitu OZE. Zero ocen — treści wprost z backendu.
 */
export function krokiSladuPQ(widok: WidokPokryciaPQ): KrokSladuSily[] {
  const { slad_whitebox: slad, wymaganie } = widok;
  const dane = slad.dane;
  return [
    {
      symbol: KRZYWE_STRINGS.sladSymbolWymaganie,
      formula_latex: 'q_wym_min = udzial_min * Pn;  q_wym_max = udzial_max * Pn',
      substitution_pl:
        `Pn = ${fmtMWPQ(dane.pn_mw)} MW; `
        + `udzial_min = ${dane.udzial_q_min_pct_pn}; udzial_max = ${dane.udzial_q_max_pct_pn}`,
      result_pl:
        `q_wym ∈ [${fmtMvarPQ(wymaganie.q_wymagane_min_mvar)}${KRZYWE_STRINGS.rozdzielaczPasma}`
        + `${fmtMvarPQ(wymaganie.q_wymagane_max_mvar)}] Mvar`,
    },
    {
      symbol: KRZYWE_STRINGS.sladSymbolPokrycie,
      formula_latex: slad.wzor,
      substitution_pl: slad.podstawienie.join('  |  '),
      result_pl: slad.wynik,
    },
  ];
}

// ---------------------------------------------------------------------------
// Werdykt — istotność (dobór koloru banera); tekst wprost z backendu
// ---------------------------------------------------------------------------

/** Istotność werdyktu do doboru koloru banera (wyłącznie prezentacja). */
export function istotnoscWerdyktuPQ(widok: WidokPokryciaPQ): 'ok' | 'err' {
  return widok.werdykt.pokryty ? 'ok' : 'err';
}
