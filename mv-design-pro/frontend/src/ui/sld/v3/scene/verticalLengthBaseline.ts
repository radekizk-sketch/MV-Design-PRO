/**
 * Baseline sondy `vertical_length_probe` (spec §15.1) — JEDNO źródło prawdy.
 *
 * DEFEKT, KTÓRY TEN MODUŁ ZAMYKA (plan naprawy §8; przyczyna czerwieni workflow
 * „SLD Determinism Guards" na gałęzi audytu). Ta sama liczba żyła w DWÓCH
 * miejscach: w teście kontraktowym `scene/__tests__/buildScene.test.ts` i w
 * skrypcie render-odbioru `scripts/sld_v3_acceptance.mjs`. Po zmianie
 * „LV DOMAIN PROJECTION" (2026-09-01) zaktualizowano WYŁĄCZNIE test —
 * 21064/37272/37272 → 22672/45656/45656 — a skrypt odbioru został przy
 * 22440/39448/39448. CI było od tego dnia czerwone, choć oba pomiary opisywały
 * ten sam, poprawnie zmierzony układ.
 *
 * To jest ta sama klasa defektu, którą kanon repo nazywa wprost: dwie listy,
 * które „dziś się zgadzają", rozjeżdżają się przy pierwszej zmianie. Dlatego
 * baseline jest tu RAZ, a oba konsumenty go importują.
 *
 * CO OZNACZA TA LICZBA. Sumę długości pionowych odcinków sceny na fixturze
 * referencyjnej `sldSubstrate52s`, per LOD. Reguła §15.1 jest NIE-ROSNĄCA i
 * MIĘKKA: spadek jest pożądany, wzrost dozwolony wyłącznie wtedy, gdy niesie
 * NOWĄ TREŚĆ ELEKTRYCZNĄ rysunku i jest uzasadniony pomiarem — historia takich
 * podniesień jest prowadzona w komentarzu przy teście kontraktowym.
 *
 * OSTATNIA ZMIANA (LV DOMAIN PROJECTION, po B-02, 2026-09-01): każda stacja z
 * transformatorem dostaje na zacisku nN pion portalu domeny nN
 * (`#lv-portal-drop`) — jawna granica projekcji SN/nN, treść elektryczna, nie
 * kosmetyka. Rezerwacja pasma B4 obejmuje portal także dla stacji bez odbioru
 * i bez DER, co wydłuża piony międzywierszowe na L1/L2.
 */
export const VERTICAL_LENGTH_BASELINE: Readonly<Record<0 | 1 | 2, number>> = {
  0: 22672,
  1: 45656,
  2: 45656,
};
