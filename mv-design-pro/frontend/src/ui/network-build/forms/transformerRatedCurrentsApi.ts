/**
 * Klient końcówki solvera prądów znamionowych transformatora (I1/I2).
 *
 * Fizyka liczy się WYŁĄCZNIE w backendzie (WHITE BOX) — warstwa prezentacji
 * tylko wysyła dane wejściowe i prezentuje gotowe wartości. Wzorzec zgodny
 * z `cableVoltageDropApi.ts`.
 */

export interface TransformerRatedCurrentsRequest {
  rated_power_kva: number;
  primary_voltage_kv: number;
  secondary_voltage_kv: number;
}

export interface TransformerRatedCurrentsResponse {
  primary_current_a: number;
  secondary_current_a: number;
  formula_ref: string;
  assumptions: string[];
}

export async function fetchTransformerRatedCurrents(
  payload: TransformerRatedCurrentsRequest,
  options: { signal?: AbortSignal } = {},
): Promise<TransformerRatedCurrentsResponse> {
  const response = await fetch('/api/solver/transformer-rated-currents-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(await readSolverError(response));
  }

  return response.json() as Promise<TransformerRatedCurrentsResponse>;
}

async function readSolverError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === 'string' && data.detail.trim().length > 0) {
      return `Solver prądów znamionowych transformatora odrzucił dane: ${data.detail}`;
    }
  } catch {
    // Treść błędu jest opcjonalna; komunikat poniżej wystarcza operatorowi.
  }

  return 'Podgląd prądów znamionowych transformatora niedostępny — backend solvera nie odpowiedział.';
}
