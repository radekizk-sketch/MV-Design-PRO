/**
 * Teksty PL kreatora „Dodaj źródło zasilania" (GPZ / rozdzielnia SN).
 * Język inżynierski (FLOW §0.3): po co / z czego / co daje.
 */

export const ZRODLO_STRINGS = {
  eyebrow: 'MODEL SIECI · ŹRÓDŁO ZASILANIA',
  celTworzenie:
    'Dodaj Główny Punkt Zasilający (GPZ) — źródło systemowe SN dla obliczeń. '
    + 'Dane zwarciowe i normowe czyta backend (IEC 60909); zapis tworzy szyny, sekcje i pola liniowe.',
  odznakaNowy: 'Nowy GPZ',
  odznakaEdycja: 'Edycja GPZ',

  // Katalog.
  katalogTytul: 'Źródło danych i katalog',
  katalogPole: 'Typ źródła z katalogu',
  katalogPlaceholder: '— wybierz źródło systemowe GPZ —',
  katalogLadowanie: 'Ładowanie katalogu źródeł…',
  katalogBlad: 'Nie udało się pobrać katalogu źródeł systemowych SN.',
  katalogPomoc:
    'Pakiet katalogowy GPZ wnosi napięcie SN, moc zwarciową $S_{k}\'\'$ i stosunek R/X. '
    + 'Wartości liczbowe zawsze pochodzą z katalogu — nie z ręcznego wpisu.',
  zrodloParametrow: 'Źródło parametrów',
  powiazanieKatalogowe: 'Powiązanie katalogowe',
  powiazanieBrak: 'wybierz wariant katalogowy',

  // Identyfikacja.
  idTytul: 'Identyfikacja GPZ',
  nazwa: 'Nazwa GPZ',
  nazwaPlaceholder: 'np. GPZ Wschód albo nazwa stacji',
  oznaczenie: 'Oznaczenie ruchowe',
  napiecieSn: 'Napięcie SN',
  napiecieSnPomoc: 'Napięcie nominalne szyn SN. Wpływa na dobór katalogu transformatorów i kabli.',
  uziemienie: 'Punkt neutralny sieci 110 kV',
  uziemienieR: 'R uziemienia',
  uziemienieX: 'X cewki',
  uziemienieZTransformatora: (grupa: string | null, uziemiony: boolean | null): string => (grupa
    ? `Transformatory 110/SN o grupie ${grupa}: ${uziemiony ? 'uzwojenie SN z wyprowadzonym punktem neutralnym daje drogę składowej zerowej po stronie SN' : 'uzwojenie SN nie daje drogi składowej zerowej — sieć SN bez zespołu uziemiającego pracuje jako izolowana'}. Punkt neutralny sieci SN uziemia zespół uziemiający sekcji (niżej) albo uzwojenie transformatora.`
    : 'Punkt neutralny sieci SN wynika z grupy połączeń transformatora 110/SN i z zespołów uziemiających sekcji — wybierz transformator z katalogu.'),
  uziemienieSnTytul: 'Uziemienie punktu neutralnego sieci SN',
  uziemienieSnOpis:
    'Sieć SN uziemia zespół uziemiający w polu ZU sekcji: transformator uziemiający ZNyn11 '
    + 'z dławikiem gaszącym (Z.13, opcjonalnie z AWSC), z dławikiem równolegle z rezystorem '
    + '(Z.14) albo z rezystorem (Z.15) — ENEA Zeszyt 1 §16. Równoważnik sieci nie opisuje '
    + 'uziemienia sieci SN. Sekcja bez zespołu pracuje jako izolowana albo z punktem neutralnym '
    + 'uzwojenia transformatora.',
  sekcjaZespol: (nazwa: string): string => `Zespół uziemiający w sekcji „${nazwa}”`,
  zespolWspolny:
    'Zaznaczone sekcje dostają zespół tego samego typu. Inny typ w jednej sekcji dodasz po '
    + 'zapisie z karty „Uziemienie” konfiguratora stacji.',
  zespolSpz: 'SPZ zespołu (tylko przy rezystorze — ENEA Zeszyt 1 §26.9.6)',
  zespolWylaczenieOdTr: 'Wyłączenie transformatora 110/SN sekcji wyłącza zespół',
  zespolWylaczenieOdTrOpis:
    'Przy rezystorze w punkcie neutralnym automatyczne wyłączenie pola SN transformatora '
    + 'wyłącza zespół uziemiający (IRiESD II.4.5.4.3.5). Dotyczy sekcji z transformatorem w modelu.',

  // Parametry zwarciowe.
  zwarcieTytul: 'Parametry zwarciowe na szynach SN',
  sk3: 'Moc zwarciowa $S_{k}\'\'$',
  sk3Pomoc: 'Początkowa symetryczna moc zwarciowa 3-faz (IEC 60909). Wpływa na dobór aparatury i zabezpieczeń.',
  rx: 'Stosunek R/X',
  rxPomoc: 'Stosunek rezystancji do reaktancji źródła (IEC 60909). Wpływa na prąd udarowy $i_{p}$.',
  czasCieplny: 'Czas cieplny $t_{k}$',

  // Scenariusz MIN (CV-4.3 K7): warunki przyłączenia OSD — minimalna moc/prąd zwarciowy.
  zwarcieMinTytul: 'Scenariusz MIN (warunki przyłączenia OSD)',
  zwarcieMinOpis:
    'Warunki przyłączenia OSD — minimalna moc zwarciowa; brak = scenariusz MIN liczony '
    + 'z danych maksymalnych (założenie niekonserwatywne dla czułości zabezpieczeń).',
  sk3Min: '$S_{k,\\min}\'\'$',
  sk3MinPomoc:
    'Minimalna symetryczna moc zwarciowa 3-faz (IEC 60909-0 §6.2.1, $c_{\\min}$). Podaj '
    + '$S_{k,\\min}^{\\prime\\prime}$ albo $I_{k,\\min}^{\\prime\\prime}$ — jedno wystarczy.',
  ik3Min: '$I_{k,\\min}\'\'$',
  ik3MinPomoc: 'Minimalny prąd zwarciowy 3-faz — alternatywa dla $S_{k,\\min}\'\'$, gdy OSD podaje prąd, nie moc.',
  rxMin: 'Stosunek R/X (MIN)',
  rxMinPomoc:
    'Stosunek R/X dla scenariusza MIN. Wymaga podanego $S_{k,\\min}\'\'$ albo $I_{k,\\min}\'\'$ — bez nich '
    + 'nie ma zastosowania (scenariusz MIN liczony z danych maksymalnych).',

  // Napięcie zadane szyny bilansującej (CV-4.3 K7c) — niezależne od scenariusza MIN.
  uSetPu: 'Napięcie zadane szyny bilansującej',
  uSetPuPomoc:
    'Po co: nastawa modułu napięcia szyny bilansującej (MATPOWER Vm węzła slack) '
    + '— punkt startowy i referencja rozpływu mocy całej sieci SN. Z czego: warunki '
    + 'przyłączenia OSD albo profil pracy sieci nadrzędnej. Puste = znamionowe '
    + '(1,0 p.u.). Pasmo dopuszczalne: 0,8–1,2 p.u.',

  // Parametry normowe.
  normyTytul: 'Parametry normowe',
  norma: 'Norma obliczeniowa',
  czestotliwosc: 'Częstotliwość',
  // Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: c nie jest parametrem źródła — jedynym nośnikiem jest
  // tabela 1 IEC 60909-0 per węzeł (pasmo napięcia, tolerancja nN) i scenariusz MAX/MIN
  // przypadku obliczeniowego. Dawna stała „1,10 / 1,00" była fałszywa dla sieci nN.
  wspolczynnikC: 'Współczynnik napięcia c',
  wspolczynnikCPodstawa:
    'IEC 60909-0 tab. 1 per węzeł — wg pasma napięcia i scenariusza MAX/MIN przypadku obliczeniowego',

  // Sekcje (advanced).
  sekcjeTytul: 'Sekcje szyn GPZ',
  liczbaSekcji: 'Liczba sekcji szyn SN',
  liczbaTrafo: 'Transformatory 110/SN',
  polNaSekcje: 'Pola liniowe na sekcję',
  nazwaSekcji: 'Nazwa sekcji',
  nazwaPola: 'Nazwa pola liniowego',
  aparatRodzaj: 'Aparat pola liniowego',
  aparatKatalog: 'Typ aparatu z katalogu',
  aparatPlaceholder: '— wybierz aparat SN —',
  aparatBlad: 'Nie udało się pobrać katalogu aparatury SN.',

  // Składowa zerowa (advanced).
  zeroTytul: 'Składowa zerowa sieci 110 kV',
  zeroToggle: 'Definiuj $R_{0}$/$X_{0}$ sieci 110 kV dla obliczeń doziemnych',
  podsumIk1ZespolSn: 'z zespołu uziemiającego sekcji (bieg zwarć)',
  r0: '$R_{0}$',
  x0: '$X_{0}$',
  z0z1: '$Z_{0}$/$Z_{1}$',

  // Podsumowanie.
  podsumTytul: 'Podsumowanie obliczone (backend)',
  podsumSk: '$S_{k}\'\'$ (SN)',
  podsumIk3: '$I_{k}\'\'$ (3-faz. maks.)',
  podsumIk1: '$I_{k}\'\'$ (1-faz. maks.)',
  podsumKappa: 'κ (IEC 60909)',
  podsumIp: '$i_{p}$ (3-faz. maks.)',
  podsumIth: '$I_{th}$ (3-faz., $t_{k}$)',
  podsumZ1: '$Z_{1}$ źródła',
  podsumZ0: '$Z_{0}$ źródła',
  // Scenariusz MIN (CV-4.3 K7) — te same wielkości co powyżej, policzone z danych MIN
  // (renderowane WYŁĄCZNIE gdy backend zwrócił blok `scenariusz_min`, zero fabrykacji).
  podsumSkMin: '$S_{k}\'\'$ (SN, min.)',
  podsumIk3Min: '$I_{k}\'\'$ (3-faz. min.)',
  podsumIk1Min: '$I_{k}\'\'$ (1-faz. min.)',
  podsumKappaMin: 'κ (min.)',
  podsumIpMin: '$i_{p}$ (3-faz. min.)',
  podsumIthMin: '$I_{th}$ (3-faz. min., $t_{k}$)',
  podsumZ1Min: '$Z_{1}$ źródła (min.)',
  podsumZ0Min: '$Z_{0}$ źródła (min.)',
  podsumZrodlo: 'Źródło wyników',
  podsumZrodloWartosc: 'Obliczenie IEC 60909 po stronie serwera',
  podsumBrak: 'nie wyznaczono',
  podsumBladDomyslny: 'Nie udało się wyznaczyć podsumowania GPZ.',
  podsumBrakZero: 'Backend nie zwrócił składowej zerowej — wynik zwarcia doziemnego pozostaje niedostępny.',

  // Kontrola / gotowość.
  kontrolaTytul: 'Kontrola GPZ',

  // Następny krok.
  nastepnyOpis:
    'Po zapisie GPZ dodaj pola liniowe, stacje SN/nN i źródła OZE, a następnie uruchom obliczenia zwarciowe i rozpływowe.',

  // Kroki (tor pracy).
  krokIdentyfikacja: 'Identyfikacja',
  krokZrodlo: 'Źródło i strona WN',
  krokTransformatory: 'Transformatory',
  krokRozdzielnia: 'Rozdzielnia SN',
  krokSekcje: 'Sekcje i pola',
  krokNormy: 'Parametry normowe',
  krokZapis: 'Podsumowanie i zapis',
  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,

  // Tryb źródła.
  trybZrodlaTytul: 'Tryb doboru źródła',
  trybKatalog: 'Z katalogu',
  trybReczny: 'Ręczny ekwiwalent (ekspercki)',
  trybRecznyInfo:
    'Tryb ekspercki: wpisujesz ekwiwalent zwarciowy ręcznie (bez pakietu katalogowego). '
    + 'Używaj, gdy dysponujesz danymi OSD/PSE dla konkretnego węzła.',
  stronaTytul: 'Strona odniesienia parametrów',
  stronaSn: 'Strona SN',
  stronaHv: 'Strona 110 kV',
  trybParamTytul: 'Postać parametru zwarciowego',
  trybMoc: 'Moc zwarciowa $S_{k}\'\'$',
  trybImpedancja: 'Impedancja R + jX',
  napiecieHv: 'Napięcie szyny 110 kV',
  sk3Hv: 'Moc zwarciowa $S_{k}\'\'$ (110 kV)',
  rOhm: 'Rezystancja R',
  xOhm: 'Reaktancja X',

  // Transformatory.
  transformatoryOpis:
    'Liczba i typ transformatorów 110/SN łączących wspólną szynę 110 kV (na niej równoważnik '
    + 'sieci) z sekcjami SN — transformator n zasila sekcję n (po kolei, cyklicznie). Parametry '
    + '($S_{n}$, $u_{k}$, grupa połączeń) pochodzą z katalogu; rozpływ przez każdy transformator i wkłady '
    + 'zwarciowe liczy backend dla rzeczywistego stanu sprzęgła.',
  transformatoryPozaModelem:
    'Równoważnik sieci podany na szynach SN (z katalogu albo ręcznie po stronie SN) to moc '
    + 'zwarciowa widziana z szyn SN — zawiera już impedancję transformatorów 110/SN. Granicą '
    + 'modelu są wtedy szyny SN GPZ: transformatory 110/SN nie są elementami obliczeń i kreator '
    + 'ich nie tworzy. Równoważnik zasila sekcję 1; kolejne sekcje zasila sprzęgło. Aby '
    + 'zamodelować transformatory 110/SN (rozpływ przez każdy z nich, wkłady zwarciowe, '
    + 'regulacja zaczepów), wybierz w kroku „Źródło” ręczny ekwiwalent (ekspercki) po stronie '
    + '110 kV — transformatory połączą wtedy wspólną szynę 110 kV z sekcjami SN.',
  transformatoryPozaModelemKrotko: 'W równoważniku SN (poza modelem)',
  transformatorKatalog: 'Typ transformatora 110/SN z katalogu',
  transformatorPlaceholder: '— transformator domyślny (dobór automatyczny) —',
  transformatorBlad: 'Nie udało się pobrać katalogu transformatorów.',
  transformatorSn: 'Moc znamionowa $S_{n}$',
  transformatorUk: 'Napięcie zwarcia $u_{k}$',
  transformatorGrupa: 'Grupa połączeń',

  // Regulacja zaczepów (OLTC/DETC) — V12K-045.
  oltcTytul: 'Regulacja napięcia (przełącznik zaczepów)',
  oltcOpis:
    'Regulacja przekładni transformatora 110/SN. OLTC (pod obciążeniem) reguluje '
    + 'napięcie szyny SN automatycznie; DETC ustawia stały zaczep bez obciążenia. '
    + 'Wynik regulacji liczy rozpływ (pętla OLTC), nie UI.',
  oltcTyp: 'Rodzaj regulacji',
  oltcKatalog: 'Przełącznik zaczepów z katalogu',
  oltcKatalogPlaceholder: '— dobór ręczny (bez katalogu) —',
  oltcKatalogBlad: 'Nie udało się pobrać katalogu przełączników zaczepów.',
  oltcUzwojenie: 'Regulowane uzwojenie',
  oltcNeutral: 'Pozycja neutralna',
  oltcBiezaca: 'Pozycja bieżąca',
  oltcMin: 'Pozycja min.',
  oltcMax: 'Pozycja maks.',
  oltcKrok: 'Wielkość kroku',
  oltcTryb: 'Tryb sterowania',
  oltcSetpoint: 'Napięcie zadane',
  oltcDeadband: 'Pasmo nieczułości',
  oltcOpoznienie: 'Opóźnienie zadziałania',
  oltcLdc: 'Kompensacja spadku na linii (LDC)',
  oltcLdcR: 'LDC — rezystancja R',
  oltcLdcX: 'LDC — reaktancja X',
  oltcTrybAutoInfo:
    'W trybie automatycznym pętla rozpływu przesuwa jeden zaczep na krok, aż napięcie '
    + 'szyny SN znajdzie się w paśmie nieczułości wokół wartości zadanej.',
  oltcTypy: [
    { id: 'NONE', etykieta: 'Brak regulacji' },
    { id: 'DETC', etykieta: 'DETC (bez obciążenia)' },
    { id: 'OLTC', etykieta: 'OLTC (pod obciążeniem)' },
  ],
  oltcUzwojenia: [
    { id: 'HV', etykieta: 'Górne (110 kV)' },
    { id: 'LV', etykieta: 'Dolne (SN)' },
  ],
  oltcTryby: [
    { id: 'MANUAL', etykieta: 'Ręczny' },
    { id: 'AUTOMATIC', etykieta: 'Automatyczny (AVR)' },
    { id: 'PROFILE', etykieta: 'Profil dobowy' },
    { id: 'REMOTE', etykieta: 'Zdalny (SCADA)' },
  ],

  // Rozdzielnia.
  rozdzielniaOpis:
    'Liczba sekcji szyn SN i uziemienie punktu neutralnego sieci SN. Sprzęgło powstaje '
    + 'automatycznie między sekcjami (dla ≥ 2 sekcji).',
  sprzegloNota: 'Sprzęgło sekcyjne: powstaje automatycznie dla 2+ sekcji.',

  // Sekcje i pola (per sekcja).
  sekcjeOpis:
    'Konfiguracja per sekcja: nazwa sekcji i liczba pól liniowych. Każde pole '
    + 'dostaje ten sam typ aparatu dobrany poniżej.',
  sekcjaNazwaPol: 'Nazwa sekcji',
  sekcjaLiczbaPol: 'Pola liniowe',
  aparatSekcja: 'Aparat pól liniowych',

  // Rodzina rozdzielnicy producenta (Reference Engine).
  rodzinaTytul: 'Rozdzielnica producenta (referencje)',
  rodzinaOpis:
    'Wybór rodziny rozdzielnicy producenta dobiera szablony pól (skład aparatury, sekwencja) '
    + 'wg katalogu producenta i norm. Zasila układ pola na schemacie (SLD) i ocenę zgodności.',
  rodzinaPole: 'Rodzina rozdzielnicy',
  rodzinaPlaceholder: '— rozdzielnica uniwersalna (bez producenta) —',
  rodzinaBlad: 'Nie udało się pobrać rodzin rozdzielnic.',
  sekcjaSzablon: 'Szablon pola (producent)',
  sekcjaSzablonPlaceholder: '— szablon domyślny —',
  sekcjaSzablonPomoc: 'Szablon pola liniowego z wybranej rodziny — determinuje skład aparatury pola.',

  // Zabezpieczenie polowe (powiązanie globalne).
  zabezpieczenieTytul: 'Zabezpieczenie polowe',
  zabezpieczenieOpis:
    'Pola liniowe wymagają zabezpieczenia (przekaźnik + nastawy). Po utworzeniu GPZ '
    + 'nastawy i automatykę (SPZ/SZR) konfigurujesz w ekranie „Zabezpieczenia i automatyka”, '
    + 'a selektywność w „Koordynacji zabezpieczeń”.',

  // K7.
  przegladTytul: 'Sprawdź konfigurację',
  przegladOpis:
    'Sprawdź podsumowanie obliczone (kolumna z prawej) i kontrolę gotowości. '
    + 'Zapis tworzy szyny SN, sekcje, sprzęgło i pola liniowe.',

  // Panel teorii (V12K-066: standard „must-have")
  teoriaTytul: 'Teoria: GPZ jako źródło systemowe i moc zwarciowa',
  teoriaOpis:
    'Główny Punkt Zasilający (GPZ) jest w modelu źródłem systemowym (slack) — reprezentuje sieć '
    + 'nadrzędną o zadanej mocy zwarciowej $S_{k}\'\'$ i stosunku R/X. Moc zwarciowa określa „sztywność" '
    + 'sieci: im wyższe $S_{k}\'\'$, tym mniejsza impedancja źródła ($Z = c \\cdot U^2 / S_k\'\'$), wyższe prądy zwarciowe '
    + 'i mniejsze wahania napięcia przy zmianach obciążenia. Stosunek R/X wpływa na prąd udarowy $i_{p}$ '
    + '(współczynnik κ) i na charakter spadków napięcia. Wszystkie prądy zwarciowe ($I_{k}\'\'$, $i_{p}$, $I_{th}$) '
    + 'liczy backend wg IEC 60909 — GPZ wnosi tylko parametry źródła; z nich wynika dobór aparatury '
    + 'i nastaw zabezpieczeń w całej sieci SN.',
  teoriaWymog:
    'Aparatura i pola muszą wytrzymać prąd zwarciowy wynikający z $S_{k}\'\'$ (zdolność łączeniowa, '
    + 'wytrzymałość cieplna i dynamiczna); dane zwarciowe pobiera się od OSD/PSE dla danego węzła.',
  teoriaPodstawa: 'Podstawa: IEC 60909 (prądy zwarciowe), PN-EN 62271 (aparatura), dane OSD/PSE.',
  teoriaJakCzytac:
    'Krzywa = impedancja źródła w funkcji mocy zwarciowej ($Z \\propto 1/S_k\'\'$). Punkt (1;1) = '
    + 'odniesienie; podwojenie $S_{k}\'\'$ o połowę zmniejsza Z (sieć sztywniejsza: wyższe prądy zwarciowe, '
    + 'mniejsze wahania napięcia). Rzeczywiste $I_{k}\'\'$/Z liczy backend wg IEC 60909.',
  wykresAria: 'Sztywność sieci: impedancja źródła w funkcji mocy zwarciowej (Z proporcjonalne do 1/$S_{k}\'\'$)',
  wykresOsSk: 'Moc zwarciowa $S_{k}\'\'/S_{k,n}\'\'$',
  wykresOsZ: 'Impedancja $Z/Z_{n}$',
  wykresPunkt: 'odniesienie',

  // Akcje / błędy.
  zapisz: 'Zapisz GPZ',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem GPZ.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać GPZ.',
  katalogLadowanieStopka: 'Ładowanie katalogu systemów zasilających — zapis chwilę poczeka.',

  // Opcje.
  rodzajeAparatu: [
    { id: 'BREAKER', etykieta: 'Wyłącznik' },
    { id: 'DISCONNECTOR', etykieta: 'Odłącznik' },
    { id: 'LOAD_SWITCH', etykieta: 'Rozłącznik' },
  ],
  napieciaSn: [
    { id: '15', etykieta: '15 kV' },
    { id: '20', etykieta: '20 kV' },
    { id: '30', etykieta: '30 kV' },
  ],
  typyUziemienia: [
    { id: 'resistor_grounded', etykieta: 'Rezystorowe (R w punkcie 0)' },
    { id: 'isolated', etykieta: 'Izolowane (IT)' },
    { id: 'petersen_coil', etykieta: 'Cewka Petersena (kompensacja)' },
    { id: 'directly_grounded', etykieta: 'Bezpośrednie (sztywne)' },
  ],
  liczby1do4: [
    { id: '1', etykieta: '1' },
    { id: '2', etykieta: '2' },
    { id: '3', etykieta: '3' },
    { id: '4', etykieta: '4' },
  ],
} as const;
