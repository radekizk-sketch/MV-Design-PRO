/** Teksty PL kreatora „Złącze kablowe SN (ZKSN)". Język inżynierski. */

export const ZKSN_STRINGS = {
  eyebrow: 'MODEL SIECI · ZŁĄCZE KABLOWE SN',
  cel:
    'Wstaw złącze kablowe SN (ZKSN) na odcinku kablowym — rozdzielnica z polami, która dzieli tor '
    + 'i tworzy węzeł odgałęzienia. Wariant katalogowy wyznacza liczbę portów odgałęzienia; z ZKSN '
    + 'wolno wyprowadzić wyłącznie kabel SN.',
  odznaka: 'Nowe ZKSN',

  krokKatalog: 'Wariant i położenie',
  krokZapis: 'Podsumowanie i zapis',

  typKatalog: 'Wariant ZKSN z katalogu',
  typKatalogPlaceholder: '— wybierz wariant ZKSN —',
  typBlad: 'Nie udało się pobrać katalogu ZKSN.',
  typPomoc: 'Wariant wnosi układ pól i liczbę portów odgałęzienia — z katalogu.',

  nazwa: 'Nazwa ZKSN',
  nazwaPlaceholder: 'np. ZK-3 tor kablowy A',
  wariant: 'Wariant',
  polozenie: 'Położenie na odcinku',
  polozeniePomoc: 'Ułamek długości odcinka (0–1): 0,5 = w połowie. Dzieli odcinek na dwie sekcje.',

  paramLacznik: 'Aparat pola',
  paramPorty: 'Porty odgałęzienia',

  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Z ZKSN poprowadzisz odgałęzienie kablem SN (kolejny krok flow). Węzeł jest bezimpedancyjny — '
    + 'nie zmienia rozpływu, wyznacza tylko punkt odgałęzienia i sekcjonowania toru kablowego.',

  kontrolaTytul: 'Kontrola ZKSN',
  wierszOdcinek: 'Odcinek',
  wierszTor: 'Tor',
  wierszWariant: 'Wariant',
  wierszPolozenie: 'Położenie',

  brakOdcinkaTytul: 'Brak wskazania odcinka',
  brakOdcinkaOpis:
    'Zaznacz na schemacie odcinek kablowy SN, na którym chcesz wstawić ZKSN, a następnie uruchom '
    + 'ten krok.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz ZKSN',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem ZKSN.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać ZKSN.',
  // S9-5 (klasa: bramka enable bez sygnału gotowości, `karta_e2e_s95.md`) —
  // katalog wariantów ZKSN ładuje się asynchronicznie; zapis bez niego byłby
  // cichym no-op na pustym `catalog_ref`, więc blokujemy JAWNIE.
  katalogLadowanieStopka: 'Ładowanie katalogu wariantów ZKSN — zapis będzie dostępny po wczytaniu.',

  // Panel teorii (V12K-066)
  teoriaTytul: 'Teoria: złącze kablowe SN i węzeł odgałęzienia',
  teoriaOpis:
    'ZKSN to rozdzielnica kablowa średniego napięcia z polami liniowymi i aparatami łączeniowymi, '
    + 'wstawiana w torze kablowym, aby utworzyć węzeł odgałęzienia bez transformatora SN/nN. '
    + 'Elektrycznie węzeł jest bezimpedancyjny — potencjał wspólny dla zbiegających się kabli, a prąd '
    + 'rozdziela się zgodnie z I prawem Kirchhoffa $I_{we} = \\sum_k I_{k}$ na porty odgałęzienia. '
    + 'ZKSN nie wnosi spadku napięcia ($Z = 0$); spadek powstaje na kablach. Aparaty pól (rozłączniki) '
    + 'pozwalają sekcjonować tor — ich stan honoruje rozpływ mocy (pole otwarte = brak przepływu).',
  teoriaWymog:
    'Przekrój kabli odgałęzień dobiera się do prądu portu i wytrzymałości zwarciowej '
    + '($I_{th} \\ge I_k \\cdot \\sqrt{t_k}$); aparaty pól muszą wytrzymać prąd roboczy i zwarciowy. '
    + 'Liczba portów wynika z wariantu katalogowego rozdzielnicy.',
  teoriaPodstawa: 'Podstawa: PN-EN 62271-200 (rozdzielnice SN), IRiESD (praca sieci kablowej SN).',
} as const;
