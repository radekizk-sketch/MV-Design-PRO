/*
 * Model okna „Wrażliwość" — czyste projekcje do wspólnego wzorca ekranu
 * analizy (`ui2/wyniki/wzorzec`): kolumny deklaratywne, wiersze `WartoscKomorki`,
 * założenia. ZERO fizyki — wartości i progi wprost z backendu.
 * Wybór przebiegu rozpływu — reużycie `przebiegRozplywu` z modelu okna
 * „Jakość wyników" (jedno źródło prawdy doboru przebiegu LOAD_FLOW/DONE).
 */

import type {
  DefinicjaKolumny,
  WartoscKomorki,
  WierszTabeli,
  WierszZalozenia,
} from '../wzorzec';
import type { CzynnikLf, WezelWrazliwosci, WidokLf, WidokOgolny, WpisOgolny } from './api';
import {
  WRAZLIWOSC_STRINGS as T,
  etykietaDecyzji,
  etykietaKryterium,
  fmtMargines,
  fmtPp,
} from './strings';

export { przebiegRozplywu } from '../jakosc/jakoscModel';

/** Nazwa szyny dla identyfikatora węzła grafu (fallback: identyfikator). */
export function nazwaWezla(
  busId: string,
  wezly: Readonly<Record<string, WezelWrazliwosci>>,
): string {
  return wezly[busId]?.name ?? busId;
}

// ---------------------------------------------------------------------------
// Sekcja 1 — czynniki wpływu na profil napięć (LF)
// ---------------------------------------------------------------------------

export const KOLUMNY_LF: DefinicjaKolumny[] = [
  { klucz: 'wezel', etykieta: T.kolWezel, mono: false, wyrownanie: 'lewo' },
  { klucz: 'parametr', etykieta: T.kolParametr, mono: true, wyrownanie: 'lewo' },
  { klucz: 'perturbacja', etykieta: T.kolPerturbacja, mono: true },
  { klucz: 'zmianaOdchylki', etykieta: T.kolZmianaOdchylki, mono: true },
  { klucz: 'zmianaMarginesu', etykieta: T.kolZmianaMarginesu, mono: true },
  { klucz: 'dlaczego', etykieta: T.kolDlaczego, mono: false, wyrownanie: 'lewo', sortowalna: false },
  { klucz: 'wezelId', etykieta: T.kolIdentyfikatorWezla, mono: true, tylkoEkspercki: true },
];

/** Klucz wiersza rankingu LF (stabilny przy sortowaniu). */
export const KLUCZ_WIERSZA_LF = 'kluczWiersza';

function komorka(
  wartosc: string,
  opcje?: { sortKey?: number; ostrzezenie?: boolean },
): WartoscKomorki {
  return { wartosc, ...opcje };
}

/** Ranking czynników wpływu → wiersze wzorca (klucz stabilny w kolumnie ukrytej). */
export function naWierszeLf(
  czynniki: readonly CzynnikLf[],
  wezly: Readonly<Record<string, WezelWrazliwosci>>,
): WierszTabeli[] {
  return czynniki.map((czynnik, indeks) => ({
    [KLUCZ_WIERSZA_LF]: komorka(
      `${czynnik.bus_id}|${czynnik.parameter}|${czynnik.perturbation}|${indeks}`,
    ),
    wezel: komorka(nazwaWezla(czynnik.bus_id, wezly)),
    parametr: komorka(czynnik.parameter),
    perturbacja: komorka(czynnik.perturbation),
    zmianaOdchylki: komorka(fmtPp(czynnik.delta_delta_pct), {
      sortKey: czynnik.delta_delta_pct,
    }),
    zmianaMarginesu:
      czynnik.delta_margin_pct === null
        ? komorka(T.kreska)
        : komorka(fmtPp(czynnik.delta_margin_pct), { sortKey: czynnik.delta_margin_pct }),
    dlaczego: komorka(czynnik.why_pl),
    wezelId: komorka(czynnik.bus_id),
  }));
}

/** Założenia sekcji LF (delta perturbacji + zakres wpisów). */
export function naZalozeniaLf(widok: WidokLf): WierszZalozenia[] {
  return [
    {
      etykieta: T.deltaEtykieta,
      wartosc: `±${widok.delta_pct}`,
      jednostka: T.jednProcent,
      uwaga: T.sekcjaLfOpis,
    },
    {
      etykieta: T.liczbaWezlow,
      wartosc: widok.summary.total_entries,
    },
  ];
}

// ---------------------------------------------------------------------------
// Sekcja 2 — wrażliwość marginesów kryteriów (ogólna)
// ---------------------------------------------------------------------------

export const KOLUMNY_OGOLNE: DefinicjaKolumny[] = [
  { klucz: 'kryterium', etykieta: T.kolKryterium, mono: false, wyrownanie: 'lewo' },
  { klucz: 'wezel', etykieta: T.kolWezel, mono: false, wyrownanie: 'lewo' },
  { klucz: 'marginesBazowy', etykieta: T.kolMarginesBazowy, mono: true },
  { klucz: 'decyzja', etykieta: T.kolDecyzjaBazowa, mono: false, wyrownanie: 'lewo' },
  { klucz: 'minus', etykieta: T.kolMinus, mono: true },
  { klucz: 'plus', etykieta: T.kolPlus, mono: true },
  { klucz: 'wezelId', etykieta: T.kolIdentyfikatorWezla, mono: true, tylkoEkspercki: true },
];

export const KLUCZ_WIERSZA_OGOLNEGO = 'kluczWiersza';

function komorkaMarginesu(margines: number | null, jednostka: string | null): WartoscKomorki {
  if (margines === null) return komorka(T.kreska);
  return {
    wartosc: fmtMargines(margines),
    jednostka: jednostka ?? undefined,
    sortKey: margines,
    ostrzezenie: margines < 0,
  };
}

/** Wpisy wrażliwości ogólnej → wiersze wzorca. */
export function naWierszeOgolne(
  wpisy: readonly WpisOgolny[],
  wezly: Readonly<Record<string, WezelWrazliwosci>>,
): WierszTabeli[] {
  return wpisy.map((wpis) => ({
    [KLUCZ_WIERSZA_OGOLNEGO]: komorka(`${wpis.parameter_id}|${wpis.target_id}`),
    kryterium: komorka(etykietaKryterium(wpis.parameter_id)),
    wezel: komorka(nazwaWezla(wpis.target_id, wezly)),
    marginesBazowy: komorkaMarginesu(wpis.base_margin, wpis.margin_unit),
    decyzja: komorka(etykietaDecyzji(wpis.base_decision), {
      ostrzezenie: wpis.base_decision === 'FAIL',
    }),
    minus: komorkaMarginesu(wpis.minus.margin, wpis.margin_unit),
    plus: komorkaMarginesu(wpis.plus.margin, wpis.margin_unit),
    wezelId: komorka(wpis.target_id),
  }));
}

/** Założenia sekcji ogólnej. */
export function naZalozeniaOgolne(widok: WidokOgolny): WierszZalozenia[] {
  return [
    {
      etykieta: T.deltaEtykieta,
      wartosc: `±${widok.delta_pct}`,
      jednostka: T.jednProcent,
      uwaga: T.sekcjaOgolnaOpis,
    },
    {
      etykieta: T.liczbaKryteriow,
      wartosc: widok.summary.total_entries,
    },
  ];
}
