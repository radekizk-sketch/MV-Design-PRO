export interface ComplexOhmResponse {
  r_ohm: number;
  x_ohm: number;
}

export interface GridSourcePreviewRequest {
  voltage_kv: number;
  short_circuit_mode: 'SHORT_CIRCUIT_POWER' | 'IMPEDANCE';
  sk3_mva: number | null;
  rx_ratio: number | null;
  r_ohm: number | null;
  x_ohm: number | null;
  /**
   * Dane scenariusza MIN (CV-4.3 K7) — addytywne, TYLKO w trybie mocy zwarciowej
   * (tryb impedancyjny nie ma wariantu MIN — backend odrzuca 422). Puste = brak
   * danych OSD dla scenariusza MIN (zero fabrykacji, nie wysyłaj zer).
   */
  sk3_min_mva?: number | null;
  ik3_min_ka?: number | null;
  rx_ratio_min?: number | null;
  zero_sequence_enabled: boolean;
  r0_ohm: number | null;
  x0_ohm: number | null;
  z0_z1_ratio: number | null;
  tk_s: number;
  tb_s: number;
}

/**
 * Blok scenariusza MIN podglądu (CV-4.3 K7) — te same wielkości co dla MAX,
 * policzone zamrożonym solverem podglądu z S''_kQmin (albo S''_kQmin wyprowadzone
 * z I''_kQmin) i R/X ze scenariusza MIN (albo MAX, albo IEC 0,1 — `rx_ratio_zrodlo`
 * mówi które). `null` na poziomie `GridSourcePreviewResponse.scenariusz_min` = brak
 * danych MIN w żądaniu (nie liczono).
 */
export interface GridSourcePreviewMinResponse {
  sk_mva: number;
  ik3_ka: number;
  ik1_ka: number | null;
  ip_ka: number;
  ith_ka: number;
  kappa: number;
  z1_ohm: ComplexOhmResponse;
  z0_ohm: ComplexOhmResponse | null;
  tryb_danych: 'MOC_ZWARCIOWA' | 'PRAD_ZWARCIOWY';
  rx_ratio_zrodlo: 'MODEL_MIN' | 'MODEL_MAX';
}

export interface GridSourcePreviewResponse {
  sk_mva: number;
  ik3_ka: number;
  ik1_ka: number | null;
  ip_ka: number;
  ith_ka: number;
  kappa: number;
  z1_ohm: ComplexOhmResponse;
  z0_ohm: ComplexOhmResponse | null;
  formula_ref: string;
  /** CV-4.3 K7: `null` = brak danych MIN w żądaniu (scenariusz MIN nie policzony tutaj). */
  scenariusz_min?: GridSourcePreviewMinResponse | null;
}

export async function fetchGridSourcePreview(
  payload: GridSourcePreviewRequest,
  options: { signal?: AbortSignal } = {},
): Promise<GridSourcePreviewResponse> {
  const response = await fetch('/api/solver/grid-source-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(await readSolverError(response));
  }

  return response.json() as Promise<GridSourcePreviewResponse>;
}

async function readSolverError(response: Response): Promise<string> {
  try {
    const data = await response.json() as { detail?: unknown };
    if (typeof data.detail === 'string' && data.detail.trim().length > 0) {
      return `Solver GPZ odrzucił dane: ${data.detail}`;
    }
  } catch {
    // Error body is optional; the operator-facing message below is enough.
  }

  return 'Backend solvera nie zwrócił podsumowania GPZ.';
}
