/**
 * Model generatora raportu w powloce ui2 (karta KD-4, luka L-15). Czyste dane
 * i czyste selektory — ZERO fizyki, ZERO wolan API z tego pliku.
 *
 * Kazda opcja skladu mapuje 1:1 na parametr eksportu backendu
 * (`normalize_report_options` w `api/analysis_run_exports.py`), wystawiony po
 * HTTP w tej samej karcie. Kontrolka bez pokrycia w backendzie bylaby phantomem,
 * dlatego listy ponizej sa lustrem ZAMKNIETYCH unii kontraktu, a nie wlasnym
 * pomyslem prezentacji.
 */

import type { ExecutionRun } from '../../../../ui/study-cases/types';
import { ANALYSIS_TYPE_LABELS } from '../../../../ui/study-cases/types';
import { POZIOM_PL, PROFILE_PL, SEKCJA_PL, ZAKRES_PL } from './strings';

export type ProfilRaportu = keyof typeof PROFILE_PL;
export type PoziomSzczegolowosci = keyof typeof POZIOM_PL;
export type ZakresRaportu = keyof typeof ZAKRES_PL;
export type SekcjaRaportu = keyof typeof SEKCJA_PL;

/** Pozycja listy wyboru (wartosc kontraktu + etykieta PL). */
export interface OpcjaWyboru<T extends string> {
  readonly wartosc: T;
  readonly etykieta: string;
}

function opcje<T extends string>(mapa: Readonly<Record<T, string>>): readonly OpcjaWyboru<T>[] {
  return (Object.keys(mapa) as T[]).map((wartosc) => ({ wartosc, etykieta: mapa[wartosc] }));
}

export const PROFILE_OPCJE = opcje<ProfilRaportu>(PROFILE_PL);
export const POZIOM_OPCJE = opcje<PoziomSzczegolowosci>(POZIOM_PL);
export const ZAKRES_OPCJE = opcje<ZakresRaportu>(ZAKRES_PL);
export const SEKCJA_OPCJE = opcje<SekcjaRaportu>(SEKCJA_PL);

/** Domyslny sklad = domyslne backendu (brak parametrow => zachowanie sprzed KD-4). */
export const DOMYSLNY_PROFIL: ProfilRaportu = 'osd';
export const DOMYSLNY_POZIOM: PoziomSzczegolowosci = 'standardowy';
export const DOMYSLNY_ZAKRES: ZakresRaportu = 'whole_run';

const STATUS_ZAKONCZONY = 'DONE';

/**
 * Przebiegi, z ktorych DA SIE zlozyc raport: wylacznie zakonczone. Kolejnosc
 * deterministyczna — najnowszy pierwszy (data zakonczenia, w razie remisu
 * identyfikator), zeby lista nie skakala miedzy renderami.
 */
export function przebiegiDoRaportu(runs: readonly ExecutionRun[]): readonly ExecutionRun[] {
  return runs
    .filter((r) => r.status === STATUS_ZAKONCZONY)
    .slice()
    .sort((a, b) => {
      const da = String(a.finished_at ?? a.started_at ?? '');
      const db = String(b.finished_at ?? b.started_at ?? '');
      if (da !== db) return db.localeCompare(da);
      return a.id.localeCompare(b.id);
    });
}

/** Etykieta przebiegu w liscie wyboru: rodzaj analizy + data zakonczenia. */
export function etykietaPrzebiegu(run: ExecutionRun): string {
  const rodzaj =
    ANALYSIS_TYPE_LABELS[run.analysis_type as keyof typeof ANALYSIS_TYPE_LABELS]
    ?? run.analysis_type;
  const data = String(run.finished_at ?? run.started_at ?? '').slice(0, 16).replace('T', ' ');
  return data ? `${rodzaj} · ${data}` : rodzaj;
}

/**
 * Wybrany przebieg: preferuj aktywny (jesli zakonczony), inaczej pierwszy z
 * listy. `null` = brak zakonczonego obliczenia (uczciwy stan zerowy z akcja).
 */
export function domyslnyPrzebieg(
  dostepne: readonly ExecutionRun[],
  aktywnyRunId: string | null,
): string | null {
  if (aktywnyRunId && dostepne.some((r) => r.id === aktywnyRunId)) return aktywnyRunId;
  return dostepne[0]?.id ?? null;
}
