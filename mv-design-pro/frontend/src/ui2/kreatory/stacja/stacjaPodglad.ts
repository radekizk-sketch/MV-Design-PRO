/**
 * Krok 7 kreatora stacji — podgląd skutków przed zapisem (K9-B).
 *
 * Wywołuje TĘ SAMĄ operację domenową co zapis, z flagą `dry_run: true`:
 * backend liczy podział odcinka i skutki elektryczne, NIE zmieniając modelu
 * (odpowiedź nie zawiera snapshotu, więc nic nie jest utrwalane). UI wyłącznie
 * czyta — ZERO fizyki i ZERO przeliczeń po stronie kreatora.
 *
 * Świadomie omijamy `snapshotStore.executeDomainOperation`: ten store zapisuje
 * snapshot z odpowiedzi, a podgląd snapshotu nie zwraca.
 */

const API_BASE = '/api/cases';

/** Skutki elektryczne podziału (readout backendu — nazwy pól 1:1 z kontraktem). */
export interface SkutkiElektryczne {
  topology_changed?: boolean;
  topology_type_changed?: boolean;
  affected_object_refs?: readonly string[];
  affected_buses?: readonly string[];
  invalidated_results?: readonly string[];
  affected_proof_packs?: readonly string[];
  missing_data_after?: readonly string[];
  catalog_inheritance?: Record<string, unknown>;
  length_assignment?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Połówki dzielonego odcinka (readout backendu). */
export interface PolowkiOdcinka {
  split_ratio?: number;
  first_length_km?: number;
  second_length_km?: number;
  [key: string]: unknown;
}

export interface PodgladStacji {
  /** Ref stacji, który powstanie (deterministyczny — ten sam co przy zapisie). */
  stationRef: string | null;
  halves: PolowkiOdcinka | null;
  impact: SkutkiElektryczne | null;
  /** Surowa koperta podglądu — do readoutów, których nie normalizujemy. */
  raw: Record<string, unknown>;
}

interface DomainOpPreviewResponse {
  dry_run?: boolean;
  preview?: Record<string, unknown>;
  error?: string;
  error_code?: string;
}

function tekstBledu(dane: unknown, status: number, statusText: string): string {
  if (dane && typeof dane === 'object') {
    const detail = (dane as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') {
      const message = (detail as { message_pl?: unknown }).message_pl;
      if (typeof message === 'string') return message;
    }
  }
  return `Błąd HTTP ${status}: ${statusText}`;
}

/**
 * Pobiera podgląd skutków operacji stacyjnej (`dry_run`). Rzuca `Error`
 * z komunikatem PL, gdy backend odrzuci payload — komunikat jest pokazywany
 * projektantowi bez tłumaczenia w UI.
 */
export async function pobierzPodgladStacji(
  caseId: string,
  operacja: string,
  payload: Record<string, unknown>,
  opcje: { signal?: AbortSignal } = {},
): Promise<PodgladStacji> {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(caseId)}/enm/domain-ops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: opcje.signal,
    body: JSON.stringify({
      project_id: caseId,
      snapshot_base_hash: '',
      operation: {
        name: operacja,
        idempotency_key: `podglad-${operacja}`,
        payload: { ...payload, dry_run: true },
      },
    }),
  });

  if (!response.ok) {
    const dane = await response.json().catch(() => null);
    throw new Error(tekstBledu(dane, response.status, response.statusText));
  }

  const dane = (await response.json()) as DomainOpPreviewResponse;
  if (dane.error) throw new Error(dane.error);

  const preview = dane.preview ?? {};
  const stationRef =
    (preview.inserted_station_id as string | undefined)
    ?? (preview.appended_station_id as string | undefined)
    ?? null;
  return {
    stationRef,
    halves: (preview.halves as PolowkiOdcinka | undefined) ?? null,
    impact: (preview.electrical_impact as SkutkiElektryczne | undefined) ?? null,
    raw: preview,
  };
}
