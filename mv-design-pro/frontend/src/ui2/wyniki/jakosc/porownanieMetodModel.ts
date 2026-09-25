/**
 * Model sekcji „Walidacja krzyżowa metod rozpływu" (karta W3-G1, aneks D2) —
 * czyste funkcje projekcji. ZERO fizyki, ZERO wołań API z tego pliku (te same
 * reguły co `zbieznosc/zbieznoscModel.ts` i `porownanie/porownanieModel.ts`).
 *
 * ŹRÓDŁA DANYCH — realne kontrakty read-only (mapowanie plik:linia):
 * - Lista przebiegów przypadku: `ExecutionRun[]` (`ui/study-cases/types.ts`) —
 *   ten sam rejestr, którego używa `jakoscModel.ts::przebiegRozplywu`.
 * - Metoda solvera per bieg: `PowerFlowTrace.solver_method`
 *   (`ui/power-flow-results/types.ts:202`, backend `enm/canonical_analysis.py:2583`)
 *   — TYLKO na śladzie, NIE na `PowerFlowResultV1` (kontrakt wyniku nie niesie
 *   metody; sprawdzone w kodzie backendu przed napisaniem tego modelu).
 * - Porównanie dwóch biegów: `PowerFlowComparisonResult`
 *   (`ui/power-flow-comparison/types.ts`) — tor P20c reużyty WPROST (dokładnie
 *   ta sama zdolność, którą aneks D2 nazywa „walidacja krzyżowa metod
 *   rozpływu"); `bus_diffs[].delta_v_pu/delta_angle_deg` liczone przez BACKEND
 *   (L-13), zero arytmetyki w tej warstwie.
 *
 * ZAKRES (rozstrzygnięcie karty §DoD 3): wyłącznie NR↔FD — GS pozostaje
 * wyborem w `ui2/spaces/obliczenia/UruchomObliczenie.tsx`, ale ta sekcja
 * krzyżowo waliduje jedną, nazwaną parę (referencja NR vs FD), jak literalnie
 * brzmi DoD karty.
 */

import type { ExecutionRun } from '../../../ui/study-cases/types';
import type { PowerFlowTrace } from '../../../ui/power-flow-results/types';
import type {
  PowerFlowBusDiffRow,
  PowerFlowComparisonSummary,
} from '../../../ui/power-flow-comparison/types';
import type { DefinicjaKolumny, NazwaObiektu, WierszTabeli, WierszZalozenia } from '../wzorzec';
import { METODY_SOLVERA_PL } from '../zbieznosc';
import { etykietaZeSlownika } from '../wzorzec/slownikWyliczen';
import { fmtData, fmtKat, fmtNapiecie } from '../porownanie';
import { JAKOSC_STRINGS as T, fmtDeltaKat, fmtDeltaNapiecie } from './strings';

/** Bieg rozpływu ZIDENTYFIKOWANY po metodzie (ślad przeczytany, metoda znana). */
export interface WynikBieguMetody {
  run: ExecutionRun;
  slad: PowerFlowTrace;
}

/**
 * Kandydaci na bieg NR/FD: zakończone przebiegi rozpływu (LOAD_FLOW/DONE) tego
 * przypadku, od NAJNOWSZEGO — wołający (komponent) pobiera ślad kolejnych
 * kandydatów, aż znajdzie najnowszy bieg każdej metody (przerywa wcześniej,
 * gdy oba już znalezione). Kolejność = ta sama konwencja co
 * `jakoscModel.ts::wybierzPrzebieg` (`runs` jest chronologicznie rosnący —
 * najnowszy jest OSTATNI).
 */
export function kandydaciRozplywuOdNajnowszego(
  runs: readonly ExecutionRun[],
): readonly ExecutionRun[] {
  return runs.filter((r) => r.analysis_type === 'LOAD_FLOW' && r.status === 'DONE').slice().reverse();
}

const etykietaMetody = (token: string | undefined): string =>
  token ? etykietaZeSlownika(METODY_SOLVERA_PL, token) : T.kreska;

const etykietaZbieznosci = (zbiezny: boolean): string => (zbiezny ? T.zbiezny : T.niezbiezny);

/** Etykieta biegu (metoda + data + krótki odcisk) — dowód KTÓRY bieg to A/B. */
export function etykietaBieguMetody(wynik: WynikBieguMetody): string {
  const idBiegu = wynik.run.id.slice(0, 8);
  return `${etykietaMetody(wynik.slad.solver_method)} · ${fmtData(wynik.run.finished_at)} · ${idBiegu}`;
}

/** Sekcja ZAŁOŻENIA: który bieg jest A (referencja NR), który B (FD), zbieżność, iteracje. */
export function naZalozeniaPorownaniaMetod(
  nr: WynikBieguMetody,
  fd: WynikBieguMetody,
): WierszZalozenia[] {
  return [
    { etykieta: T.metodyZalMetodaA, wartosc: etykietaBieguMetody(nr) },
    { etykieta: T.metodyZalMetodaB, wartosc: etykietaBieguMetody(fd) },
    {
      etykieta: T.metodyZalZbieznoscA,
      wartosc: etykietaZbieznosci(nr.slad.converged),
    },
    {
      etykieta: T.metodyZalZbieznoscB,
      wartosc: etykietaZbieznosci(fd.slad.converged),
    },
    { etykieta: T.metodyZalIteracjeA, wartosc: nr.slad.final_iterations_count },
    { etykieta: T.metodyZalIteracjeB, wartosc: fd.slad.final_iterations_count },
  ];
}

/** Kolumny tabeli delty per szyna (deklaratywne, jak reszta wzorca ekranu analizy). */
export const KOLUMNY_DELTA_SZYN: DefinicjaKolumny[] = [
  { klucz: 'szyna', etykieta: T.metodyKolSzyna, wyrownanie: 'lewo' },
  { klucz: 'vA', etykieta: T.metodyKolNapiecieA, jednostka: T.jednPu, mono: true },
  { klucz: 'vB', etykieta: T.metodyKolNapiecieB, jednostka: T.jednPu, mono: true },
  { klucz: 'dV', etykieta: T.metodyKolDeltaNapiecie, jednostka: T.jednPu, mono: true },
  { klucz: 'katA', etykieta: T.metodyKolKatA, jednostka: T.jednStopnie, mono: true },
  { klucz: 'katB', etykieta: T.metodyKolKatB, jednostka: T.jednStopnie, mono: true },
  { klucz: 'dKat', etykieta: T.metodyKolDeltaKat, jednostka: T.jednStopnie, mono: true },
];

/**
 * `PowerFlowBusDiffRow[]` → wiersze `TabelaWynikow` (A = NR, B = FD). BEZ
 * `dowodRef`: różnica między dwóch biegów nie ma jednego wywodu WHITE BOX
 * (dokładnie ta sama reguła co `porownanie/porownanieModel.ts::komorkaDelty`
 * — „delta B−A nie ma pojedynczego wywodu"); wartości bezwzględne A/B mają
 * WŁASNY dowód na ekranie „Zbieżność" tego biegu, nieadresowalny stąd bez
 * osobnego kontraktu routingu — nazwane, nie ukryte.
 */
export function naWierszeDeltaSzyn(
  bus_diffs: readonly PowerFlowBusDiffRow[],
  nazwa: NazwaObiektu,
): WierszTabeli[] {
  // Karta #145: `bus_id` rozpływu to identyfikator grafu — szynę nazywa most nazw.
  return bus_diffs.map((row) => ({
    szyna: { wartosc: nazwa(row.bus_id) },
    vA: row.v_pu_a !== null ? { wartosc: fmtNapiecie(row.v_pu_a), sortKey: row.v_pu_a } : { wartosc: T.kreska },
    vB: row.v_pu_b !== null ? { wartosc: fmtNapiecie(row.v_pu_b), sortKey: row.v_pu_b } : { wartosc: T.kreska },
    dV:
      row.delta_v_pu !== null
        ? { wartosc: fmtDeltaNapiecie(row.delta_v_pu), sortKey: row.delta_v_pu }
        : { wartosc: T.kreska },
    katA:
      row.angle_deg_a !== null
        ? { wartosc: fmtKat(row.angle_deg_a), sortKey: row.angle_deg_a }
        : { wartosc: T.kreska },
    katB:
      row.angle_deg_b !== null
        ? { wartosc: fmtKat(row.angle_deg_b), sortKey: row.angle_deg_b }
        : { wartosc: T.kreska },
    dKat:
      row.delta_angle_deg !== null
        ? { wartosc: fmtDeltaKat(row.delta_angle_deg), sortKey: row.delta_angle_deg }
        : { wartosc: T.kreska },
  }));
}

export interface PozycjaPodsumowania {
  etykieta: string;
  wartosc: string;
}

/** Podsumowanie porównania (chipy nad tabelą) — wyłącznie z `summary` backendu. */
export function naPodsumowaniePorownaniaMetod(
  summary: PowerFlowComparisonSummary,
): PozycjaPodsumowania[] {
  return [
    { etykieta: T.metodySzynRazem, wartosc: String(summary.total_buses) },
    {
      etykieta: T.metodyMaxDeltaNapiecie,
      wartosc:
        summary.max_delta_v_pu !== null
          ? `${fmtDeltaNapiecie(summary.max_delta_v_pu)} ${T.jednPu}`
          : T.kreska,
    },
    {
      etykieta: T.metodyMaxDeltaKat,
      wartosc:
        summary.max_delta_angle_deg !== null
          ? `${fmtDeltaKat(summary.max_delta_angle_deg)} ${T.jednStopnie}`
          : T.kreska,
    },
  ];
}
