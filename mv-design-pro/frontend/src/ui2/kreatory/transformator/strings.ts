/** Teksty PL kreatora „Dodaj transformator SN/nN" (G-TRF). Język inżynierski. */

export const TRANSFORMATOR_STRINGS = {
  eyebrow: 'MODEL SIECI · TRANSFORMATOR SN/nN',
  cel:
    'Dodaj transformator między szyną SN a szyną nN stacji. Typ (moc, napięcia, uk) '
    + 'bierzesz z katalogu; prądy strony górnej i dolnej liczy backend. '
    + 'Możesz skonfigurować regulację zaczepów (DETC bez obciążenia lub OLTC pod obciążeniem).',
  odznaka: 'Nowy transformator',

  krokSzyny: 'Szyny i typ',
  krokRegulacja: 'Regulacja zaczepów',
  krokZapis: 'Podsumowanie i zapis',

  hvBus: 'Szyna SN (górne napięcie)',
  lvBus: 'Szyna nN (dolne napięcie)',
  busPlaceholder: '— wybierz szynę —',
  typKatalog: 'Typ transformatora z katalogu',
  typKatalogPlaceholder: '— wybierz typ transformatora —',
  typBlad: 'Nie udało się pobrać katalogu transformatorów SN/nN.',
  typPomoc: 'Typ wnosi moc [MVA], napięcia [kV], uk% i zakres zaczepów — z katalogu, nie z ręki.',
  nazwa: 'Nazwa transformatora',
  nazwaPlaceholder: 'np. TR1 stacji ST-3',

  // Parametry katalogu (odczyt).
  paramMoc: 'Moc znamionowa',
  paramNapiecia: 'Napięcia HV/LV',
  paramUk: 'Napięcie zwarcia uk',
  paramZaczepy: 'Zakres zaczepów',

  // Regulacja.
  regTyp: 'Rodzaj regulacji',
  regTypOpcje: [
    { id: 'NONE', etykieta: 'Bez regulacji' },
    { id: 'DETC', etykieta: 'DETC (bez obciążenia)' },
    { id: 'OLTC', etykieta: 'OLTC (pod obciążeniem)' },
  ],
  regUzwojenie: 'Regulowane uzwojenie',
  regUzwojenieOpcje: [
    { id: 'HV', etykieta: 'Górne (SN)' },
    { id: 'LV', etykieta: 'Dolne (nN)' },
  ],
  tapNeutral: 'Zaczep neutralny',
  tapCurrent: 'Zaczep bieżący',
  tapMin: 'Zaczep min.',
  tapMax: 'Zaczep maks.',
  tapStep: 'Krok zaczepu',
  controlMode: 'Tryb sterowania OLTC',
  controlModeOpcje: [
    { id: 'MANUAL', etykieta: 'Ręczny' },
    { id: 'AUTOMATIC', etykieta: 'Automatyczny (AVR)' },
  ],
  setpoint: 'Napięcie zadane',
  deadband: 'Pasmo nieczułości',
  regBezPomoc: 'Bez regulacji transformator ma stałą przekładnię znamionową.',
  regAvrPomoc: 'Automatyka (AVR) reguluje zaczep do napięcia zadanego — wynik policzy rozpływ mocy.',

  // Podgląd (R2).
  podgladTytul: 'Podgląd prądów (backend)',
  podgladI1: 'Prąd strony górnej I₁',
  podgladI2: 'Prąd strony dolnej I₂',
  podgladZrodlo: 'Źródło wyniku',
  podgladZrodloWartosc: 'Obliczenie prądów po stronie serwera (R2)',
  podgladBrak: 'Wybierz typ transformatora, aby zobaczyć prądy I₁/I₂.',
  podgladBlad: 'Nie udało się wyznaczyć podglądu prądów.',

  // Downstream.
  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Rozpływ mocy (z pętlą OLTC, jeśli włączona) i zwarcia (Ik) uwzględnią transformator; '
    + 'badania regulacji OLTC, straty i raporty policzą jego wpływ.',

  // Kontrola.
  kontrolaTytul: 'Kontrola transformatora',
  wierszSzyny: 'Para szyn',
  wierszTyp: 'Typ z katalogu',
  wierszMoc: 'Moc',
  wierszRegulacja: 'Regulacja',

  // Stan zerowy.
  brakKontekstuTytul: 'Brak pary szyn SN/nN',
  brakKontekstuOpis:
    'Wskaż stację SN/nN z kompletną parą szyn (SN i nN), aby dodać transformator.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz transformator',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem transformatora.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać transformator.',

  // Panel teorii (V12K-066: standard „must-have")
  teoriaSzynyTytul: 'Teoria: transformator SN/nN — przekładnia i impedancja zwarcia',
  teoriaSzynyOpis:
    'Transformator łączy szynę górnego napięcia (strona zasilania) z dolnym przez przekładnię '
    + 'napięciową. Moc znamionowa Sn ogranicza obciążalność, a napięcie zwarcia uk [%] wyznacza '
    + 'impedancję szeregową ($Z \\approx u_k \\cdot U^2 / S_n$) — decyduje o spadku napięcia pod obciążeniem i o prądzie '
    + 'zwarciowym po stronie dolnej (im wyższe uk, tym mniejszy prąd zwarciowy, ale większy spadek '
    + 'napięcia). Grupa połączeń (np. Dyn11) określa przesunięcie fazowe i drogę składowej zerowej '
    + 'dla zwarć doziemnych. Wszystkie parametry pochodzą z katalogu; prądy i spadki liczy solver.',
  teoriaSzynyWymog:
    'Sn dobiera się do mocy szczytowej z zapasem; uk i grupa połączeń muszą być zgodne z układem '
    + 'sieci (praca równoległa transformatorów wymaga tej samej grupy i zbliżonego uk).',
  teoriaSzynyPodstawa: 'Podstawa: PN-EN 60076, IEC 60909 (udział transformatora w zwarciu).',
  teoriaRegTytul: 'Teoria: regulacja napięcia i przełącznik zaczepów',
  teoriaRegOpis:
    'Transformator zmienia napięcie w stosunku przekładni; przełącznik zaczepów pozwala tę '
    + 'przekładnię korygować w krokach. DETC (przełączanie beznapięciowe) ustawia się raz przy '
    + 'wyłączonym transformatorze — kompensuje stały poziom napięcia sieci. OLTC (przełączanie '
    + 'pod obciążeniem) reguluje napięcie w trakcie pracy: w trybie automatycznym (AVR) regulator '
    + 'utrzymuje napięcie zadane na wskazanej szynie w paśmie nieczułości — przy odchyłce większej '
    + 'niż pasmo zmienia zaczep. Uzwojenie regulowane, zakres i krok zaczepów oraz nastawy AVR '
    + '(napięcie zadane, pasmo) decydują o profilu napięć w całej sieci zasilanej z tego transformatora.',
  teoriaRegWymog:
    'Pasmo nieczułości AVR powinno być szersze niż skok napięcia jednego zaczepu (inaczej regulator '
    + '„poluje"). Napięcie zadane dobiera się do wymagań odbiorów i dopuszczalnych odchyleń napięcia.',
  teoriaRegPodstawa:
    'Podstawa: PN-EN 60076 (transformatory), PN-EN 50160 (parametry napięcia), IRiESD.',
  teoriaRegJakCzytac:
    'Kropki = napięcie szyny osiągalne na kolejnych zaczepach (odstęp = krok zaczepu). Pasmo = '
    + 'zakres nieczułości wokół napięcia zadanego; regulator wybiera zaczep, którego napięcie trafia '
    + 'w pasmo. Gdy pasmo jest węższe niż skok jednego zaczepu — regulator „poluje" (brak stabilnej pozycji).',
  avrOsTap: 'Pozycja zaczepu',
  avrOsU: 'Napięcie szyny [pu]',
  avrZadane: 'napięcie zadane',
} as const;
