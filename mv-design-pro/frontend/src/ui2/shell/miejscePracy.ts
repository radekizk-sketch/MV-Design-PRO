/*
 * JEDNO źródło prawdy o MIEJSCU PRACY projektanta i o tym, komu wolno je zmienić
 * (karta S9-3, znalezisko W-3 audytu `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`).
 *
 * DEFEKT KLASY (nie instancji): nawigacja ZAPLANOWANA w chwili T0 (start
 * operacji asynchronicznej), a WYKONANA w chwili T1 ≫ T0, deptała wszystko, co
 * projektant zrobił w przedziale [T0, T1]. Zmierzony objaw W-3: po biegu klik
 * „Schemat (SLD)" montuje kanwę, a 590 ms później aplikacja SAMA wraca na
 * `#analysis?run=…` i kanwę odmontowuje — bo bieg dobiegł końca PO tym kliku
 * i wykonał odłożone `navigateToResults`. Dopiero drugi klik zostawał.
 *
 * KONTRAKT: nawigacja użytkownika ZAWSZE wygrywa z automatyczną.
 * Automatyczna nawigacja (taka, której użytkownik nie wywołał kliknięciem w tej
 * samej chwili) MUSI:
 *   1. zapamiętać miejsce pracy w chwili PODJĘCIA decyzji (`biezaceMiejscePracy`),
 *   2. wykonać się WYŁĄCZNIE przez `nawigujAutomatycznie`, który tuż przed
 *      skokiem sprawdza, czy miejsce pracy jest wciąż to samo.
 * Zmiana miejsca pracy w międzyczasie = decyzja projektanta ⇒ skok odpada.
 *
 * PREDYKATY PARAMI (reguła KLASA, NIE INSTANCJA §3): warunek WEJŚCIA (zapis
 * znacznika) i warunek WYJŚCIA (zgoda na skok) pochodzą z TEJ SAMEJ funkcji
 * `biezaceMiejscePracy()`. Dwa niezależne warunki, które „dziś się zgadzają",
 * byłyby defektem oczekującym na dane brzegowe.
 *
 * Miejsce pracy = para (przestrzeń powłoki, trasa hash) — obie prawdy już
 * istnieją (`useShellStore.activeSpace`, `getCurrentHashRoute`), więc to NIE
 * jest shadow-state: moduł ich nie duplikuje, tylko odczytuje i porównuje.
 * Porównujemy SAMĄ TRASĘ, bez parametrów zapytania: `?run=`/`?case=`/`?sel=`
 * dopisuje i czyści orkiestrator w trakcie biegu (`clearRunParamFromCurrentHash`,
 * synchronizacja selekcji), a to nie jest zmiana miejsca pracy przez człowieka.
 *
 * Warstwa: prezentacja/orkiestracja. ZERO fizyki, zero mutacji modelu.
 */

import { getCurrentHashRoute } from '../../ui/navigation';
import type { SpaceId } from './spaces';
import { useShellStore } from './useShellStore';

/** Miejsce pracy projektanta: przestrzeń powłoki + trasa (bez parametrów). */
export interface MiejscePracy {
  readonly przestrzen: SpaceId;
  readonly trasa: string;
}

/** Odczyt miejsca pracy TU I TERAZ — jedyne źródło obu predykatów. */
export function biezaceMiejscePracy(): MiejscePracy {
  return {
    przestrzen: useShellStore.getState().activeSpace,
    trasa: getCurrentHashRoute(),
  };
}

/** Czy projektant jest wciąż tam, gdzie był w chwili `znacznik`. */
export function toSamoMiejscePracy(znacznik: MiejscePracy, teraz: MiejscePracy): boolean {
  return znacznik.przestrzen === teraz.przestrzen && znacznik.trasa === teraz.trasa;
}

/**
 * Wykonuje nawigację AUTOMATYCZNĄ tylko wtedy, gdy projektant nie zmienił
 * miejsca pracy od `znacznik`. Zwraca `true`, gdy skok został wykonany —
 * wołający MUSI użyć tej odpowiedzi, aby uczciwie opisać skutek (np. nie
 * obiecywać „otwieram wyniki", kiedy wyników nie otwarto).
 *
 * Skok wykonuje się NAJWYŻEJ RAZ na znacznik: po nim bieżące miejsce pracy jest
 * inne niż zapamiętane, więc kolejne wywołanie z tym samym znacznikiem odpada.
 */
export function nawigujAutomatycznie(znacznik: MiejscePracy, nawigacja: () => void): boolean {
  if (!toSamoMiejscePracy(znacznik, biezaceMiejscePracy())) {
    return false;
  }
  nawigacja();
  return true;
}
