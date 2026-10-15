/*
 * Teksty ekranu „Dynamika czasowa RMS" (karta AB-P1). Wyłącznie opisy sekcji, akcji
 * i stanów — żadnego tekstu oceny (werdykt nie istnieje; rekordy „nie oceniono" przychodzą
 * z backendu), żadnej liczby.
 */

export const DYNAMIKA_STRINGS = {
  eyebrow: 'Analiza dynamiczna sieci',
  tytul: 'Dynamika czasowa RMS',
  cel:
    'Przebiegi napięć, częstotliwości, mocy i prądów sieci po zadanych zdarzeniach, '
    + 'liczone od punktu pracy wskazanego rozpływu — bez oceny zgodności.',

  // Gotowość
  gotowoscTytul: 'Dane wejściowe biegu',
  gotowoscLadowanie: 'Sprawdzanie gotowości biegu dynamiki…',
  gotowoscBlad: 'Nie udało się odczytać gotowości biegu dynamiki.',
  brakPrzypadku: 'Wybierz przypadek obliczeniowy, żeby przygotować bieg dynamiki.',
  brakPrzypadkuAkcja: 'Przejdź do przypadków',
  brakiModeluTytul: 'Bieg odmówi — braki modelu',

  // Modele dynamiczne źródeł
  zrodlaTytul: 'Modele dynamiczne źródeł',
  zrodlaOpis:
    'Każdy wytwórca w biegu potrzebuje modelu dynamicznego. Wiązanie z profilem katalogowym '
    + 'kopiuje parametry profilu do modelu sieci (kopia jest odtwarzalna z katalogu).',
  zrodlaBrak: 'Model nie ma wytwórców — bieg liczy sieć z samymi źródłami sieciowymi.',
  kolZrodlo: 'Wytwórca',
  kolRodzaj: 'Rodzaj',
  kolStan: 'Model dynamiczny',
  kolPochodzenie: 'Pochodzenie parametrów',
  kolWiazanie: 'Wiązanie z katalogiem',
  stanZKatalogu: 'kopia profilu katalogowego',
  stanWlasny: 'blok spoza katalogu',
  stanBrak: 'brak modelu',
  stanOdmowa: 'profilu nie da się zastosować',
  stanNieaktualna: 'kopia nieaktualna wobec wiązania',
  wybierzProfil: 'Wybierz profil katalogowy…',
  powiaz: 'Powiąż z katalogiem',
  powiazanie: 'Zapisywanie wiązania…',
  odwiaz: 'Usuń wiązanie',
  powiazano: 'Model dynamiczny wytwórcy powiązany z profilem katalogowym',
  odwiazano: 'Usunięto wiązanie modelu dynamicznego wytwórcy',
  profilPozaRdzeniem: '(rodzina bez modelu w rdzeniu)',
  brakProfili:
    'Katalog nie ma profili dynamicznych dla tego rodzaju wytwórcy — potrzebne dane producenta.',
  pokazNaSchemacie: 'Pokaż na schemacie',

  // Modele dynamiczne odbiorów (ta sama sekcja — cel akcji naprawczej odbioru)
  odbioryTytul: 'Modele dynamiczne odbiorów',
  odbioryOpis:
    'Każdy odbiór w biegu potrzebuje modelu dynamicznego: napięcia, poniżej którego odbiór '
    + 'staje się stałą impedancją (przy głębokim zapadzie prąd maleje do zera), a dla odbioru '
    + 'zależnego od częstotliwości — stałej czasowej pomiaru częstotliwości. Charakterystyka '
    + 'napięciowa i częstotliwościowa pochodzi z typu odbioru (ta sama co w rozpływie); '
    + 'wiązanie z profilem katalogowym kopiuje wyłącznie parametry modelu dynamicznego.',
  odbioryBrak: 'Model nie ma odbiorów.',
  kolOdbior: 'Odbiór',
  kolParametryOdbioru: 'Parametry modelu',
  napieciePrzejscia: 'napięcie przejścia do stałej impedancji',
  stalaPomiaru: 'stała czasowa pomiaru częstotliwości',
  bezCzulosci: 'odbiór niezależny od częstotliwości',
  czystaImpedancja: 'odbiór czysto impedancyjny — bez napięcia przejścia',
  stanOdbioruBrak: 'brak modelu',
  wybierzProfilOdbioru: 'Wybierz profil katalogowy odbioru…',
  podstawaWartosci: 'Podstawa wartości profilu',
  jakoscSzacowana: 'wartości szacowane (typowe), nie pomiar odbioru',
  jednPu: 'pu',
  wiazanieOdbioruBlad: 'Nie udało się zapisać wiązania modelu dynamicznego odbioru.',
  zrodloProweniencji: {
    karta_producenta: 'karta producenta',
    certyfikat_jednostki: 'certyfikat jednostki',
    profil_typowy_normy: 'profil typowy normy',
    deklaracja_uzytkownika: 'deklaracja projektanta',
  } as Record<string, string>,

  // Punkt pracy
  punktPracyTytul: 'Punkt pracy',
  punktPracyOpis:
    'Bieg startuje ze stanu ustalonego zakończonego rozpływu mocy liczonego na tym samym modelu.',
  punktPracyBrak:
    'Brak zakończonego rozpływu na bieżącym modelu (po zmianie modelu rozpływ trzeba policzyć ponownie).',
  punktPracyAkcja: 'Policz rozpływ mocy',
  punktPracyLicze: 'Liczenie rozpływu…',
  punktPracyEtykieta: 'Rozpływ',

  // Scenariusz
  scenariuszTytul: 'Scenariusz zdarzeń',
  scenariuszOpis:
    'Rodzaje zdarzeń i ich pola pochodzą z kontraktu scenariusza dynamicznego — lista zmienia się razem z możliwościami obliczeń.',
  scenariuszZapisany: 'Scenariusz zapisany',
  scenariuszNowy: 'Nowy scenariusz',
  scenariuszNazwa: 'Nazwa scenariusza',
  scenariuszZapisz: 'Zapisz scenariusz',
  scenariuszZapisuje: 'Zapisywanie scenariusza…',
  scenariuszRewizja: 'rewizja',
  zdarzeniaTytul: 'Harmonogram zdarzeń',
  zdarzeniaBrak: 'Harmonogram jest pusty — dodaj zdarzenie.',
  dodajZdarzenie: 'Dodaj zdarzenie',
  wybierzRodzaj: 'Rodzaj zdarzenia…',
  usunZdarzenie: 'Usuń',
  niewykonywanyPrzezRdzen: '(bieg odmówi — rdzeń nie wykonuje tego rodzaju)',
  wartoscNiewykonywana: '(bieg odmówi)',
  brakWartosci: '— brak —',
  brakWartosciPole: 'puste = brak wartości',
  wartoscTak: 'tak',
  wartoscNie: 'nie',
  wybierzWariant: 'Wybierz…',
  dodajElementListy: 'Dodaj',
  usunElementListy: 'Usuń',
  listaPusta: 'Brak pozycji.',
  zakres: 'zakres',
  wymagane: 'Pole wymagane.',
  liczba: 'Wpisz liczbę.',
  calkowita: 'Wpisz liczbę całkowitą.',
  brakZdarzen: 'Harmonogram musi zawierać co najmniej jedno zdarzenie.',
  brakNazwyScenariusza: 'Nadaj scenariuszowi nazwę.',
  bledyZapisu: 'Backend odrzucił scenariusz:',

  // Nastawy solvera
  nastawyTytul: 'Nastawy solvera',
  nastawyOpis: 'Każda nastawa jest jawną decyzją projektanta — solver nie ma wartości domyślnych.',

  // Bieg
  biegTytul: 'Bieg',
  uruchom: 'Uruchom bieg dynamiki',
  warunekScenariusz: 'Zapisz i wybierz scenariusz nazwany.',
  warunekPunktPracy: 'Wskaż rozpływ — punkt pracy.',
  warunekGotowosc: 'Usuń braki modelu powyżej (bieg odmówi z tym modelem).',
  stanBiegu: {
    PENDING: 'Bieg utworzony — oczekuje na wykonanie.',
    RUNNING: 'Bieg w toku…',
    DONE: 'Bieg zakończony.',
    FAILED: 'Bieg zakończony odmową.',
  } as Record<string, string>,
  bladBiegu: 'Bieg zakończony odmową:',
  poprzednieBiegi: 'Wynik biegu',

  // Wynik
  wynikLadowanie: 'Wczytywanie wyniku biegu…',
  wynikBlad: 'Nie udało się wczytać wyniku biegu.',
  ocenyTytul: 'Ocena',
  poziomDowodowy: 'Poziom dowodowy wyniku',
  niedopuszczalnyRegulacyjnie: 'nie jest dowodem regulacyjnym',
  zalozeniaTytul: 'Założenia modelu',
  zdarzeniaWykonaneTytul: 'Oś zdarzeń',
  kolChwila: 'Chwila',
  kolZdarzenie: 'Zdarzenie',
  kolElement: 'Element',
  kolSkutki: 'Skutki topologiczne',
  kolPrzyczyna: 'Przyczyna',
  skutekPrzypisanie: 'Przypisanie stanu',
  skutkiBrak: 'bez zmiany zasilania',
  skutekOdciete: 'Odcięte od zasilania',
  skutekZasilone: 'Zasilone ponownie',
  skutekOdbiory: 'Odbiory odcięte',
  przekroczeniaTytul: 'Przekroczenia progów detektorów',
  przekroczeniaOpis:
    'Detektory scenariusza zapisują chwilę przekroczenia progu — bez działania na sieć i bez oceny.',
  przekroczeniaBrak:
    'Bieg nie zapisał przekroczeń (scenariusz bez detektorów albo żaden próg nie został przekroczony).',
  kolDetektor: 'Detektor',
  kolProg: 'Próg',
  kolKierunek: 'Kierunek',
  zacisk: 'zacisk',
  trybScenariusza: 'Tryb scenariusza',
  tryby: {
    siec: 'sieć — zakłócenia sieci projektu',
    stanowisko: 'stanowisko badawcze — źródło testowe o profilu U/f/faza',
  } as Record<string, string>,
  metrykiTytul: 'Wielkości charakterystyczne przebiegu',
  kolWielkosc: 'Wielkość',
  kolWartosc: 'Wartość',
  kolJednostka: 'Jednostka',
  baza: 'moc bazowa jednostek względnych',

  // Przeglądarka przebiegów
  przebiegiTytul: 'Przebiegi czasowe',
  kanalyTytul: 'Kanały',
  kanalyFiltr: 'Filtruj kanały',
  kanalyWybrane: 'wybrane',
  kanalyZaznaczonego: 'Zaznaczony na schemacie',
  kanalyZaznaczonegoDodaj: 'Pokaż jego kanały',
  kanalyZaznaczonegoBrak: 'Zaznaczony element nie ma kanałów w tym biegu.',
  kanalyWyczysc: 'Wyczyść wybór',
  przebiegiBrakWyboru: 'Wybierz kanały z listy, żeby narysować przebiegi.',
  przebiegiLadowanie: 'Wczytywanie próbek…',
  przebiegiBlad: 'Nie udało się wczytać próbek przebiegu.',
  osCzasu: 'Czas',
  jednS: 's',
  stronaL: 'tuż przed zdarzeniem',
  stronaP: 'tuż po zdarzeniu',
  brakProbki: 'brak wartości',
  grupaSzyna: 'Szyny',
  grupaGalaz: 'Gałęzie',
  grupaMiejsce: 'Miejsca zwarcia',
  grupaUrzadzenie: 'Urządzenia',
  grupaOdbior: 'Odbiory',

  // Teksty kanałów (etykiety z opisu wyniku)
  brakNazwy: 'element bez nazwy w modelu',
  zaciskOd: 'zacisk początkowy',
  zaciskDo: 'zacisk końcowy',
  miejsceZwarcia: 'miejsce zwarcia',
  rodzajMiejscaZwarcia: 'Miejsce zwarcia w gałęzi',

  // Audyt
  audytRun: 'Identyfikator biegu',
  audytWersja: 'Wersja solvera',
  audytKroki: 'Kroki całkowania (odrzucone)',
  audytResiduum: 'Największe residuum równań różniczkowych / algebraicznych',
  audytCzas: 'Czas obliczeń [s]',
  audytOdcisk: {
    odcisk_migawki: 'Odcisk migawki modelu',
    odcisk_punktu_pracy: 'Odcisk punktu pracy',
    odcisk_nastaw_solvera: 'Odcisk nastaw solvera',
    odcisk_harmonogramu: 'Odcisk harmonogramu zdarzeń',
    odcisk_implementacji: 'Odcisk implementacji solvera',
  } as Record<string, string>,
} as const;
