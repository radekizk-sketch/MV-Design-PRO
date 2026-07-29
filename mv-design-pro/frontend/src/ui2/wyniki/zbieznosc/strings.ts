/**
 * Teksty PL i deterministyczne formatery ekranu „Zbieżność rozpływu i zaczepy"
 * (E-30, karta P-2). Wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7);
 * identyfikatory elementów sieci (branch_id, szyny) renderowane jako wyrażenia
 * `{...}` z danych. Formatery CZYSTE (Determinism Rule) — przecinek dziesiętny PL.
 */

export const ZBIEZNOSC_STRINGS = {
  eyebrow: 'ROZPŁYW MOCY',
  tytul: 'Zbieżność rozpływu i zaczepy',
  cel: 'Oceń, czy solver rozpływu mocy zbiegł się do rozwiązania i jak przebiegła '
    + 'automatyczna regulacja zaczepów transformatorów — na podstawie wyniku i śladu '
    + 'zakończonego przebiegu rozpływu.',

  // Stany zerowe (uczciwe — bez podstawiania wartości).
  brakProjektuTytul: 'Brak aktywnego projektu',
  brakProjektuOpis: 'Diagnostyka zbieżności czyta wynik przebiegu rozpływu w aktywnym projekcie. '
    + 'Wybierz projekt, aby kontynuować.',
  brakProjektuAkcja: 'Wybierz projekt',
  brakPrzebieguTytul: 'Brak zakończonego przebiegu rozpływu mocy',
  brakPrzebieguOpis: 'Ten ekran interpretuje wynik ZAKOŃCZONEGO obliczenia rozpływu '
    + '(zbieżność, iteracje, regulacja zaczepów). Uruchom rozpływ mocy w przestrzeni '
    + 'Obliczenia, aby zobaczyć diagnostykę.',
  brakPrzebieguAkcja: 'Przejdź do obliczeń',
  ladowanieWyniku: 'Ładowanie wyniku przebiegu rozpływu…',
  bladTytul: 'Nie udało się pobrać wyniku przebiegu',

  // Werdykt zbieżności.
  werdyktEyebrow: 'WERDYKT ZBIEŻNOŚCI',
  werdyktZbiezny: 'Rozpływ ZBIEŻNY',
  werdyktNiezbiezny: 'Rozpływ NIEZBIEŻNY',
  werdyktZbieznyOpis: (iteracje: number) =>
    `Solver osiągnął zadaną tolerancję w ${iteracje} ${odmianaIteracji(iteracje)}.`,
  werdyktNiezbieznyOpis: (iteracje: number) =>
    `Solver NIE osiągnął zadanej tolerancji po ${iteracje} ${odmianaIteracji(iteracje)}. `
    + 'Wartości napięć i przepływów z tego przebiegu nie są wiarygodne.',
  werdyktNiezbieznyInstrukcja: 'Co dalej: sprawdź przyczynę przerwania w śladzie iteracji '
    + 'poniżej, zweryfikuj dane modelu (impedancje, obciążenia, szynę bilansującą) '
    + 'i przelicz przebieg w przestrzeni Obliczenia.',

  // Założenia (parametry przebiegu).
  zalMetoda: 'Metoda solvera',
  zalTolerancja: 'Tolerancja zbieżności',
  zalMocBazowa: 'Moc bazowa',
  zalSzynaBilansujaca: 'Szyna bilansująca',
  zalMaxIteracji: 'Limit iteracji',
  zalMetodaUwaga: 'Metoda z śladu solvera przebiegu (WHITE BOX).',
  zalMaxIteracjiUwaga: 'Limit iteracji z śladu solvera przebiegu.',

  // Wartości bilansu przebiegu (summary kontraktu wyniku).
  bilansTytul: 'Bilans przebiegu',
  bilansStratyP: 'Straty czynne łącznie',
  bilansStratyQ: 'Straty bierne łącznie',
  bilansMinU: 'Napięcie minimalne',
  bilansMaxU: 'Napięcie maksymalne',
  bilansSlackP: 'Moc czynna szyny bilansującej',
  bilansSlackQ: 'Moc bierna szyny bilansującej',

  // Regulacja zaczepów (OLTC) — ślad pętli regulacyjnej przebiegu.
  oltcTytul: 'Regulacja zaczepów w przebiegu (OLTC)',
  oltcOpis: 'Pozycje zaczepów wyznaczone przez pętlę automatycznej regulacji solvera '
    + '(ślad WHITE BOX przebiegu). Identyfikatory gałęzi transformatorów są '
    + 'oznaczeniami technicznymi modelu.',
  oltcKolTransformator: 'Gałąź transformatora',
  oltcKolStrona: 'Strona regulowana',
  oltcKolSzynaKontrolowana: 'Szyna kontrolowana',
  oltcKolZadana: 'Napięcie zadane',
  oltcKolPozycjaPoczatkowa: 'Pozycja początkowa',
  oltcKolPozycjaKoncowa: 'Pozycja końcowa',
  oltcKolZakres: 'Zakres pozycji',
  oltcKolPrzelaczenia: 'Liczba przełączeń',
  oltcBrakWSladzie: 'Przebieg nie zawierał automatycznej regulacji zaczepów — pozycje '
    + 'zaczepów pozostały stałe według założeń modelu (tabela poniżej).',
  oltcSladNiedostepny: 'Ślad solvera dla tego przebiegu jest niedostępny — stan pętli '
    + 'regulacji zaczepów nie może być pokazany.',
  oltcLadowanie: 'Ładowanie śladu solvera…',

  // Założenia zaczepów w modelu (bieżąca wersja układu — snapshot ENM).
  modelTytul: 'Założenia zaczepów w modelu (bieżąca wersja układu)',
  modelOpis: 'Konfiguracja przełączników zaczepów transformatorów z BIEŻĄCEJ wersji '
    + 'układu. Uwaga: jeżeli model zmienił się po obliczeniu, założenia mogą różnić się '
    + 'od stanu przebiegu.',
  modelKolTransformator: 'Transformator',
  modelKolRegulacja: 'Rodzaj regulacji',
  modelKolTryb: 'Tryb sterowania',
  modelKolPozycja: 'Pozycja zaczepu',
  modelKolZakres: 'Zakres pozycji',
  modelKolKrok: 'Krok',
  modelBrakTransformatorow: 'Bieżąca wersja układu nie zawiera transformatorów.',
  modelBrakSnapshotu: 'Brak wczytanej wersji układu — założenia zaczepów modelu niedostępne.',

  // Ślad iteracji solvera (na żądanie).
  sladTytul: 'Ślad iteracji solvera',
  sladPokaz: 'Pokaż ślad iteracji',
  sladUkryj: 'Ukryj ślad iteracji',
  sladKolIteracja: 'Iteracja',
  sladKolNorma: 'Norma niezbilansowania',
  sladKolMax: 'Maks. niezbilansowanie',
  sladKolPrzyczyna: 'Przyczyna przerwania',
  sladBrak: 'Ślad iteracji dla tego przebiegu jest niedostępny.',

  // Następny krok.
  nastepnyEyebrow: 'NASTĘPNY KROK',
  nastepnyOpis: 'Pełne tabele napięć i przepływów znajdziesz w oknie wyników rozpływu; '
    + 'badania regulacji zaczepów (profil roczny, przegląd pozycji, optymalizacja) — '
    + 'w oknie badań OLTC.',
  akcjaWynikiRozplywu: 'Otwórz wyniki rozpływu',
  akcjaBadaniaOltc: 'Otwórz badania OLTC',
  powrotHub: '← Wróć do analiz technicznych',
  powrotOpis: 'Wróć do przeglądu analiz technicznych',

  // Etykiety regulacji (kontrakt ENM TapChanger — tokeny → PL).
  regulacjaBrak: 'brak regulacji',
  regulacjaDetc: 'przełącznik bez obciążenia (DETC)',
  regulacjaOltc: 'podobciążeniowy (OLTC)',
  trybReczny: 'ręczny',
  trybAutomatyczny: 'automatyczny',
  trybProfil: 'profilowy',
  trybZdalny: 'zdalny',
  stronaGorna: 'GN',
  stronaDolna: 'DN',

  // Jednostki i brak danych.
  jednMVA: 'MVA',
  jednMW: 'MW',
  jednMvar: 'Mvar',
  jednPU: 'p.u.',
  jednKV: 'kV',
  jednProcent: '%',
  kreska: '—',
} as const;

/** Odmiana słowa „iteracja" (deterministyczna, PL). */
export function odmianaIteracji(n: number): string {
  if (n === 1) return 'iteracji'; // „w 1 iteracji"
  return 'iteracjach';
}

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczba(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Tolerancja zbieżności — notacja wykładnicza, przecinek dziesiętny. */
export function fmtTolerancja(n: number): string {
  return n.toExponential().replace('.', ',');
}
