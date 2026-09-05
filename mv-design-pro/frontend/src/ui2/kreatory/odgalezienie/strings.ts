/** Teksty PL kreatora „Odgałęzienie SN". Język inżynierski. */

export const ODGALEZIENIE_STRINGS = {
  eyebrow: 'MODEL SIECI · ODGAŁĘZIENIE SN',
  cel:
    'Rozpocznij odgałęzienie SN od wskazanego zacisku źródła (szyna, słup, ZKSN) — utwórz pierwszy '
    + 'odcinek nowego ciągu. Rodzaj odcinka (kabel / linia napowietrzna) i przekrój dobierasz z '
    + 'katalogu; zakończenie (stacja, ZKSN, słup) dodasz w kolejnym kroku flow.',
  odznaka: 'Nowe odgałęzienie SN',

  krokOdcinek: 'Odcinek i katalog',
  krokZapis: 'Podsumowanie i zapis',

  zrodloSekcja: 'Zacisk źródła odgałęzienia',
  zrodloPunkt: 'Punkt startu',
  zrodloTyp: 'Typ źródła',
  zrodloNazwa: 'Nazwa źródła',

  rodzaj: 'Rodzaj odcinka',
  rodzajOpcje: [
    { id: 'cable', etykieta: 'Kabel SN' },
    { id: 'line_overhead', etykieta: 'Linia napowietrzna SN' },
  ],
  rodzajPomoc: 'Kabel dla toru kablowego (ZKSN, stacje kablowe); linia napowietrzna dla słupów.',
  dlugosc: 'Długość odgałęzienia',
  dlugoscPomoc: 'Długość pierwszego odcinka [km] — wpływa na spadek napięcia i straty.',

  typKatalog: 'Typ odcinka z katalogu',
  typKatalogPlaceholder: '— wybierz typ z katalogu —',
  typBlad: 'Nie udało się pobrać katalogu odcinków SN.',
  typPomoc: 'Katalog wnosi rezystancję, reaktancję i obciążalność żyły — bez ręcznych impedancji.',

  paramObciazalnosc: 'Obciążalność',
  paramPrzekroj: 'Przekrój',
  paramNapiecie: 'Napięcie znamionowe',

  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Powstaje wolny zacisk trasy SN — w kolejnym kroku zakończysz odgałęzienie stacją, ZKSN albo '
    + 'słupem. Rozpływ mocy i spadek napięcia policzą się po dobraniu katalogu i zamknięciu ciągu.',

  kontrolaTytul: 'Kontrola odgałęzienia',
  wierszZrodlo: 'Źródło',
  wierszRodzaj: 'Rodzaj',
  wierszDlugosc: 'Długość',
  wierszKatalog: 'Katalog',

  brakZrodlaTytul: 'Brak wskazania źródła',
  brakZrodlaOpis:
    'Wskaż jawny zacisk odgałęzienia (szyna, słup rozgałęźny albo ZKSN) na schemacie, a następnie '
    + 'uruchom ten krok.',
  wymuszonyTorSlup:
    'Słup rozgałęźny jest węzłem linii napowietrznej — odgałęzienie ze słupa prowadź linią '
    + 'napowietrzną SN.',
  wymuszonyTorZksn:
    'ZKSN jest rozdzielnicą toru kablowego — odgałęzienie z ZKSN prowadź odcinkiem kablowym.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Rozpocznij odgałęzienie',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed rozpoczęciem odgałęzienia.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby rozpocząć odgałęzienie.',
  // S9-5 (klasa: bramka enable bez sygnału gotowości, `karta_e2e_s95.md`) —
  // katalog kabli/linii ładuje się asynchronicznie; zapis bez niego byłby
  // cichym no-op na pustym `catalog_ref`, więc blokujemy JAWNIE.
  katalogLadowanieStopka: 'Ładowanie katalogu typów odcinków SN — zapis będzie dostępny po wczytaniu.',

  // Panel teorii (V12K-066)
  teoriaTytul: 'Teoria: podział prądu i dobór przekroju odgałęzienia',
  teoriaOpis:
    'Odgałęzienie odbiera część prądu magistrali w węźle odczepu — zgodnie z I prawem Kirchhoffa '
    + '$I_{mag} = I_{dalej} + I_{odg}$. Prąd odgałęzienia zależy od mocy odbiorów za nim: '
    + '$I_{odg} = \\dfrac{S_{odg}}{\\sqrt{3}\\,U_n}$. Na odcinku odgałęzienia powstaje spadek napięcia '
    + '$\\Delta U \\approx \\sqrt{3}\\,I_{odg}\\,(R\\cos\\varphi + X\\sin\\varphi)\\,l$, gdzie $R$, $X$ pochodzą z '
    + 'katalogu odcinka, a $l$ to długość. Przekrój żyły dobiera się do prądu roboczego i obciążalności '
    + 'długotrwałej, a tor (kabel / linia) wynika z rodzaju źródła i trasy.',
  teoriaWymog:
    'Prąd roboczy nie może przekraczać obciążalności żyły ($I_{odg} \\le I_z$), a spadek napięcia na '
    + 'całym ciągu powinien mieścić się w limicie projektowym. Przekrój sprawdza się dodatkowo na '
    + 'wytrzymałość zwarciową ($I_{th} \\ge I_k\\,\\sqrt{t_k}$).',
  teoriaPodstawa: 'Podstawa: PN-HD 60364-5-52 (dobór przewodów), IRiESD (spadki napięcia SN).',
} as const;
