/**
 * Klient końcówki solvera doboru kabla (ΔU + prąd znamionowy).
 *
 * Fizyka liczy się WYŁĄCZNIE w backendzie (WHITE BOX) — warstwa prezentacji
 * tylko wysyła dane wejściowe i prezentuje gotowe wartości. Wzorzec zgodny
 * z `gridSourcePreviewApi.ts`.
 */

/** Kierunek przepływu mocy czynnej: odbiór (spadek) albo generacja (wzrost). */
export type FlowDirection = 'load' | 'generation';
/** Charakter mocy biernej: indukcyjny (pobór Q) albo pojemnościowy (oddawanie Q). */
export type ReactiveCharacter = 'inductive' | 'capacitive';

export interface CableVoltageDropRequest {
  current_a: number;
  length_km: number;
  r_ohm_per_km: number;
  x_ohm_per_km: number;
  cos_phi: number;
  line_voltage_v: number;
  /** Karta F-K5 (dług V12K-190): brak pola = odbiór indukcyjny (dawne zachowanie). */
  flow_direction?: FlowDirection;
  reactive_character?: ReactiveCharacter;
}

export interface CableVoltageDropResponse {
  delta_u_v: number;
  delta_u_pct: number;
  r_total_ohm: number;
  x_total_ohm: number;
  delta_u_resistive_v: number;
  delta_u_reactive_v: number;
  formula_ref: string;
  assumptions: string[];
  /** True ⇒ napięcie ROŚNIE (ΔU < 0). Znak samego ΔU bez tego jest nieczytelny. */
  is_voltage_rise?: boolean;
  flow_direction?: FlowDirection;
  reactive_character?: ReactiveCharacter;
}

export interface CableRatedCurrentRequest {
  active_power_kw: number;
  cos_phi: number;
  line_voltage_v: number;
}

export interface CableRatedCurrentResponse {
  rated_current_a: number;
  apparent_power_kva: number;
  formula_ref: string;
  assumptions: string[];
}

export async function fetchCableVoltageDrop(
  payload: CableVoltageDropRequest,
  options: { signal?: AbortSignal } = {},
): Promise<CableVoltageDropResponse> {
  const response = await fetch('/api/solver/cable-voltage-drop-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(await readSolverError(response));
  }

  return response.json() as Promise<CableVoltageDropResponse>;
}

export async function fetchCableRatedCurrent(
  payload: CableRatedCurrentRequest,
  options: { signal?: AbortSignal } = {},
): Promise<CableRatedCurrentResponse> {
  const response = await fetch('/api/solver/cable-rated-current-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(await readSolverError(response));
  }

  return response.json() as Promise<CableRatedCurrentResponse>;
}

async function readSolverError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === 'string' && data.detail.trim().length > 0) {
      return `Solver doboru kabla odrzucił dane: ${data.detail}`;
    }
  } catch {
    // Treść błędu jest opcjonalna; komunikat poniżej wystarcza operatorowi.
  }

  return 'Podgląd doboru kabla niedostępny — backend solvera nie odpowiedział.';
}
