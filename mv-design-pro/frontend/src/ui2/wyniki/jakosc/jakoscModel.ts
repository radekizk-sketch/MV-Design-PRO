/*
 * Model i adaptery okna „Jakość wyników" (karta E8.4 / W-607). Mapuje REALNE
 * kształty odpowiedzi końcówek jakości (`api.ts`) na model wspólnego wzorca
 * ekranu analizy (`wzorzec`). Read-only; zero fizyki, zero ocen lokalnych (statusy
 * i granice pochodzą WYŁĄCZNIE z backendu), zero mutacji, zero wołań API stąd.
 *
 * Nazwy adapterów/kolumn są prefiksowane tematycznie (…_WIARYGODNOSCI /
 * …_WALIDACJI), bo barrel nadrzędny `ui2/wyniki/index.ts` robi `export *` z wielu
 * modułów — prefiks zapobiega kolizji nazw (TS2308).
 */

import type { ExecutionRun } from '../../../ui/study-cases/types';
import type { ElementType } from '../../../ui/types';
import type {
  DefinicjaKolumny,
  RodzajPrzekroczenia,
  WartoscKomorki,
  WierszTabeli,
  WierszZalozenia,
} from '../wzorzec';
import type {
  KonfiguracjaMigotania,
  RodzajKontroli,
  WalidacjaConfig,
  WalidacjaItem,
  WezelMigotania,
  WiarygodnoscItem,
  WynikArcFlash,
  OcenaWarunkow,
  PozycjaWarunku,
  StatusWarunku,
  PodsumowanieCieplne,
  PozycjaCieplna} from './api';
import {
  JAKOSC_STRINGS,
  fmtCal,
  fmtKA,
  fmtKV,
  fmtMm,
  fmtMva,
  fmtProcent,
  fmtPst,
  fmtWartosc,
  rodzajKontroliPL,
  statusWalidacjiPL,
} from './strings';

// ---------------------------------------------------------------------------
// Wybór przebiegu z rejestru (useExecutionRunsStore) — aktywny/ostatni DONE
// ---------------------------------------------------------------------------

/** Czy rodzaj analizy to przebieg zwarciowy (SC_*). */
export function jestPrzebiegiemZwarciowym(analysisType: string): boolean {
  return analysisType.startsWith('SC_');
}

/**
 * Wybiera przebieg danego rodzaju: preferuje aktywny (gdy pasuje i zakończony),
 * inaczej OSTATNI zakończony (DONE) danego rodzaju. Deterministyczne dla danego
 * wejścia (kolejność źródłowa listy `runs`).
 */
function wybierzPrzebieg(
  runs: readonly ExecutionRun[],
  activeRunId: string | null,
  pasuje: (analysisType: string) => boolean,
): ExecutionRun | null {
  const kandydaci = runs.filter((r) => pasuje(r.analysis_type) && r.status === 'DONE');
  if (kandydaci.length === 0) return null;
  const aktywny = kandydaci.find((r) => r.id === activeRunId);
  return aktywny ?? kandydaci[kandydaci.length - 1];
}

/** Ostatni/aktywny zakończony przebieg zwarciowy (SC_* + DONE) — sekcja wiarygodności. */
export function przebiegZwarciowy(
  runs: readonly ExecutionRun[],
  activeRunId: string | null,
): ExecutionRun | null {
  return wybierzPrzebieg(runs, activeRunId, jestPrzebiegiemZwarciowym);
}

/** Ostatni/aktywny zakończony przebieg rozpływu (LOAD_FLOW/DONE) — sekcja walidacji. */
export function przebiegRozplywu(
  runs: readonly ExecutionRun[],
  activeRunId: string | null,
): ExecutionRun | null {
  return wybierzPrzebieg(runs, activeRunId, (t) => t === 'LOAD_FLOW');
}

// ---------------------------------------------------------------------------
// Komórki liczbowe (null → „—", bez sortowania na dół; wartość → PL + sortKey)
// ---------------------------------------------------------------------------

/**
 * `dowodRef` (K3/C1) ustawiany WYŁĄCZNIE dla wielkości pochodzących WPROST
 * z wyników przebiegu obliczeniowego (Ik", Sk" z solvera) — ich wywód niesie
 * ślad przebiegu w zakładce „Dowód obliczeń". Wielkości liczone przez buildery
 * analizy on-demand (Pst/Plt/d, energia łuku, marginesy) mają ślad WHITE BOX
 * w odpowiedzi backendu renderowany NA MIEJSCU w sekcji ekranu — kierowanie ich
 * do śladu innego przebiegu byłoby fałszywym dowodem (zero fabrykacji).
 * Komórka `null` → „—" bez dowodu (nie ma liczby, nie ma wywodu).
 */
function komorkaLiczba(
  wartosc: number | null,
  format: (n: number) => string,
  opcje?: { jednostka?: string; ostrzezenie?: boolean; dowodRef?: string },
): WartoscKomorki {
  if (wartosc === null) {
    return { wartosc: JAKOSC_STRINGS.kreska, sortKey: Number.NEGATIVE_INFINITY };
  }
  return {
    wartosc: format(wartosc),
    sortKey: wartosc,
    jednostka: opcje?.jednostka,
    ostrzezenie: opcje?.ostrzezenie,
    dowodRef: opcje?.dowodRef,
  };
}

// ---------------------------------------------------------------------------
// Sekcja 1 — Wiarygodność zwarciowa
// ---------------------------------------------------------------------------

export const KLUCZ_WIARYGODNOSCI_WEZEL = 'identyfikator';

export const KOLUMNY_WIARYGODNOSCI: DefinicjaKolumny[] = [
  { klucz: 'wezel', etykieta: JAKOSC_STRINGS.kolWezel, wyrownanie: 'lewo' },
  { klucz: 'napiecie', etykieta: JAKOSC_STRINGS.kolNapiecie, jednostka: JAKOSC_STRINGS.jednKV, mono: true },
  { klucz: 'pasmo', etykieta: JAKOSC_STRINGS.kolPasmo, wyrownanie: 'lewo' },
  { klucz: 'ikss', etykieta: JAKOSC_STRINGS.kolIkss, jednostka: JAKOSC_STRINGS.jednKA, mono: true },
  { klucz: 'dolna', etykieta: JAKOSC_STRINGS.kolGranicaDolna, jednostka: JAKOSC_STRINGS.jednKA, mono: true },
  { klucz: 'gorna', etykieta: JAKOSC_STRINGS.kolGranicaGorna, jednostka: JAKOSC_STRINGS.jednKA, mono: true },
  { klucz: 'status', etykieta: JAKOSC_STRINGS.kolStatusWiarygodnosci, wyrownanie: 'lewo' },
  { klucz: 'blokada', etykieta: JAKOSC_STRINGS.kolBlokadaOsd, wyrownanie: 'lewo', sortowalna: false },
  {
    klucz: KLUCZ_WIARYGODNOSCI_WEZEL,
    etykieta: JAKOSC_STRINGS.kolIdentyfikatorWezla,
    mono: true,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
];

/** Adapter: pozycja wiarygodności → wiersz tabeli wzorca (bez ocen lokalnych).
 * `dowodRef` na Ik" (K3/C1): wartość pochodzi wprost z przebiegu zwarciowego —
 * ref = `element_id ?? target_id` (wzorzec `zwarciaModel.ts`). Napięcie (dana
 * modelu) i granice pasm (konfiguracja normatywna) to WEJŚCIA oceny — bez dowodu. */
export function mapujWierszWiarygodnosci(item: WiarygodnoscItem): WierszTabeli {
  return {
    wezel: { wartosc: item.target_name ?? item.target_id },
    napiecie: komorkaLiczba(item.voltage_kv, fmtKV),
    pasmo: { wartosc: item.voltage_band ?? JAKOSC_STRINGS.kreska },
    // Tag „poza zakresem" mapowany na wartość Ik" wprost z flagi backendu (in_range).
    ikss: komorkaLiczba(item.ikss_ka, fmtKA, {
      ostrzezenie: !item.in_range,
      dowodRef: item.element_id ?? item.target_id,
    }),
    dolna: komorkaLiczba(item.lower_ka, fmtKA),
    gorna: komorkaLiczba(item.upper_ka, fmtKA),
    status: { wartosc: item.status },
    blokada: {
      wartosc: item.blocks_osd_package ? JAKOSC_STRINGS.blokadaTak : JAKOSC_STRINGS.blokadaNie,
    },
    [KLUCZ_WIARYGODNOSCI_WEZEL]: { wartosc: item.target_id },
  };
}

/** Mapuje pozycje wiarygodności na wiersze tabeli wzorca (kolejność źródłowa). */
export function naWierszeWiarygodnosci(items: readonly WiarygodnoscItem[]): WierszTabeli[] {
  return items.map(mapujWierszWiarygodnosci);
}

/** Buduje sekcję ZAŁOŻENIA sekcji wiarygodności (metoda + pasma napięciowe). */
export function naZalozeniaWiarygodnosci(): WierszZalozenia[] {
  return [
    {
      etykieta: JAKOSC_STRINGS.zalMetodaWiarygodnosc,
      wartosc: JAKOSC_STRINGS.zalMetodaWiarygodnoscWartosc,
    },
    {
      etykieta: JAKOSC_STRINGS.zalPasma,
      wartosc: JAKOSC_STRINGS.zalPasmaWartosc,
      uwaga: JAKOSC_STRINGS.zalPasmaUwaga,
    },
  ];
}

// ---------------------------------------------------------------------------
// Sekcja 2 — Walidacja energetyczna
// ---------------------------------------------------------------------------

export const KLUCZ_WALIDACJI_OBIEKT = 'identyfikator';

/**
 * Klucz wiersza tabeli walidacji (React key + wybór wiersza). Pole POZA listą
 * kolumn (nie renderowane) — bo `target_id` NIE jest unikatowy w tej sekcji
 * (jeden obiekt bywa oceniany kilkoma rodzajami kontroli). Kompozyt
 * `check_type::target_id::index` gwarantuje unikatowość i determinizm.
 */
export const KLUCZ_WIERSZA_WALIDACJI = 'kluczWiersza';

/** Deterministyczny, unikatowy klucz pozycji walidacji (rodzaj + obiekt + indeks). */
export function kluczWalidacji(item: WalidacjaItem, index: number): string {
  return `${item.check_type}::${item.target_id}::${index}`;
}

export const KOLUMNY_WALIDACJI: DefinicjaKolumny[] = [
  { klucz: 'rodzaj', etykieta: JAKOSC_STRINGS.kolRodzajKontroli, wyrownanie: 'lewo' },
  { klucz: 'obiekt', etykieta: JAKOSC_STRINGS.kolObiekt, wyrownanie: 'lewo' },
  { klucz: 'wartosc', etykieta: JAKOSC_STRINGS.kolWartosc, mono: true },
  { klucz: 'progOstrz', etykieta: JAKOSC_STRINGS.kolProgOstrzezenia, mono: true },
  { klucz: 'progPrzekr', etykieta: JAKOSC_STRINGS.kolProgPrzekroczenia, mono: true },
  { klucz: 'margines', etykieta: JAKOSC_STRINGS.kolMargines, jednostka: JAKOSC_STRINGS.jednProcent, mono: true },
  { klucz: 'status', etykieta: JAKOSC_STRINGS.kolStatusWalidacji, wyrownanie: 'lewo' },
  {
    klucz: KLUCZ_WALIDACJI_OBIEKT,
    etykieta: JAKOSC_STRINGS.kolIdentyfikatorObiektu,
    mono: true,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
];

/**
 * Typ elementu modelu dla przekroczenia walidacji (pętla decyzji F-E6.2). Mapowanie
 * gruntowane realnym backendem (`analysis/energy_validation/builder.py`): jaki
 * identyfikator siada w `target_id` per rodzaj kontroli:
 * - VOLTAGE_DEVIATION / REACTIVE_BALANCE → węzeł (`node_id`/`slack_node_id`) = Bus
 * - BRANCH_LOADING → `branch_id` gałęzi = LineBranch
 * - TRANSFORMER_LOADING → `branch_id` transformatora = TransformerBranch
 * - LOSS_BUDGET → `target_id="network"` = AGREGAT SYSTEMOWY (brak elementu modelu → null)
 * Zwraca `null`, gdy przekroczenie nie mapuje na wybieralny element (brak martwej akcji).
 */
export function typElementuWalidacji(checkType: RodzajKontroli): ElementType | null {
  switch (checkType) {
    case 'VOLTAGE_DEVIATION':
    case 'REACTIVE_BALANCE':
      return 'Bus';
    case 'BRANCH_LOADING':
      return 'LineBranch';
    case 'TRANSFORMER_LOADING':
      return 'TransformerBranch';
    case 'LOSS_BUDGET':
      return null;
  }
}

/**
 * Rodzaj przekroczenia dla akcji naprawczej (K1 / F-E6.3) — mapowanie 1:1
 * z realnych kodów `check_type` backendu (`analysis/energy_validation`):
 * napięcie / obciążalność gałęzi / obciążalność transformatora / bilans biernej.
 * LOSS_BUDGET → null (agregat systemowy — przycisk decyzji się nie renderuje,
 * spójnie z `typElementuWalidacji`).
 */
export function rodzajPrzekroczeniaWalidacji(
  checkType: RodzajKontroli,
): RodzajPrzekroczenia | null {
  switch (checkType) {
    case 'VOLTAGE_DEVIATION':
      return 'napiecie';
    case 'BRANCH_LOADING':
      return 'obciazalnosc-galezi';
    case 'TRANSFORMER_LOADING':
      return 'obciazalnosc-transformatora';
    case 'REACTIVE_BALANCE':
      return 'bilans-biernej';
    case 'LOSS_BUDGET':
      return null;
  }
}

/** Adapter: pozycja walidacji → wiersz tabeli wzorca (statusy wyłącznie z backendu). */
export function mapujWierszWalidacji(item: WalidacjaItem, index: number): WierszTabeli {
  const przekroczony = item.status === 'WARNING' || item.status === 'FAIL';
  return {
    rodzaj: { wartosc: rodzajKontroliPL(item.check_type) },
    obiekt: { wartosc: item.target_name ?? item.target_id },
    wartosc: komorkaLiczba(item.observed_value, fmtWartosc, {
      jednostka: item.unit,
      ostrzezenie: przekroczony,
    }),
    progOstrz: komorkaLiczba(item.limit_warn, fmtWartosc, { jednostka: item.unit }),
    progPrzekr: komorkaLiczba(item.limit_fail, fmtWartosc, { jednostka: item.unit }),
    margines: komorkaLiczba(item.margin_pct, fmtProcent),
    status: { wartosc: statusWalidacjiPL(item.status) },
    [KLUCZ_WALIDACJI_OBIEKT]: { wartosc: item.target_id },
    [KLUCZ_WIERSZA_WALIDACJI]: { wartosc: kluczWalidacji(item, index) },
  };
}

/** Mapuje pozycje walidacji na wiersze tabeli wzorca (kolejność źródłowa). */
export function naWierszeWalidacji(items: readonly WalidacjaItem[]): WierszTabeli[] {
  return items.map((item, index) => mapujWierszWalidacji(item, index));
}

/** Buduje sekcję ZAŁOŻENIA sekcji walidacji z konfiguracji progów backendu. */
export function naZalozeniaWalidacji(config: WalidacjaConfig): WierszZalozenia[] {
  const proc = JAKOSC_STRINGS.jednProcent;
  return [
    { etykieta: JAKOSC_STRINGS.zalProgObciazeniaOstrz, wartosc: fmtProcent(config.loading_warn_pct), jednostka: proc },
    { etykieta: JAKOSC_STRINGS.zalProgObciazeniaPrzekr, wartosc: fmtProcent(config.loading_fail_pct), jednostka: proc },
    { etykieta: JAKOSC_STRINGS.zalProgNapieciaOstrz, wartosc: fmtProcent(config.voltage_warn_pct), jednostka: proc },
    { etykieta: JAKOSC_STRINGS.zalProgNapieciaPrzekr, wartosc: fmtProcent(config.voltage_fail_pct), jednostka: proc },
    { etykieta: JAKOSC_STRINGS.zalProgStratOstrz, wartosc: fmtProcent(config.loss_warn_pct), jednostka: proc },
    { etykieta: JAKOSC_STRINGS.zalProgStratPrzekr, wartosc: fmtProcent(config.loss_fail_pct), jednostka: proc },
  ];
}

// ---------------------------------------------------------------------------
// Sekcja 3 — Migotanie i szybkie zmiany napięcia (P37)
// ---------------------------------------------------------------------------

export const KLUCZ_WIERSZA_MIGOTANIE = 'wezel';

export const KOLUMNY_MIGOTANIE: DefinicjaKolumny[] = [
  { klucz: 'wezel', etykieta: JAKOSC_STRINGS.kolWezelMig, wyrownanie: 'lewo' },
  { klucz: 'sk', etykieta: JAKOSC_STRINGS.kolSk, jednostka: JAKOSC_STRINGS.jednMva, mono: true },
  { klucz: 'pst', etykieta: JAKOSC_STRINGS.kolPst, mono: true },
  { klucz: 'plt', etykieta: JAKOSC_STRINGS.kolPlt, mono: true },
  { klucz: 'd', etykieta: JAKOSC_STRINGS.kolDpercent, jednostka: JAKOSC_STRINGS.jednProcent, mono: true },
  { klucz: 'werdykt', etykieta: JAKOSC_STRINGS.kolWerdyktMig, wyrownanie: 'lewo', sortowalna: false },
];

/** Adapter: węzeł migotania → wiersz tabeli wzorca (limity/werdykt z backendu).
 * `dowodRef` na Sk" (K3/C1): wartość wprost z przebiegu zwarciowego (ref = `bus_ref`).
 * Pst/Plt/d(%) liczy builder migotania — ich ślad WHITE BOX renderuje sekcja
 * ekranu (`SladMigotania`), nie zakładka dowodu przebiegu (bez ref). */
export function mapujWierszMigotania(wezel: WezelMigotania): WierszTabeli {
  return {
    wezel: { wartosc: wezel.bus_ref },
    sk: komorkaLiczba(wezel.sk_mva, fmtMva, { dowodRef: wezel.bus_ref }),
    pst: komorkaLiczba(wezel.pst, fmtPst, {
      ostrzezenie: wezel.pst !== null && wezel.pst > wezel.pst_limit,
    }),
    plt: komorkaLiczba(wezel.plt, fmtPst, {
      ostrzezenie: wezel.plt !== null && wezel.plt > wezel.plt_limit,
    }),
    d: komorkaLiczba(wezel.d_percent, fmtProcent),
    werdykt: { wartosc: wezel.verdict_pl },
  };
}

/** Mapuje węzły migotania na wiersze tabeli wzorca (kolejność źródłowa). */
export function naWierszeMigotania(buses: readonly WezelMigotania[]): WierszTabeli[] {
  return buses.map(mapujWierszMigotania);
}

/** Buduje sekcję ZAŁOŻENIA sekcji migotania z konfiguracji normatywnej backendu. */
export function naZalozeniaMigotania(config: KonfiguracjaMigotania): WierszZalozenia[] {
  return [
    { etykieta: JAKOSC_STRINGS.zalMigM, wartosc: config.flicker_summation_exponent_m },
    {
      etykieta: JAKOSC_STRINGS.zalMigPst,
      wartosc: fmtPst(config.planning_level_pst),
      uwaga: JAKOSC_STRINGS.zalMigUwaga,
    },
    {
      etykieta: JAKOSC_STRINGS.zalMigPlt,
      wartosc: fmtPst(config.planning_level_plt),
      uwaga: JAKOSC_STRINGS.zalMigUwaga,
    },
    { etykieta: JAKOSC_STRINGS.zalMigKmax, wartosc: fmtPst(config.rvc_kmax) },
  ];
}

// ---------------------------------------------------------------------------
// Sekcja 4 — Arc Flash (IEEE 1584-2018), audyt V12K-059 poz. A
// ---------------------------------------------------------------------------

export const KLUCZ_WIERSZA_ARC_FLASH = 'punkt';

export const KOLUMNY_ARC_FLASH: DefinicjaKolumny[] = [
  { klucz: 'punkt', etykieta: JAKOSC_STRINGS.kolWezelAf, wyrownanie: 'lewo' },
  { klucz: 'ibf', etykieta: JAKOSC_STRINGS.kolIbf, jednostka: JAKOSC_STRINGS.jednKA, mono: true },
  {
    klucz: 'energia',
    etykieta: JAKOSC_STRINGS.kolEnergia,
    jednostka: JAKOSC_STRINGS.jednCal,
    mono: true,
  },
  {
    klucz: 'granica',
    etykieta: JAKOSC_STRINGS.kolGranica,
    jednostka: JAKOSC_STRINGS.jednMm,
    mono: true,
  },
  { klucz: 'ppe', etykieta: JAKOSC_STRINGS.kolPpe, wyrownanie: 'lewo', sortowalna: false },
  { klucz: 'status', etykieta: JAKOSC_STRINGS.kolStatusAf, wyrownanie: 'lewo', sortowalna: false },
];

/** Adapter: wynik Arc Flash → wiersz tabeli wzorca (wartości WYŁĄCZNIE z backendu).
 * `dowodRef` na I_bf (K3/C1): prąd zwarcia trójfazowego wprost z przebiegu
 * zwarciowego (ref = `bus_ref`). Energia incydentu i granica łuku to wyniki
 * buildera IEEE 1584 — ich ślad WHITE BOX renderuje sekcja ekranu (bez ref). */
export function mapujWierszArcFlash(wynik: WynikArcFlash): WierszTabeli {
  return {
    punkt: { wartosc: wynik.bus_ref },
    ibf: komorkaLiczba(wynik.i_bf_ka, fmtKA, { dowodRef: wynik.bus_ref }),
    energia: komorkaLiczba(wynik.incident_energy_cal_cm2, fmtCal),
    granica: komorkaLiczba(wynik.arc_flash_boundary_mm, fmtMm),
    ppe: { wartosc: wynik.ppe_category ?? JAKOSC_STRINGS.kreska },
    status: { wartosc: wynik.status_label_pl },
  };
}

/** Mapuje wyniki Arc Flash na wiersze tabeli wzorca (kolejność źródłowa). */
export function naWierszeArcFlash(wyniki: readonly WynikArcFlash[]): WierszTabeli[] {
  return wyniki.map(mapujWierszArcFlash);
}

// ---------------------------------------------------------------------------
// Warunki przyłączenia OSD (karta F-K2, znalezisko Z2 audytu FLOW)
// ---------------------------------------------------------------------------
// Adapter PREZENTACYJNY: wszystkie wielkości i werdykty przychodzą gotowe z
// backendu (`/api/quality/connection-conditions`). UI nie liczy ani nie ocenia —
// tłumaczy tylko kryteria i statusy na język polski i formatuje liczby.

/** Kolumny werdyktu warunków przyłączenia: kryterium, zmierzona, wymagana, ocena. */
export const KOLUMNY_WARUNKOW: DefinicjaKolumny[] = [
  { klucz: 'kryterium', etykieta: JAKOSC_STRINGS.kolKryterium, wyrownanie: 'lewo' },
  { klucz: 'zmierzona', etykieta: JAKOSC_STRINGS.kolWartoscZmierzona, mono: true },
  { klucz: 'wymagana', etykieta: JAKOSC_STRINGS.kolWartoscWymagana, mono: true },
  { klucz: 'ocena', etykieta: JAKOSC_STRINGS.kolOcena, wyrownanie: 'lewo' },
];

/** Etykieta kryterium po polsku; nieznany klucz zwracamy bez zmian (uczciwie). */
export function kryteriumWarunkuPL(kryterium: string): string {
  if (kryterium === 'moc_w_punkcie_przylaczenia') return JAKOSC_STRINGS.kryteriumMoc;
  if (kryterium === 'cos_phi_w_punkcie_przylaczenia') return JAKOSC_STRINGS.kryteriumCosPhi;
  return kryterium;
}

/** Ocena po polsku. UNAVAILABLE to TRZECI stan — nigdy nie mylony ze spełnieniem. */
export function ocenaWarunkuPL(status: StatusWarunku): string {
  if (status === 'PASS') return JAKOSC_STRINGS.ocenaSpelnione;
  if (status === 'FAIL') return JAKOSC_STRINGS.ocenaNaruszone;
  return JAKOSC_STRINGS.ocenaNiesprawdzone;
}

/** Wiersze tabeli werdyktu — kolejność z backendu (deterministyczna). */
export function naWierszeWarunkow(pozycje: readonly PozycjaWarunku[]): WierszTabeli[] {
  return pozycje.map((pozycja) => ({
    kryterium: { wartosc: kryteriumWarunkuPL(pozycja.kryterium) },
    zmierzona: komorkaLiczba(pozycja.wartosc, fmtWartosc, {
      jednostka: pozycja.jednostka === '-' ? undefined : pozycja.jednostka,
      ostrzezenie: pozycja.status === 'FAIL',
    }),
    wymagana: komorkaLiczba(pozycja.wymagana, fmtWartosc, {
      jednostka: pozycja.jednostka === '-' ? undefined : pozycja.jednostka,
    }),
    ocena: { wartosc: ocenaWarunkuPL(pozycja.status) },
  }));
}

/**
 * Założenia sekcji — pokazują, SKĄD wzięły się liczby i jaka jest konwencja znaku.
 * Bez tego werdykt „moc 6,2 MW wobec 5,0 MW" nie mówi projektantowi, co zmierzono.
 */
export function naZalozeniaWarunkow(ocena: OcenaWarunkow): WierszZalozenia[] {
  const kierunekPL =
    ocena.kierunek === 'oddawanie'
      ? JAKOSC_STRINGS.warunkiKierunekOddawanie
      : ocena.kierunek === 'pobor'
        ? JAKOSC_STRINGS.warunkiKierunekPobor
        : JAKOSC_STRINGS.kreska;
  return [
    {
      etykieta: 'Punkt przyłączenia',
      wartosc: ocena.punkt_przylaczenia ?? JAKOSC_STRINGS.kreska,
      uwaga: 'Węzeł bilansujący biegu rozpływu — zasilanie z sieci OSD.',
    },
    { etykieta: 'Kierunek przepływu mocy czynnej', wartosc: kierunekPL },
    {
      etykieta: 'Moc pozorna w punkcie',
      wartosc: ocena.s_mva === null ? JAKOSC_STRINGS.kreska : fmtWartosc(ocena.s_mva),
      jednostka: 'MVA',
      uwaga: 'S = √(P² + Q²) z wyniku rozpływu.',
    },
    {
      etykieta: 'Zależność kryterialna',
      wartosc: ocena.formula_ref,
      uwaga: 'Limit mocy dotyczy modułu — dokument OSD ogranicza oba kierunki.',
    },
  ];
}

// ---------------------------------------------------------------------------
// Wytrzymałość zwarciowa przewodów (karta F-K1, znalezisko Z1 audytu FLOW)
// ---------------------------------------------------------------------------
// Adapter PREZENTACYJNY: werdykty i wielkości przychodzą gotowe z backendu
// (kryterium IEC 60949 liczy solver). UI formatuje i tłumaczy.

/** Klucz identyfikujący gałąź w tabeli (selekcja + pętla decyzji do modelu). */
export const KLUCZ_CIEPLNA_GALAZ = 'branchId';

export const KOLUMNY_CIEPLNE: DefinicjaKolumny[] = [
  { klucz: 'przewod', etykieta: JAKOSC_STRINGS.kolPrzewod, wyrownanie: 'lewo' },
  { klucz: 'pradCieplny', etykieta: JAKOSC_STRINGS.kolPradCieplny, jednostka: 'A', mono: true },
  {
    klucz: 'pradDopuszczalny',
    etykieta: JAKOSC_STRINGS.kolPradDopuszczalny,
    jednostka: 'A',
    mono: true,
  },
  {
    klucz: 'przekroj',
    etykieta: JAKOSC_STRINGS.kolPrzekrojZastosowany,
    jednostka: 'mm²',
    mono: true,
  },
  {
    klucz: 'przekrojWymagany',
    etykieta: JAKOSC_STRINGS.kolPrzekrojWymagany,
    jednostka: 'mm²',
    mono: true,
  },
  { klucz: 'ocena', etykieta: JAKOSC_STRINGS.kolOcena, wyrownanie: 'lewo' },
  { klucz: KLUCZ_CIEPLNA_GALAZ, etykieta: JAKOSC_STRINGS.kolIdentyfikatorObiektu, mono: true },
];

/**
 * Wiersze tabeli — kolejność z backendu (deterministyczna, po id gałęzi).
 * Przy stanie NIESPRAWDZONE wielkości są puste, a ocena mówi wprost, że nic nie
 * policzono; przy gałęzi poza drogą zwarcia pokazujemy uzasadnienie zamiast liczb.
 */
export function naWierszeCieplne(pozycje: readonly PozycjaCieplna[]): WierszTabeli[] {
  return pozycje.map((pozycja) => ({
    przewod: { wartosc: pozycja.branch_name || pozycja.branch_id },
    pradCieplny: komorkaLiczba(pozycja.i_fault_a, fmtWartosc, {
      ostrzezenie: pozycja.status === 'FAIL',
    }),
    pradDopuszczalny: komorkaLiczba(pozycja.i_permissible_a, fmtWartosc),
    przekroj: komorkaLiczba(pozycja.applied_cross_section_mm2, fmtWartosc),
    przekrojWymagany: komorkaLiczba(pozycja.s_min_mm2, fmtWartosc, {
      ostrzezenie: pozycja.status === 'FAIL',
    }),
    ocena: { wartosc: pozycja.uzasadnienie_pl ?? ocenaWarunkuPL(pozycja.status) },
    [KLUCZ_CIEPLNA_GALAZ]: { wartosc: pozycja.branch_id },
  }));
}

/** Założenia sekcji: skąd prąd, skąd wytrzymałość, jaki czas i jaka norma. */
export function naZalozeniaCieplne(
  faultNodeId: string,
  tkS: number,
  podsumowanie: PodsumowanieCieplne,
): WierszZalozenia[] {
  return [
    {
      etykieta: 'Kryterium',
      wartosc: 'I_th ≤ I_th(1s) / √t',
      uwaga: 'IEC 60949 — równoważna energia cieplna I²·t = const (nagrzewanie adiabatyczne).',
    },
    {
      etykieta: 'Miejsce zwarcia',
      wartosc: faultNodeId || JAKOSC_STRINGS.kreska,
      uwaga: 'Prąd gałęzi z rozbicia wkładów źródeł (solver zwarciowy).',
    },
    {
      etykieta: 'Czas trwania zwarcia',
      wartosc: fmtWartosc(tkS),
      jednostka: 's',
      uwaga:
        'Czas z biegu zwarciowego, jednolity dla wszystkich gałęzi — mapa gałąź→zabezpieczenie→czas zadziałania nie jest jeszcze dostępna.',
    },
    {
      etykieta: 'Wytrzymałość żyły',
      wartosc: 'Ith(1s) albo Jth(1s)·S z katalogu',
      uwaga: 'Brak danych katalogowych ⇒ pozycja niesprawdzona, nigdy spełniona.',
    },
    {
      etykieta: 'Podsumowanie',
      wartosc: JAKOSC_STRINGS.cieplnaPodsumowanie(
        podsumowanie.pass_count,
        podsumowanie.fail_count,
        podsumowanie.unavailable_count,
      ),
    },
  ];
}
