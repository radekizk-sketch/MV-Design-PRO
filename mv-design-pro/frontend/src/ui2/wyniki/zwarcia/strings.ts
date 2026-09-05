/*
 * Teksty i deterministyczne formatery okna „Wyniki zwarciowe" (karta E8.2, druga
 * konkretyzacja wspólnego wzorca ekranu analizy) — wyłącznie polski język
 * techniczny (MODEL_INTERAKCJI §2.7). Zero literałów UI w JSX; identyfikatory
 * (target_id/element_id) renderowane wyłącznie w trybie eksperckim jako wyrażenia
 * `{...}` z danych. Formatery są CZYSTE (wejście→wyjście), bez `Date.now`/losowości
 * (Determinism Rule) — przecinek dziesiętny zgodnie z konwencją PL.
 */

export const ZWARCIA_STRINGS = {
  // Nagłówek analizy
  analiza: 'Wyniki zwarciowe',

  // Stan pusty
  brakWyniku: 'Brak wyniku zwarciowego do wyświetlenia',
  brakWynikuOpis: 'Uruchom obliczenie zwarciowe (IEC 60909), aby zobaczyć wielkości w punktach zwarcia.',

  // Kolumny tabeli punktów zwarciowych
  kolPunkt: 'Punkt zwarcia',
  kolRodzaj: 'Rodzaj zwarcia',
  kolIkss: 'Prąd zwarciowy początkowy Ik"',
  kolIp: 'Prąd udarowy ip',
  kolIth: 'Prąd cieplny Ith',
  kolSk: 'Moc zwarciowa Sk"',
  kolUwagi: 'Uwagi',
  kolIdentyfikator: 'Identyfikator punktu',
  // Kolumny impedancyjne (ZWARCIA-PRO F1, tryb ekspercki)
  kolRk: 'Rk',
  kolXk: 'Xk',
  kolZk: '|Zk|',
  kolXR: 'X/R',
  kolKappa: 'Współczynnik udaru κ',

  // Panel „Bilans IEC 60909" wybranego punktu (ZWARCIA-PRO F1)
  bilansTytul: 'Bilans IEC 60909',
  bilansOpis:
    'Komplet wielkości punktu zwarcia z solvera — do weryfikacji bez zaglądania do śladu obliczeń.',
  bilansIkss: 'Prąd zwarciowy początkowy Ik"',
  bilansIp: 'Prąd udarowy ip',
  bilansIth: 'Prąd cieplny zastępczy Ith',
  bilansIb: 'Prąd wyłączeniowy symetryczny Ib',
  bilansIk: 'Prąd zwarciowy ustalony Ik',
  bilansSk: 'Moc zwarciowa Sk"',
  bilansI2t: 'Energia cieplna I²t',
  bilansKappa: 'Współczynnik udaru κ',
  bilansXR: 'Stosunek X/R',
  bilansRk: 'Rezystancja zastępcza Rk',
  bilansXk: 'Reaktancja zastępcza Xk',
  bilansZk: 'Impedancja zastępcza (Thevenin) |Zk|',
  bilansC: 'Współczynnik napięciowy c',
  bilansUn: 'Napięcie znamionowe przed zwarciem Un',
  bilansTk: 'Czas trwania zwarcia tk',
  bilansTb: 'Czas wyłączenia tb',

  // Założenia (parametry przebiegu, W-602)
  zalMetoda: 'Metoda obliczeń',
  zalMetodaWartosc: 'IEC 60909',
  zalWspolczynnikC: 'Współczynnik napięciowy c',
  zalCzasCieplny: 'Czas cieplny',
  zalWartoscZKonfiguracji: 'Wartość pochodzi z konfiguracji przebiegu — niedostępna w kontrakcie wyników (read-only).',

  // Sekcja wkładów
  wkladyTytul: 'Wkłady do zwarcia',
  wkladyKolZrodlo: 'Źródło',
  wkladyKolPrad: 'Prąd wkładu',
  wkladyKolUdzial: 'Udział',
  wkladyKolIdentyfikator: 'Identyfikator źródła',
  wkladyNiedostepne: 'Dane wkładów niedostępne w tym przebiegu.',
  walidacjaTytul: 'Walidacja metody IEC 60909',
  wkladyNiedostepneOpis:
    'Nie udało się pobrać rozbicia maszynowego dla tego punktu (brak migawki modelu albo błąd pobierania). Rozbicie dostarcza backend — wartości nie są liczone w interfejsie.',
  wkladyBrakPunktow: 'Brak punktów zwarcia do wyboru.',

  // Sekcja wkładów — filtr, wykres udziałów, szczegół źródła (karta W-A F2)
  wkladyFiltr: 'Filtruj źródła',
  wkladyFiltrBrak: 'Żadne źródło nie pasuje do filtru.',
  wkladyWykresTytul: 'Udziały procentowe wkładów źródeł',
  wkladSzczegolTytul: 'Szczegóły wkładu źródła',
  wkladSzczegolOpis:
    'Parametry maszyny z rozbicia maszynowego IEC 60909 (backend) — klik wiersza wkładu zwija/rozwija.',
  wkladTypMaszyny: 'Typ maszyny',
  wkladIr: 'Prąd znamionowy Ir',
  wkladIkIr: 'Stosunek Ik"/Ir',
  wkladMu: 'Współczynnik zaniku μ',
  wkladQ: 'Współczynnik q',
  wkladIb: 'Prąd wyłączeniowy symetryczny Ib',
  wkladSzczegolBrak: 'Szczegóły maszyny niedostępne dla tego źródła.',
  wkladSzczegolBrakOpis:
    'Rozbicie maszynowe tego przebiegu nie zawiera parametrów IEC 60909 (Ir, μ, q, Ib) dla tego źródła.',

  // Sekcja rozpływu prądu zwarciowego w gałęziach (karta W-C, F4; V12K-132)
  rozplywTytul: 'Rozpływ prądu zwarciowego',
  rozplywOpis:
    'Prądy zwarciowe w gałęziach dla wybranego punktu zwarcia — od źródła zastępczego (sieć nadrzędna, Thevenin) i od źródeł falownikowych. Wartości z solvera IEC 60909 (podział prądu z macierzy Z-bus / superpozycja), zero obliczeń w interfejsie.',
  rozplywKolGalaz: 'Gałąź',
  rozplywKolKierunek: 'Kierunek przepływu',
  rozplywKolPrad: 'Prąd |I|',
  rozplywKolZrodlo: 'Źródło',
  rozplywKolIdentyfikator: 'Identyfikator gałęzi',
  rozplywNiedostepny: 'Rozpływ gałęziowy niedostępny w tym przebiegu.',
  rozplywNiedostepnyOpis:
    'Starszy wynik nie niesie wkładów gałęziowych. Uruchom ponownie obliczenie zwarciowe, aby je uzyskać.',
  rozplywBrakWkladow: 'Brak wkładów gałęziowych dla tego punktu zwarcia.',
  rozplywBrakWkladowOpis:
    'Policzono rozpływ, ale żadna gałąź nie niesie prądu zwarciowego dla tego punktu — sieć bez źródła zastępczego (nieskończonej szyny / sieci nadrzędnej) i bez falowników zasilających to zwarcie.',

  // Sekcja śladu WHITE BOX podziału prądu zwarciowego (karta WB-ROZPLYW, TH-1)
  sladRozplywuTytul: 'Podział prądu zwarciowego — ślad obliczeń',
  sladRozplywuOpis:
    'Kroki podziału prądu zwarciowego od źródła zastępczego (sieć nadrzędna, Thevenin) na gałęzie — iniekcja jednostkowa w węźle zwarcia, współczynniki podziału z macierzy Z-bus, bilans kontrolny KCL. Wyłącznie odczyt śladu WHITE BOX solvera IEC 60909, zero obliczeń w interfejsie.',
  sladRozplywuNiedostepny:
    'Ślad podziału niedostępny dla tego biegu (bieg sprzed zapisu śladu albo bez wkładów).',
  sladRozplywuNiedostepnyOpis:
    'Starszy wynik nie niesie śladu podziału prądu zwarciowego. Uruchom ponownie obliczenie zwarciowe, aby go uzyskać.',
  sladRozplywuPusty: 'Brak kroków podziału dla tego punktu zwarcia.',
  sladRozplywuPustyOpis:
    'Rozpływ policzony, ale ślad WHITE BOX dokumentuje wyłącznie podział prądu od sieci zastępczej (Thevenina) — ten punkt zwarcia nie ma wkładu z tego źródła.',
  sladRozplywuBlad: 'Nie udało się pobrać śladu podziału prądu zwarciowego.',
  sladRozplywuBladOpis:
    'Błąd pobrania z serwera (sieć albo backend). Spróbuj ponownie później albo odśwież przebieg.',

  // Akcja synchronizacji ze schematem (karta W-C, pkt 6)
  pokazNaSchemacie: 'Pokaż na schemacie',

  // Wykres
  wykresTytul: 'Prądy zwarciowe Ik" w punktach zwarcia',
  wykresOsY: 'Prąd zwarciowy początkowy Ik"',

  // Przełącznik wielkości wykresu (karta W-A F2)
  wykresPrzelacznik: 'Wielkość wykresu',
  wykresPrzyciskIkss: 'Ik"',
  wykresPrzyciskIp: 'ip',
  wykresPrzyciskIth: 'Ith',
  wykresPrzyciskSk: 'Sk"',
  wykresPrzyciskI2t: 'I²t',
  wykresTytulIp: 'Prądy udarowe ip w punktach zwarcia',
  wykresTytulIth: 'Prądy cieplne Ith w punktach zwarcia',
  wykresTytulSk: 'Moce zwarciowe Sk" w punktach zwarcia',
  wykresTytulI2t: 'Energia cieplna I²t w punktach zwarcia',
  wykresBrakDanych: 'Wielkość niedostępna w tym przebiegu.',
  wykresBrakDanychOpis:
    'Starszy wynik nie niesie tej wielkości. Uruchom ponownie obliczenie zwarciowe, aby ją uzyskać.',

  // Rodzaje zwarcia — nieznany token
  rodzajNieznany: 'zwarcie (nieokreślone)',

  // Jednostki
  jednKA: 'kA',
  jednMVA: 'MVA',
  jednOhm: 'Ω',
  jednKV: 'kV',
  jednKA2s: 'kA²·s',
  jednProcent: '%',
  jednS: 's',

  // Wartość pusta
  kreska: '—',
} as const;

/**
 * Słownik polskich nazw rodzajów zwarcia. Klucze = wartości `fault_type`
 * (`short_circuit_type`) z kontraktu wyników: „3F", „2F", „2F+Z", „1F"
 * (execution_runs.py:149-155). Dodatkowo akceptowane warianty `SC_3F`/`sc_3f`
 * (fault_scenarios.py:84, analysisRunContract.ts:138-142). Normalizacja: wielkie
 * litery, usunięcie prefiksu `SC_`.
 */
const RODZAJ_ZWARCIA_PL: Record<string, string> = {
  '3F': 'zwarcie trójfazowe',
  '2F': 'zwarcie dwufazowe',
  '2F+Z': 'zwarcie dwufazowe z ziemią',
  '1F': 'zwarcie jednofazowe (doziemne)',
};

/** Mapuje `fault_type` na polską nazwę rodzaju zwarcia (read-only, bez fizyki). */
export function rodzajZwarciaPL(faultType: string | null): string {
  if (!faultType) return ZWARCIA_STRINGS.kreska;
  const znormalizowany = faultType.trim().toUpperCase().replace(/^SC_/, '');
  return RODZAJ_ZWARCIA_PL[znormalizowany] ?? ZWARCIA_STRINGS.rodzajNieznany;
}

/**
 * Słownik polskich etykiet flag wiersza zwarciowego (`ShortCircuitRow.flags`).
 * Spójny z kanoniczną pulą tokenów flag repozytorium
 * (`ui/results-inspector/types.ts:460-464`). Tokeny nierozpoznane pokazywane są
 * dosłownie (dane, nie literał UI). Docelowa pula flag zwarciowych = własność
 * backendu (patrz TODO-KARTA w `zwarciaModel.ts`).
 */
const FLAGI_ZWARCIA_PL: Record<string, string> = {
  SLACK: 'Węzeł bilansujący',
  SYNTHETIC: 'Węzeł syntetyczny',
  VOLTAGE_VIOLATION: 'Naruszenie napięcia',
  OVERLOADED: 'Przeciążenie',
};

/** Łączy flagi wiersza w polski tekst uwag (pusta lista → „—"). */
export function uwagiZwarciaPL(flagi: string[]): string {
  if (!flagi || flagi.length === 0) return ZWARCIA_STRINGS.kreska;
  return flagi.map((flaga) => FLAGI_ZWARCIA_PL[flaga] ?? flaga).join(', ');
}

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczba(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Prąd [kA] — 3 miejsca po przecinku. */
export function fmtKA(n: number): string {
  return fmtLiczba(n, 3);
}

/** Moc zwarciowa [MVA] — 1 miejsce po przecinku. */
export function fmtMVA(n: number): string {
  return fmtLiczba(n, 1);
}

/** Udział względny [%] — 1 miejsce po przecinku. */
export function fmtProcent(n: number): string {
  return fmtLiczba(n, 1);
}

/** Czas cieplny [s] — 2 miejsca po przecinku. */
export function fmtCzas(n: number): string {
  return fmtLiczba(n, 2);
}

/** Współczynnik napięciowy c — 2 miejsca po przecinku. */
export function fmtWspolczynnik(n: number): string {
  return fmtLiczba(n, 2);
}

/** Napięcie [kV] — 1 miejsce (przecinek PL; „15,0", nie „15,000"). */
export function fmtKV(n: number): string {
  return fmtLiczba(n, 1);
}

/** Impedancja [Ω] — 4 miejsca (rzędy wielkości sieci SN). */
export function fmtOhm(n: number): string {
  return fmtLiczba(n, 4);
}

/** Współczynnik udaru κ / stosunek X/R — 3 miejsca. */
export function fmtKappa(n: number): string {
  return fmtLiczba(n, 3);
}

/**
 * Słownik polskich nazw typów maszyn rozbicia maszynowego (karta W-A F2).
 * Klucze = tokeny `machine_type` z odpowiedzi backendu
 * (`MachinePartialContribution.to_dict`, machine_sc_iec60909.py:99:
 * SYNCHRONOUS | ASYNCHRONOUS | DFIG). Token nierozpoznany pokazywany jest
 * dosłownie (dane, nie literał UI).
 */
const TYP_MASZYNY_PL: Record<string, string> = {
  SYNCHRONOUS: 'maszyna synchroniczna',
  ASYNCHRONOUS: 'maszyna asynchroniczna',
  DFIG: 'generator asynchroniczny dwustronnie zasilany (DFIG)',
};

/** Mapuje token typu maszyny na polską nazwę (read-only, bez fizyki). */
export function typMaszynyPL(token: string): string {
  return TYP_MASZYNY_PL[token.trim().toUpperCase()] ?? token;
}

/**
 * Słownik polskich etykiet źródła wkładu rozpływu gałęziowego (V12K-132, pkt 7).
 * Klucz "THEVENIN_GRID" (source_id z solvera, `_build_branch_contributions_for_thevenin`)
 * → „sieć nadrzędna" (źródło zastępcze Thevenina). Pozostałe źródła (falowniki /
 * maszyny) pokazywane po ich identyfikatorze — read-only, bez fizyki.
 */
const ZRODLO_ROZPLYWU_PL: Record<string, string> = {
  THEVENIN_GRID: 'sieć nadrzędna',
};

/** Mapuje source_id wpisu rozpływu na etykietę PL (sieć nadrzędna vs źródło). */
export function zrodloRozplywuPL(sourceId: string): string {
  return ZRODLO_ROZPLYWU_PL[sourceId] ?? sourceId;
}
