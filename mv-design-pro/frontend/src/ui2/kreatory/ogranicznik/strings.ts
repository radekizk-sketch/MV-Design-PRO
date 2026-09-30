/** Teksty PL kreatora „Dodaj ogranicznik przepięć SN" (G-STK-8). Język inżynierski. */

export const OGRANICZNIK_STRINGS = {
  eyebrow: 'MODEL SIECI · OCHRONA PRZEPIĘCIOWA',
  cel:
    'Postaw ogranicznik przepięć (SPD) w wybranym polu SN. Parametry — U_m, MCOV, '
    + 'napięcie obniżone przy 10 kA, klasa energetyczna, poziom ochrony BIL — bierzesz '
    + 'z katalogu. Ogranicznik rysuje się na schemacie i wchodzi do koordynacji izolacji '
    + 'IEC 60071 (margines BIL liczy solver).',
  odznaka: 'Nowy ogranicznik SN',

  krokTyp: 'Typ ogranicznika i miejsce',
  krokZapis: 'Podsumowanie i zapis',

  typKatalog: 'Typ ogranicznika z katalogu',
  typKatalogPlaceholder: '— wybierz typ ogranicznika —',
  typBlad: 'Nie udało się pobrać katalogu ograniczników przepięć SN.',
  typPomoc:
    'Typ wnosi U_m, MCOV, napięcie obniżone U_res(10 kA) i poziom ochrony BIL — '
    + 'wartości z karty katalogowej (PN-EN 60099-4), nie z ręki.',

  // Parametry katalogu (odczyt).
  paramUm: 'Najwyższe napięcie urządzenia U_m',
  paramMcov: 'Trwałe napięcie robocze MCOV',
  paramUres: 'Napięcie obniżone U_res (10 kA)',
  paramKlasa: 'Klasa energetyczna',
  paramBil: 'Chroniony poziom BIL',

  // Downstream — „co to uruchamia".
  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Ogranicznik rysuje się na schemacie (glif SPD w gałęzi uziemiającej pola) i wchodzi '
    + 'do analizy koordynacji izolacji IEC 60071 — solver policzy margines BIL '
    + '(U_res względem poziomu wytrzymałości udarowej) dla węzła pola.',

  // Kontrola / gotowość.
  kontrolaTytul: 'Kontrola ogranicznika',
  wierszTyp: 'Typ z katalogu',
  wierszMiejsce: 'Miejsce (pole/szyna)',
  wierszUm: 'U_m',
  wierszBil: 'BIL',

  // Uczciwy stan zerowy.
  brakMiejscaTytul: 'Brak wskazania pola SN',
  brakMiejscaOpis:
    'Zaznacz na schemacie pole SN (lub szynę SN), w którym chcesz postawić ogranicznik '
    + 'przepięć, a następnie uruchom ten krok. Ogranicznik dołączamy do istniejącego pola.',
  ostrzezenieNapiecie:
    'U_m ogranicznika jest niższe od napięcia szyny — dobierz typ o U_m ≥ napięcie sieci.',

  podsumowanieTytul: 'Podsumowanie ogranicznika',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz ogranicznik SN',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem ogranicznika.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać ogranicznik.',
  // S9-5 (klasa: bramka enable bez sygnału gotowości, `karta_e2e_s95.md`) —
  // katalog ograniczników ładuje się asynchronicznie; zapis bez niego byłby
  // cichym no-op na pustym `catalog_ref`, więc blokujemy JAWNIE.
  katalogLadowanieStopka: 'Ładowanie katalogu ograniczników przepięć SN — zapis będzie dostępny po wczytaniu.',

  // Panel teorii (V12K-066: standard „must-have").
  teoriaTytul: 'Teoria: koordynacja izolacji i ochrona przepięciowa (IEC 60071)',
  teoriaOpis:
    'Ogranicznik przepięć (warystor MO, PN-EN 60099-4) ogranicza przepięcia atmosferyczne i '
    + 'łączeniowe, odprowadzając prąd udarowy do ziemi i utrzymując napięcie na chronionym '
    + 'urządzeniu poniżej jego wytrzymałości udarowej BIL. Trwałe napięcie robocze MCOV musi '
    + 'przewyższać napięcie fazowe sieci (a przy sieci izolowanej/skompensowanej — z zapasem na '
    + 'przepięcia ziemnozwarciowe TOV). Kluczowa jest różnica między poziomem ochrony (napięcie '
    + 'obniżone U_res przy prądzie znamionowym) a poziomem BIL izolacji — margines BIL. '
    + 'Zbyt niskie MCOV grozi przyspieszonym starzeniem, zbyt wysokie — słabą ochroną.',
  teoriaWymog:
    'Margines koordynacji: $\\mathrm{BIL} \\ge U_{\\mathrm{res}}$ z zapasem (IEC 60071 zaleca ~20%). MCOV dobiera się do '
    + 'układu punktu neutralnego (izolowany/skompensowany/uziemiony) i przewidywanego TOV.',
  teoriaPodstawa:
    'Podstawa: PN-EN 60071 (koordynacja izolacji), PN-EN 60099-4 (ograniczniki MO).',
} as const;
