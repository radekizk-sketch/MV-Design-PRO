/*
 * Model i adaptery okna „Jakość wyników" (karta E8.4 / W-607). Mapuje REALNE
 * kształty odpowiedzi końcówek jakości (`api.ts`) na model wspólnego wzorca
 * ekranu analizy (`wzorzec`). Read-only; zero fizyki, zero ocen lokalnych (statusy
 * i granice pochodzą WYŁĄCZNIE z backendu), zero mutacji, zero wołań API stąd.
 *
 * Nazwy adapterów/kolumn są prefiksowane tematycznie (…_WIARYGODNOSCI /
 * …_WALIDACJI), bo barrel nadrzędny `ui2/wyniki/index.ts` robi `export *` z wielu
 * modułów — prefiks zapobiega kolizji nazw (TS2308).
 */

import type { ExecutionRun } from '../../../ui/study-cases/types';
import type {
  DefinicjaKolumny,
  WartoscKomorki,
  WierszTabeli,
  WierszZalozenia,
} from '../wzorzec';
import type {
  WalidacjaConfig,
  WalidacjaItem,
  WiarygodnoscItem,
} from './api';
import {
  JAKOSC_STRINGS,
  fmtKA,
  fmtKV,
  fmtProcent,
  fmtWartosc,
  rodzajKontroliPL,
  statusWalidacjiPL,
} from './strings';

// ---------------------------------------------------------------------------
// Wybór przebiegu z rejestru (useExecutionRunsStore) — aktywny/ostatni DONE
// ---------------------------------------------------------------------------

/** Czy rodzaj analizy to przebieg zwarciowy (SC_*). */
export function jestPrzebiegiemZwarciowym(analysisType: string): boolean {
  return analysisType.startsWith('SC_');
}

/**
 * Wybiera przebieg danego rodzaju: preferuje aktywny (gdy pasuje i zakończony),
 * inaczej OSTATNI zakończony (DONE) danego rodzaju. Deterministyczne dla danego
 * wejścia (kolejność źródłowa listy `runs`).
 */
function wybierzPrzebieg(
  runs: readonly ExecutionRun[],
  activeRunId: string | null,
  pasuje: (analysisType: string) => boolean,
): ExecutionRun | null {
  const kandydaci = runs.filter((r) => pasuje(r.analysis_type) && r.status === 'DONE');
  if (kandydaci.length === 0) return null;
  const aktywny = kandydaci.find((r) => r.id === activeRunId);
  return aktywny ?? kandydaci[kandydaci.length - 1];
}

/** Ostatni/aktywny zakończony przebieg zwarciowy (SC_* + DONE) — sekcja wiarygodności. */
export function przebiegZwarciowy(
  runs: readonly ExecutionRun[],
  activeRunId: string | null,
): ExecutionRun | null {
  return wybierzPrzebieg(runs, activeRunId, jestPrzebiegiemZwarciowym);
}

/** Ostatni/aktywny zakończony przebieg rozpływu (LOAD_FLOW/DONE) — sekcja walidacji. */
export function przebiegRozplywu(
  runs: readonly ExecutionRun[],
  activeRunId: string | null,
): ExecutionRun | null {
  return wybierzPrzebieg(runs, activeRunId, (t) => t === 'LOAD_FLOW');
}

// ---------------------------------------------------------------------------
// Komórki liczbowe (null → „—", bez sortowania na dół; wartość → PL + sortKey)
// ---------------------------------------------------------------------------

function komorkaLiczba(
  wartosc: number | null,
  format: (n: number) => string,
  opcje?: { jednostka?: string; ostrzezenie?: boolean },
): WartoscKomorki {
  if (wartosc === null) {
    return { wartosc: JAKOSC_STRINGS.kreska, sortKey: Number.NEGATIVE_INFINITY };
  }
  return {
    wartosc: format(wartosc),
    sortKey: wartosc,
    jednostka: opcje?.jednostka,
    ostrzezenie: opcje?.ostrzezenie,
  };
}

// ---------------------------------------------------------------------------
// Sekcja 1 — Wiarygodność zwarciowa
// ---------------------------------------------------------------------------

export const KLUCZ_WIARYGODNOSCI_WEZEL = 'identyfikator';

export const KOLUMNY_WIARYGODNOSCI: DefinicjaKolumny[] = [
  { klucz: 'wezel', etykieta: JAKOSC_STRINGS.kolWezel, wyrownanie: 'lewo' },
  { klucz: 'napiecie', etykieta: JAKOSC_STRINGS.kolNapiecie, jednostka: JAKOSC_STRINGS.jednKV, mono: true },
  { klucz: 'pasmo', etykieta: JAKOSC_STRINGS.kolPasmo, wyrownanie: 'lewo' },
  { klucz: 'ikss', etykieta: JAKOSC_STRINGS.kolIkss, jednostka: JAKOSC_STRINGS.jednKA, mono: true },
  { klucz: 'dolna', etykieta: JAKOSC_STRINGS.kolGranicaDolna, jednostka: JAKOSC_STRINGS.jednKA, mono: true },
  { klucz: 'gorna', etykieta: JAKOSC_STRINGS.kolGranicaGorna, jednostka: JAKOSC_STRINGS.jednKA, mono: true },
  { klucz: 'status', etykieta: JAKOSC_STRINGS.kolStatusWiarygodnosci, wyrownanie: 'lewo' },
  { klucz: 'blokada', etykieta: JAKOSC_STRINGS.kolBlokadaOsd, wyrownanie: 'lewo', sortowalna: false },
  {
    klucz: KLUCZ_WIARYGODNOSCI_WEZEL,
    etykieta: JAKOSC_STRINGS.kolIdentyfikatorWezla,
    mono: true,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
];

/** Adapter: pozycja wiarygodności → wiersz tabeli wzorca (bez ocen lokalnych). */
export function mapujWierszWiarygodnosci(item: WiarygodnoscItem): WierszTabeli {
  return {
    wezel: { wartosc: item.target_name ?? item.target_id },
    napiecie: komorkaLiczba(item.voltage_kv, fmtKV),
    pasmo: { wartosc: item.voltage_band ?? JAKOSC_STRINGS.kreska },
    // Tag „poza zakresem" mapowany na wartość Ik" wprost z flagi backendu (in_range).
    ikss: komorkaLiczba(item.ikss_ka, fmtKA, { ostrzezenie: !item.in_range }),
    dolna: komorkaLiczba(item.lower_ka, fmtKA),
    gorna: komorkaLiczba(item.upper_ka, fmtKA),
    status: { wartosc: item.status },
    blokada: {
      wartosc: item.blocks_osd_package ? JAKOSC_STRINGS.blokadaTak : JAKOSC_STRINGS.blokadaNie,
    },
    [KLUCZ_WIARYGODNOSCI_WEZEL]: { wartosc: item.target_id },
  };
}

/** Mapuje pozycje wiarygodności na wiersze tabeli wzorca (kolejność źródłowa). */
export function naWierszeWiarygodnosci(items: readonly WiarygodnoscItem[]): WierszTabeli[] {
  return items.map(mapujWierszWiarygodnosci);
}

/** Buduje sekcję ZAŁOŻENIA sekcji wiarygodności (metoda + pasma napięciowe). */
export function naZalozeniaWiarygodnosci(): WierszZalozenia[] {
  return [
    {
      etykieta: JAKOSC_STRINGS.zalMetodaWiarygodnosc,
      wartosc: JAKOSC_STRINGS.zalMetodaWiarygodnoscWartosc,
    },
    {
      etykieta: JAKOSC_STRINGS.zalPasma,
      wartosc: JAKOSC_STRINGS.zalPasmaWartosc,
      uwaga: JAKOSC_STRINGS.zalPasmaUwaga,
    },
  ];
}

// ---------------------------------------------------------------------------
// Sekcja 2 — Walidacja energetyczna
// ---------------------------------------------------------------------------

export const KLUCZ_WALIDACJI_OBIEKT = 'identyfikator';

/**
 * Klucz wiersza tabeli walidacji (React key + wybór wiersza). Pole POZA listą
 * kolumn (nie renderowane) — bo `target_id` NIE jest unikatowy w tej sekcji
 * (jeden obiekt bywa oceniany kilkoma rodzajami kontroli). Kompozyt
 * `check_type::target_id::index` gwarantuje unikatowość i determinizm.
 */
export const KLUCZ_WIERSZA_WALIDACJI = 'kluczWiersza';

/** Deterministyczny, unikatowy klucz pozycji walidacji (rodzaj + obiekt + indeks). */
export function kluczWalidacji(item: WalidacjaItem, index: number): string {
  return `${item.check_type}::${item.target_id}::${index}`;
}

export const KOLUMNY_WALIDACJI: DefinicjaKolumny[] = [
  { klucz: 'rodzaj', etykieta: JAKOSC_STRINGS.kolRodzajKontroli, wyrownanie: 'lewo' },
  { klucz: 'obiekt', etykieta: JAKOSC_STRINGS.kolObiekt, wyrownanie: 'lewo' },
  { klucz: 'wartosc', etykieta: JAKOSC_STRINGS.kolWartosc, mono: true },
  { klucz: 'progOstrz', etykieta: JAKOSC_STRINGS.kolProgOstrzezenia, mono: true },
  { klucz: 'progPrzekr', etykieta: JAKOSC_STRINGS.kolProgPrzekroczenia, mono: true },
  { klucz: 'margines', etykieta: JAKOSC_STRINGS.kolMargines, jednostka: JAKOSC_STRINGS.jednProcent, mono: true },
  { klucz: 'status', etykieta: JAKOSC_STRINGS.kolStatusWalidacji, wyrownanie: 'lewo' },
  {
    klucz: KLUCZ_WALIDACJI_OBIEKT,
    etykieta: JAKOSC_STRINGS.kolIdentyfikatorObiektu,
    mono: true,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
];

/** Adapter: pozycja walidacji → wiersz tabeli wzorca (statusy wyłącznie z backendu). */
export function mapujWierszWalidacji(item: WalidacjaItem, index: number): WierszTabeli {
  const przekroczony = item.status === 'WARNING' || item.status === 'FAIL';
  return {
    rodzaj: { wartosc: rodzajKontroliPL(item.check_type) },
    obiekt: { wartosc: item.target_name ?? item.target_id },
    wartosc: komorkaLiczba(item.observed_value, fmtWartosc, {
      jednostka: item.unit,
      ostrzezenie: przekroczony,
    }),
    progOstrz: komorkaLiczba(item.limit_warn, fmtWartosc, { jednostka: item.unit }),
    progPrzekr: komorkaLiczba(item.limit_fail, fmtWartosc, { jednostka: item.unit }),
    margines: komorkaLiczba(item.margin_pct, fmtProcent),
    status: { wartosc: statusWalidacjiPL(item.status) },
    [KLUCZ_WALIDACJI_OBIEKT]: { wartosc: item.target_id },
    [KLUCZ_WIERSZA_WALIDACJI]: { wartosc: kluczWalidacji(item, index) },
  };
}

/** Mapuje pozycje walidacji na wiersze tabeli wzorca (kolejność źródłowa). */
export function naWierszeWalidacji(items: readonly WalidacjaItem[]): WierszTabeli[] {
  return items.map((item, index) => mapujWierszWalidacji(item, index));
}

/** Buduje sekcję ZAŁOŻENIA sekcji walidacji z konfiguracji progów backendu. */
export function naZalozeniaWalidacji(config: WalidacjaConfig): WierszZalozenia[] {
  const proc = JAKOSC_STRINGS.jednProcent;
  return [
    { etykieta: JAKOSC_STRINGS.zalProgObciazeniaOstrz, wartosc: fmtProcent(config.loading_warn_pct), jednostka: proc },
    { etykieta: JAKOSC_STRINGS.zalProgObciazeniaPrzekr, wartosc: fmtProcent(config.loading_fail_pct), jednostka: proc },
    { etykieta: JAKOSC_STRINGS.zalProgNapieciaOstrz, wartosc: fmtProcent(config.voltage_warn_pct), jednostka: proc },
    { etykieta: JAKOSC_STRINGS.zalProgNapieciaPrzekr, wartosc: fmtProcent(config.voltage_fail_pct), jednostka: proc },
    { etykieta: JAKOSC_STRINGS.zalProgStratOstrz, wartosc: fmtProcent(config.loss_warn_pct), jednostka: proc },
    { etykieta: JAKOSC_STRINGS.zalProgStratPrzekr, wartosc: fmtProcent(config.loss_fail_pct), jednostka: proc },
  ];
}
