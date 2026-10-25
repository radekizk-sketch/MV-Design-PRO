/** GIS R14: odczytowy widok dowodów DIGPRO → ENM.
 * Plik użytkownika nie jest poświadczeniem operatora ani weryfikacją terminali.
 * Odmowa, gdy przypadek, rewizja, hash lub elementy nie zgadzają się z ENM.
 */
import { dopasujIdDoEnm } from './gisEnmReadOnlyR11';
import type { ZbiorGIS } from './gisLocalDataR11';

export type DowodWiazaniaR14 = {
  sourceId: string;
  sourceRefs: string[];
  stepIds: string[];
  source: 'USER_SUPPLIED_UNAUTHENTICATED';
};
export type WynikDowoduR14 = {
  revision: number;
  hash: string;
  bindings: DowodWiazaniaR14[];
  warnings: string[];
};
export class OdmowaDowoduR14 extends Error {
  constructor(public readonly kod: string) { super(kod); }
}
const object = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x);
const hex = (x: unknown) => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);
const refuse = (ok: boolean, code: string) => {
  if (!ok) throw new OdmowaDowoduR14(code);
};
const arrStrings = (x: unknown): x is string[] =>
  Array.isArray(x) && x.length <= 5000 &&
  x.every((v) => typeof v === 'string' && v.length > 0 && v.length <= 160);

export function odczytajDowodR14(
  raw: unknown,
  options: {
    caseId: string | null;
    snapshot: unknown;
    revision: number | null;
    geometry: ZbiorGIS;
  },
): WynikDowoduR14 {
  refuse(object(raw) && raw.schema === 'MV-DIGPRO-E2E-EVIDENCE-R13' &&
    raw.status === 'COMPUTATION_COMPLETE_SLD_REVIEW_REQUIRED' &&
    raw.atomic_single_commit === true, 'EVIDENCE_SCHEMA_OR_STATUS');
  if (!object(raw)) throw new OdmowaDowoduR14('EVIDENCE_SCHEMA_OR_STATUS');
  refuse(typeof options.caseId === 'string' && options.caseId === raw.case_id,
    'EVIDENCE_CASE_MISMATCH');
  const final = raw.final_model;
  const snap = options.snapshot;
  refuse(object(final) && Number.isSafeInteger(final.revision) &&
    hex(final.hash) && object(snap) && object(snap.header) &&
    final.revision === options.revision &&
    final.revision === snap.header.revision &&
    final.hash === snap.header.hash_sha256, 'EVIDENCE_STALE_OR_UNVERIFIED_ENM');
  if (!object(final)) throw new OdmowaDowoduR14('EVIDENCE_STALE_OR_UNVERIFIED_ENM');
  const runs = raw.runs;
  refuse(Array.isArray(runs) && runs.length === 2 &&
    ['LOAD_FLOW', 'SC_3F'].every((analysis) => runs.some(
      (r: unknown) => object(r) && r.analysis_type === analysis &&
        r.status === 'FINISHED' && r.model_hash === final.hash &&
        r.model_revision === final.revision
    )), 'EVIDENCE_RUNS_NOT_SAME_REVISION');
  const revisions = raw.revisions;
  refuse(Array.isArray(revisions) && revisions.length > 0 &&
    revisions.length <= 128, 'EVIDENCE_STEP_COUNT');
  if (!Array.isArray(revisions)) throw new OdmowaDowoduR14('EVIDENCE_STEP_COUNT');
  const ids = new Set(options.geometry.features.map((f) => f.id));
  const seenStep = new Set<string>();
  const bySource = new Map<string, { refs: Set<string>; steps: string[] }>();
  for (const step of revisions) {
    refuse(object(step) && typeof step.step_id === 'string' &&
      step.step_id.length > 0 && !seenStep.has(step.step_id) &&
      typeof step.source_id === 'string' && ids.has(step.source_id) &&
      step.hash === final.hash && step.revision === final.revision &&
      arrStrings(step.created_refs) && arrStrings(step.updated_refs) &&
      step.binding_status === 'SOURCE_REFERENCE_UNVERIFIED_TERMINALS',
      'EVIDENCE_STEP_INCONSISTENT');
    if (!object(step)) throw new OdmowaDowoduR14('EVIDENCE_STEP_INCONSISTENT');
    const stepId = step.step_id as string;
    const sourceId = step.source_id as string;
    seenStep.add(stepId);
    const refs = [...(step.created_refs as string[]), ...(step.updated_refs as string[])];
    refuse(refs.length > 0 && refs.every((r) => dopasujIdDoEnm(snap, r).length > 0),
      'EVIDENCE_REFS_NOT_IN_ENM');
    const prior = bySource.get(sourceId) ?? { refs: new Set<string>(), steps: [] };
    refs.forEach((r) => prior.refs.add(r));
    prior.steps.push(stepId);
    bySource.set(sourceId, prior);
  }
  const bindings = [...bySource].map(([sourceId, value]) => ({
    sourceId, sourceRefs: [...value.refs].sort(), stepIds: value.steps.sort(),
    source: 'USER_SUPPLIED_UNAUTHENTICATED' as const,
  })).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  return {
    revision: final.revision as number, hash: final.hash as string, bindings,
    warnings: [
      'Plik dowodu dostarczony przez użytkownika — bez potwierdzenia autentyczności.',
      'Identyfikatory ENM są kandydatami. Porty, funkcje pola i topologia wymagają niezależnego odbioru.',
      'Wyniki obliczeń są deklarowane w pliku; bieżący status biegu potwierdza backend.',
    ],
  };
}
