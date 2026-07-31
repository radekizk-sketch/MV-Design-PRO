/* Stringi PL rejestru przekroczeń „Co wymaga uwagi" (karta A1 / V12K-098). */

export const CO_WYMAGA_UWAGI_STRINGS = {
  tytul: 'Co wymaga uwagi',
  cel: 'Wszystkie przekroczenia z zakończonych obliczeń w jednym miejscu — z akcją naprawczą przy każdym.',
  // Nagłówki listy
  kolAnaliza: 'Analiza',
  kolElement: 'Element',
  kolOpis: 'Przekroczenie',
  kolWartosc: 'Wartość',
  kolDecyzja: 'Decyzja',
  // Etykieta/opis akcji „Popraw w modelu" pochodzą z rejestru akcji naprawczych
  // (`wzorzec/akcjeNaprawcze.ts`, K1 / F-E6.3) — kontekstowe per rodzaj.
  // Podsumowanie
  podsumowanie: (n: number) => `Przekroczeń do rozpatrzenia: ${n}`,
  // Stany zerowe (uczciwe rozróżnienie źródła)
  brakPrzebiegu: 'Brak zakończonego przebiegu obliczeń.',
  brakPrzebieguKrok: 'Uruchom rozpływ mocy, aby zebrać przekroczenia sieci.',
  siecWNormie: 'Sieć w normie — brak przekroczeń w zakończonych analizach.',
  siecWNormieKrok: 'Możesz domknąć dokumentację lub porównać warianty.',
  // Źródła analiz
  analizaRozplyw: 'Rozpływ mocy',
  /** Kryteria projektowe zebrane przez backend z wielu biegów (K6 / H-5 pkt 5). */
  analizaWerdykt: 'Werdykt projektowy',
  // Opisy przekroczeń (rozpływ — napięcie)
  opisNapiecieWysokie: 'Napięcie powyżej dopuszczalnego zakresu',
  opisNapiecieNiskie: 'Napięcie poniżej dopuszczalnego zakresu',
  /** Brak zbieżności rozpływu — wynik nie jest rozwiązaniem sieci. */
  opisBrakZbieznosci: 'Rozpływ mocy nie osiągnął zbieżności — wynik nie jest rozwiązaniem sieci',
  /** Pozycja bez pojedynczego elementu modelu (agregat systemowy). */
  elementCalaSiec: 'Cała sieć',
  iteracje: (n: number) => `${n} iteracji`,
  naruszen: (n: number) => `Naruszeń: ${n}`,
  jednPU: 'p.u.',
  // Akcja adresowa dla pozycji bez elementu modelu (okno diagnostyki).
  otworzDiagnostyke: 'Otwórz diagnostykę zbieżności',
  otworzDiagnostykeOpis: 'Przechodzi do okna „Zbieżność" — ślad iteracji i przyczyna zatrzymania.',
  // Stan „sieć w normie" — jawne następne kroki (K6 / H-5 pkt 3).
  dokumentacjaAkcja: 'Domknij dokumentację',
  dokumentacjaAkcjaOpis: 'Otwiera przestrzeń „Dokumentacja" — raport i dowód obliczeń.',
  porownanieAkcja: 'Porównaj warianty',
  porownanieAkcjaOpis: 'Otwiera okno porównania A/B przebiegów tego projektu.',
} as const;
