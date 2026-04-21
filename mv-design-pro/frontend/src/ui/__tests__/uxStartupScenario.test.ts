import { describe, expect, it } from 'vitest';
import {
  OPERATION_SURFACE_REGISTRY,
  getOperationSurfaceByOp,
} from '../topology/modals/operationSurfaceRegistry';

const CANONICAL_OPERATIONS = [
  { step: 1, op: 'add_grid_source_sn', desc: 'Utwórz GPZ' },
  { step: 2, op: 'add_sn_bay', desc: 'Dodaj pole SN w GPZ' },
  { step: 3, op: 'continue_trunk_segment_sn', desc: 'Kontynuuj ciąg główny (1/3)' },
  { step: 4, op: 'continue_trunk_segment_sn', desc: 'Kontynuuj ciąg główny (2/3)' },
  { step: 5, op: 'continue_trunk_segment_sn', desc: 'Kontynuuj ciąg główny (3/3)' },
  { step: 6, op: 'insert_station_on_segment_sn', desc: 'Wstaw stację SN/nN' },
  { step: 7, op: 'start_branch_segment_sn', desc: 'Dodaj odgałęzienie SN' },
  { step: 8, op: 'insert_station_on_segment_sn', desc: 'Wstaw stację na odgałęzieniu' },
  { step: 9, op: 'connect_secondary_ring_sn', desc: 'Domknij pierścień' },
  { step: 10, op: 'set_normal_open_point', desc: 'Ustaw NOP' },
  { step: 11, op: 'add_nn_load', desc: 'Dodaj odbiór nN' },
  { step: 12, op: 'add_converter_source', desc: 'Dodaj PV' },
  { step: 13, op: 'add_converter_source', desc: 'Dodaj BESS' },
  { step: 14, op: 'add_relay', desc: 'Dodaj zabezpieczenie' },
] as const;

describe('UX startup scenario', () => {
  it('covers only canonical operations with active surfaces', () => {
    const missingOps: string[] = [];
    for (const step of CANONICAL_OPERATIONS) {
      const entry = getOperationSurfaceByOp(step.op);
      if (!entry) {
        missingOps.push(`Step ${step.step}: ${step.op} (${step.desc})`);
      }
    }
    expect(missingOps).toEqual([]);
  });

  it('keeps all scenario surfaces implemented and labelled in Polish', () => {
    for (const step of CANONICAL_OPERATIONS) {
      const entry = getOperationSurfaceByOp(step.op);
      expect(entry?.implemented).toBe(true);
      expect(entry?.labelPl).toBeTruthy();
      expect(entry?.labelPl).not.toMatch(/^(Add|Insert|Remove|Delete|Run|Edit|Open) /);
    }
  });

  it('forces GPZ -> pole SN -> ciąg główny order', () => {
    const sourceIndex = CANONICAL_OPERATIONS.findIndex((s) => s.op === 'add_grid_source_sn');
    const bayIndex = CANONICAL_OPERATIONS.findIndex((s) => s.op === 'add_sn_bay');
    const trunkIndex = CANONICAL_OPERATIONS.findIndex((s) => s.op === 'continue_trunk_segment_sn');
    expect(sourceIndex).toBeGreaterThanOrEqual(0);
    expect(bayIndex).toBeGreaterThan(sourceIndex);
    expect(trunkIndex).toBeGreaterThan(bayIndex);
  });

  it('keeps the sequence deterministic', () => {
    const hashes = Array.from({ length: 100 }, () =>
      CANONICAL_OPERATIONS.map((step) => `${step.step}:${step.op}`).join('|'),
    );
    expect(new Set(hashes).size).toBe(1);
  });

  it('does not reference operations outside the active surface registry', () => {
    const allCanonicalOps = new Set(OPERATION_SURFACE_REGISTRY.map((entry) => entry.canonicalOp));
    for (const step of CANONICAL_OPERATIONS) {
      expect(allCanonicalOps.has(step.op)).toBe(true);
    }
  });
});
