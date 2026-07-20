/**
 * Teksty PL kreatora „Dodaj źródło zasilania" (GPZ / rozdzielnia SN).
 * Język inżynierski (FLOW §0.3): po co / z czego / co daje.
 */

export const ZRODLO_STRINGS = {
  eyebrow: 'MODEL SIECI · ŹRÓDŁO ZASILANIA',
  celTworzenie:
    'Dodaj Główny Punkt Zasilający (GPZ) — źródło systemowe SN dla obliczeń. '
    + 'Dane zwarciowe i normowe czyta backend (IEC 60909); zapis tworzy szyny, sekcje i pola odpływowe.',
  odznakaNowy: 'Nowy GPZ',
  odznakaEdycja: 'Edycja GPZ',

  // Zakres wariantu.
  zakresTytul: 'Zakres wariantu GPZ',
  zakresZrodloSn: 'Źródło SN',
  zakresWnSn: 'GPZ WN/SN',
  zakresInfo:
    'Wariant „Źródło SN": parametry zwarciowe, uziemienie i pola odpływowe pochodzą z pakietu '
    + 'katalogowego GPZ. Pełny układ WN/SN (sekcje 110 kV, transformatory, składowa zerowa) '
    + 'konfigurujesz w wariancie „GPZ WN/SN".',

  // Katalog.
  katalogTytul: 'Źródło danych i katalog',
  katalogPole: 'Typ źródła z katalogu',
  katalogPlaceholder: '— wybierz źródło systemowe GPZ —',
  katalogLadowanie: 'Ładowanie katalogu źródeł…',
  katalogBlad: 'Nie udało się pobrać katalogu źródeł systemowych SN.',
  katalogPomoc:
    'Pakiet katalogowy GPZ wnosi napięcie SN, moc zwarciową Sk″ i stosunek R/X. '
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
  uziemienie: 'Uziemienie punktu neutralnego',
  uziemienieR: 'R uziemienia',
  uziemienieX: 'X cewki',

  // Parametry zwarciowe.
  zwarcieTytul: 'Parametry zwarciowe na szynach SN',
  sk3: 'Moc zwarciowa Sk″',
  sk3Pomoc: 'Początkowa symetryczna moc zwarciowa 3-faz (IEC 60909). Wpływa na dobór aparatury i zabezpieczeń.',
  rx: 'Stosunek R/X',
  rxPomoc: 'Stosunek rezystancji do reaktancji źródła (IEC 60909). Wpływa na prąd udarowy ip.',
  czasCieplny: 'Czas cieplny tk',

  // Parametry normowe.
  normyTytul: 'Parametry normowe',
  norma: 'Norma obliczeniowa',
  czestotliwosc: 'Częstotliwość',
  cMax: 'Współczynnik napięcia c (maks.)',
  cMin: 'Współczynnik napięcia c (min.)',

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
  zeroTytul: 'Składowa zerowa',
  zeroToggle: 'Definiuj R0/X0 dla obliczeń doziemnych',
  r0: 'R0',
  x0: 'X0',
  z0z1: 'Z0/Z1',

  // Podsumowanie.
  podsumTytul: 'Podsumowanie obliczone (backend)',
  podsumSk: 'Sk″ (SN)',
  podsumIk3: 'Ik″ (3-faz. maks.)',
  podsumIk1: 'Ik″ (1-faz. maks.)',
  podsumKappa: 'κ (IEC 60909)',
  podsumIp: 'ip (3-faz. maks.)',
  podsumIth: 'Ith (3-faz., tk)',
  podsumZ1: 'Z1 źródła',
  podsumZ0: 'Z0 źródła',
  podsumZrodlo: 'Źródło wyników',
  podsumZrodloWartosc: 'Obliczenie IEC 60909 po stronie serwera',
  podsumBrak: 'nie wyznaczono',
  podsumBladDomyslny: 'Nie udało się wyznaczyć podsumowania GPZ.',
  podsumBrakZero: 'Backend nie zwrócił składowej zerowej — wynik zwarcia doziemnego pozostaje niedostępny.',

  // Kontrola / gotowość.
  kontrolaTytul: 'Kontrola GPZ',

  // Następny krok.
  nastepnyOpis:
    'Po zapisie GPZ dodaj pola odpływowe, stacje SN/nN i źródła OZE, a następnie uruchom obliczenia zwarciowe i rozpływowe.',

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
  trybMoc: 'Moc zwarciowa Sk″',
  trybImpedancja: 'Impedancja R + jX',
  napiecieHv: 'Napięcie szyny 110 kV',
  sk3Hv: 'Moc zwarciowa Sk″ (110 kV)',
  rOhm: 'Rezystancja R',
  xOhm: 'Reaktancja X',

  // Transformatory.
  transformatoryOpis:
    'Liczba i typ transformatorów 110/SN zasilających szyny GPZ. Parametry (Sn, uk, grupa '
    + 'połączeń) pochodzą z katalogu — wynik zwarciowy liczy backend.',
  transformatorKatalog: 'Typ transformatora 110/SN z katalogu',
  transformatorPlaceholder: '— transformator domyślny (dobór automatyczny) —',
  transformatorBlad: 'Nie udało się pobrać katalogu transformatorów.',
  transformatorSn: 'Moc znamionowa Sn',
  transformatorUk: 'Napięcie zwarcia uk',
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
    'Liczba sekcji szyn SN i sposób uziemienia punktu neutralnego. Sprzęgło powstaje '
    + 'automatycznie między sekcjami (dla ≥ 2 sekcji).',
  sprzegloNota: 'Sprzęgło sekcyjne: powstaje automatycznie dla 2+ sekcji.',

  // Sekcje i pola (per sekcja).
  sekcjeOpis:
    'Konfiguracja per sekcja: nazwa sekcji i liczba pól liniowych odpływowych. Każde pole '
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
  sekcjaSzablonPomoc: 'Szablon pola odpływowego z wybranej rodziny — determinuje skład aparatury pola.',

  // Zabezpieczenie polowe (powiązanie globalne).
  zabezpieczenieTytul: 'Zabezpieczenie polowe',
  zabezpieczenieOpis:
    'Pola odpływowe wymagają zabezpieczenia (przekaźnik + nastawy). Po utworzeniu GPZ '
    + 'nastawy i automatykę (SPZ/SZR) konfigurujesz w ekranie „Zabezpieczenia i automatyka”, '
    + 'a selektywność w „Koordynacji zabezpieczeń”.',

  // K7.
  przegladTytul: 'Sprawdź konfigurację',
  przegladOpis:
    'Sprawdź podsumowanie obliczone (kolumna z prawej) i kontrolę gotowości. '
    + 'Zapis tworzy szyny SN, sekcje, sprzęgło i pola odpływowe.',

  // Panel teorii (V12K-066: standard „must-have")
  teoriaTytul: 'Teoria: GPZ jako źródło systemowe i moc zwarciowa',
  teoriaOpis:
    'Główny Punkt Zasilający (GPZ) jest w modelu źródłem systemowym (slack) — reprezentuje sieć '
    + 'nadrzędną o zadanej mocy zwarciowej Sk″ i stosunku R/X. Moc zwarciowa określa „sztywność" '
    + 'sieci: im wyższe Sk″, tym mniejsza impedancja źródła (Z = c·U²/Sk″), wyższe prądy zwarciowe '
    + 'i mniejsze wahania napięcia przy zmianach obciążenia. Stosunek R/X wpływa na prąd udarowy ip '
    + '(współczynnik κ) i na charakter spadków napięcia. Wszystkie prądy zwarciowe (Ik″, ip, Ith) '
    + 'liczy backend wg IEC 60909 — GPZ wnosi tylko parametry źródła; z nich wynika dobór aparatury '
    + 'i nastaw zabezpieczeń w całej sieci SN.',
  teoriaWymog:
    'Aparatura i pola muszą wytrzymać prąd zwarciowy wynikający z Sk″ (zdolność łączeniowa, '
    + 'wytrzymałość cieplna i dynamiczna); dane zwarciowe pobiera się od OSD/PSE dla danego węzła.',
  teoriaPodstawa: 'Podstawa: IEC 60909 (prądy zwarciowe), PN-EN 62271 (aparatura), dane OSD/PSE.',

  // Akcje / błędy.
  zapisz: 'Zapisz GPZ',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem GPZ.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać GPZ.',

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
    { id: 'solid_grounded', etykieta: 'Bezpośrednie (TN)' },
  ],
  liczby1do4: [
    { id: '1', etykieta: '1' },
    { id: '2', etykieta: '2' },
    { id: '3', etykieta: '3' },
    { id: '4', etykieta: '4' },
  ],
} as const;
