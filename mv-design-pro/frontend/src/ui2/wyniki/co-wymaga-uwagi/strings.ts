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
  // Opisy przekroczeń (rozpływ — napięcie)
  opisNapiecieWysokie: 'Napięcie powyżej dopuszczalnego zakresu',
  opisNapiecieNiskie: 'Napięcie poniżej dopuszczalnego zakresu',
  jednPU: 'p.u.',
} as const;
