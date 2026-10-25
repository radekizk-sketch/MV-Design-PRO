/** GIS R15 — poświadczenie wyników przez odczyt REALNEGO backendu.
 * Lokalne JSON i dopasowanie hash nie są dowodem, że bieg istnieje.
 * Ten adapter sprawdza biegi, migawki i podpisy wyników w kanonicznym API.
 */
import { OdmowaDowoduR14 } from './gisEvidenceR14';

type JsonRecord = Record<string, unknown>;
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
const obj = (v: unknown): v is JsonRecord =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const digest = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function requireValue(ok: boolean, reason: string): void {
  if (!ok) throw new OdmowaDowoduR14(reason);
}
async function readJson(endpoint: string, fetcher: Fetcher): Promise<JsonRecord> {
  const response = await fetcher(endpoint, {
    method: 'GET', cache: 'no-store', redirect: 'error', credentials: 'same-origin',
    headers: { 'Accept': 'application/json' },
  });
  requireValue(response.ok, 'BACKEND_READ_FAILED');
  const value: unknown = await response.json();
  requireValue(obj(value), 'BACKEND_RESULT_INVALID');
  return value as JsonRecord;
}
export async function zweryfikujWynikiBackendR15(
  report: unknown,
  caseId: string,
  fetcher: Fetcher = fetch,
): Promise<{
  verified: true; caseId: string; modelRevision: number;
  modelHash: string; checkedRunIds: string[];
}> {
  requireValue(uuid(caseId), 'CASE_ID_INVALID');
  requireValue(obj(report) && report.case_id === caseId && obj(report.final_model),
    'REPORT_CASE_MISMATCH');
  if (!obj(report) || !obj(report.final_model)) throw new OdmowaDowoduR14('REPORT_CASE_MISMATCH');
  const final = report.final_model;
  requireValue(digest(final.hash) && Number.isSafeInteger(final.revision),
    'REPORT_MODEL_ID_INVALID');
  requireValue(report.status === 'COMPUTATION_COMPLETE_SLD_REVIEW_REQUIRED' &&
    report.atomic_single_commit === true, 'REPORT_NOT_ATOMIC_OR_INCOMPLETE');
  const latest = await readJson('/api/cases/' + caseId + '/enm', fetcher);
  requireValue(obj(latest.header) && latest.header.hash_sha256 === final.hash &&
    latest.header.revision === final.revision, 'BACKEND_MODEL_STALE');
  const rawRuns = report.runs;
  requireValue(Array.isArray(rawRuns) && rawRuns.length === 2, 'REPORT_RUN_COUNT');
  if (!Array.isArray(rawRuns)) throw new OdmowaDowoduR14('REPORT_RUN_COUNT');
  const runs = rawRuns as unknown[];
  const ids = new Set<string>();
  const checked: string[] = [];
  for (const analysis of ['LOAD_FLOW', 'SC_3F']) {
    const items = runs.filter((r) => obj(r) && r.analysis_type === analysis);
    requireValue(items.length === 1 && obj(items[0]), 'REPORT_RUN_DUPLICATED');
    const item = items[0] as JsonRecord;
    const runId = item.run_id;
    requireValue(uuid(runId) && !ids.has(runId as string), 'REPORT_RUN_ID_INVALID');
    const id = runId as string;
    ids.add(id);
    const backendRun = await readJson('/api/execution/runs/' + id, fetcher);
    requireValue(backendRun.id === id && backendRun.study_case_id === caseId &&
      backendRun.analysis_type === analysis && backendRun.status === 'FINISHED' &&
      backendRun.model_revision === final.revision, 'BACKEND_RUN_INCONSISTENT');
    const stored = await readJson('/api/analysis-runs/' + id + '/snapshot', fetcher);
    requireValue(stored.run_id === id && obj(stored.snapshot) &&
      obj((stored.snapshot as JsonRecord).header) &&
      ((stored.snapshot as JsonRecord).header as JsonRecord).hash_sha256 === final.hash,
      'BACKEND_RUN_SNAPSHOT_MISMATCH');
    const results = await readJson('/api/execution/runs/' + id + '/results', fetcher);
    requireValue(results.run_id === id && results.analysis_type === analysis &&
      typeof results.deterministic_signature === 'string' &&
      results.deterministic_signature.length > 0 &&
      results.deterministic_signature === item.result_signature &&
      item.model_hash === final.hash && item.model_revision === final.revision,
      'BACKEND_RESULT_SIGNATURE_MISMATCH');
    checked.push(id);
  }
  return {
    verified: true, caseId, modelRevision: final.revision as number,
    modelHash: final.hash as string, checkedRunIds: checked,
  };
}
