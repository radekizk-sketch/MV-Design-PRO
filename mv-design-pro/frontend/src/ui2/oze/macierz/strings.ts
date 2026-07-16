/*
 * Teksty i deterministyczne formatery okna „Macierz wymogów NC RfG per moduł"
 * (karta P39 / rejestr W-614) — wyłącznie polski język techniczny pierwszoplanowy
 * (MODEL_INTERAKCJI §2.7). Identyfikatory techniczne (odcisk deterministyczny,
 * odwołania śladu) pokazywane WYŁĄCZNIE w trybie eksperckim, jako wyrażenia z
 * danych. Formatery są CZYSTE (wejście→wyjście), bez `Date.now`/losowości
 * (Determinism Rule); przecinek dziesiętny zgodnie z konwencją PL.
 *
 * Werdykty są WYŁĄCZNIE odwzorowaniem odpowiedzi solvera — warstwa nie ocenia
 * niczego samodzielnie (NOT-A-SOLVER). Wzór etykiet: `VERDICT_LABELS`
 * (ui/workspace/surfaces/NcRfgTestsTab.tsx:108-113).
 */

import type { NcRfgVerdict } from '../../../ui/ncrfg-tests/api';
import type { PochodzenieDanej, PowodBlokady } from './macierzModel';

export const MACIERZ_STRINGS = {
  // Nagłówek
  tytul: 'Macierz wymogów NC RfG per moduł',
  podtytul:
    'Zbiorcza ocena zgodności PTPiREE dla wszystkich modułów wytwórczych projektu naraz.',
  operator: 'Operator sieci',
  wersjaProcedury: 'Wersja procedury',
  odcisk: 'Odcisk deterministyczny',
  przeprowadz: 'Przeprowadź testy zgodności',
  wTrakcie: 'Trwają testy zgodności…',

  // Stan pusty / błędy
  brakModulow: 'Brak modułów wytwórczych do oceny',
  brakModulowOpis:
    'Dodaj układ PV, magazyn energii albo farmę wiatrową z katalogu urządzeń, a następnie ' +
    'przypisz moc, punkt przyłączenia i profil operatora. Ocena zgodności jest ' +
    'niedostępna bez danych wejściowych — to nie jest błąd solvera, tylko brak modelu.',
  brakBiegu: 'Nie przeprowadzono jeszcze testów',
  brakBieguOpis:
    'Wybierz operatora i użyj przycisku „Przeprowadź testy zgodności", aby wypełnić macierz werdyktami.',
  bladBiegu: 'Nie udało się przeprowadzić testów zgodności',
  bladKatalogu: 'Nie udało się pobrać katalogu wymogów procedury',

  // Macierz
  naglowekTestu: 'Wymóg / test',
  legenda: 'Legenda werdyktów',
  kolMoc: 'Moc',
  kolNapiecie: 'Napięcie przyłączenia',
  kolStatus: 'Status modułu',
  brakWyniku: 'brak wyniku',
  niePrzeprowadzono: 'nie przeprowadzono',

  // Podsumowania
  podsumowanieProjektu: 'Podsumowanie projektu',
  moduly: 'Moduły',
  moduleZgodne: 'zgodne',
  moduleNiezgodne: 'niezgodne',
  moduleBrakDanych: 'brak danych',
  wymogiSpelnione: 'Spełnione wymagane',
  perModul: 'Spełnione / wymagane',

  // Szczegół werdyktu
  szczegolTytul: 'Szczegół werdyktu',
  szczegolWybierz: 'Wybierz komórkę macierzy, aby zobaczyć uzasadnienie, metryki i akcje naprawcze.',
  uzasadnienie: 'Uzasadnienie',
  wymaganie: 'Podstawa wymagania',
  metryki: 'Metryki',
  akcjeNaprawcze: 'Akcje naprawcze',
  slad: 'Ślad obliczeń',
  otworzSlad: 'Pokaż ślad obliczeń',
  ukryjSlad: 'Ukryj ślad obliczeń',
  sladPusty: 'Bieg nie zawiera kroków śladu dla tego testu.',
  sladWzor: 'Wzór',
  sladDane: 'Dane wejściowe',
  sladPodstawienie: 'Podstawienie',
  sladWynik: 'Wynik',
  sladJednostki: 'Weryfikacja jednostek',
  brakMetryk: 'Brak metryk dla tego wymogu.',
  brakAkcji: 'Brak akcji naprawczych — wymóg spełniony lub niewymagany.',

  // Panel modułu
  panelTytul: 'Dane wejściowe modułu',
  panelOpis:
    'Zdolności wstępne pochodzą z katalogu urządzenia (tylko do odczytu). Wartości zmienione ' +
    'ręcznie są oznaczone jako deklarowane i nie modyfikują modelu sieci.',
  zdolnosci: 'Zdolności techniczne',
  parametry: 'Parametry nastaw',
  brakNapiecia:
    'Brak danych: napięcie przyłączenia. Uzupełnij poziom napięcia szyny/pola przyłączenia w karcie źródła — moduł nie zostanie objęty biegiem bez tej danej.',
  brakMocy:
    'Brak danych: katalogowa moc znamionowa. Wybierz urządzenie z katalogu — moduł nie zostanie objęty biegiem bez tej danej.',
  przywrocKatalog: 'Przywróć z katalogu',
} as const;

/** Etykiety werdyktów (wzór VERDICT_LABELS, NcRfgTestsTab.tsx:108-113). */
export const ETYKIETY_WERDYKTU: Record<NcRfgVerdict, string> = {
  pass: 'spełniony',
  fail: 'niespełniony',
  no_data: 'brak danych',
  not_required: 'niewymagany',
};

/** Klasa CSS statusu werdyktu (kolory wyłącznie przez tokeny --mvd-*). */
export const KLASA_WERDYKTU: Record<NcRfgVerdict, string> = {
  pass: 'mvd-oze-werdykt-ok',
  fail: 'mvd-oze-werdykt-err',
  no_data: 'mvd-oze-werdykt-warn',
  not_required: 'mvd-oze-werdykt-neutralny',
};

/** Etykiety statusu całego modułu (wartości z NcRfgModuleResult.overall_status). */
export const ETYKIETY_STATUSU_MODULU: Record<string, string> = {
  zgodny: 'zgodny',
  niezgodny: 'niezgodny',
  brak_danych: 'brak danych',
};

/** Etykiety pochodzenia danej (trzy jawne źródła — uczciwość danych). */
export const ETYKIETY_POCHODZENIA: Record<PochodzenieDanej, string> = {
  model: 'z modelu',
  katalog: 'z katalogu',
  deklarowane: 'dane deklarowane',
};

/** Etykiety powodu blokady modułu (jawny stan braku danych, bez zgadywania). */
export const ETYKIETY_BLOKADY: Record<PowodBlokady, string> = {
  brak_napiecia: 'brak danych: napięcie przyłączenia',
  brak_mocy: 'brak danych: moc znamionowa',
};

/** Deterministyczny format liczby z przecinkiem dziesiętnym (PL). */
export function formatLiczba(value: number, miejsca = 2): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(miejsca).replace('.', ',').replace(/,00$/, '');
}

/** Format mocy [kW] → prezentacja w kW lub MW gdy ≥ 1000 kW. */
export function formatMoc(kw: number | null): string {
  if (kw === null || !Number.isFinite(kw)) return '—';
  if (kw >= 1000) return `${formatLiczba(kw / 1000, 3)} MW`;
  return `${formatLiczba(kw, 1)} kW`;
}

/** Format napięcia [kV]. */
export function formatNapiecie(kv: number | null): string {
  if (kv === null || !Number.isFinite(kv)) return '—';
  return `${formatLiczba(kv, 2)} kV`;
}

/** Deterministyczny podpis metryki (klucz → wartość) — bez interpretacji. */
export function opiszMetryke(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return formatLiczba(value, 3);
  if (typeof value === 'boolean') return value ? 'tak' : 'nie';
  return String(value);
}
