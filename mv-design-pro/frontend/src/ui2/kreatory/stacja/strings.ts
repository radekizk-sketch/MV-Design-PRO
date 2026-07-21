/** Teksty PL kreatora „Dodaj stację SN/nN" (Audyt D, faza D2). Język inżynierski. */

export const STACJA_STRINGS = {
  eyebrow: 'MODEL SIECI · STACJA SN/nN',
  cel:
    'Osadź stację transformatorową SN/nN na magistrali: wybierz rodzaj stacji, '
    + 'dobierz transformator z katalogu do napięcia nN odbioru i zapisz. Umiejscowienie '
    + '(koniec odcinka lub świadomy podział) wynika ze wskazanego miejsca na schemacie.',
  odznaka: 'Nowa stacja',

  krokRodzaj: 'Rodzaj i umiejscowienie',
  krokTransformator: 'Transformator',
  krokRozdzielnica: 'Rozdzielnica SN',
  krokZapis: 'Podsumowanie i zapis',

  // Krok 1 — rodzaj.
  typStacji: 'Rodzaj stacji',
  typStacjiOpcje: [
    { id: 'branch', etykieta: 'Odbiorcza (odgałęźna)' },
    { id: 'inline', etykieta: 'Przelotowa (wcinka)' },
    { id: 'sectional', etykieta: 'Sekcyjna (ze sprzęgłem)' },
  ],
  typStacjiPomoc:
    'Odbiorcza kończy odgałęzienie odbiorem; przelotowa wcina się w ciąg (wejście + wyjście); '
    + 'sekcyjna dzieli szynę sprzęgłem. Rodzaj decyduje o polach rozdzielnicy SN.',
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

  // Krok 2 — transformator.
  nnVoltage: 'Napięcie nN odbioru',
  nnVoltageOpcje: [
    { id: '0.4', etykieta: '0,4 kV (400 V)' },
    { id: '0.69', etykieta: '0,69 kV (690 V)' },
  ],
  nnVoltagePomoc: 'Napięcie strony dolnej dobiera transformator z katalogu (przekładnia SN/nN).',
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
  liczbaOdplywow: 'Liczba odpływów nN',
  liczbaOdplywowPomoc: 'Minimalny blok nN: szyna nN, wyłącznik główny i odpływy odbiorcze (LOAD_NN).',

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

  // Krok 4 — zapis.
  podsumTyp: 'Rodzaj stacji',
  podsumUmiejscowienie: 'Umiejscowienie',
  podsumTransformator: 'Transformator',
  podsumRozdzielnica: 'Rozdzielnica SN',
  podsumNn: 'Napięcie nN / odpływy',

  // Kontrola.
  kontrolaTytul: 'Kontrola stacji',
  wierszTyp: 'Rodzaj',
  wierszUmiejscowienie: 'Umiejscowienie',
  wierszTransformator: 'Transformator',
  wierszNn: 'Blok nN',

  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Rozdzielnica SN i pola stacji, transformator SN/nN oraz szyna nN z odpływami trafią do modelu. '
    + 'Rozpływ mocy, zwarcia i dobór zabezpieczeń uwzględnią nową stację; rozbudowę rozdzielnicy '
    + 'i bloku nN (w tym źródła PV) wykonasz w kolejnych krokach edycji stacji.',

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
} as const;
