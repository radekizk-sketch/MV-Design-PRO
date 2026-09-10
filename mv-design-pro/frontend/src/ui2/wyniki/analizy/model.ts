/**
 * Widoki klasyczne mostu osiągalne z warsztatu Wyników (karta B-02 / W3-E).
 *
 * Hub „Analizy techniczne" (E-35, `EkranAnalizTechnicznych`) ZSZEDŁ z ekranu:
 * jego tor pracy (projekt → wariant → wersja układu → obliczenie) stał się
 * nagłówkiem PODSTAWA OCENY ekranu „Ocena techniczna wyników", a jego karty
 * analiz z realnym dostawcą ui2 (E-29…E-34) są zakładkami obszarów nawigacji
 * warsztatu. Zostają WYŁĄCZNIE powierzchnie, które nadal żyją w moście i nie
 * mają odpowiednika ui2 — ten rejestr jest ich jedyną listą (jedno źródło dla
 * nawigacji obszaru „Widoki klasyczne" i dla widoku domyślnego zakładki).
 * Zero fizyki, zero pobrań — czyste dane nawigacji.
 */

import type { WorkspaceSurfaceCode } from '../../../ui/workspace/types';
import { ANALYSIS_SURFACE_SCREEN_CODE } from '../../../ui/workspace/types';

export interface WidokKlasyczny {
  /** Kanoniczny kod powierzchni mostu. */
  readonly ekran: WorkspaceSurfaceCode;
  /** Jawna zakładka powierzchni analiz E-35 (`compare`/`trace`/`ncrfg-tests`). */
  readonly tabId?: 'compare' | 'trace' | 'ncrfg-tests';
  readonly tytul: string;
  /** Jedno zdanie inżynierskie: co ten widok daje. */
  readonly opis: string;
  readonly testid: string;
}

export const WIDOKI_KLASYCZNE: readonly WidokKlasyczny[] = [
  {
    ekran: 'E-27',
    tytul: 'Zabezpieczenia i automatyka',
    opis: 'Przegląd zabezpieczeń pól i automatyki sieciowej (SPZ/SZR/SCO/FDIR): co jest skonfigurowane, gdzie są braki i gdzie się to edytuje.',
    testid: 'mvd-analizy-karta-zabezpieczenia',
  },
  {
    ekran: 'E-28',
    tytul: 'Koordynacja zabezpieczeń (widok klasyczny)',
    opis: 'Krzywe czasowo-prądowe zabezpieczeń na tle prądów zwarciowych — dobór nastaw i selektywność w widoku klasycznym; nowe okno: obszar „Zwarcia i zabezpieczenia" › „Koordynacja zabezpieczeń".',
    testid: 'mvd-analizy-karta-koordynacja',
  },
  {
    ekran: ANALYSIS_SURFACE_SCREEN_CODE,
    tabId: 'compare',
    tytul: 'Porównanie przebiegów (widok klasyczny)',
    opis: 'Zestawienie dwóch przebiegów obliczeń w widoku klasycznym; nowe okno: obszar „Ocena i przegląd" › „Porównanie A/B".',
    testid: 'mvd-analizy-klasyczne-porownanie',
  },
  {
    ekran: ANALYSIS_SURFACE_SCREEN_CODE,
    tabId: 'trace',
    tytul: 'Ślad obliczeń (widok klasyczny)',
    opis: 'Zapis toku obliczeń przebiegu w widoku klasycznym; nowe okno: obszar „Ocena i przegląd" › „Dowód obliczeń".',
    testid: 'mvd-analizy-klasyczne-slad',
  },
  {
    ekran: ANALYSIS_SURFACE_SCREEN_CODE,
    tabId: 'ncrfg-tests',
    tytul: 'Testy NC RfG (widok klasyczny)',
    opis: 'Badania zgodności NC RfG w widoku klasycznym; nowe okno: obszar „OZE i przyłączenia" › „Zgodność NC RfG".',
    testid: 'mvd-analizy-klasyczne-ncrfg',
  },
];

/**
 * Czy aktywna powierzchnia to dawny hub E-35 (widok domyślny zakładki) — wtedy
 * zakładka pokazuje rejestr widoków klasycznych, nie router.
 */
export function jestDawnymHubem(
  surface: { screenCode: string; tabId: string | null } | null,
): boolean {
  if (!surface) return true;
  return (
    surface.screenCode === ANALYSIS_SURFACE_SCREEN_CODE
    && (surface.tabId == null || surface.tabId === 'results')
  );
}
