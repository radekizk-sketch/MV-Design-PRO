/*
 * Cienki klient danych pulpitu OZE (ui2/oze, karta P47a). Trzy końcówki:
 *   - GET /api/oze-analysis/grid-strength?run_id=   → siła sieci (SCR/WSCR),
 *   - GET /api/oze-analysis/reactive-adequacy?run_id= → adekwatność mocy biernej,
 *   - GET /api/catalog/converter-types?kind=          → rekordy katalogu konwerterów.
 *
 * Typy odwzorowują 1:1 serializery backendu:
 *   - `backend/src/analysis/grid_strength/serializer.py` (view_to_dict),
 *   - `backend/src/analysis/reactive_adequacy/serializer.py` (view_to_dict),
 *   - `backend/src/network_model/catalog/types.py::ConverterType.to_dict`.
 * Pola pozostają w snake_case, bo to kontrakt API (jak `ui/ncrfg-tests/api.ts`).
 * Warstwa PREZENTACJI: klient tylko pobiera dane, niczego nie liczy.
 */

// =============================================================================
// Siła sieci (SCR/WSCR) — analysis/grid_strength/serializer.py
// =============================================================================

/** Krok wywodu WHITE BOX (A→B→C→D) — siła sieci. */
export interface KrokSladuSily {
  readonly symbol: string;
  readonly formula_latex: string;
  readonly substitution_pl: string;
  readonly result_pl: string;
}

/** Wpis siły sieci per węzeł przyłączenia (szyna). */
export interface WpisSilyWezla {
  readonly bus_ref: string;
  readonly nominal_kv: number | null;
  readonly s_sc_mva: number | null;
  readonly s_installed_mva: number | null;
  readonly scr: number | null;
  readonly verdict: string;
  readonly is_weak: boolean;
  readonly why_pl: string;
  readonly missing_data: readonly string[];
  readonly white_box: readonly KrokSladuSily[];
}

/** Kontekst przebiegu (projekt/scenariusz/znacznik czasu). */
export interface KontekstSily {
  readonly project_name: string | null;
  readonly case_name: string | null;
  readonly run_timestamp: string | null;
  readonly snapshot_id: string | null;
  readonly trace_id: string | null;
}

/** Podsumowanie systemowe siły sieci (WSCR). */
export interface PodsumowanieSily {
  readonly total_buses: number;
  readonly weak_bus_count: number;
  readonly not_computed_count: number;
  readonly wscr: number | null;
  readonly wscr_verdict: string;
  readonly wscr_why_pl: string;
  readonly wscr_white_box: readonly KrokSladuSily[];
}

/** Widok analizy siły sieci (odpowiedź grid-strength). */
export interface WidokSilySieci {
  readonly analysis_id: string;
  readonly context: KontekstSily | null;
  readonly weak_threshold: number;
  readonly very_weak_threshold: number;
  readonly entries: readonly WpisSilyWezla[];
  readonly summary: PodsumowanieSily;
}

// =============================================================================
// Adekwatność mocy biernej — analysis/reactive_adequacy/serializer.py
// =============================================================================

/** Krok wywodu WHITE BOX — adekwatność Q (dodatkowo weryfikacja jednostek). */
export interface KrokSladuQ {
  readonly symbol: string;
  readonly formula_latex: string;
  readonly substitution_pl: string;
  readonly result_pl: string;
  readonly unit_check_pl: string;
}

/** Rezerwa mocy biernej pojedynczego źródła. */
export interface WpisZrodlaQ {
  readonly ref: string;
  readonly bus_ref: string | null;
  readonly q_actual_mvar: number | null;
  readonly q_min_mvar: number | null;
  readonly q_max_mvar: number | null;
  readonly headroom_up_mvar: number | null;
  readonly headroom_down_mvar: number | null;
  readonly is_saturated: boolean;
  readonly at_limit_pl: string | null;
  readonly why_pl: string;
  readonly missing_data: readonly string[];
  readonly white_box: readonly KrokSladuQ[];
}

/** Węzeł z naruszeniem pasma napięciowego. */
export interface WpisNaruszeniaNapiecia {
  readonly bus_ref: string;
  readonly v_pu: number;
  readonly u_min_pu: number;
  readonly u_max_pu: number;
  readonly deviation_pu: number;
  readonly kind_pl: string;
  readonly why_pl: string;
  readonly white_box: readonly KrokSladuQ[];
}

/** Bilans bierny systemu. */
export interface BilansBierny {
  readonly q_generated_mvar: number | null;
  readonly q_absorbed_by_sources_mvar: number | null;
  readonly q_load_mvar: number | null;
  readonly net_source_q_mvar: number | null;
  readonly white_box: readonly KrokSladuQ[];
}

/** Podsumowanie adekwatności mocy biernej. */
export interface PodsumowanieQ {
  readonly total_sources: number;
  readonly saturated_source_count: number;
  readonly not_computed_source_count: number;
  readonly voltage_violation_count: number;
  readonly network_headroom_up_mvar: number | null;
  readonly network_headroom_down_mvar: number | null;
  readonly saturated_source_refs: readonly string[];
  readonly violated_bus_refs: readonly string[];
}

/** Proweniencja werdyktu (najgorsza jakość pól Q-granic). */
export interface ProweniencjaQ {
  readonly worst_quality: string;
  readonly worst_quality_label_pl: string;
  readonly is_estimated: boolean;
  readonly tag_pl: string;
}

/** Widok analizy adekwatności mocy biernej (odpowiedź reactive-adequacy). */
export interface WidokAdekwatnosciQ {
  readonly analysis_id: string;
  readonly context: KontekstSily | null;
  readonly saturation_tol_mvar: number;
  readonly default_u_min_pu: number;
  readonly default_u_max_pu: number;
  readonly verdict: string;
  readonly is_adequate: boolean;
  readonly why_pl: string;
  readonly sources: readonly WpisZrodlaQ[];
  readonly voltage_violations: readonly WpisNaruszeniaNapiecia[];
  readonly balance: BilansBierny;
  readonly summary: PodsumowanieQ;
  readonly provenance: ProweniencjaQ | null;
  readonly missing_data: readonly string[];
}

// =============================================================================
// Rekord katalogu konwerterów — ConverterType.to_dict (podzbiór używany w UI)
// =============================================================================

/**
 * Rekord katalogu konwerterów (BESS/PV/FW). Odwzorowuje istotne pola
 * `ConverterType.to_dict`; `e_kwh` to pojemność energetyczna magazynu [kWh].
 */
export interface RekordKonwertera {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly un_kv: number;
  readonly sn_mva: number;
  readonly pmax_mw: number;
  readonly qmin_mvar: number | null;
  readonly qmax_mvar: number | null;
  readonly cosphi_min: number | null;
  readonly cosphi_max: number | null;
  readonly e_kwh: number | null;
  readonly control_mode: string | null;
  /**
   * Krzywa zdolności P–Q producenta: punkty `[p_mw, q_min_mvar, q_max_mvar]`
   * rosnące po `p_mw` (1:1 z `ConverterType.to_dict` — pole emitowane WYŁĄCZNIE gdy
   * zadeklarowane). Brak pola ⇒ „brak krzywej producenta" (bieg P–Q zablokowany).
   */
  readonly pq_curve?: readonly (readonly [number, number, number])[];
}

// =============================================================================
// Klient HTTP (wzorzec `ui/ncrfg-tests/api.ts`)
// =============================================================================

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Zapytanie ${url} nie powiodło się: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/** Siła sieci (SCR/WSCR) dla wskazanego przebiegu zwarciowego. */
export function pobierzSileSieci(runId: string): Promise<WidokSilySieci> {
  return getJson<WidokSilySieci>(
    `/api/oze-analysis/grid-strength?run_id=${encodeURIComponent(runId)}`,
  );
}

/** Adekwatność mocy biernej dla wskazanego przebiegu rozpływu mocy. */
export function pobierzAdekwatnoscQ(runId: string): Promise<WidokAdekwatnosciQ> {
  return getJson<WidokAdekwatnosciQ>(
    `/api/oze-analysis/reactive-adequacy?run_id=${encodeURIComponent(runId)}`,
  );
}

/** Rekordy katalogu konwerterów (opcjonalnie filtrowane po rodzaju, np. `BESS`). */
export function pobierzKonwertery(kind?: string): Promise<RekordKonwertera[]> {
  const query = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  return getJson<RekordKonwertera[]>(`/api/catalog/converter-types${query}`);
}

// =============================================================================
// Zdolność przyłączeniowa (hosting capacity) — application/analyses/hosting_capacity.py
// =============================================================================

/**
 * Kryterium wiążące granicę przyłączeniową (odwzorowuje `binding` / `binding_criterion`
 * z `hosting_capacity.py`). `kind`:
 *   - `none` — nie osiągnięto granicy w zadanym zakresie kroków,
 *   - `non_convergence` — rozpływ przestał być zbieżny (twardy koniec pasma),
 *   - `voltage` / `loading` — naruszenie kontroli (pola szczegółowe wypełnione).
 * `check_type` = kod `EnergyCheckType` (słownik PL reużyty z okna „Jakość wyników").
 */
export interface KryteriumWiazaceZdolnosci {
  readonly kind: 'none' | 'non_convergence' | 'voltage' | 'loading';
  readonly check_type?: string;
  readonly element_id?: string;
  readonly element_name?: string | null;
  readonly observed_value?: number | null;
  readonly unit?: string;
  readonly limit_fail?: number | null;
}

/** Pojedynczy scenariusz przeglądu (moc dodana → dopuszczalność + kryterium). */
export interface ScenariuszZdolnosci {
  readonly added_power_mw: number;
  readonly converged: boolean;
  readonly acceptable: boolean;
  readonly binding: KryteriumWiazaceZdolnosci;
  /**
   * Pomiary D3a (ADDYTYWNE, pod ranking przyłączeń): straty czynne i skrajne
   * napięcia scenariusza odczytane z `result_v1.summary` rozpływu
   * (`hosting_capacity.py::_scenario_measurements`). Backend ZAWSZE zwraca te pola
   * (możliwa wartość `null` przy niezbieżności). Deklaracja opcjonalna wyłącznie dla
   * zgodności wstecznej ze starszymi fixture'ami okna „Zdolność przyłączeniowa".
   */
  readonly total_losses_p_mw?: number | null;
  readonly min_voltage_pu?: number | null;
  readonly max_voltage_pu?: number | null;
}

/** Wynik zdolności przyłączeniowej dla pojedynczego węzła-kandydata. */
export interface WezelZdolnosci {
  readonly bus_ref: string;
  readonly bus_name: string | null;
  readonly existing_generation_mw: number;
  readonly max_hosting_capacity_mw: number;
  readonly binding_criterion: KryteriumWiazaceZdolnosci;
  /**
   * Straty czynne D3a: `losses_baseline_p_mw` — scenariusz 0 MW; `losses_at_limit_p_mw`
   * — ostatni DOPUSZCZALNY scenariusz (`None`/`null`, gdy żaden scenariusz nie jest
   * dopuszczalny). Opcjonalne wyłącznie dla zgodności wstecznej (patrz wyżej).
   */
  readonly losses_baseline_p_mw?: number | null;
  readonly losses_at_limit_p_mw?: number | null;
  readonly scenarios: readonly ScenariuszZdolnosci[];
}

/** Kontekst przebiegu rozpływu, na którym oparto przegląd. */
export interface KontekstZdolnosci {
  readonly trace_id: string;
  readonly snapshot_id: string | null;
  readonly case_name: string | null;
}

/** Parametry przeglądu odesłane przez backend (echo wejścia). */
export interface ParametryZdolnosci {
  readonly step_mw: number;
  readonly max_steps: number;
  readonly candidate_bus_refs: readonly string[];
}

/** Widok zdolności przyłączeniowej (odpowiedź hosting-capacity). */
export interface WidokZdolnosci {
  readonly analysis: string;
  readonly context: KontekstZdolnosci;
  readonly parameters: ParametryZdolnosci;
  readonly input_hash: string;
  readonly nodes: readonly WezelZdolnosci[];
}

/** Parametry zapytania o zdolność przyłączeniową (jawny bieg z okna). */
export interface ZapytanieZdolnosci {
  readonly runId: string;
  /** Puste/pominięte → backend dobiera domyślnych kandydatów (węzły ze źródłami). */
  readonly candidateBusRefs?: readonly string[];
  readonly stepMw?: number;
  readonly maxSteps?: number;
}

/**
 * Zdolność przyłączeniowa dla przebiegu rozpływu. Węzły-kandydaci przekazywane
 * jako powtórzone parametry `candidate_bus_refs` (kontrakt FastAPI `list[str]`);
 * brak listy → domyślni kandydaci po stronie backendu.
 */
export function pobierzZdolnoscPrzylaczeniowa(
  zapytanie: ZapytanieZdolnosci,
): Promise<WidokZdolnosci> {
  const czesci = [`run_id=${encodeURIComponent(zapytanie.runId)}`];
  for (const ref of zapytanie.candidateBusRefs ?? []) {
    czesci.push(`candidate_bus_refs=${encodeURIComponent(ref)}`);
  }
  if (zapytanie.stepMw !== undefined) {
    czesci.push(`step_mw=${encodeURIComponent(String(zapytanie.stepMw))}`);
  }
  if (zapytanie.maxSteps !== undefined) {
    czesci.push(`max_steps=${encodeURIComponent(String(zapytanie.maxSteps))}`);
  }
  return getJson<WidokZdolnosci>(`/api/oze-analysis/hosting-capacity?${czesci.join('&')}`);
}

// =============================================================================
// Kategorie modułów NC RfG (progi klas A/B/C/D) — catalog/profiles/nc_rfg/loader.py
// =============================================================================

/**
 * Kategoria modułu wytwórczego NC RfG (art. 5) — PROGI KATALOGOWE operatora.
 * Odwzorowuje podzbiór `NcRfgModuleType.model_dump` serializowany przez
 * `GET /api/ncrfg-tests/catalog` (`api/ncrfg_ptpiree_tests.py::get_ncrfg_test_catalog`):
 * dolny/górny próg mocy [kW] i górny limit napięcia [kV]. To DANE KATALOGOWE
 * (nie ocena, nie fizyka) — służą mapowaniu słownikowemu mocy granicznej na klasę.
 */
export interface KlasaModuluNcRfg {
  readonly id: string; // "A" | "B" | "C" | "D"
  readonly threshold_kw_min: number;
  readonly threshold_kw_max: number | null;
  readonly voltage_kv_max: number | null;
  readonly description_pl: string;
}

/** Profil operatora z progami klas (podzbiór wpisu `operators[]` katalogu NC RfG). */
export interface ProfilOperatoraNcRfg {
  readonly operator_id: string;
  readonly operator_name_pl: string;
  readonly module_types: readonly KlasaModuluNcRfg[];
}

/** Odpowiedź katalogu NC RfG w zakresie potrzebnym do mapowania klas (operatorzy). */
export interface OdpowiedzKatalogNcRfg {
  readonly operators: readonly ProfilOperatoraNcRfg[];
}

/**
 * Katalog NC RfG (progi klas per operator). Reużywa tej samej końcówki, którą
 * czyta konfigurator DER (`ui/ncrfg-tests/api`); tu potrzebne są wyłącznie progi
 * `module_types` (pominięte w typie `ui/ncrfg-tests`), więc klient ma własny,
 * węższy typ 1:1 z serializacją backendu.
 */
export function pobierzKatalogKlasNcRfg(): Promise<OdpowiedzKatalogNcRfg> {
  return getJson<OdpowiedzKatalogNcRfg>('/api/ncrfg-tests/catalog');
}

// =============================================================================
// Pokrycie krzywej P–Q wymaganiem operatora — application/analyses/pq_coverage.py
// =============================================================================

/** Typ katalogowy przekształtnika w widoku pokrycia (podzbiór `converter.to_dict`). */
export interface TypKatalogowyPQ {
  readonly id: string;
  readonly nazwa: string;
  readonly kind: string;
  readonly pmax_mw: number;
  readonly sn_mva: number;
}

/** Operator OSD w widoku pokrycia (udziały Q jako ułamek Pn, np. -0,33…0,33). */
export interface OperatorPQ {
  readonly id: string;
  readonly nazwa: string;
  readonly udzial_q_min_pct_pn: number;
  readonly udzial_q_max_pct_pn: number;
}

/** Prostokątne wymaganie zakresu Q operatora (Mvar) — stałe w każdym punkcie pracy. */
export interface WymaganiePQ {
  readonly pn_mw: number;
  readonly q_wymagane_min_mvar: number;
  readonly q_wymagane_max_mvar: number;
  readonly opis: string;
}

/**
 * Wynik pokrycia w pojedynczym punkcie krzywej. Pasmo producenta
 * [`q_min_mvar`, `q_max_mvar`] musi obejmować pasmo wymagane; `pokryty`
 * i `margines_mvar` pochodzą WYŁĄCZNIE z backendu (zero ocen lokalnych).
 */
export interface PunktPokryciaPQ {
  readonly p_mw: number;
  readonly q_min_mvar: number;
  readonly q_max_mvar: number;
  readonly q_wymagane_min_mvar: number;
  readonly q_wymagane_max_mvar: number;
  readonly zapas_dolny_mvar: number;
  readonly zapas_gorny_mvar: number;
  readonly margines_mvar: number;
  readonly pokryty: boolean;
  readonly uwaga: string;
}

/** Werdykt całości pokrycia (liczba punktów pokrytych + najmniejszy margines). */
export interface WerdyktPQ {
  readonly pokryty: boolean;
  readonly liczba_punktow: number;
  readonly liczba_pokrytych: number;
  readonly min_margines_mvar: number;
  readonly opis_pl: string;
}

/** Ślad WHITE BOX porównania (wzór ASCII → dane → podstawienie per punkt → wynik). */
export interface SladPokryciaPQ {
  readonly wzor: string;
  readonly dane: {
    readonly pn_mw: number;
    readonly udzial_q_min_pct_pn: number;
    readonly udzial_q_max_pct_pn: number;
    readonly q_wymagane_min_mvar: number;
    readonly q_wymagane_max_mvar: number;
    readonly liczba_punktow_krzywej: number;
  };
  readonly podstawienie: readonly string[];
  readonly wynik: string;
}

/** Widok pokrycia krzywej P–Q (odpowiedź pq-coverage, 1:1 z `build_pq_coverage_view`). */
export interface WidokPokryciaPQ {
  readonly typ_katalogowy: TypKatalogowyPQ;
  readonly operator: OperatorPQ;
  readonly wymaganie: WymaganiePQ;
  readonly punkty: readonly PunktPokryciaPQ[];
  readonly werdykt: WerdyktPQ;
  readonly slad_whitebox: SladPokryciaPQ;
}

/** Parametry jawnego biegu pokrycia P–Q (typ katalogowy + operator). */
export interface ZapytaniePokryciaPQ {
  readonly catalogItemId: string;
  readonly operatorId: string;
}

/**
 * Pobierz odpowiedź w treści błędu (`detail`) z końcówki — dla uczciwych
 * komunikatów PL (404 brak typu/operatora, 422 „typ nie ma krzywej producenta").
 */
async function getJsonZDetalem<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    let komunikat = `Zapytanie ${url} nie powiodło się: ${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body?.detail === 'string' && body.detail.trim()) komunikat = body.detail;
    } catch {
      // Brak treści JSON — pozostaje komunikat ze statusem HTTP.
    }
    throw new Error(komunikat);
  }
  return response.json() as Promise<T>;
}

/**
 * Pokrycie krzywej P–Q producenta wymaganiem operatora NC RfG (jawny bieg).
 * Zwraca uczciwy komunikat PL z końcówki, gdy typ nie ma krzywej producenta.
 */
export function pobierzPokryciePQ(zapytanie: ZapytaniePokryciaPQ): Promise<WidokPokryciaPQ> {
  const url =
    `/api/oze-analysis/pq-coverage?catalog_item_id=${encodeURIComponent(zapytanie.catalogItemId)}`
    + `&operator_id=${encodeURIComponent(zapytanie.operatorId)}`;
  return getJsonZDetalem<WidokPokryciaPQ>(url);
}

// =============================================================================
// Obszar bezpiecznej pracy P–Q węzła — application/analyses/pq_area.py (P30, D5)
// =============================================================================

/**
 * Wierzchołek obszaru bezpiecznej pracy dla ustalonej mocy czynnej P
 * (1:1 z `pq_area.py::_vertex_for_p`). `feasible=false` ⇒ scenariusz środkowy
 * (Q = 0) już niedopuszczalny — wiersz P bez pasma pracy (`q_min/q_max` null,
 * kryterium w `binding_center`). Dla wierzchołka dopuszczalnego pasmo pracy Q to
 * `[q_min_dop_mvar, q_max_dop_mvar]`, a `binding_low`/`binding_high` opisują
 * kryterium pierwszego niedopuszczalnego scenariusza na każdym z krańców.
 * Kryteria wiążące dzielą kontrakt z hosting-capacity (ten sam serwis walidacji
 * D2), więc reużywają typu `KryteriumWiazaceZdolnosci`.
 */
export interface WierzcholekObszaruPQ {
  readonly p_mw: number;
  readonly feasible: boolean;
  readonly q_min_dop_mvar: number | null;
  readonly q_max_dop_mvar: number | null;
  readonly binding_low: KryteriumWiazaceZdolnosci;
  readonly binding_high: KryteriumWiazaceZdolnosci;
  readonly binding_center: KryteriumWiazaceZdolnosci;
  readonly runs: number;
}

/** Kontekst przebiegu rozpływu, na którym oparto siatkę P–Q. */
export interface KontekstObszaruPQ {
  readonly trace_id: string;
  readonly snapshot_id: string | null;
  readonly case_name: string | null;
}

/** Parametry siatki odesłane przez backend (echo wejścia + górne oszacowanie biegów). */
export interface ParametryObszaruPQ {
  readonly bus_ref: string;
  readonly step_p_mw: number;
  readonly step_q_mvar: number;
  readonly max_steps_p: number;
  readonly max_steps_q: number;
  readonly max_total_runs: number;
}

/** Istniejąca generacja w węźle (suma źródeł na szynie) — [MW]/[Mvar]. */
export interface GeneracjaIstniejacaPQ {
  readonly p_mw: number;
  readonly q_mvar: number;
}

/** Widok obszaru bezpiecznej pracy P–Q (odpowiedź pq-area, 1:1 z `build_pq_area_view`). */
export interface WidokObszaruPQ {
  readonly analysis: string;
  readonly context: KontekstObszaruPQ;
  readonly parameters: ParametryObszaruPQ;
  readonly input_hash: string;
  readonly bus_ref: string;
  readonly bus_name: string | null;
  readonly existing_generation: GeneracjaIstniejacaPQ;
  readonly total_runs: number;
  readonly vertices: readonly WierzcholekObszaruPQ[];
}

/** Parametry jawnego biegu obszaru P–Q (węzeł + przebieg + siatka). */
export interface ZapytanieObszaruPQ {
  readonly runId: string;
  readonly busRef: string;
  readonly stepPMw?: number;
  readonly stepQMvar?: number;
  readonly maxStepsP?: number;
  readonly maxStepsQ?: number;
}

/**
 * Obszar bezpiecznej pracy P–Q dla wskazanego węzła i przebiegu rozpływu.
 * `run_id` i `bus_ref` obowiązkowe (kontrakt FastAPI); parametry siatki opcjonalne
 * — backend dobiera wartości domyślne, odsyłane w `parameters`.
 */
export function pobierzObszarPQ(zapytanie: ZapytanieObszaruPQ): Promise<WidokObszaruPQ> {
  const czesci = [
    `run_id=${encodeURIComponent(zapytanie.runId)}`,
    `bus_ref=${encodeURIComponent(zapytanie.busRef)}`,
  ];
  if (zapytanie.stepPMw !== undefined) {
    czesci.push(`step_p_mw=${encodeURIComponent(String(zapytanie.stepPMw))}`);
  }
  if (zapytanie.stepQMvar !== undefined) {
    czesci.push(`step_q_mvar=${encodeURIComponent(String(zapytanie.stepQMvar))}`);
  }
  if (zapytanie.maxStepsP !== undefined) {
    czesci.push(`max_steps_p=${encodeURIComponent(String(zapytanie.maxStepsP))}`);
  }
  if (zapytanie.maxStepsQ !== undefined) {
    czesci.push(`max_steps_q=${encodeURIComponent(String(zapytanie.maxStepsQ))}`);
  }
  return getJsonZDetalem<WidokObszaruPQ>(`/api/oze-analysis/pq-area?${czesci.join('&')}`);
}

// =============================================================================
// Trajektorie FRT/HVRT modułu DER vs obwiednia profilu operatora —
// application/analyses/frt_trajektorie.py::build_frt_trajectories_view (D6)
// =============================================================================

/** Rodzaj testu ride-through: LVRT (zapad) lub HVRT (wzrost). */
export type RodzajTestuFrt = 'lvrt' | 'hvrt';

/**
 * Punkt obwiedni profilu operatora (czas→napięcie) — łamana krzywej dozwolonego
 * przebiegu LVRT/HVRT (1:1 z `obwiednia_profilu.punkty`, źródło:
 * `NcRfgRideThroughPoint(time_s, voltage_pu)`).
 */
export interface PunktObwiedniFrt {
  readonly czas_s: number;
  readonly napiecie_pu: number;
}

/** Obwiednia profilu operatora dla wskazanego rodzaju testu. */
export interface ObwiedniaProfiluFrt {
  readonly rodzaj: RodzajTestuFrt;
  readonly opis: string;
  readonly punkty: readonly PunktObwiedniFrt[];
}

/**
 * Punkt trajektorii modułu w czasie (1:1 z `FrtTrajectoryPoint` solvera FROZEN
 * `network_model.solvers.frt_hvrt`): napięcie, prąd bierny Iq i moc czynna P.
 */
export interface PunktTrajektoriiFrt {
  readonly czas_s: number;
  readonly napiecie_pu: number;
  readonly iq_bierny_pu: number;
  readonly p_czynna_pu: number;
}

/** Status solvera FRT/HVRT (1:1 z `FrtHvrtStatus`). */
export type StatusSolveraFrt = 'ok' | 'der_dropped' | 'no_module' | 'input_invalid';

/**
 * Wynik pojedynczego scenariusza FRT/HVRT (1:1 z `FrtScenarioResult` + werdykt PL
 * zbudowany po stronie backendu WYŁĄCZNIE z pól solvera — `werdykt_pl` przyjmuje
 * „w obwiedni" / „poza obwiednią" / „moduł wypadł"). Zero oceny po stronie UI.
 */
export interface ScenariuszFrt {
  readonly scenario_id: string;
  readonly status: StatusSolveraFrt;
  readonly stayed_connected: boolean;
  readonly margin_to_curve_s: number | null;
  readonly margin_to_curve_pu: number | null;
  readonly p_recovery_time_s: number | null;
  readonly werdykt_pl: string;
  readonly liczba_punktow_trajektorii: number;
  readonly trajektoria: readonly PunktTrajektoriiFrt[];
}

/** Moduł DER (typ katalogowy przekształtnika) w widoku trajektorii. */
export interface ModulDerFrt {
  readonly id: string;
  readonly nazwa: string;
  readonly kind: string;
  readonly pmax_mw: number;
  readonly un_kv: number;
}

/** Operator OSD w widoku trajektorii (nazwa PL na pierwszym planie). */
export interface OperatorFrt {
  readonly id: string;
  readonly nazwa: string;
}

/** Widok trajektorii FRT/HVRT (odpowiedź frt-trajectories, 1:1 z `build_frt_trajectories_view`). */
export interface WidokTrajektoriiFrt {
  readonly modul_der: ModulDerFrt;
  readonly operator: OperatorFrt;
  readonly test_kind: RodzajTestuFrt;
  readonly status_solvera: StatusSolveraFrt;
  readonly obwiednia_profilu: ObwiedniaProfiluFrt;
  readonly scenariusze: readonly ScenariuszFrt[];
}

/** Parametry jawnego biegu trajektorii FRT (moduł DER + operator + rodzaj testu). */
export interface ZapytanieTrajektoriiFrt {
  /** Referencja typu katalogowego przekształtnika (`device_catalog_ref` modułu). */
  readonly derRef: string;
  readonly operatorId: string;
  readonly testKind: RodzajTestuFrt;
}

/**
 * Trajektorie FRT/HVRT modułu DER z obwiednią profilu operatora (jawny bieg).
 * Zwraca uczciwy komunikat PL z końcówki (404 brak modułu/operatora, 422 zły
 * rodzaj testu) — wykorzystuje wspólny czytnik `getJsonZDetalem`.
 */
export function pobierzTrajektorieFrt(
  zapytanie: ZapytanieTrajektoriiFrt,
): Promise<WidokTrajektoriiFrt> {
  const url =
    `/api/oze-analysis/frt-trajectories?der_ref=${encodeURIComponent(zapytanie.derRef)}`
    + `&operator_id=${encodeURIComponent(zapytanie.operatorId)}`
    + `&test_kind=${encodeURIComponent(zapytanie.testKind)}`;
  return getJsonZDetalem<WidokTrajektoriiFrt>(url);
}
