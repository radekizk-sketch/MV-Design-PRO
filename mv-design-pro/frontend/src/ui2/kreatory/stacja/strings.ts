/** Teksty PL kreatora „Dodaj stację SN/nN" (Audyt D, faza D2). Język inżynierski. */

export const STACJA_STRINGS = {
  eyebrow: 'MODEL SIECI · STACJA SN/nN',
  cel:
    'Osadź stację transformatorową SN/nN na magistrali: wybierz rodzaj stacji, '
    + 'dobierz transformator z katalogu do napięcia nN odbioru i zapisz. Umiejscowienie '
    + '(koniec odcinka lub świadomy podział) wynika ze wskazanego miejsca na schemacie.',
  odznaka: 'Nowa stacja',

  krokRodzaj: 'Rodzaj i umiejscowienie',
  krokTransformator: 'Transformator i strona nN',
  krokRozdzielnica: 'Rozdzielnica SN',
  krokNn: 'Blok nN',
  krokZapis: 'Podsumowanie i zapis',

  // Krok 1 — rodzaj.
  typStacji: 'Rodzaj stacji',
  typStacjiOpcje: [
    { id: 'terminal', etykieta: 'Końcowa (wejście + transformator)' },
    { id: 'branch', etykieta: 'Odgałęźna (wejście + wyjście + odgałęzienie)' },
    { id: 'inline', etykieta: 'Przelotowa (wejście + wyjście)' },
    { id: 'sectional', etykieta: 'Sekcyjna (ze sprzęgłem)' },
  ],
  typStacjiPomoc:
    'Końcowa zamyka ciąg jednym polem zasilającym (bez pól wyjściowych/odgałęźnych); '
    + 'odgałęźna oddaje odczep w bok (wejście + wyjście + odgałęzienie); przelotowa wcina się '
    + 'w ciąg (wejście + wyjście); sekcyjna dzieli szynę sprzęgłem. '
    + 'Rodzaj decyduje o polach rozdzielnicy SN.',
  nazwa: 'Nazwa stacji',
  nazwaPlaceholder: 'np. Stacja ST-3',
  nazwaPomoc: 'Puste — backend nada unikatową nazwę domyślną (kod stacji).',

  // Umiejscowienie.
  umiejscowienieTytul: 'Umiejscowienie na magistrali',
  umiejscowienieKoniec: 'Zakończenie odcinka stacją',
  umiejscowienieKoniecOpis:
    'Stacja powstaje na wolnym końcu wskazanego ciągu — bez rozcinania istniejących odcinków. '
    + 'Terminal końcowy staje się szyną SN nowej stacji.',
  umiejscowieniePodzial: 'Świadomy podział odcinka',
  umiejscowieniePodzialOpis:
    'Wskazany odcinek zostaje rozdzielony w zadanym punkcie, a stacja wstawiona w miejscu podziału. '
    + 'Powstają dwa odcinki: przed i za stacją.',
  umiejscowieniePozycja: 'Punkt podziału odcinka',
  umiejscowienieTerminal: 'Terminal końcowy',
  umiejscowienieSegment: 'Dzielony odcinek',
  umiejscowienieBrakTytul: 'Brak miejsca osadzenia stacji',
  umiejscowienieBrakOpis:
    'Wskaż na schemacie koniec odcinka (do zakończenia stacją) lub odcinek magistrali (do podziału), '
    + 'a następnie ponów operację dodania stacji.',

  // Krok 2 — transformator i strona nN.
  konfiguracjaNn: 'Konfiguracja strony nN',
  konfiguracjaNnOpcje: [
    { id: 'LOAD_NN', etykieta: 'Rozdzielnia nN odbiorcza' },
    { id: 'CUSTOM_NN', etykieta: 'Własne napięcie strony nN' },
    { id: 'PV_INVERTER', etykieta: 'PV przez falownik (za transformatorem)' },
    { id: 'BESS_INVERTER', etykieta: 'Magazyn energii BESS przez falownik' },
    { id: 'FW_INVERTER', etykieta: 'Elektrownia wiatrowa przez falownik' },
  ],
  konfiguracjaNnPomoc:
    'Odbiorcza: stacja zasila odbiory nN (0,4 kV — typowa rozdzielnia). Własne napięcie: '
    + 'wybierasz jawnie napięcie strony nN z rozszerzonej listy (do 6,3 kV). Warianty źródłowe '
    + '(PV / magazyn BESS / elektrownia wiatrowa): za transformatorem pracuje źródło przez falownik — '
    + 'napięcie strony nN i moc wynikają z katalogu falownika właściwego rodzaju, a transformator '
    + 'dobiera się do tych wartości.',
  falownikPlaceholder: '— wybierz falownik z katalogu —',
  falownikPomoc:
    'Pozycja katalogowa falownika (rodzaj wynika z wybranego wariantu źródła) wyznacza napięcie '
    + 'strony nN (un) i moc źródła — transformator dobiera się do tych wartości. Brak wyboru '
    + 'blokuje dobór transformatora.',
  falownikBlad: 'Nie udało się pobrać katalogu falowników.',
  wymNnOdczyt: 'Wymagane napięcie strony nN',
  wymNnOczekuje: 'oczekuje na wybór falownika',
  nnVoltage: 'Napięcie nN odbioru',
  nnVoltageOpcje: [
    { id: '0.4', etykieta: '0,4 kV (400 V)' },
    { id: '0.69', etykieta: '0,69 kV (690 V)' },
  ],
  nnVoltageCustom: 'Napięcie strony nN (własne)',
  nnVoltageCustomOpcje: [
    { id: '0.4', etykieta: '0,4 kV (400 V)' },
    { id: '0.5', etykieta: '0,5 kV (500 V)' },
    { id: '0.69', etykieta: '0,69 kV (690 V)' },
    { id: '0.8', etykieta: '0,8 kV (800 V)' },
    { id: '1', etykieta: '1 kV (1000 V)' },
    { id: '3.15', etykieta: '3,15 kV' },
    { id: '6', etykieta: '6 kV' },
    { id: '6.3', etykieta: '6,3 kV' },
  ],
  nnVoltageCustomPomoc:
    'Jawnie wybrane napięcie strony nN dla nietypowej rozdzielni — transformator dobiera się '
    + 'z katalogu do tej przekładni (blokada, gdy brak zgodnego typu).',
  nnVoltagePomoc: 'Napięcie strony dolnej dobiera transformator z katalogu (przekładnia SN/nN).',
  // Etykiety per wariant źródła (falownik / sekcja / pole źródłowe / stany zerowe).
  zrodloEtykiety: {
    PV_INVERTER: {
      falownik: 'Falownik PV z katalogu',
      sekcja: 'Źródło PV za transformatorem',
      poleWartosc: 'ZRODLO_NN_PV (falownik) + odpływy odbiorcze',
      wyborBrak: 'Wybierz falownik PV z katalogu w kroku „Transformator i strona nN".',
      katalogBrak:
        'Brak w katalogu falowników PV zdatnych na źródło nN stacji (napięcie strony nN ≤ 1 kV). '
        + 'Uzupełnij katalog falowników PV.',
    },
    BESS_INVERTER: {
      falownik: 'Falownik magazynu BESS z katalogu',
      sekcja: 'Magazyn energii BESS za transformatorem',
      poleWartosc: 'ZRODLO_NN_BESS (falownik) + odpływy odbiorcze',
      wyborBrak: 'Wybierz falownik magazynu BESS z katalogu w kroku „Transformator i strona nN".',
      katalogBrak:
        'Brak w katalogu falowników magazynu BESS zdatnych na źródło nN stacji (napięcie strony nN ≤ 1 kV). '
        + 'Uzupełnij katalog falowników BESS.',
    },
    FW_INVERTER: {
      falownik: 'Falownik elektrowni wiatrowej z katalogu',
      sekcja: 'Elektrownia wiatrowa za transformatorem',
      poleWartosc: 'ZRODLO_NN_FW (falownik) + odpływy odbiorcze',
      wyborBrak: 'Wybierz falownik elektrowni wiatrowej z katalogu w kroku „Transformator i strona nN".',
      katalogBrak:
        'Brak w katalogu falowników elektrowni wiatrowej zdatnych na źródło nN stacji (napięcie strony nN ≤ 1 kV). '
        + 'Uzupełnij katalog falowników.',
    },
  },
  snVoltageOdczyt: 'Napięcie SN szyny',
  typKatalog: 'Typ transformatora z katalogu',
  typKatalogPlaceholder: '— wybierz typ transformatora —',
  typKatalogPomoc:
    'Lista zawęża się do typów zgodnych z napięciem SN szyny i wybranym napięciem nN — '
    + 'parametry (moc, uk, przekładnia) pochodzą z katalogu.',
  typBlad: 'Nie udało się pobrać katalogu transformatorów SN/nN.',
  brakDoboru:
    'Brak w katalogu transformatora zgodnego z napięciem SN szyny i wybranym napięciem nN. '
    + 'Zmień napięcie nN lub uzupełnij katalog.',
  liczbaOdplywow: 'Liczba odpływów nN odbiorczych',
  liczbaOdplywowPomoc:
    'Blok nN: szyna nN, wyłącznik główny i odpływy odbiorcze. Dla PV dochodzi osobne '
    + 'pole źródłowe falownika (poza tą liczbą).',

  // Parametry katalogu (odczyt).
  paramMoc: 'Moc znamionowa',
  paramNapiecia: 'Napięcia SN/nN',
  paramUk: 'Napięcie zwarcia uk',

  // Krok 3 — rozdzielnica SN.
  producent: 'Producent rozdzielnicy SN',
  producentPomoc:
    'Pakiet katalogowy producenta rozdzielnicy SN wyznacza dostępne rodziny i kompletne '
    + 'szablony pól. Lista obejmuje wyłącznie producentów z konfiguracją katalogową.',
  producentPlaceholder: '— wybierz producenta —',
  rodzina: 'Rodzina rozdzielnicy',
  rodzinaPomoc:
    'Rodzina zawęża szablony pól do serii konstrukcyjnej zgodnej z napięciem SN szyny. '
    + 'Puste — pakiet standardowy producenta.',
  rodzinaPlaceholder: '— rodzina standardowa producenta —',
  poleRoliPomoc: 'Kompletny szablon pola z katalogu producenta (rozłącznik, przekładniki, zabezpieczenia).',
  polePlaceholder: '— dobór automatyczny —',
  podgladTytul: 'Podgląd pól rozdzielnicy SN',
  brakProducenta: 'Wybierz producenta rozdzielnicy SN, aby dobrać pola stacji.',
  brakRodzin: 'Producent nie udostępnia rodzin dla napięcia SN szyny — użyty pakiet standardowy.',
  brakSzablonow:
    'Brak kompletnych szablonów pól dla wybranego producenta/rodziny. Wybierz inny pakiet katalogowy '
    + 'lub uzupełnij katalog rozdzielnic SN.',
  rozdzielnicaBlad: 'Nie udało się pobrać katalogu rozdzielnic SN.',
  wierszRozdzielnica: 'Rozdzielnica',

  // Krok 4 — blok nN.
  nnBlokKonfiguracja: 'Konfiguracja strony nN',
  nnBlokNapiecie: 'Napięcie strony nN',
  nnBlokOdplywy: 'Odpływy odbiorcze nN',
  nnBlokZrodloFalownik: 'Falownik',
  nnBlokZrodloUn: 'Napięcie strony nN falownika',
  nnBlokZrodloMoc: 'Moc źródła',
  nnBlokZrodloPmax: 'Moc czynna maks.',
  nnBlokLabelPvPole: 'Pole źródłowe nN',

  // Zabezpieczenie źródła nN (intencja — dobór aparatu w edycji stacji).
  ochronaTytul: 'Zabezpieczenie źródła nN (intencja)',
  ochronaOpis:
    'Źródło PV wymaga wyłącznika nN i zabezpieczenia (nadprądowe, ziemnozwarciowe, koordynacja '
    + 'z wyłącznikiem głównym nN). Poniższa intencja trafia do modelu jako wymaganie — dobór '
    + 'CT/VT i nastaw uzupełnisz w edycji stacji.',
  ochronaAparat: 'Aparat zabezpieczający',
  ochronaChroniony: 'Obiekt chroniony',
  ochronaZakres: 'Zakres analizy',

  // Krok 5 — zapis.
  podsumTyp: 'Rodzaj stacji',
  podsumUmiejscowienie: 'Umiejscowienie',
  podsumTransformator: 'Transformator',
  podsumRozdzielnica: 'Rozdzielnica SN',
  podsumNn: 'Blok nN',
  podsumNnKonfiguracja: 'Konfiguracja nN',
  podsumZrodlo: 'Źródło nN',

  // Szybka ścieżka — stacja rekomendowana (skrót katalogowy).
  szybkaTytul: 'Gotowa stacja z katalogu',
  szybkaOpis:
    'Zapisuje kompletną stację z rekomendowanym transformatorem, pakietem rozdzielnicy SN '
    + 'i blokiem nN wynikającymi z bieżącej konfiguracji — bez ręcznego doboru pól.',
  szybkaZapisz: 'Zapisz gotową stację z katalogu',
  szybkaNiedostepna:
    'Skrót dostępny po wczytaniu katalogu i skompletowaniu konfiguracji (miejsce, transformator, '
    + 'rozdzielnica; dla PV — falownik).',

  // Kontrola.
  kontrolaTytul: 'Kontrola stacji',
  wierszTyp: 'Rodzaj',
  wierszUmiejscowienie: 'Umiejscowienie',
  wierszTransformator: 'Transformator',
  wierszNn: 'Blok nN',

  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Rozdzielnica SN i pola stacji, transformator SN/nN oraz szyna nN z odpływami (a dla PV — '
    + 'pole źródłowe falownika z intencją zabezpieczenia) trafią do modelu. Rozpływ mocy, zwarcia '
    + 'i dobór zabezpieczeń uwzględnią nową stację; dobór CT/VT i nastaw zabezpieczeń źródła '
    + 'uzupełnisz w edycji stacji.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz stację',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem stacji.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać stację.',

  // Panel teorii (V12K-066: standard „must-have").
  teoriaRodzajTytul: 'Teoria: rola stacji SN/nN i sposób osadzenia w sieci',
  teoriaRodzajOpis:
    'Stacja transformatorowa SN/nN transformuje napięcie średnie na niskie i zasila odbiory. Jej rodzaj '
    + 'odzwierciedla miejsce w topologii: stacja odbiorcza (odgałęźna) kończy odgałęzienie, przelotowa '
    + 'wcina się w ciąg magistrali (pole wejściowe i wyjściowe), a sekcyjna dzieli szynę SN sprzęgłem '
    + '(umożliwia rezerwowanie i sekcjonowanie). Sposób osadzenia — zakończenie wolnego końca ciągu albo '
    + 'świadomy podział istniejącego odcinka — jest operacją topologiczną: stacja zawsze powstaje na '
    + 'węźle, a nie „w powietrzu". Podział odcinka rozdziela go na dwie części o zachowanej długości.',
  teoriaRodzajWymog:
    'Rodzaj stacji dobiera się do funkcji w sieci (odbiór końcowy, przelot magistrali, sekcjonowanie). '
    + 'Świadomy podział stosuj, gdy stacja ma zasilać odbiór w środku istniejącego odcinka.',
  teoriaRodzajPodstawa: 'Podstawa: N SEP-E-001, IRiESD (układy sieci SN), dobra praktyka projektowa.',
  teoriaTrafoTytul: 'Teoria: dobór transformatora SN/nN — moc i przekładnia',
  teoriaTrafoOpis:
    'Transformator łączy szynę SN z szyną nN przez przekładnię napięciową (SN/nN). Napięcie nN odbioru '
    + 'wyznacza wymaganą stronę dolną transformatora, a napięcie SN szyny — stronę górną; katalog podaje '
    + 'zgodne typy. Moc znamionowa Sn ogranicza obciążalność stacji i dobiera się do mocy szczytowej '
    + 'odbiorów z zapasem. Napięcie zwarcia uk [%] decyduje o spadku napięcia pod obciążeniem i o udziale '
    + 'transformatora w prądzie zwarciowym po stronie nN. Wszystkie wartości pochodzą z katalogu; prądy, '
    + 'spadki i zwarcia liczy solver.',
  teoriaTrafoWymog:
    'Sn z zapasem nad mocą szczytową; napięcia i grupa połączeń zgodne z układem sieci (praca równoległa '
    + 'transformatorów wymaga tej samej grupy i zbliżonego uk).',
  teoriaTrafoPodstawa: 'Podstawa: PN-EN 60076, IEC 60909 (udział transformatora w zwarciu).',
  teoriaRozdzielnicaTytul: 'Teoria: pola rozdzielnicy SN i ich role',
  teoriaRozdzielnicaOpis:
    'Rozdzielnica SN grupuje pola przyłączone do wspólnej szyny. Pole liniowe wejściowe (WE) doprowadza '
    + 'zasilanie z magistrali, pole liniowe wyjściowe (WY) prowadzi je dalej wzdłuż ciągu, pole odgałęźne '
    + '(ODG) zasila odgałęzienie, a pole transformatorowe (TR) łączy szynę SN z transformatorem stacji. '
    + 'W stacji sekcyjnej pole sprzęgłowe (sprzęgło) łączy sekcje szyny, umożliwiając rezerwowanie i '
    + 'sekcjonowanie. Zestaw pól wynika z rodzaju stacji, a każde pole nosi kompletny szablon katalogowy '
    + '(rozłącznik/wyłącznik, przekładniki, zabezpieczenia) — parametry pochodzą z katalogu producenta.',
  teoriaRozdzielnicaWymog:
    'Każde pole musi mieć kompletny szablon katalogowy (pakiet producenta). Pola liniowe konfiguruj wg '
    + 'kierunku zasilania, pole TR wg mocy transformatora, sprzęgło wg schematu sekcjonowania.',
  teoriaRozdzielnicaPodstawa: 'Podstawa: PN-EN 62271-200 (rozdzielnice SN), N SEP-E-001, IRiESD.',
  teoriaNnTytul: 'Teoria: blok nN — rozdzielnia odbiorcza a źródła (PV / BESS / wiatr) za transformatorem',
  teoriaNnOpis:
    'Blok nN obejmuje szynę nN, wyłącznik główny i pola odpływowe. W wariancie odbiorczym '
    + 'stacja zasila odbiory: liczba odpływów odpowiada obwodom odbiorczym, a napięcie nN wybierasz '
    + 'z listy (0,4 kV to typowa rozdzielnia odbiorcza) — w wariancie „własne napięcie" z rozszerzonej '
    + 'listy (do 6,3 kV) dla nietypowej strony nN. W wariantach źródłowych za transformatorem pracuje '
    + 'generacja: falownik właściwego rodzaju (PV, magazyn energii BESS lub elektrownia wiatrowa) '
    + 'przyłącza się do szyny nN osobnym polem źródłowym (ZRODLO_NN_PV / ZRODLO_NN_BESS / ZRODLO_NN_FW), a '
    + 'napięcie strony nN i moc źródła pochodzą z katalogu falownika — dlatego transformator dobiera '
    + 'się do jego strony nN i mocy (blokada, gdy brak zgodnego typu). Źródło PV wymaga własnego '
    + 'wyłącznika nN i zabezpieczenia skoordynowanego z wyłącznikiem głównym nN; intencja tego '
    + 'zabezpieczenia trafia do modelu jako wymaganie, a dobór aparatu i nastaw następuje w edycji stacji.',
  teoriaNnWymog:
    'Napięcie nN i moc transformatora dobieraj do rzeczywistego odbioru lub źródła (dla PV / BESS / '
    + 'wiatru — do strony nN i mocy falownika). Źródło zawsze z polem źródłowym właściwej roli — nie '
    + 'mieszaj go z odpływami odbiorczymi.',
  teoriaNnPodstawa:
    'Podstawa: N SEP-E-001, IRiESD, PN-EN 62271 (aparatura nN/SN), wymagania przyłączeniowe OZE (NC RfG/PTPiREE).',
} as const;
