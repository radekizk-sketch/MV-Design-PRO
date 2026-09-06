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
 * TODO-KARTA (ograniczenia — brak źródła w kontrakcie read-only, karta §2 „NIE zgaduj"):
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
 * 2. ŚWIEŻOŚĆ (FreshnessBadge): kontrakt wyników zwarciowych nie niesie LICZBOWEJ
 *    rewizji modelu z chwili liczenia → nagłówek nie podaje rewizji (badge
 *    pominięty, jak w oknie rozpływu). Numeryczną świeżość dostarczy karta
 *    integracyjna (spięcie ze snapshot store'em modelu).
 * 3. ZAŁOŻENIA c / czas cieplny: wartości należą do konfiguracji przebiegu
 *    (`ShortCircuitConfigRequest.c_factor`/`thermal_time_seconds`,
 *    `api/fault_scenarios.py:75-76`), nie do kontraktu wyników. `EkranZwarc`
 *    przyjmuje je PRZEZ PROPS (zarządca podaje przy scaleniu); przy braku
 *    prezentowana jest „—" z uwagą o pochodzeniu. Metoda „IEC 60909" jest stałą
 *    normatywną rodziny solvera (nie zgadywanie).
 */

import type {
  ShortCircuitBranchFlow,
  ShortCircuitResults,
  ShortCircuitRow,
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
  {
    klucz: KLUCZ_PUNKT,
    etykieta: ZWARCIA_STRINGS.kolIdentyfikator,
    mono: true,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
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
 * Adapter read-only: `ShortCircuitRow` → wiersz tabeli wzorca. `dowodRef` =
 * `element_id` (gdy jest) lub `target_id` (karta §2: ref dowodu = target/element).
 */
export function mapujWierszZwarcia(row: ShortCircuitRow): WierszTabeli {
  const dowodRef = row.element_id ?? row.target_id;
  return {
    punkt: { wartosc: row.target_name ?? ZWARCIA_STRINGS.kreska },
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
export function naWierszeZwarc(rows: ShortCircuitRow[]): WierszTabeli[] {
  return rows.map(mapujWierszZwarcia);
}

/**
 * Buduje sekcję ZAŁOŻENIA (W-602). Metoda „IEC 60909" — stała normatywna rodziny
 * solvera. Współczynnik c i czas cieplny pochodzą z konfiguracji przebiegu
 * (props); przy braku prezentowana jest „—" z uwagą o pochodzeniu (TODO-KARTA 3).
 */
export function naZalozeniaZwarc(
  wspolczynnikC?: number,
  czasCieplnyS?: number,
): WierszZalozenia[] {
  return [
    { etykieta: ZWARCIA_STRINGS.zalMetoda, wartosc: ZWARCIA_STRINGS.zalMetodaWartosc },
    {
      etykieta: ZWARCIA_STRINGS.zalWspolczynnikC,
      wartosc: wspolczynnikC !== undefined ? fmtWspolczynnik(wspolczynnikC) : ZWARCIA_STRINGS.kreska,
      uwaga: wspolczynnikC === undefined ? ZWARCIA_STRINGS.zalWartoscZKonfiguracji : undefined,
    },
    {
      etykieta: ZWARCIA_STRINGS.zalCzasCieplny,
      wartosc: czasCieplnyS !== undefined ? fmtCzas(czasCieplnyS) : ZWARCIA_STRINGS.kreska,
      jednostka: czasCieplnyS !== undefined ? ZWARCIA_STRINGS.jednS : undefined,
      uwaga: czasCieplnyS === undefined ? ZWARCIA_STRINGS.zalWartoscZKonfiguracji : undefined,
    },
  ];
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
): SlupekIkss[] {
  const odczyt = KONFIG_WYKRESU_ZWARC[wielkosc].wartosc;
  return rows.flatMap((r) => {
    const wartosc = odczyt(r);
    if (wartosc === null || wartosc === undefined) return [];
    return [{ punkt: r.target_name ?? r.target_id, ikss: wartosc }];
  });
}

/** Punkty wykresu Ik" (kontrakt 1:1 sprzed karty W-A F2 — deleguje do wielkości). */
export function naSlupkiIkss(rows: ShortCircuitRow[]): SlupekIkss[] {
  return naSlupkiWielkosci(rows, 'ikss');
}

// ---------------------------------------------------------------------------
// Wkłady zwarciowe — projekcja prezentacyjna (dane przez props, patrz TODO-KARTA 1)
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
  {
    klucz: KLUCZ_WKLAD,
    etykieta: ZWARCIA_STRINGS.wkladyKolIdentyfikator,
    mono: true,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
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
    mono: true,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
  {
    klucz: KLUCZ_ROZPLYW,
    etykieta: ZWARCIA_STRINGS.rozplywKolIdentyfikator,
    mono: true,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
];

/**
 * Kierunek przepływu jako tekst prezentacyjny: token solvera ("from_to" /
 * "to_from") obraca parę nazw węzłów gałęzi — czysta prezentacja danych,
 * zero interpretacji. Token nieznany → para bez strzałki (uczciwy brak).
 */
export function kierunekPrzeplywuPL(flow: ShortCircuitBranchFlow): string {
  if (flow.direction === 'from_to') return `${flow.from_node_name} → ${flow.to_node_name}`;
  if (flow.direction === 'to_from') return `${flow.to_node_name} → ${flow.from_node_name}`;
  return `${flow.from_node_name} – ${flow.to_node_name}`;
}

/**
 * Mapuje wpisy rozpływu (per źródło × gałąź, kolejność backendu: branch_id,
 * source_id) na wiersze tabeli wzorca. `dowodRef` = branch_id (2× klik →
 * dowód gałęzi). Klucz wiersza = `branch_id::source_id` (unikalny wpis).
 */
export function naWierszeRozplywu(flows: ShortCircuitBranchFlow[]): WierszTabeli[] {
  return flows.map((flow) => ({
    galaz: { wartosc: flow.branch_name },
    kierunek: { wartosc: kierunekPrzeplywuPL(flow) },
    prad: komorkaWielkosci(flow.i_ka, fmtKA, flow.branch_id),
    // V12K-132 (pkt 7): rozróżnienie źródła wkładu PL — „sieć nadrzędna"
    // (Thevenin, source_id="THEVENIN_GRID") vs identyfikator falownika/maszyny.
    zrodlo: { wartosc: zrodloRozplywuPL(flow.source_id) },
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
