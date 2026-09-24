/*
 * Teksty PL ekranu „Stabilność dynamiczna" (dostawca E-32, karta P-3,
 * FLOW §0.3 „kontrakt ekranu prowadzącego"). Wyłącznie polski język techniczny.
 */

export const STABILNOSC_STRINGS = {
  eyebrow: 'DYNAMIKA',
  tytul: 'Stabilność dynamiczna',
  cel: 'Scenariusz wyłączenia zwarcia wpisany przez użytkownika — bieg bez oceny stabilności: '
    + 'ekran pokazuje echo scenariusza, efekt topologii zadeklarowany w opcjach biegu '
    + 'i powód, dla którego stabilność nie jest oceniana.',

  // Stan zerowy — bez scenariusza ekran pokazuje FORMULARZ (karta W2 pkt 1).
  zeroTytul: 'Bieg wymaga jawnego scenariusza wyłączenia zwarcia',
  zeroOpis: 'Backend nie ma wartości domyślnych dla scenariusza wyłączenia zwarcia — '
    + 'podaj poniżej komplet pól. Brak dowolnego pola kończy bieg odmową. Bieg zwraca echo '
    + 'wpisanego scenariusza z oceną niewykonaną (kąty i wielkości po zwarciu nie pochodzą '
    + 'z rozwiązania sieci).',
  zeroAkcja: 'Przejdź do obliczeń',

  // Formularz scenariusza — pola = DOKŁADNIE kontrakt opcji biegu
  // (`enm/canonical_analysis.py::_POLA_SCENARIUSZA_STABILNOSCI_DYNAMICZNEJ`), bez
  // wartości podpowiadanych jako „typowe" (pola startują puste).
  formularzTytul: 'Scenariusz wyłączenia zwarcia',
  formularzOpis: 'Wszystkie pola są wymagane — solver nie ma dla nich wartości domyślnych.',
  poleElement: 'Element objęty zwarciem (referencja w modelu)',
  poleCzasWylaczenia: 'Czas wyłączenia zwarcia',
  poleElementyWylaczajace: 'Elementy wyłączające (referencje oddzielone przecinkiem)',
  poleKatPrzed: 'Kąt mocy przed zwarciem',
  poleKatWCzasie: 'Kąt mocy w czasie zwarcia',
  poleKatPo: 'Kąt mocy po zwarciu',
  poleNapiecie: 'Napięcie po zwarciu',
  poleCzestotliwosc: 'Częstotliwość po zwarciu',
  poleStalaCzasowa: 'Stała czasowa odbudowy napięcia/częstotliwości (τ)',
  formularzUruchom: 'Uruchom bieg scenariusza',
  formularzWToku: 'Bieg w toku…',
  bladWymagane: 'pole wymagane',
  bladDodatnie: 'wartość musi być dodatnia',
  bladListaPusta: 'podaj co najmniej jedną referencję',

  // Stany dostawcy danych.
  ladowanieTytul: 'Ładowanie wyniku biegu',
  ladowanieOpis: 'Widok pobiera echo scenariusza, ocenę i ślad automatyki przebiegu.',
  bladTytul: 'Nie udało się pobrać wyniku biegu',
  bladOpis: 'Backend nie zwrócił wiersza wyniku dla wskazanego przebiegu. '
    + 'Spróbuj ponownie z przestrzeni obliczeń.',
  brakWierszaTytul: 'Przebieg bez wyniku',
  brakWierszaOpis: 'Wskazany przebieg nie zawiera wiersza wyniku (uczciwy brak).',

  // Założenia — scenariusz zakłócenia.
  zalTytul: 'Scenariusz zakłócenia',
  zalElement: 'Element objęty zwarciem',
  zalZrodlo: 'Źródło w scenariuszu',
  zalWylaczaly: 'Elementy wyłączające',

  // Echo scenariusza — liczby wpisane przez użytkownika (bez porównań z progami).
  echoTytul: 'Wartości scenariusza wpisane przez użytkownika',
  echoOpis: 'Backend zwraca te liczby bez zmian — nie pochodzą z rozwiązania sieci i nie są '
    + 'porównywane z żadnym progiem.',
  kolWielkosc: 'Wielkość',
  kolWartosc: 'Wartość',
  echoCzas: 'Czas wyłączenia zwarcia',
  echoKatPrzed: 'Kąt mocy przed zwarciem',
  echoKatWCzasie: 'Kąt mocy w czasie zwarcia',
  echoKatPo: 'Kąt mocy po zwarciu',
  echoNapiecie: 'Napięcie po zwarciu',
  echoCzestotliwosc: 'Częstotliwość po zwarciu',

  // Przebieg czasowy (szereg U(t)/f(t)) — na żądanie.
  przebiegTytul: 'Przebieg czasowy',
  przebiegOpis: 'Napięcie i częstotliwość w funkcji czasu dla wpisanego scenariusza. '
    + 'Ładowany na żądanie — zgodnie z zasadą śladu.',
  przebiegPokaz: 'Pokaż przebieg',
  przebiegUkryj: 'Ukryj przebieg',
  przebiegLadowanie: 'Ładowanie przebiegu czasowego…',
  przebiegBlad: 'Nie udało się pobrać przebiegu czasowego dla tego biegu.',
  przebiegBrak: 'Ten bieg nie zawiera szeregu czasowego przebiegu (starszy zapis bez przebiegu).',
  przebiegWykresTytul: 'Napięcie i częstotliwość w funkcji czasu',
  przebiegOsX: 'Czas',
  przebiegOsY: 'Wielkość',
  przebiegSerieTytul: 'Serie',
  przebiegSeriaNapiecie: 'Napięcie U(t)',
  przebiegSeriaCzestotliwosc: 'Częstotliwość f(t)',
  jednS: 's',

  // Ślad automatyki (na żądanie) — bez narracji zdarzeń.
  sladTytul: 'Ślad automatyki zabezpieczeniowej',
  sladPokaz: 'Pokaż ślad automatyki',
  sladUkryj: 'Ukryj ślad automatyki',
  sladOpis: 'Tor nie symuluje zabezpieczeń — ślad nie opowiada sekwencji zdarzeń; pokazuje '
    + 'wyłącznie efekt topologii zadeklarowany w opcjach biegu.',
  sladBrak: 'Ślad automatyki nie zawiera zdarzeń: zabezpieczenia nie zostały zasymulowane '
    + 'w tym biegu (tor nie rozwiązuje sieci).',
  sladBladPobrania: 'Nie udało się pobrać śladu automatyki dla tego biegu.',
  sladTopologiaTytul: 'Efekt topologii zadeklarowany w opcjach biegu',
  sladStanSieci: 'Stan sieci po zakłóceniu',
  sladZakresWylaczen: 'Zakres wyłączeń',
  sladOtwarte: 'Elementy otwarte',
  sladDowod: 'Otwórz pełny dowód obliczeń',
  sladDowodOpis: 'Pełny ślad przebiegu (wszystkie kroki) w zakładce „Dowód obliczeń".',

  // Raportowalność.
  raportTytul: 'Raportowalność',
  raportStatus: 'Status raportowalności',
  raportUzasadnienie: 'Status uzasadnienia',
  raportOgraniczenia: 'Ograniczenia raportowe',
  raportBrakOgraniczen: 'brak ograniczeń',

  // Następny krok / powrót.
  nastepnyEyebrow: 'NASTĘPNY KROK',
  nastepnyOpis: 'Stabilność oceń obliczeniem dynamiki czasowej z punktem pracy z rozpływu; '
    + 'echo scenariusza i ślad biegu znajdziesz w zakładce „Dowód obliczeń".',
  powrotHub: '← Wróć do analiz technicznych',
  powrotOpis: 'Wróć do przeglądu analiz technicznych',

  // Jednostki i wartości puste.
  jednMs: 'ms',
  jednDeg: '°',
  jednPu: 'p.u.',
  kreska: '—',
} as const;
