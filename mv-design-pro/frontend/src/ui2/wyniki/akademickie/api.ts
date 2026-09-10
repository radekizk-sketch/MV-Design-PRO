/*
 * Klient API okna „Analizy akademickie V12.6" (ui2/wyniki/akademickie).
 *
 * Typy TS odwzorowują 1:1 kształt SIEDMIU rodzin końcówek routera
 * `backend/src/api/v126_academic.py` (prefiks `/api`, tag `v12.6-academic`):
 *
 *  1. `POST /api/cases/{case_id}/runs/v126/{analysis_type}` → `V126RunResponse`
 *     (`v126_academic.py::run_v126_analysis`) — utworzenie przebiegu z committed ENM
 *     aktywnego przypadku; 422 gdy przypadek nie ma węzłów (draft UI nie liczy).
 *  2. `GET  /api/analysis-runs/{run_id}/results/v126/{analysis_type}` → wynik
 *     (`::get_v126_result`) — koperta `AcademicAnalysisResultV1` solvera.
 *  3. `GET  …/{analysis_type}/trace` → PEŁNY ślad WHITE BOX (`::get_v126_trace`,
 *     kontrakt `AcademicWhiteBoxTraceV1`) — liczba kroków wynika Z DANYCH.
 *  4. `GET  …/ssci_impedance/stability` → werdykt SSCI — kontrakt OBSŁUGIWANY
 *     PRZEZ ODRĘBNE OKNO `ui2/wyniki/ssci` (inny kształt odpowiedzi, własny model
 *     prezentacji); to okno go NIE duplikuje, tylko kieruje do zakładki „SSCI".
 *  5. `GET  …/{analysis_type}/proof` → pakiet dowodowy `AcademicProofPackV1`
 *     (`application/v126_artifacts.py::build_v126_proof_artifact`).
 *  6. `GET  …/{analysis_type}/report` → raport `AcademicReportV1`
 *     (`::build_v126_report_artifact`) — liczba sekcji wynika Z DANYCH.
 *  7. `GET  /api/catalog/v126/{namespace}` → katalog danych odniesienia
 *     (`::get_v126_catalog`, 5 przestrzeni nazw). `analysis-types` jest JEDYNYM
 *     źródłem listy dostępnych rodzajów — front nie trzyma własnej kopii kontraktu.
 *
 * Warstwa PREZENTACJI: klient tworzy przebieg i odbiera gotowe artefakty; niczego
 * nie liczy i niczego nie uzupełnia. Pola pozostają w snake_case, bo to kontrakt API.
 * Klient błędów: wariant z odczytem pola `detail` (wzór `ui2/wyniki/ssci/api.ts`).
 */

// ---------------------------------------------------------------------------
// Rodzaj analizy — kody kontraktu backendu (`V126AnalysisType`)
// ---------------------------------------------------------------------------

/**
 * Kod rodzaju analizy V12.6 (segment ścieżki API). Zbiór ZAMKNIĘTY przez kontrakt
 * backendu `solver_input/v126_contracts.py::V126AnalysisType`; parytet obu list
 * pilnuje test CI `backend/tests/ci/test_v126_rodzaje_parytet.py` (dodanie rodzaju
 * w backendzie bez etykiety PL tutaj = czerwony test, nie cichy brak w UI).
 */
export type RodzajAnalizy =
  | 'power_quality_harmonics'
  | 'ssci_impedance'
  | 'voltage_stability'
  | 'reliability_contingency'
  | 'earthing_safety'
  | 'insulation_coordination'
  | 'earth_fault_detection'
  | 'transient_trv'
  | 'motor_starting'
  | 'hosting_capacity'
  | 'opf_loss_lcc'
  | 'benchmark_validation'
  | 'uncertainty_sensitivity'
  | 'neutral_earthing_design';

// ---------------------------------------------------------------------------
// Koperty odpowiedzi
// ---------------------------------------------------------------------------

/** Odpowiedź utworzenia przebiegu (`V126RunResponse`). */
export interface PrzebiegAkademicki {
  readonly run_id: string;
  readonly case_id: string;
  readonly analysis_type: RodzajAnalizy;
  readonly status: string;
  readonly result_url: string;
  readonly trace_url: string;
  readonly proof_url: string;
  readonly report_url: string;
  readonly deterministic_hash: string;
}

/** Koperta wyniku solvera (`AcademicAnalysisResultV1`). */
export interface KopertaWyniku {
  readonly contract: string;
  readonly analysis_type: RodzajAnalizy;
  readonly solver_version: string;
  readonly input_hash: string;
  readonly result: Record<string, unknown>;
  readonly white_box_trace: readonly Record<string, unknown>[];
  readonly deterministic_hash: string;
}

/** Jedno źródło pominięte w wejściu V12.6 (karta katalogowa niekompletna). */
export interface ZrodloPominiete {
  readonly ref: string;
  readonly kod: string;
  readonly powod: string;
}

/** Proweniencja widma harmonicznego źródła, które DO wejścia trafiło. */
export interface ProweniencjaZrodlaWidma {
  readonly ref: string;
  readonly proweniencja: string;
}

/** Odpowiedź `GET …/results/v126/{analysis_type}` (`get_v126_result`). */
export interface OdpowiedzWyniku {
  readonly run_id: string;
  readonly case_id: string;
  readonly analysis_type: RodzajAnalizy;
  readonly status: string;
  readonly created_at: string;
  readonly result: KopertaWyniku;
  readonly proof_ref: string;
  readonly report_ref: string;
  /**
   * Karta W2-C (zero fabrykacji wejścia V12.6): przekształtniki PV/BESS/wiatrowe
   * pominięte w wejściu solvera (brak karty katalogowej albo brak jej widma
   * harmonicznego) — pole ADDYTYWNE, obecne tylko dla `power_quality_harmonics`/
   * `ssci_impedance` i tylko gdy jest CO pominąć.
   */
  readonly pominiete_zrodla?: readonly ZrodloPominiete[];
  /** Proweniencja widma (KATALOG/RECZNE) źródeł, które DO wejścia trafiły. */
  readonly zrodla_widma?: readonly ProweniencjaZrodlaWidma[];
}

/** Krok śladu WHITE BOX (`TraceBuilder.add`). */
export interface KrokSladu {
  readonly step: number;
  readonly key: string;
  readonly formula: string;
  readonly data: Record<string, unknown>;
  readonly substitution: string;
  readonly result: Record<string, unknown>;
  /**
   * Wynik kroku jako liczba Z JEDNOSTKĄ, po polsku (V126-JEZYK). Pole dodane
   * w solverze obok maszynowego `result`, bo ekran pokazywał w kolumnie „Wynik"
   * surowy zapis `{"smallest_eigenvalue":0.998667}` (ocena właściciela 0/10).
   * Opcjonalne w typie, bo przebiegi policzone przed wersją solvera
   * `v126-academic-whitebox-1.1` go nie mają — okno pokazuje wtedy kreskę,
   * a nie zrzut słownika.
   */
  readonly result_pl?: string | null;
  readonly unit_check: string;
  readonly proof_ref: string;
  readonly proof_status: string;
  readonly reporting_status: string;
}

/** Odpowiedź `GET …/trace` (`AcademicWhiteBoxTraceV1`). */
export interface OdpowiedzSladu {
  readonly run_id: string;
  readonly analysis_type: RodzajAnalizy;
  readonly trace_version: string;
  readonly deterministic_hash: string;
  readonly steps: readonly KrokSladu[];
}

/** Krok pakietu dowodowego (`build_v126_proof_artifact`). */
export interface KrokDowodu {
  readonly ordinal: number;
  readonly proof_ref: string;
  readonly formula: string | null;
  readonly data: Record<string, unknown>;
  readonly substitution: string | null;
  readonly result: Record<string, unknown>;
  /** Polska postać wyniku kroku — patrz `KrokSladu.result_pl`. */
  readonly result_pl?: string | null;
  readonly unit_check: string | null;
  readonly proof_status: string;
}

/** Odpowiedź `GET …/proof` (`AcademicProofPackV1`). */
export interface PakietDowodu {
  readonly contract: string;
  readonly proof_id: string;
  readonly run_id: string;
  readonly case_id: string;
  readonly analysis_type: RodzajAnalizy;
  readonly source_result_hash: string;
  readonly trace_step_count: number;
  readonly steps: readonly KrokDowodu[];
  readonly proof_hash: string;
}

/** Metryka sekcji raportu. */
export interface MetrykaRaportu {
  readonly label: string;
  readonly value: unknown;
}

/** Sekcja raportu. */
export interface SekcjaRaportu {
  readonly section_id: string;
  readonly title: string;
  readonly metrics: readonly MetrykaRaportu[];
}

/** Odpowiedź `GET …/report` (`AcademicReportV1`). */
export interface RaportAnalizy {
  readonly contract: string;
  readonly report_id: string;
  readonly run_id: string;
  readonly case_id: string;
  readonly analysis_type: RodzajAnalizy;
  readonly source_result_hash: string;
  readonly source_proof_hash: string;
  readonly export_policy: string;
  readonly sections: readonly SekcjaRaportu[];
  readonly report_hash: string;
}

/** Odpowiedź `GET /api/catalog/v126/{namespace}` (`get_v126_catalog`). */
export interface OdpowiedzKatalogu {
  readonly namespace: string;
  readonly items: unknown;
}

// ---------------------------------------------------------------------------
// Pobieranie (GET) / tworzenie (POST) — z odczytem pola `detail` (PL)
// ---------------------------------------------------------------------------

function komunikatZeStatusu(url: string, status: number, statusText: string): string {
  return `Zapytanie ${url} nie powiodło się: ${status} ${statusText}`;
}

async function odczytajDetal(response: Response, domyslny: string): Promise<string> {
  try {
    const tresc = (await response.json()) as { detail?: unknown };
    if (typeof tresc?.detail === 'string' && tresc.detail.trim()) return tresc.detail;
  } catch {
    // Brak treści JSON — pozostaje komunikat ze statusem HTTP.
  }
  return domyslny;
}

async function getJsonZDetalem<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      await odczytajDetal(response, komunikatZeStatusu(url, response.status, response.statusText)),
    );
  }
  return response.json() as Promise<T>;
}

async function postJsonZDetalem<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      await odczytajDetal(response, komunikatZeStatusu(url, response.status, response.statusText)),
    );
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Siedem rodzin końcówek
// ---------------------------------------------------------------------------

const BAZA_PRZEBIEGU = '/api/analysis-runs';

function adresWyniku(runId: string, rodzaj: RodzajAnalizy, sufiks = ''): string {
  return `${BAZA_PRZEBIEGU}/${encodeURIComponent(runId)}/results/v126/${rodzaj}${sufiks}`;
}

/**
 * Tworzy przebieg V12.6 wybranego rodzaju na committed ENM aktywnego przypadku.
 * `parametry` trafiają 1:1 do `V126RunRequest.parameters` — pole nieprzekazane
 * oznacza udokumentowaną wartość domyślną solvera (UI niczego nie podstawia).
 */
export function utworzPrzebieg(
  caseId: string,
  rodzaj: RodzajAnalizy,
  parametry: Record<string, unknown>,
): Promise<PrzebiegAkademicki> {
  return postJsonZDetalem<PrzebiegAkademicki>(
    `/api/cases/${encodeURIComponent(caseId)}/runs/v126/${rodzaj}`,
    { parameters: parametry },
  );
}

/** Pobiera wynik przebiegu (koperta solvera). */
export function pobierzWynik(runId: string, rodzaj: RodzajAnalizy): Promise<OdpowiedzWyniku> {
  return getJsonZDetalem<OdpowiedzWyniku>(adresWyniku(runId, rodzaj));
}

/** Pobiera PEŁNY ślad WHITE BOX przebiegu (bez limitu po stronie klienta). */
export function pobierzSlad(runId: string, rodzaj: RodzajAnalizy): Promise<OdpowiedzSladu> {
  return getJsonZDetalem<OdpowiedzSladu>(adresWyniku(runId, rodzaj, '/trace'));
}

/** Pobiera pakiet dowodowy przebiegu. */
export function pobierzDowod(runId: string, rodzaj: RodzajAnalizy): Promise<PakietDowodu> {
  return getJsonZDetalem<PakietDowodu>(adresWyniku(runId, rodzaj, '/proof'));
}

/** Pobiera raport przebiegu (wszystkie sekcje kontraktu). */
export function pobierzRaport(runId: string, rodzaj: RodzajAnalizy): Promise<RaportAnalizy> {
  return getJsonZDetalem<RaportAnalizy>(adresWyniku(runId, rodzaj, '/report'));
}

/** Pobiera katalog danych odniesienia V12.6 dla wskazanej przestrzeni nazw. */
export function pobierzKatalog(namespace: string): Promise<OdpowiedzKatalogu> {
  return getJsonZDetalem<OdpowiedzKatalogu>(`/api/catalog/v126/${encodeURIComponent(namespace)}`);
}

/**
 * Pobiera listę dostępnych rodzajów analiz Z BACKENDU (`catalog/v126/analysis-types`).
 * Jedyne źródło listy — front nie trzyma własnej kopii zbioru rodzajów, więc rodzaj
 * dodany w kontrakcie backendu pojawia się w oknie bez zmiany kodu ekranu.
 */
export async function pobierzRodzajeAnaliz(): Promise<readonly string[]> {
  const odpowiedz = await pobierzKatalog('analysis-types');
  if (!Array.isArray(odpowiedz.items)) return [];
  return odpowiedz.items.filter((item): item is string => typeof item === 'string');
}

// ---------------------------------------------------------------------------
// Karta B-02: katalog analiz ze ZNACZENIEM inżynierskim i gotowość analizy
// ---------------------------------------------------------------------------

/** Wielkość główna analizy (`WielkoscGlowna.to_dict`). */
export interface WielkoscKatalogu {
  readonly symbol: string;
  readonly nazwa_pl: string;
  readonly jednostka: string;
}

/**
 * Kryterium stosowane PRZEZ SOLVER (`PodstawaOceny.to_dict`): wielkość, symbol,
 * jednostka, warunek, wartość graniczna i ŹRÓDŁO. Zasada normowa (prompt
 * właściciela §8): pokazanie normy wymaga kompletu tych pól — inaczej karta
 * niesie `bez_podstawy_pl` i ekran mówi „brak podstaw do oceny".
 */
export interface PodstawaOceny {
  readonly wielkosc_pl: string;
  readonly symbol: string;
  readonly jednostka: string;
  readonly warunek_pl: string;
  readonly wartosc_graniczna: number | string;
  readonly zrodlo_pl: string;
}

/** Dana czytana z modelu sieci (`DanaZModelu.to_dict`) — opis, nie wartość. */
export interface DanaZModeluKatalogu {
  readonly nazwa_pl: string;
  readonly elementy_pl: string;
}

/** Dana, której model nie niesie — podaje ją projektant (`ParametrUzytkownika`). */
export interface ParametrUzytkownikaKatalogu {
  readonly klucz: string;
  readonly nazwa_pl: string;
  readonly jednostka: string;
  readonly wymagane: boolean;
  readonly opis_pl: string;
}

/** Parametr metody z udokumentowaną wartością domyślną solvera (`DomyslnaSolvera`). */
export interface DomyslnaSolveraKatalogu {
  readonly klucz: string;
  readonly nazwa_pl: string;
  readonly wartosc: number | string;
  readonly jednostka: string;
  readonly uzasadnienie_pl: string;
}

/**
 * Karta katalogu analiz (`KartaAnalizy.to_dict`, `GET /api/catalog/v126/analysis-catalog`).
 * JEDYNE źródło nazw, grup, pytań inżynierskich, zakresów i podstaw oceny —
 * okno nie trzyma własnej kopii katalogu (karta B-02 §0.1).
 */
export interface KartaKatalogu {
  readonly kod: string;
  readonly nazwa_pl: string;
  readonly grupa: { readonly kod: string; readonly nazwa_pl: string };
  readonly pytanie_pl: string;
  readonly zakres_pl: string;
  readonly wielkosci_glowne: readonly WielkoscKatalogu[];
  readonly podstawa_oceny: readonly PodstawaOceny[];
  readonly bez_podstawy_pl: string;
  readonly dane: {
    readonly z_modelu: readonly DanaZModeluKatalogu[];
    readonly od_uzytkownika: readonly ParametrUzytkownikaKatalogu[];
    readonly domyslne_solvera: readonly DomyslnaSolveraKatalogu[];
  };
  readonly prezentowany: boolean;
  readonly powod_wycofania_pl: string | null;
  readonly katalog_odniesienia: string | null;
  readonly uwagi_metody_pl: readonly string[];
}

/** Pobiera katalog kart analiz Z BACKENDU (kolejność = kolejność grup i kart kontraktu). */
export async function pobierzKatalogAnaliz(): Promise<readonly KartaKatalogu[]> {
  const odpowiedz = await pobierzKatalog('analysis-catalog');
  if (!Array.isArray(odpowiedz.items)) return [];
  return odpowiedz.items as readonly KartaKatalogu[];
}

/** Stan gotowości analizy (`v126_gotowosc.GOTOWOSC_*`). */
export type StanGotowosci = 'POTWIERDZONA' | 'NIEPOTWIERDZONA' | 'WYCOFANA';

/** Warunek gotowości (`Warunek.to_dict`): spełniony/niespełniony, elementy modelu, klucz parametru. */
export interface WarunekGotowosci {
  readonly kod: string;
  readonly opis_pl: string;
  readonly spelniony: boolean;
  readonly elementy: readonly string[];
  readonly blokujacy: boolean;
  readonly klucz_parametru: string | null;
}

/** Dana faktycznie odczytana z modelu (`DanaZModeluWartosc.to_dict`). */
export interface DanaZModeluWartosc {
  readonly nazwa_pl: string;
  readonly wartosc_pl: string;
  readonly elementy: readonly string[];
}

/** Wartość parametru wyprowadzona z modelu, z nazwanym źródłem (`Proponowana.to_dict`). */
export interface ProponowanaWartosc {
  readonly wartosc: unknown;
  readonly zrodlo_pl: string;
}

/** Gotowość jednej analizy (`GotowoscAnalizy.to_dict`) — ta sama funkcja, która odmawia 422. */
export interface GotowoscAnalizy {
  readonly kod: string;
  readonly gotowosc: StanGotowosci;
  readonly warunki: readonly WarunekGotowosci[];
  readonly braki: readonly WarunekGotowosci[];
  readonly uwagi: readonly WarunekGotowosci[];
  readonly dane_z_modelu: readonly DanaZModeluWartosc[];
  readonly proponowane: Readonly<Record<string, ProponowanaWartosc>>;
  readonly powod_wycofania_pl: string | null;
}

/** Przedmiot analiz — co opisuje zatwierdzony model przypadku (`przedmiot_modelu`). */
export interface PrzedmiotAnalizy {
  readonly liczba_szyn: number;
  readonly liczba_galezi: number;
  readonly liczba_transformatorow: number;
  readonly liczba_zrodel_przeksztaltnikowych: number;
  readonly liczba_generatorow: number;
  readonly poziomy_napiec_kv: readonly number[];
  readonly czestotliwosc_hz: number | null;
  readonly punkt_przylaczenia: { readonly ref: string; readonly nazwa: string; readonly zrodlo: string } | null;
  readonly nazwa_modelu: string;
  readonly rewizja: number;
}

/** Odpowiedź `GET /api/cases/{case_id}/v126/gotowosc` (`get_v126_gotowosc`). */
export interface OdpowiedzGotowosci {
  readonly case_id: string;
  readonly model_hash: string | null;
  readonly przedmiot: PrzedmiotAnalizy;
  readonly analizy: readonly GotowoscAnalizy[];
}

/**
 * Pobiera gotowość analiz na zatwierdzonym modelu przypadku. Bez `rodzaj` —
 * komplet rodzajów (katalog kart); z nim — jedna pozycja oceniona DOKŁADNIE
 * dla parametrów, które trafią do uruchomienia (predykaty parami z bramką 422).
 */
export function pobierzGotowosc(
  caseId: string,
  rodzaj?: RodzajAnalizy | null,
  parametry?: Record<string, unknown>,
): Promise<OdpowiedzGotowosci> {
  const zapytanie = new URLSearchParams();
  if (rodzaj) zapytanie.set('analysis_type', rodzaj);
  if (parametry && Object.keys(parametry).length > 0) {
    zapytanie.set('parametry', JSON.stringify(parametry));
  }
  const sufiks = zapytanie.toString();
  return getJsonZDetalem<OdpowiedzGotowosci>(
    `/api/cases/${encodeURIComponent(caseId)}/v126/gotowosc${sufiks ? `?${sufiks}` : ''}`,
  );
}
