/*
 * Klient API okna „Jakość wyników" (karta E8.4 / W-607). Typy TS odwzorowują
 * 1:1 kształty odpowiedzi końcówek jakości (delta D2), wyznaczone z kodu
 * źródłowego (mapowanie plik:linia):
 *
 * - Wiarygodność zwarciowa — `GET /api/quality/sanity-bounds?run_id=`:
 *   `backend/src/api/quality_analysis_runs.py:38-47` →
 *   `application/analyses/sanity_bounds.py:build_sanity_bounds_view` (kształt
 *   `analysis_id`/`context`/`items`/`summary`); pojedynczy element =
 *   `ShortCircuitSanityVerdict.to_dict` + `target_id`/`element_id`/`target_name`
 *   (`analysis/sanity_bounds/short_circuit_bounds.py:46-57`). Pole `status`
 *   niesie GOTOWY tekst polski wprost z backendu („zweryfikowany" /
 *   „poza zakresem wiarygodności" / „dane niekompletne").
 * - Walidacja energetyczna — `GET /api/quality/energy-validation?run_id=`:
 *   `quality_analysis_runs.py:50-59` →
 *   `application/analyses/energy_validation/service.py:build_energy_validation_view`
 *   → `analysis/energy_validation/serializer.py:view_to_dict` (kształt
 *   `context`/`config`/`items`/`summary`); `check_type`/`status` to kody z
 *   `analysis/energy_validation/models.py:23-35` (mapowane na polski w `strings`).
 *
 * Warstwa PREZENTACJI: wyłącznie odczyt (GET), zero fizyki, zero mutacji.
 * Wzór pobierania: `ui/ncrfg-tests/api.ts`.
 */

// ---------------------------------------------------------------------------
// Wiarygodność zwarciowa (sanity-bounds)
// ---------------------------------------------------------------------------

/** Kontekst przebiegu (pochodzenie wyniku) — pola opcjonalne. */
export interface KontekstJakosci {
  readonly project_name: string | null;
  readonly case_name: string | null;
  readonly run_timestamp: string | null;
  readonly snapshot_id: string | null;
  readonly trace_id: string | null;
}

/** Pojedyncza ocena wiarygodności Ik'' w węźle (verdict + identyfikacja węzła). */
export interface WiarygodnoscItem {
  readonly target_id: string;
  readonly element_id: string | null;
  readonly target_name: string | null;
  readonly voltage_kv: number | null;
  readonly ikss_ka: number | null;
  /** Pasmo napięciowe: „nN" / „SN" / „WN" / „NN" lub null (poza pasmami). */
  readonly voltage_band: string | null;
  readonly lower_ka: number | null;
  readonly upper_ka: number | null;
  readonly in_range: boolean;
  /** Gotowy status polski wprost z backendu (patrz `strings.STATUS_WIARYGODNOSCI`). */
  readonly status: string;
  readonly why_pl: string;
  /** True ⇒ wynik nie wchodzi do pakietu OSD bez decyzji projektanta. */
  readonly blocks_osd_package: boolean;
}

/** Podsumowanie liczbowe sekcji wiarygodności. */
export interface WiarygodnoscSummary {
  readonly credible_count: number;
  readonly out_of_range_count: number;
  readonly incomplete_count: number;
  readonly blocks_osd_package_count: number;
}

/** Pełna odpowiedź `GET /api/quality/sanity-bounds`. */
export interface WiarygodnoscResponse {
  readonly analysis_id: string;
  readonly context: KontekstJakosci | null;
  readonly items: readonly WiarygodnoscItem[];
  readonly summary: WiarygodnoscSummary;
}

// ---------------------------------------------------------------------------
// Walidacja energetyczna (energy-validation)
// ---------------------------------------------------------------------------

/** Kody rodzajów kontroli energetycznej (models.py:23-28) — mapowane na polski. */
export type RodzajKontroli =
  | 'BRANCH_LOADING'
  | 'TRANSFORMER_LOADING'
  | 'VOLTAGE_DEVIATION'
  | 'LOSS_BUDGET'
  | 'REACTIVE_BALANCE';

/** Kody statusu walidacji energetycznej (models.py:31-35) — mapowane na polski. */
export type StatusWalidacji = 'PASS' | 'WARNING' | 'FAIL' | 'NOT_COMPUTED';

/** Pozycja kontroli energetycznej. */
export interface WalidacjaItem {
  readonly check_type: RodzajKontroli;
  readonly target_id: string;
  readonly target_name: string | null;
  readonly observed_value: number | null;
  readonly unit: string;
  readonly limit_warn: number | null;
  readonly limit_fail: number | null;
  readonly margin_pct: number | null;
  readonly status: StatusWalidacji;
  readonly why_pl: string;
}

/** Konfiguracja progów walidacji (część ZAŁOŻEŃ). */
export interface WalidacjaConfig {
  readonly loading_warn_pct: number;
  readonly loading_fail_pct: number;
  readonly voltage_warn_pct: number;
  readonly voltage_fail_pct: number;
  readonly loss_warn_pct: number;
  readonly loss_fail_pct: number;
}

/** Podsumowanie liczbowe walidacji energetycznej. */
export interface WalidacjaSummary {
  readonly pass_count: number;
  readonly warning_count: number;
  readonly fail_count: number;
  readonly not_computed_count: number;
  readonly worst_item_target_id: string | null;
  readonly worst_item_margin_pct: number | null;
}

/** Pełna odpowiedź `GET /api/quality/energy-validation`. */
export interface WalidacjaResponse {
  readonly context: KontekstJakosci | null;
  readonly config: WalidacjaConfig;
  readonly items: readonly WalidacjaItem[];
  readonly summary: WalidacjaSummary;
}

// ---------------------------------------------------------------------------
// Pobieranie (GET) — wzór `ui/ncrfg-tests/api.ts`
// ---------------------------------------------------------------------------

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/** Pobiera ocenę wiarygodności Ik'' dla przebiegu zwarciowego (SC/DONE). */
export function fetchWiarygodnoscZwarciowa(runId: string): Promise<WiarygodnoscResponse> {
  return getJson<WiarygodnoscResponse>(
    `/api/quality/sanity-bounds?run_id=${encodeURIComponent(runId)}`,
  );
}

/** Pobiera walidację energetyczną dla przebiegu rozpływu (LOAD_FLOW/DONE). */
export function fetchWalidacjaEnergetyczna(runId: string): Promise<WalidacjaResponse> {
  return getJson<WalidacjaResponse>(
    `/api/quality/energy-validation?run_id=${encodeURIComponent(runId)}`,
  );
}

// ---------------------------------------------------------------------------
// Migotanie i szybkie zmiany napięcia (flicker) — P37
// ---------------------------------------------------------------------------
// `GET /api/quality/flicker?run_id=`:
//   `backend/src/api/quality_analysis_runs.py:66` →
//   `application/analyses/migotanie.py:build_migotanie_view` (kształt
//   `analysis_id`/`context`/`config`/`buses`/`summary`/`input_hash`). Wskaźniki
//   Pst/Plt/d(%), werdykt PL i ślad WHITE BOX pochodzą WYŁĄCZNIE z backendu
//   (Sk″ z solvera IEC 60909; c i Sn z katalogu) — ZERO fizyki w UI.

/** Krok wywodu WHITE BOX oceny migotania (Wzór → Podstawienie → Wynik). */
export interface KrokMigotania {
  readonly symbol: string;
  readonly formula_latex: string;
  readonly substitution_pl: string;
  readonly result_pl: string;
}

/**
 * Moduł falownikowy w węźle (wkład Pst_i lub jawne pominięcie). `included=false`
 * ⇒ moduł pominięty w sumowaniu; `info_pl` niesie uczciwy powód (np. brak
 * współczynnika emisji migotania w katalogu).
 */
export interface ModulMigotania {
  readonly gen_ref: string;
  readonly sn_mva: number | null;
  readonly flicker_c: number | null;
  readonly pst_i: number | null;
  readonly included: boolean;
  readonly info_pl: string | null;
  readonly white_box: readonly KrokMigotania[];
}

/** Ocena migotania i szybkiej zmiany napięcia w pojedynczym węźle przyłączenia. */
export interface WezelMigotania {
  readonly bus_ref: string;
  readonly nominal_kv: number | null;
  readonly sk_mva: number | null;
  readonly modules: readonly ModulMigotania[];
  readonly pst: number | null;
  readonly plt: number | null;
  readonly d_percent: number | null;
  readonly pst_limit: number;
  readonly plt_limit: number;
  readonly verdict_pl: string;
  readonly zalozenia_pl: readonly string[];
  readonly white_box: readonly KrokMigotania[];
}

/** Konfiguracja normatywna oceny migotania (część ZAŁOŻEŃ). */
export interface KonfiguracjaMigotania {
  readonly flicker_summation_exponent_m: number;
  readonly planning_level_pst: number;
  readonly planning_level_plt: number;
  readonly rvc_kmax: number;
}

/** Podsumowanie liczbowe sekcji migotania. */
export interface PodsumowanieMigotania {
  readonly total_buses: number;
  readonly assessed_count: number;
  readonly exceeded_count: number;
  readonly not_assessed_count: number;
}

/** Pełna odpowiedź `GET /api/quality/flicker`. */
export interface MigotanieResponse {
  readonly analysis_id: string;
  readonly context: KontekstJakosci | null;
  readonly config: KonfiguracjaMigotania;
  readonly buses: readonly WezelMigotania[];
  readonly summary: PodsumowanieMigotania;
  readonly input_hash: string;
}

/** Pobiera ocenę migotania (Pst/Plt) dla przebiegu zwarciowego (SC/DONE). */
export function fetchMigotanie(runId: string): Promise<MigotanieResponse> {
  return getJson<MigotanieResponse>(`/api/quality/flicker?run_id=${encodeURIComponent(runId)}`);
}

// ---------------------------------------------------------------------------
// Arc Flash (IEEE 1584-2018) — audyt V12K-059 poz. A
// ---------------------------------------------------------------------------
// `POST /api/quality/arc-flash`:
//   `backend/src/api/quality_analysis_runs.py` →
//   `application/analyses/arc_flash_view.py:build_arc_flash_view` →
//   `analysis/arc_flash` (builder IEEE 1584-2018). Ik'' i napięcie węzła z przebiegu
//   zwarciowego; parametry projektowe (odległość robocza, odstęp elektrod, czas
//   wyłączenia, konfiguracja elektrod, typ obudowy) z żądania. Energia incydentu,
//   granica łuku i kategoria PPE liczone WYŁĄCZNIE w backendzie — ZERO fizyki w UI.

/** Konfiguracja elektrod IEEE 1584-2018 (kontrakt kodów backendu). */
export type KonfiguracjaElektrod = 'VCB' | 'VCBB' | 'HCB' | 'VOA' | 'HOA';

/** Typ obudowy dla korekcji rozmiaru (kontrakt kodów backendu). */
export type TypObudowy = 'Typical' | 'Shallow';

/** Parametry projektowe analizy Arc Flash (wejścia z żądania POST). */
export interface ParametryArcFlash {
  readonly working_distance_mm: number | null;
  readonly conductor_gap_mm: number | null;
  readonly arc_time_s: number | null;
  readonly electrode_config: KonfiguracjaElektrod;
  readonly enclosure_type: TypObudowy;
}

/** Krok wywodu WHITE BOX Arc Flash. */
export interface KrokArcFlash {
  readonly symbol: string;
  readonly formula_latex: string;
  readonly substitution_pl: string;
  readonly result_pl: string;
  readonly unit_check_pl: string;
  readonly table_ref: string | null;
}

/** Wynik Arc Flash dla jednego punktu (szyny/rozdzielnicy). */
export interface WynikArcFlash {
  readonly bus_ref: string;
  /** Kod statusu (COMPUTED_IEEE_1584_OPEN_SOURCE / INCOMPLETE_INPUT / …). */
  readonly status: string;
  /** Gotowa polska etykieta statusu wprost z backendu. */
  readonly status_label_pl: string;
  readonly method: string;
  readonly electrode_config: string;
  readonly i_bf_ka: number | null;
  readonly voltage_kv: number | null;
  readonly arc_time_s: number | null;
  readonly conductor_gap_mm: number | null;
  readonly working_distance_mm: number | null;
  readonly i_arc_ka: number | null;
  readonly incident_energy_cal_cm2: number | null;
  readonly incident_energy_joule_cm2: number | null;
  readonly arc_flash_boundary_mm: number | null;
  readonly ppe_category: string | null;
  readonly ppe_table_provenance: string | null;
  readonly provenance: string | null;
  readonly provenance_caveat_pl: string | null;
  readonly why_pl: string;
  readonly missing_data: readonly string[];
  readonly white_box: readonly KrokArcFlash[];
}

/** Pełna odpowiedź `POST /api/quality/arc-flash`. */
export interface ArcFlashResponse {
  readonly analysis_id: string;
  readonly context: KontekstJakosci | null;
  readonly status: string;
  readonly status_label_pl: string;
  readonly results: readonly WynikArcFlash[];
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Request ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/** Liczy Arc Flash (IEEE 1584-2018) dla przebiegu zwarciowego + parametrów projektowych. */
export function fetchArcFlash(
  runId: string,
  parametry: ParametryArcFlash,
): Promise<ArcFlashResponse> {
  return postJson<ArcFlashResponse>('/api/quality/arc-flash', {
    run_id: runId,
    working_distance_mm: parametry.working_distance_mm,
    conductor_gap_mm: parametry.conductor_gap_mm,
    arc_time_s: parametry.arc_time_s,
    electrode_config: parametry.electrode_config,
    enclosure_type: parametry.enclosure_type,
  });
}

/** Format eksportowalnego raportu Arc Flash. */
export type FormatRaportuArcFlash = 'pdf' | 'docx';

/** Metadane nagłówka raportu (projekt/stacja/operator) — opcjonalne. */
export interface MetaRaportuArcFlash {
  readonly project_name?: string;
  readonly station_id?: string;
  readonly operator_pl?: string;
}

/**
 * Pobiera raport Arc Flash (PDF/DOCX) jako blob dla przebiegu + tych samych
 * parametrów projektowych, których użyto do policzenia widoku. Raport generuje
 * backend (`/api/quality/arc-flash/report.{pdf,docx}`) — ZERO fizyki po stronie UI.
 */
export async function pobierzRaportArcFlash(
  format: FormatRaportuArcFlash,
  runId: string,
  parametry: ParametryArcFlash,
  meta?: MetaRaportuArcFlash,
): Promise<Blob> {
  const response = await fetch(`/api/quality/arc-flash/report.${format}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      run_id: runId,
      working_distance_mm: parametry.working_distance_mm,
      conductor_gap_mm: parametry.conductor_gap_mm,
      arc_time_s: parametry.arc_time_s,
      electrode_config: parametry.electrode_config,
      enclosure_type: parametry.enclosure_type,
      project_name: meta?.project_name ?? '',
      station_id: meta?.station_id ?? '',
      operator_pl: meta?.operator_pl ?? '',
      generated_at_iso: new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Raport Arc Flash (${format}) nie powiódł się: ${response.status} ${response.statusText}`,
    );
  }
  return response.blob();
}
