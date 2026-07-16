/*
 * Model i adapter okna „Wyniki zwarciowe" (karta E8.2). Mapuje REALNY kształt
 * wyniku zwarciowego na model wspólnego wzorca ekranu analizy. Read-only; zero
 * fizyki, zero mutacji, zero wołań API z tego pliku.
 *
 * ŹRÓDŁO DANYCH — realny kontrakt (mapowanie plik:linia, karta §2 „zero zgadywania"):
 * - Wiersz zwarciowy: `ShortCircuitRow` (`ui/results-inspector/types.ts:157-167`):
 *   target_id, element_id?, target_name, ikss_ka, ip_ka, ith_ka, sk_mva,
 *   fault_type, flags. Budowany w backendzie w `enm/canonical_analysis.py:1655-1682`
 *   (fault_type = short_circuit_type: „3F"/„2F"/„2F+Z"/„1F"; flags obecnie []).
 * - Tabela wyników: `ShortCircuitResults` (`types.ts:172-176`): run_id, rows.
 * - Store read-only: `useResultsInspectorStore.shortCircuitResults`
 *   (`ui/results-inspector/store.ts:104`), `selectedRunId` (`store.ts:96`).
 * - Etykiety wielkości PL: `TRACE_VALUE_LABELS` (`types.ts:306-333`).
 *
 * TODO-KARTA (ograniczenia — brak źródła w kontrakcie read-only, karta §2 „NIE zgaduj"):
 * 1. WKŁADY ZWARCIOWE: solver liczy wkłady źródeł/gałęzi
 *    (`network_model/solvers/short_circuit_contributions.py`:
 *    ShortCircuitSourceContribution/ShortCircuitBranchContribution), a backend
 *    przyjmuje opcję `include_branch_contributions`
 *    (`api/fault_scenarios.py:77`). Kontrakt frontu `ShortCircuitRow`/`ShortCircuitResults`
 *    NIE niesie jednak wkładów — fronton ich dziś nie renderuje. Sekcja
 *    `WkladyZwarciowe` przyjmuje wkłady PRZEZ PROPS (`WkladZwarciowy[]`), a przy
 *    braku pokazuje stan „dane wkładów niedostępne w tym przebiegu". DELTA
 *    BACKENDOWA: dołączyć wkłady źródeł do payloadu `/results/short-circuit`
 *    (per punkt zwarcia), aby okno mogło je czytać read-only ze store'u.
 * 2. ŚWIEŻOŚĆ (FreshnessBadge): kontrakt wyników zwarciowych nie niesie LICZBOWEJ
 *    rewizji modelu z chwili liczenia → nagłówek nie podaje rewizji (badge
 *    pominięty, jak w oknie rozpływu). Numeryczną świeżość dostarczy karta
 *    integracyjna (spięcie ze snapshot store'em modelu).
 * 3. ZAŁOŻENIA c / czas cieplny: wartości należą do konfiguracji przebiegu
 *    (`ShortCircuitConfigRequest.c_factor`/`thermal_time_seconds`,
 *    `api/fault_scenarios.py:75-76`), nie do kontraktu wyników. `EkranZwarc`
 *    przyjmuje je PRZEZ PROPS (zarządca podaje przy scaleniu); przy braku
 *    prezentowana jest „—" z uwagą o pochodzeniu. Metoda „IEC 60909" jest stałą
 *    normatywną rodziny solvera (nie zgadywanie).
 */

import type {
  ShortCircuitResults,
  ShortCircuitRow,
} from '../../../ui/results-inspector/types';
import { useResultsInspectorStore } from '../../../ui/results-inspector/store';
import type { DefinicjaKolumny, WartoscKomorki, WierszTabeli, WierszZalozenia } from '../wzorzec';
import {
  ZWARCIA_STRINGS,
  fmtCzas,
  fmtKA,
  fmtMVA,
  fmtProcent,
  fmtWspolczynnik,
  rodzajZwarciaPL,
  uwagiZwarciaPL,
} from './strings';

// ---------------------------------------------------------------------------
// Kolumny tabeli punktów zwarciowych (deklaratywne — jednostka w nagłówku)
// ---------------------------------------------------------------------------

export const KLUCZ_PUNKT = 'identyfikator';

export const KOLUMNY_ZWARC: DefinicjaKolumny[] = [
  { klucz: 'punkt', etykieta: ZWARCIA_STRINGS.kolPunkt, wyrownanie: 'lewo' },
  { klucz: 'rodzaj', etykieta: ZWARCIA_STRINGS.kolRodzaj, wyrownanie: 'lewo' },
  { klucz: 'ikss', etykieta: ZWARCIA_STRINGS.kolIkss, jednostka: ZWARCIA_STRINGS.jednKA, mono: true },
  { klucz: 'ip', etykieta: ZWARCIA_STRINGS.kolIp, jednostka: ZWARCIA_STRINGS.jednKA, mono: true },
  { klucz: 'ith', etykieta: ZWARCIA_STRINGS.kolIth, jednostka: ZWARCIA_STRINGS.jednKA, mono: true },
  { klucz: 'sk', etykieta: ZWARCIA_STRINGS.kolSk, jednostka: ZWARCIA_STRINGS.jednMVA, mono: true },
  { klucz: 'uwagi', etykieta: ZWARCIA_STRINGS.kolUwagi, wyrownanie: 'lewo', sortowalna: false },
  {
    klucz: KLUCZ_PUNKT,
    etykieta: ZWARCIA_STRINGS.kolIdentyfikator,
    mono: true,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
];

// ---------------------------------------------------------------------------
// Mapowania czyste (bez React) — fixture 1:1 z kontraktem `ShortCircuitRow`
// ---------------------------------------------------------------------------

/**
 * Komórka wielkości liczbowej: wartość `null` → „—" (bez dowodu); wartość obecna
 * → sformatowana z przecinkiem PL, `sortKey` liczbowy oraz `dowodRef` (2× klik →
 * dowód). `null` otrzymuje najmniejszy klucz sortowania (deterministyczna
 * kolejność, wartości puste na dole przy sortowaniu rosnącym).
 */
function komorkaWielkosci(
  wartosc: number | null,
  format: (n: number) => string,
  dowodRef: string,
): WartoscKomorki {
  if (wartosc === null) {
    return { wartosc: ZWARCIA_STRINGS.kreska, sortKey: Number.NEGATIVE_INFINITY };
  }
  return { wartosc: format(wartosc), sortKey: wartosc, dowodRef };
}

/**
 * Adapter read-only: `ShortCircuitRow` → wiersz tabeli wzorca. `dowodRef` =
 * `element_id` (gdy jest) lub `target_id` (karta §2: ref dowodu = target/element).
 */
export function mapujWierszZwarcia(row: ShortCircuitRow): WierszTabeli {
  const dowodRef = row.element_id ?? row.target_id;
  return {
    punkt: { wartosc: row.target_name ?? ZWARCIA_STRINGS.kreska },
    rodzaj: { wartosc: rodzajZwarciaPL(row.fault_type) },
    ikss: komorkaWielkosci(row.ikss_ka, fmtKA, dowodRef),
    ip: komorkaWielkosci(row.ip_ka, fmtKA, dowodRef),
    ith: komorkaWielkosci(row.ith_ka, fmtKA, dowodRef),
    sk: komorkaWielkosci(row.sk_mva, fmtMVA, dowodRef),
    uwagi: { wartosc: uwagiZwarciaPL(row.flags) },
    [KLUCZ_PUNKT]: { wartosc: row.target_id },
  };
}

/** Mapuje wiersze zwarciowe na wiersze tabeli wzorca (kolejność źródłowa). */
export function naWierszeZwarc(rows: ShortCircuitRow[]): WierszTabeli[] {
  return rows.map(mapujWierszZwarcia);
}

/**
 * Buduje sekcję ZAŁOŻENIA (W-602). Metoda „IEC 60909" — stała normatywna rodziny
 * solvera. Współczynnik c i czas cieplny pochodzą z konfiguracji przebiegu
 * (props); przy braku prezentowana jest „—" z uwagą o pochodzeniu (TODO-KARTA 3).
 */
export function naZalozeniaZwarc(
  wspolczynnikC?: number,
  czasCieplnyS?: number,
): WierszZalozenia[] {
  return [
    { etykieta: ZWARCIA_STRINGS.zalMetoda, wartosc: ZWARCIA_STRINGS.zalMetodaWartosc },
    {
      etykieta: ZWARCIA_STRINGS.zalWspolczynnikC,
      wartosc: wspolczynnikC !== undefined ? fmtWspolczynnik(wspolczynnikC) : ZWARCIA_STRINGS.kreska,
      uwaga: wspolczynnikC === undefined ? ZWARCIA_STRINGS.zalWartoscZKonfiguracji : undefined,
    },
    {
      etykieta: ZWARCIA_STRINGS.zalCzasCieplny,
      wartosc: czasCieplnyS !== undefined ? fmtCzas(czasCieplnyS) : ZWARCIA_STRINGS.kreska,
      jednostka: czasCieplnyS !== undefined ? ZWARCIA_STRINGS.jednS : undefined,
      uwaga: czasCieplnyS === undefined ? ZWARCIA_STRINGS.zalWartoscZKonfiguracji : undefined,
    },
  ];
}

// ---------------------------------------------------------------------------
// Wykres — słupki Ik" per punkt zwarcia (dane wprost z wyniku, zero losowości)
// ---------------------------------------------------------------------------

/** Punkt słupka wykresu Ik" (jeden punkt zwarcia). */
export interface SlupekIkss {
  punkt: string;
  ikss: number;
}

/**
 * Punkty wykresu Ik" — tylko wiersze z niepustym `ikss_ka` (kolejność źródłowa).
 * Etykieta słupka = nazwa punktu (target_name) lub target_id, gdy brak nazwy.
 */
export function naSlupkiIkss(rows: ShortCircuitRow[]): SlupekIkss[] {
  return rows
    .filter((r) => r.ikss_ka !== null)
    .map((r) => ({ punkt: r.target_name ?? r.target_id, ikss: r.ikss_ka as number }));
}

// ---------------------------------------------------------------------------
// Wkłady zwarciowe — projekcja prezentacyjna (dane przez props, patrz TODO-KARTA 1)
// ---------------------------------------------------------------------------

/**
 * Wkład pojedynczego źródła do prądu w punkcie zwarcia — projekcja prezentacyjna
 * (nie kontrakt solvera). Kształt odwzorowuje `ShortCircuitSourceContribution`
 * (`short_circuit_contributions.py`): identyfikator, nazwa źródła (PL), prąd [kA].
 */
export interface WkladZwarciowy {
  /** Identyfikator źródła — pokazywany wyłącznie w trybie eksperckim. */
  id: string;
  /** Nazwa źródła (polska, pierwszy plan). */
  zrodlo: string;
  /** Prąd wkładu [kA]. */
  pradKA: number;
  /** Odwołanie do dowodu (2× klik → onOtworzDowod), opcjonalne. */
  dowodRef?: string;
}

/** Kolumny tabeli wkładów (deklaratywne — jednostka w nagłówku). */
export const KLUCZ_WKLAD = 'identyfikator';

export const KOLUMNY_WKLADOW: DefinicjaKolumny[] = [
  { klucz: 'zrodlo', etykieta: ZWARCIA_STRINGS.wkladyKolZrodlo, wyrownanie: 'lewo' },
  { klucz: 'prad', etykieta: ZWARCIA_STRINGS.wkladyKolPrad, jednostka: ZWARCIA_STRINGS.jednKA, mono: true },
  { klucz: 'udzial', etykieta: ZWARCIA_STRINGS.wkladyKolUdzial, jednostka: ZWARCIA_STRINGS.jednProcent, mono: true },
  {
    klucz: KLUCZ_WKLAD,
    etykieta: ZWARCIA_STRINGS.wkladyKolIdentyfikator,
    mono: true,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
];

/**
 * Mapuje wkłady na wiersze tabeli wzorca. Udział [%] liczony PREZENTACYJNIE jako
 * stosunek prądu wkładu do sumy prądów wkładów (arytmetyka prezentacji, nie
 * fizyka — karta §2). Suma zerowa → udział „—" (bez dzielenia przez zero).
 */
export function naWierszeWkladow(wklady: WkladZwarciowy[]): WierszTabeli[] {
  const suma = wklady.reduce((acc, w) => acc + w.pradKA, 0);
  return wklady.map((w) => ({
    zrodlo: { wartosc: w.zrodlo },
    prad: { wartosc: fmtKA(w.pradKA), sortKey: w.pradKA, dowodRef: w.dowodRef },
    udzial:
      suma > 0
        ? { wartosc: fmtProcent((w.pradKA / suma) * 100), sortKey: w.pradKA / suma }
        : { wartosc: ZWARCIA_STRINGS.kreska, sortKey: Number.NEGATIVE_INFINITY },
    [KLUCZ_WKLAD]: { wartosc: w.id },
  }));
}

// ---------------------------------------------------------------------------
// Hook read-only (spięcie ze store'em wyników zwarciowych)
// ---------------------------------------------------------------------------

/** Projekcja read-only: wynik zwarciowy + identyfikator przebiegu (dla nagłówka). */
export interface WynikZwarciowy {
  wynik: ShortCircuitResults | null;
  runId: string | null;
}

/** Czyta wynik zwarciowy ze store'u (read-only) — bez wołań API z tego pliku. */
export function useWynikZwarciowy(): WynikZwarciowy {
  const wynik = useResultsInspectorStore((s) => s.shortCircuitResults);
  const runId = useResultsInspectorStore((s) => s.selectedRunId);
  return { wynik, runId };
}
