/**
 * Klient nastaw nadprądowych I>/I>> — metoda Hoppela/IRiESD (karta W3-C1).
 *
 * Jedyna metodyka nastaw w systemie (kasacja V12K-189 — druga metodyka miała
 * ZERO producentów biegów i ZERO konsumentów frontendu). Kontrakt 1:1 z
 * `api/analysis_runs.py`:
 *   - `GET /analysis-runs/{run_id}/pakiet-dowodowy-nastaw/dostepnosc` — kandydaci
 *     (linie chronione + kolejne szyny) dla przebiegu-kotwicy,
 *   - `GET /analysis-runs/{run_id}/nastawy` — nastawy w JSON (ta sama fizyka co
 *     pakiet dowodowy ZIP),
 *   - `GET /analysis-runs/{run_id}/nastawy/dopasowanie` — dobór aparatu z
 *     katalogu analitycznego dla policzonych nastaw,
 *   - `GET /analysis-runs/{run_id}/pakiet-dowodowy-nastaw` — ZIP (dowód).
 *
 * ZERO fizyki w UI: każda liczba tej sekcji pochodzi z odpowiedzi backendu.
 */

export interface KandydatLinii {
  readonly line_id: string;
  readonly nazwa: string;
  readonly nastepne_szyny_kandydujace: readonly string[];
}

export interface DostepnoscNastaw {
  readonly run_id: string;
  readonly dostepny: boolean;
  readonly powod_pl: string | null;
  readonly linie: readonly KandydatLinii[];
}

/** Krok śladu WHITE BOX silnika (`ProtectionSettingsEngine`) — wzór/dane/wynik. */
export interface KrokSladu {
  readonly step: string;
  readonly formula?: string;
  readonly inputs?: Record<string, unknown>;
  readonly substitution?: string;
  readonly result?: Record<string, unknown>;
  readonly requirement?: string;
  readonly passed?: boolean;
}

export interface NastawaZwloczna {
  readonly i_setting_a: number;
  readonly t_setting_s: number;
  readonly i_load_max_a: number;
  readonly k_b: number;
  readonly sensitivity_ratio: number;
  readonly is_valid: boolean;
  readonly validation_notes: readonly string[];
  readonly trace: readonly KrokSladu[];
}

export interface NastawaBezzwloczna {
  readonly i_setting_a: number;
  readonly i_min_selectivity_a: number;
  readonly i_max_thermal_a: number;
  readonly i_max_sensitivity_a: number;
  readonly range_valid: boolean;
  readonly k_b: number;
  readonly k_bth: number;
  readonly is_valid: boolean;
  readonly validation_notes: readonly string[];
  readonly trace: readonly KrokSladu[];
}

export interface SprawdzenieCieplne {
  readonly i_th_dop_a: number;
  readonly j_thn: number;
  readonly cross_section_mm2: number;
  readonly t_fault_s: number;
  readonly ik_max_a: number;
  readonly is_adequate: boolean;
  readonly margin_percent: number;
  readonly trace: readonly KrokSladu[];
}

export interface AnalizaSpz {
  readonly spz_allowed: boolean;
  readonly total_fault_time_s: number;
  readonly i_th_required_a: number;
  readonly i_th_available_a: number;
  readonly blocking_recommended: boolean;
  readonly trace: readonly KrokSladu[];
}

export interface WynikNastaw {
  readonly line_id: string;
  readonly line_name: string;
  readonly delayed: NastawaZwloczna;
  readonly instantaneous: NastawaBezzwloczna;
  readonly thermal: SprawdzenieCieplne;
  readonly spz: AnalizaSpz;
  readonly overall_valid: boolean;
  readonly summary_notes: readonly string[];
}

export interface ProweniencjaNastaw {
  readonly kotwica_run_id: string;
  readonly c_max: number | null;
  readonly c_min: number;
  readonly line_id: string;
  readonly next_bus_id: string;
  readonly project_name: string;
  readonly case_name: string;
  readonly line_name: string;
  readonly run_timestamp: string;
  readonly solver_version: string;
  readonly engine_input: Record<string, number | string>;
}

export interface OdpowiedzNastaw {
  readonly wynik: WynikNastaw;
  readonly wejscie: ProweniencjaNastaw;
  readonly dostepnosc_pakietu: boolean;
}

export interface ParametryNastaw {
  readonly c_min: number;
  readonly delta_t_s: number;
  readonly k_b: number;
  readonly k_bth: number;
}

/** Wartości domyślne — te same, które przyjmuje backend, gdy parametr pominięty
 * (IRiESD ENEA Δt = 0,3 s; Hoppel k_b, k_bth). Pokazane w UI jako jawne pola,
 * nie ukryte zaszycie (§0.3.c karty). */
export const PARAMETRY_NASTAW_DOMYSLNE: ParametryNastaw = {
  c_min: 1.0,
  delta_t_s: 0.3,
  k_b: 1.2,
  k_bth: 1.1,
};

export interface VendorMapping {
  readonly vendor: string | null;
  readonly vendor_settings: Record<string, number | string | boolean>;
  readonly vendor_violations: readonly string[];
  readonly vendor_assumptions: readonly string[];
}

export interface WymaganieAparatu {
  readonly curve: string;
  readonly i_pickup_51_a: number | null;
  readonly tms_51: number | null;
  readonly t_51_s: number | null;
  readonly i_inst_50_a: number | null;
  readonly i_pickup_51n_a: number | null;
  readonly tms_51n: number | null;
  readonly i_inst_50n_a: number | null;
}

export interface DopasowanieAparatu {
  readonly status: string;
  readonly compatible: boolean;
  readonly violations: readonly string[];
  readonly mapped_settings: Record<string, number | string>;
  readonly assumptions: readonly string[];
  readonly vendor_mapping: VendorMapping;
  readonly wymaganie: WymaganieAparatu;
  readonly device_id: string;
  readonly capability: Record<string, unknown> | null;
  readonly proweniencja_nastaw: ProweniencjaNastaw;
}

/** Pozycja listy aparatów katalogu analitycznego (`GET /api/catalog/protection/device-types`). */
export interface AparatKatalogu {
  readonly id: string;
  readonly name_pl: string;
}

/** Rozpoznanie „nie ma jeszcze zakończonego zwarcia 3F w tym przypadku". */
export class BrakKotwicyNastaw extends Error {
  constructor() {
    super('Brak zakończonego przebiegu zwarcia trójfazowego dla nastaw.');
    this.name = 'BrakKotwicyNastaw';
  }
}

async function odczytajBlad(response: Response): Promise<string> {
  try {
    const dane = (await response.json()) as { detail?: unknown };
    if (typeof dane.detail === 'string' && dane.detail.trim().length > 0) {
      return dane.detail;
    }
  } catch {
    // Treść błędu jest opcjonalna — komunikat poniżej wystarcza projektantowi.
  }
  return 'Nastawy zabezpieczeń niedostępne — backend nie odpowiedział.';
}

export async function fetchDostepnoscNastaw(
  runId: string,
  options: { signal?: AbortSignal } = {},
): Promise<DostepnoscNastaw> {
  const response = await fetch(
    `/api/analysis-runs/${encodeURIComponent(runId)}/pakiet-dowodowy-nastaw/dostepnosc`,
    { signal: options.signal },
  );
  if (response.status === 404) {
    throw new BrakKotwicyNastaw();
  }
  if (!response.ok) {
    throw new Error(await odczytajBlad(response));
  }
  return (await response.json()) as DostepnoscNastaw;
}

function parametryDoQuery(
  linia: string,
  nastepnaSzyna: string,
  parametry: ParametryNastaw,
): URLSearchParams {
  return new URLSearchParams({
    linia,
    nastepna_szyna: nastepnaSzyna,
    c_min: String(parametry.c_min),
    delta_t_s: String(parametry.delta_t_s),
    k_b: String(parametry.k_b),
    k_bth: String(parametry.k_bth),
  });
}

export async function fetchNastawy(
  runId: string,
  linia: string,
  nastepnaSzyna: string,
  parametry: ParametryNastaw = PARAMETRY_NASTAW_DOMYSLNE,
  options: { signal?: AbortSignal } = {},
): Promise<OdpowiedzNastaw> {
  const query = parametryDoQuery(linia, nastepnaSzyna, parametry);
  const response = await fetch(
    `/api/analysis-runs/${encodeURIComponent(runId)}/nastawy?${query.toString()}`,
    { signal: options.signal },
  );
  if (response.status === 404) {
    throw new BrakKotwicyNastaw();
  }
  if (!response.ok) {
    throw new Error(await odczytajBlad(response));
  }
  return (await response.json()) as OdpowiedzNastaw;
}

export async function fetchDopasowanieAparatu(
  runId: string,
  deviceId: string,
  linia: string,
  nastepnaSzyna: string,
  parametry: ParametryNastaw = PARAMETRY_NASTAW_DOMYSLNE,
  options: { signal?: AbortSignal } = {},
): Promise<DopasowanieAparatu> {
  const query = parametryDoQuery(linia, nastepnaSzyna, parametry);
  query.set('device_id', deviceId);
  const response = await fetch(
    `/api/analysis-runs/${encodeURIComponent(runId)}/nastawy/dopasowanie?${query.toString()}`,
    { signal: options.signal },
  );
  if (response.status === 404) {
    throw new BrakKotwicyNastaw();
  }
  if (!response.ok) {
    throw new Error(await odczytajBlad(response));
  }
  return (await response.json()) as DopasowanieAparatu;
}

export async function fetchAparatyKatalogu(
  options: { signal?: AbortSignal } = {},
): Promise<readonly AparatKatalogu[]> {
  const response = await fetch('/api/catalog/protection/device-types', {
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(await odczytajBlad(response));
  }
  const dane: unknown = await response.json();
  if (!Array.isArray(dane)) return [];
  return dane
    .filter(
      (pozycja): pozycja is { id: unknown; name_pl: unknown } =>
        typeof pozycja === 'object' && pozycja !== null,
    )
    .map((pozycja) => {
      const rekord = pozycja as Record<string, unknown>;
      return {
        id: String(rekord.id ?? ''),
        name_pl: typeof rekord.name_pl === 'string' ? rekord.name_pl : String(rekord.id ?? '?'),
      };
    })
    .filter((pozycja) => pozycja.id.length > 0);
}

/** Adres pobrania pakietu dowodowego ZIP dla TEGO SAMEGO zapytania co JSON. */
export function adresPakietuDowodowego(
  runId: string,
  linia: string,
  nastepnaSzyna: string,
  parametry: ParametryNastaw,
): string {
  const query = parametryDoQuery(linia, nastepnaSzyna, parametry);
  return `/api/analysis-runs/${encodeURIComponent(runId)}/pakiet-dowodowy-nastaw?${query.toString()}`;
}
