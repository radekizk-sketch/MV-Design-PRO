import { LV_DOMAIN_PROJECTION_CONTRACT_VERSION, type LvDomainProjectionV1 } from './types';

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

/** Kształt kontraktu 2.0.0 (`docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md` §3):
 *  graf z energizacją szyn i wyspami, SWZ per transformator, tożsamość
 *  żądania w `model_snapshot`. Inna wersja = odrzucenie (ten sam identyfikator
 *  na dwóch niezgodnych kształtach byłby cichą pułapką). */
export function isLvDomainProjectionV1(value: unknown): value is LvDomainProjectionV1 {
  if (!isRecord(value)) return false;
  if (
    value.contract !== 'LvDomainProjectionV1'
    || value.contract_version !== LV_DOMAIN_PROJECTION_CONTRACT_VERSION
  ) {
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
  if (
    typeof value.model_snapshot.case_id !== 'string'
    || typeof value.model_snapshot.station_ref !== 'string'
    || typeof value.model_snapshot.scenario_id !== 'string'
  ) {
    return false;
  }
  if (value.graph.status === 'OK' && !Array.isArray(value.graph.islands)) return false;
  return Array.isArray(value.upstream_equivalents)
    && Array.isArray(value.swz_snapshot.transformers);
}

/** Tożsamość odpowiedzi = tożsamość żądania (kontrakt 2.0.0, §0.4 karty
 *  B-02): odpowiedź dla innej stacji/scenariusza/przypadku nie może zostać
 *  wyświetlona jako własna — nawet gdy ma poprawny kształt. */
export function projectionIdentityMismatch(
  projection: LvDomainProjectionV1,
  request: LvDomainProjectionRequest,
): string | null {
  const scenario = request.scenario ?? 'MAX';
  const snapshot = projection.model_snapshot;
  if (snapshot.case_id !== request.caseId || projection.case_id !== request.caseId) {
    return `odpowiedź dotyczy przypadku „${snapshot.case_id}", żądano „${request.caseId}"`;
  }
  if (snapshot.station_ref !== request.stationRef || projection.station_ref !== request.stationRef) {
    return `odpowiedź dotyczy stacji „${snapshot.station_ref}", żądano „${request.stationRef}"`;
  }
  if (snapshot.scenario_id !== scenario || projection.scenario_id !== scenario) {
    return `odpowiedź dotyczy scenariusza ${snapshot.scenario_id}, żądano ${scenario}`;
  }
  return null;
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
    throw new Error(
      `Odpowiedź domeny nN ma nieobsługiwaną wersję lub niepełny kształt (obsługiwana: ${LV_DOMAIN_PROJECTION_CONTRACT_VERSION}).`,
    );
  }
  const mismatch = projectionIdentityMismatch(body, request);
  if (mismatch) {
    throw new Error(`Odpowiedź domeny nN nie odpowiada żądaniu: ${mismatch}.`);
  }
  return body;
}
