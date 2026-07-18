/**
 * Teksty PL ekranu „Analizy techniczne" (przebudowa od zera — audyt
 * AUDYT_EKRAN_ANALIZY_TECHNICZNE_2026-07.md). Wyłącznie polski język
 * techniczny; zero surowych identyfikatorów w strefie pierwszoplanowej.
 */

export const ANALIZY_STRINGS = {
  tytul: 'Analizy techniczne',
  cel: 'Specjalistyczne analizy interpretujące wyniki zakończonych obliczeń: '
    + 'koordynacja zabezpieczeń, stany sieci, wytrzymałość toru i zgodność przyłączeniowa.',

  torPracyEyebrow: 'TOR PRACY',
  torPracyTytul: 'Od projektu do analizy',
  torPracyNota: 'Analizy techniczne czytają wyniki ZAKOŃCZONEGO przebiegu obliczeń. '
    + 'Komplet kroków 1–4 daje pełne dane; bez zakończonego przebiegu karty analiz '
    + 'pokażą wyłącznie kontrakt i założenia, bez wartości liczbowych.',

  krokProjekt: 'Projekt',
  krokWariant: 'Wariant pracy sieci',
  krokWersja: 'Wersja układu',
  krokObliczenie: 'Zakończone obliczenie',

  brakProjektu: 'nie wybrano projektu',
  brakWariantu: 'nie wybrano wariantu',
  brakWersji: 'brak modelu sieci',
  brakObliczenia: 'nie wykonano obliczeń',

  akcjaProjekt: 'Wybierz projekt',
  akcjaWariant: 'Wybierz wariant',
  akcjaWersja: 'Otwórz model',
  akcjaObliczenie: 'Przejdź do obliczeń',

  stanOk: 'gotowe',
  stanBrak: 'brak',

  analizyEyebrow: 'ANALIZY',
  zrodloDanych: 'Źródło danych',
  otworz: 'Otwórz',
  wymagaZwarcia: 'wymaga przebiegu zwarciowego',
  wymagaRozplywu: 'wymaga przebiegu rozpływu',
  wymagaDowolnego: 'wymaga zakończonego przebiegu',
  daneDostepne: 'dane dostępne',

  klasyczneEyebrow: 'WIDOKI KLASYCZNE (MOST)',
  klasyczneNota: 'Klasyczne widoki dawnego interfejsu. Nowe odpowiedniki znajdziesz '
    + 'w zakładkach warsztatu: Porównanie A/B, Dowód obliczeń i Testy NC RfG.',
  klasycznePorownanie: 'Porównanie przebiegów (widok klasyczny)',
  klasycznySlad: 'Ślad obliczeń (widok klasyczny)',
  klasyczneNcRfg: 'Testy NC RfG (widok klasyczny)',

  powrot: '← Analizy techniczne',
  powrotOpis: 'Wróć do przeglądu analiz technicznych',
} as const;
