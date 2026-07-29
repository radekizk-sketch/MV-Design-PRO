/**
 * W1b (RECENZJA_MACIERZ_WYPOSAZENIA_2026-07 uwagi 11–12) — KONTRAKTOWY RASTER
 * STOSU APARATÓW POLA. JEDNO ŹRÓDŁO PRAWDY odstępów geometrii toru pierwotnego,
 * wzorem `layout/clearances.ts` (§5 rozdzielone światła). Recenzja macierzy
 * (uwaga 12) wymaga, by ODLEGŁOŚCI pionowe między aparatami oraz odstępy od
 * szyny i kabla były STAŁYMI KONTRAKTOWYMI, nie literałami „na oko" rozsianymi
 * po rendererze — wtedy KAŻDA konfiguracja macierzy renderuje się na
 * IDENTYCZNYM rastrze, a różnice wysokości pól WYNIKAJĄ WYŁĄCZNIE z liczby
 * aparatów (uwaga 11), nie z ad-hoc odstępów.
 *
 * Wartości zachowane BAJT-IDENTYCZNIE względem stanu sprzed W1b (wszystkie
 * dotąd `GRID` inline w `compose/apparatusSequence.ts` i `compose/station.ts`,
 * odstęp aparat–szyna = `MIN_FIELD_CLEARANCE` z `clearances.ts`) — to
 * refaktoryzacja SŁOWNIKA rastru (nadanie nazw + jedno źródło), nie zmiana
 * obrazu. Zakaz dopasowania pod przykłady macierzy (uwaga 17): reguła jest
 * wyprowadzona z siatki `GRID`, nie z konkretnych 6 wariantów.
 *
 * Cztery światła kontraktowe stosu (uwaga 12):
 *  - aparat–aparat (pion)  = `APPARATUS_STACK_VERTICAL_GAP`  (ten moduł)
 *  - długość odczepu boczn.= `APPARATUS_STACK_LATERAL_TAP`   (ten moduł)
 *  - aparat–szyna (zejście)= `MIN_FIELD_CLEARANCE`           (`clearances.ts`,
 *      blok pól↔szyna; `layout/measure.ts` `STATION_BLOCK_BUS_CLEARANCE`)
 *  - aparat–kabel          = 0 (styk): głowica kablowa DOTYKA kabla portem
 *      `line` (uwaga 4 — „głowica = zakończenie kabla"); nie ma prześwitu,
 *      bo to fizyczne zakończenie toru, nie odstęp. Wpisane tu jako
 *      `APPARATUS_STACK_CABLE_TOUCH` = 0 dla jawności kontraktu (renderer
 *      NIE dodaje odstępu przed kablem).
 */

import { GRID } from '../core/grid';

/** Odstęp PIONOWY między dwoma kolejnymi aparatami toru głównego w stosie
 *  (spec §12.2, wzór F6b-1 — `stackFootprint`/`bayApparatusPlanFootprint`
 *  w `compose/apparatusSequence.ts` i `buildBayStack` w `compose/station.ts`
 *  liczą z TEJ stałej). Wartość bazowa `GRID` (byte-identyczna z W1). */
export const APPARATUS_STACK_VERTICAL_GAP = GRID;

/** Długość poziomego ODCZEPU BOCZNEGO (jog) od osi toru głównego do portu N
 *  aparatu bocznego (ES/VT/SA, spec §18.1). Dawny `LATERAL_BRANCH_GAP`
 *  (`compose/apparatusSequence.ts`) — re-home do jednego rastru. Wartość
 *  bazowa `GRID` (byte-identyczna). */
export const APPARATUS_STACK_LATERAL_TAP = GRID;

/** Prześwit aparat–kabel: 0 (STYK). Głowica kablowa jest zakończeniem kabla
 *  (uwaga 4) — jej port `line` DOTYKA kabla, więc renderer NIE wstawia
 *  odstępu przed kablem. Stała jawna, żeby kontrakt „głowica na styku kabla"
 *  był wyrażony w module rastru, nie założony milcząco w rendererze. */
export const APPARATUS_STACK_CABLE_TOUCH = 0;
