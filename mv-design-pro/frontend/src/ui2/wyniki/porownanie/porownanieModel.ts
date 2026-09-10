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
  RunProvenance,
} from '../../../ui/power-flow-comparison/types';
import type {
  ProtectionComparisonRow,
  ProtectionComparisonSummary,
  ProtectionRunItem,
  RankingIssue as ProtectionRankingIssue,
} from '../../../ui/protection-comparison/types';
import { STATE_CHANGE_LABELS } from '../../../ui/protection-comparison/types';
import type { DefinicjaKolumny, WartoscKomorki, WierszTabeli, WierszZalozenia } from '../wzorzec';
import { refDowoduPorownania } from './dowodPorownania';
import {
  POROWNANIE_STRINGS,
  WAGA_PROG_TAG,
  ZABEZPIECZENIA_POROWNANIE_STRINGS as ZB,
  fmtCzasZadzialania,
  fmtData,
  fmtDeltaCzasZadzialania,
  fmtDeltaKat,
  fmtDeltaMoc,
  fmtDeltaMocBierna,
  fmtDeltaNapiecie,
  fmtDeltaPradZwarciowy,
  fmtRoznicaProcentowa,
  fmtKat,
  fmtMarginesProcent,
  fmtMoc,
  fmtMocBierna,
  fmtNapiecie,
  fmtPradZwarciowy,
  rodzajProblemuPL,
  rodzajProblemuZabezpieczenPL,
  stanZadzialaniaPL,
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
  {
    klucz: 'dVproc',
    etykieta: POROWNANIE_STRINGS.kolNapiecieDProc,
    jednostka: POROWNANIE_STRINGS.jednProcent,
    mono: true,
  },
  { klucz: 'katA', etykieta: POROWNANIE_STRINGS.kolKatA, jednostka: POROWNANIE_STRINGS.jednStopnie, mono: true },
  { klucz: 'katB', etykieta: POROWNANIE_STRINGS.kolKatB, jednostka: POROWNANIE_STRINGS.jednStopnie, mono: true },
  { klucz: 'dKat', etykieta: POROWNANIE_STRINGS.kolKatD, jednostka: POROWNANIE_STRINGS.jednStopnie, mono: true },
  // Scalenie KD-1 + KD-2 (nadzorca): obie delty ADDYTYWNE do tej samej tabeli.
  {
    klucz: 'dKatProc',
    etykieta: POROWNANIE_STRINGS.kolKatDProc,
    jednostka: POROWNANIE_STRINGS.jednProcent,
    mono: true,
  },
  // L-12: moc bierna wstrzykiwana w szynie — pola `q_injected_mvar_a/b`
  // i `delta_q_mvar` ISTNIEJĄ w payloadzie backendu (`types.ts` PowerFlowBusDiffRow),
  // ekran ich dotąd nie pokazywał.
  { klucz: 'qA', etykieta: POROWNANIE_STRINGS.kolMocBiernaA, jednostka: POROWNANIE_STRINGS.jednMvar, mono: true },
  { klucz: 'qB', etykieta: POROWNANIE_STRINGS.kolMocBiernaB, jednostka: POROWNANIE_STRINGS.jednMvar, mono: true },
  { klucz: 'dQ', etykieta: POROWNANIE_STRINGS.kolMocBiernaD, jednostka: POROWNANIE_STRINGS.jednMvar, mono: true },
];

export const KOLUMNY_GALEZI: DefinicjaKolumny[] = [
  { klucz: 'galaz', etykieta: POROWNANIE_STRINGS.kolGalaz, wyrownanie: 'lewo' },
  { klucz: 'stratyA', etykieta: POROWNANIE_STRINGS.kolStratyA, jednostka: POROWNANIE_STRINGS.jednMW, mono: true },
  { klucz: 'stratyB', etykieta: POROWNANIE_STRINGS.kolStratyB, jednostka: POROWNANIE_STRINGS.jednMW, mono: true },
  { klucz: 'dStraty', etykieta: POROWNANIE_STRINGS.kolStratyD, jednostka: POROWNANIE_STRINGS.jednMW, mono: true },
  {
    klucz: 'dStratyProc',
    etykieta: POROWNANIE_STRINGS.kolStratyDProc,
    jednostka: POROWNANIE_STRINGS.jednProcent,
    mono: true,
  },
  { klucz: 'mocA', etykieta: POROWNANIE_STRINGS.kolMocA, jednostka: POROWNANIE_STRINGS.jednMW, mono: true },
  { klucz: 'mocB', etykieta: POROWNANIE_STRINGS.kolMocB, jednostka: POROWNANIE_STRINGS.jednMW, mono: true },
  { klucz: 'dMoc', etykieta: POROWNANIE_STRINGS.kolMocD, jednostka: POROWNANIE_STRINGS.jednMW, mono: true },
  // Scalenie KD-1 + KD-2 (nadzorca): Δ% mocy z backendu + moc bierna L-12.
  {
    klucz: 'dMocProc',
    etykieta: POROWNANIE_STRINGS.kolMocDProc,
    jednostka: POROWNANIE_STRINGS.jednProcent,
    mono: true,
  },
  // L-12: moc bierna gałęzi (początek) — `q_from_mvar_a/b`, `delta_q_from_mvar`.
  { klucz: 'qA', etykieta: POROWNANIE_STRINGS.kolMocBiernaGalazA, jednostka: POROWNANIE_STRINGS.jednMvar, mono: true },
  { klucz: 'qB', etykieta: POROWNANIE_STRINGS.kolMocBiernaGalazB, jednostka: POROWNANIE_STRINGS.jednMvar, mono: true },
  { klucz: 'dQ', etykieta: POROWNANIE_STRINGS.kolMocBiernaGalazD, jednostka: POROWNANIE_STRINGS.jednMvar, mono: true },
];

/**
 * Klucz React wiersza (indeks źródłowy — stabilny przy sortowaniu). Reużyty
 * przez WSZYSTKIE tryby porównania (rozpływ: ranking; zabezpieczenia: zmiany
 * stanu I ranking, karta CV-3.3-B2) — nazwa pola danych, nie semantyka
 * „problemu": jedna stała zamiast osobnej kopii tego samego napisu na tryb.
 */
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

/**
 * Komórka różnicy WZGLĘDNEJ [%] (L-13). Wartość pochodzi WYŁĄCZNIE z pola
 * backendu (`delta_*_percent`) — prezentacja nie dzieli, nie mnoży i nie
 * podstawia zera. Brak pola (odniesienie A = 0 albo porównanie sprzed L-13) →
 * kreska bez `sortKey` (wiersz bez wartości nie udaje zera przy sortowaniu).
 */
function komorkaProcentu(wartosc: number | null | undefined, ostrzezenie: boolean): WartoscKomorki {
  if (typeof wartosc !== 'number' || !Number.isFinite(wartosc)) {
    return { wartosc: POROWNANIE_STRINGS.kreska };
  }
  return { wartosc: fmtRoznicaProcentowa(wartosc), sortKey: wartosc, ostrzezenie };
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
      dVproc: komorkaProcentu(row.delta_v_percent, flaga),
      katA: komorka(row.angle_deg_a, fmtKat, refA),
      katB: komorka(row.angle_deg_b, fmtKat, refB),
      dKat: komorkaDelty(row.delta_angle_deg, fmtDeltaKat, flaga),
      dKatProc: komorkaProcentu(row.delta_angle_percent, flaga),
      qA: komorka(row.q_injected_mvar_a, fmtMocBierna, refA),
      qB: komorka(row.q_injected_mvar_b, fmtMocBierna, refB),
      dQ: komorkaDelty(row.delta_q_mvar, fmtDeltaMocBierna, flaga),
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
      dStratyProc: komorkaProcentu(row.delta_losses_p_percent, flaga),
      mocA: komorka(row.p_from_mw_a, fmtMoc, refA),
      mocB: komorka(row.p_from_mw_b, fmtMoc, refB),
      dMoc: komorkaDelty(row.delta_p_from_mw, fmtDeltaMoc, flaga),
      dMocProc: komorkaProcentu(row.delta_p_from_percent, flaga),
      qA: komorka(row.q_from_mvar_a, fmtMocBierna, refA),
      qB: komorka(row.q_from_mvar_b, fmtMocBierna, refB),
      dQ: komorkaDelty(row.delta_q_from_mvar, fmtDeltaMocBierna, flaga),
    };
  });
}

// ---------------------------------------------------------------------------
// Filtr „pokaż tylko różnice" (karta KD-1, luka L-14)
// ---------------------------------------------------------------------------

/*
 * CZYSTA PREZENTACJA: filtr NIE liczy niczego — sprawdza wyłącznie, czy pola
 * `delta_*` PODANE PRZEZ BACKEND są zerowe. Zero arytmetyki na wielkościach
 * fizycznych w UI (NOT-A-SOLVER); wiersz bez żadnej niezerowej różnicy jest
 * ukrywany, kolejność pozostałych wierszy pozostaje źródłowa (Determinism Rule).
 */

function jakakolwiekRoznica(delty: readonly number[]): boolean {
  return delty.some((d) => d !== 0);
}

/** Szyny z co najmniej jedną niezerową różnicą podaną przez backend. */
export function tylkoRozniceSzyn(rows: PowerFlowBusDiffRow[]): PowerFlowBusDiffRow[] {
  return rows.filter((row) =>
    jakakolwiekRoznica([row.delta_v_pu, row.delta_angle_deg, row.delta_p_mw, row.delta_q_mvar]),
  );
}

/** Gałęzie z co najmniej jedną niezerową różnicą podaną przez backend. */
export function tylkoRozniceGalezi(rows: PowerFlowBranchDiffRow[]): PowerFlowBranchDiffRow[] {
  return rows.filter((row) =>
    jakakolwiekRoznica([
      row.delta_p_from_mw,
      row.delta_q_from_mvar,
      row.delta_p_to_mw,
      row.delta_q_to_mvar,
      row.delta_losses_p_mw,
      row.delta_losses_q_mvar,
    ]),
  );
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
      // L-13: względna zmiana strat — wartość z backendu, brak → kreska.
      etykieta: POROWNANIE_STRINGS.podsumStratyProc,
      wartosc: `Δ ${fmtRoznicaProcentowa(summary.delta_total_losses_p_percent)}`,
      jednostka: POROWNANIE_STRINGS.jednProcent,
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
// Proweniencja biegów A/B (karta CV-3.3-B, B1/B5) — dowód CO było porównywane.
// Wyłącznie odczyt pól `RunProvenance` z odpowiedzi backendu; zero wyliczeń,
// zero interpretacji koperty — surowe wartości do panelu eksperckiego.
// ---------------------------------------------------------------------------

/** Jedna linia proweniencji do wyświetlenia w panelu eksperckim. */
export interface LiniaProweniencji {
  etykieta: string;
  wartosc: string;
}

function skrotHash(hash: string): string {
  return hash ? hash.slice(0, 12) : POROWNANIE_STRINGS.kreska;
}

/**
 * Rewizja/scenariusz z koperty biegu (`RunProvenance.envelope`) — surowy
 * odczyt bez interpretacji fizycznej. Koperta bywa `null` dla biegów sprzed
 * CV-2 (uczciwy brak, nie zero/domysł); kształt `scenario_ref` wewnątrz
 * koperty to `{scenario_id, revision}` (`enm/envelope.py::RevisionEnvelope.
 * to_dict`), inny niż krotka `[id, rewizja]` na płaskim polu listy biegów.
 */
function rewizjaZKoperty(envelope: Record<string, unknown> | null): string {
  if (!envelope) return POROWNANIE_STRINGS.kopertaBrak;
  const scenariusz = envelope['scenario_ref'];
  if (scenariusz && typeof scenariusz === 'object') {
    const rekord = scenariusz as Record<string, unknown>;
    const id = rekord['scenario_id'];
    const rewizja = rekord['revision'];
    if (typeof id === 'string' && typeof rewizja === 'number') {
      return `scenariusz ${id} rew. ${rewizja}`;
    }
  }
  const modelRev = envelope['model_revision'];
  return typeof modelRev === 'number' ? `rew. ${modelRev}` : POROWNANIE_STRINGS.kreska;
}

/**
 * `RunProvenance` → linie panelu eksperckiego (B1: dowód CO było porównywane —
 * rodzaj analizy, status, rewizja/scenariusz koperty, odciski migawki i wejścia).
 */
export function naLinieProweniencji(p: RunProvenance): LiniaProweniencji[] {
  return [
    { etykieta: POROWNANIE_STRINGS.proweniencjaRodzaj, wartosc: p.analysis_type },
    { etykieta: POROWNANIE_STRINGS.proweniencjaStatus, wartosc: p.status },
    { etykieta: POROWNANIE_STRINGS.proweniencjaRewizja, wartosc: rewizjaZKoperty(p.envelope) },
    { etykieta: POROWNANIE_STRINGS.proweniencjaOdciskModelu, wartosc: skrotHash(p.snapshot_hash) },
    { etykieta: POROWNANIE_STRINGS.proweniencjaOdciskWejscia, wartosc: skrotHash(p.input_hash) },
  ];
}

// ---------------------------------------------------------------------------
// Etykieta przebiegu do wyboru A/B (data + zbieżność; id tylko w eksperckim)
// ---------------------------------------------------------------------------

/**
 * Rewizja modelu LUB scenariusz z pól listy biegów (B5, karta CV-3.3-B) —
 * WSPÓLNA logika etykiety biegu (karta CV-3.3-B2 §0 D2: „etykieta biegu" jest
 * jednym z elementów, których nie wolno duplikować). Rozpływ (`PowerFlowRunItem`)
 * i zabezpieczenia (`ProtectionRunItem`) niosą te same trzy pola koperty
 * (`model_revision`, `scenario_ref`, `snapshot_hash`) — jedna funkcja starcza
 * obu, zamiast dwóch niezależnych kopii tego samego ternary.
 */
function rewizjaLubScenariuszBiegu(
  modelRevision: number | null,
  scenarioRef: readonly [string, number] | null,
): string {
  if (scenarioRef) return `scenariusz ${scenarioRef[0]} rew. ${scenarioRef[1]}`;
  if (typeof modelRevision === 'number') return `rew. ${modelRevision}`;
  return POROWNANIE_STRINGS.kreska;
}

/**
 * Buduje polską etykietę przebiegu rozpływu dla selektora A/B (karta E12.1,
 * rozszerzona B5/CV-3.3-B). Pierwszy plan: analiza (rozpływ) + rewizja modelu
 * albo scenariusz + krótki odcisk migawki (`snapshot_hash`) — dowód KTÓRY
 * stan modelu bieg opisuje, nie sam UUID — dalej data + (nazwa przypadku,
 * gdy znana) + zbieżność. `nazwaPrzypadku` pochodzi ze store'u przypadków po
 * `study_case_id`; jej brak (`null`/pominięta) daje etykietę bez niej — zero
 * zgadywania. Identyfikatory (id przebiegu, id przypadku) dopisywane
 * WYŁĄCZNIE w trybie eksperckim.
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
  const rewizjaLubScenariusz = rewizjaLubScenariuszBiegu(run.model_revision, run.scenario_ref);
  const skrotOdcisku = run.snapshot_hash
    ? run.snapshot_hash.slice(0, 8)
    : POROWNANIE_STRINGS.kreska;
  const czlony = [
    POROWNANIE_STRINGS.analizaRozplyw,
    rewizjaLubScenariusz,
    skrotOdcisku,
    fmtData(run.created_at),
  ];
  if (nazwaPrzypadku) czlony.push(nazwaPrzypadku);
  czlony.push(zbieznosc);
  const podstawa = czlony.join(' · ');
  if (!trybEkspercki) return podstawa;
  return `${podstawa} · ${run.study_case_id} · ${run.id}`;
}

// ---------------------------------------------------------------------------
// TRYB ZABEZPIECZEŃ (karta CV-3.3-B2) — wariant modelu BEZ duplikacji logiki
// wspólnej (koperta/rewizja: `rewizjaLubScenariuszBiegu` powyżej; proweniencja:
// `naLinieProweniencji` poniżej, strukturalnie ta sama `RunProvenance`; dowód:
// `refDowoduPorownania`/`stronaDowodu` z `dowodPorownania.ts`, generyczne).
//
// ŹRÓDŁO DANYCH — realny kontrakt (karta §2 „zero zgadywania"):
// - Wynik pełny: `ProtectionComparisonResult` (`ui/protection-comparison/types.ts`):
//   comparison_id, run_a_id, run_b_id, rows, ranking, summary, input_hash,
//   provenance_a/b, created_at. Identyczny kształt zwraca POST i GET .../results
//   (`api/protection_comparisons.py`) — ekran woła WYŁĄCZNIE POST (jak rozpływ).
// - Wiersz: `ProtectionComparisonRow` — klucz PARY (protected_element_ref,
//   fault_target_id), NIE samego elementu (inaczej niż rozpływ) — stąd osobna
//   funkcja klucza wiersza (`kluczWierszaZabezpieczen`) reużyta ZARÓWNO do
//   budowy mapy wag, JAK I do odczytu z niej (KLASA-NIE-INSTANCJA §3: predykaty
//   parami z jednego źródła prawdy, nie dwa niezależne klucze).
// - Problem rankingu: `RankingIssue` — jak wyżej, klucz PARY (element+punkt).
// - Lista przebiegów do wyboru A/B: `ProtectionRunItem`, klient `fetchProtectionRuns`
//   (`ui/protection-comparison/api.ts`) → `GET /projects/{id}/protection-runs`.
// ---------------------------------------------------------------------------

export const KOLUMNY_STANOW_ZABEZPIECZEN: DefinicjaKolumny[] = [
  { klucz: 'element', etykieta: ZB.kolElementChroniony, wyrownanie: 'lewo' },
  { klucz: 'punkt', etykieta: ZB.kolPunktZwarcia, wyrownanie: 'lewo' },
  {
    klucz: 'urzadzenieA',
    etykieta: ZB.kolUrzadzenieA,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
  {
    klucz: 'urzadzenieB',
    etykieta: ZB.kolUrzadzenieB,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
  { klucz: 'stanA', etykieta: ZB.kolStanA, wyrownanie: 'lewo' },
  { klucz: 'stanB', etykieta: ZB.kolStanB, wyrownanie: 'lewo' },
  { klucz: 'czasA', etykieta: ZB.kolCzasA, jednostka: ZB.jednS, mono: true },
  { klucz: 'czasB', etykieta: ZB.kolCzasB, jednostka: ZB.jednS, mono: true },
  { klucz: 'czasD', etykieta: ZB.kolCzasD, jednostka: ZB.jednS, mono: true },
  { klucz: 'pradA', etykieta: ZB.kolPradA, jednostka: ZB.jednA, mono: true },
  { klucz: 'pradB', etykieta: ZB.kolPradB, jednostka: ZB.jednA, mono: true },
  { klucz: 'pradD', etykieta: ZB.kolPradD, jednostka: ZB.jednA, mono: true },
  // Margines selektywności — A i B osobno, BEZ kolumny Δ (backend nie publikuje
  // `delta_margin_percent` na wierszu — patrz `fmtMarginesProcent` w strings.ts).
  { klucz: 'marginesA', etykieta: ZB.kolMarginesA, jednostka: ZB.jednProcent, mono: true },
  { klucz: 'marginesB', etykieta: ZB.kolMarginesB, jednostka: ZB.jednProcent, mono: true },
  { klucz: 'zmiana', etykieta: ZB.kolZmianaStanu, wyrownanie: 'lewo' },
];

export const KOLUMNY_RANKINGU_ZABEZPIECZEN: DefinicjaKolumny[] = [
  { klucz: 'waga', etykieta: POROWNANIE_STRINGS.kolWaga, wyrownanie: 'lewo' },
  { klucz: 'rodzaj', etykieta: POROWNANIE_STRINGS.kolRodzaj, wyrownanie: 'lewo' },
  { klucz: 'element', etykieta: POROWNANIE_STRINGS.kolElement, wyrownanie: 'lewo' },
  // Rozszerzenie względem rankingu rozpływu: problem zabezpieczeń jest
  // zakotwiczony w PARZE element+punkt zwarcia, nie samym elemencie.
  { klucz: 'punkt', etykieta: ZB.kolPunktRankingu, wyrownanie: 'lewo' },
  { klucz: 'opis', etykieta: POROWNANIE_STRINGS.kolOpis, wyrownanie: 'lewo', sortowalna: false },
  {
    klucz: 'kodTechniczny',
    etykieta: POROWNANIE_STRINGS.kolKodTechniczny,
    mono: true,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
];

/**
 * Klucz PARY (element chroniony, punkt zwarcia) — TA SAMA funkcja buduje klucz
 * mapy wag (`mapaWagWierszyZabezpieczen`) i klucz odczytu w wierszu
 * (`naWierszeStanowZabezpieczen`): jedno źródło prawdy zamiast dwóch
 * niezależnych formuł, które mogłyby się rozjechać (KLASA-NIE-INSTANCJA §3).
 */
function kluczWierszaZabezpieczen(elementRef: string, faultTargetId: string): string {
  return `${elementRef}::${faultTargetId}`;
}

/**
 * Buduje mapę (element, punkt) → maksymalna waga problemu z rankingu backendu.
 * Klucz PARY (nie samego elementu — inaczej niż `mapaWagElementow` rozpływu),
 * bo severity rankingu zabezpieczeń jest per (element, punkt zwarcia): ten sam
 * element chroniony może mieć różne wagi na różnych punktach zwarcia.
 */
export function mapaWagWierszyZabezpieczen(ranking: ProtectionRankingIssue[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const issue of ranking) {
    const klucz = kluczWierszaZabezpieczen(issue.element_ref, issue.fault_target_id);
    const poprz = mapa.get(klucz) ?? 0;
    if (issue.severity > poprz) mapa.set(klucz, issue.severity);
  }
  return mapa;
}

function pozaZabezpieczenia(mapa: Map<string, number>, elementRef: string, faultTargetId: string): boolean {
  return (mapa.get(kluczWierszaZabezpieczen(elementRef, faultTargetId)) ?? 0) >= WAGA_PROG_TAG;
}

/**
 * Komórka wartości źródłowej A/B, nullowalna (FAB-E, karta CV-3.3-B: element
 * nieobecny w jednym z biegów → `null`, nigdy fabrykowane zero). Wartość
 * obecna dostaje `dowodRef` strony (R3-C); brak wartości → kreska bez dowodu
 * (zero martwych klików — nie ma czego dowodzić).
 */
function komorkaZabezpieczen(
  wartosc: number | null,
  format: (n: number) => string,
  dowodRef: string,
): WartoscKomorki {
  return typeof wartosc !== 'number'
    ? { wartosc: ZB.kreska }
    : { wartosc: format(wartosc), sortKey: wartosc, dowodRef };
}

/**
 * Komórka delty, nullowalna (`delta_t_s`/`delta_i_fault_a` — `null`, gdy oba
 * stany nie są TRIPS). BEZ `dowodRef` (R3-C): różnica nie ma pojedynczego
 * wywodu WHITE BOX.
 */
function komorkaDeltyZabezpieczen(
  wartosc: number | null,
  format: (n: number) => string,
  ostrzezenie: boolean,
): WartoscKomorki {
  return typeof wartosc !== 'number'
    ? { wartosc: ZB.kreska }
    : { wartosc: format(wartosc), sortKey: wartosc, ostrzezenie };
}

/** `ProtectionComparisonRow[]` → wiersze tabeli wzorca (A · B · Δ; kolejność źródłowa). */
export function naWierszeStanowZabezpieczen(
  rows: ProtectionComparisonRow[],
  wagi: Map<string, number>,
): WierszTabeli[] {
  return rows.map((row, i) => {
    const flaga = pozaZabezpieczenia(wagi, row.protected_element_ref, row.fault_target_id);
    const parRef = kluczWierszaZabezpieczen(row.protected_element_ref, row.fault_target_id);
    const refA = refDowoduPorownania('A', parRef);
    const refB = refDowoduPorownania('B', parRef);
    return {
      [KLUCZ_PROBLEM]: { wartosc: String(i) },
      element: { wartosc: row.protected_element_ref },
      punkt: { wartosc: row.fault_target_id },
      urzadzenieA: { wartosc: row.device_id_a, dowodRef: refA },
      urzadzenieB: { wartosc: row.device_id_b, dowodRef: refB },
      stanA: { wartosc: stanZadzialaniaPL(row.trip_state_a), dowodRef: refA },
      stanB: { wartosc: stanZadzialaniaPL(row.trip_state_b), dowodRef: refB },
      czasA: komorkaZabezpieczen(row.t_trip_s_a, fmtCzasZadzialania, refA),
      czasB: komorkaZabezpieczen(row.t_trip_s_b, fmtCzasZadzialania, refB),
      czasD: komorkaDeltyZabezpieczen(row.delta_t_s, fmtDeltaCzasZadzialania, flaga),
      pradA: komorkaZabezpieczen(row.i_fault_a_a, fmtPradZwarciowy, refA),
      pradB: komorkaZabezpieczen(row.i_fault_a_b, fmtPradZwarciowy, refB),
      pradD: komorkaDeltyZabezpieczen(row.delta_i_fault_a, fmtDeltaPradZwarciowy, flaga),
      marginesA: komorkaZabezpieczen(row.margin_percent_a, fmtMarginesProcent, refA),
      marginesB: komorkaZabezpieczen(row.margin_percent_b, fmtMarginesProcent, refB),
      zmiana: { wartosc: STATE_CHANGE_LABELS[row.state_change] },
    };
  });
}

/**
 * Wiersze BEZ zmiany stanu (`state_change === 'NO_CHANGE'`) odfiltrowane —
 * filtr „pokaż tylko zmiany" (port funkcji ze skasowanej martwej strony
 * `ui/protection-comparison/ProtectionComparisonPage.tsx`, karta CV-3.3-B2).
 * CZYSTA PREZENTACJA: klasyfikacja pochodzi z backendu, UI niczego nie liczy.
 */
export function tylkoZmianyStanowZabezpieczen(
  rows: ProtectionComparisonRow[],
): ProtectionComparisonRow[] {
  return rows.filter((row) => row.state_change !== 'NO_CHANGE');
}

/**
 * `RankingIssue[]` (zabezpieczenia) → wiersze tabeli wzorca. Waga → tag PL
 * (`wagaPL`, reużyty z rozpływu — ta sama skala 1–5); rodzaj przez
 * `rodzajProblemuZabezpieczenPL` (mapa `ISSUE_CODE_LABELS` zabezpieczeń);
 * punkt zwarcia dołożony względem rankingu rozpływu (klucz PARY, nie
 * samego elementu). Klucz wiersza = indeks źródłowy (deterministyczny).
 */
export function naWierszeRankinguZabezpieczen(ranking: ProtectionRankingIssue[]): WierszTabeli[] {
  return ranking.map((issue, i) => ({
    waga: {
      wartosc: wagaPL(issue.severity),
      sortKey: issue.severity,
      ostrzezenie: issue.severity >= WAGA_PROG_TAG,
    },
    rodzaj: { wartosc: rodzajProblemuZabezpieczenPL(issue.issue_code) },
    element: { wartosc: issue.element_ref },
    punkt: { wartosc: issue.fault_target_id },
    opis: { wartosc: issue.description_pl },
    kodTechniczny: { wartosc: issue.issue_code },
    [KLUCZ_PROBLEM]: { wartosc: String(i) },
  }));
}

/**
 * Podsumowanie porównania zabezpieczeń jako sekcja ZAŁOŻENIA wzorca — te same
 * dwie pozycje „problemy" reużywają stringi rozpływu (`podsumProblemy(Razem)`,
 * domenowo neutralne teksty, zero duplikacji), pozostałe pozycje są WŁASNE
 * (podsumowanie zabezpieczeń nie ma zbieżności/strat/napięcia/kąta rozpływu).
 */
export function naZalozeniaPorownaniaZabezpieczen(
  summary: ProtectionComparisonSummary,
): WierszZalozenia[] {
  return [
    { etykieta: ZB.podsumPorownanRazem, wartosc: summary.total_rows },
    {
      etykieta: ZB.podsumZmianyStanu,
      wartosc: `${summary.trip_to_no_trip_count} · ${summary.no_trip_to_trip_count} · ${summary.invalid_change_count} · ${summary.no_change_count}`,
    },
    { etykieta: POROWNANIE_STRINGS.podsumProblemyRazem, wartosc: summary.total_issues },
    {
      etykieta: POROWNANIE_STRINGS.podsumProblemy,
      wartosc: `${summary.critical_issues} · ${summary.major_issues} · ${summary.moderate_issues} · ${summary.minor_issues}`,
    },
  ];
}

/**
 * Buduje polską etykietę przebiegu zabezpieczeń dla selektora A/B (karta
 * CV-3.3-B2, wzorzec `etykietaPrzebiegu` rozpływu — B5/CV-3.3-B). Pierwszy
 * plan: analiza (zabezpieczenia) + rewizja/scenariusz + krótki odcisk migawki
 * — dowód KTÓRY stan modelu bieg opisuje — dalej data + (nazwa przypadku, gdy
 * znana). BEZ segmentu zbieżności: `ProtectionRunItem` go nie niesie (ocena
 * zabezpieczeń nie ma pojęcia zbieżności solvera rozpływu/zwarcia) — uczciwe
 * pominięcie, nie fabrykacja pustego pola. Identyfikatory WYŁĄCZNIE eksperckie.
 */
export function etykietaPrzebieguZabezpieczen(
  run: ProtectionRunItem,
  trybEkspercki: boolean,
  nazwaPrzypadku?: string | null,
): string {
  const rewizjaLubScenariusz = rewizjaLubScenariuszBiegu(run.model_revision, run.scenario_ref);
  const skrotOdcisku = run.snapshot_hash
    ? run.snapshot_hash.slice(0, 8)
    : POROWNANIE_STRINGS.kreska;
  const czlony = [
    ZB.analizaZabezpieczenia,
    rewizjaLubScenariusz,
    skrotOdcisku,
    fmtData(run.created_at),
  ];
  if (nazwaPrzypadku) czlony.push(nazwaPrzypadku);
  const podstawa = czlony.join(' · ');
  if (!trybEkspercki) return podstawa;
  return `${podstawa} · ${run.study_case_id} · ${run.id}`;
}
