/*
 * Teksty i deterministyczne formatery okna „Zgodność powykonawcza" (karta U4 P45)
 * — wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7). Zero literałów UI
 * w JSX; identyfikatory (input_hash, run id) renderowane wyłącznie w trybie
 * eksperckim jako wyrażenia `{...}`. Formatery są CZYSTE (wejście→wyjście), bez
 * `Date.now`/losowości (Determinism Rule) — przecinek dziesiętny wg konwencji PL.
 */

import type { WielkoscPomiaru } from './api';

/** Poziom istotności werdyktu (do doboru koloru tagu/chipu — wyłącznie prezentacja). */
export type IstotnoscWerdyktu = 'ok' | 'warn' | 'err' | 'neutral';

export const ODBIOR_STRINGS = {
  // Nagłówek
  tytul: 'Zgodność powykonawcza',
  opisWstep:
    'Porównanie pomiarów z obiektu (odbiór, rejestratory) z gotowym wynikiem '
    + 'rozpływu mocy i jawnymi tolerancjami — domknięcie pętli projekt → budowa → odbiór.',

  // Stan bez przebiegu rozpływu
  brakPrzebiegu: 'Brak zakończonego przebiegu rozpływu mocy',
  brakPrzebieguOpis:
    'Uruchom i zakończ obliczenie rozpływu mocy, aby porównać z nim pomiary z obiektu.',

  // Przebieg
  przebiegTytul: 'Przebieg odniesienia (rozpływ mocy)',
  przebiegRunId: 'Identyfikator przebiegu',

  // Wybór trybu wejścia pomiarów
  trybTytul: 'Źródło pomiarów',
  trybCsv: 'Wklej CSV',
  trybWiersze: 'Wiersze ręczne',

  // Pole CSV
  csvEtykieta: 'Pomiary w formacie CSV',
  csvOpis:
    'Nagłówek: element_ref;wielkosc;wartosc;jednostka. Separator średnik lub przecinek; '
    + 'przy średniku dopuszczalny polski przecinek dziesiętny. Wielkość: U (kV), P (MW), Q (Mvar).',
  csvPlaceholder: 'element_ref;wielkosc;wartosc;jednostka',

  // Edytor wierszy
  edytorTytul: 'Pomiary — edytor wierszy',
  edytorElement: 'Element (element_ref)',
  edytorWielkosc: 'Wielkość',
  edytorWartosc: 'Wartość',
  edytorJednostka: 'Jednostka',
  edytorDodaj: 'Dodaj wiersz',
  edytorUsun: 'Usuń',
  edytorUsunAria: 'Usuń wiersz pomiaru',

  // Tolerancje
  tolerancjeTytul: 'Tolerancje odbioru (jawne)',
  tolerancjeOpis:
    'Tolerancje wyłącznie jawne — brak wartości domyślnych. Wymagane zależnie od '
    + 'mierzonych wielkości (napięcie dla U, moc dla P/Q).',
  tolNapiecie: 'Tolerancja napięcia',
  tolMoc: 'Tolerancja mocy',

  // Akcja
  oblicz: 'Zbuduj raport',
  przelicz: 'Przelicz raport',

  // Stany biegu
  ladowanie: 'Budowanie raportu zgodności…',
  blad: 'Nie udało się zbudować raportu zgodności',

  // Błędy walidacji (przed wysłaniem)
  bledyTytul: 'Uzupełnij dane przed zbudowaniem raportu',
  bladBrakWierszy: 'Dodaj co najmniej jeden pomiar (element, wielkość i wartość).',
  bladBrakCsv: 'Wklej dane pomiarowe w formacie CSV.',
  bladBrakTolerancji: 'Podaj co najmniej jedną tolerancję (napięcia lub mocy).',
  bladTolNapiecieLiczba: 'Tolerancja napięcia musi być liczbą (np. 5 albo 2,5).',
  bladTolMocLiczba: 'Tolerancja mocy musi być liczbą (np. 10 albo 7,5).',
  bladTolNapiecieUjemna: 'Tolerancja napięcia nie może być ujemna.',
  bladTolMocUjemna: 'Tolerancja mocy nie może być ujemna.',
  bladWymaganaTolNapiecie: 'Podaj tolerancję napięcia (%) — mierzysz napięcie U.',
  bladWymaganaTolMoc: 'Podaj tolerancję mocy (%) — mierzysz moc P lub Q.',

  // Kolumny raportu
  kolElement: 'Element',
  kolWielkosc: 'Wielkość',
  kolPomiar: 'Pomiar',
  kolModel: 'Model',
  kolOdchylka: 'Odchyłka',
  kolOdchylkaPct: 'Odchyłka względna',
  kolTolerancja: 'Tolerancja',
  kolWerdykt: 'Werdykt',

  // Chipy podsumowania
  podsumZgodne: 'W tolerancji',
  podsumPoza: 'Poza tolerancją',
  podsumBrakOdpowiednika: 'Brak odpowiednika',
  podsumBrakWyniku: 'Brak wyniku',
  podsumNajwieksza: 'Największa odchyłka',

  // Założenia
  zalozeniaTytul: 'Założenia raportu',

  // Szczegół wiersza / ślad WHITE BOX
  szczegolBrakWyboru: 'Wybierz wiersz w tabeli, aby zobaczyć ślad porównania.',
  szczegolTytulPomiar: 'Pomiar',
  szczegolTytulModel: 'Model',
  szczegolTytulOdchylka: 'Odchyłka',
  szczegolTytulTolerancja: 'Tolerancja',
  sladTytul: 'Ślad obliczeń (WHITE BOX)',
  sladPokaz: 'Pokaż ślad obliczeń',
  sladUkryj: 'Ukryj ślad obliczeń',

  // Tryb ekspercki
  ekspHash: 'Identyfikator wejścia (hash)',

  // Jednostki i wartości puste
  jednProcent: '%',
  kreska: '—',
} as const;

/**
 * Werdykty — tekst polski JEST wprost z backendu
 * (`application/analyses/zgodnosc_powykonawcza.py`). Tu utrwalone, aby wyznaczyć
 * istotność tagu/chipu bez powielania literałów.
 */
export const WERDYKT_ZGODNOSCI = {
  wTolerancji: 'w tolerancji',
  pozaTolerancja: 'poza tolerancją',
  brakOdpowiednika: 'brak odpowiednika w modelu',
  brakWyniku: 'brak wyniku dla elementu',
} as const;

/** Istotność werdyktu (dobór koloru tagu/chipu) — na bazie tekstu z backendu. */
export function istotnoscWerdyktu(werdykt: string): IstotnoscWerdyktu {
  if (werdykt === WERDYKT_ZGODNOSCI.wTolerancji) return 'ok';
  if (werdykt === WERDYKT_ZGODNOSCI.pozaTolerancja) return 'err';
  if (werdykt === WERDYKT_ZGODNOSCI.brakWyniku) return 'warn';
  return 'neutral';
}

/** Polskie etykiety wielkości mierzonych (symbol → nazwa opisowa). */
export const WIELKOSC_PL: Record<WielkoscPomiaru, string> = {
  U: 'Napięcie U',
  P: 'Moc czynna P',
  Q: 'Moc bierna Q',
};

/** Jednostka kanoniczna wielkości (zgodna z kontraktem backendu). */
export const JEDNOSTKA_WIELKOSCI: Record<WielkoscPomiaru, string> = {
  U: 'kV',
  P: 'MW',
  Q: 'Mvar',
};

/** Polska nazwa wielkości (nieznany kod → dosłownie, jako dane). */
export function wielkoscPL(kod: WielkoscPomiaru): string {
  return WIELKOSC_PL[kod] ?? kod;
}

// ---------------------------------------------------------------------------
// Formatery deterministyczne (przecinek dziesiętny PL)
// ---------------------------------------------------------------------------

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczba(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Wartość pomiaru/modelu/odchyłki — 3 miejsca po przecinku. */
export function fmtWartosc(n: number): string {
  return fmtLiczba(n, 3);
}

/** Procent (odchyłka względna, tolerancja) — 2 miejsca po przecinku. */
export function fmtProcent(n: number): string {
  return fmtLiczba(n, 2);
}

/**
 * Parsuje liczbę z przecinkiem dziesiętnym PL. Zwraca `'pusto'` dla pustego
 * tekstu, `'blad'` dla wartości nieliczbowej, inaczej liczbę.
 */
export function parsujLiczbaPL(surowy: string): number | 'pusto' | 'blad' {
  const tekst = surowy.trim();
  if (tekst === '') return 'pusto';
  const liczba = Number(tekst.replace(',', '.'));
  return Number.isFinite(liczba) ? liczba : 'blad';
}
