/*
 * Model i adaptery sekcji „Sekwencja zapadów" okna „Walidacja modelu falownika"
 * (strumień OZE). Czyste, read-only odwzorowanie odpowiedzi końcówki frt-sequence
 * (`../api`) na struktury prezentacji (tabela zapadów pierwszego planu + tabela
 * audytowa pól solvera).
 *
 * UCZCIWOŚĆ (2026-09-23): sekwencja NIE jest oceniana — każdy zapad liczony jest
 * trajektorią zadaną profilem wejściowym, więc „w obwiedni" było tautologią. Dawna
 * odznaka „werdyktu sekwencji" skasowana; pierwszy plan niesie etykietę rekordu oceny
 * z backendu, a pola solvera wyłącznie tabelę audytową (bez tagów ostrzegawczych).
 *
 * GRANICE (NOT-A-SOLVER / zero fizyki): warstwa wyłącznie prezentuje. Pola solvera
 * i kontekst siły sieci pochodzą WYŁĄCZNIE z backendu.
 * Serializacja sekwencji (kropka dziesiętna) należy do klienta (`serializujSekwencjeFrt`);
 * tu formatujemy WYŁĄCZNIE do prezentacji (przecinek PL). Zero mutacji, zero wołań API.
 */

import type { WidokSekwencjiFrt, ZapadSekwencjiFrt } from '../api';
import type { DefinicjaKolumny, WierszTabeli } from '../../wyniki/wzorzec/wzorzecModel';
import { kolumnyAudytuFrt, komorkiAudytuFrt } from './frtModel';
import { FRT_STRINGS, fmtPuFrt, fmtSFrt } from './strings';

// ---------------------------------------------------------------------------
// Tabela zapadów sekwencji (pierwszy plan) — wzorzec `TabelaWynikow`
// ---------------------------------------------------------------------------

/** Kolumny tabeli zapadów: echo wejścia (głębokość, czas) + etykieta oceny z rekordu. */
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
    { klucz: 'ocena', etykieta: FRT_STRINGS.kolOcena, sortowalna: false },
  ];
}

/** Adapter jednego zapadu → wiersz pierwszego planu (etykieta z rekordu backendu). */
function wierszZapadu(zapad: ZapadSekwencjiFrt, indeks: number): WierszTabeli {
  return {
    zapad: { wartosc: String(indeks + 1) },
    glebokosc: { wartosc: fmtPuFrt(zapad.glebokosc_pu), sortKey: zapad.glebokosc_pu },
    czas: { wartosc: fmtSFrt(zapad.czas_s), sortKey: zapad.czas_s },
    ocena: { wartosc: zapad.ocena.etykieta.etykieta_pl },
  };
}

/** Adapter: widok sekwencji → wiersze tabeli zapadów (kolejność źródłowa). */
export function wierszeTabeliSekwencji(widok: WidokSekwencjiFrt): WierszTabeli[] {
  return widok.zapady.map((zapad, i) => wierszZapadu(zapad, i));
}

// ---------------------------------------------------------------------------
// Tabela audytowa zapadów — pola solvera (ta sama projekcja co trajektorie)
// ---------------------------------------------------------------------------

/** Kolumny tabeli audytowej zapadów (numer zapadu zamiast identyfikatora scenariusza). */
export function kolumnyAudytuSekwencji(): DefinicjaKolumny[] {
  return [
    { klucz: 'zapad', etykieta: FRT_STRINGS.sekwKolZapad, sortowalna: false },
    ...kolumnyAudytuFrt().filter((kolumna) => kolumna.klucz !== 'scenariusz'),
  ];
}

/** Adapter: widok sekwencji → wiersze tabeli audytowej (kolejność źródłowa). */
export function wierszeAudytuSekwencji(widok: WidokSekwencjiFrt): WierszTabeli[] {
  return widok.zapady.map((zapad, i) => ({
    zapad: { wartosc: String(i + 1) },
    ...komorkiAudytuFrt(zapad),
  }));
}
