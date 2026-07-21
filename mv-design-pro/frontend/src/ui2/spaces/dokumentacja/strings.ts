/**
 * Teksty PL huba „Dokumentacja" (karta F-E8.1). Wyłącznie polski język
 * techniczny; zero surowych identyfikatorów w strefie pierwszoplanowej.
 */

export const DOK_STRINGS = {
  tytul: 'Dokumentacja',
  cel: 'Domknięcie projektu dokumentem odbiorowym: raporty z obliczeń, pakiety '
    + 'dowodowe WHITE BOX i archiwum projektu — każdy dokument z jawnym źródłem '
    + 'i odciskiem reprodukowalności.',

  torPracyEyebrow: 'TOR PRACY',
  torPracyTytul: 'Od projektu do dokumentu',
  torPracyNota: 'Dokumenty z obliczeń powstają z ZAKOŃCZONEGO przebiegu i pokazują, '
    + 'z jakiego przebiegu i z jakiej wersji układu zostały wytworzone (reprodukowalność). '
    + 'Bez zakończonego przebiegu dostępne jest tylko archiwum projektu.',

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

  dokumentyEyebrow: 'DOKUMENTY',
  zrodloDanych: 'Źródło danych',
  otworz: 'Otwórz',
  wymagaPrzebiegu: 'wymaga zakończonego przebiegu',
  wymagaProjektu: 'wymaga otwartego projektu',
  dostepny: 'można wytworzyć',

  nastepnyEyebrow: 'NASTĘPNY KROK',
  nastepnyTytul: 'Po wytworzeniu dokumentów',
  nastepnyNota: 'Komplet: raport analizy + pakiet dowodowy + archiwum projektu tworzy '
    + 'podstawę wniosku przyłączeniowego do OSD. Dla źródeł OZE dołącz studium '
    + 'przyłączeniowe ze strumienia OZE (zakładka „OZE i zgodność").',

  powrot: '← Dokumentacja',
  powrotOpis: 'Wróć do przeglądu dokumentacji',
} as const;
