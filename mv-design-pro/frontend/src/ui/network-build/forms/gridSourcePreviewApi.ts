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
  zero_sequence_enabled: boolean;
  r0_ohm: number | null;
  x0_ohm: number | null;
  z0_z1_ratio: number | null;
  tk_s: number;
  tb_s: number;
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
