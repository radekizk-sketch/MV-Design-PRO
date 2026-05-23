import { describe, expect, it } from 'vitest';
import {
  cloneCase,
  validateCloneOptions,
  type CaseConfig,
  type CaseResults,
} from '../caseCloneHelper';

const sourceCase: CaseConfig = {
  id: 'case-1',
  name: 'Wariant bazowy',
  type: 'power_flow',
  parameters: { tolerance: 1e-6, maxIter: 50 },
  scenarios: ['N-1', 'Peak'],
  notes: 'Bazowy wariant pracy normalnej',
};

const sourceResults: CaseResults = {
  caseId: 'case-1',
  status: 'completed',
  runHistory: ['run-1', 'run-2'],
  proofPacks: ['proof-1'],
  generatedAt: '2026-05-23T10:00:00Z',
};

describe('cloneCase', () => {
  it('klonuje config z nową nazwą', () => {
    const r = cloneCase({
      sourceCase,
      options: { newName: 'Wariant N-1' },
    });
    expect(r.config.name).toBe('Wariant N-1');
    expect(r.config.parameters).toEqual(sourceCase.parameters);
    expect(r.config.scenarios).toEqual(sourceCase.scenarios);
  });

  it('nowy id auto-generowany jeśli nie podany', () => {
    const r = cloneCase({
      sourceCase,
      options: { newName: 'Klon' },
    });
    expect(r.config.id).not.toBe(sourceCase.id);
    expect(r.config.id).toContain('clone');
  });

  it('newCaseId override działa', () => {
    const r = cloneCase({
      sourceCase,
      options: { newName: 'Klon', newCaseId: 'case-2-explicit' },
    });
    expect(r.config.id).toBe('case-2-explicit');
  });

  it('cloneResults=false → null results', () => {
    const r = cloneCase({
      sourceCase,
      sourceResults,
      options: { newName: 'Klon' },
    });
    expect(r.results).toBe(null);
    expect(r.cloneCommandLog.some((l) => l.includes('bez wyników'))).toBe(true);
  });

  it('cloneResults=true → deep copy results', () => {
    const r = cloneCase({
      sourceCase,
      sourceResults,
      options: { newName: 'Klon', cloneResults: true },
    });
    expect(r.results).not.toBe(null);
    expect(r.results!.caseId).toBe(r.config.id);
    expect(r.results!.runHistory).toEqual(sourceResults.runHistory);
  });

  it('cloneResults=true bez sourceResults → log info', () => {
    const r = cloneCase({
      sourceCase,
      options: { newName: 'Klon', cloneResults: true },
    });
    expect(r.results).toBe(null);
    expect(r.cloneCommandLog.some((l) => l.includes('Brak wyników'))).toBe(true);
  });

  it('notes wskazuje source case', () => {
    const r = cloneCase({
      sourceCase,
      options: { newName: 'Klon' },
    });
    expect(r.config.notes).toContain('Wariant bazowy');
  });

  it('parameters są deep copy (nie referencja)', () => {
    const r = cloneCase({
      sourceCase,
      options: { newName: 'Klon' },
    });
    r.config.parameters.maxIter = 100;
    expect(sourceCase.parameters.maxIter).toBe(50);
  });
});

describe('validateCloneOptions', () => {
  it('valid gdy newName niepuste', () => {
    expect(validateCloneOptions({ newName: 'Test' }).isValid).toBe(true);
  });

  it('invalid gdy puste', () => {
    expect(validateCloneOptions({ newName: '' }).isValid).toBe(false);
    expect(validateCloneOptions({ newName: '   ' }).isValid).toBe(false);
  });

  it('invalid gdy za krótkie (<3)', () => {
    const r = validateCloneOptions({ newName: 'AB' });
    expect(r.isValid).toBe(false);
    expect(r.message).toContain('krótka');
  });
});
