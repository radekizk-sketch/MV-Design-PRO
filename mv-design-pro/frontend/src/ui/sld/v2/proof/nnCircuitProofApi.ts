/**
 * Klient API pakietu dowodowego weryfikacji obwodu nN (karta P0.10, G-21).
 *
 * `POST /api/nn-proof/circuit/pack` — ZIP (dowód, źródło LaTeX, wykaz plików,
 * odcisk). Wzorzec fetch/blob identyczny jak `ui/reference-patterns/api.ts`
 * (`exportPatternToPdf`) — jedno źródło konwencji pobierania plików w tym repo.
 */

export interface NnCircuitProofRequest {
  readonly project_id: string;
  readonly case_id: string;
  readonly run_id: string;
  readonly snapshot_id: string;
  readonly project_name: string;
  readonly case_name: string;
  readonly run_timestamp: string;
  readonly station_ref: string;
  readonly bus_ref: string;
  readonly breaker_ref: string;
  readonly segment_ref: string;
  readonly apparatus_branch_ref?: string;
  readonly p_mw: number;
  readonly q_mvar: number;
  readonly u_ll_kv: number;
  readonly iz_katalogowe_a: number;
  readonly srodowisko: 'powietrze' | 'grunt';
  readonly izolacja: 'PVC' | 'XLPE';
  readonly temperatura_c: number;
  readonly liczba_obwodow: number;
  readonly rezystywnosc_gruntu_km_w?: number;
  readonly ik_max_ka?: number;
  readonly ith_a?: number;
  readonly fault_duration_s?: number;
  readonly ith_1s_a?: number;
  readonly jth_1s_a_per_mm2?: number;
  readonly cross_section_mm2?: number;
  readonly conductor_material?: string;
  readonly temp_operating_c?: number;
  readonly temp_short_circuit_c?: number;
  readonly vdrop_u_source_kv: number;
  readonly vdrop_delta_u_total_kv: number;
  readonly vdrop_delta_u_total_percent?: number;
}

const API_BASE = '/api/nn-proof';

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Pobierz pakiet dowodowy LV_CIRCUIT_VERIFICATION (ZIP) i uruchom pobranie
 * w przeglądarce. Rzuca `Error` z komunikatem PL z odpowiedzi (`detail`) przy
 * błędzie — wywołujący pokazuje go użytkownikowi, nigdy cicha porażka.
 */
export async function downloadLvCircuitVerificationPack(payload: NnCircuitProofRequest): Promise<void> {
  const response = await fetch(`${API_BASE}/circuit/pack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (typeof errorData.detail === 'string' && errorData.detail) ||
        `Nie udało się pobrać pakietu dowodowego obwodu nN: ${response.statusText}`,
    );
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = `pakiet_dowodowy_obwod_nn__${payload.segment_ref}.zip`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match) filename = match[1];
  }
  downloadBlob(blob, filename);
}
