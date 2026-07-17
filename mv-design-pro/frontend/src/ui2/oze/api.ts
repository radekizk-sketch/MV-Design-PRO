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

// =============================================================================
// Symulacja odpowiedzi źródła na polecenie OSD — application/analyses/odpowiedz_osd.py
// (P40, D7); końcówka GET /api/oze-analysis/osd-response (api/oze_analysis_runs.py)
// =============================================================================

/**
 * Rodzaj polecenia OSD (1:1 z `_COMMANDS` w `odpowiedz_osd.py`):
 *   - `ograniczenie_p` — nastaw P = `p_limit_pct` % mocy bazowej (curtailment),
 *   - `moc_bierna` — nastaw Q = `q_mvar` [Mvar],
 *   - `cosfi` — nastaw Q z zadanego cosφ i charakteru (nad-/podwzbudny),
 *   - `lfsm_o` — odpowiedź częstotliwościowa nadczęstotliwościowa (redukcja P),
 *   - `lfsm_u` — odpowiedź częstotliwościowa podczęstotliwościowa (dopuszcza wzrost P).
 */
export type RodzajPoleceniaOsd =
  | 'ograniczenie_p'
  | 'moc_bierna'
  | 'cosfi'
  | 'lfsm_o'
  | 'lfsm_u';

/** Charakter mocy biernej dla polecenia cosφ (znak Q w `_resolve_setpoint`). */
export type CharakterMocyBiernej = 'nadwzbudny' | 'podwzbudny';

/** Kontekst przebiegu rozpływu, na którym oparto symulację odpowiedzi. */
export interface KontekstOsd {
  readonly trace_id: string;
  readonly snapshot_id: string | null;
  readonly case_name: string | null;
}

/**
 * Parametry polecenia odesłane przez backend (echo wejścia). `overridden` to ślad
 * nadpisania zależny od polecenia (np. `p_limit_pct` albo `cos_phi` + `q_charakter`
 * albo `lfsm_factor` + `frequency_hz` …) — 1:1 z `_resolve_setpoint`.
 */
export interface ParametryOsd {
  readonly source_ref: string;
  readonly source_name: string | null;
  readonly command: RodzajPoleceniaOsd;
  readonly overridden: Readonly<Record<string, number | string | null>>;
}

/**
 * Nastawy źródła przed/po + wstrzyknięcia szyny źródła z solvera (WHITE BOX).
 * Wszystkie wartości zaokrąglone do 6 miejsc po stronie backendu; `null` gdy pole
 * nie zostało policzone (np. niezbieżny bieg).
 */
export interface ZrodloOsd {
  readonly ref_id: string;
  readonly name: string | null;
  readonly bus_ref: string;
  readonly bus_name: string | null;
  readonly p_setpoint_before_mw: number | null;
  readonly p_setpoint_after_mw: number | null;
  readonly q_setpoint_before_mvar: number | null;
  readonly q_setpoint_after_mvar: number | null;
  readonly bus_p_injected_before_mw: number | null;
  readonly bus_p_injected_after_mw: number | null;
  readonly bus_q_injected_before_mvar: number | null;
  readonly bus_q_injected_after_mvar: number | null;
}

/**
 * Napięcie węzła przed/po (delta) — 1:1 z `_node_voltages`. UWAGA: odpowiedź NIE
 * niesie flagi naruszenia pasma napięciowego, więc tabela w oknie NIE stawia tagów
 * (zero oceny lokalnej — patrz karta P40 §1.2).
 */
export interface WezelOsd {
  readonly bus_ref: string;
  readonly bus_name: string | null;
  readonly v_before_pu: number | null;
  readonly v_after_pu: number | null;
  readonly v_delta_pu: number | null;
}

/** Straty sieci przed/po (delta) — 1:1 z `_losses`. */
export interface StratyOsd {
  readonly p_before_mw: number | null;
  readonly p_after_mw: number | null;
  readonly p_delta_mw: number | null;
  readonly q_before_mvar: number | null;
  readonly q_after_mvar: number | null;
  readonly q_delta_mvar: number | null;
}

/** Podsumowanie pojedynczego biegu rozpływu (WHITE BOX) — 1:1 z `_run_trace`. */
export interface BiegOsd {
  readonly converged: boolean;
  readonly iterations_count: number | null;
  readonly total_losses_p_mw: number | null;
  readonly min_voltage_pu: number | null;
  readonly max_voltage_pu: number | null;
  readonly slack_p_mw: number | null;
  readonly slack_q_mvar: number | null;
}

/** Ślad WHITE BOX symulacji (co nadpisano + podsumowania obu biegów). */
export interface SladOsd {
  readonly overridden: {
    readonly source_ref: string;
    readonly p_before_mw: number | null;
    readonly p_after_mw: number | null;
    readonly q_before_mvar: number | null;
    readonly q_after_mvar: number | null;
    readonly command: Readonly<Record<string, number | string | null>>;
  };
  readonly baseline_run: BiegOsd;
  readonly commanded_run: BiegOsd;
}

/**
 * Widok symulacji odpowiedzi źródła na polecenie OSD (odpowiedź osd-response,
 * 1:1 z `build_osd_response_view`).
 */
export interface WidokOdpowiedziOsd {
  readonly analysis: string;
  readonly context: KontekstOsd;
  readonly parameters: ParametryOsd;
  readonly input_hash: string;
  readonly source: ZrodloOsd;
  readonly nodes: readonly WezelOsd[];
  readonly losses: StratyOsd;
  readonly whitebox: SladOsd;
}

/**
 * Parametry jawnego biegu symulacji odpowiedzi OSD. `runId`, `sourceRef`, `command`
 * obowiązkowe; parametry polecenia opcjonalne i przekazywane WYŁĄCZNIE dla polecenia,
 * które ich wymaga (kontrakt `_resolve_setpoint`).
 */
export interface ZapytanieOdpowiedziOsd {
  readonly runId: string;
  readonly sourceRef: string;
  readonly command: RodzajPoleceniaOsd;
  readonly pLimitPct?: number;
  readonly qMvar?: number;
  readonly cosPhi?: number;
  readonly qCharakter?: CharakterMocyBiernej;
  readonly frequencyHz?: number;
  readonly droopPct?: number;
  readonly deadbandHz?: number;
}

/**
 * Symulacja odpowiedzi wskazanego źródła na polecenie OSD (dwa biegi rozpływu).
 * Zwraca uczciwy komunikat PL z końcówki (404 brak przebiegu, 422 zły rodzaj
 * analizy / nieznane źródło / nieznane polecenie / zły parametr).
 */
export function pobierzOdpowiedzOsd(
  zapytanie: ZapytanieOdpowiedziOsd,
): Promise<WidokOdpowiedziOsd> {
  const czesci = [
    `run_id=${encodeURIComponent(zapytanie.runId)}`,
    `source_ref=${encodeURIComponent(zapytanie.sourceRef)}`,
    `command=${encodeURIComponent(zapytanie.command)}`,
  ];
  const dodaj = (klucz: string, wartosc: number | string | undefined) => {
    if (wartosc !== undefined) czesci.push(`${klucz}=${encodeURIComponent(String(wartosc))}`);
  };
  dodaj('p_limit_pct', zapytanie.pLimitPct);
  dodaj('q_mvar', zapytanie.qMvar);
  dodaj('cos_phi', zapytanie.cosPhi);
  dodaj('q_charakter', zapytanie.qCharakter);
  dodaj('frequency_hz', zapytanie.frequencyHz);
  dodaj('droop_pct', zapytanie.droopPct);
  dodaj('deadband_hz', zapytanie.deadbandHz);
  return getJsonZDetalem<WidokOdpowiedziOsd>(`/api/oze-analysis/osd-response?${czesci.join('&')}`);
}

// =============================================================================
// Sekwencja wielokrotnych zapadów FRT z kontekstem siły sieci —
// application/analyses/frt_sekwencja.py::build_frt_sekwencja_view (P43, D9);
// końcówka GET /api/oze-analysis/frt-sequence (api/oze_analysis_runs.py:271)
// =============================================================================

/**
 * Pojedynczy zapad sekwencji (1:1 z `zapady[]` w `build_frt_sekwencja_view`).
 * `werdykt_pl` przyjmuje „w obwiedni" / „poza obwiednią" / „moduł wypadł" — pola
 * solvera FROZEN, ZERO oceny w UI. `wejscie_solvera` to ślad WHITE BOX wejścia
 * scenariusza (tryb ekspercki).
 */
export interface ZapadSekwencjiFrt {
  readonly scenario_id: string;
  readonly glebokosc_pu: number;
  readonly czas_s: number;
  readonly status: StatusSolveraFrt;
  readonly stayed_connected: boolean;
  readonly margin_to_curve_pu: number | null;
  readonly margin_to_curve_s: number | null;
  readonly p_recovery_time_s: number | null;
  readonly werdykt_pl: string;
  readonly wejscie_solvera: {
    readonly test_kind: string;
    readonly voltage_dip_depth_pu: number;
    readonly fault_duration_s: number;
    readonly target_der_ref: string;
  };
}

/**
 * Widok sekwencji zapadów FRT (odpowiedź frt-sequence, 1:1 z
 * `build_frt_sekwencja_view`). `werdykt_sekwencji_pl` = koniunkcja werdyktów
 * zapadów po stronie backendu („sekwencja w obwiedni" lub „sekwencja niezaliczona
 * — zapad N"). `kontekst_sily_sieci` to wiersz SCR/WSCR węzła z widoku siły sieci
 * (D1) lub `null` (wtedy `kontekst_sily_sieci_powod_pl` niesie uczciwy powód).
 */
export interface WidokSekwencjiFrt {
  readonly modul_der: ModulDerFrt;
  readonly operator: OperatorFrt;
  readonly status_solvera: StatusSolveraFrt;
  readonly obwiednia_profilu: ObwiedniaProfiluFrt;
  readonly liczba_zapadow: number;
  readonly zapady: readonly ZapadSekwencjiFrt[];
  readonly werdykt_sekwencji_pl: string;
  readonly zalozenia_pl: string;
  readonly kontekst_sily_sieci: WpisSilyWezla | null;
  readonly kontekst_sily_sieci_powod_pl: string | null;
  readonly input_hash: string;
}

/** Jeden zapad w edytorze sekwencji (para głębokość p.u. + czas s). */
export interface ParaZapaduFrt {
  readonly glebokoscPu: number;
  readonly czasS: number;
}

/** Parametry jawnego biegu sekwencji zapadów (moduł DER + operator + zapady). */
export interface ZapytanieSekwencjiFrt {
  readonly derRef: string;
  readonly operatorId: string;
  readonly zapady: readonly ParaZapaduFrt[];
  /** Opcjonalny kontekst siły sieci: przebieg zwarciowy + węzeł przyłączenia. */
  readonly runId?: string;
  readonly busRef?: string;
}

/**
 * Serializuj listę zapadów do parametru `sekwencja` końcówki: pary
 * `głębokość:czas` po przecinku, KROPKA dziesiętna (kontrakt API — prezentacja
 * z przecinkiem PL należy do warstwy widoku). Eksport dla testów jednostkowych.
 */
export function serializujSekwencjeFrt(zapady: readonly ParaZapaduFrt[]): string {
  return zapady.map((z) => `${z.glebokoscPu}:${z.czasS}`).join(',');
}

/**
 * Sekwencja zapadów FRT modułu DER (jawny bieg). Zwraca uczciwy komunikat PL
 * z końcówki (404 brak modułu/operatora, 422 zły format/zakres/węzeł spoza
 * wyników) — wykorzystuje wspólny czytnik `getJsonZDetalem`.
 */
export function pobierzSekwencjeFrt(zapytanie: ZapytanieSekwencjiFrt): Promise<WidokSekwencjiFrt> {
  const czesci = [
    `der_ref=${encodeURIComponent(zapytanie.derRef)}`,
    `operator_id=${encodeURIComponent(zapytanie.operatorId)}`,
    `sekwencja=${encodeURIComponent(serializujSekwencjeFrt(zapytanie.zapady))}`,
  ];
  if (zapytanie.runId !== undefined) {
    czesci.push(`run_id=${encodeURIComponent(zapytanie.runId)}`);
  }
  if (zapytanie.busRef !== undefined) {
    czesci.push(`bus_ref=${encodeURIComponent(zapytanie.busRef)}`);
  }
  return getJsonZDetalem<WidokSekwencjiFrt>(`/api/oze-analysis/frt-sequence?${czesci.join('&')}`);
}

// =============================================================================
// Ochrona przed pracą wyspową (LoM) — application/analyses/ochrona_lom.py::
// build_ochrona_lom_view (P46, D10); końcówka GET /api/oze-analysis/lom-protection
// (api/oze_analysis_runs.py:74)
// =============================================================================

/** Poziom istotności porównania/pola LoM (1:1 z `severity` backendu). */
export type IstotnoscLom = 'OK' | 'INFO' | 'WARN' | 'ERROR';

/**
 * Okno normatywne funkcji LoM z porównania. Dla większości funkcji to łańcuch PL
 * (np. „df/dt ≥ 2.0 Hz/s") lub `null`; dla koordynacji SPZ backend zwraca obiekt
 * z czasami przerwy SPZ. Typ celowo szeroki (kontrakt API — patrz `_evaluate_field`).
 */
export type OknoNormatywneLom =
  | string
  | null
  | { readonly spz_fast_time_s: number | null; readonly spz_slow_time_s: number | null };

/**
 * Pojedyncze porównanie (check) pola: obecność funkcji, okno normatywne albo
 * koordynacja SPZ. `value`/`unit` opisują nastawę; `message_pl` niesie gotowy
 * werdykt PL z backendu (ZERO oceny w UI).
 */
export interface PorownanieLom {
  readonly kind: string;
  readonly function_ansi: string | null;
  readonly function_label_pl: string | null;
  readonly severity: IstotnoscLom;
  readonly message_pl: string;
  readonly value: number | null;
  readonly unit: string | null;
  readonly window: OknoNormatywneLom;
  readonly source_pl: string | null;
}

/** Pole przyłączeniowe modułu wytwórczego z oceną ochrony LoM. */
export interface PoleLom {
  readonly bay_ref: string;
  readonly bay_name: string;
  readonly substation_ref: string | null;
  readonly bus_ref: string;
  readonly generating_module_refs: readonly string[];
  readonly status: IstotnoscLom;
  readonly checks: readonly PorownanieLom[];
}

/** Źródło normatywne funkcji LoM (okno + cytat) — słownik po function_type. */
export interface ZrodloNormatywneLom {
  readonly window_pl: string | null;
  readonly source_pl: string | null;
}

/** Podsumowanie liczbowe oceny LoM. */
export interface PodsumowanieLom {
  readonly fields_total: number;
  readonly generating_modules_total: number;
  readonly by_status: Readonly<Record<IstotnoscLom, number>>;
  readonly overall_status: IstotnoscLom;
}

/** Widok weryfikacji ochrony LoM (odpowiedź lom-protection, 1:1 z buildera). */
export interface WidokOchronyLom {
  readonly analysis: string;
  readonly context: { readonly enm_name: string; readonly enm_hash: string };
  readonly input_hash: string;
  readonly zalozenia_pl: readonly string[];
  readonly normative_sources: Readonly<Record<string, ZrodloNormatywneLom>>;
  readonly fields: readonly PoleLom[];
  readonly modules_without_field: readonly string[];
  readonly summary: PodsumowanieLom;
}

/**
 * Weryfikacja ochrony LoM modułów wytwórczych dla wskazanego przypadku (ENM).
 * Zwraca uczciwy komunikat PL z końcówki (404 gdy przypadek nie ma dokumentu ENM).
 */
export function pobierzOchronaLom(caseId: string): Promise<WidokOchronyLom> {
  return getJsonZDetalem<WidokOchronyLom>(
    `/api/oze-analysis/lom-protection?case_id=${encodeURIComponent(caseId)}`,
  );
}
