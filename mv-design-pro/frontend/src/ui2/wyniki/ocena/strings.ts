/* Teksty PL ekranu „Ocena techniczna wyników" (karta B-02 / W3-E). Język formalny,
 * inżynierski — bez anglicyzmów interfejsu i bez skrótów stanów (PASS/WARN/FAIL). */

export const OCENA_STRINGS = {
  tytul: 'Ocena techniczna wyników',
  cel:
    'Co z obliczeń wynika i na jakiej podstawie tak oceniono: każdy element sieci wobec '
    + 'kryterium, z wartością obliczoną, wartością odniesienia, marginesem, podstawą oceny '
    + 'i wnioskiem projektowym.',

  // Podstawa oceny (nagłówek)
  podstawaTytul: 'Podstawa oceny',
  podstawaProjekt: 'Projekt',
  podstawaPrzypadek: 'Przypadek obliczeniowy',
  podstawaWariant: 'Wariant pracy',
  podstawaWariantOpis: 'zatwierdzony model sieci przypadku',
  podstawaRewizja: 'Rewizja modelu',
  podstawaOdcisk: 'odcisk',
  podstawaPrzebiegi: 'Przebiegi obliczeń',
  podstawaPakiet: 'Pakiet wyników',
  podstawaPakietBrak: 'brak zakończonych przebiegów',
  przebiegZakonczony: 'ZAKOŃCZONY',
  przebiegAktualny: 'aktualny wobec modelu',
  przebiegNieaktualny: 'NIEAKTUALNY — model zmieniony po biegu, wyniki nie są podstawą oceny',
  przebiegBrak: 'brak przebiegu',
  przebiegCzas: 'czas wykonania',
  przebiegIdentyfikator: 'identyfikator',
  zrodloRozplyw: 'Rozpływ mocy',
  zrodloZwarcie: 'Zwarcia',
  zrodloModel: 'Model sieci',
  pakietRozplyw: 'rozpływ mocy',
  pakietZwarcia: 'zwarcia',

  // Podsumowanie liczbowe
  podsumowanieTytul: 'Podsumowanie oceny',
  oceniono: 'OCENIONO',
  spelnia: 'SPEŁNIA WYMAGANIA',
  nieSpelnia: 'NIE SPEŁNIA WYMAGAŃ',
  brakPodstaw: 'BRAK PODSTAW DO OCENY',
  ocenaCalosciowaSpelnia:
    'Wszystkie ocenione elementy spełniają wymagania w kryteriach objętych oceną automatyczną.',
  ocenaCalosciowaNieSpelnia:
    'Część elementów nie spełnia wymagań — pozycje z wynikiem „NIE SPEŁNIA WYMAGAŃ" wymagają decyzji projektowej.',
  ocenaCalosciowaBrakPodstaw:
    'Brak elementów nie spełniających wymagań, ale część kryteriów nie ma podstawy do oceny — to nie jest równoznaczne ze spełnieniem.',

  // Pozycje oceny
  kolPrzedmiot: 'Przedmiot oceny',
  kolWielkosc: 'Wielkość',
  kolWartosc: 'Wartość obliczona',
  kolOdniesienie: 'Wartość odniesienia / graniczna',
  kolMargines: 'Margines',
  kolPodstawa: 'Podstawa oceny',
  kolWynik: 'Wynik oceny',
  kolWniosek: 'Wniosek',
  kolDzialania: 'Powiązania',
  wynikSpelnia: 'SPEŁNIA WYMAGANIA',
  wynikNieSpelnia: 'NIE SPEŁNIA WYMAGAŃ',
  wynikBrakPodstaw: 'BRAK PODSTAW DO OCENY SPEŁNIENIA WYMAGANIA',
  odniesienieBrak: 'brak wartości granicznej — ocena zgodności z warunkami',
  progUwagi: 'próg uwagi',
  marginesBrak: '—',
  elementBezNazwy: 'element bez nazwy',
  elementAgregat: 'cała sieć (agregat)',
  liczbaElementow: (n: number): string =>
    n === 1 ? '1 element' : n >= 2 && n <= 4 ? `${n} elementy` : `${n} elementów`,
  identyfikatorModelu: 'identyfikator w modelu',
  // Karta V12.7 §0.7 — werdykt ograniczony do zakresu z kontraktu (`zakres_oceny`),
  // NIGDY z domysłu UI. „uklad" = kryterium złożone: ocenia CAŁY tor/układ (kilka
  // powiązanych sprawdzeń naraz), nie pojedynczą wielkość fizyczną elementu.
  zakresUklad: 'ocena całego układu',

  // Działania (powiązania z siecią)
  pokazNaSchemacie: 'Pokaż na schemacie',
  pokazNaSchemacieOpis: 'Zaznacz element na schemacie i przejdź do przestrzeni Schemat',
  dowodObliczen: 'Dowód obliczeń',
  dowodObliczenOpis: 'Otwórz wywód obliczeń tego przebiegu dla wskazanego elementu',

  // Kryteria bez podstawy do oceny (pozycje bez elementów)
  bezPodstawTytul: 'Kryteria bez podstawy do oceny',
  bezPodstawOpis:
    'Kryteria, dla których brakuje przebiegu, danych wejściowych albo wynik przebiegu jest nieaktualny — '
    + 'każda pozycja niesie powód.',

  // Zakres poza automatem
  zakresTytul: 'Kryteria poza oceną automatyczną',
  zakresOpis:
    'Te kryteria projektu nie mają automatycznego dostawcy — ocena powyżej ich nie obejmuje.',

  // Stan blokujący — brak wyników
  brakWynikowTytul: 'BRAK WYNIKÓW DO OCENY',
  brakWynikowOpis:
    'Dla tego przypadku obliczeniowego nie ma zakończonego, aktualnego przebiegu rozpływu mocy '
    + 'ani zwarć. Ocena techniczna powstaje wyłącznie z wyników obliczeń.',
  przejdzDoObliczen: 'PRZEJDŹ DO OBLICZEŃ',
  przejdzDoObliczenOpis: 'Otwiera przestrzeń „Obliczenia": wybór zakresu i uruchomienie przebiegu.',

  // Stany zerowe i błędy
  brakPrzypadku: 'Brak aktywnego przypadku obliczeniowego.',
  brakPrzypadkuKrok: 'Wybierz lub utwórz przypadek obliczeniowy, aby ocenić wyniki obliczeń.',
  ladowanie: 'Zestawianie oceny technicznej…',
  bladDomyslny: 'Nie udało się pobrać oceny technicznej wyników.',

  ariaPozycje: 'Pozycje oceny technicznej',

  // Źródła adapterów wyników FROZEN (karta AB-1a D2/D7)
  zrodloNcRfg: 'Deklaracje modułu (NC RfG)',
  zrodloV126: 'Analiza specjalistyczna',

  // Wynik wyjaśnialny (karta AB-1a D2) — podstawa strukturalna i pola wyjaśnialności
  podstawaDokument: 'dokument',
  podstawaWersja: 'wersja',
  podstawaKlauzula: 'klauzula',
  podstawaBrakDokumentu: 'brak wskazanego dokumentu podstawy wymagania',
  zrodloNiezweryfikowane: 'źródło niezweryfikowane',
  zrodloNiezweryfikowaneOpis:
    'Dokument, wersja albo klauzula podstawy nie są potwierdzone — wartość wymagania nie '
    + 'jest wymaganiem z potwierdzonego dokumentu.',
  zrodloZweryfikowane: 'źródło potwierdzone',
  szczegolyWyniku: 'Szczegóły wyniku',
  domenaFizyczna: 'Domena fizyczna',
  punktKrytyczny: 'Punkt krytyczny',
  przyczyna: 'Przyczyna',
  statusModelu: 'Status modelu',
  statusWejscia: 'Jakość danych wejściowych',
  niepewnosc: 'Niepewność',
  zakresWaznosci: 'Zakres ważności',
  krokSladu: 'krok śladu',
  osRownan: 'Równania',
  osParametrow: 'Parametry',
} as const;

/** Etykiety PL domen fizycznych (kody `PhysicsDomain` backendu). */
export const DOMENA_FIZYCZNA_PL: Record<string, string> = {
  POWER_FLOW: 'rozpływ mocy (50 Hz)',
  SHORT_CIRCUIT: 'zwarcia (IEC 60909)',
  RMS_DYNAMICS: 'dynamika RMS',
  SEQUENCE_DOMAIN: 'składowe symetryczne',
  HARMONIC_FREQUENCY_DOMAIN: 'harmoniczne (dziedzina częstotliwości)',
  SUPRAHARMONIC_FREQUENCY_DOMAIN: 'supraharmoniczne (2–150 kHz)',
};

/** Etykiety PL rodzaju przyczyny ograniczenia. */
export const PRZYCZYNA_PL: Record<string, string> = {
  element: 'element sieci',
  regulator: 'regulator',
  ogranicznik: 'ogranicznik',
  zrodlo_emisji: 'źródło emisji',
  rezonans: 'rezonans',
};

/** Etykiety PL osi równań statusu modelu. */
export const STATUS_ROWNAN_PL: Record<string, string> = {
  VALIDATED: 'równania zwalidowane',
  UNVALIDATED: 'równania niezwalidowane',
  UNKNOWN: 'status równań nieznany',
};

/** Etykiety PL osi parametrów statusu modelu. */
export const STATUS_PARAMETROW_PL: Record<string, string> = {
  MODEL_ZWALIDOWANY_POMIAREM: 'parametry zwalidowane pomiarem',
  KARTA_KATALOGOWA: 'parametry z karty katalogowej',
  OSZACOWANE: 'parametry oszacowane',
  UNKNOWN: 'status parametrów nieznany',
};

/** Etykiety PL jakości danych wejściowych (`FieldQuality`). */
export const STATUS_WEJSCIA_PL: Record<string, string> = {
  DATASHEET: 'karta techniczna',
  ESTIMATED: 'oszacowanie',
  SYSTEM_DEFAULT: 'wartość domyślna systemu',
};
