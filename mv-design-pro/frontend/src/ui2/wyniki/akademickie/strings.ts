/*
 * Teksty okna „Analizy akademickie" (ui2/wyniki/akademickie). Wyłącznie polski
 * język techniczny; zero literałów UI w JSX. Formatery są CZYSTE (wejście→wyjście),
 * bez `Date.now`/losowości (Determinism Rule).
 *
 * `ETYKIETY_RODZAJOW` pokrywa KOMPLET kontraktu `V126AnalysisType` — typ `Record<
 * RodzajAnalizy, …>` wymusza to w czasie kompilacji, a test CI
 * `backend/tests/ci/test_v126_rodzaje_parytet.py` pilnuje drugiego końca pary:
 * rodzaj dodany w backendzie bez etykiety tutaj = czerwony test.
 */

import type { RodzajAnalizy } from './api';

/** Poziom istotności statusu (dobór koloru chipu — wyłącznie prezentacja). */
export type IstotnoscStanu = 'ok' | 'warn' | 'err' | 'neutral';

/** Etykiety PL rodzajów analiz (kod kontraktu → nazwa inżynierska). */
export const ETYKIETY_RODZAJOW: Record<RodzajAnalizy, string> = {
  power_quality_harmonics: 'Jakość energii i harmoniczne',
  ssci_impedance: 'Stabilność podsynchroniczna (SSCI)',
  voltage_stability: 'Stabilność napięciowa',
  reliability_contingency: 'Niezawodność i stany awaryjne',
  earthing_safety: 'Bezpieczeństwo uziemień',
  insulation_coordination: 'Koordynacja izolacji',
  earth_fault_detection: 'Detekcja doziemień',
  transient_trv: 'Stany przejściowe i napięcie powrotne',
  motor_starting: 'Rozruch silników',
  hosting_capacity: 'Zdolność przyłączeniowa źródeł',
  opf_loss_lcc: 'Optymalizacja strat i koszt cyklu życia',
  benchmark_validation: 'Walidacja na sieciach odniesienia',
  uncertainty_sensitivity: 'Niepewność i wrażliwość',
  neutral_earthing_design: 'Dobór uziemienia punktu neutralnego',
};

/** Krótki opis „po co / z czego / co daje" dla każdego rodzaju (język inżynierski). */
export const OPISY_RODZAJOW: Record<RodzajAnalizy, string> = {
  power_quality_harmonics:
    'Widmo napięć i prądów harmonicznych, THD/TDD i impedancja widziana z węzła — '
    + 'ocena względem limitów PN-EN 50160 / IEEE 519.',
  ssci_impedance:
    'Kryterium impedancyjne Nyquista dla przekształtnika: Z_grid(f), Z_conv(f) i wzmocnienie '
    + 'pętli mniejszej. Werdykt stabilności ma własne okno „Stabilność SSCI".',
  voltage_stability:
    'Margines stabilności napięciowej węzłów (krzywa P–U, współczynnik obciążalności) '
    + 'z rozpływu zbudowanego na modelu przypadku.',
  reliability_contingency:
    'Wskaźniki niezawodności zasilania (SAIFI/SAIDI/ENS) z intensywności uszkodzeń '
    + 'i czasów odtworzenia elementów modelu.',
  earthing_safety:
    'Napięcia dotykowe i krokowe uziomu stacji wg IEEE 80 / PN-EN 50522 — rezystancja '
    + 'uziomu, współczynnik podziału prądu, warstwa powierzchniowa.',
  insulation_coordination:
    'Marginesy poziomu izolacji (BIL) i dobór ograniczników przepięć wg IEC 60071 — '
    + 'ograniczniki pochodzą z aparatów pierwotnych modelu.',
  earth_fault_detection:
    'Dobór metody detekcji doziemienia do sposobu uziemienia punktu neutralnego '
    + 'i wyposażenia przekaźnika (wattmetryczna, admitancyjna, przejściowa, 5. harmoniczna).',
  transient_trv:
    'Napięcie powrotne na łączniku (TRV), stromość narastania i margines względem '
    + 'wytrzymałości aparatu; udar załączania transformatora.',
  motor_starting:
    'Rozruch silnika SN: zapad napięcia na szynie, moment rozruchowy i czas rozruchu '
    + 'względem dopuszczalnego czasu utyku.',
  hosting_capacity:
    'Zdolność przyłączeniowa generacji rozproszonej — granica z kryterium napięciowego '
    + 'i obciążalności, wyznaczona metodą Monte Carlo.',
  opf_loss_lcc:
    'Straty mocy i energii w sieci, koszt strat w cyklu życia oraz ślad emisyjny '
    + 'przy zadanej cenie energii i stopie dyskonta.',
  benchmark_validation:
    'Porównanie wyników solvera z wartościami referencyjnymi sieci odniesienia '
    + '(IEEE 9/14/39-bus, CIGRE MV) w zadanych tolerancjach.',
  uncertainty_sensitivity:
    'Wrażliwość wyniku na niepewność danych wejściowych — ranking czynników '
    + 'i rozrzut wielkości wynikowych.',
  neutral_earthing_design:
    'Dobór uziemienia punktu neutralnego: pojemność doziemna sieci, prąd doziemienia, '
    + 'dławik gaszący (Petersen) albo rezystor uziemiający (NER).',
};

export const AKADEMICKIE_STRINGS = {
  // Nagłówek
  tytul: 'Analizy akademickie',
  opisWstep:
    'Pakiet analiz specjalistycznych liczonych przez solver na committed modelu sieci (ENM) '
    + 'aktywnego przypadku. Każdy przebieg niesie wynik, pełny ślad WHITE BOX, pakiet dowodowy '
    + 'i raport z odciskiem deterministycznym — okno wyłącznie je prezentuje (zero fizyki w UI).',
  runId: 'Identyfikator przebiegu',
  odcisk: 'Odcisk deterministyczny',
  wersjaSolwera: 'Wersja solvera',
  odciskWejscia: 'Odcisk danych wejściowych',
  utworzono: 'Utworzono',
  statusPrzebiegu: 'Status przebiegu',

  // Wybór rodzaju
  wyborTytul: 'Rodzaj analizy',
  wyborOpis:
    'Lista rodzajów pochodzi z katalogu backendu — okno nie trzyma własnej kopii kontraktu.',
  wyborEtykieta: 'Wybierz rodzaj analizy',
  rodzajNieznany: 'rodzaj spoza kontraktu okna',
  rodzajeLadowanie: 'Wczytywanie listy rodzajów analiz…',
  rodzajeBlad: 'Nie udało się wczytać listy rodzajów analiz',
  rodzajePonow: 'Ponów wczytanie listy',
  rodzajeBrak: 'Katalog nie zwrócił żadnego rodzaju analizy',
  rodzajeBrakOpis:
    'Backend nie udostępnia w tej chwili żadnego rodzaju analizy akademickiej. '
    + 'Bez listy z katalogu okno nie podstawia własnej — uruchomienie nie jest możliwe.',

  // Stan bez aktywnego przypadku
  brakPrzypadku: 'Brak aktywnego przypadku obliczeniowego',
  brakPrzypadkuOpis:
    'Aktywuj przypadek obliczeniowy z committed modelem sieci (ENM). Analizy akademickie '
    + 'powstają z tego modelu — bez niego solver nie ma czego liczyć.',

  // Akcja uruchomienia
  uruchom: 'Uruchom analizę',
  uruchomPonownie: 'Uruchom ponownie',
  uruchomOpis:
    'Przebieg powstaje z committed ENM aktywnego przypadku. Parametry projektowe pozostawione '
    + 'puste oznaczają udokumentowaną wartość domyślną solvera — okno niczego nie podstawia.',
  ladowanie: 'Trwa obliczanie analizy…',
  blad: 'Nie udało się wykonać analizy',

  // Świeżość
  swiezoscEtykieta: 'Świeżość wyników',
  swiezoscOpis:
    'Stan wyników względem rewizji modelu — wspólny kontrakt świeżości przestrzeni Wyników.',

  // Parametry projektowe
  parametryTytul: 'Parametry projektowe',
  parametryOpis:
    'Dane, których nie ma w modelu sieci, a solver ich potrzebuje. Pole puste = parametr '
    + 'nieprzekazany (solver użyje własnej udokumentowanej wartości). Każde pole odpowiada '
    + 'dokładnie jednemu kluczowi kontraktu wejściowego.',
  parametryBrak: 'Ten rodzaj analizy nie przyjmuje parametrów projektowych — liczy wprost z modelu.',
  parametryPokaz: 'Pokaż parametry projektowe',
  parametryUkryj: 'Ukryj parametry projektowe',
  parametrySilnikiTytul: 'Silniki do zbadania',
  parametrySilnikiOpis:
    'Model sieci nie zawiera silników — podaj je jawnie. Bez wpisu solver zgłosi brak danych '
    + '(okno nie podstawia przykładowej maszyny).',
  parametryDodajSilnik: 'Dodaj silnik',
  parametryUsunSilnik: 'Usuń silnik',
  parametryReferencjeTytul: 'Referencje sieci odniesienia',
  parametryReferencjeOpis:
    'Wiersz referencji: sieć, badanie, wartość referencyjna, wartość policzona, tolerancja. '
    + 'Bez referencji solver nie wystawia werdyktu.',
  parametryDodajReferencje: 'Dodaj referencję',
  parametryUsunReferencje: 'Usuń referencję',
  parametryMetodyTytul: 'Metody dostępne w przekaźniku',

  // Wynik
  wynikTytul: 'Wynik analizy',
  wynikOpis: 'Wszystkie pola wyniku solvera — bez skracania listy.',
  wynikPusty: 'Solver zwrócił wynik bez pól',
  wynikPozycji: (n: number): string => `pozycji: ${n}`,
  wynikPokazWszystko: 'Pokaż pełny wynik',
  wynikLiczbaPol: (n: number): string => `pól wyniku: ${n}`,

  // Ślad WHITE BOX
  sladTytul: 'Pełna jawność obliczeń',
  sladOpis: 'Ślad WHITE BOX przebiegu: wzór → dane → podstawienie → wynik → sprawdzenie jednostek.',
  sladPokaz: 'Pokaż ślad obliczeń',
  sladUkryj: 'Ukryj ślad obliczeń',
  sladKrokow: (n: number): string => `kroków śladu: ${n}`,
  sladKolKrok: 'Krok',
  sladKolWzor: 'Wzór',
  sladKolPodstawienie: 'Podstawienie',
  sladKolWynik: 'Wynik',
  sladKolJednostka: 'Sprawdzenie jednostek',
  sladPusty: 'Przebieg nie zawiera kroków śladu',

  // Dowód
  dowodTytul: 'Pakiet dowodowy',
  dowodOpis: 'Kroki dowodu wygenerowane z tego samego śladu — z odciskiem pakietu.',
  dowodPokaz: 'Pokaż kroki dowodu',
  dowodUkryj: 'Ukryj kroki dowodu',
  dowodId: 'Identyfikator dowodu',
  dowodOdcisk: 'Odcisk dowodu',
  dowodKrokow: 'Kroków dowodu',
  dowodPusty: 'Pakiet dowodowy nie zawiera kroków',

  // Raport
  raportTytul: 'Raport',
  raportOpis: 'Wszystkie sekcje raportu kontraktu — bez skracania listy.',
  raportId: 'Identyfikator raportu',
  raportOdcisk: 'Odcisk raportu',
  raportPolityka: 'Polityka eksportu',
  raportSekcji: (n: number): string => `sekcji raportu: ${n}`,
  raportMetryk: (n: number): string => `metryk: ${n}`,
  raportPusty: 'Raport nie zawiera sekcji',

  // Dane odniesienia (katalog)
  katalogTytul: 'Dane odniesienia',
  katalogOpis: 'Wartości odniesienia z katalogu backendu, na których opiera się ocena tej analizy.',
  katalogPokaz: 'Pokaż dane odniesienia',
  katalogUkryj: 'Ukryj dane odniesienia',
  katalogLadowanie: 'Wczytywanie danych odniesienia…',
  katalogBlad: 'Nie udało się wczytać danych odniesienia',
  katalogBrak: 'Ten rodzaj analizy nie ma w katalogu danych odniesienia.',

  // Odesłanie do okna SSCI
  odeslanieSsci:
    'Werdykt stabilności podsynchronicznej (kryterium Nyquista) prezentuje osobne okno '
    + '„Stabilność SSCI" — ma własny kontrakt odpowiedzi i własny model prezentacji.',

  // Brama opracowania (V126-JEZYK — ocena właściciela 0/10 z 2026-08-07)
  bramaTytul: 'Pakiet analiz specjalistycznych — w opracowaniu',
  bramaOpis:
    'Część rodzajów tego pakietu nie ma jeszcze werdyktu z jawnym kryterium normatywnym, '
    + 'więc pakiet nie wchodzi na podstawowy tor pracy projektanta. Dostęp pozostaje '
    + 'w trybie eksperckim — do przeglądu wielkości i śladu obliczeń.',
  bramaJakWejsc: 'Przełącz tryb pracy na ekspercki (przełącznik trybu w pasku powłoki).',

  // Wspólne
  kreska: '—',
  tak: 'tak',
  nie: 'nie',
} as const;

/** Etykieta rodzaju: z mapy kontraktu albo uczciwie surowy kod (bez fabrykacji nazwy). */
export function etykietaRodzaju(kod: string): string {
  const znany = (ETYKIETY_RODZAJOW as Record<string, string | undefined>)[kod];
  return znany ?? `${kod} (${AKADEMICKIE_STRINGS.rodzajNieznany})`;
}

/** Opis rodzaju albo pusty łańcuch, gdy rodzaj spoza kontraktu okna. */
export function opisRodzaju(kod: string): string {
  return (OPISY_RODZAJOW as Record<string, string | undefined>)[kod] ?? '';
}

/**
 * Formatuje wartość skalarną wyniku do postaci PL (przecinek dziesiętny dla liczb
 * niecałkowitych, jawne „tak/nie" dla flag, kreska dla braku). Czysta funkcja.
 */
export function fmtWartosc(wartosc: unknown): string {
  if (wartosc === null || wartosc === undefined) return AKADEMICKIE_STRINGS.kreska;
  if (typeof wartosc === 'boolean') {
    return wartosc ? AKADEMICKIE_STRINGS.tak : AKADEMICKIE_STRINGS.nie;
  }
  if (typeof wartosc === 'number') {
    if (!Number.isFinite(wartosc)) return String(wartosc);
    return Number.isInteger(wartosc) ? String(wartosc) : String(wartosc).replace('.', ',');
  }
  if (typeof wartosc === 'string') return wartosc.length === 0 ? AKADEMICKIE_STRINGS.kreska : wartosc;
  return JSON.stringify(wartosc);
}
