/*
 * Znacznik świeżości wyników przy aktywnym przypadku obliczeniowym
 * (karta K4 / brak D1 audytu FLOW: inżynier widzi „wyniki nieaktualne"
 * w pasku aktywnego przypadku, nie dopiero na ekranie wyniku).
 *
 * Czysta funkcja: `StudyCase | null` → model znacznika (testowalna fixture'ami,
 * bez Reacta, bez zapytań).
 *
 * CO SIĘ TU ZMIENIŁO I DLACZEGO (CV-2-W). Wcześniej chip liczył świeżość SAM:
 * brał serwerowy `result_status`, a potem NADPISYWAŁ go własnym porównaniem pary
 * rewizji (rewizja ostatniego zakończonego biegu z kontraktu przebiegu vs rewizja
 * migawki), bo serwerowy status zmieniał się dopiero, gdy KTOŚ unieważnił
 * przypadek — a edycja modelu po biegu przez tę ścieżkę nie przechodziła. Były to
 * DWIE PRAWDY o jednym stanie: chip i ekran wyniku mogły powiedzieć co innego, a
 * przy nieznanej rewizji chip wchodził w stan „nieustalone", którego backend
 * nigdy nie orzekł.
 *
 * Teraz status wyników przypadku jest WYPROWADZANY po stronie backendu z jego
 * biegów i koperty rewizji (`application/study_case/status_wynikow.py`), więc chip
 * ma dokładnie jedno źródło: werdykt serwera. Razem ze statusem przychodzi
 * PRZYCZYNA po polsku (`result_status_reason_pl`) i lista zmian, które unieważniły
 * wynik (`zmiany_od_biegu`) — UI ich nie tłumaczy i nie uzupełnia (zero fizyki,
 * zero domysłu w prezentacji).
 *
 * Etykiety spójne ze STATUS_WYNIKOW_LABEL (brak/aktualne/nieaktualne) —
 * spójność pilnowana testem w __tests__/znacznikSwiezosci.test.ts.
 */

import type {
  StudyCase,
  StudyCaseResultStatus,
  ZmianaOdBiegu,
} from '../../ui/study-cases/types';
import { SHELL_STRINGS } from './strings';

/** Status chipu wyników — dokładnie słownik kontraktu HTTP, bez stanów własnych UI. */
export type StatusZnacznikaWynikow = StudyCaseResultStatus;

export interface ZnacznikSwiezosci {
  status: StatusZnacznikaWynikow;
  /** Etykieta chipu („Wyniki: …"). */
  etykieta: string;
  /**
   * Zdanie z backendu wyjaśniające status (`result_status_reason_pl`) — jedyne
   * źródło tekstu przyczyny; `null` gdy nie ma przypadku, o którym można coś
   * powiedzieć.
   */
  przyczynaPl: string | null;
  /** Rewizja modelu, na której policzono wynik (`null` = brak wyniku). */
  rewizjaBiegu: number | null;
  /** Bieżąca rewizja modelu (`null` = model przypadku niedostępny). */
  rewizjaModelu: number | null;
  /** Które zmiany unieważniły wynik — z backendu, puste dla FRESH i NONE. */
  zmiany: readonly ZmianaOdBiegu[];
  /** Tylko „nieaktualne" prowadzi do akcji (przejście do przestrzeni „Obliczenia"). */
  klikalny: boolean;
}

const ETYKIETA: Record<StatusZnacznikaWynikow, string> = {
  NONE: SHELL_STRINGS.resultsNone,
  FRESH: SHELL_STRINGS.resultsFresh,
  OUTDATED: SHELL_STRINGS.resultsOutdated,
};

/** Mapuje aktywny przypadek (lub jego brak) na model znacznika. */
export function znacznikSwiezosci(przypadek: StudyCase | null): ZnacznikSwiezosci {
  if (przypadek == null) {
    // Brak przypadku to brak wyniku — nie ma o czym orzekać ani czego tłumaczyć.
    return {
      status: 'NONE',
      etykieta: ETYKIETA.NONE,
      przyczynaPl: null,
      rewizjaBiegu: null,
      rewizjaModelu: null,
      zmiany: [],
      klikalny: false,
    };
  }
  const status = przypadek.result_status;
  return {
    status,
    etykieta: ETYKIETA[status],
    przyczynaPl: przypadek.result_status_reason_pl,
    rewizjaBiegu: przypadek.rewizja_biegu,
    rewizjaModelu: przypadek.rewizja_biezaca,
    zmiany: przypadek.zmiany_od_biegu,
    klikalny: status === 'OUTDATED',
  };
}
