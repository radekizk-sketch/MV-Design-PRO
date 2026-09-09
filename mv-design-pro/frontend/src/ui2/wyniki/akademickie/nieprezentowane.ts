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
 * `backend/tests/golden/parytet_benchmarkow/test_ieee_benchmark_wiring.py`
 * (przeniesiony z `tests/application/reference_networks/` kartą K2, 2026-09-09;
 * referencje z niezależnej implementacji, wynik z naszego solvera produkcyjnego).
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
export type RodzajNieprezentowany =
  | 'benchmark_validation'
  | 'voltage_stability'
  | 'hosting_capacity'
  | 'opf_loss_lcc';

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
  voltage_stability:
    'Solver nie wyznacza już żadnej wielkości tej analizy: wszystkie stały na mocy '
    + 'zwarciowej węzła, którą podstawiał z napięcia znamionowego (pomiar: pole podane '
    + 'dla 1 z 315 szyn sieci odniesienia), oraz na współczynnikach bez pokrycia '
    + 'w danych i w normie — zapas mocy biernej z krotności mocy czynnej, margines P–U '
    + 'ze sztywności węzła, wskaźnik L z mnożnika 4. Ekran nie ma czego pokazać, '
    + 'dopóki wielkości nie zostaną policzone rozpływem na modelu przypadku '
    + '(karta QU-FABRYKACJA, 2026-08-08).',
  // Karta W3-E (2026-09-09, KARTA_W3 §0 rodzina D): duplikuje kanon
  // `application/analyses/hosting_capacity.py` (`GET /api/oze-analysis/
  // hosting-capacity`, ekran „OZE › Zdolność przyłączeniowa"), który liczy
  // PEŁNYM ROZPŁYWEM przez wariant sieci. Solver V12.6 liczy lokalną
  // impedancję Thevenina per szyna metodą Monte Carlo — BEZ sprzężenia
  // sieci (sąsiednie szyny nie wpływają na wynik danej szyny), więc nie
  // widzi ograniczeń narzuconych przez resztę sieci. Zdolność solwera
  // zostaje (410 na POST z odesłaniem do kanonu, historyczne biegi
  // odtwarzalne z polem `wycofany`).
  hosting_capacity:
    'Lokalna impedancja Thevenina per szyna, metodą Monte Carlo — BEZ sprzężenia '
    + 'sieci, więc wynik jednej szyny nie widzi ograniczeń narzuconych przez resztę '
    + 'sieci. Kanon liczy PEŁNYM ROZPŁYWEM przez wariant sieci: ekran '
    + '„OZE › Zdolność przyłączeniowa" (GET /api/oze-analysis/hosting-capacity).',
  // Karta W3-E: duplikuje DWA kanony naraz — straty transformatorów liczone
  // z β RZECZYWISTEGO karty katalogowej (`POST /api/solver/transformer-losses`,
  // ekran „Kryteria › Wyposażenie", solver V12.6 ma β = 0,45 ZASZYTE) oraz
  // optymalizację zaczepu OLTC (badania OLTC, ekran „Wyniki › OLTC", solver
  // V12.6 ma zaczep 0 ZAWSZE, `decision_variables.oltc_tap_position` nigdy
  // się nie zmienia). Prąd gałęzi liczony z obciążenia JEDNEJ szyny docelowej
  // (`_branch_current_a`), nie z rozpływu. Koszt cyklu życia (LCC) nie ma dziś
  // kanonu — ekonomia jest decyzją właściciela poza tą kartą.
  opf_loss_lcc:
    'β = 0,45 zaszyte (kanon czyta β rzeczywisty z karty katalogowej), zaczep OLTC '
    + 'zawsze 0 (kanon optymalizuje zaczep), prąd gałęzi z obciążenia jednej szyny '
    + '(nie z rozpływu). Kanon strat: ekran „Kryteria › Wyposażenie" '
    + '(POST /api/solver/transformer-losses); kanon zaczepu: ekran „Wyniki › OLTC".',
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
