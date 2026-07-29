/*
 * Model i adaptery sekcji „Sekwencja zapadów" okna „Walidacja modelu falownika"
 * (P43 / strumień OZE). Czyste, read-only odwzorowanie odpowiedzi końcówki
 * frt-sequence (`../api`) na struktury prezentacji (kolumny/wiersze tabeli zapadów,
 * werdykt sekwencji jako odznaka, wiersze kontekstu siły sieci).
 *
 * GRANICE (NOT-A-SOLVER / zero fizyki): warstwa wyłącznie prezentuje. Werdykty
 * zapadów i sekwencji, marginesy i kontekst siły sieci pochodzą WYŁĄCZNIE z backendu.
 * Serializacja sekwencji (kropka dziesiętna) należy do klienta (`serializujSekwencjeFrt`);
 * tu formatujemy WYŁĄCZNIE do prezentacji (przecinek PL). Zero mutacji, zero wołań API.
 */

import type { WidokSekwencjiFrt, ZapadSekwencjiFrt } from '../api';
import type { DefinicjaKolumny, WierszTabeli } from '../../wyniki/wzorzec/wzorzecModel';
import {
  FRT_STRINGS,
  fmtPuFrt,
  fmtPuOpcjaFrt,
  fmtSFrt,
  fmtSOpcjaFrt,
} from './strings';

// ---------------------------------------------------------------------------
// Tabela zapadów sekwencji — wzorzec `TabelaWynikow`
// ---------------------------------------------------------------------------

/** Deklaratywne kolumny tabeli zapadów (etykiety PL, jednostki zawsze). */
export function kolumnyTabeliSekwencji(): DefinicjaKolumny[] {
  return [
    { klucz: 'zapad', etykieta: FRT_STRINGS.sekwKolZapad, sortowalna: false },
    {
      klucz: 'glebokosc',
      etykieta: FRT_STRINGS.sekwKolGlebokosc,
      jednostka: FRT_STRINGS.jednPu,
      mono: true,
    },
    { klucz: 'czas', etykieta: FRT_STRINGS.sekwKolCzas, jednostka: FRT_STRINGS.jednS, mono: true },
    { klucz: 'utrzymanie', etykieta: FRT_STRINGS.sekwKolUtrzymanie },
    {
      klucz: 'margines_pu',
      etykieta: FRT_STRINGS.sekwKolMarginesPu,
      jednostka: FRT_STRINGS.jednPu,
      mono: true,
    },
    {
      klucz: 'margines_s',
      etykieta: FRT_STRINGS.sekwKolMarginesS,
      jednostka: FRT_STRINGS.jednS,
      mono: true,
    },
    {
      klucz: 'odzysk',
      etykieta: FRT_STRINGS.sekwKolOdzysk,
      jednostka: FRT_STRINGS.jednS,
      mono: true,
    },
    { klucz: 'werdykt', etykieta: FRT_STRINGS.sekwKolWerdykt, sortowalna: false },
  ];
}

/** Adapter jednego zapadu → wiersz wzorca tabeli (semantyka `ValueRow`). */
function wierszZapadu(zapad: ZapadSekwencjiFrt, indeks: number): WierszTabeli {
  return {
    zapad: { wartosc: String(indeks + 1) },
    glebokosc: { wartosc: fmtPuFrt(zapad.glebokosc_pu), sortKey: zapad.glebokosc_pu },
    czas: { wartosc: fmtSFrt(zapad.czas_s), sortKey: zapad.czas_s },
    // Tag „Nie" czyta WYŁĄCZNIE flagę `stayed_connected` z backendu — bez oceny lokalnej.
    utrzymanie: {
      wartosc: zapad.stayed_connected ? FRT_STRINGS.utrzymanieTak : FRT_STRINGS.utrzymanieNie,
      ostrzezenie: !zapad.stayed_connected,
    },
    margines_pu: {
      wartosc: fmtPuOpcjaFrt(zapad.margin_to_curve_pu),
      sortKey: zapad.margin_to_curve_pu ?? undefined,
      ostrzezenie: zapad.margin_to_curve_pu !== null && zapad.margin_to_curve_pu < 0,
    },
    margines_s: {
      wartosc: fmtSOpcjaFrt(zapad.margin_to_curve_s),
      sortKey: zapad.margin_to_curve_s ?? undefined,
    },
    odzysk: {
      wartosc: fmtSOpcjaFrt(zapad.p_recovery_time_s),
      sortKey: zapad.p_recovery_time_s ?? undefined,
    },
    werdykt: { wartosc: zapad.werdykt_pl },
  };
}

/** Adapter: widok sekwencji → wiersze tabeli zapadów (kolejność źródłowa). */
export function wierszeTabeliSekwencji(widok: WidokSekwencjiFrt): WierszTabeli[] {
  return widok.zapady.map((zapad, i) => wierszZapadu(zapad, i));
}

// ---------------------------------------------------------------------------
// Werdykt sekwencji — odznaka (jak w macierzy NC RfG)
// ---------------------------------------------------------------------------

/** Istotność odznaki werdyktu sekwencji (wyłącznie prezentacja). */
export type IstotnoscSekwencji = 'ok' | 'err';

/** Werdykt sekwencji: tekst PL z backendu + istotność odznaki. */
export interface WerdyktSekwencji {
  readonly tekst: string;
  readonly istotnosc: IstotnoscSekwencji;
}

/** Prefiks werdyktu „w obwiedni" z backendu (`_werdykt_sekwencji_pl`). */
const SEKW_W_OBWIEDNI = 'sekwencja w obwiedni';

/**
 * Odznaka werdyktu sekwencji. Backend zwraca „sekwencja w obwiedni" (zaliczona)
 * albo „sekwencja niezaliczona — zapad N"; UI mapuje wyłącznie na kolor odznaki,
 * a tekst pozostaje dosłownie z backendu (`werdykt_sekwencji_pl`).
 */
export function werdyktSekwencji(widok: WidokSekwencjiFrt): WerdyktSekwencji {
  const zaliczona = widok.werdykt_sekwencji_pl === SEKW_W_OBWIEDNI;
  return { tekst: widok.werdykt_sekwencji_pl, istotnosc: zaliczona ? 'ok' : 'err' };
}
