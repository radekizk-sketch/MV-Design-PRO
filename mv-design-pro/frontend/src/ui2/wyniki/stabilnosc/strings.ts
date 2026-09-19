/*
 * Teksty PL ekranu „Stabilność dynamiczna" (dostawca E-32, karta P-3,
 * FLOW §0.3 „kontrakt ekranu prowadzącego"). Wyłącznie polski język techniczny.
 */

export const STABILNOSC_STRINGS = {
  eyebrow: 'DYNAMIKA',
  tytul: 'Stabilność dynamiczna',
  cel: 'Oceń, czy źródło zachowuje stabilność po zwarciu i jego wyłączeniu — na podstawie '
    + 'scenariusza zakłócenia, kryteriów wersjonowanych i werdyktu backendu '
    + '(analiza stabilności typu „wyłączenie zwarcia").',

  // Stan zerowy — bez scenariusza ekran pokazuje FORMULARZ, nie werdykt (karta W2 pkt 1).
  zeroTytul: 'Ocena progowa wymaga jawnego scenariusza zwarcia',
  zeroOpis: 'Backend nie ma wartości domyślnych dla scenariusza wyłączenia zwarcia — '
    + 'podaj poniżej komplet pól, aby uzyskać ocenę progową. Brak dowolnego pola kończy '
    + 'bieg odmową, nie werdyktem policzonym dla zgadniętego scenariusza.',
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
  formularzUruchom: 'Uruchom ocenę progową',
  formularzWToku: 'Bieg w toku…',
  bladWymagane: 'pole wymagane',
  bladDodatnie: 'wartość musi być dodatnia',
  bladListaPusta: 'podaj co najmniej jedną referencję',

  // Stany dostawcy danych.
  ladowanieTytul: 'Ładowanie wyniku stabilności',
  ladowanieOpis: 'Widok pobiera werdykt stabilności i ślad automatyki przebiegu.',
  bladTytul: 'Nie udało się pobrać wyniku stabilności',
  bladOpis: 'Backend nie zwrócił wiersza wyniku dla wskazanego przebiegu. '
    + 'Spróbuj ponownie z przestrzeni obliczeń.',
  brakWierszaTytul: 'Przebieg bez wyniku stabilności',
  brakWierszaOpis: 'Wskazany przebieg nie zawiera wiersza wyniku stabilności (uczciwy brak).',

  // Założenia — scenariusz zakłócenia.
  zalTytul: 'Scenariusz zakłócenia',
  zalElement: 'Element objęty zwarciem',
  zalZrodlo: 'Oceniane źródło',
  zalCzasWylaczenia: 'Czas wyłączenia zwarcia',
  zalWylaczaly: 'Elementy wyłączające',
  zalMaksCzas: 'Dopuszczalny czas wyłączenia (kryterium)',
  zalKryteria: 'Wersja kryteriów',

  // Werdykt — nagłówek wyniku mówi WPROST, że to ocena progowa zadanego scenariusza,
  // nie symulacja RMS (karta W2 pkt 1: solver realny RMS to osobna zdolność, W6).
  werdyktTytul: 'Ocena progowa zadanego scenariusza (bez symulacji RMS)',
  werdyktOpis: 'Werdykt, wskaźnik i czynnik ograniczający pochodzą wprost z backendu '
    + '(zero interpretacji w interfejsie) — dla SCENARIUSZA podanego w formularzu, nie '
    + 'symulacji przebiegu elektromechanicznego RMS.',
  werdyktStatus: 'Werdykt',
  werdyktStabilny: 'STABILNY',
  werdyktNiestabilny: 'NIESTABILNY',
  werdyktWskaznik: 'Wskaźnik stabilności',
  werdyktMargines: 'Margines czasu wyłączenia',
  werdyktCzynnik: 'Czynnik ograniczający',
  werdyktNaruszone: 'Naruszone kryteria',
  werdyktBrakNaruszen: 'brak naruszeń',

  // Kryteria oceny progowej — JAWNIE nazwane, z notą o pochodzeniu (karta W2 pkt 1).
  kryteriaTytul: 'Kryteria oceny progowej',
  kryteriaOpis: 'Progi, wobec których werdykt jest oceniany — nazwane wprost, z notą, '
    + 'skąd pochodzą.',
  kolKryterium: 'Kryterium',
  kolProg: 'Próg',
  kolPochodzenie: 'Pochodzenie',

  // Tabela wielkości po zakłóceniu.
  wielkosciTytul: 'Wielkości po zakłóceniu',
  wielkosciOpis: 'Wartości scenariusza i wyniku z backendu; status per wiersz = kryterium '
    + 'sprawdzone przez backend (pole `checks`).',
  kolWielkosc: 'Wielkość',
  kolWartosc: 'Wartość',
  kolStatus: 'Status kryterium',
  wielkoscCzas: 'Czas wyłączenia zwarcia',
  wielkoscKat: 'Wychylenie kąta wirnika',
  wielkoscNapiecie: 'Napięcie po zakłóceniu',
  wielkoscCzestotliwosc: 'Częstotliwość po zakłóceniu',
  statusSpelnione: 'spełnione',
  statusNaruszone: 'naruszone',
  // Uczciwa granica kontraktu (GAP): wynik nie niesie szeregu czasowego.
  brakSzereguCzasowego: 'Kontrakt wyniku nie niesie szeregu czasowego przebiegu (kąt/napięcie '
    + 'w funkcji czasu) — prezentowane są wartości skrajne i końcowe policzone przez backend.',

  // Przebieg czasowy (szereg U(t)/f(t)) — na żądanie.
  przebiegTytul: 'Przebieg czasowy',
  przebiegOpis: 'Napięcie i częstotliwość w funkcji czasu (przebieg policzony przez backend '
    + 'dla scenariusza wyłączenia zwarcia). Ładowany na żądanie — zgodnie z zasadą śladu.',
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

  // Ślad automatyki (na żądanie).
  sladTytul: 'Ślad automatyki zabezpieczeniowej',
  sladPokaz: 'Pokaż ślad automatyki',
  sladUkryj: 'Ukryj ślad automatyki',
  sladOpis: 'Sekwencja zdarzeń automatyki (backend, read-only) — od zwarcia do stanu po wyłączeniu.',
  sladKolLp: 'Lp.',
  sladKolZdarzenie: 'Zdarzenie',
  sladKolElement: 'Element',
  sladKolOpis: 'Opis',
  sladBrak: 'Przebieg nie zawiera zdarzeń śladu automatyki.',
  sladStanSieci: 'Stan sieci po zakłóceniu',
  sladZakresWylaczen: 'Zakres wyłączeń',
  sladDowod: 'Otwórz pełny dowód obliczeń',
  sladDowodOpis: 'Pełny ślad przebiegu (wszystkie kroki) w zakładce „Dowód obliczeń".',

  // Raportowalność.
  raportTytul: 'Raportowalność',
  raportStatus: 'Werdykt raportowalności',
  raportUzasadnienie: 'Status uzasadnienia',
  raportOgraniczenia: 'Ograniczenia raportowe',
  raportBrakOgraniczen: 'brak ograniczeń',

  // Następny krok / powrót.
  nastepnyEyebrow: 'NASTĘPNY KROK',
  nastepnyOpis: 'Werdykt niestabilny → sprawdź nastawy zabezpieczeń (koordynacja) i czas '
    + 'wyłączenia pola; pełny wywód kroków znajdziesz w zakładce „Dowód obliczeń".',
  powrotHub: '← Wróć do analiz technicznych',
  powrotOpis: 'Wróć do przeglądu analiz technicznych',

  // Jednostki i wartości puste.
  jednMs: 'ms',
  jednDeg: '°',
  jednPu: 'p.u.',
  kreska: '—',
} as const;

/**
 * Słownik PL kryteriów/czynników analizy stabilności. Klucze = tokeny backendu
 * (`checks`/`limiting_factor`, application/stability/dynamic_stability.py:155-183).
 * Token nierozpoznany pokazywany dosłownie (dane, nie literał UI).
 */
const KRYTERIUM_PL: Record<string, string> = {
  clearing_time: 'czas wyłączenia zwarcia',
  angle_swing: 'wychylenie kąta wirnika',
  voltage_recovery: 'odbudowa napięcia',
  frequency_recovery: 'odbudowa częstotliwości',
};

/** Mapuje token kryterium na polską nazwę (read-only, bez fizyki). */
export function kryteriumPL(token: string): string {
  return KRYTERIUM_PL[token] ?? token;
}

/**
 * Słownik PL typów zdarzeń śladu automatyki. Klucze = `event_type` backendu
 * (application/automation/trace.py — build_automation_trace).
 * Token nierozpoznany pokazywany dosłownie.
 */
const ZDARZENIE_PL: Record<string, string> = {
  AUTOMATION_STARTED: 'start sekwencji automatyki',
  FAULT_APPLIED: 'wystąpienie zwarcia',
  FAULT_CLEARED: 'wyłączenie zwarcia',
  POST_FAULT_TOPOLOGY_EFFECT: 'zmiana topologii po wyłączeniu',
  DYNAMIC_STABILITY_EVALUATED: 'ocena stabilności',
};

/** Mapuje token zdarzenia automatyki na polską nazwę (read-only). */
export function zdarzeniePL(token: string): string {
  return ZDARZENIE_PL[token] ?? token;
}
