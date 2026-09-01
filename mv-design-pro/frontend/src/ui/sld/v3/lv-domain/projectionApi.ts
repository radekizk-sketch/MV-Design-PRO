import type { LvDomainProjectionV1 } from './types';

export interface LvDomainProjectionRequest {
  readonly caseId: string;
  readonly stationRef: string;
  readonly scenario?: 'MAX' | 'MIN';
  readonly runId?: string | null;
  readonly signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLvDomainProjectionV1(value: unknown): value is LvDomainProjectionV1 {
  if (!isRecord(value)) return false;
  if (value.contract !== 'LvDomainProjectionV1' || value.contract_version !== '1.0.0') {
    return false;
  }
  if (
    typeof value.case_id !== 'string'
    || typeof value.station_ref !== 'string'
    || typeof value.projection_hash !== 'string'
  ) {
    return false;
  }
  if (!isRecord(value.model_snapshot) || !isRecord(value.graph)) return false;
  if (!isRecord(value.result_snapshot) || !isRecord(value.swz_snapshot)) return false;
  return Array.isArray(value.upstream_equivalents)
    && Array.isArray(value.swz_snapshot.feeders);
}

async function responseError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.detail === 'string') return body.detail;
  } catch {
    // Odpowiedź bez JSON — kod HTTP nadal jest uczciwą informacją.
  }
  return `Nie udało się pobrać domeny nN (HTTP ${response.status}).`;
}

/** Jedyny klient danych portalu nN — dokładnie jedno żądanie atomowej projekcji. */
export async function fetchLvDomainProjectionV1(
  request: LvDomainProjectionRequest,
): Promise<LvDomainProjectionV1> {
  const query = new URLSearchParams({ scenario: request.scenario ?? 'MAX' });
  if (request.runId) query.set('run_id', request.runId);
  const response = await fetch(
    `/api/cases/${encodeURIComponent(request.caseId)}/enm/lv-domain/${encodeURIComponent(request.stationRef)}/projection/v1?${query.toString()}`,
    { signal: request.signal },
  );
  if (!response.ok) throw new Error(await responseError(response));
  const body: unknown = await response.json();
  if (!isLvDomainProjectionV1(body)) {
    throw new Error('Odpowiedź domeny nN ma nieobsługiwaną wersję lub niepełny kształt.');
  }
  return body;
}
