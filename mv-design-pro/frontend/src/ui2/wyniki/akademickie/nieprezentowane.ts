/*
 * REJESTR RODZAJÓW NIEPREZENTOWANYCH W TORZE PROJEKTANTA (karta V126-WYGASZENIE).
 *
 * DECYZJA WŁAŚCICIELA 2026-08-07: przegląd czternastu rodzajów analiz V12.6
 * wykazał rodzaj, który nie wnosi wartości do pracy projektanta — walidacja na
 * sieciach odniesienia bada, czy SOLVER odtwarza sieci wzorcowe, czyli sprawdza
 * NARZĘDZIE, a nie projekt użytkownika. Miejsce takiego sprawdzenia jest w
 * kontroli jakości, nie na ekranie wyników.
 *
 * ZDOLNOŚĆ ZOSTAJE, ZNIKA PREZENTACJA. Kontrakt backendu (`V126AnalysisType`),
 * solver, końcówki API i katalog `analysis-types` pozostają NIETKNIĘTE — wycofanie
 * dotyczy wyłącznie warstwy prezentacji. Zdolność jest dalej wykonywana i pilnowana
 * w kontroli jakości przez
 * `backend/tests/application/reference_networks/test_ieee_benchmark_wiring.py`
 * (referencje z niezależnej implementacji, wynik z naszego solvera produkcyjnego).
 *
 * DLACZEGO REJESTR, A NIE CICHE USUNIĘCIE WPISU: parytet front↔backend pilnuje
 * `backend/tests/ci/test_v126_rodzaje_parytet.py`. Gdyby rodzaj po prostu zniknął
 * z `PREZENTACJA`, strażnik trzeba by osłabić — i wtedy KAŻDY nowy rodzaj dodany
 * w backendzie mógłby po cichu wpaść do worka „nieprezentowane" bez niczyjej
 * decyzji. Dlatego zbiory są DWA i ROZŁĄCZNE, a strażnik sprawdza, że ich SUMA
 * pokrywa komplet kontraktu backendu. Rodzaj dopisany w backendzie i nieujęty
 * w żadnym z dwóch zbiorów daje czerwień — po stronie typów (`PREZENTACJA` jako
 * `Record<RodzajPrezentowany, …>` wymaga kompletu) i po stronie testu CI.
 *
 * WPIS WYMAGA POWODU MERYTORYCZNEGO — jedno zdanie mówiące, dlaczego rodzaj nie
 * służy projektantowi. „Poza zakresem karty" powodem NIE jest.
 */

import type { RodzajAnalizy } from './api';

/**
 * Rodzaje analiz kontraktu V12.6 świadomie WYCOFANE z toru projektanta.
 * Rozszerzenie tej unii jest decyzją produktową, nie porządkową — wymaga wpisu
 * z powodem w `POWODY_NIEPREZENTOWANIA` (typ wymusza to w czasie pisania kodu)
 * oraz wiersza w `docs/v12xx/REJESTR_KONFLIKTOW.md`.
 */
export type RodzajNieprezentowany = 'benchmark_validation';

/** Rodzaje analiz obecne na ekranie projektanta — dopełnienie rejestru wycofań. */
export type RodzajPrezentowany = Exclude<RodzajAnalizy, RodzajNieprezentowany>;

/**
 * Powód wycofania każdego rodzaju — jedno zdanie merytoryczne, do rejestru
 * konfliktów i do meldunku. Tekst NIE trafia na ekran: wycofany rodzaj ma
 * zniknąć bez śladu, a nie zostawić po sobie notkę (ekran ma być KRÓTSZY).
 */
export const POWODY_NIEPREZENTOWANIA: Record<RodzajNieprezentowany, string> = {
  benchmark_validation:
    'Bada, czy solver odtwarza sieci odniesienia — sprawdza narzędzie, nie projekt '
    + 'użytkownika, więc jego miejscem jest kontrola jakości, nie ekran wyników '
    + '(decyzja właściciela 2026-08-07).',
};

/** Zbiór kodów wycofanych — pochodna rejestru, nie druga lista do utrzymania. */
const KODY_NIEPREZENTOWANE: ReadonlySet<string> = new Set(
  Object.keys(POWODY_NIEPREZENTOWANIA),
);

/** Czy rodzaj o tym kodzie jest pokazywany projektantowi. */
export function rodzajPrezentowany(kod: string): boolean {
  return !KODY_NIEPREZENTOWANE.has(kod);
}

/**
 * Odsiewa rodzaje wycofane z listy odesłanej przez katalog backendu.
 * Kolejność zachowana — okno pokazuje rodzaje w kolejności kontraktu, tylko bez
 * pozycji wycofanych. Kod spoza kontraktu przechodzi (nie zgadujemy za backend).
 */
export function tylkoPrezentowane(kody: readonly string[]): readonly string[] {
  return kody.filter(rodzajPrezentowany);
}
