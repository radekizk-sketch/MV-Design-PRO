/*
 * Znacznik świeżości wyników przy aktywnym przypadku obliczeniowym
 * (karta K4 / brak D1 audytu FLOW: inżynier widzi „wyniki nieaktualne"
 * w pasku aktywnego przypadku, nie dopiero na ekranie wyniku).
 *
 * Czysta funkcja: `StudyCase | null` + para rewizji → model znacznika
 * (testowalna fixture'ami, bez Reacta).
 *
 * DŁUG V12K-309 poz. 2 (naprawiony tutaj). Do tej pory świeżość brał wyłącznie
 * z serwerowego `result_status`, a ten zmienia się dopiero, gdy KTOŚ unieważni
 * przypadek. Edycja modelu następująca PO biegu nie przechodzi przez tę ścieżkę,
 * więc chip trwał na „Wyniki: aktualne" przy modelu, który zdążył pojechać dalej
 * (pomiar audytu: model rew. 9, wynik z rew. 8, chip „aktualne"). Kanon mówi
 * wprost: zmiana modelu unieważnia wyniki przypadku (Case Immutability Rule) —
 * więc świeżość liczy się PORÓWNANIEM REWIZJI, tym samym predykatem
 * `czyNieaktualne`, którym żyje wspólny `FreshnessBadge` ekranów analizy
 * (V12K-264). Jedno źródło predykatu, nie dwa „dziś zgodne" warunki.
 *
 * Źródła (zero fizyki i zero domysłu w UI — obie liczby pochodzą z backendu):
 * - `result_status` (NONE|FRESH|OUTDATED) + `results_valid` z
 *   `useStudyCasesStore.activeCase`,
 * - `rewizjaWyniku` — rewizja modelu, NA KTÓREJ policzono bieg
 *   (`analysis_case_context.rewizja_modelu` kontraktu przebiegu, V12K-264),
 * - `rewizjaModelu` — bieżąca rewizja migawki (`snapshot.header.revision`).
 *
 * Brak którejkolwiek rewizji NIE jest aktualnością: znacznik przechodzi wtedy
 * w stan nieustalony (patrz `StatusZnacznikaWynikow`), nigdy w „aktualne".
 * Etykiety spójne ze STATUS_WYNIKOW_LABEL (brak/aktualne/nieaktualne) —
 * spójność pilnowana testem w __tests__/znacznikSwiezosci.test.ts.
 */

import type { StudyCase, StudyCaseResultStatus } from '../../ui/study-cases/types';
import { czyNieaktualne } from '../inspector/inspectorModel';
import { SHELL_STRINGS } from './strings';

/**
 * Status chipu wyników: trzy stany serwerowe + `NIEUSTALONE` — stan chromu dla
 * sytuacji „wynik istnieje, ale nie da się rozstrzygnąć jego świeżości".
 */
export type StatusZnacznikaWynikow = StudyCaseResultStatus | 'NIEUSTALONE';

/** Para rewizji, na której opiera się werdykt świeżości. `null` = liczba nieznana. */
export interface RewizjeSwiezosci {
  /** Rewizja modelu, z której powstał wynik (kontrakt przebiegu). */
  readonly rewizjaWyniku: number | null;
  /** Bieżąca rewizja modelu (migawka). */
  readonly rewizjaModelu: number | null;
}

export interface ZnacznikSwiezosci {
  status: StatusZnacznikaWynikow;
  /** Etykieta chipu („Wyniki: …"). */
  etykieta: string;
  /** Tylko „nieaktualne" prowadzi do akcji (przejście do przestrzeni „Obliczenia"). */
  klikalny: boolean;
}

const ETYKIETA: Record<StatusZnacznikaWynikow, string> = {
  NONE: SHELL_STRINGS.resultsNone,
  FRESH: SHELL_STRINGS.resultsFresh,
  OUTDATED: SHELL_STRINGS.resultsOutdated,
  NIEUSTALONE: SHELL_STRINGS.resultsUnknown,
};

/** Mapuje aktywny przypadek (lub jego brak) + parę rewizji na model znacznika. */
export function znacznikSwiezosci(
  przypadek: StudyCase | null,
  rewizje: RewizjeSwiezosci,
): ZnacznikSwiezosci {
  const status = statusWynikow(przypadek, rewizje);
  return { status, etykieta: ETYKIETA[status], klikalny: status === 'OUTDATED' };
}

function statusWynikow(
  przypadek: StudyCase | null,
  rewizje: RewizjeSwiezosci,
): StatusZnacznikaWynikow {
  if (przypadek == null || przypadek.result_status === 'NONE') {
    // Nie ma wyniku — nie ma czego porównywać z rewizją modelu.
    return 'NONE';
  }
  if (przypadek.result_status === 'OUTDATED') {
    return 'OUTDATED';
  }
  // `results_valid` to jawna flaga kontraktu (PR-4: true wyłącznie dla FRESH).
  // Niespójna para FRESH + results_valid=false jest traktowana jako nieaktualne —
  // kierunek bezpieczny: nie ogłaszamy aktualności, której flaga zaprzecza.
  if (!przypadek.results_valid) {
    return 'OUTDATED';
  }
  // Serwer twierdzi „aktualne" — ale ostatnie słowo ma porównanie rewizji.
  const { rewizjaWyniku, rewizjaModelu } = rewizje;
  if (rewizjaWyniku === null || rewizjaModelu === null) {
    // BRAK KONTRAKTU (zgłoszony w meldunku karty): bez pary rewizji świeżość
    // jest nierozstrzygalna. Uczciwe „nieustalone" zamiast wygodnego „aktualne".
    return 'NIEUSTALONE';
  }
  return czyNieaktualne(rewizjaWyniku, rewizjaModelu) ? 'OUTDATED' : 'FRESH';
}
