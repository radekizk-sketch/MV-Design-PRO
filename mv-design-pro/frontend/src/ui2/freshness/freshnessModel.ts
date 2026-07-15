/*
 * Model danych kontraktu świeżości wyników (E15.2) — hook współdzielony.
 *
 * Kontrakt (WIĄŻĄCY): docs/uiux/karty/U1_E15_2_SWIEZOSC.md §2,
 * docs/uiux/SPEC_POWIAZANIA_WARSTW_2026-07.md §3 („Każdy wynik/nakładka/raport/dowód
 * nosi rewizję modelu, z której powstał; rozjazd rewizji = widoczny znacznik
 * »nieaktualne względem modelu« + akcja »Przelicz«. Zakaz pokazywania nieaktualnego
 * wyniku bez znacznika — to reguła twarda.").
 *
 * `rewizjaDanej` jest opcjonalna: dla stanu 'brak' dana pochodna jeszcze nie istnieje
 * (nie ma rewizji, z której powstała). Może być również nieznana dla stanu 'nieaktualne'
 * przy starcie hooka, gdy jedynym dostępnym sygnałem jest status 'OUTDATED' bez pary
 * rewizji (patrz useSwiezoscWynikow.ts — TODO-KARTA).
 */

/** Stan świeżości danej pochodnej względem bieżącej rewizji modelu. */
export type StanSwiezosci = 'brak' | 'aktualne' | 'nieaktualne';

/** Opis świeżości jednej danej pochodnej (wyniku obliczeń). */
export interface OpisSwiezosci {
  stan: StanSwiezosci;
  /** Rewizja modelu, z której powstała dana pochodna (nieznana dla stanu 'brak'). */
  rewizjaDanej?: number;
  /** Bieżąca rewizja modelu (zawsze znana — 0, gdy brak projektu). */
  rewizjaModelu: number;
  /** Przyczyna nieaktualności (Case Immutability Rule: jedyna dopuszczalna przyczyna). */
  przyczyna?: 'model-zmieniony';
}
