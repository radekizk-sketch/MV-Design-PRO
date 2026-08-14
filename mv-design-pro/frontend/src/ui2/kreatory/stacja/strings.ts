/** Teksty PL kreatora „Dodaj stację SN/nN" (Audyt D, faza D2). Język inżynierski. */

export const STACJA_STRINGS = {
  eyebrow: 'MODEL SIECI · STACJA SN/nN',
  cel:
    'Osadź stację transformatorową SN/nN na magistrali: wybierz rodzaj stacji, '
    + 'dobierz transformator z katalogu do napięcia nN odbioru i zapisz. Umiejscowienie '
    + '(koniec odcinka lub świadomy podział) wynika ze wskazanego miejsca na schemacie.',
  odznaka: 'Nowa stacja',

  krokSzablon: 'Szablon startowy',
  krokRodzaj: 'Rodzaj i umiejscowienie',
  krokTransformator: 'Transformator i strona nN',
  krokRozdzielnica: 'Rozdzielnica SN',
  krokPola: 'Pola rozdzielnicy SN',
  krokPomiar: 'Pomiar i zabezpieczenia pól',
  krokNn: 'Blok nN',
  krokUziemienie: 'Uziemienie i punkt neutralny',
  krokPodglad: 'Podgląd skutków',
  krokZapis: 'Podsumowanie i zapis',

  // Krok 0 — szablon startowy.
  szablonOpis:
    'Zacznij od gotowego szablonu stacji z biblioteki albo od zera. Szablon WYPEŁNIA formularz '
    + '(transformator, pola SN z aparatem, odpływy nN, propozycje CT/VT i zabezpieczeń) — każdą '
    + 'wartość zmienisz w kolejnych krokach.',
  szablonKategoria: 'Kategoria szablonu',
  szablonKategoriaPomoc: 'Kategorie pochodzą z biblioteki szablonów stacji (backend).',
  szablonWybor: 'Szablon stacji',
  szablonWyborPlaceholder: '— pracuj od zera (bez szablonu) —',
  szablonWyborPomoc:
    'Wybór wypełnia formularz wartościami szablonu. „Od zera" jest równoprawne — kreator '
    + 'startuje wtedy domyślnymi polami rodzaju stacji.',
  szablonZastosuj: 'Wypełnij formularz szablonem',
  szablonWyczysc: 'Pracuj od zera',
  szablonWybrany: 'Szablon użyty do wypełnienia',
  szablonBrakWyboru: 'Bez szablonu (praca od zera)',
  szablonBlad: 'Nie udało się pobrać biblioteki szablonów stacji.',
  szablonPusty: 'Ta kategoria nie zawiera szablonów.',
  /** Stan ładowania listy — oddzielony od pustego, żeby „nie ma" nie padało przed odpowiedzią. */
  szablonLaduje: 'Pobieranie szablonów wybranej kategorii…',
  szablonZastosowany: 'Formularz wypełniony z szablonu — wszystkie pola pozostają edytowalne.',
  szablonLiczbaPol: 'Pola SN z szablonu',
  szablonTransformator: 'Transformator z szablonu',
  szablonOdplywy: 'Odpływy nN z szablonu',

  // Krok — oznaczenie i konstrukcja stacji (B-4/B-5).
  oznaczenie: 'Oznaczenie stacji',
  oznaczeniePlaceholder: 'np. ST-15/0,4-01',
  oznaczeniePomoc:
    'Oznaczenie z dokumentacji projektowej (schemat, tabela stacji). Puste — stacja bez oznaczenia.',
  konstrukcja: 'Typ konstrukcji stacji',
  konstrukcjaOpcje: [
    { id: '', etykieta: '— nie deklaruję —' },
    { id: 'wnetrzowa', etykieta: 'Wnętrzowa (budynek)' },
    { id: 'kontenerowa', etykieta: 'Kontenerowa' },
    { id: 'slupowa', etykieta: 'Słupowa' },
    { id: 'prefabrykowana', etykieta: 'Prefabrykowana' },
    { id: 'inna', etykieta: 'Inna' },
  ],
  konstrukcjaPomoc:
    'Rodzaj obudowy/konstrukcji stacji — spływa do modelu stacji (drzewo projektu, karta '
    + 'techniczna, dobór osprzętu).',

  // Krok 3 — kompletowanie rozdzielnicy SN z katalogowych pól rodziny.
  polaOpis:
    'Skompletuj rozdzielnicę SN stacji z katalogowych pól wybranej rodziny. Pole SN jest kompletną '
    + 'jednostką funkcjonalną wyrobu (aparat łączeniowy to tylko jeden z jej elementów), więc jego '
    + 'wyposażenie pochodzi z karty katalogowej rodziny. Tor pracy wyznacza sama rodzina: '
    + 'rozdzielnicę modułową składasz z pól, rozdzielnicę pierścieniową (RMU) wybierasz blokiem '
    + 'fabrycznym o stałej sekwencji jednostek.',
  polaDodaj: 'Dodaj pole',
  polaUsun: 'Usuń pole',
  polaRola: 'Rola pola',
  polaSzablon: 'Katalogowe pole rodziny',
  polaPuste: 'Stacja nie ma żadnego pola SN — dodaj co najmniej jedno pole.',
  polaLicznik: (n: number) => `Pola SN: ${n}`,

  // --- Tor konfiguracji (kanon KONFIGURATOR_ROZDZIELNIC_SN_RMU §3) ---
  naglowekRodzinyTytul: 'Wybrana rodzina rozdzielnicy',
  torModularnyTytul: 'Tor modułowy — rozdzielnica składana z pól',
  torModularnyOpis:
    'Rozdzielnicę składasz z pojedynczych katalogowych pól rodziny: dodajesz i usuwasz pola, '
    + 'a każde z nich wchodzi z pełnym wyposażeniem swojej karty katalogowej.',
  torBlokTytul: 'Tor blokowy (RMU) — blok fabryczny',
  torBlokOpis:
    'Rozdzielnica pierścieniowa nie jest zbiorem luźnych szaf: producent sprzedaje BLOK o stałej '
    + 'sekwencji jednostek. Wybierz blok — jego jednostki są niezmienne, a doposażasz je opcjami '
    + 'z karty katalogowej.',
  torBrakTytul: 'Rodzina nie deklaruje konstrukcji',
  torBrakOpis:
    'Karta tej rodziny nie podaje konstrukcji, więc katalog nie wyznacza toru konfiguracji '
    + '(modułowy albo blokowy RMU). Kreator nie zgaduje toru pracy — wskaż rodzinę z pełną kartą '
    + 'albo uzupełnij katalog rodzin rozdzielnic.',

  // --- Blok fabryczny RMU ---
  blokWybor: 'Blok fabryczny',
  blokPlaceholder: '— wskaż blok fabryczny —',
  blokPomoc:
    'Blok wyznacza STAŁĄ sekwencję jednostek wyrobu (np. L-L-T). Zmiana bloku przebudowuje pola '
    + 'rozdzielnicy; pojedynczej jednostki nie da się dostawić ani usunąć — to inny wyrób.',
  blokSekwencja: 'Sekwencja jednostek',
  blokSzerokosc: 'Szerokość całkowita',
  blokJednostkiTytul: 'Jednostki bloku (skład stały)',
  blokJednostka: (pozycja: number, kod: string) => `Jednostka ${pozycja} · ${kod}`,
  blokBrakTytul: 'Bloki tej rodziny czekają na kartę producenta',
  blokBrakOpis:
    'Katalog nie zawiera jeszcze skonfigurowanych bloków tej rodziny — źródła publiczne producenta '
    + 'nie wymieniają zestawu konfiguracji. Kreator nie zmyśli sekwencji jednostek: wskaż inną '
    + 'rodzinę RMU albo uzupełnij katalog konfiguracji fabrycznych o transkrypcję karty.',
  blokBlad: 'Nie udało się pobrać konfiguracji fabrycznych rodziny.',
  blokNiewybrany: 'Wskaż blok fabryczny, aby zobaczyć jego jednostki i skompletować rozdzielnicę.',
  /**
   * Jednostka wyrobu, której funkcji NIE DA SIĘ wyrazić rolą pola w kontrakcie
   * operacji stacyjnej. Mówimy to wprost przy jednostce — cichy zamiennik
   * („zapiszemy jako pole liniowe") fałszowałby skład wyrobu w modelu.
   */
  jednostkaBezRoli:
    'Tej funkcji jednostki operacja budowy stacji nie zapisuje — jednostka zostaje w składzie '
    + 'wyrobu, ale nie powstanie z niej pole rozdzielnicy.',

  // --- Karta wyposażenia pola / jednostki ---
  wyposazenieTytul: 'Wyposażenie pola z karty katalogowej',
  wyposazeniePuste:
    'Karta katalogowa tego pola nie wylicza wyposażenia — pokazujemy brak zamiast dorysowywać '
    + 'aparaty, których katalog nie deklaruje.',
  wyposazenieBrakPola: 'Wskaż katalogowe pole rodziny, aby zobaczyć jego wyposażenie.',
  statusFabryczny: 'fabryczne',
  statusOpcja: 'opcja',
  statusFabrycznyPomoc: 'Wyposażenie fabryczne pola — wchodzi z kartą katalogową, bez wyboru.',
  /**
   * Doposażenie STEROWALNE: rodzaj aparatu ma pole w operacji stacyjnej
   * (`equipment.ct|vt|relay`), więc wskazanie pozycji katalogowej REALNIE
   * powstaje razem ze stacją. Kontrolka bez pokrycia w backendzie jest zakazana.
   */
  opcjaPomoc:
    'Doposażenie opcjonalne — wskaż pozycję katalogową, aby powstało razem ze stacją; '
    + 'wyczyszczenie wyboru usuwa je z konfiguracji.',
  opcjaBezDostawcy:
    'Doposażenie opcjonalne wg karty katalogowej. Operacja tego kreatora nie ma pola dla tego '
    + 'rodzaju aparatu, więc kreator go nie zapisuje — świadomie nie pokazujemy przełącznika '
    + 'bez skutku w modelu.',
  opcjaWybrana: 'w konfiguracji',
  opcjaNiewybrana: 'poza konfiguracją',

  // Krok 4 — pomiar i zabezpieczenia pól.
  pomiarOpis:
    'Przekładniki i zabezpieczenie pola. Zapis wykonuje sekwencję operacji: stacja → CT → VT → '
    + 'zabezpieczenie (backend nie przyjmuje dziś tych elementów w jednej operacji stacyjnej — '
    + 'dług B-3 prowadzony osobno). Przekładnie pochodzą z pozycji katalogowej.',
  pomiarCt: 'Przekładnik prądowy CT',
  pomiarCtPomoc: 'Przekładnia i klasa z katalogu CT. Puste — pole bez przekładnika prądowego.',
  pomiarVt: 'Przekładnik napięciowy VT',
  pomiarVtPomoc: 'Przekładnia z katalogu VT. Puste — pole bez przekładnika napięciowego.',
  pomiarPrzekaznik: 'Zabezpieczenie pola',
  pomiarPrzekaznikPomoc:
    'Urządzenie zabezpieczeniowe z katalogu. Zabezpieczenia nadprądowe/ziemnozwarciowe wymagają '
    + 'CT w tym samym polu (walidacja backendu).',
  pomiarRodzaj: 'Rodzaj zabezpieczenia',
  pomiarRodzajOpcje: [
    { id: 'NADPRADOWY', etykieta: 'Nadprądowy (50/51)' },
    { id: 'ZIEMNOZWARCIOWY', etykieta: 'Ziemnozwarciowy (50N/51N)' },
    { id: 'KIERUNKOWY_NADPRADOWY', etykieta: 'Kierunkowy nadprądowy (67)' },
    { id: 'ODLEGLOSCIOWY', etykieta: 'Odległościowy (21)' },
    { id: 'ROZNICOWY', etykieta: 'Różnicowy (87)' },
  ],
  pomiarBrak: 'Brak pól SN — wróć do kroku pól rozdzielnicy.',
  pomiarKody: 'Kody zabezpieczeń pola',
  pomiarKodyBrak: 'Szablon pola nie deklaruje kodów zabezpieczeń.',
  pomiarKatalogBlad: 'Nie udało się pobrać katalogu przekładników/zabezpieczeń.',
  pomiarPrzekladnia: 'Przekładnia',
  // B-3: wyposażenie powstaje RAZEM ze stacją (jedna operacja) — etykieta mówi
  // o zawartości zapisu, nie o osobnych krokach po zapisie.
  pomiarWyposazenieRazem: (n: number) => `Elementy tworzone razem ze stacją: ${n}`,

  // Krok 7 — podgląd skutków.
  podgladOpis:
    'Podgląd wykonuje TĘ SAMĄ operację w trybie próbnym (bez zapisu) i pokazuje skutki wyliczone '
    + 'przez backend: punkt podziału odcinka, długości części i elementy, których zmiana dotyczy.',
  podgladOdswiez: 'Przelicz podgląd',
  podgladBrakKontekstu: 'Wskaż miejsce osadzenia stacji, aby policzyć podgląd.',
  podgladLadowanie: 'Backend liczy skutki operacji…',
  podgladBlad: 'Nie udało się policzyć podglądu skutków.',
  podgladStacja: 'Identyfikator stacji (po zapisie)',
  podgladPodzial: 'Punkt podziału odcinka',
  podgladDlugoscA: 'Długość części przed stacją',
  podgladDlugoscB: 'Długość części za stacją',
  podgladElementy: 'Elementy objęte zmianą',
  podgladWyniki: 'Wyniki unieważnione zmianą',
  podgladBraki: 'Dane brakujące po operacji',
  podgladPusty: 'Brak podglądu — uruchom przeliczenie.',
  insertAt: 'Odległość stacji od początku odcinka [m]',
  insertAtPlaceholder: 'np. 250',
  insertAtPomoc:
    'Puste — punkt wskazany na schemacie. Podana wartość idzie do operacji jako odległość '
    + 'w metrach; przeliczenie na udział długości wykonuje backend z danych odcinka.',

  // Krok 8 — łańcuchowanie po zapisie.
  dalejTytul: 'Następny krok po zapisie',
  dalejOpcje: [
    { id: 'nic', etykieta: 'Zakończ — wróć do schematu' },
    { id: 'pierscien', etykieta: 'Domknij pierścień (połącz z inną stacją)' },
    { id: 'nop', etykieta: 'Wskaż punkt normalnie otwarty (NOP)' },
  ],
  dalejPomoc:
    'Po zapisie kreator może od razu otworzyć kolejną operację na nowej stacji — bez szukania '
    + 'jej na schemacie.',

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
  /**
   * KONFIGURATOR-POL-RMU: rodzina jest WYMAGANA. Wcześniejsze „puste — pakiet
   * standardowy producenta" było atrapą katalogu (kanon §1): producent nie
   * sprzedaje „rodziny standardowej", a pole SN jest kompletną jednostką
   * funkcjonalnej KONKRETNEJ rodziny. Bez rodziny nie ma ani jej klas
   * znamionowych, ani toru konfiguracji, ani katalogowych pól.
   */
  rodzinaPomoc:
    'Rodzina to konkretna seria wyrobu producenta. Wyznacza klasy znamionowe (napięcie, prąd, '
    + 'prąd zwarciowy), technologię i TOR KONFIGURACJI: rozdzielnica składana z pól albo blok '
    + 'fabryczny RMU. Wskazanie jest wymagane — bez rodziny nie ma katalogowych pól.',
  rodzinaPlaceholder: '— wskaż rodzinę z katalogu —',
  poleRoliPomoc: 'Kompletny szablon pola z katalogu producenta (rozłącznik, przekładniki, zabezpieczenia).',
  polePlaceholder: '— dobór automatyczny —',
  aparatPola: 'Aparat pola',
  aparatPolaPomoc:
    'Aparat łączeniowy pola z katalogu SN. Lista jest zawężona do rozwiązań stosowanych w tej roli '
    + 'pola. Wskazanie jest wymagane — system nie dobiera aparatu za projektanta.',
  aparatPolaPlaceholder: '— wskaż aparat z katalogu —',
  aparatBlad: 'Nie udało się pobrać katalogu aparatury SN.',
  brakAparatow:
    'Katalog aparatury SN nie zawiera pozycji na napięcie szyny. Uzupełnij katalog APARAT_SN.',
  /** Rozwiązania dopuszczalne dla roli pola — wprost z katalogu (bez listy zaszytej w UI). */
  aparatPolaWarianty: (warianty: readonly string[]) =>
    warianty.length > 0
      ? `Rozwiązania stosowane w tym polu: ${warianty.join(' albo ')}.`
      : 'Katalog nie zawęża rodzaju aparatu dla tej roli pola.',
  brakAparatowRoli:
    'Katalog aparatury SN nie ma pozycji stosowanej w tym polu na napięcie szyny. '
    + 'Uzupełnij katalog APARAT_SN albo zmień rolę pola.',

  // KOMPLETNOSC-POLA-TR — świadoma rezygnacja z pola transformatorowego.
  polaBrakTrTytul: 'Stacja z transformatorem bez pola transformatorowego',
  polaBrakTrOpis:
    'Ta stacja tworzy transformator SN/nN, a lista pól nie zawiera pola transformatorowego. '
    + 'Odejście od szyny SN realizuje się polem, więc konfiguracja pozostanie niekompletna: '
    + 'na schemacie transformator dostanie znacznik braku pola, panel gotowości zgłosi ostrzeżenie, '
    + 'a projekt nie przejdzie do dokumentacji wykonawczej. Praca koncepcyjna i obliczenia '
    + 'działają bez zmian — to legalny stan roboczy.',
  polaPrzywrocTr: 'Dodaj pole transformatorowe',
  wierszPoleTr: 'Pole transformatorowe',
  wierszPoleTrJest: 'W rozdzielnicy',
  wierszPoleTrBrak: 'Brak — konfiguracja niekompletna',
  podgladTytul: 'Podgląd pól rozdzielnicy SN',
  // SLD-GEN-POLA — opisy schematu jednokreskowego rozdzielnicy w kroku pól.
  podgladOpisRysunku:
    'Schemat jednokreskowy rozdzielnicy rysowany symbolami normowymi z RZECZYWISTEJ kompozycji '
    + 'aparatów pola: skład każdego pola pochodzi z karty katalogowej rodziny (odłączniki, aparat '
    + 'główny, przekładniki, uziemnik, głowica kablowa, transformator), a oznaczenia przy symbolach '
    + 'to oznaczenia operatorskie z tej samej karty. Rysunek nie dodaje aparatu spoza kompozycji '
    + 'ani nie pomija aparatu, który w niej jest.',
  podgladStronaNn: 'nN',
  // Nagłówek pakietu rozdzielnicy (dane rodziny + werdykt walidatora backendu).
  naglowekRodzina: 'Rodzina',
  naglowekProducent: 'Producent',
  naglowekIzolacja: 'Izolacja',
  naglowekTor: 'Tor konfiguracji',
  naglowekKonstrukcja: 'Konstrukcja',
  naglowekNapiecie: 'Napięcie znamionowe',
  naglowekPradSzyn: 'Prąd znamionowy szyn',
  naglowekPradZwarciowy: 'Prąd zwarciowy 1 s',
  naglowekJednostki: 'Liczba jednostek',
  naglowekSzerokosc: 'Szerokość całkowita',
  naglowekBrakProducenta: 'Producent niewskazany',
  /**
   * Jawny brak danej katalogowej. Dotyczy m.in. szerokości pola: kontrakt
   * katalogu rozdzielnic nie niesie wymiaru, więc pokazujemy brak zamiast
   * liczby „typowej" — zmyślony wymiar wszedłby do dokumentacji wykonawczej.
   */
  naglowekBrakDanej: 'brak w karcie katalogowej',
  statusKonfiguracjiValid: 'Konfiguracja przyjęta przez walidator',
  statusKonfiguracjiInvalid: 'Konfiguracja odrzucona przez walidator',
  statusKonfiguracjiNiesprawdzona: 'Konfiguracja niesprawdzona',
  statusKonfiguracjiSprawdzanie: 'Walidator sprawdza konfigurację…',
  podgladSzyna: (kv: string) => `Szyna SN ${kv} kV`,
  podgladSzynaBezNapiecia: 'Szyna SN',
  podgladBrakAparatu: 'aparat pola niewskazany',
  podgladBrakTransformatora: 'transformator — typ niewskazany',
  podgladBrakSzablonu: 'brak szablonu pola',
  podgladPole: (numer: number) => `Pole ${numer}`,
  brakProducenta: 'Wybierz producenta rozdzielnicy SN, aby dobrać pola stacji.',
  /**
   * Rodzina jest wymagana, więc brak rodzin producenta to STAN BLOKUJĄCY krok,
   * a nie „użyjemy pakietu standardowego" (takiego wyrobu nie ma w katalogu).
   */
  brakRodzin:
    'Ten producent nie ma w katalogu rodziny na napięcie szyny SN. Wybierz innego producenta '
    + 'albo uzupełnij katalog rodzin rozdzielnic — bez rodziny nie ma katalogowych pól.',
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

  // Praca równoległa transformatorów (G-STK-6) — krok transformatora.
  liczbaTransformatorow: 'Liczba równoległych transformatorów',
  liczbaTransformatorowPomoc:
    'Identyczne jednostki pracujące równolegle w polu transformatorowym (rezerwa/moc). '
    + 'Dla n jednostek impedancja zastępcza maleje n-krotnie ($Z/n$) — rozpływ i zwarcie liczy '
    + 'backend na agregacie. 1 = pojedynczy transformator.',

  // Szablony użytkownika (B-8) — zapis konfiguracji z kroku podglądu.
  szablonZapiszTytul: 'Zapisz jako szablon',
  szablonZapiszOpis:
    'Zapisuje bieżącą konfigurację kreatora (rodzaj stacji, pola SN z aparatami, '
    + 'transformator, blok nN, uziemienie, wyposażenie pomiarowe) pod własną nazwą. '
    + 'Szablon pojawi się na liście w kroku „Szablon" obok wbudowanych.',
  szablonZapiszNazwa: 'Nazwa szablonu',
  szablonZapiszNazwaPlaceholder: 'np. Stacja przelotowa 630 kVA — linia wiejska',
  szablonZapiszAkcja: 'Zapisz jako szablon',
  szablonZapiszBrakNazwy: 'Podaj nazwę szablonu, żeby go zapisać.',
  szablonZapiszOk: (nazwa: string): string =>
    `Zapisano szablon „${nazwa}". Znajdziesz go w kroku „Szablon".`,
  szablonZapiszBlad: 'Nie udało się zapisać szablonu.',
  szablonEtykietaWbudowany: (nazwa: string): string => `${nazwa} (wbudowany)`,
  szablonEtykietaWlasny: (nazwa: string): string => `${nazwa} (mój szablon)`,

  // Zaczepy transformatora (B-2) — sekcja w kroku transformatora.
  zaczepyTytul: 'Regulacja napięcia — zaczepy transformatora',
  zaczepyOpis:
    'Zaczepy zmieniają przekładnię, czyli napięcie po stronie nN przy niezmienionym '
    + 'napięciu SN. Ustawienie jedzie w TEJ SAMEJ operacji co stacja — nie trzeba wracać '
    + 'do transformatora po zapisie.',
  zaczepyRodzaj: 'Rodzaj regulacji',
  zaczepyRodzajOpcje: [
    { id: 'NONE', etykieta: 'bez regulacji' },
    { id: 'DETC', etykieta: 'przełącznik bez wzbudzenia (DETC)' },
    { id: 'OLTC', etykieta: 'podobciążeniowy (OLTC)' },
  ],
  zaczepyRodzajPomoc:
    'Przełącznik bez wzbudzenia przestawia się przy wyłączonym transformatorze (typowy '
    + 'w stacjach SN/nN); podobciążeniowy — pod napięciem i obciążeniem (typowy w GPZ).',
  zaczepyUzwojenie: 'Regulowane uzwojenie',
  zaczepyUzwojenieOpcje: [
    { id: 'HV', etykieta: 'górne (SN)' },
    { id: 'LV', etykieta: 'dolne (nN)' },
  ],
  zaczepyUzwojeniePomoc:
    'Strona, po której fizycznie znajdują się odczepy uzwojenia. W transformatorach '
    + 'dystrybucyjnych to zwykle strona górna.',
  zaczepyPozycjaBiezaca: 'Pozycja bieżąca',
  zaczepyPozycjaNeutralna: 'Pozycja neutralna',
  zaczepyPozycjaMin: 'Pozycja minimalna',
  zaczepyPozycjaMax: 'Pozycja maksymalna',
  zaczepyKrok: 'Krok zaczepu [%]',
  zaczepyKrokPomoc:
    'Zmiana przekładni na jedną pozycję. Typowy przełącznik bez wzbudzenia ma ±2 pozycje '
    + 'po 2,5 %.',
  zaczepyZakres: (min: number, max: number, krok: number): string =>
    `Zakres regulacji: ${min}…${max} × ${String(krok).replace('.', ',')} %`,

  // Potrzeby własne stacji (G-STK-3) — sekcja w kroku bloku nN.
  potrzebyWlasneTytul: 'Potrzeby własne stacji (opcjonalnie)',
  potrzebyWlasneOpis:
    'Mały odbiór nN zasilający potrzeby własne stacji (oświetlenie, ogrzewanie, zasilanie '
    + 'obwodów zabezpieczeń/automatyki). Uwzględniany w rozpływie mocy jako odbiór na szynie nN.',
  potrzebyWlasneMoc: 'Moc potrzeb własnych [kW]',
  potrzebyWlasneMocPlaceholder: 'np. 5',
  potrzebyWlasneMocPomoc: 'Puste — stacja bez odrębnego odbioru potrzeb własnych.',
  potrzebyWlasneCosphi: 'cosφ potrzeb własnych',
  potrzebyWlasneCosphiPomoc:
    'Współczynnik mocy odbioru — moc bierną (Q) wylicza backend ($Q = P \\cdot \\tan(\\arccos\\cos\\varphi)$).',

  // Krok — uziemienie i punkt neutralny (G-STK-1).
  uziemienieOpis:
    'Układ uziemienia sieci nN i sposób pracy punktu neutralnego transformatora decydują '
    + 'o prądzie zwarcia doziemnego, napięciach dotyku i doborze zabezpieczeń ziemnozwarciowych. '
    + 'Konfiguracja spływa do analiz (kwalifikacja do oceny uziemienia, pakiet dowodowy zwarcia doziemnego).',
  uziemienieUklad: 'Układ sieci nN',
  uziemienieUkladOpcje: [
    { id: 'TN-S', etykieta: 'TN-S (oddzielny PE i N)' },
    { id: 'TN-C-S', etykieta: 'TN-C-S (PEN + rozdział na PE/N)' },
    { id: 'TN-C', etykieta: 'TN-C (wspólny PEN)' },
    { id: 'TT', etykieta: 'TT (oddzielne uziemienia)' },
    { id: 'IT', etykieta: 'IT (izolowany / uziemiony przez impedancję)' },
  ],
  uziemienieUkladPomoc:
    'TN-C-S to typowy układ dystrybucyjny nN. IT stosuje się tam, gdzie wymagana jest ciągłość '
    + 'zasilania przy pierwszym doziemieniu (z kontrolą stanu izolacji).',
  uziemieniePunkt: 'Punkt neutralny transformatora (nN)',
  uziemieniePunktOpcje: [
    { id: 'directly_grounded', etykieta: 'Bezpośrednio uziemiony' },
    { id: 'resistor_grounded', etykieta: 'Uziemiony przez rezystor' },
    { id: 'petersen_coil', etykieta: 'Cewka Petersena (kompensacja)' },
    { id: 'isolated', etykieta: 'Izolowany (bez uziemienia)' },
  ],
  uziemieniePunktPomoc:
    'Bezpośrednio uziemiony ⇒ duży prąd zwarcia doziemnego (układy TN). Rezystor/cewka '
    + 'ograniczają prąd doziemny. Izolowany ⇒ mały prąd pojemnościowy (układ IT).',
  uziemienieRezystancja: 'Rezystancja uziemienia punktu neutralnego [Ω]',
  uziemienieRezystancjaPlaceholder: 'np. 10',
  uziemienieRezystancjaPomoc:
    'Podaj tylko dla uziemienia impedancyjnego (rezystor / cewka). Puste — backend przyjmuje '
    + 'model bez jawnej impedancji (nie zgadujemy wartości).',
  teoriaUziemienieTytul: 'Teoria: uziemienie punktu neutralnego a zwarcie doziemne',
  teoriaUziemienieOpis:
    'Sposób pracy punktu neutralnego wyznacza charakter zwarcia doziemnego: sieć bezpośrednio '
    + 'uziemiona daje duży prąd zwarcia doziemnego (szybkie wyłączenie, ochrona przeciwporażeniowa '
    + 'przez samoczynne wyłączenie), sieć izolowana lub kompensowana (cewka Petersena) ogranicza prąd '
    + 'do wartości pojemnościowych/resztkowych (ciągłość zasilania, kontrola stanu izolacji). Rezystor '
    + 'uziemiający ustala prąd doziemny na projektowanym poziomie. Wybór wpływa na dobór zabezpieczeń '
    + 'ziemnozwarciowych (51N/67N) i na napięcia dotyku.',
  teoriaUziemienieWymog:
    'Dobierz układ uziemienia i punkt neutralny do wymagań ochrony przeciwporażeniowej (czas wyłączenia '
    + 'pętli zwarcia) oraz ciągłości zasilania. Wartość rezystancji podawaj tylko wtedy, gdy jest znana '
    + 'z projektu — inaczej pozostaw pole puste.',
  teoriaUziemieniePodstawa:
    'Podstawa: PN-HD 60364-4-41 (ochrona przeciwporażeniowa), IEC 60364-4-41 (pętla zwarcia), '
    + 'N SEP-E-001, IRiESD.',
} as const;
