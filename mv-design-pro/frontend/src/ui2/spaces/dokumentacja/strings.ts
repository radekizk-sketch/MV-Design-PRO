/**
 * Teksty PL huba „Dokumentacja" (karta F-E8.1 + runda poprawek recenzji
 * inżyniera 2026-07-21). Wyłącznie polski język techniczny; zero surowych
 * identyfikatorów w strefie pierwszoplanowej.
 */

export const DOK_STRINGS = {
  tytul: 'Dokumentacja',
  cel: 'Domknięcie projektu dokumentem odbiorowym: raporty z obliczeń, pakiety '
    + 'dowodowe WHITE BOX i archiwum projektu — każdy dokument z jawnym źródłem '
    + 'i odciskiem reprodukowalności.',

  // --- Pasek procesu (recenzja pkt 9) ------------------------------------
  procesEyebrow: 'ETAP PRACY',
  procesProjekt: 'Projekt',
  procesObliczenia: 'Obliczenia',
  procesDokumentacja: 'Dokumentacja',
  procesEksport: 'Eksport',
  procesWniosek: 'Wniosek OSD',

  // --- Analizowany model (recenzja pkt 5) --------------------------------
  modelEyebrow: 'ANALIZOWANY MODEL',
  modelTytul: 'Czego dotyczy dokumentacja',
  modelNota: 'Podstawowe parametry modelu i wykonanych obliczeń — do natychmiastowej '
    + 'weryfikacji, że dokument dotyczy właściwej sieci.',
  modelBrak: 'Brak modelu sieci — zbuduj model, aby zobaczyć jego parametry.',
  modelPoziomyNapiec: 'Poziomy napięć',
  modelWezly: 'Węzły (szyny)',
  modelGalezie: 'Gałęzie (linie/kable)',
  modelTransformatory: 'Transformatory',
  modelZrodla: 'Źródła zasilania',
  modelGeneracja: 'Generacja / DER',
  modelOdbiory: 'Odbiory',
  modelObliczenia: 'Wykonane obliczenia',
  modelObliczeniaBrak: 'brak zakończonych obliczeń',
  modelOstatnia: 'Ostatnia analiza',
  modelOstatniaBrak: 'nie wykonano',

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
  formatyLabel: 'Formaty',
  zawartoscLabel: 'Zawartość',
  zawartoscBrak: 'zawartość ustali się po zakończeniu obliczeń',
  dowodFormalny: 'DOWÓD FORMALNY',

  // --- Statusy (recenzja pkt 4) ------------------------------------------
  statusDoWygenerowania: 'Do wygenerowania',
  statusWymagaPrzebiegu: 'Wymaga: zakończony przebieg',
  statusWymagaProjektu: 'Wymaga: otwarty projekt',

  nastepnyEyebrow: 'NASTĘPNY KROK',
  nastepnyTytul: 'Po wytworzeniu dokumentów',
  nastepnyNota: 'Komplet: raport analizy + pakiet dowodowy + archiwum projektu tworzy '
    + 'podstawę wniosku przyłączeniowego do OSD. Dla źródeł OZE dołącz studium '
    + 'przyłączeniowe ze strumienia OZE (zakładka „OZE i zgodność").',

  powrot: '← Dokumentacja',
  powrotOpis: 'Wróć do przeglądu dokumentacji',
} as const;
