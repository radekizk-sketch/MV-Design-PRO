/**
 * Testy algorytmu porównania śladów obliczeń (diffTrace)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Deterministyczne porównanie
 * - SYSTEM_SPEC.md: READ-ONLY, brak obliczeń
 *
 * TEST COVERAGE:
 * - generateStepKey: generowanie stabilnych kluczy
 * - diffTraces: porównanie dwóch traces
 * - filterDiffSteps: filtrowanie kroków
 * - findNextChange/findPrevChange: nawigacja
 * - Determinizm: te same wejścia → ten sam wynik
 */

import { describe, it, expect } from 'vitest';
import type { ExtendedTrace, TraceStep } from '../../results-inspector/types';
import {
  generateStepKey,
  diffTraces,
  filterDiffSteps,
  findNextChange,
  findPrevChange,
  findChangeIndices,
  sortDiffStepsByImportance,
} from '../compare/diffTrace';
import type { TraceDiffStep } from '../compare/types';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTraceStep(overrides: Partial<TraceStep> = {}): TraceStep {
  return {
    key: undefined,
    step: undefined,
    title: 'Testowy krok',
    formula_latex: 'x = 1',
    inputs: {},
    substitution: 'x = 1',
    result: {},
    notes: undefined,
    phase: 'CALCULATION',
    ...overrides,
  };
}

function createTrace(steps: TraceStep[], runId = 'test-run'): ExtendedTrace {
  return {
    run_id: runId,
    snapshot_id: null,
    input_hash: 'hash123',
    white_box_trace: steps,
  };
}

// =============================================================================
// generateStepKey Tests
// =============================================================================

describe('generateStepKey', () => {
  it('powinien użyć key jeśli istnieje', () => {
    const step = createTraceStep({ key: 'unique-key' });
    expect(generateStepKey(step, 0)).toBe('key_unique-key');
  });

  it('powinien użyć step_id jako fallback', () => {
    const step = createTraceStep({ step_id: 'step-id-123' });
    expect(generateStepKey(step, 0)).toBe('stepid_step-id-123');
  });

  it('powinien użyć step number jako fallback', () => {
    const step = createTraceStep({ step: 5 });
    expect(generateStepKey(step, 0)).toBe('step_5');
  });

  it('powinien użyć index jako ostateczny fallback', () => {
    const step = createTraceStep({});
    expect(generateStepKey(step, 7)).toBe('idx_7');
  });

  it('powinien priorytetować key nad step_id', () => {
    const step = createTraceStep({ key: 'my-key', step_id: 'my-step-id' });
    expect(generateStepKey(step, 0)).toBe('key_my-key');
  });

  it('powinien priorytetować step_id nad step', () => {
    const step = createTraceStep({ step_id: 'my-step-id', step: 3 });
    expect(generateStepKey(step, 0)).toBe('stepid_my-step-id');
  });

  it('powinien ignorować pusty key', () => {
    const step = createTraceStep({ key: '', step: 2 });
    expect(generateStepKey(step, 0)).toBe('step_2');
  });
});

// =============================================================================
// diffTraces Tests
// =============================================================================

describe('diffTraces', () => {
  it('powinien zwrócić UNCHANGED dla identycznych traces', () => {
    const step1 = createTraceStep({ step: 1, title: 'Krok 1' });
    const step2 = createTraceStep({ step: 2, title: 'Krok 2' });

    const traceA = createTrace([step1, step2], 'run-a');
    const traceB = createTrace([step1, step2], 'run-b');

    const result = diffTraces(traceA, traceB);

    expect(result.summary.unchanged_count).toBe(2);
    expect(result.summary.changed_count).toBe(0);
    expect(result.summary.added_count).toBe(0);
    expect(result.summary.removed_count).toBe(0);
    expect(result.steps.every((s) => s.status === 'UNCHANGED')).toBe(true);
  });

  it('powinien wykryć CHANGED gdy zmienia się title', () => {
    const stepA = createTraceStep({ step: 1, title: 'Tytuł A' });
    const stepB = createTraceStep({ step: 1, title: 'Tytuł B' });

    const traceA = createTrace([stepA], 'run-a');
    const traceB = createTrace([stepB], 'run-b');

    const result = diffTraces(traceA, traceB);

    expect(result.summary.changed_count).toBe(1);
    expect(result.steps[0].status).toBe('CHANGED');

    // Sprawdź field_diffs
    const titleDiff = result.steps[0].field_diffs.find((d) => d.field === 'title');
    expect(titleDiff?.is_changed).toBe(true);
    expect(titleDiff?.value_a).toBe('Tytuł A');
    expect(titleDiff?.value_b).toBe('Tytuł B');
  });

  it('powinien wykryć ADDED dla kroków tylko w B', () => {
    const step1 = createTraceStep({ step: 1, title: 'Krok 1' });
    const step2 = createTraceStep({ step: 2, title: 'Krok 2' });

    const traceA = createTrace([step1], 'run-a');
    const traceB = createTrace([step1, step2], 'run-b');

    const result = diffTraces(traceA, traceB);

    expect(result.summary.added_count).toBe(1);
    const addedStep = result.steps.find((s) => s.status === 'ADDED');
    expect(addedStep).toBeDefined();
    expect(addedStep?.step_b?.title).toBe('Krok 2');
    expect(addedStep?.step_a).toBeNull();
  });

  it('powinien wykryć REMOVED dla kroków tylko w A', () => {
    const step1 = createTraceStep({ step: 1, title: 'Krok 1' });
    const step2 = createTraceStep({ step: 2, title: 'Krok 2' });

    const traceA = createTrace([step1, step2], 'run-a');
    const traceB = createTrace([step1], 'run-b');

    const result = diffTraces(traceA, traceB);

    expect(result.summary.removed_count).toBe(1);
    const removedStep = result.steps.find((s) => s.status === 'REMOVED');
    expect(removedStep).toBeDefined();
    expect(removedStep?.step_a?.title).toBe('Krok 2');
    expect(removedStep?.step_b).toBeNull();
  });

  it('powinien porównać formula_latex', () => {
    const stepA = createTraceStep({ step: 1, formula_latex: 'x = 1' });
    const stepB = createTraceStep({ step: 1, formula_latex: 'x = 2' });

    const traceA = createTrace([stepA], 'run-a');
    const traceB = createTrace([stepB], 'run-b');

    const result = diffTraces(traceA, traceB);

    expect(result.steps[0].status).toBe('CHANGED');
    const formulaDiff = result.steps[0].field_diffs.find((d) => d.field === 'formula_latex');
    expect(formulaDiff?.is_changed).toBe(true);
  });

  it('powinien porównać inputs jako stringi', () => {
    const stepA = createTraceStep({
      step: 1,
      inputs: { x: { value: 1, unit: 'kV' } },
    });
    const stepB = createTraceStep({
      step: 1,
      inputs: { x: { value: 2, unit: 'kV' } },
    });

    const traceA = createTrace([stepA], 'run-a');
    const traceB = createTrace([stepB], 'run-b');

    const result = diffTraces(traceA, traceB);

    expect(result.steps[0].status).toBe('CHANGED');
    const inputsDiff = result.steps[0].field_diffs.find((d) => d.field === 'inputs');
    expect(inputsDiff?.is_changed).toBe(true);
  });

  it('powinien być deterministyczny - te same wejścia → ten sam wynik', () => {
    const step1 = createTraceStep({ step: 1, title: 'Krok 1' });
    const step2 = createTraceStep({ step: 2, title: 'Krok 2' });
    const step3 = createTraceStep({ step: 3, title: 'Krok 3' });

    const traceA = createTrace([step1, step2], 'run-a');
    const traceB = createTrace([step1, step3], 'run-b');

    // Wywołaj wiele razy
    const result1 = diffTraces(traceA, traceB);
    const result2 = diffTraces(traceA, traceB);
    const result3 = diffTraces(traceA, traceB);

    // Porównaj wyniki (bez compared_at bo to timestamp)
    expect(result1.steps).toEqual(result2.steps);
    expect(result2.steps).toEqual(result3.steps);
    expect(result1.summary).toEqual(result2.summary);
    expect(result2.summary).toEqual(result3.summary);
  });

  it('powinien poprawnie wypełnić metadane', () => {
    const step = createTraceStep({ step: 1 });
    const traceA = createTrace([step], 'run-a');
    const traceB = createTrace([step], 'run-b');
    traceA.input_hash = 'hash-a';
    traceB.input_hash = 'hash-b';

    const result = diffTraces(traceA, traceB);

    expect(result.metadata_a.run_id).toBe('run-a');
    expect(result.metadata_a.input_hash).toBe('hash-a');
    expect(result.metadata_b.run_id).toBe('run-b');
    expect(result.metadata_b.input_hash).toBe('hash-b');
  });

  it('powinien sortować kroki po step number', () => {
    // Kroki w złej kolejności
    const step3 = createTraceStep({ step: 3, title: 'Krok 3' });
    const step1 = createTraceStep({ step: 1, title: 'Krok 1' });
    const step2 = createTraceStep({ step: 2, title: 'Krok 2' });

    const traceA = createTrace([step3, step1, step2], 'run-a');
    const traceB = createTrace([step1, step2, step3], 'run-b');

    const result = diffTraces(traceA, traceB);

    // Wszystkie powinny być UNCHANGED mimo innej kolejności w tablicy
    expect(result.summary.unchanged_count).toBe(3);
  });
});

// =============================================================================
// filterDiffSteps Tests
// =============================================================================

describe('filterDiffSteps', () => {
  const createDiffSteps = (): TraceDiffStep[] => [
    {
      step_key: 'step_1',
      status: 'UNCHANGED',
      step_a: createTraceStep({ step: 1 }),
      index_a: 0,
      step_b: createTraceStep({ step: 1 }),
      index_b: 0,
      field_diffs: [],
      display_title: 'Krok 1',
      display_step: 1,
      phase: 'CALCULATION',
    },
    {
      step_key: 'step_2',
      status: 'CHANGED',
      step_a: createTraceStep({ step: 2 }),
      index_a: 1,
      step_b: createTraceStep({ step: 2 }),
      index_b: 1,
      field_diffs: [],
      display_title: 'Krok 2',
      display_step: 2,
      phase: 'CALCULATION',
    },
    {
      step_key: 'step_3',
      status: 'ADDED',
      step_a: null,
      index_a: null,
      step_b: createTraceStep({ step: 3 }),
      index_b: 2,
      field_diffs: [],
      display_title: 'Krok 3',
      display_step: 3,
      phase: 'CALCULATION',
    },
    {
      step_key: 'step_4',
      status: 'REMOVED',
      step_a: createTraceStep({ step: 4 }),
      index_a: 3,
      step_b: null,
      index_b: null,
      field_diffs: [],
      display_title: 'Krok 4',
      display_step: 4,
      phase: 'CALCULATION',
    },
  ];

  it('filtr ALL zwraca wszystkie kroki', () => {
    const steps = createDiffSteps();
    const result = filterDiffSteps(steps, 'ALL');
    expect(result).toHaveLength(4);
  });

  it('filtr CHANGES zwraca tylko zmiany (bez UNCHANGED)', () => {
    const steps = createDiffSteps();
    const result = filterDiffSteps(steps, 'CHANGES');
    expect(result).toHaveLength(3);
    expect(result.every((s) => s.status !== 'UNCHANGED')).toBe(true);
  });

  it('filtr CHANGED zwraca tylko CHANGED', () => {
    const steps = createDiffSteps();
    const result = filterDiffSteps(steps, 'CHANGED');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('CHANGED');
  });

  it('filtr ADDED zwraca tylko ADDED', () => {
    const steps = createDiffSteps();
    const result = filterDiffSteps(steps, 'ADDED');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('ADDED');
  });

  it('filtr REMOVED zwraca tylko REMOVED', () => {
    const steps = createDiffSteps();
    const result = filterDiffSteps(steps, 'REMOVED');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('REMOVED');
  });
});

// =============================================================================
// Navigation Tests
// =============================================================================

describe('findChangeIndices', () => {
  it('powinien znaleźć wszystkie indeksy zmian', () => {
    const steps: TraceDiffStep[] = [
      { step_key: '1', status: 'UNCHANGED' } as TraceDiffStep,
      { step_key: '2', status: 'CHANGED' } as TraceDiffStep,
      { step_key: '3', status: 'UNCHANGED' } as TraceDiffStep,
      { step_key: '4', status: 'ADDED' } as TraceDiffStep,
      { step_key: '5', status: 'REMOVED' } as TraceDiffStep,
    ];

    const indices = findChangeIndices(steps);
    expect(indices).toEqual([1, 3, 4]);
  });

  it('powinien zwrócić pustą tablicę gdy brak zmian', () => {
    const steps: TraceDiffStep[] = [
      { step_key: '1', status: 'UNCHANGED' } as TraceDiffStep,
      { step_key: '2', status: 'UNCHANGED' } as TraceDiffStep,
    ];

    const indices = findChangeIndices(steps);
    expect(indices).toEqual([]);
  });
});

describe('findNextChange', () => {
  const steps: TraceDiffStep[] = [
    { step_key: '1', status: 'UNCHANGED' } as TraceDiffStep,
    { step_key: '2', status: 'CHANGED' } as TraceDiffStep,
    { step_key: '3', status: 'UNCHANGED' } as TraceDiffStep,
    { step_key: '4', status: 'ADDED' } as TraceDiffStep,
  ];

  it('powinien znaleźć następną zmianę', () => {
    expect(findNextChange(steps, 0)).toBe(1);
    expect(findNextChange(steps, 1)).toBe(3);
  });

  it('powinien zwrócić null gdy brak następnej zmiany', () => {
    expect(findNextChange(steps, 3)).toBeNull();
  });

  it('powinien znaleźć pierwszą zmianę od początku', () => {
    expect(findNextChange(steps, -1)).toBe(1);
  });
});

describe('findPrevChange', () => {
  const steps: TraceDiffStep[] = [
    { step_key: '1', status: 'CHANGED' } as TraceDiffStep,
    { step_key: '2', status: 'UNCHANGED' } as TraceDiffStep,
    { step_key: '3', status: 'ADDED' } as TraceDiffStep,
    { step_key: '4', status: 'UNCHANGED' } as TraceDiffStep,
  ];

  it('powinien znaleźć poprzednią zmianę', () => {
    expect(findPrevChange(steps, 3)).toBe(2);
    expect(findPrevChange(steps, 2)).toBe(0);
  });

  it('powinien zwrócić null gdy brak poprzedniej zmiany', () => {
    expect(findPrevChange(steps, 0)).toBeNull();
  });
});

// =============================================================================
// sortDiffStepsByImportance Tests
// =============================================================================

describe('sortDiffStepsByImportance', () => {
  it('powinien sortować: REMOVED > ADDED > CHANGED > UNCHANGED', () => {
    const steps: TraceDiffStep[] = [
      { step_key: '1', status: 'UNCHANGED', display_step: 1 } as TraceDiffStep,
      { step_key: '2', status: 'CHANGED', display_step: 2 } as TraceDiffStep,
      { step_key: '3', status: 'ADDED', display_step: 3 } as TraceDiffStep,
      { step_key: '4', status: 'REMOVED', display_step: 4 } as TraceDiffStep,
    ];

    const sorted = sortDiffStepsByImportance(steps);

    expect(sorted[0].status).toBe('REMOVED');
    expect(sorted[1].status).toBe('ADDED');
    expect(sorted[2].status).toBe('CHANGED');
    expect(sorted[3].status).toBe('UNCHANGED');
  });

  it('powinien sortować po step number w ramach tego samego statusu', () => {
    const steps: TraceDiffStep[] = [
      { step_key: '3', status: 'CHANGED', display_step: 3 } as TraceDiffStep,
      { step_key: '1', status: 'CHANGED', display_step: 1 } as TraceDiffStep,
      { step_key: '2', status: 'CHANGED', display_step: 2 } as TraceDiffStep,
    ];

    const sorted = sortDiffStepsByImportance(steps);

    expect(sorted[0].display_step).toBe(1);
    expect(sorted[1].display_step).toBe(2);
    expect(sorted[2].display_step).toBe(3);
  });
});

// =============================================================================
// No Codenames Test
// =============================================================================

describe('brak nazw kodowych', () => {
  it('diffTraces nie powinien zawierać nazw kodowych P\\d+', () => {
    const step = createTraceStep({ step: 1, title: 'Obliczenie prądu' });
    const traceA = createTrace([step], 'run-a');
    const traceB = createTrace([step], 'run-b');

    const result = diffTraces(traceA, traceB);

    // Sprawdź że wynik nie zawiera nazw kodowych
    const jsonString = JSON.stringify(result);
    const codenameRegex = /\bP\d{1,2}\b/g;
    const matches = jsonString.match(codenameRegex);

    expect(matches).toBeNull();
  });
});
