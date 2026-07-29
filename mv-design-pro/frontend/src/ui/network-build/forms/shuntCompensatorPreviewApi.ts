/**
 * Klient końcówki solvera podglądu baterii kondensatorów SN (KOMPENSATOR_SN).
 *
 * Fizyka liczy się WYŁĄCZNIE w backendzie (WHITE BOX, pierwsze zasady:
 * B = Q/U², I_c = Q/(√3·U)) — warstwa prezentacji tylko wysyła moc/napięcie
 * znamionowe typu i prezentuje gotowe wartości. Wzorzec zgodny z
 * `cableVoltageDropApi.ts`.
 */

export interface ShuntCompensatorPreviewRequest {
  rated_mvar: number;
  rated_kv: number;
}

export interface ShuntCompensatorPreviewResponse {
  rated_mvar: number;
  rated_kv: number;
  reactive_power_var: number;
  susceptance_siemens: number;
  rated_current_a: number;
  formula_ref: string;
}

export async function fetchShuntCompensatorPreview(
  payload: ShuntCompensatorPreviewRequest,
  options: { signal?: AbortSignal } = {},
): Promise<ShuntCompensatorPreviewResponse> {
  const response = await fetch('/api/solver/shunt-compensator-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(await readSolverError(response));
  }

  return response.json() as Promise<ShuntCompensatorPreviewResponse>;
}

async function readSolverError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === 'string' && data.detail.trim().length > 0) {
      return `Solver podglądu baterii odrzucił dane: ${data.detail}`;
    }
  } catch {
    // Treść błędu jest opcjonalna.
  }
  return 'Podgląd baterii kondensatorów niedostępny — backend solvera nie odpowiedział.';
}
