/**
 * Teksty PL ekranu „Kontrakt analizy" (dostawca E-29…E-32, karta F-E5a).
 * Wyłącznie polski język techniczny; zero surowych identyfikatorów w strefie
 * pierwszoplanowej (formatery kontraktu maskują ślady audytu).
 */

export const KONTRAKT_STRINGS = {
  eyebrowKontrakt: 'KONTRAKT ANALIZY',

  // Stan zerowy (brak aktywnego przebiegu).
  zeroTytul: 'Brak aktywnego obliczenia',
  zeroOpis: 'Ten ekran interpretuje kontrakt ZAKOŃCZONEGO przebiegu obliczeń: '
    + 'wersję układu, założenia i warunki wejściowe. Bez wskazanego obliczenia '
    + 'pokazujemy tylko cel analizy — bez podstawiania wartości.',
  zeroAkcja: 'Przejdź do obliczeń',

  // Stany hooka kontraktu.
  ladowanieTytul: 'Ładowanie kontraktu obliczenia',
  ladowanieOpis: 'Widok pobiera wspólny kontekst obliczeniowy dla wskazanego przebiegu.',
  bladTytul: 'Nie udało się pobrać kontraktu obliczenia',
  brakKontekstuTytul: 'Brak kontekstu obliczeniowego',
  brakKontekstuOpis: 'Wskazany przebieg nie zwrócił wspólnego kontekstu obliczeniowego.',

  // Sekcje warunkowe.
  sekcjaZalozenia: 'Jawne założenia',
  sekcjaPochodzenie: 'Pochodzenie danych',
  sekcjaReprodukowalnosc: 'Reprodukowalność',

  // Wartość brakująca (chip).
  doKonfiguracji: 'Do konfiguracji',

  // Następny krok / powrót do huba.
  nastepnyEyebrow: 'NASTĘPNY KROK',
  nastepnyOpis: 'Pełne okna analiz otwierasz z huba analiz technicznych. '
    + 'Kontekst schematu daje hub i przestrzeń Schemat.',
  powrotHub: '← Wróć do analiz technicznych',
  powrotOpis: 'Wróć do przeglądu analiz technicznych',
} as const;
