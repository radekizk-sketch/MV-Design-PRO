/* Stringi PL ekranu „Werdykt projektowy" (karta F-K3, etap E7 flow projektanta). */

export const WERDYKT_STRINGS = {
  tytul: 'Werdykt projektowy',
  cel: 'Jedna odpowiedź na pytanie „czy ten projekt spełnia wymagania i czego jeszcze brakuje?" — rejestr kryteriów z odniesieniem normowym i drogą do przyczyny.',

  // Werdykt całościowy
  werdyktSpelnione: 'Projekt spełnia sprawdzane kryteria',
  werdyktNaruszone: 'Projekt narusza kryteria — wymaga poprawy',
  werdyktNiesprawdzone: 'Werdykt niepełny — część kryteriów bez podstawy do oceny',
  werdyktOpisSpelnione: 'Wszystkie kryteria objęte automatyczną weryfikacją są dotrzymane. Sprawdź zakres poniżej — nie każde kryterium projektu jest sprawdzane automatycznie.',
  werdyktOpisNaruszone: 'Zacznij od pozycji naruszonych: każda prowadzi do elementu, który ją powoduje.',
  werdyktOpisNiesprawdzone: 'Brak naruszeń wśród kryteriów sprawdzonych, ale część nie ma podstawy do oceny — to NIE to samo co spełnienie.',

  // Stany kryterium
  stanSpelnione: 'Spełnione',
  stanNaruszone: 'Naruszone',
  stanNiesprawdzone: 'Niesprawdzone',
  stanNieDotyczy: 'Nie dotyczy',

  // Podsumowanie
  podsumowanie: (p: { spelnione: number; naruszone: number; niesprawdzone: number }) =>
    `Spełnione: ${p.spelnione} · Naruszone: ${p.naruszone} · Niesprawdzone: ${p.niesprawdzone}`,

  // Nagłówki pozycji
  kolEtap: 'Etap',
  kolKryterium: 'Kryterium',
  kolStan: 'Stan',
  kolZakres: 'Zakres oceny',
  kolPrzyczyna: 'Przyczyna / element wiodący',
  kolDecyzja: 'Decyzja',

  // Opisy zakresu oceny pozycji
  zakresOceny: (p: { ocenione: number; naruszone: number; niesprawdzone: number }) =>
    `${p.ocenione} ocenionych · ${p.naruszone} naruszeń · ${p.niesprawdzone} bez danych`,
  ostrzezenia: (n: number) => `w granicy limitu: ${n}`,

  // Źródła danych (kontrakt ekranu prowadzącego, punkt 2)
  zrodlaTytul: 'Skąd dane',
  zrodloRozplyw: 'Bieg rozpływu mocy',
  zrodloZwarcie: 'Bieg zwarciowy',
  zrodloModel: 'Model sieci',
  zrodloAktualny: 'aktualny wobec modelu',
  zrodloNieaktualny: 'NIEAKTUALNY — model zmieniony po biegu',
  zrodloNiedostepny: 'brak wyniku',

  // Zakres poza automatem
  zakresTytul: 'Kryteria poza automatyczną weryfikacją',
  zakresOpis: 'Te kryteria projektu system sprawdza tylko rękami projektanta — werdykt powyżej ich nie obejmuje.',

  // Stany zerowe i błędy
  brakPrzypadku: 'Brak aktywnego przypadku obliczeniowego.',
  brakPrzypadkuKrok: 'Wybierz lub utwórz przypadek obliczeniowy, aby rozliczyć kryteria projektu.',
  ladowanie: 'Zestawianie kryteriów projektu…',
  bladDomyslny: 'Nie udało się pobrać werdyktu projektowego.',

  // Akcje
  ariaTabela: 'Rejestr kryteriów projektu',
} as const;
