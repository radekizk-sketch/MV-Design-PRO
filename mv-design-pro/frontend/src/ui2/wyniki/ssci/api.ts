/*
 * Klient API okna „Stabilność SSCI" (ui2/wyniki/ssci). Typy TS odwzorowują 1:1
 * kształt odpowiedzi końcówki werdyktu, wyznaczony z kodu źródłowego
 * (mapowanie plik:linia):
 *
 * - Werdykt stabilności SSCI — `GET /api/analysis-runs/{run_id}/results/v126/
 *   ssci_impedance/stability`:
 *   `backend/src/api/v126_academic.py::get_v126_ssci_stability`
 *   → `application/analyses/ssci_stability/service.py::build_ssci_stability_view`
 *   → `analysis/ssci_stability/serializer.py::view_to_dict` (kształt `analysis_id`/
 *   `context`/`gain_crossover_mag`/`pm_risk_deg`/`pm_unstable_deg`/`verdict`).
 *   Werdykt, metryki (max|L|, margines różnicy faz, częstotliwość winna, bliskość
 *   punktu −1, okrążenia, rezystancja ujemna), proweniencja i ślad WHITE BOX
 *   pochodzą WYŁĄCZNIE z buildera warstwy analizy — ZERO fizyki w UI.
 * - Utworzenie przebiegu SSCI — `POST /api/cases/{case_id}/runs/v126/ssci_impedance`:
 *   `v126_academic.py::run_v126_analysis` (wzór doboru przebiegu z
 *   `ui2/wyniki/akademickie`). Przebieg powstaje z committed
 *   ENM aktywnego przypadku; brak przekształtnika/DER → solver „dane niekompletne"
 *   → werdykt „brak danych" (uczciwy stan zerowy, bez fabrykacji).
 *
 * Warstwa PREZENTACJI: klient tworzy przebieg i odbiera gotowy widok werdyktu;
 * niczego nie liczy. Pola pozostają w snake_case, bo to kontrakt API. Klient
 * błędów: wariant z odczytem pola `detail` (wzór `ui2/wyniki/estymacja/api.ts`).
 */

// ---------------------------------------------------------------------------
// Wspólny kontekst przebiegu (pochodzenie wyniku) — pola opcjonalne.
// ---------------------------------------------------------------------------

export interface KontekstSsci {
  readonly project_name: string | null;
  /** Etykieta wariantu pracy, gdy znana; identyfikator jest w `case_id`. */
  readonly case_name: string | null;
  readonly case_id: string | null;
  readonly run_timestamp: string | null;
  readonly snapshot_hash: string | null;
  /** Identyfikator PRZEBIEGU (dawniej mylnie `trace_id` — patrz V12K-267). */
  readonly run_id: string | null;
}

// ---------------------------------------------------------------------------
// Proweniencja werdyktu (najgorsza jakość pól karty falownika)
// ---------------------------------------------------------------------------

/** Etykieta proweniencji (DATASHEET ≻ ESTIMATED ≻ SYSTEM_DEFAULT). */
export interface ProweniencjaSsci {
  readonly worst_quality: string;
  readonly worst_quality_label_pl: string;
  readonly is_estimated: boolean;
  readonly consumed_fields: readonly string[];
  readonly tag_pl: string;
}

// ---------------------------------------------------------------------------
// Punkty kryterium impedancyjnego (przecięcie |L|=1, bliskość −1)
// ---------------------------------------------------------------------------

/** Punkt przecięcia modułów |L|=1 (|Z_grid|=|Z_conv|) z marginesem fazy. */
export interface PunktPrzeciecia {
  readonly f_hz: number;
  readonly phase_l_deg: number;
  readonly phase_margin_deg: number;
}

/** Najbliższy punkt przebiegu L(jω) względem punktu −1. */
export interface PunktNyquista {
  readonly f_hz: number;
  readonly mag: number;
  readonly phase_deg: number;
  readonly distance_to_minus_one: number;
}

/** Krok wywodu WHITE BOX (Wzór→Dane→Podstawienie→Wynik→Jednostka). */
export interface KrokWhiteBox {
  readonly symbol: string;
  readonly formula_latex: string;
  readonly substitution_pl: string;
  readonly result_pl: string;
  readonly unit_check_pl: string;
}

// ---------------------------------------------------------------------------
// Werdykt SSCI (kryterium impedancyjne Nyquista)
// ---------------------------------------------------------------------------

/** Kody werdyktu (kontrakt backendu `analysis/ssci_stability/models.py`). */
export type WerdyktKod = 'stabilny' | 'ryzyko SSCI' | 'niestabilny' | 'brak danych';

/** Werdykt stabilności SSCI dla przekształtnika (`verdict_to_dict`). */
export interface WerdyktSsci {
  readonly converter_ref: string | null;
  readonly bus_ref: string | null;
  readonly verdict: WerdyktKod;
  readonly is_risk: boolean;
  readonly why_pl: string;
  readonly max_minor_loop_gain: number | null;
  readonly has_magnitude_crossover: boolean;
  readonly gain_crossover: PunktPrzeciecia | null;
  readonly worst_phase_margin_deg: number | null;
  readonly worst_phase_margin_f_hz: number | null;
  readonly offending_frequency_hz: number | null;
  readonly nearest_to_minus_one: PunktNyquista | null;
  readonly encirclement_count: number;
  readonly negative_resistance_present: boolean;
  readonly negative_resistance_f_hz: number | null;
  readonly provenance: ProweniencjaSsci | null;
  readonly missing_data: readonly string[];
  readonly white_box: readonly KrokWhiteBox[];
}

/** Pełna odpowiedź `GET .../ssci_impedance/stability` (`view_to_dict`). */
export interface WidokStabilnosciSsci {
  readonly analysis_id: string;
  readonly context: KontekstSsci | null;
  readonly gain_crossover_mag: number;
  readonly pm_risk_deg: number;
  readonly pm_unstable_deg: number;
  readonly verdict: WerdyktSsci;
}

// ---------------------------------------------------------------------------
// Utworzenie przebiegu (POST) — koperta `V126RunResponse`
// ---------------------------------------------------------------------------

/** Minimalny kształt odpowiedzi utworzenia przebiegu V12.6 (interesuje nas `run_id`). */
export interface PrzebiegSsci {
  readonly run_id: string;
  readonly status: string;
  readonly deterministic_hash: string;
}

// ---------------------------------------------------------------------------
// Pobieranie (GET) / tworzenie (POST) — z odczytem pola `detail` (PL)
// ---------------------------------------------------------------------------

/**
 * Segment rodzaju analizy V12.6 w ścieżce API (kontrakt backendu — `V126AnalysisType`).
 * Wydzielony do stałej, aby literał nie sąsiadował ze slashem ścieżki (czysta nazwa
 * zdolności, nie wyrażenie).
 */
const ANALIZA_SSCI = 'ssci_impedance';

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
    throw new Error(await odczytajDetal(response, komunikatZeStatusu(url, response.status, response.statusText)));
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
    throw new Error(await odczytajDetal(response, komunikatZeStatusu(url, response.status, response.statusText)));
  }
  return response.json() as Promise<T>;
}

/**
 * Tworzy przebieg SSCI (`ssci_impedance`) na committed ENM aktywnego przypadku.
 * Parametry puste — przekształtniki i pola karty falownika pochodzą z ENM
 * (bez fabrykacji). Zwraca `run_id`, którym pobiera się werdykt stabilności.
 */
export function utworzPrzebiegSsci(caseId: string): Promise<PrzebiegSsci> {
  return postJsonZDetalem<PrzebiegSsci>(
    `/api/cases/${encodeURIComponent(caseId)}/runs/v126/${ANALIZA_SSCI}`,
    { parameters: {} },
  );
}

/** Pobiera werdykt stabilności SSCI dla gotowego przebiegu `ssci_impedance`. */
export function fetchStabilnoscSsci(runId: string): Promise<WidokStabilnosciSsci> {
  return getJsonZDetalem<WidokStabilnosciSsci>(
    `/api/analysis-runs/${encodeURIComponent(runId)}/results/v126/${ANALIZA_SSCI}/stability`,
  );
}
