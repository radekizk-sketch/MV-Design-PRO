/*
 * Teksty i deterministyczne formatery okna „Wyniki zwarciowe" (karta E8.2, druga
 * konkretyzacja wspólnego wzorca ekranu analizy) — wyłącznie polski język
 * techniczny (MODEL_INTERAKCJI §2.7). Zero literałów UI w JSX; identyfikatory
 * (target_id/element_id) renderowane wyłącznie w trybie eksperckim jako wyrażenia
 * `{...}` z danych. Formatery są CZYSTE (wejście→wyjście), bez `Date.now`/losowości
 * (Determinism Rule) — przecinek dziesiętny zgodnie z konwencją PL.
 */

import { TRACE_VALUE_CODES } from '../../../ui/results-inspector/types';
import { etykietaZeSlownika } from '../wzorzec/slownikWyliczen';

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
  bilansIdc: 'Składowa nieokresowa iDC(tb)',
  bilansIk: 'Prąd zwarciowy ustalony Ik',
  bilansSk: 'Moc zwarciowa Sk"',
  bilansI2t: 'Energia cieplna I²t',
  bilansKappa: 'Współczynnik udaru κ',
  bilansXR: 'Stosunek X/R',
  bilansRk: 'Rezystancja zastępcza Rk',
  bilansXk: 'Reaktancja zastępcza Xk',
  bilansZk: 'Impedancja zastępcza (Thevenin) |Zk|',
  bilansC: 'Współczynnik napięciowy c',
  bilansCZrodlo: 'Podstawa współczynnika c',
  bilansUn: 'Napięcie znamionowe przed zwarciem Un',
  bilansTk: 'Czas trwania zwarcia tk',
  bilansTb: 'Czas wyłączenia tb',
  // Karta TB-WARTOSC-ROBOCZA: tb punktu będący wartością roboczą — dyskretna etykieta,
  // źródło z backendu i akcja prowadząca do tb scenariusza zwarciowego.
  bilansTbRobocza: 'wartość robocza',
  bilansTbZmien: 'Zmień wartość',

  // Założenia (parametry przebiegu, W-602)
  zalMetoda: 'Metoda obliczeń',
  zalMetodaWartosc: 'IEC 60909',
  zalWspolczynnikC: 'Współczynnik napięciowy c',
  zalCzasCieplny: 'Czas cieplny',
  zalCzasWylaczenia: 'Czas wyłączenia tb',
  zalCzasWylaczeniaPunkt: 'w punkcie zwarcia',
  zalozeniePunkty: (liczba: number) =>
    `Dotyczy punktów zwarcia: ${liczba} (oznaczenie „wartość robocza" w bilansie punktu).`,
  zalozenieBiegu: 'Bieg zwarciowy',
  // Karta UI2 p.7: c/czas cieplny z ZAPISANEJ konfiguracji TEGO biegu
  // (`konfiguracja_biegu` odpowiedzi), nie z aktywnego przypadku obliczeniowego.
  // Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: tryb `auto_per_wezel` albo `nadpisanie`
  // z uzasadnieniem; podstawa c każdego węzła — w bilansie punktu (`c_zrodlo`).
  zalWspolczynnikCAuto: (scenariusz: string | null) =>
    scenariusz
      ? `IEC 60909-0 tab. 1 per węzeł, scenariusz ${scenariusz}`
      : 'IEC 60909-0 tab. 1 per węzeł',
  zalWspolczynnikCAutoUwaga:
    'Wartość c dobrana z tabeli 1 IEC 60909-0 dla pasma napięciowego każdego węzła (nN z zadeklarowaną tolerancją sieci, SN, WN) — podstawę c punktu pokazuje bilans IEC 60909 wybranego punktu.',
  zalWspolczynnikCNadpisanie: (wartosc: string, uzasadnienie: string) =>
    `${wartosc} — nadpisanie ręczne: ${uzasadnienie}`,
  zalWspolczynnikCNadpisanieUwaga: (uzasadnienie: string) =>
    `Nadpisanie ręczne dla wszystkich węzłów biegu — uzasadnienie: ${uzasadnienie}`,
  zalCzasCieplnyDomyslny: 'Bieg nie miał jawnie ustawionego czasu cieplnego — zastosowano wartość domyślną solvera.',
  zalKonfiguracjaBieguNiedostepna: 'Starszy zapis przebiegu sprzed uzupełnienia kontraktu — konfiguracja biegu niedostępna.',
  // Karta OD-14: zwarcie przez impedancję przejścia Z_f zapisane na biegu.
  zalImpedancjaPrzejscia: 'Impedancja przejścia w miejscu zwarcia Z_f',
  zalImpedancjaPrzejsciaUwaga:
    'Zwarcie przez impedancję przejścia — wynik poza zakresem normy IEC 60909, która definiuje prąd zwarcia metalicznego. Nie jest podstawą doboru aparatury, wytrzymałości, nastaw nadprądowych ani dowodu w punkcie przyłączenia.',

  // Sekcja wkładów
  wkladyTytul: 'Wkłady do zwarcia',
  wkladyKolZrodlo: 'Źródło',
  wkladyKolPrad: 'Prąd wkładu',
  wkladyKolUdzial: 'Udział',
  wkladyKolIdentyfikator: 'Identyfikator źródła',
  wkladyNiedostepne: 'Dane wkładów niedostępne w tym przebiegu.',
  walidacjaTytul: 'Walidacja metody IEC 60909',
  wkladyNiedostepneOpis:
    'Rozbicie maszynowe wymaga migawki modelu sieci i parametrów biegu (scenariusz, współczynnik c, czas wyłączenia) — bez nich serwer nie ma z czego go policzyć. Rozbicie dostarcza solver zwarciowy — wartości nie są liczone w interfejsie.',
  // Stany ODCZYTU (odczyt w toku ≠ brak danych, błąd odczytu ≠ brak danych).
  wkladyWczytywanie: 'Odczyt rozbicia maszynowego dla tego punktu…',
  wkladyBlad: 'Nie udało się pobrać rozbicia maszynowego dla tego punktu.',
  wkladyBladOpis:
    'Błąd pobrania z serwera (połączenie albo usługa obliczeń) — to nie jest brak wkładów w sieci. Wybierz punkt ponownie albo odśwież przebieg.',
  wkladyBrakPunktow: 'Brak punktów zwarcia do wyboru.',

  // Sekcja wkładów — filtr, wykres udziałów, szczegół źródła (karta W-A F2)
  wkladyFiltr: 'Filtruj źródła',
  wkladyFiltrBrak: 'Żadne źródło nie pasuje do filtru.',
  wkladyWykresTytul: 'Udziały procentowe wkładów źródeł',
  wkladSzczegolTytul: 'Szczegóły wkładu źródła',
  wkladSzczegolOpis:
    'Parametry maszyny z rozbicia maszynowego IEC 60909 policzone przez solver zwarciowy — klik wiersza wkładu zwija/rozwija.',
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
  rozplywWczytywanie: 'Odczyt rozpływu gałęziowego dla tego punktu…',
  rozplywBlad: 'Nie udało się pobrać rozpływu gałęziowego dla tego punktu.',
  rozplywBladOpis:
    'Błąd pobrania z serwera (połączenie albo usługa obliczeń) — to nie jest brak rozpływu w przebiegu. Wybierz punkt ponownie albo odśwież przebieg.',
  rozplywBrakWkladow: 'Brak wkładów gałęziowych dla tego punktu zwarcia.',
  rozplywBrakWkladowOpis:
    'Policzono rozpływ, ale żadna gałąź nie niesie prądu zwarciowego dla tego punktu — sieć bez źródła zastępczego (nieskończonej szyny / sieci nadrzędnej) i bez falowników zasilających to zwarcie.',
  // Karta PROG-ZERA-WKLADOW: wkład pominięty na podstawie tolerancji numerycznej —
  // nazwa 1:1 z rdzenia (`NAZWA_WKLADU_POMINIETEGO`), próg wyłącznie z odpowiedzi.
  rozplywPominieteTytul: 'Wkłady pominięte na podstawie tolerancji numerycznej',
  rozplywPominieteOpis:
    'Pary źródło × gałąź policzone przez solver, których moduł prądu jest poniżej progu tolerancji numerycznej. To nie jest zero i nie jest wkład z tabeli powyżej: wpisy nie wchodzą do listy wkładów gałęziowych ani do sumy kontrolnej bilansu w węźle zwarcia. Moduł |I| obcięty do 3 cyfr znaczących w stronę zera. Kąt fazora nie jest określony: poniżej progu fazor jest resztą arytmetyki zmiennoprzecinkowej, a jego kąt zależy od maszyny, nie od sieci.',
  katNieokreslony: 'nie określono',
  rozplywKolTor: 'Tor obliczenia',
  rozplywKolKat: 'Kąt fazora',

  // Sekcja śladu WHITE BOX podziału prądu zwarciowego (karta WB-ROZPLYW, TH-1)
  sladRozplywuTytul: 'Podział prądu zwarciowego — ślad obliczeń',
  sladRozplywuOpis:
    'Kroki podziału prądu zwarciowego od źródła zastępczego (sieć nadrzędna, Thevenin) na gałęzie — iniekcja jednostkowa w węźle zwarcia, współczynniki podziału z macierzy Z-bus, bilans kontrolny KCL. Wyłącznie odczyt jawnego śladu obliczeń solvera IEC 60909, zero obliczeń w interfejsie.',
  sladRozplywuNiedostepny:
    'Ślad podziału niedostępny dla tego biegu (bieg sprzed zapisu śladu albo bez wkładów).',
  sladRozplywuNiedostepnyOpis:
    'Starszy wynik nie niesie śladu podziału prądu zwarciowego. Uruchom ponownie obliczenie zwarciowe, aby go uzyskać.',
  sladRozplywuPusty: 'Brak kroków podziału dla tego punktu zwarcia.',
  sladRozplywuPustyOpis:
    'Rozpływ policzony, ale ślad obliczeń dokumentuje wyłącznie podział prądu od sieci zastępczej (Thevenina) — ten punkt zwarcia nie ma wkładu z tego źródła.',
  sladRozplywuWczytywanie: 'Odczyt śladu podziału prądu zwarciowego dla tego punktu…',
  sladRozplywuBlad: 'Nie udało się pobrać śladu podziału prądu zwarciowego.',
  sladRozplywuBladOpis:
    'Błąd pobrania z serwera (połączenie albo usługa obliczeń). Spróbuj ponownie później albo odśwież przebieg.',

  // Sekcja „Sieć składowej zerowej" — ślad WHITE BOX budowy macierzy Y0 biegu 1F/2F+G.
  sladZerowejTytul: 'Sieć składowej zerowej — ślad obliczeń',
  sladZerowejOpis:
    'Budowa macierzy admitancyjnej składowej zerowej po elementach sieci: impedancja zerowa '
    + 'źródeł, impedancja zerowa i pojemność doziemna linii i kabli, połączenie transformatorów '
    + 'w składowej zerowej wg grupy połączeń i uziemienia punktów neutralnych, droga zerowa '
    + 'baterii kondensatorów. Z tej macierzy pochodzi impedancja Z0 w miejscu zwarcia. '
    + 'Wyłącznie odczyt jawnego śladu obliczeń, zero obliczeń w interfejsie.',
  sladZerowejNiedostepny: 'Bieg nie niesie śladu sieci składowej zerowej.',
  sladZerowejNiedostepnyOpis:
    'Starszy wynik nie ma tego pola. Uruchom ponownie obliczenie zwarciowe, aby go uzyskać.',

  // Sekcja „Źródła sieciowe (Z_Q)" (CV-4.3 K6/K7) — ślad WHITE BOX wyprowadzenia
  // impedancji zastępczej źródeł sieciowych biegu (IEC 60909-0:2016 §6.2.1 eq. 6).
  zrodlaTytul: 'Źródła sieciowe (Z_Q)',
  zrodlaOpis:
    'Wyprowadzenie impedancji zastępczej źródeł sieciowych zasilających ten bieg '
    + '(IEC 60909-0:2016 §6.2.1 eq. 6) — jeden wiersz na scenariusz źródła. Wartości '
    + 'wprost ze śladu solvera, zero obliczeń w interfejsie.',
  zrodlaNiedostepne: 'Bieg nie niesie śladu źródeł sieciowych.',
  zrodlaNiedostepneOpis:
    'Starszy wynik nie ma tego pola albo bieg nie ma źródła sieciowego (sieć zasilana '
    + 'wyłącznie generatorami/maszynami). Uruchom ponownie obliczenie zwarciowe, aby go uzyskać.',
  zrodlaKolZrodlo: 'Źródło',
  zrodlaKolScenariusz: 'Scenariusz',
  zrodlaKolTryb: 'Tryb danych',
  zrodlaKolMocPrad: 'S″kQ / I″kQ',
  zrodlaKolC: 'c',
  zrodlaKolRx: 'R/X',
  zrodlaKolZq: '|Z_Q|',
  zrodlaKolWzor: 'Wzór',

  // Sekcja „Pasmo MIN/MAX" (karta W3-G3, aneks D7) — oba scenariusze c_max/c_min
  // JEDNEGO przypadku obok siebie, z proweniencją każdej strony.
  pasmoTytul: 'Pasmo MIN/MAX (IEC 60909)',
  pasmoOpis:
    'Wielkości zwarciowe przy c_max i c_min tego samego przypadku obok siebie — '
    + 'dwa biegi kanoniczne z jednej migawki modelu, zero obliczeń w interfejsie.',
  pasmoKolIkssMax: 'Ik" (max)',
  pasmoKolIkssMin: 'Ik" (min)',
  pasmoKolIpMax: 'ip (max)',
  pasmoKolIpMin: 'ip (min)',
  pasmoKolIthMax: 'Ith (max)',
  pasmoKolIthMin: 'Ith (min)',
  pasmoKolSkMax: 'Sk" (max)',
  pasmoKolSkMin: 'Sk" (min)',
  pasmoKolRkMax: 'Rk (max)',
  pasmoKolRkMin: 'Rk (min)',
  pasmoKolXkMax: 'Xk (max)',
  pasmoKolXkMin: 'Xk (min)',
  pasmoKolZkMax: '|Zk| (max)',
  pasmoKolZkMin: '|Zk| (min)',
  pasmoKolXRMax: 'X/R (max)',
  pasmoKolXRMin: 'X/R (min)',
  pasmoKolKappaMax: 'κ (max)',
  pasmoKolKappaMin: 'κ (min)',
  pasmoWczytywanie: 'Wczytywanie pasma MIN/MAX…',
  pasmoBladPobrania: 'Nie udało się pobrać pasma MIN/MAX dla tego przebiegu.',
  pasmoBladPobraniaOpis: 'Błąd pobrania z serwera (połączenie albo usługa obliczeń). Spróbuj ponownie później.',
  pasmoBrakScenariusz: (scenariusz: 'MAX' | 'MIN') =>
    `Brak biegu ${scenariusz === 'MAX' ? 'MAX (c_max)' : 'MIN (c_min)'} tego przypadku.`,
  pasmoUruchomScenariusz: (scenariusz: 'MAX' | 'MIN') =>
    `Uruchom bieg ${scenariusz === 'MAX' ? 'MAX (c_max)' : 'MIN (c_min)'}`,
  pasmoUruchomScenariuszOpis: (scenariusz: 'MAX' | 'MIN') =>
    `Uruchamia przebieg zwarciowy IEC 60909 przy scenariuszu ${scenariusz === 'MAX' ? 'maksymalnym (c_max)' : 'minimalnym (c_min)'} dla tego przypadku i dokłada go do pasma.`,
  pasmoProwenencjaZapisany: 'Bieg zapisany',
  pasmoProwenencjaObliczony: 'Policzone na żądanie z biegu kotwicy (bez zapisu)',
  pasmoIdentyfikatorBiegu: 'Identyfikator biegu',
  pasmoIdentyfikatorKotwicy: 'Identyfikator biegu kotwicy',
  pasmoRewizja: (rewizja: number | null | undefined) =>
    rewizja === null || rewizja === undefined ? 'rewizja nieznana' : `rewizja modelu ${rewizja}`,
  pasmoRozbieznoscRewizji: 'Bieg MAX i bieg MIN pochodzą z różnych rewizji modelu — porównanie jest orientacyjne.',
  pasmoScenariuszKotwicy: (scenariusz: 'MAX' | 'MIN') =>
    `Bieg kotwicy: scenariusz ${scenariusz === 'MAX' ? 'MAX (c_max)' : 'MIN (c_min)'}.`,

  // Sekcja ZAŁOŻENIA — wpisy `raw_result.zalozenia` (CV-4.3 K7): jedno założenie
  // = jeden element + scenariusz, treść (message_pl) wprost z backendu (WHITE BOX).
  // Karta #145: etykieta niesie NAZWĘ źródła z modelu (most nazw wyników), a dymek —
  // scenariusz po polsku; kod gotowości założenia nie jest tekstem dla projektanta.
  zalozenieEtykieta: (nazwaZrodla: string) => `Źródło ${nazwaZrodla}`,
  zalozenieUwaga: (scenariuszPL: string) => `Scenariusz ${scenariuszPL}`,
  // Karta TOLERANCJA-NN-WARTOSC-ROBOCZA (zasada nr 4, V12K-351): założenie
  // `fault.c_tolerancja_nn_robocza` dotyczy sieci nN (element zasilający albo jej szyna),
  // nie źródła — etykieta nazywa tolerancję i element z modelu; treść (co przyjęto, dla
  // jakich węzłów, dlaczego) wprost z backendu. Znacznik i akcja — dyskretnie, obok.
  zalozenieTolerancjiNn: (nazwaElementu: string) => `Tolerancja napięcia sieci nN — ${nazwaElementu}`,
  znacznikWartosciRoboczej: 'wartość robocza',
  zmienWartosc: 'Zmień wartość',

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
 * Słownik polskich nazw rodzajów zwarcia — JEDNO źródło z opisami kodów śladu
 * (`TRACE_VALUE_CODES.short_circuit_type`): klucze = wartości `fault_type`
 * (`short_circuit_type`) kontraktu wiersza wyniku, czyli kody `ShortCircuitType`
 * backendu „3F", „2F", „2F+G", „1F" (równość przypina
 * `backend/tests/enm/test_slad_sieci_zerowej_w_wyniku.py`). Do tej poprawki słownik był
 * osobną kopią z kluczem „2F+Z", którego wiersz wyniku nie niesie — bieg 2F+G pokazywał
 * „rodzaj nieznany". Dodatkowo akceptowane warianty `SC_3F`/`sc_3f`. Normalizacja: wielkie
 * litery, usunięcie prefiksu `SC_`.
 */
const RODZAJ_ZWARCIA_PL: Readonly<Record<string, string>> = TRACE_VALUE_CODES.short_circuit_type;

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
 * dosłownie (dane, nie literał UI). Docelowa pula flag zwarciowych jest
 * WŁASNOŚCIĄ BACKENDU (dziś pusta — `enm/canonical_analysis.py`, pole `flags`
 * emitowane jako `[]`); ten słownik NIE zgaduje tokenów, których backend
 * jeszcze nie wysyła.
 */
/** Flagi wiersza zwarciowego (kanoniczna pula tokenów flag wyników). */
export type FlagaWierszaZwarcia = 'SLACK' | 'SYNTHETIC' | 'VOLTAGE_VIOLATION' | 'OVERLOADED';

export const FLAGI_ZWARCIA_PL: Readonly<Record<FlagaWierszaZwarcia, string>> = {
  SLACK: 'Węzeł bilansujący',
  SYNTHETIC: 'Węzeł syntetyczny',
  VOLTAGE_VIOLATION: 'Naruszenie napięcia',
  OVERLOADED: 'Przeciążenie',
};

/** Łączy flagi wiersza w polski tekst uwag (pusta lista → „—"). */
export function uwagiZwarciaPL(flagi: string[]): string {
  if (!flagi || flagi.length === 0) return ZWARCIA_STRINGS.kreska;
  return flagi.map((flaga) => etykietaZeSlownika(FLAGI_ZWARCIA_PL, flaga)).join(', ');
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
/** Typy maszyn rozbicia maszynowego (`MachinePartialContribution.machine_type`). */
export type TypMaszyny = 'SYNCHRONOUS' | 'ASYNCHRONOUS' | 'DFIG';

export const TYP_MASZYNY_PL: Readonly<Record<TypMaszyny, string>> = {
  SYNCHRONOUS: 'maszyna synchroniczna',
  ASYNCHRONOUS: 'maszyna asynchroniczna',
  DFIG: 'generator asynchroniczny dwustronnie zasilany (DFIG)',
};

/** Mapuje token typu maszyny na polską nazwę (read-only, bez fizyki). */
export function typMaszynyPL(token: string): string {
  return etykietaZeSlownika(TYP_MASZYNY_PL, token.trim().toUpperCase());
}

/**
 * Słownik polskich etykiet źródła wkładu rozpływu gałęziowego (V12K-132, pkt 7).
 * Klucz "THEVENIN_GRID" (source_id z solvera, `_build_branch_contributions_for_thevenin`)
 * → „sieć nadrzędna" (źródło zastępcze Thevenina). Pozostałe źródła (falowniki /
 * maszyny) pokazywane po ich identyfikatorze — read-only, bez fizyki.
 */
/**
 * Opis progu wkładu pominiętego z WARTOŚCI ODPOWIEDZI (odbicie jedynej definicji
 * rdzenia, `prog_wkladu_pominietego_a`) — ten sam zapis co tytuł kroku śladu
 * (`|I| < 1e-6 A`); frontend nie ma własnej stałej progu.
 */
export function opisProguPominietego(progA: number): string {
  return `|I| < ${progA.toExponential()} A`;
}

/** Nota pod tabelą rozpływu: ile wpisów pominięto i względem jakiego progu. */
export function notaWkladowPominietych(liczba: number, progA: number): string {
  return `Wkłady pominięte na podstawie tolerancji numerycznej (${opisProguPominietego(progA)}): ${liczba}. Nie są zerem i nie ma ich w tabeli — zestawienie z surowym modułem prądu w trybie eksperckim.`;
}

/** Tor rdzenia, którym policzono wkład pominięty — etykieta PL (kod nie trafia na ekran). */
const TOR_POMINIETEGO_PL: Readonly<Record<'thevenin' | 'falownik', string>> = {
  thevenin: 'sieć zastępcza (podział prądu Thevenina)',
  falownik: 'superpozycja falownikowa',
};

export function torPominietegoPL(tor: 'thevenin' | 'falownik'): string {
  return TOR_POMINIETEGO_PL[tor];
}

const ZRODLO_ROZPLYWU_PL: Record<string, string> = {
  THEVENIN_GRID: 'sieć nadrzędna',
};

/**
 * Mapuje source_id wpisu rozpływu na etykietę PL: „sieć nadrzędna" dla źródła
 * zastępczego Thevenina, a dla falownika/maszyny — nazwa z modelu przez most nazw
 * wyników (karta #145: nigdy identyfikator jako tekst).
 */
export function zrodloRozplywuPL(sourceId: string, nazwa: (ref: string) => string): string {
  return ZRODLO_ROZPLYWU_PL[sourceId] ?? nazwa(sourceId);
}

/** Polska nazwa scenariusza obliczenia zwarciowego (unia kontraktu `MAX`/`MIN`). */
const SCENARIUSZ_ZWARCIA_PL: Readonly<Record<'MAX' | 'MIN', string>> = {
  MAX: 'maksymalny',
  MIN: 'minimalny',
};

/** Etykieta PL scenariusza zwarcia (kod `MAX`/`MIN` nie trafia na ekran). */
export function scenariuszZwarciaPL(scenariusz: 'MAX' | 'MIN'): string {
  return SCENARIUSZ_ZWARCIA_PL[scenariusz];
}

/**
 * Słownik polskich nazw TRYBU DANYCH bazowego (bez sufiksu scenariusza) śladu
 * źródeł sieciowych (CV-4.3 K6/K7) — klucze = prefiks tokenu `tryb`
 * (`enm/mapping.py::impedancja_zasilania_systemowego`, `TrybDanych.value`).
 */
/** Tryby danych źródła sieciowego (`enm/mapping.py`, `TrybDanych`). */
export type TrybDanychZrodla = 'MOC_ZWARCIOWA' | 'PRAD_ZWARCIOWY' | 'IMPEDANCJA_JAWNA';

export const TRYB_ZRODLA_BAZA_PL: Readonly<Record<TrybDanychZrodla, string>> = {
  MOC_ZWARCIOWA: 'moc zwarciowa S″kQ',
  PRAD_ZWARCIOWY: 'prąd zwarciowy I″kQ',
  IMPEDANCJA_JAWNA: 'impedancja jawna (R+jX)',
};

/**
 * Mapuje token `tryb` śladu źródła sieciowego na tekst PL (CV-4.3 K6/K7). Token
 * bazowy niesie tryb danych; sufiks `_MIN` = scenariusz MIN z własnymi danymi,
 * `_MAX_JAKO_MIN` = scenariusz MIN BEZ własnych danych (Z_Q z MAX — ten sam
 * sygnał co `raw_result.zalozenia` / kod `source.sk_min_missing`, tylko czytelny
 * wprost w tabeli, bez przełączania na sekcję założeń).
 */
export function trybZrodlaSiecowegoPL(tryb: string): string {
  if (tryb.endsWith('_MAX_JAKO_MIN')) {
    const baza = tryb.slice(0, -'_MAX_JAKO_MIN'.length);
    return `${etykietaZeSlownika(TRYB_ZRODLA_BAZA_PL, baza)} (dane MAX — brak własnych danych MIN)`;
  }
  if (tryb.endsWith('_MIN')) {
    const baza = tryb.slice(0, -'_MIN'.length);
    return `${etykietaZeSlownika(TRYB_ZRODLA_BAZA_PL, baza)} (MIN)`;
  }
  return etykietaZeSlownika(TRYB_ZRODLA_BAZA_PL, tryb);
}

/**
 * Słownik polskich nazw pochodzenia R/X śladu źródła sieciowego (CV-4.3 K6/K7) —
 * klucze = `rx_ratio_zrodlo` (`enm/mapping.py`, ten sam token co
 * `GridSourcePreviewMinResponse.rx_ratio_zrodlo`).
 */
/** Pochodzenie stosunku R/X źródła sieciowego (`enm/mapping.py`, `rx_ratio_zrodlo`). */
export type PochodzenieRx = 'MODEL' | 'MODEL_MAX' | 'MODEL_MIN' | 'IEC_60909_DOMYSLNY_0_1';

export const RX_RATIO_ZRODLO_PL: Readonly<Record<PochodzenieRx, string>> = {
  MODEL: 'wpisane w model',
  MODEL_MAX: 'wpisane w model (MAX)',
  MODEL_MIN: 'wpisane w model (MIN)',
  IEC_60909_DOMYSLNY_0_1: 'domyślne IEC 60909 (0,1)',
};

/** Mapuje `rx_ratio_zrodlo` na etykietę PL (read-only, bez fizyki). */
export function rxRatioZrodloPL(zrodlo: string): string {
  return etykietaZeSlownika(RX_RATIO_ZRODLO_PL, zrodlo);
}
