/*
 * Teksty przestrzeni „Gotowość" (W-401, karta E6.1) — wyłącznie polski język
 * techniczny (MODEL_INTERAKCJI §2 reguła 7 — karta odwołuje się do niej jako
 * „§2.7"). Kody gotowości NIE są tekstem pierwszoplanowym — pojawiają się
 * wyłącznie w atrybucie `title` (dymek) i w trybie eksperckim (wzorzec
 * `SzczegolyTechniczne` z `ui2/inspector/InspectorPanel.tsx`). Centralizacja
 * etykiet: brak literałów w JSX (zgodność z `ui_terminology_guard.py`, który
 * skanuje tekst JSX i właściwości `label`/`title`/`description`/`message`/
 * `placeholder`).
 */

export const GOTOWOSC_STRINGS = {
  // Nagłówek przestrzeni
  tytul: 'Gotowość',
  podtytul: 'Braki pogrupowane wg celu inżyniera — z postępem i akcją naprawczą.',

  // Stany przestrzeni
  brakProjektu: 'Nie otwarto projektu',
  brakProjektuOpis: 'Otwórz projekt, aby zobaczyć kontrolę gotowości.',
  ladowanie: 'Wczytywanie…',
  blad: 'Błąd wczytywania gotowości',

  // Stan pozytywny — wszystko gotowe
  wszystkoGotowe: 'Gotowe do analiz',
  wszystkoGotoweOpis:
    'Kontrola techniczna układu nie wskazuje braków — można uruchomić obliczenia.',

  // Podsumowanie nagłówka
  podsumowanieBlokady: 'Blokady',
  podsumowanieOstrzezenia: 'Ostrzeżenia',

  // Wagi problemów
  wagaBlokada: 'BLOKADA',
  wagaOstrzezenie: 'OSTRZEŻENIE',

  // Sekcja celu
  postep: 'Postęp',
  brakProblemowWCelu: 'Brak braków w tym celu.',
  zwin: 'Zwiń',
  rozwin: 'Rozwiń',

  // Etykiety celów gotowości (grupowanieCelow.ts)
  celStacje: 'Do przygotowania schematu (stacje i pola)',
  celZgodnoscReferencyjna: 'Zgodność referencyjna',
  celWspolne: 'Do uruchomienia obliczeń (model i katalog)',
  celZwarcia: 'Do obliczeń zwarciowych',
  celRozplyw: 'Do rozpływu mocy',
  celZabezpieczenia: 'Do koordynacji zabezpieczeń',
  celWniosekOsd: 'Do wniosku OSD',
  celPozostale: 'Pozostałe',

  // Sekcja „Ocena zgodności referencyjnej" (Reference Engine V1, HANDOFF pkt 2.1)
  refSekcjaTytul: 'Ocena zgodności referencyjnej',
  refSekcjaOpis:
    'Zgodność projektu z referencjami (normy IEC, rodziny rozdzielnic, standardy OSD). ' +
    'Ocena obejmuje wyłącznie pola z danymi aparatów — „nie dotyczy" oznacza brak ' +
    'sprawdzeń stosowalnych.',
  refBrakPrzypadku: 'Wybierz zakres obliczeń, aby zobaczyć ocenę zgodności referencyjnej.',
  refLadowanie: 'Wczytywanie oceny zgodności referencyjnej…',
  refBlad: 'Błąd wczytywania oceny zgodności referencyjnej',
  refBrakPakietow: 'Brak pakietów referencyjnych do oceny.',
  refKolPakiet: 'Referencja',
  refKolRodzaj: 'Rodzaj',
  refKolWersja: 'Wersja',
  refKolSprawdzenia: 'Zaliczone / oblane',
  refKolWynik: 'Wynik',
  refNieDotyczy: 'nie dotyczy',
  refCheckZgodne: 'zgodne',
  refCheckNiezgodne: 'niezgodne',
  refBrakSprawdzen: 'Brak sprawdzeń w tym pakiecie.',

  // Filtry (waga / cel / gałąź)
  filtrTytul: 'Filtry',
  filtrWagaEtykieta: 'Waga',
  filtrWagaWszystkie: 'Wszystkie wagi',
  filtrCelEtykieta: 'Cel',
  filtrCelWszystkie: 'Wszystkie cele',
  filtrSzukajEtykieta: 'Szukaj wg elementu',
  filtrSzukajPlaceholder: 'Numer lub nazwa elementu…',
  filtrWyczysc: 'Wyczyść filtry',
  filtrBrakWynikow: 'Filtr nie wskazuje braków.',

  // Wiersz problemu
  napraw: 'Napraw…',
  wymagaInterwencji: 'Wymaga interwencji projektanta',
  kodTechniczny: 'Kod techniczny',
  element: 'Element',

  // ARIA — ogłoszenie na żywo (bez remountu, karta §4 kryterium 3)
  ariaZmianaGotowosci: (blokady: number, ostrzezenia: number): string =>
    `Gotowość zaktualizowana: ${blokady} ${blokady === 1 ? 'blokada' : 'blokad'}, ` +
    `${ostrzezenia} ${ostrzezenia === 1 ? 'ostrzeżenie' : 'ostrzeżeń'}.`,
} as const;
