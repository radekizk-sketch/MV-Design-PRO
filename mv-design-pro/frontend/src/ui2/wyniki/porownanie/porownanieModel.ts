/*
 * Model i czyste adaptery okna „Porównanie przebiegów" (karta E12.1 / W-609).
 * Mapują REALNY kształt wyniku porównania A/B rozpływu na model wspólnego wzorca
 * ekranu analizy. Read-only; zero fizyki, zero mutacji, zero wołań API z tego
 * pliku (klient reużyty w `EkranPorownania`).
 *
 * ŹRÓDŁO DANYCH — realny kontrakt (mapowanie plik:linia, karta §2 „zero zgadywania"):
 * - Wynik pełny: `PowerFlowComparisonResult` (`ui/power-flow-comparison/types.ts:174-186`):
 *   comparison_id, run_a_id, run_b_id, bus_diffs, branch_diffs, ranking, summary,
 *   input_hash, created_at.
 * - Podsumowanie: `PowerFlowComparisonSummary` (`types.ts:149-165`).
 * - Wiersz szyny: `PowerFlowBusDiffRow` (`types.ts:79-93`): bus_id, v_pu_a/b,
 *   angle_deg_a/b, p/q_injected_*_a/b, delta_v_pu, delta_angle_deg, delta_p/q.
 * - Wiersz gałęzi: `PowerFlowBranchDiffRow` (`types.ts:103-123`): branch_id,
 *   p/q_from_*_a/b, p/q_to_*_a/b, losses_p/q_*_a/b, delta_*.
 * - Problem rankingu: `PowerFlowRankingIssue` (`types.ts:133-139`): issue_code,
 *   severity, element_ref, description_pl, evidence_ref.
 * - Lista przebiegów do wyboru A/B: `PowerFlowRunItem` (`types.ts:227-238`) —
 *   pobierana klientem `fetchPowerFlowRuns` (`api.ts:111`).
 *
 * WYBÓR ŹRÓDŁA LISTY A/B (uzasadnienie, karta §2): użyto `fetchPowerFlowRuns`
 * (`/projects/{id}/power-flow-runs`), a NIE `useExecutionRunsStore.runs`, bo:
 *   1. identyfikatory zwracanych `PowerFlowRunItem` to DOKŁADNIE `power_flow_run_id`,
 *      których oczekuje endpoint porównania (`api.ts:44-47`); id ogólnych
 *      `ExecutionRun` pochodzą z innej encji (`/study-cases/{id}/runs`),
 *   2. lista jest projektowa (A/B między przypadkami), a store trzyma przebiegi
 *      tylko aktywnego przypadku (`runStore.ts:144-154`),
 *   3. klient sam filtruje status FINISHED i sortuje malejąco po dacie
 *      (`api.ts:131-138`) — komplet do etykiety PL (data + zbieżność).
 * Kontrakt read-only NIE niesie ludzkiej nazwy przypadku — nazwę pobiera warstwa
 * ekranu ze store'u study-cases po `study_case_id` i podaje do `etykietaPrzebiegu`
 * (brak nazwy → dzisiejsza etykieta). Identyfikatory (id przebiegu/przypadku)
 * pozostają wyłącznie w trybie eksperckim.
 */

import type {
  PowerFlowBranchDiffRow,
  PowerFlowBusDiffRow,
  PowerFlowComparisonSummary,
  PowerFlowRankingIssue,
  PowerFlowRunItem,
} from '../../../ui/power-flow-comparison/types';
import type { DefinicjaKolumny, WartoscKomorki, WierszTabeli, WierszZalozenia } from '../wzorzec';
import { refDowoduPorownania } from './dowodPorownania';
import {
  POROWNANIE_STRINGS,
  WAGA_PROG_TAG,
  fmtData,
  fmtDeltaKat,
  fmtDeltaMoc,
  fmtDeltaNapiecie,
  fmtKat,
  fmtMoc,
  fmtNapiecie,
  rodzajProblemuPL,
  wagaPL,
  zbieznoscPL,
} from './strings';

// ---------------------------------------------------------------------------
// Kolumny tabel (deklaratywne — jednostka w nagłówku, wartość A / B / Δ)
// ---------------------------------------------------------------------------

export const KOLUMNY_SZYN_DIFF: DefinicjaKolumny[] = [
  { klucz: 'szyna', etykieta: POROWNANIE_STRINGS.kolSzyna, wyrownanie: 'lewo' },
  { klucz: 'vA', etykieta: POROWNANIE_STRINGS.kolNapiecieA, jednostka: POROWNANIE_STRINGS.jednPu, mono: true },
  { klucz: 'vB', etykieta: POROWNANIE_STRINGS.kolNapiecieB, jednostka: POROWNANIE_STRINGS.jednPu, mono: true },
  { klucz: 'dV', etykieta: POROWNANIE_STRINGS.kolNapiecieD, jednostka: POROWNANIE_STRINGS.jednPu, mono: true },
  { klucz: 'katA', etykieta: POROWNANIE_STRINGS.kolKatA, jednostka: POROWNANIE_STRINGS.jednStopnie, mono: true },
  { klucz: 'katB', etykieta: POROWNANIE_STRINGS.kolKatB, jednostka: POROWNANIE_STRINGS.jednStopnie, mono: true },
  { klucz: 'dKat', etykieta: POROWNANIE_STRINGS.kolKatD, jednostka: POROWNANIE_STRINGS.jednStopnie, mono: true },
];

export const KOLUMNY_GALEZI: DefinicjaKolumny[] = [
  { klucz: 'galaz', etykieta: POROWNANIE_STRINGS.kolGalaz, wyrownanie: 'lewo' },
  { klucz: 'stratyA', etykieta: POROWNANIE_STRINGS.kolStratyA, jednostka: POROWNANIE_STRINGS.jednMW, mono: true },
  { klucz: 'stratyB', etykieta: POROWNANIE_STRINGS.kolStratyB, jednostka: POROWNANIE_STRINGS.jednMW, mono: true },
  { klucz: 'dStraty', etykieta: POROWNANIE_STRINGS.kolStratyD, jednostka: POROWNANIE_STRINGS.jednMW, mono: true },
  { klucz: 'mocA', etykieta: POROWNANIE_STRINGS.kolMocA, jednostka: POROWNANIE_STRINGS.jednMW, mono: true },
  { klucz: 'mocB', etykieta: POROWNANIE_STRINGS.kolMocB, jednostka: POROWNANIE_STRINGS.jednMW, mono: true },
  { klucz: 'dMoc', etykieta: POROWNANIE_STRINGS.kolMocD, jednostka: POROWNANIE_STRINGS.jednMW, mono: true },
];

/** Klucz React wiersza rankingu (indeks źródłowy — stabilny przy sortowaniu). */
export const KLUCZ_PROBLEM = 'klucz';

export const KOLUMNY_RANKINGU: DefinicjaKolumny[] = [
  { klucz: 'waga', etykieta: POROWNANIE_STRINGS.kolWaga, wyrownanie: 'lewo' },
  { klucz: 'rodzaj', etykieta: POROWNANIE_STRINGS.kolRodzaj, wyrownanie: 'lewo' },
  { klucz: 'element', etykieta: POROWNANIE_STRINGS.kolElement, wyrownanie: 'lewo' },
  { klucz: 'opis', etykieta: POROWNANIE_STRINGS.kolOpis, wyrownanie: 'lewo', sortowalna: false },
  {
    klucz: 'kodTechniczny',
    etykieta: POROWNANIE_STRINGS.kolKodTechniczny,
    mono: true,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
];

// ---------------------------------------------------------------------------
// Mapa wag elementów z rankingu (progi → tagi wg wag z backendu)
// ---------------------------------------------------------------------------

/**
 * Buduje mapę `element_ref` → maksymalna waga problemu z rankingu backendu.
 * Steruje tagiem „poza zakresem" na komórkach Δ tabel różnic (karta §4.3:
 * progi→tagi wg wag z backendu — bez lokalnej oceny, wyłącznie dana z backendu).
 */
export function mapaWagElementow(ranking: PowerFlowRankingIssue[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const issue of ranking) {
    const poprz = mapa.get(issue.element_ref) ?? 0;
    if (issue.severity > poprz) mapa.set(issue.element_ref, issue.severity);
  }
  return mapa;
}

/** Czy element ma wagę problemu na progu tagu (poważny+) — dana z backendu. */
function poza(mapa: Map<string, number>, elementRef: string): boolean {
  return (mapa.get(elementRef) ?? 0) >= WAGA_PROG_TAG;
}

/**
 * Komórka wartości źródłowej (A lub B): sformatowana + `sortKey` liczbowy +
 * `dowodRef` strony (R3-C: 2×klik otwiera dowód WŁAŚCIWEGO przebiegu — patrz
 * `dowodPorownania.ts`).
 */
function komorka(
  wartosc: number,
  format: (n: number) => string,
  dowodRef: string,
): WartoscKomorki {
  return { wartosc: format(wartosc), sortKey: wartosc, dowodRef };
}

/**
 * Komórka delty: sformatowana ze znakiem + `sortKey` + tag przy wadze poważnej.
 * BEZ `dowodRef` (R3-C): różnica B−A nie ma pojedynczego wywodu WHITE BOX —
 * nie istnieje ślad „przebiegu Δ", więc delta świadomie nie otwiera dowodu.
 */
function komorkaDelty(
  wartosc: number,
  format: (n: number) => string,
  ostrzezenie: boolean,
): WartoscKomorki {
  return { wartosc: format(wartosc), sortKey: wartosc, ostrzezenie };
}

// ---------------------------------------------------------------------------
// Adaptery czyste (bez React) — fixture 1:1 z realnym kontraktem
// ---------------------------------------------------------------------------

/** `PowerFlowBusDiffRow[]` → wiersze tabeli wzorca (A · B · Δ; kolejność źródłowa). */
export function naWierszeSzynDiff(
  rows: PowerFlowBusDiffRow[],
  wagi: Map<string, number>,
): WierszTabeli[] {
  return rows.map((row) => {
    const flaga = poza(wagi, row.bus_id);
    const refA = refDowoduPorownania('A', row.bus_id);
    const refB = refDowoduPorownania('B', row.bus_id);
    return {
      szyna: { wartosc: row.bus_id },
      vA: komorka(row.v_pu_a, fmtNapiecie, refA),
      vB: komorka(row.v_pu_b, fmtNapiecie, refB),
      dV: komorkaDelty(row.delta_v_pu, fmtDeltaNapiecie, flaga),
      katA: komorka(row.angle_deg_a, fmtKat, refA),
      katB: komorka(row.angle_deg_b, fmtKat, refB),
      dKat: komorkaDelty(row.delta_angle_deg, fmtDeltaKat, flaga),
    };
  });
}

/** `PowerFlowBranchDiffRow[]` → wiersze tabeli wzorca (A · B · Δ; kolejność źródłowa). */
export function naWierszeGalezi(
  rows: PowerFlowBranchDiffRow[],
  wagi: Map<string, number>,
): WierszTabeli[] {
  return rows.map((row) => {
    const flaga = poza(wagi, row.branch_id);
    const refA = refDowoduPorownania('A', row.branch_id);
    const refB = refDowoduPorownania('B', row.branch_id);
    return {
      galaz: { wartosc: row.branch_id },
      stratyA: komorka(row.losses_p_mw_a, fmtMoc, refA),
      stratyB: komorka(row.losses_p_mw_b, fmtMoc, refB),
      dStraty: komorkaDelty(row.delta_losses_p_mw, fmtDeltaMoc, flaga),
      mocA: komorka(row.p_from_mw_a, fmtMoc, refA),
      mocB: komorka(row.p_from_mw_b, fmtMoc, refB),
      dMoc: komorkaDelty(row.delta_p_from_mw, fmtDeltaMoc, flaga),
    };
  });
}

/**
 * `PowerFlowRankingIssue[]` → wiersze tabeli wzorca. Waga → tag PL (ostrzeżenie
 * przy poważnym+); rodzaj i opis po polsku; surowy kod tylko w trybie eksperckim.
 * Klucz wiersza = indeks źródłowy (stabilny, deterministyczny przy sortowaniu).
 */
export function naWierszeRankingu(ranking: PowerFlowRankingIssue[]): WierszTabeli[] {
  return ranking.map((issue, i) => ({
    waga: {
      wartosc: wagaPL(issue.severity),
      sortKey: issue.severity,
      ostrzezenie: issue.severity >= WAGA_PROG_TAG,
    },
    rodzaj: { wartosc: rodzajProblemuPL(issue.issue_code) },
    element: { wartosc: issue.element_ref },
    opis: { wartosc: issue.description_pl },
    kodTechniczny: { wartosc: issue.issue_code },
    [KLUCZ_PROBLEM]: { wartosc: String(i) },
  }));
}

/**
 * Podsumowanie porównania jako sekcja ZAŁOŻENIA wzorca (karta §3): każda pozycja
 * niesie wartość A, wartość B i deltę RAZEM (karta §4.2). Tag „poza zakresem"
 * dopisany do delty strat, gdy backend zgłosił niezerową liczbę problemów
 * (dana z backendu — zero lokalnej oceny).
 */
export function naZalozeniaPorownania(summary: PowerFlowComparisonSummary): WierszZalozenia[] {
  const tag = summary.total_issues > 0 ? ` (${POROWNANIE_STRINGS.podsumTagOdchylenie})` : '';
  return [
    {
      etykieta: POROWNANIE_STRINGS.podsumZbieznosc,
      wartosc: `${zbieznoscPL(summary.converged_a)} · ${zbieznoscPL(summary.converged_b)}`,
    },
    {
      etykieta: POROWNANIE_STRINGS.podsumStraty,
      wartosc: `${fmtMoc(summary.total_losses_p_mw_a)} · ${fmtMoc(summary.total_losses_p_mw_b)} · Δ ${fmtDeltaMoc(summary.delta_total_losses_p_mw)}${tag}`,
      jednostka: POROWNANIE_STRINGS.jednMW,
    },
    {
      etykieta: POROWNANIE_STRINGS.podsumMaksNapiecie,
      wartosc: `Δ ${fmtDeltaNapiecie(summary.max_delta_v_pu)}`,
      jednostka: POROWNANIE_STRINGS.jednPu,
    },
    {
      etykieta: POROWNANIE_STRINGS.podsumMaksKat,
      wartosc: `Δ ${fmtDeltaKat(summary.max_delta_angle_deg)}`,
      jednostka: POROWNANIE_STRINGS.jednStopnie,
    },
    {
      etykieta: POROWNANIE_STRINGS.podsumProblemyRazem,
      wartosc: summary.total_issues,
    },
    {
      etykieta: POROWNANIE_STRINGS.podsumProblemy,
      wartosc: `${summary.critical_issues} · ${summary.major_issues} · ${summary.moderate_issues} · ${summary.minor_issues}`,
    },
    {
      etykieta: POROWNANIE_STRINGS.podsumLiczby,
      wartosc: `${summary.total_buses} · ${summary.total_branches}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Etykieta przebiegu do wyboru A/B (data + zbieżność; id tylko w eksperckim)
// ---------------------------------------------------------------------------

/**
 * Buduje polską etykietę przebiegu rozpływu dla selektora A/B. Pierwszy plan:
 * analiza (rozpływ) + data + (nazwa przypadku, gdy znana) + zbieżność.
 * `nazwaPrzypadku` pochodzi ze store'u przypadków po `study_case_id`; jej brak
 * (`null`/pominięta) daje dzisiejszą etykietę — zero zgadywania. Identyfikatory
 * (id przebiegu, id przypadku) dopisywane WYŁĄCZNIE w trybie eksperckim.
 */
export function etykietaPrzebiegu(
  run: PowerFlowRunItem,
  trybEkspercki: boolean,
  nazwaPrzypadku?: string | null,
): string {
  const zbieznosc =
    run.converged === null
      ? POROWNANIE_STRINGS.kreska
      : zbieznoscPL(run.converged);
  const czlony = [POROWNANIE_STRINGS.analizaRozplyw, fmtData(run.created_at)];
  if (nazwaPrzypadku) czlony.push(nazwaPrzypadku);
  czlony.push(zbieznosc);
  const podstawa = czlony.join(' · ');
  if (!trybEkspercki) return podstawa;
  return `${podstawa} · ${run.study_case_id} · ${run.id}`;
}
