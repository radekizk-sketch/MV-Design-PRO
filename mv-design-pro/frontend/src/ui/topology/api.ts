/**
 * Topology API — klient operacji grafowych ENM.
 *
 * Endpoints:
 * - GET  /api/cases/{caseId}/enm/topology/summary → TopologyGraphSummary
 * - GET  /api/cases/{caseId}/enm/topology          → TopologyStructure (stacje/pola)
 * - POST /api/cases/{caseId}/enm/ops              → TopologyOpResult
 * - POST /api/cases/{caseId}/enm/ops/batch         → BatchOpResult
 */

import type {
  Bay,
  Corridor,
  Junction,
  Substation,
  TopologyGraphSummary,
  TopologyOpResult,
} from '../../types/enm';

const API_BASE = '/api/cases';

class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public detail: unknown,
    public endpoint: string,
  ) {
    super(`API ${status} ${statusText}: ${endpoint}`);
  }
}

async function handleResponse<T>(res: Response, endpoint: string): Promise<T> {
  if (!res.ok) {
    const detail = await res.json().catch(() => res.statusText);
    throw new ApiError(res.status, res.statusText, detail, endpoint);
  }
  return res.json();
}

/** Pobierz podsumowanie topologiczne (graf, spine, laterals). */
export async function fetchTopologySummary(caseId: string): Promise<TopologyGraphSummary> {
  const endpoint = `${API_BASE}/${caseId}/enm/topology/summary`;
  const res = await fetch(endpoint);
  return handleResponse<TopologyGraphSummary>(res, endpoint);
}

/**
 * Struktura topologiczna (stacje/pola/węzły/magistrale) — `GET .../enm/topology`
 * (`backend/src/api/enm.py::get_enm_topology`). Źródło dla trybów drzewa
 * „administracyjny" (grupowanie po `Bay.substation_ref`) i „obwodowy"
 * (etykiety odejść z `Bay.bus_role === 'FEEDER'`); KARTA-UI2 §1 p. 11.
 */
export interface TopologyStructure {
  case_id: string;
  substations: Substation[];
  bays: Bay[];
  junctions: Junction[];
  corridors: Corridor[];
  bus_count: number;
  branch_count: number;
  transformer_count: number;
}

/** Pobierz strukturę topologiczną (stacje, pola, węzły, magistrale). */
export async function fetchTopologyStructure(caseId: string): Promise<TopologyStructure> {
  const endpoint = `${API_BASE}/${caseId}/enm/topology`;
  const res = await fetch(endpoint);
  return handleResponse<TopologyStructure>(res, endpoint);
}

/** Wykonaj pojedynczą operację topologiczną. */
export async function executeTopologyOp(
  caseId: string,
  op: string,
  data: Record<string, unknown>,
): Promise<TopologyOpResult> {
  const endpoint = `${API_BASE}/${caseId}/enm/ops`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, data }),
  });
  return handleResponse<TopologyOpResult>(res, endpoint);
}

/** Wykonaj wiele operacji topologicznych (batch, atomic). */
export async function executeTopologyBatch(
  caseId: string,
  operations: Array<{ op: string; data: Record<string, unknown> }>,
): Promise<{
  success: boolean;
  results: TopologyOpResult[];
  error: string | null;
  revision: number;
}> {
  const endpoint = `${API_BASE}/${caseId}/enm/ops/batch`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operations }),
  });
  return handleResponse(res, endpoint);
}
