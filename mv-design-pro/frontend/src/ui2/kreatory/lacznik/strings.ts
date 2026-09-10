/** Teksty PL kreatora „Łącznik sekcyjny SN" (G-SEK). Język inżynierski. */

export const LACZNIK_STRINGS = {
  eyebrow: 'MODEL SIECI · ŁĄCZNIK SEKCYJNY SN',
  cel:
    'Wstaw łącznik na odcinku SN — dzieli ciąg na sekcje i pozwala go sekcjonować. '
    + 'Stan normalny (zamknięty/otwarty) wyznacza punkt normalnie otwarty (NOP); '
    + 'rozpływ mocy honoruje go realnie — otwarty łącznik daje pracę radialną.',
  odznaka: 'Nowy łącznik SN',

  krokAparat: 'Aparat i położenie',
  krokZapis: 'Podsumowanie i zapis',

  typKatalog: 'Aparat łącznika z katalogu',
  typKatalogPlaceholder: '— wybierz aparat SN —',
  typBlad: 'Nie udało się pobrać katalogu aparatów SN.',
  typPomoc: 'Aparat wnosi napięcie i prąd znamionowy oraz zdolność łączeniową — z katalogu.',

  nazwa: 'Nazwa łącznika',
  nazwaPlaceholder: 'np. Ł-sekc. magistrala A',
  rodzaj: 'Rodzaj aparatu',
  rodzajOpcje: [
    { id: 'ROZLACZNIK', etykieta: 'Rozłącznik' },
    { id: 'WYLACZNIK', etykieta: 'Wyłącznik' },
    { id: 'ODLACZNIK', etykieta: 'Odłącznik' },
  ],
  stan: 'Stan normalny',
  stanOpcje: [
    { id: 'closed', etykieta: 'Zamknięty' },
    { id: 'open', etykieta: 'Otwarty (NOP)' },
  ],
  polozenie: 'Położenie na odcinku',
  polozeniePomoc: 'Ułamek długości odcinka (0–1): 0,5 = w połowie. Dzieli odcinek na dwie sekcje.',

  paramNapiecie: 'Napięcie znamionowe',
  paramPrad: 'Prąd znamionowy',
  paramZwarcie: 'Zdolność wyłączania',

  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Rozpływ mocy uwzględni stan łącznika (otwarty = przerwa galwaniczna, praca radialna); '
    + 'sekcjonowanie wpływa na pewność zasilania i analizę pierścieni.',

  kontrolaTytul: 'Kontrola łącznika',
  wierszOdcinek: 'Odcinek',
  wierszAparat: 'Aparat',
  wierszStan: 'Stan normalny',
  wierszPolozenie: 'Położenie',

  brakOdcinkaTytul: 'Brak wskazania odcinka',
  brakOdcinkaOpis:
    'Zaznacz na schemacie odcinek SN, na którym chcesz wstawić łącznik sekcyjny, '
    + 'a następnie uruchom ten krok.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz łącznik SN',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem łącznika.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać łącznik.',
  // S9-5 (klasa: bramka enable bez sygnału gotowości, `karta_e2e_s95.md`) —
  // katalog aparatów SN ładuje się asynchronicznie; zapis bez niego byłby
  // cichym no-op na pustym `catalog_ref`, więc blokujemy JAWNIE.
  katalogLadowanieStopka: 'Ładowanie katalogu aparatów SN — zapis będzie dostępny po wczytaniu.',

  // Panel teorii (V12K-066: standard „must-have")
  teoriaTytul: 'Teoria: łącznik sekcyjny i punkt podziału sieci',
  teoriaOpis:
    'Łącznik sekcyjny dzieli magistralę SN na sekcje. Jego stan normalny decyduje o topologii '
    + 'pracy: zamknięty łączy sekcje (zasilanie ciągłe), otwarty tworzy punkt podziału (NOP) — '
    + 'sieć pracuje wtedy promieniowo, a łącznik stanowi rezerwę do przełączeń awaryjnych. '
    + 'Rozłącznik przełącza prąd roboczy, wyłącznik dodatkowo wyłącza prąd zwarciowy. Stan łącznika '
    + 'jest honorowany przez rozpływ mocy (gałąź otwarta = brak przepływu) — wybór realnie zmienia '
    + 'rozkład obciążeń, straty i pewność zasilania.',
  teoriaWymog:
    'Aparat dobiera się do prądu roboczego i zwarciowego sekcji; punkt podziału planuje się tak, '
    + 'by po przełączeniu żaden odcinek nie był przeciążony ani nie spadł poniżej dopuszczalnego napięcia.',
  teoriaPodstawa: 'Podstawa: PN-EN 62271 (aparatura rozdzielcza), IRiESD (praca sieci SN).',
} as const;
