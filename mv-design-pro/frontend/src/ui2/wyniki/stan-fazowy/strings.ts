/**
 * Teksty PL i deterministyczne formatery ekranu „Stan fazowy SN" (E-31,
 * karta P-2). Wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7);
 * formatery CZYSTE (Determinism Rule) — przecinek dziesiętny PL.
 */

export const STAN_FAZOWY_STRINGS = {
  eyebrow: 'ANALIZA FAZOWA',
  tytul: 'Stan fazowy SN',
  cel: 'Zweryfikuj napięcia i prądy fazowe celu analizy oraz wskaźniki asymetrii '
    + 'U/I/strat — na podstawie wyniku zakończonego przebiegu stanu fazowego SN.',

  // Stany zerowe (uczciwe — bez podstawiania wartości).
  brakProjektuTytul: 'Brak aktywnego projektu',
  brakProjektuOpis: 'Wyniki stanu fazowego czyta się z przebiegu analizy w aktywnym '
    + 'projekcie. Wybierz projekt, aby kontynuować.',
  brakProjektuAkcja: 'Wybierz projekt',
  brakPrzebieguTytul: 'Brak zakończonego przebiegu stanu fazowego SN',
  brakPrzebieguOpis: 'Ten ekran pokazuje wynik ZAKOŃCZONEGO przebiegu analizy stanu '
    + 'fazowego (napięcia i prądy per faza, asymetrie). Uruchom analizę w przestrzeni '
    + 'Obliczenia, aby zobaczyć wartości.',
  brakPrzebieguAkcja: 'Przejdź do obliczeń',
  ladowanie: 'Ładowanie wyników stanu fazowego…',
  bladTytul: 'Nie udało się pobrać wyników stanu fazowego',
  brakWierszyTytul: 'Przebieg nie zwrócił wyników stanu fazowego',
  brakWierszyOpis: 'Wskazany przebieg zakończył się bez wiersza wyników — sprawdź stan '
    + 'obliczenia w przestrzeni Obliczenia.',

  // Założenia / kontekst wyniku.
  zalCel: 'Cel analizy',
  zalStatusUzasadnienia: 'Status uzasadnienia',
  zalStatusRaportowy: 'Status raportowy',
  zalCelUwaga: 'Szyna celu wskazana w konfiguracji przebiegu.',

  // Tabela wartości fazowych.
  fazyTytul: 'Napięcia i prądy fazowe',
  kolFaza: 'Faza',
  kolNapiecie: 'Napięcie',
  kolPrad: 'Prąd',
  kolStraty: 'Straty czynne',
  fazaA: 'A',
  fazaB: 'B',
  fazaC: 'C',

  // Asymetrie z werdyktem solvera.
  asymetriaTytul: 'Wskaźniki asymetrii',
  asymetriaOpis: 'Werdykt pochodzi z flag alarmowych solvera — próg alarmu jest '
    + 'jawnym wejściem przebiegu, nie progiem interfejsu.',
  asymetriaU: 'Asymetria napięcia',
  asymetriaI: 'Asymetria prądu',
  asymetriaStrat: 'Asymetria strat',
  werdyktPrzekroczenie: 'PRZEKROCZENIE',
  werdyktWNormie: 'w normie',
  werdyktBrak: 'bez werdyktu',

  // Flagi stanu (zwarcie / otwarta faza).
  stanTytul: 'Stan obwodu w przebiegu',
  stanZwarcie: 'Zwarcie w fazach',
  stanOtwartaFaza: 'Otwarta faza',
  stanBrakZdarzen: 'Przebieg bez zwarcia i bez otwartej fazy.',

  // Ograniczenia raportowe.
  ograniczeniaTytul: 'Ograniczenia raportowe',

  // Następny krok.
  nastepnyEyebrow: 'NASTĘPNY KROK',
  nastepnyOpis: 'Pełny wywód obliczenia znajdziesz w oknie dowodu obliczeń; przebieg '
    + 'uruchamiasz ponownie w przestrzeni Obliczenia.',
  akcjaDowod: 'Otwórz dowód obliczeń',
  powrotHub: '← Wróć do analiz technicznych',
  powrotOpis: 'Wróć do przeglądu analiz technicznych',

  // Jednostki i brak danych.
  jednKV: 'kV',
  jednA: 'A',
  jednKW: 'kW',
  jednProcent: '%',
  kreska: '—',
} as const;

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczba(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Wartość liczbowa lub uczciwa kreska (kontrakt dopuszcza null). */
export function fmtLubKreska(n: number | null | undefined, miejsca: number): string {
  return n != null ? fmtLiczba(n, miejsca) : STAN_FAZOWY_STRINGS.kreska;
}
