/*
 * Znacznik świeżości wyników przy aktywnym przypadku obliczeniowym
 * (karta K4 / brak D1 audytu FLOW: inżynier widzi „wyniki nieaktualne"
 * w pasku aktywnego przypadku, nie dopiero na ekranie wyniku).
 *
 * Czysta funkcja: `StudyCase | null` → model znacznika (testowalna fixture'ami,
 * bez Reacta). Źródło prawdy: `useStudyCasesStore.activeCase` — pola
 * `result_status` (NONE|FRESH|OUTDATED) + jawna flaga `results_valid`.
 * BEZ numeru rewizji — store go nie niesie (zero fabrykacji liczb).
 * Etykiety spójne ze STATUS_WYNIKOW_LABEL (brak/aktualne/nieaktualne) —
 * spójność pilnowana testem w __tests__/znacznikSwiezosci.test.ts.
 */

import type { StudyCase, StudyCaseResultStatus } from '../../ui/study-cases/types';
import { SHELL_STRINGS } from './strings';

export interface ZnacznikSwiezosci {
  status: StudyCaseResultStatus;
  /** Etykieta chipu („Wyniki: …"). */
  etykieta: string;
  /** Tylko „nieaktualne" prowadzi do akcji (przejście do przestrzeni „Obliczenia"). */
  klikalny: boolean;
}

const ETYKIETA: Record<StudyCaseResultStatus, string> = {
  NONE: SHELL_STRINGS.resultsNone,
  FRESH: SHELL_STRINGS.resultsFresh,
  OUTDATED: SHELL_STRINGS.resultsOutdated,
};

/** Mapuje aktywny przypadek (lub jego brak) na model znacznika świeżości. */
export function znacznikSwiezosci(przypadek: StudyCase | null): ZnacznikSwiezosci {
  const status = statusWynikow(przypadek);
  return { status, etykieta: ETYKIETA[status], klikalny: status === 'OUTDATED' };
}

function statusWynikow(przypadek: StudyCase | null): StudyCaseResultStatus {
  if (przypadek == null) {
    return 'NONE';
  }
  // `results_valid` to jawna flaga kontraktu (PR-4: true wyłącznie dla FRESH).
  // Niespójna para FRESH + results_valid=false jest traktowana jako nieaktualne —
  // kierunek bezpieczny: nie ogłaszamy aktualności, której flaga zaprzecza.
  if (przypadek.result_status === 'FRESH' && !przypadek.results_valid) {
    return 'OUTDATED';
  }
  return przypadek.result_status;
}
