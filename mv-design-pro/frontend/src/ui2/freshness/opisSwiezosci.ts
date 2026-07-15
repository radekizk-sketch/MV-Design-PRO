/*
 * Etykieta PL świeżości danej pochodnej (E15.2) — czysta funkcja, bez zależności
 * od Reacta/store'ów/magistrali. Kontrakt: docs/uiux/karty/U1_E15_2_SWIEZOSC.md §2-3.
 *
 * Format „nieaktualne" jest IMPORTOWANY z ui2/inspector/strings.ts (`znacznikNieaktualne`)
 * — zakaz duplikowania formatu (karta §2: „importuj format etykiety ... nie duplikuj").
 * Etykieta „aktualne" analogicznie reużywa `INSPECTOR_STRINGS.aktualne` (identyczny tekst).
 */

import { INSPECTOR_STRINGS, znacznikNieaktualne } from '../inspector/strings';
import type { OpisSwiezosci } from './freshnessModel';

/** „brak wyników" — stan przed pierwszym obliczeniem (dana pochodna jeszcze nie istnieje). */
export const BRAK_WYNIKOW_LABEL = 'brak wyników';

/**
 * TODO-KARTA: rewizja danej pochodnej może być nieznana w chwili startu hooka
 * (status 'OUTDATED' z `useAppStateStore.activeCaseResultStatus` nie niesie pary
 * rewizji — patrz useSwiezoscWynikow.ts). Bez pary rewizji nie da się uczciwie
 * zbudować `znacznikNieaktualne(a, b)` (wymaga dwóch liczb) — poniższa etykieta jest
 * świadomie zdegradowanym, nie zmyślonym wariantem. Do doprecyzowania z zarządcą:
 * czy hook powinien sięgać dodatkowo po `StudyCase.revision` (ui/study-cases/types.ts),
 * aby mieć realną parę rewizji już na starcie.
 */
export const NIEAKTUALNE_BEZ_PARY_LABEL = 'nieaktualne';

/**
 * Etykieta PL dla stanu świeżości: „aktualne" / „nieaktualne (rew. a → b)" /
 * „brak wyników". Zgodna dokładnie z formatem `znacznikNieaktualne` (bez duplikacji).
 */
export function opisSwiezosci(opis: OpisSwiezosci): string {
  switch (opis.stan) {
    case 'aktualne':
      return INSPECTOR_STRINGS.aktualne;
    case 'brak':
      return BRAK_WYNIKOW_LABEL;
    case 'nieaktualne':
      return opis.rewizjaDanej === undefined
        ? NIEAKTUALNE_BEZ_PARY_LABEL
        : znacznikNieaktualne(opis.rewizjaDanej, opis.rewizjaModelu);
    default:
      return opis.stan satisfies never;
  }
}
