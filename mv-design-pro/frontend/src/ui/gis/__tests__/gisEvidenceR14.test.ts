import { describe, expect, it } from 'vitest';
import { odczytajDowodR14 } from '../gisEvidenceR14';
import { dopasujIdDoEnm } from '../gisEnmReadOnlyR11';
import { wczytajGeoJSON } from '../gisLocalDataR11';

const HASH = 'a'.repeat(64);
const ID = '12345678-1234-1234-1234-123456789abc';
const GEOMETRY = wczytajGeoJSON({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', id: 'DIGPRO-S01',
    properties: { id: 'DIGPRO-S01' },
    geometry: { type: 'Point', coordinates: [16.90, 52.4] } }],
});
const snapshot = {
  header: { revision: 17, hash_sha256: HASH },
  substations: [{ ref_id: 'ST/S01',
    meta: { field_specs: [{ field_ref: 'ST/S01/P01' }] } }],
};
function evidence() {
  return {
    schema: 'MV-DIGPRO-E2E-EVIDENCE-R13',
    status: 'COMPUTATION_COMPLETE_SLD_REVIEW_REQUIRED',
    atomic_single_commit: true,
    case_id: ID,
    final_model: { revision: 17, hash: HASH },
    runs: [
      { analysis_type: 'LOAD_FLOW', status: 'FINISHED', model_revision: 17, model_hash: HASH },
      { analysis_type: 'SC_3F', status: 'FINISHED', model_revision: 17, model_hash: HASH },
    ],
    revisions: [{ step_id: 'S01', source_id: 'DIGPRO-S01',
      revision: 17, hash: HASH, created_refs: ['ST/S01', 'ST/S01/P01'],
      updated_refs: [], binding_status: 'SOURCE_REFERENCE_UNVERIFIED_TERMINALS' }],
  };
}
function assess(x: unknown, caseId: string | null = ID, model: unknown = snapshot) {
  return odczytajDowodR14(x, { caseId, snapshot: model, revision: 17, geometry: GEOMETRY });
}
describe('GIS R14: identyczny przypadek, rewizja i źródła ENM', () => {
  it('dopuszcza dwa rzeczywiste identyfikatory ENM do ręcznego wyboru', () => {
    const result = assess(evidence());
    expect(result.bindings).toHaveLength(1);
    expect(result.bindings[0].sourceRefs).toEqual(['ST/S01', 'ST/S01/P01']);
    expect(result.bindings[0].source).toBe('USER_SUPPLIED_UNAUTHENTICATED');
  });
  it('pole SN można znaleźć w zagnieżdżonej strukturze stacji', () =>
    expect(dopasujIdDoEnm(snapshot, 'ST/S01/P01')[0].kolekcja)
      .toBe('substations.meta.field_specs'));
  it('odrzuca report nieatomowy', () => {
    const e = evidence(); e.atomic_single_commit = false;
    expect(() => assess(e)).toThrow('EVIDENCE_SCHEMA_OR_STATUS');
  });
  it('odrzuca inną rewizję ENM', () => {
    const e = evidence();
    expect(() => assess(e, ID, { ...snapshot,
      header: { revision: 18, hash_sha256: HASH } }))
      .toThrow('EVIDENCE_STALE_OR_UNVERIFIED_ENM');
  });
  it('odrzuca obcy przypadek', () =>
    expect(() => assess(evidence(), 'different-case')).toThrow('EVIDENCE_CASE_MISMATCH'));
  it('odrzuca wynik SC z innego modelu', () => {
    const e = evidence(); e.runs[1].model_hash = 'b'.repeat(64);
    expect(() => assess(e)).toThrow('EVIDENCE_RUNS_NOT_SAME_REVISION');
  });
  it('odrzuca ID nieistniejące w ENM', () => {
    const e = evidence(); e.revisions[0].created_refs = ['NOT-IN-ENM'];
    expect(() => assess(e)).toThrow('EVIDENCE_REFS_NOT_IN_ENM');
  });
  it('odrzuca obcy identyfikator DIGPRO', () => {
    const e = evidence(); e.revisions[0].source_id = 'DIGPRO-OTHER';
    expect(() => assess(e)).toThrow('EVIDENCE_STEP_INCONSISTENT');
  });
  it('nie zmienia danych źródłowych', () => {
    const e = evidence(); const original = JSON.stringify(e);
    assess(e);
    expect(JSON.stringify(e)).toBe(original);
  });
});
