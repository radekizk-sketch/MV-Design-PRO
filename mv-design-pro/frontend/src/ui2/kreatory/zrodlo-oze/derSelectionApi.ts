/**
 * D2 (RECENZJA_DER_SN_DOBORY_2026-07): klient końcówki kaskadowego DOBORU toru DER-SN.
 *
 * Fizyka i dobór liczą się WYŁĄCZNIE w backendzie (WHITE BOX solverów pomocniczych) —
 * warstwa prezentacji tylko wysyła parametry falowników/toru i prezentuje gotowe
 * propozycje (TR blokowy, kabel SN, aparat pola SN) z pełnym śladem. Wzorzec zgodny
 * z `transformerRatedCurrentsApi.ts`. Kontrakt 1:1 z `DerSelectionPreviewResponse`.
 */

export interface DerSelectionPreviewRequest {
  sum_active_power_mw: number;
  inverter_output_kv: number;
  sn_bus_voltage_kv: number;
  cable_length_km: number;
  cos_phi?: number | null;
  simultaneity_factor?: number;
  loadability_pu?: number;
  transformer_reserve_pu?: number;
  cable_reserve_pu?: number;
  field_reserve_pu?: number;
  max_delta_u_pct?: number;
}

export interface RejectedCandidate {
  catalog_ref: string;
  name: string;
  reason_code: string;
  reason_pl: string;
}

export interface BlockTransformerProposal {
  catalog_ref: string;
  name: string;
  sn_mva: number;
  primary_kv: number;
  secondary_kv: number;
  uk_percent: number | null;
  vector_group: string | null;
}

export interface BlockTransformerSelection {
  proposal: BlockTransformerProposal | null;
  required_apparent_power_mva: number;
  effective_load_mva: number;
  rejected: RejectedCandidate[];
  error_code: string | null;
  error_pl: string | null;
  /** D3 wym. 7: realne układy połączeń dla klasy napięcia toru (z katalogu, nie hardcode). */
  available_vector_groups?: string[];
  formula_ref: string;
}

export interface CableProposal {
  catalog_ref: string;
  name: string;
  cross_section_mm2: number;
  rated_current_a: number;
  delta_u_v: number;
  delta_u_pct: number;
}

export interface CableSelection {
  proposal: CableProposal | null;
  required_ampacity_a: number;
  max_delta_u_pct: number;
  rejected: RejectedCandidate[];
  error_code: string | null;
  error_pl: string | null;
  formula_ref: string;
}

export interface FieldApparatusProposal {
  catalog_ref: string;
  name: string;
  equipment_kind: string;
  un_kv: number;
  in_a: number;
  ik_ka: number | null;
}

export interface FieldApparatusSelection {
  proposal: FieldApparatusProposal | null;
  required_current_a: number;
  rejected: RejectedCandidate[];
  error_code: string | null;
  error_pl: string | null;
  formula_ref: string;
}

export interface DerSelectionPreviewResponse {
  sum_apparent_power_mva: number;
  transformer_current_a: number | null;
  transformer: BlockTransformerSelection;
  cable: CableSelection | null;
  field_apparatus: FieldApparatusSelection | null;
}

export async function fetchDerSelectionPreview(
  payload: DerSelectionPreviewRequest,
  options: { signal?: AbortSignal } = {},
): Promise<DerSelectionPreviewResponse> {
  const response = await fetch('/api/solver/der-selection-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(await readSolverError(response));
  }

  return response.json() as Promise<DerSelectionPreviewResponse>;
}

async function readSolverError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === 'string' && data.detail.trim().length > 0) {
      return `Solver doboru toru DER odrzucił dane: ${data.detail}`;
    }
  } catch {
    // Treść błędu jest opcjonalna; komunikat poniżej wystarcza operatorowi.
  }

  return 'Podgląd doboru toru DER niedostępny — backend solvera nie odpowiedział.';
}
