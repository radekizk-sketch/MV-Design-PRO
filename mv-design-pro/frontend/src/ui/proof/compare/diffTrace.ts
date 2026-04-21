/**
 * Algorytm porównania śladów obliczeń (deterministyczny, UI-only)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Deterministyczne porównanie
 * - SYSTEM_SPEC.md: READ-ONLY, brak obliczeń
 *
 * RULES (BINDING):
 * - Porównujemy tylko teksty źródłowe (stringi)
 * - Brak obliczeń w UI (nie przeliczamy wartości)
 * - Deterministyczny wynik: te same wejścia → ten sam wynik
 * - Klucz kroku: key → step → index (w tej kolejności)
 */

import type { ExtendedTrace, TraceStep, TraceValue } from '../../results-inspector/types';
import { TRACE_FIELD_LABELS } from '../../results-inspector/types';
import type {
  TraceDiffStep,
  TraceDiffStatus,
  TraceFieldDiff,
  TraceComparisonResult,
  TraceCompareMetadata,
  TraceDiffSummary,
} from './types';

// =============================================================================
// Step Key Generation
// =============================================================================

/**
 * Generuje stabilny klucz dla kroku śladu.
 *
 * Priorytet:
 * 1. step.key (jeśli istnieje)
 * 2. step.step_id (legacy)
 * 3. step.step (numer kroku)
 * 4. Fallback: indeks
 *
 * @param step - Krok śladu
 * @param index - Indeks w tablicy (fallback)
 */
export function generateStepKey(step: TraceStep, index: number): string {
  // Priority 1: explicit key
  if (step.key && typeof step.key === 'string' && step.key.trim() !== '') {
    return `key_${step.key}`;
  }

  // Priority 2: step_id (legacy)
  if (step.step_id && typeof step.step_id === 'string' && step.step_id.trim() !== '') {
    return `stepid_${step.step_id}`;
  }

  // Priority 3: step number
  if (typeof step.step === 'number') {
    return `step_${step.step}`;
  }

  // Fallback: index
  return `idx_${index}`;
}

// =============================================================================
// Field Comparison
// =============================================================================

/**
 * Konwertuje TraceValue na string do porównania.
 */
function traceValueToString(val: TraceValue | undefined | null): string {
  if (val === null || val === undefined) return '';
  if (typeof val.value === 'number') {
    // Zachowaj precyzję, ale normalizuj format
    return String(val.value) + (val.unit ? ` ${val.unit}` : '');
  }
  if (typeof val.value === 'boolean') {
    return val.value ? 'tak' : 'nie';
  }
  if (typeof val.value === 'string') {
    return val.value + (val.unit ? ` ${val.unit}` : '');
  }
  return '';
}

/**
 * Konwertuje Record<string, TraceValue> na string do porównania.
 */
function traceRecordToString(record: Record<string, TraceValue> | undefined | null): string {
  if (!record) return '';

  // Sortuj klucze dla deterministycznego wyniku
  const keys = Object.keys(record).sort();
  const parts = keys.map((key) => {
    const val = record[key];
    const valStr = traceValueToString(val);
    return `${key}: ${valStr}`;
  });

  return parts.join('; ');
}

/**
 * Pobiera wartość pola jako string do porównania.
 */
function getFieldAsString(step: TraceStep, field: string): string {
  const value = step[field];

  if (value === null || value === undefined) return '';

  // Specjalne pola
  if (field === 'inputs' || field === 'result') {
    return traceRecordToString(value as Record<string, TraceValue>);
  }

  // Proste typy
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'tak' : 'nie';

  // Obiekt - konwertuj na JSON
  try {
    return JSON.stringify(value, Object.keys(value as object).sort());
  } catch {
    return String(value);
  }
}

/**
 * Pola do porównania (w kolejności ważności).
 */
const COMPARE_FIELDS = [
  'title',
  'formula_latex',
  'inputs',
  'substitution',
  'result',
  'notes',
  'phase',
  'description',
] as const;

/**
 * Porównuje pola dwóch kroków.
 */
function compareStepFields(stepA: TraceStep, stepB: TraceStep): TraceFieldDiff[] {
  const diffs: TraceFieldDiff[] = [];

  for (const field of COMPARE_FIELDS) {
    const valueA = getFieldAsString(stepA, field);
    const valueB = getFieldAsString(stepB, field);
    const isChanged = valueA !== valueB;

    diffs.push({
      field,
      label_pl: TRACE_FIELD_LABELS[field] ?? field,
      value_a: valueA || null,
      value_b: valueB || null,
      is_changed: isChanged,
    });
  }

  return diffs;
}

/**
 * Sprawdza czy którekolwiek z pól się zmieniło.
 */
function hasAnyFieldChanged(diffs: TraceFieldDiff[]): boolean {
  return diffs.some((d) => d.is_changed);
}

// =============================================================================
// Step Title & Display
// =============================================================================

/**
 * Pobiera tytuł kroku do wyświetlenia.
 */
function getDisplayTitle(step: TraceStep | null): string {
  if (!step) return '(brak)';
  return step.title ?? step.description ?? step.key ?? '(bez tytułu)';
}

/**
 * Pobiera numer kroku do wyświetlenia.
 */
function getDisplayStep(step: TraceStep | null): number | null {
  if (!step) return null;
  return typeof step.step === 'number' ? step.step : null;
}

/**
 * Pobiera fazę kroku.
 */
function getPhase(step: TraceStep | null): string | null {
  if (!step) return null;
  return step.phase ?? null;
}

// =============================================================================
// Main Diff Algorithm
// =============================================================================

/**
 * Sortuje kroki deterministycznie.
 */
function sortSteps(steps: TraceStep[]): TraceStep[] {
  return [...steps].sort((a, b) => {
    if (a.step !== undefined && b.step !== undefined) {
      return a.step - b.step;
    }
    if (a.step !== undefined) return -1;
    if (b.step !== undefined) return 1;
    return 0;
  });
}

/**
 * Tworzy mapę kluczy → kroków.
 */
function createStepMap(steps: TraceStep[]): Map<string, { step: TraceStep; index: number }> {
  const map = new Map<string, { step: TraceStep; index: number }>();

  steps.forEach((step, index) => {
    const key = generateStepKey(step, index);
    // Pierwszy wpis wygrywa (dla deterministyczności)
    if (!map.has(key)) {
      map.set(key, { step, index });
    }
  });

  return map;
}

/**
 * Porównuje dwa ślady obliczeń.
 *
 * DETERMINISTIC:
 * - Sortowanie kroków po step number
 * - Sortowanie kluczy po stringu
 * - Ten sam wynik dla tych samych danych wejściowych
 *
 * @param traceA - Ślad A (bazowy)
 * @param traceB - Ślad B (porównywany)
 */
export function diffTraces(
  traceA: ExtendedTrace,
  traceB: ExtendedTrace
): TraceComparisonResult {
  // Sortuj kroki deterministycznie
  const stepsA = sortSteps(traceA.white_box_trace);
  const stepsB = sortSteps(traceB.white_box_trace);

  // Twórz mapy kluczy
  const mapA = createStepMap(stepsA);
  const mapB = createStepMap(stepsB);

  // Zbierz wszystkie unikalne klucze
  const allKeys = new Set<string>([...mapA.keys(), ...mapB.keys()]);

  // Sortuj klucze deterministycznie
  const sortedKeys = [...allKeys].sort((a, b) => {
    // Najpierw porównaj po typie klucza (step_ przed idx_)
    const typeOrder = { key_: 0, stepid_: 1, step_: 2, idx_: 3 };
    const getType = (k: string) => {
      if (k.startsWith('key_')) return typeOrder['key_'];
      if (k.startsWith('stepid_')) return typeOrder['stepid_'];
      if (k.startsWith('step_')) return typeOrder['step_'];
      return typeOrder['idx_'];
    };

    const typeA = getType(a);
    const typeB = getType(b);

    if (typeA !== typeB) return typeA - typeB;

    // Dla step_ i idx_, porównaj numerycznie
    if (a.startsWith('step_') && b.startsWith('step_')) {
      const numA = parseInt(a.replace('step_', ''), 10);
      const numB = parseInt(b.replace('step_', ''), 10);
      return numA - numB;
    }

    if (a.startsWith('idx_') && b.startsWith('idx_')) {
      const numA = parseInt(a.replace('idx_', ''), 10);
      const numB = parseInt(b.replace('idx_', ''), 10);
      return numA - numB;
    }

    // Fallback: porównanie stringów
    return a.localeCompare(b);
  });

  // Generuj listę diffów
  const diffSteps: TraceDiffStep[] = [];
  let unchangedCount = 0;
  let changedCount = 0;
  let addedCount = 0;
  let removedCount = 0;

  for (const key of sortedKeys) {
    const entryA = mapA.get(key);
    const entryB = mapB.get(key);

    let status: TraceDiffStatus;
    let fieldDiffs: TraceFieldDiff[] = [];

    if (entryA && entryB) {
      // Krok istnieje w obu
      fieldDiffs = compareStepFields(entryA.step, entryB.step);
      status = hasAnyFieldChanged(fieldDiffs) ? 'CHANGED' : 'UNCHANGED';

      if (status === 'CHANGED') {
        changedCount++;
      } else {
        unchangedCount++;
      }
    } else if (entryA && !entryB) {
      // Krok tylko w A (usunięty w B)
      status = 'REMOVED';
      removedCount++;
    } else {
      // Krok tylko w B (dodany w B)
      status = 'ADDED';
      addedCount++;
    }

    const stepA = entryA?.step ?? null;
    const stepB = entryB?.step ?? null;

    diffSteps.push({
      step_key: key,
      status,
      step_a: stepA,
      index_a: entryA?.index ?? null,
      step_b: stepB,
      index_b: entryB?.index ?? null,
      field_diffs: fieldDiffs,
      display_title: getDisplayTitle(stepA ?? stepB),
      display_step: getDisplayStep(stepA ?? stepB),
      phase: getPhase(stepA ?? stepB),
    });
  }

  // Metadane
  const metadataA: TraceCompareMetadata = {
    run_id: traceA.run_id,
    snapshot_id: traceA.snapshot_id,
    input_hash: traceA.input_hash,
    step_count: stepsA.length,
  };

  const metadataB: TraceCompareMetadata = {
    run_id: traceB.run_id,
    snapshot_id: traceB.snapshot_id,
    input_hash: traceB.input_hash,
    step_count: stepsB.length,
  };

  // Podsumowanie
  const summary: TraceDiffSummary = {
    total_steps: diffSteps.length,
    unchanged_count: unchangedCount,
    changed_count: changedCount,
    added_count: addedCount,
    removed_count: removedCount,
  };

  return {
    metadata_a: metadataA,
    metadata_b: metadataB,
    steps: diffSteps,
    summary,
    compared_at: new Date().toISOString(),
  };
}

// =============================================================================
// Filtering & Navigation
// =============================================================================

/**
 * Filtruje kroki diff według statusu.
 */
export function filterDiffSteps(
  steps: TraceDiffStep[],
  filter: 'ALL' | 'CHANGES' | 'CHANGED' | 'ADDED' | 'REMOVED'
): TraceDiffStep[] {
  switch (filter) {
    case 'ALL':
      return steps;
    case 'CHANGES':
      return steps.filter((s) => s.status !== 'UNCHANGED');
    case 'CHANGED':
      return steps.filter((s) => s.status === 'CHANGED');
    case 'ADDED':
      return steps.filter((s) => s.status === 'ADDED');
    case 'REMOVED':
      return steps.filter((s) => s.status === 'REMOVED');
    default:
      return steps;
  }
}

/**
 * Znajduje indeksy wszystkich zmian (nie-UNCHANGED).
 */
export function findChangeIndices(steps: TraceDiffStep[]): number[] {
  const indices: number[] = [];
  steps.forEach((step, index) => {
    if (step.status !== 'UNCHANGED') {
      indices.push(index);
    }
  });
  return indices;
}

/**
 * Znajduje następną zmianę od danego indeksu.
 */
export function findNextChange(steps: TraceDiffStep[], currentIndex: number): number | null {
  for (let i = currentIndex + 1; i < steps.length; i++) {
    if (steps[i].status !== 'UNCHANGED') {
      return i;
    }
  }
  return null;
}

/**
 * Znajduje poprzednią zmianę od danego indeksu.
 */
export function findPrevChange(steps: TraceDiffStep[], currentIndex: number): number | null {
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (steps[i].status !== 'UNCHANGED') {
      return i;
    }
  }
  return null;
}

/**
 * Sortuje kroki diff według ważności.
 * REMOVED > ADDED > CHANGED > UNCHANGED, potem po step number.
 */
export function sortDiffStepsByImportance(steps: TraceDiffStep[]): TraceDiffStep[] {
  const statusOrder: Record<TraceDiffStatus, number> = {
    REMOVED: 0,
    ADDED: 1,
    CHANGED: 2,
    UNCHANGED: 3,
  };

  return [...steps].sort((a, b) => {
    // Najpierw po statusie
    const statusCmp = statusOrder[a.status] - statusOrder[b.status];
    if (statusCmp !== 0) return statusCmp;

    // Potem po numerze kroku
    const stepA = a.display_step ?? Infinity;
    const stepB = b.display_step ?? Infinity;
    return stepA - stepB;
  });
}
