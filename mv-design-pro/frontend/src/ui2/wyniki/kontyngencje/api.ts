/*
 * Klient API okna „Kontyngencje N-1" (karta EKRAN-N1, decyzja D8). Typy TS
 * odwzorowują 1:1 kształt odpowiedzi końcówek (mapowanie plik:funkcja):
 *
 * - `GET /api/insights/n-1-contingency/scope?run_id=`:
 *   `backend/src/api/analysis_insights.py:get_n_1_contingency_scope` →
 *   `application/analyses/kontyngencje_n1.py:build_kontyngencje_n1_zakres_view`
 *   (kształt `analysis`/`context`/`elementy`/`podsumowanie`),
 * - `GET /api/insights/n-1-contingency?run_id=[&element_refs=]`:
 *   `analysis_insights.py:get_n_1_contingency` →
 *   `kontyngencje_n1.py:build_kontyngencje_n1_view` (kształt `przypadek_bazowy`/
 *   `kontyngencje`/`ranking`/`nierozstrzygniete`/`podsumowanie`/`parameters`).
 *
 * Warstwa PREZENTACJI: wyłącznie odczyt (GET), ZERO fizyki, zero ocen lokalnych,
 * zero mutacji. Wszystkie liczby, progi, werdykty i uzasadnienia pochodzą z
 * backendu. Wzór pobierania: `ui2/wyniki/wrazliwosc/api.ts`.
 *
 * ZAKRES BIEGU (dług wydajności nazwany kartą N-1-BACKEND: 2,64 s na
 * kontyngencję). Bieg pełny zamawia się POMINIĘCIEM `element_refs`; zawężony —
 * podaniem wskazanych elementów. Pusta lista NIE jest biegiem pełnym: backend
 * odpowiada na nią 422, więc klient nie ma prawa jej wysłać (ekran blokuje
 * start przy pustym zaznaczeniu — ta sama reguła po obu stronach).
 */

/** Kontekst przebiegu (pochodzenie wyniku) — koperta `zbuduj_kontekst_widoku`. */
export interface KontekstKontyngencji {
  readonly run_id: string | null;
  readonly snapshot_hash: string | null;
  readonly case_id: string | null;
}

// ---------------------------------------------------------------------------
// Zapowiedź zakresu (koszt przed biegiem)
// ---------------------------------------------------------------------------

/** Kwalifikowany element modelu — kandydat na kontyngencję. */
export interface ElementZakresu {
  readonly element_ref: string;
  readonly element_name: string | null;
  readonly element_kind: string;
  /** Element już wyłączony w modelu bazowym — jego wyłączenie nie jest kontyngencją. */
  readonly wykluczony: boolean;
  /** Uzasadnienie wykluczenia (tylko dla wykluczonych; inaczej `null`). */
  readonly powod_pl: string | null;
}

/** Koszt biegu wyrażony LICZBĄ (kontrakt nie niesie czasu — patrz nagłówek modułu). */
export interface PodsumowanieZakresu {
  readonly kontyngencji: number;
  readonly biegow_rozplywu: number;
  readonly wykluczonych: number;
}

export interface ZakresResponse {
  readonly analysis: string;
  readonly context: KontekstKontyngencji | null;
  readonly elementy: readonly ElementZakresu[];
  readonly podsumowanie: PodsumowanieZakresu;
}

// ---------------------------------------------------------------------------
// Macierz skutków
// ---------------------------------------------------------------------------

/** Pozycja naruszenia (przeciążenie albo odchylenie napięcia) z walidacji D2. */
export interface PozycjaNaruszenia {
  readonly check_type: string;
  readonly element_ref: string | null;
  readonly element_id: string;
  readonly element_name: string | null;
  readonly wartosc: number | null;
  readonly granica_pct: number | null;
  readonly jednostka: string | null;
  readonly powod_pl: string;
  readonly slad_kryterium: unknown;
}

/** Kryterium, którego NIE policzono (brak danej) — jawnie, z powodem. */
export interface PozycjaPominieta {
  readonly check_type: string;
  readonly element_ref: string | null;
  readonly element_id: string;
  readonly element_name: string | null;
  readonly powod_pl: string;
}

/** Odbiór pozbawiony zasilania w wariancie. */
export interface OdbiorBezZasilania {
  readonly load_ref: string;
  readonly load_name: string | null;
  readonly bus_ref: string;
  readonly bus_name: string | null;
  readonly p_mw: number | null;
  readonly q_mvar: number | null;
}

/**
 * Dotkliwość = LICZNIKI per kategoria, BEZ WAG i bez liczby złożonej.
 * `null` NIE jest zerem: kontyngencja bez zbieżnego biegu nie ma policzonych
 * przeciążeń ani odchyleń napięć (backend nie udaje, że ich „nie ma").
 */
export interface Dotkliwosc {
  readonly odbiory_bez_zasilania: number | null;
  readonly moc_odciazona_mw: number | null;
  readonly przeciazenia: number | null;
  readonly naruszenia_napiecia: number | null;
  readonly kryteria_pominiete: number | null;
}

/** Metryki biegu wariantu (ślad WHITE BOX). */
export interface DaneBiegu {
  readonly zbieznosc: boolean;
  readonly iteracje: number | null;
  readonly tolerancja: number | null;
  readonly metoda: string | null;
  readonly wezly_bez_rozwiazania: number | null;
}

export interface SladKontyngencji {
  readonly element_wylaczony: {
    readonly element_ref: string;
    readonly element_kind: string;
    readonly kolekcja: string;
  };
  readonly wariant_wejscia: {
    readonly mechanizm_pl: string;
    readonly galezie_baza: number;
    readonly galezie_wariant: number;
    readonly transformatory_baza: number;
    readonly transformatory_wariant: number;
  } | null;
  readonly bieg: DaneBiegu;
  readonly wyspa_zasilana: {
    readonly wezel_bilansujacy_id: string | null;
    readonly wezel_bilansujacy_ref: string | null;
    readonly szyny_zasilane: number;
    readonly szyny_bez_zasilania: number;
  } | null;
}

/** Skutki jednego wyłączenia. `status`: zbiegl | niezbiegl | wykluczony. */
export interface Kontyngencja {
  readonly element_ref: string;
  readonly element_name: string | null;
  readonly element_kind: string;
  readonly status: string;
  readonly powod_pl: string;
  readonly przeciazenia: readonly PozycjaNaruszenia[];
  readonly naruszenia_napiecia: readonly PozycjaNaruszenia[];
  readonly kryteria_pominiete: readonly PozycjaPominieta[];
  readonly odbiory_bez_zasilania: readonly OdbiorBezZasilania[];
  readonly szyny_bez_zasilania: readonly string[];
  readonly dotkliwosc: Dotkliwosc;
  readonly slad: SladKontyngencji;
}

/** Stan N-0 (bez wyłączeń) — punkt odniesienia macierzy. */
export interface PrzypadekBazowy {
  readonly status: string;
  readonly powod_pl: string;
  readonly przeciazenia: readonly PozycjaNaruszenia[];
  readonly naruszenia_napiecia: readonly PozycjaNaruszenia[];
  readonly kryteria_pominiete: readonly PozycjaPominieta[];
  readonly odbiory_bez_zasilania: readonly OdbiorBezZasilania[];
  readonly szyny_bez_zasilania: readonly string[];
  readonly dotkliwosc: Dotkliwosc;
  readonly bieg: DaneBiegu;
}

export interface PozycjaRankingu {
  readonly pozycja: number;
  readonly element_ref: string;
  readonly element_name: string | null;
  readonly element_kind: string;
  readonly dotkliwosc: Dotkliwosc;
}

export interface PozycjaNierozstrzygnieta {
  readonly element_ref: string;
  readonly element_name: string | null;
  readonly element_kind: string;
  readonly status: string;
  readonly powod_pl: string;
}

/** Źródła kryteriów oceny — opis pochodzenia progów, językiem inżynierskim. */
export interface KryteriaOceny {
  readonly obciazenie: {
    readonly granica_warn_pct: number;
    readonly granica_fail_pct: number;
    readonly zrodlo_progu_pl: string;
    readonly zrodlo_obciazalnosci_pl: string;
  };
  readonly napiecie: {
    readonly granica_warn_pct: number;
    readonly granica_fail_pct: number;
    readonly zrodlo_progu_pl: string;
    readonly zrodlo_napiecia_pl: string;
  };
  readonly zasilanie: { readonly zrodlo_pl: string };
  readonly ocenione_kategorie: readonly string[];
  readonly poza_zakresem_pl: string;
  readonly ranking: {
    readonly definicja_pl: string;
    readonly kolejnosc_kategorii: readonly string[];
  };
}

export interface PodsumowanieMacierzy {
  readonly kontyngencji: number;
  readonly rozstrzygnietych: number;
  readonly nierozstrzygnietych: number;
  readonly z_przeciazeniem: number;
  readonly z_naruszeniem_napiecia: number;
  readonly z_odbiorami_bez_zasilania: number;
}

/** Pełna odpowiedź `GET /api/insights/n-1-contingency`. */
export interface MacierzResponse {
  readonly analysis: string;
  readonly context: KontekstKontyngencji | null;
  readonly parameters: {
    readonly element_refs: readonly string[];
    readonly kryteria: KryteriaOceny;
  };
  readonly input_hash: string;
  readonly przypadek_bazowy: PrzypadekBazowy;
  readonly kontyngencje: readonly Kontyngencja[];
  readonly ranking: readonly PozycjaRankingu[];
  readonly nierozstrzygniete: readonly PozycjaNierozstrzygnieta[];
  readonly podsumowanie: PodsumowanieMacierzy;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/** Zapowiedź zakresu: co da się policzyć i ile to kosztuje (bez biegu solvera). */
export function fetchZakresN1(runId: string): Promise<ZakresResponse> {
  return getJson<ZakresResponse>(
    `/api/insights/n-1-contingency/scope?run_id=${encodeURIComponent(runId)}`,
  );
}

/**
 * Macierz skutków N-1. `elementRefs === null` = bieg PEŁNY (parametr pominięty).
 *
 * Pusta tablica jest ODRZUCANA tutaj, a nie wysyłana: backend odpowiada na nią
 * 422 („Lista elementów do enumeracji jest pusta"), bo „nie licz nic" nie jest
 * synonimem „policz wszystko". Zamiana pustego zakresu na bieg pełny byłaby
 * najdroższym możliwym biegiem zamówionym wbrew inżynierowi.
 */
export function fetchMacierzN1(
  runId: string,
  elementRefs: readonly string[] | null,
): Promise<MacierzResponse> {
  if (elementRefs !== null && elementRefs.length === 0) {
    return Promise.reject(new Error('Pusty zakres enumeracji — wskaż elementy albo policz komplet.'));
  }
  const parametry = new URLSearchParams({ run_id: runId });
  for (const ref of elementRefs ?? []) parametry.append('element_refs', ref);
  return getJson<MacierzResponse>(`/api/insights/n-1-contingency?${parametry.toString()}`);
}
