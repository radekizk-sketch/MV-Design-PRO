/*
 * Model i adapter okna „Wyniki zwarciowe" (karta E8.2). Mapuje REALNY kształt
 * wyniku zwarciowego na model wspólnego wzorca ekranu analizy. Read-only; zero
 * fizyki, zero mutacji, zero wołań API z tego pliku.
 *
 * ŹRÓDŁO DANYCH — realny kontrakt (mapowanie plik:linia, karta §2 „zero zgadywania"):
 * - Wiersz zwarciowy: `ShortCircuitRow` (`ui/results-inspector/types.ts:157-167`):
 *   target_id, element_id?, target_name, ikss_ka, ip_ka, ith_ka, sk_mva,
 *   fault_type, flags. Budowany w backendzie w `enm/canonical_analysis.py:1655-1682`
 *   (fault_type = short_circuit_type: „3F"/„2F"/„2F+Z"/„1F"; flags obecnie []).
 * - Tabela wyników: `ShortCircuitResults` (`types.ts:172-176`): run_id, rows.
 * - Store read-only: `useResultsInspectorStore.shortCircuitResults`
 *   (`ui/results-inspector/store.ts:104`), `selectedRunId` (`store.ts:96`).
 * - Etykiety wielkości PL: `TRACE_VALUE_LABELS` (`types.ts:306-333`).
 *
 * HISTORIA DOMKNIĘCIA (dawne ograniczenia kontraktu read-only, karta §2 „NIE
 * zgaduj") — WSZYSTKIE cztery pozycje niżej są dziś ZAMKNIĘTE; zapis zostaje
 * jako mapowanie plik:linia realnego dostawcy każdej wartości (audyt „skąd to
 * wzięło"), nie jako lista otwartych braków:
 * 1. WKŁADY ŹRÓDEŁ: DOMKNIĘTE (R3-B / K3-G3) — realny dostawca to endpoint
 *    `POST /api/proof/sc3f/contributions` (`zwarcia/api.ts`), rozbicie maszynowe
 *    per źródło (machine_type, Ir, Ik"/Ir, μ, q, Ib, wywód dyplomowy) renderuje
 *    sekcja `WkladyZwarciowe` (karta W-A F2). Props `wklady` pozostaje jako
 *    nadpisanie testowe (pierwszeństwo przed dostawcą).
 * 1a. WKŁADY GAŁĘZIOWE: DOMKNIĘTE (karta W-C, ZWARCIA-PRO F4) — delta backendu
 *    (a)+(b) wykonana: kanoniczny wykonawca (`enm/canonical_analysis.py`
 *    `_execute_short_circuit`) woła FROZEN solver z
 *    `include_branch_contributions=True` (opcja czysto addytywna — test
 *    `test_branch_contributions_option_does_not_change_existing_fields`), a
 *    `build_short_circuit_results` przenosi wkłady przez `_sc_rozplyw_galeziowy`
 *    (projekcja A→kA + nazwy z grafu przebiegu). Kontrakt frontu (c):
 *    `ShortCircuitRow.branch_contributions?: ShortCircuitBranchFlow[] | null`
 *    (`ui/results-inspector/types.ts`). Sekcję renderuje `RozplywZwarciowy`.
 *    GAP DOMKNIĘTY (V12K-132, pkt 7 karty właściciela): kontrakt solvera niesie
 *    teraz OBIE rodziny wkładów — superpozycję falownikową
 *    (`_build_branch_contributions_for_inverters`) ORAZ rozpływ prądu od źródła
 *    zastępczego (Thevenin / sieć nadrzędna,
 *    `_build_branch_contributions_for_thevenin`, source_id="THEVENIN_GRID",
 *    podział prądu z macierzy Z-bus, WHITE BOX `branch_flow_trace`). Sekcja
 *    rozróżnia źródło PL („sieć nadrzędna" vs identyfikator maszyny,
 *    `zrodloRozplywuPL`); strzałki v3 dostają pełny rozpływ. Pusta lista =
 *    policzono, brak prądu w gałęziach (sieć bez źródła zastępczego i bez
 *    falowników zasilających zwarcie).
 *    GAP DOMKNIĘTY (karta WB-ROZPLYW): sam `branch_flow_trace` (WHITE BOX
 *    podziału, TH-1) był od `1e9f21c5` dostępny WYŁĄCZNIE na żądanie
 *    (`GET …/results/short-circuit/rozplyw`), niewpięty w żaden ekran (dług
 *    — treść WHITE BOX istniejąca tylko w magazynie). Sekcja `SladPodzialuPradu`
 *    (pod `RozplywZwarciowy`) renderuje kroki tego śladu REUŻYWAJĄC istniejący
 *    kanon pięciu pól (`KrokDowodu`/`mapujKroki`, `ui2/wyniki/dowod` — ten sam
 *    komponent, którym ekran „Dowód obliczeń" pokazuje `white_box_trace`).
 *    Dostawca `useRozplywZwarciowy` (`zwarcia/api.ts`) zwraca teraz PARĘ
 *    `{flows, trace, blad}` z jednego wywołania endpointu (`RozplywOdpowiedz`
 *    rozszerzony o `branch_flow_trace`) — jedno źródło prawdy dla obu sekcji,
 *    nie dwa niezależne wołania. Naprawiono PRZY OKAZJI defekt klasy w
 *    `dowod/dowodModel.ts` (`mapujWielkosci`): adapter zakładał WYŁĄCZNIE
 *    opakowany kształt `TraceValue` ({value, unit, label}), a REALNY solver
 *    (`WhiteBoxTracer.add`) emituje skalar/liczbę zespoloną `{re, im}` wprost —
 *    każda wartość realnego śladu (SC/PF/branch_flow_trace) renderowała się
 *    jako pusta kreska (KLASA NIE INSTANCJA — naprawa u źródła, nie lokalna
 *    obejście w tej sekcji).
 * 2. ŚWIEŻOŚĆ (FreshnessBadge): DOMKNIĘTE (V12K-264/265) — `EkranZwarc` czyta
 *    `useSwiezoscNaglowka(runId)` (ten sam mechanizm co okna rozpływu/zbieżności,
 *    `ui2/freshness`), więc nagłówek podaje parę rewizji i panel przyczyn, gdy
 *    wynik jest nieaktualny wobec modelu.
 * 3. ZAŁOŻENIA c / czas cieplny: DOMKNIĘTE (karta UI2 p.7) — wartości
 *    pochodzą z konfiguracji ZAPISANEJ NA TYM BIEGU (`konfiguracja_biegu`
 *    odpowiedzi, `api/canonical_run_views.py::build_konfiguracja_biegu_zwarcia`),
 *    nie z aktywnego przypadku obliczeniowego (mogą się różnić po fakcie) ani
 *    z propsów. Pełny opis reguł prezentacji (tryb `auto_per_wezel`, starszy
 *    zapis biegu bez pola, pochodzenie domyślnego czasu cieplnego) stoi przy
 *    `naZalozeniaZwarc` niżej. Metoda „IEC 60909" jest stałą normatywną rodziny
 *    solvera (nie zgadywanie).
 */

import type {
  KonfiguracjaBieguZwarcia,
  ShortCircuitBranchFlow,
  ShortCircuitResults,
  ShortCircuitRow,
  ZalozenieBieguSlad,
  ZrodloSiecioweSlad,
} from '../../../ui/results-inspector/types';
import { useResultsInspectorStore } from '../../../ui/results-inspector/store';
import type {
  DefinicjaKolumny,
  KrokWywodu,
  WartoscKomorki,
  WierszTabeli,
  WierszZalozenia,
} from '../wzorzec';
import {
  ZWARCIA_STRINGS,
  fmtCzas,
  fmtKA,
  fmtKappa,
  fmtMVA,
  fmtOhm,
  fmtProcent,
  fmtWspolczynnik,
  rodzajZwarciaPL,
  rxRatioZrodloPL,
  scenariuszZwarciaPL,
  trybZrodlaSiecowegoPL,
  typMaszynyPL,
  uwagiZwarciaPL,
  zrodloRozplywuPL,
} from './strings';

// ---------------------------------------------------------------------------
// Kolumny tabeli punktów zwarciowych (deklaratywne — jednostka w nagłówku)
// ---------------------------------------------------------------------------

export const KLUCZ_PUNKT = 'identyfikator';

export const KOLUMNY_ZWARC: DefinicjaKolumny[] = [
  { klucz: 'punkt', etykieta: ZWARCIA_STRINGS.kolPunkt, wyrownanie: 'lewo' },
  { klucz: 'rodzaj', etykieta: ZWARCIA_STRINGS.kolRodzaj, wyrownanie: 'lewo' },
  { klucz: 'ikss', etykieta: ZWARCIA_STRINGS.kolIkss, jednostka: ZWARCIA_STRINGS.jednKA, mono: true },
  { klucz: 'ip', etykieta: ZWARCIA_STRINGS.kolIp, jednostka: ZWARCIA_STRINGS.jednKA, mono: true },
  { klucz: 'ith', etykieta: ZWARCIA_STRINGS.kolIth, jednostka: ZWARCIA_STRINGS.jednKA, mono: true },
  { klucz: 'sk', etykieta: ZWARCIA_STRINGS.kolSk, jednostka: ZWARCIA_STRINGS.jednMVA, mono: true },
  // Kolumny impedancyjne (ZWARCIA-PRO F1): weryfikacja wyniku bez White Box —
  // wielkosci FROZEN solvera (Zk Thevenina, X/R, kappa); tryb ekspercki.
  {
    klucz: 'rk',
    etykieta: ZWARCIA_STRINGS.kolRk,
    jednostka: ZWARCIA_STRINGS.jednOhm,
    mono: true,
    tylkoEkspercki: true,
  },
  {
    klucz: 'xk',
    etykieta: ZWARCIA_STRINGS.kolXk,
    jednostka: ZWARCIA_STRINGS.jednOhm,
    mono: true,
    tylkoEkspercki: true,
  },
  {
    klucz: 'zk',
    etykieta: ZWARCIA_STRINGS.kolZk,
    jednostka: ZWARCIA_STRINGS.jednOhm,
    mono: true,
    tylkoEkspercki: true,
  },
  { klucz: 'xr', etykieta: ZWARCIA_STRINGS.kolXR, mono: true, tylkoEkspercki: true },
  { klucz: 'kappa', etykieta: ZWARCIA_STRINGS.kolKappa, mono: true, tylkoEkspercki: true },
  { klucz: 'uwagi', etykieta: ZWARCIA_STRINGS.kolUwagi, wyrownanie: 'lewo', sortowalna: false },
  // Karta #145: `target_id` jest KLUCZEM wiersza (`KLUCZ_PUNKT`, komórka bez kolumny) —
  // identyfikator nie jest tekstem pierwszego planu, także w trybie eksperckim.
];

// ---------------------------------------------------------------------------
// Mapowania czyste (bez React) — fixture 1:1 z kontraktem `ShortCircuitRow`
// ---------------------------------------------------------------------------

/**
 * Komórka wielkości liczbowej: wartość `null` → „—" (bez dowodu); wartość obecna
 * → sformatowana z przecinkiem PL, `sortKey` liczbowy oraz `dowodRef` (2× klik →
 * dowód). `null` otrzymuje najmniejszy klucz sortowania (deterministyczna
 * kolejność, wartości puste na dole przy sortowaniu rosnącym).
 */
function komorkaWielkosci(
  wartosc: number | null,
  format: (n: number) => string,
  dowodRef: string,
): WartoscKomorki {
  if (wartosc === null) {
    return { wartosc: ZWARCIA_STRINGS.kreska, sortKey: Number.NEGATIVE_INFINITY };
  }
  return { wartosc: format(wartosc), sortKey: wartosc, dowodRef };
}

/**
 * Nazwa punktu zwarcia dla projektanta: most nazw wyników po `element_id` (ref ENM
 * szyny), a gdy migawka go nie zna — nazwa podana przez wynik (`target_name`), nigdy
 * identyfikator (karta #145).
 */
export function nazwaPunktuZwarcia(row: ShortCircuitRow, nazwa: (ref: string, zWyniku?: string | null) => string): string {
  return nazwa(row.element_id ?? row.target_id, row.target_name);
}

/**
 * Adapter read-only: `ShortCircuitRow` → wiersz tabeli wzorca. `dowodRef` =
 * `element_id` (gdy jest) lub `target_id` (karta §2: ref dowodu = target/element).
 */
export function mapujWierszZwarcia(
  row: ShortCircuitRow,
  nazwa: (ref: string, zWyniku?: string | null) => string,
): WierszTabeli {
  const dowodRef = row.element_id ?? row.target_id;
  return {
    punkt: { wartosc: nazwaPunktuZwarcia(row, nazwa) },
    rodzaj: { wartosc: rodzajZwarciaPL(row.fault_type) },
    ikss: komorkaWielkosci(row.ikss_ka, fmtKA, dowodRef),
    ip: komorkaWielkosci(row.ip_ka, fmtKA, dowodRef),
    ith: komorkaWielkosci(row.ith_ka, fmtKA, dowodRef),
    sk: komorkaWielkosci(row.sk_mva, fmtMVA, dowodRef),
    // Bilans impedancyjny (F1): starsze wyniki bez pol -> uczciwa kreska.
    rk: komorkaWielkosci(row.rk_ohm ?? null, fmtOhm, dowodRef),
    xk: komorkaWielkosci(row.xk_ohm ?? null, fmtOhm, dowodRef),
    zk: komorkaWielkosci(row.zk_ohm ?? null, fmtOhm, dowodRef),
    xr: komorkaWielkosci(row.xr_ratio ?? null, fmtKappa, dowodRef),
    kappa: komorkaWielkosci(row.kappa ?? null, fmtKappa, dowodRef),
    uwagi: { wartosc: uwagiZwarciaPL(row.flags) },
    [KLUCZ_PUNKT]: { wartosc: row.target_id },
  };
}

/** Mapuje wiersze zwarciowe na wiersze tabeli wzorca (kolejność źródłowa). */
export function naWierszeZwarc(
  rows: ShortCircuitRow[],
  nazwa: (ref: string, zWyniku?: string | null) => string,
): WierszTabeli[] {
  return rows.map((row) => mapujWierszZwarcia(row, nazwa));
}

/** Wiersz „Współczynnik napięciowy c" — z KONFIGURACJI TEGO BIEGU (nie z
 * aktywnego przypadku obliczeniowego, karta UI2 p.7). Tryb `jawny` →
 * liczba; `auto_per_wezel` → uczciwy opis (solver dobiera c per węzeł, nie ma
 * jednej wspólnej wartości biegu); brak konfiguracji (starszy zapis) → „—".
 */
function wierszWspolczynnikaC(c: KonfiguracjaBieguZwarcia['c_factor'] | undefined): WierszZalozenia {
  if (c === undefined) {
    return {
      etykieta: ZWARCIA_STRINGS.zalWspolczynnikC,
      wartosc: ZWARCIA_STRINGS.kreska,
      uwaga: ZWARCIA_STRINGS.zalKonfiguracjaBieguNiedostepna,
    };
  }
  if (c.tryb === 'auto_per_wezel' || c.wartosc === null) {
    return {
      etykieta: ZWARCIA_STRINGS.zalWspolczynnikC,
      wartosc: ZWARCIA_STRINGS.zalWspolczynnikCAuto,
      uwaga: ZWARCIA_STRINGS.zalWspolczynnikCAutoUwaga,
    };
  }
  return { etykieta: ZWARCIA_STRINGS.zalWspolczynnikC, wartosc: fmtWspolczynnik(c.wartosc) };
}

/** Wiersz „Czas cieplny" — z KONFIGURACJI TEGO BIEGU; `pochodzenie:
 * 'domyslna_assemblera'` dostaje uwagę (1,0 s nie jest ukrywana jako gdyby
 * pochodziła z jawnych opcji biegu — zero fabrykacji pochodzenia). */
function wierszCzasuCieplnego(
  t: KonfiguracjaBieguZwarcia['thermal_time_seconds'] | undefined,
): WierszZalozenia {
  if (t === undefined) {
    return {
      etykieta: ZWARCIA_STRINGS.zalCzasCieplny,
      wartosc: ZWARCIA_STRINGS.kreska,
      uwaga: ZWARCIA_STRINGS.zalKonfiguracjaBieguNiedostepna,
    };
  }
  return {
    etykieta: ZWARCIA_STRINGS.zalCzasCieplny,
    wartosc: fmtCzas(t.wartosc),
    jednostka: ZWARCIA_STRINGS.jednS,
    uwaga: t.pochodzenie === 'domyslna_assemblera' ? ZWARCIA_STRINGS.zalCzasCieplnyDomyslny : undefined,
  };
}

/**
 * Buduje sekcję ZAŁOŻENIA (W-602). Metoda / współczynnik c / czas cieplny
 * pochodzą z `konfiguracja_biegu` odpowiedzi (`GET …/results/short-circuit`,
 * `api/canonical_run_views.py::build_konfiguracja_biegu_zwarcia`) — konfiguracja
 * ZAPISANA na TYM biegu, nigdy aktywnego przypadku obliczeniowego (karta
 * UI2 p.7: przypadek aktywny może się różnić od przypadku biegu po
 * fakcie — dwie różne rzeczy). Starszy zapis biegu sprzed tej karty → pole
 * nieobecne → uczciwa kreska (bez zgadywania), metoda pozostaje stałą normatywną.
 *
 * CV-4.3 K7: `zalozeniaBiegu` (opcjonalny, `raw_result.zalozenia`) dokłada po
 * jednym wierszu na każde założenie biegu nazwane kodem gotowości (np. scenariusz
 * MIN bez S″kQmin — Z_Q z danych MAX) — treść (`message_pl`) WPROST z backendu,
 * nigdy cicho. Brak/pusta lista = bieg bez założeń (wiersze bazowe bez zmian).
 * Karta #145: źródło założenia nazywa most nazw wyników (`nazwa`), nie referencja.
 */
export function naZalozeniaZwarc(
  konfiguracja: KonfiguracjaBieguZwarcia | undefined,
  zalozeniaBiegu: readonly ZalozenieBieguSlad[] | undefined,
  nazwa: (ref: string) => string,
): WierszZalozenia[] {
  const bazowe: WierszZalozenia[] = [
    { etykieta: ZWARCIA_STRINGS.zalMetoda, wartosc: konfiguracja?.metoda ?? ZWARCIA_STRINGS.zalMetodaWartosc },
    wierszWspolczynnikaC(konfiguracja?.c_factor),
    wierszCzasuCieplnego(konfiguracja?.thermal_time_seconds),
  ];
  const zZaZrodel: WierszZalozenia[] = (zalozeniaBiegu ?? []).map((z) => ({
    etykieta: ZWARCIA_STRINGS.zalozenieEtykieta(nazwa(z.element_ref)),
    wartosc: z.message_pl,
    uwaga: ZWARCIA_STRINGS.zalozenieUwaga(scenariuszZwarciaPL(z.scenariusz)),
  }));
  return [...bazowe, ...zZaZrodel];
}

// ---------------------------------------------------------------------------
// Wykres — słupki wielkości per punkt zwarcia (dane wprost z wyniku, zero
// losowości). Przełącznik wielkości Ik"/ip/Ith/Sk"/I²t — karta W-A F2 (pkt 12).
// ---------------------------------------------------------------------------

/**
 * Punkt słupka wykresu (jeden punkt zwarcia). Pole `ikss` to STAŁY dataKey
 * wspólnego wykresu słupkowego — od karty W-A F2 niesie wartość AKTUALNIE
 * prezentowanej wielkości (Ik"/ip/Ith/Sk"/I²t); nazwa pola pozostaje historyczna
 * (kontrakt addytywny — bez zmiany istniejących konsumentów).
 */
export interface SlupekIkss {
  punkt: string;
  ikss: number;
}

/** Wielkości przełącznika wykresu punktów zwarcia (kolejność prezentacji). */
export const WIELKOSCI_WYKRESU = ['ikss', 'ip', 'ith', 'sk', 'i2t'] as const;

export type WielkoscWykresu = (typeof WIELKOSCI_WYKRESU)[number];

/** Deklaratywna konfiguracja jednej wielkości wykresu (bez fizyki — sam wybór pola). */
export interface KonfigWykresuZwarc {
  /** Krótka etykieta przycisku przełącznika. */
  przycisk: string;
  /** Tytuł wykresu dla tej wielkości. */
  tytul: string;
  /** Pełna nazwa wielkości (dymek/seria). */
  nazwaWielkosci: string;
  /** Jednostka prezentacji. */
  jednostka: string;
  /** Deterministyczny formatera wartości (przecinek PL). */
  format: (n: number) => string;
  /** Odczyt pola wiersza kanonicznego (read-only). */
  wartosc: (row: ShortCircuitRow) => number | null | undefined;
}

export const KONFIG_WYKRESU_ZWARC: Record<WielkoscWykresu, KonfigWykresuZwarc> = {
  ikss: {
    przycisk: ZWARCIA_STRINGS.wykresPrzyciskIkss,
    tytul: ZWARCIA_STRINGS.wykresTytul,
    nazwaWielkosci: ZWARCIA_STRINGS.wykresOsY,
    jednostka: ZWARCIA_STRINGS.jednKA,
    format: fmtKA,
    wartosc: (row) => row.ikss_ka,
  },
  ip: {
    przycisk: ZWARCIA_STRINGS.wykresPrzyciskIp,
    tytul: ZWARCIA_STRINGS.wykresTytulIp,
    nazwaWielkosci: ZWARCIA_STRINGS.kolIp,
    jednostka: ZWARCIA_STRINGS.jednKA,
    format: fmtKA,
    wartosc: (row) => row.ip_ka,
  },
  ith: {
    przycisk: ZWARCIA_STRINGS.wykresPrzyciskIth,
    tytul: ZWARCIA_STRINGS.wykresTytulIth,
    nazwaWielkosci: ZWARCIA_STRINGS.kolIth,
    jednostka: ZWARCIA_STRINGS.jednKA,
    format: fmtKA,
    wartosc: (row) => row.ith_ka,
  },
  sk: {
    przycisk: ZWARCIA_STRINGS.wykresPrzyciskSk,
    tytul: ZWARCIA_STRINGS.wykresTytulSk,
    nazwaWielkosci: ZWARCIA_STRINGS.kolSk,
    jednostka: ZWARCIA_STRINGS.jednMVA,
    format: fmtMVA,
    wartosc: (row) => row.sk_mva,
  },
  i2t: {
    przycisk: ZWARCIA_STRINGS.wykresPrzyciskI2t,
    tytul: ZWARCIA_STRINGS.wykresTytulI2t,
    nazwaWielkosci: ZWARCIA_STRINGS.bilansI2t,
    jednostka: ZWARCIA_STRINGS.jednKA2s,
    format: fmtKappa,
    wartosc: (row) => row.i2t_ka2s,
  },
};

/**
 * Punkty wykresu wybranej wielkości — tylko wiersze z niepustą wartością
 * (kolejność źródłowa). Etykieta słupka = nazwa punktu (target_name) lub
 * target_id, gdy brak nazwy. Pusta lista = wielkość nieobecna w przebiegu
 * (starszy wynik) — wołający pokazuje uczciwy komunikat zamiast pustych słupków.
 */
export function naSlupkiWielkosci(
  rows: ShortCircuitRow[],
  wielkosc: WielkoscWykresu,
  nazwa: (ref: string, zWyniku?: string | null) => string,
): SlupekIkss[] {
  const odczyt = KONFIG_WYKRESU_ZWARC[wielkosc].wartosc;
  return rows.flatMap((r) => {
    const wartosc = odczyt(r);
    if (wartosc === null || wartosc === undefined) return [];
    return [{ punkt: nazwaPunktuZwarcia(r, nazwa), ikss: wartosc }];
  });
}

/** Punkty wykresu Ik" (kontrakt 1:1 sprzed karty W-A F2 — deleguje do wielkości). */
export function naSlupkiIkss(
  rows: ShortCircuitRow[],
  nazwa: (ref: string, zWyniku?: string | null) => string,
): SlupekIkss[] {
  return naSlupkiWielkosci(rows, 'ikss', nazwa);
}

// ---------------------------------------------------------------------------
// Wkłady zwarciowe — projekcja prezentacyjna (dostawca produkcyjny: `zwarcia/api.ts`
// `useWkladyZwarciowe`; props `wklady` = nadpisanie testowe, patrz pozycja 1 wyżej)
// ---------------------------------------------------------------------------

/**
 * Szczegół maszynowy wkładu źródła (karta W-A F2) — projekcja prezentacyjna pól
 * `MachinePartialContribution.to_dict` (machine_sc_iec60909.py:115-131, IEC 60909
 * §6.6): typ maszyny, Ir, Ik"/Ir, μ, q, Ib oraz wywód dyplomowy TEJ maszyny
 * ({tekst, latex} budowane w solverze). Wartości nieobecne w odpowiedzi → null
 * (uczciwa kreska, zero fabrykacji).
 */
export interface SzczegolWkladu {
  /** Token typu maszyny z backendu (SYNCHRONOUS/ASYNCHRONOUS/DFIG). */
  typMaszyny: string;
  /** Prąd znamionowy Ir [kA] (skalowanie prezentacji A → kA). */
  irKA: number | null;
  /** Stosunek Ik"/Ir (bezwymiarowy). */
  stosunekIkIr: number | null;
  /** Współczynnik zaniku μ (IEC 60909 §6.6.1). */
  mu: number | null;
  /** Współczynnik q (IEC 60909 §6.6.3; 1 dla maszyn synchronicznych). */
  q: number | null;
  /** Prąd wyłączeniowy symetryczny Ib [kA]. */
  ibKA: number | null;
  /** Wywód dyplomowy tej maszyny (kroki {tekst, latex} z backendu). */
  wywod: readonly KrokWywodu[];
}

/**
 * Wkład pojedynczego źródła do prądu w punkcie zwarcia — projekcja prezentacyjna
 * (nie kontrakt solvera). Kształt odwzorowuje `ShortCircuitSourceContribution`
 * (`short_circuit_contributions.py`): identyfikator, nazwa źródła (PL), prąd [kA].
 */
export interface WkladZwarciowy {
  /** Identyfikator źródła — pokazywany wyłącznie w trybie eksperckim. */
  id: string;
  /** Nazwa źródła (polska, pierwszy plan). */
  zrodlo: string;
  /** Prąd wkładu [kA]. */
  pradKA: number;
  /** Odwołanie do dowodu (2× klik → onOtworzDowod), opcjonalne. */
  dowodRef?: string;
  /**
   * Szczegół maszynowy (karta W-A F2) — obecny, gdy odpowiedź backendu niesie
   * pola maszyny; brak = uczciwy stan „szczegóły niedostępne" po rozwinięciu.
   */
  szczegol?: SzczegolWkladu;
}

/** Kolumny tabeli wkładów (deklaratywne — jednostka w nagłówku). */
export const KLUCZ_WKLAD = 'identyfikator';

export const KOLUMNY_WKLADOW: DefinicjaKolumny[] = [
  { klucz: 'zrodlo', etykieta: ZWARCIA_STRINGS.wkladyKolZrodlo, wyrownanie: 'lewo' },
  { klucz: 'prad', etykieta: ZWARCIA_STRINGS.wkladyKolPrad, jednostka: ZWARCIA_STRINGS.jednKA, mono: true },
  { klucz: 'udzial', etykieta: ZWARCIA_STRINGS.wkladyKolUdzial, jednostka: ZWARCIA_STRINGS.jednProcent, mono: true },
  // Karta #145: identyfikator źródła jest kluczem wiersza (`KLUCZ_WKLAD`), nie kolumną.
];

/**
 * Mapuje wkłady na wiersze tabeli wzorca. Udział [%] liczony PREZENTACYJNIE jako
 * stosunek prądu wkładu do sumy prądów wkładów (arytmetyka prezentacji, nie
 * fizyka — karta §2). Suma zerowa → udział „—" (bez dzielenia przez zero).
 */
export function naWierszeWkladow(wklady: WkladZwarciowy[]): WierszTabeli[] {
  const suma = wklady.reduce((acc, w) => acc + w.pradKA, 0);
  return wklady.map((w) => ({
    zrodlo: { wartosc: w.zrodlo },
    prad: { wartosc: fmtKA(w.pradKA), sortKey: w.pradKA, dowodRef: w.dowodRef },
    udzial:
      suma > 0
        ? { wartosc: fmtProcent((w.pradKA / suma) * 100), sortKey: w.pradKA / suma }
        : { wartosc: ZWARCIA_STRINGS.kreska, sortKey: Number.NEGATIVE_INFINITY },
    [KLUCZ_WKLAD]: { wartosc: w.id },
  }));
}

/**
 * Filtr tekstowy wierszy wkładów po nazwie źródła (karta W-A F2) — czysta
 * operacja prezentacyjna na PEŁNYM zbiorze wierszy (udział [%] liczony przed
 * filtrem, więc filtrowanie NIE zmienia udziałów). Fraza pusta → wejście 1:1.
 */
export function filtrujWierszeWkladow(wiersze: WierszTabeli[], fraza: string): WierszTabeli[] {
  const szukana = fraza.trim().toLocaleLowerCase('pl');
  if (!szukana) return wiersze;
  return wiersze.filter((w) =>
    String(w.zrodlo?.wartosc ?? '')
      .toLocaleLowerCase('pl')
      .includes(szukana),
  );
}

/** Słupek wykresu udziałów procentowych wkładów (jedno źródło). */
export interface SlupekUdzialu {
  zrodlo: string;
  udzial: number;
}

/**
 * Udziały procentowe wkładów źródeł — ta sama arytmetyka prezentacji co kolumna
 * „Udział" tabeli (`naWierszeWkladow`): prąd wkładu / suma prądów × 100.
 * Suma zerowa → pusta lista (wykres nie renderuje się — bez dzielenia przez zero).
 */
export function naSlupkiUdzialow(wklady: WkladZwarciowy[]): SlupekUdzialu[] {
  const suma = wklady.reduce((acc, w) => acc + w.pradKA, 0);
  if (suma <= 0) return [];
  return wklady.map((w) => ({ zrodlo: w.zrodlo, udzial: (w.pradKA / suma) * 100 }));
}

/** Pozycja panelu szczegółu wkładu (etykieta PL + sformatowana wartość). */
export interface PozycjaSzczegoluWkladu {
  etykieta: string;
  wartosc: string;
  jednostka: string | null;
}

/**
 * Czysty adapter: szczegół maszynowy wkładu → pozycje panelu (kolejność normowa
 * IEC 60909 §6.6). Wartości null → uczciwa kreska; formaty PL jak w bilansie.
 */
export function naPozycjeSzczegoluWkladu(szczegol: SzczegolWkladu): PozycjaSzczegoluWkladu[] {
  const S = ZWARCIA_STRINGS;
  const poz = (
    etykieta: string,
    wartosc: number | null,
    format: (n: number) => string,
    jednostka: string | null,
  ): PozycjaSzczegoluWkladu => ({
    etykieta,
    wartosc: wartosc === null ? S.kreska : format(wartosc),
    jednostka,
  });
  return [
    { etykieta: S.wkladTypMaszyny, wartosc: typMaszynyPL(szczegol.typMaszyny), jednostka: null },
    poz(S.wkladIr, szczegol.irKA, fmtKA, S.jednKA),
    poz(S.wkladIkIr, szczegol.stosunekIkIr, fmtKappa, null),
    poz(S.wkladMu, szczegol.mu, fmtKappa, null),
    poz(S.wkladQ, szczegol.q, fmtKappa, null),
    poz(S.wkladIb, szczegol.ibKA, fmtKA, S.jednKA),
  ];
}

// ---------------------------------------------------------------------------
// Rozpływ prądu zwarciowego w gałęziach (karta W-C, F4) — projekcja read-only
// wiersza kanonicznego (`ShortCircuitRow.branch_contributions`), zero fizyki.
// ---------------------------------------------------------------------------

/** Kolumny tabeli rozpływu gałęziowego (deklaratywne — jednostka w nagłówku). */
export const KLUCZ_ROZPLYW = 'identyfikator';

export const KOLUMNY_ROZPLYWU: DefinicjaKolumny[] = [
  { klucz: 'galaz', etykieta: ZWARCIA_STRINGS.rozplywKolGalaz, wyrownanie: 'lewo' },
  { klucz: 'kierunek', etykieta: ZWARCIA_STRINGS.rozplywKolKierunek, wyrownanie: 'lewo' },
  {
    klucz: 'prad',
    etykieta: ZWARCIA_STRINGS.rozplywKolPrad,
    jednostka: ZWARCIA_STRINGS.jednKA,
    mono: true,
  },
  {
    klucz: 'zrodlo',
    etykieta: ZWARCIA_STRINGS.rozplywKolZrodlo,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
  // Karta #145: klucz wpisu (`branch_id::source_id`) jest kluczem wiersza, nie kolumną.
];

/**
 * Kierunek przepływu jako tekst prezentacyjny: token solvera ("from_to" /
 * "to_from") obraca parę nazw węzłów gałęzi — czysta prezentacja danych,
 * zero interpretacji. Token nieznany → para bez strzałki (uczciwy brak).
 */
export function kierunekPrzeplywuPL(
  flow: ShortCircuitBranchFlow,
  nazwa: (ref: string, zWyniku?: string | null) => string,
): string {
  const od = nazwa(flow.from_node_id, flow.from_node_name);
  const doWezla = nazwa(flow.to_node_id, flow.to_node_name);
  if (flow.direction === 'from_to') return `${od} → ${doWezla}`;
  if (flow.direction === 'to_from') return `${doWezla} → ${od}`;
  return `${od} – ${doWezla}`;
}

/**
 * Mapuje wpisy rozpływu (per źródło × gałąź, kolejność backendu: branch_id,
 * source_id) na wiersze tabeli wzorca. `dowodRef` = branch_id (2× klik →
 * dowód gałęzi). Klucz wiersza = `branch_id::source_id` (unikalny wpis).
 */
export function naWierszeRozplywu(
  flows: ShortCircuitBranchFlow[],
  nazwa: (ref: string, zWyniku?: string | null) => string,
): WierszTabeli[] {
  return flows.map((flow) => ({
    galaz: { wartosc: nazwa(flow.branch_id, flow.branch_name) },
    kierunek: { wartosc: kierunekPrzeplywuPL(flow, nazwa) },
    prad: komorkaWielkosci(flow.i_ka, fmtKA, flow.branch_id),
    // V12K-132 (pkt 7): rozróżnienie źródła wkładu PL — „sieć nadrzędna"
    // (Thevenin, source_id="THEVENIN_GRID") vs falownik/maszyna nazwana z modelu.
    zrodlo: { wartosc: zrodloRozplywuPL(flow.source_id, nazwa) },
    [KLUCZ_ROZPLYW]: { wartosc: `${flow.branch_id}::${flow.source_id}` },
  }));
}

/**
 * Rozpływ dla wiersza kanonicznego: lista wpisów (może być pusta — policzono,
 * brak wkładów falownikowych) albo `null` (starszy wynik bez pola — uczciwa
 * kreska; kontrakt addytywny).
 */
export function rozplywDlaWiersza(row: ShortCircuitRow): ShortCircuitBranchFlow[] | null {
  return row.branch_contributions ?? null;
}

// ---------------------------------------------------------------------------
// Źródła sieciowe (Z_Q) — ślad WHITE BOX wyprowadzenia impedancji zastępczej
// (CV-4.3 K6/K7, IEC 60909-0:2016 §6.2.1 eq. 6) — projekcja read-only
// `ShortCircuitResults.zrodla_sieciowe`, zero fizyki (formatowanie wyłącznie).
// ---------------------------------------------------------------------------

/** Kolumny tabeli źródeł sieciowych (deklaratywne — jednostka w nagłówku gdy stała). */
export const KLUCZ_ZRODLA_SIECIOWE = 'identyfikator';

export const KOLUMNY_ZRODEL_SIECIOWYCH: DefinicjaKolumny[] = [
  { klucz: 'zrodlo', etykieta: ZWARCIA_STRINGS.zrodlaKolZrodlo, wyrownanie: 'lewo' },
  { klucz: 'scenariusz', etykieta: ZWARCIA_STRINGS.zrodlaKolScenariusz, wyrownanie: 'lewo' },
  { klucz: 'tryb', etykieta: ZWARCIA_STRINGS.zrodlaKolTryb, wyrownanie: 'lewo' },
  // S″kQ/I″kQ niesie własną jednostkę w tekście (MVA albo kA różnią się per
  // wiersz — tryb prądowy vs mocowy), więc kolumna nie deklaruje `jednostka`.
  { klucz: 'mocPrad', etykieta: ZWARCIA_STRINGS.zrodlaKolMocPrad, mono: true },
  { klucz: 'c', etykieta: ZWARCIA_STRINGS.zrodlaKolC, mono: true },
  { klucz: 'rx', etykieta: ZWARCIA_STRINGS.zrodlaKolRx, wyrownanie: 'lewo' },
  { klucz: 'zq', etykieta: ZWARCIA_STRINGS.zrodlaKolZq, jednostka: ZWARCIA_STRINGS.jednOhm, mono: true },
  { klucz: 'wzor', etykieta: ZWARCIA_STRINGS.zrodlaKolWzor, wyrownanie: 'lewo', sortowalna: false },
  // Karta #145: klucz wpisu (`ref_id::scenariusz`) jest kluczem wiersza, nie kolumną.
];

/**
 * Mapuje ślad źródeł sieciowych (`ShortCircuitResults.zrodla_sieciowe`) na wiersze
 * tabeli wzorca (kolejność źródłowa — backend sortuje po `ref_id`). Tryb
 * `IMPEDANCJA_JAWNA` nie niesie `sk3_mva`/`ik3_ka`/`c`/`rx_ratio`/`z_q_abs_ohm`
 * (impedancja fizyczna, bez c, bez wariantu MIN) — komórki wtedy „—" (uczciwy
 * brak, nie zero fabrykowane).
 */
export function naWierszeZrodelSieciowych(
  slad: readonly ZrodloSiecioweSlad[],
  nazwa: (ref: string) => string,
): WierszTabeli[] {
  return slad.map((wpis) => {
    const mocPrad = wpis.sk3_mva !== undefined
      ? `${fmtMVA(wpis.sk3_mva)} ${ZWARCIA_STRINGS.jednMVA}`
      : wpis.ik3_ka !== undefined
        ? `${fmtKA(wpis.ik3_ka)} ${ZWARCIA_STRINGS.jednKA}`
        : ZWARCIA_STRINGS.kreska;
    const rx = wpis.rx_ratio !== undefined && wpis.rx_ratio_zrodlo !== undefined
      ? `${fmtWspolczynnik(wpis.rx_ratio)} (${rxRatioZrodloPL(wpis.rx_ratio_zrodlo)})`
      : ZWARCIA_STRINGS.kreska;
    return {
      zrodlo: { wartosc: nazwa(wpis.ref_id) },
      scenariusz: { wartosc: scenariuszZwarciaPL(wpis.scenariusz) },
      tryb: { wartosc: trybZrodlaSiecowegoPL(wpis.tryb) },
      mocPrad: { wartosc: mocPrad },
      c: { wartosc: wpis.c !== undefined ? fmtWspolczynnik(wpis.c) : ZWARCIA_STRINGS.kreska },
      rx: { wartosc: rx },
      zq: {
        wartosc: wpis.z_q_abs_ohm !== undefined ? fmtOhm(wpis.z_q_abs_ohm) : ZWARCIA_STRINGS.kreska,
        sortKey: wpis.z_q_abs_ohm ?? Number.NEGATIVE_INFINITY,
      },
      wzor: { wartosc: wpis.formula },
      [KLUCZ_ZRODLA_SIECIOWE]: { wartosc: `${wpis.ref_id}::${wpis.scenariusz}` },
    };
  });
}

// ---------------------------------------------------------------------------
// Hook read-only (spięcie ze store'em wyników zwarciowych)
// ---------------------------------------------------------------------------

/** Projekcja read-only: wynik zwarciowy + identyfikator przebiegu (dla nagłówka). */
export interface WynikZwarciowy {
  wynik: ShortCircuitResults | null;
  runId: string | null;
}

/** Czyta wynik zwarciowy ze store'u (read-only) — bez wołań API z tego pliku. */
export function useWynikZwarciowy(): WynikZwarciowy {
  const wynik = useResultsInspectorStore((s) => s.shortCircuitResults);
  const runId = useResultsInspectorStore((s) => s.selectedRunId);
  return { wynik, runId };
}
