/**
 * Tests for runListTypes — filter + sort (Pakiet H).
 */

import { describe, expect, it } from 'vitest';

import {
  PROOF_TYPE_LABELS_PL,
  filterRuns,
  sortRunsDescByDate,
} from '../runListTypes';
import type { RunListEntry } from '../runListTypes';

const SAMPLES: RunListEntry[] = [
  {
    run_id: 'R3',
    case_id: 'C1',
    case_name: 'Przypadek 1',
    proof_type: 'SC3F_IEC60909',
    status: 'success',
    created_at: '2026-04-25T10:00:00Z',
    duration_s: 1.5,
    hash_prefix: 'aabbcc11',
  },
  {
    run_id: 'R1',
    case_id: 'C1',
    case_name: 'Przypadek 1',
    proof_type: 'VDROP',
    status: 'failed',
    created_at: '2026-04-26T10:00:00Z',
    duration_s: 0.5,
    error_message: 'Convergence error',
  },
  {
    run_id: 'R2',
    case_id: 'C2',
    case_name: 'Przypadek 2',
    proof_type: 'SC3F_IEC60909',
    status: 'success',
    created_at: '2026-04-26T10:00:00Z',
    duration_s: 2.0,
  },
];

describe('runListTypes — filter + sort', () => {
  it('PROOF_TYPE_LABELS_PL: 11 typów w PL', () => {
    expect(Object.keys(PROOF_TYPE_LABELS_PL)).toHaveLength(12);
    expect(PROOF_TYPE_LABELS_PL.SC3F_IEC60909).toMatch(/Zwarcie 3-fazowe/);
    expect(PROOF_TYPE_LABELS_PL.EARTHING_GROUND_FAULT_SN).toMatch(/Zwarcie doziemne/);
  });

  it('filterRuns: filtr case_id', () => {
    expect(filterRuns(SAMPLES, { case_id: 'C1' })).toHaveLength(2);
    expect(filterRuns(SAMPLES, { case_id: 'C2' })).toHaveLength(1);
  });

  it('filterRuns: filtr proof_type', () => {
    expect(filterRuns(SAMPLES, { proof_type: 'SC3F_IEC60909' })).toHaveLength(2);
    expect(filterRuns(SAMPLES, { proof_type: 'VDROP' })).toHaveLength(1);
  });

  it('filterRuns: filtr status', () => {
    expect(filterRuns(SAMPLES, { status: 'success' })).toHaveLength(2);
    expect(filterRuns(SAMPLES, { status: 'failed' })).toHaveLength(1);
  });

  it('filterRuns: combined filters (AND)', () => {
    const result = filterRuns(SAMPLES, { case_id: 'C1', status: 'success' });
    expect(result).toHaveLength(1);
    expect(result[0].run_id).toBe('R3');
  });

  it('filterRuns: from_date filter', () => {
    const result = filterRuns(SAMPLES, { from_date: '2026-04-26T00:00:00Z' });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.run_id).sort()).toEqual(['R1', 'R2']);
  });

  it('filterRuns: brak filtrów → wszystkie runy', () => {
    expect(filterRuns(SAMPLES, {})).toHaveLength(3);
  });

  it('sortRunsDescByDate: najnowsze najpierw', () => {
    const sorted = sortRunsDescByDate(SAMPLES);
    expect(sorted[0].created_at).toBe('2026-04-26T10:00:00Z');
    expect(sorted[2].created_at).toBe('2026-04-25T10:00:00Z');
  });

  it('sortRunsDescByDate: tie-break po run_id ASC', () => {
    const sorted = sortRunsDescByDate(SAMPLES);
    // R1 i R2 mają tę samą datę → R1 przed R2
    expect(sorted[0].run_id).toBe('R1');
    expect(sorted[1].run_id).toBe('R2');
  });

  it('sortRunsDescByDate: nie mutuje wejścia', () => {
    const original = [...SAMPLES];
    sortRunsDescByDate(SAMPLES);
    expect(SAMPLES).toEqual(original);
  });

  it('sortRunsDescByDate: determinizm — 100 wywołań → ten sam wynik', () => {
    const first = JSON.stringify(sortRunsDescByDate(SAMPLES));
    for (let i = 0; i < 100; i += 1) {
      expect(JSON.stringify(sortRunsDescByDate(SAMPLES))).toBe(first);
    }
  });
});
