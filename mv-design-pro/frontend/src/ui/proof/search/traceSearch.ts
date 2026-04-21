/**
 * traceSearch — Moduł wyszukiwania i filtrowania śladu obliczeń
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: PF-like nawigacja i wyszukiwanie
 * - wizard_screens.md: RESULT_VIEW mode, Polish labels
 *
 * FEATURES:
 * - Wyszukiwanie pełnotekstowe (client-side, deterministyczne)
 * - Filtry po typie kroku/fazie
 * - Nawigacja wyników (prev/next)
 * - 100% Polish UI
 *
 * NOTE: Nazwy kodowe NIGDY nie są pokazywane w UI.
 */

import type { TraceStep, TraceValue } from '../../results-inspector/types';

// =============================================================================
// Types
// =============================================================================

/**
 * Wynik wyszukiwania z informacją o dopasowaniu.
 */
export interface SearchMatch {
  /** Indeks kroku w posortowanej tablicy */
  stepIndex: number;
  /** Pola, w których znaleziono dopasowanie */
  matchedFields: MatchedField[];
  /** Unikalny klucz dla testID */
  matchKey: string;
}

/**
 * Pojedyncze pole z dopasowaniem.
 */
export interface MatchedField {
  /** Nazwa pola (np. 'title', 'formula_latex') */
  field: string;
  /** Tekst zawierający dopasowanie */
  text: string;
  /** Indeks początku dopasowania w tekście */
  matchStart: number;
  /** Długość dopasowania */
  matchLength: number;
}

/**
 * Opcje filtrowania.
 */
export interface TraceFilterOptions {
  /** Faza do filtrowania (null = wszystkie) */
  phase: string | null;
  /** Tylko kroki z problemami/walidacjami */
  onlyProblems: boolean;
}

/**
 * Stan wyszukiwania i filtrowania.
 */
export interface TraceSearchState {
  /** Fraza wyszukiwania */
  query: string;
  /** Opcje filtrowania */
  filters: TraceFilterOptions;
  /** Wyniki wyszukiwania */
  results: SearchMatch[];
  /** Indeks aktywnego wyniku (0-based) */
  activeResultIndex: number;
  /** Liczba wszystkich kroków (przed filtrowaniem) */
  totalSteps: number;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Dostępne fazy do filtrowania.
 */
export const AVAILABLE_PHASES = [
  { value: 'INITIALIZATION', label: 'Inicjalizacja' },
  { value: 'CALCULATION', label: 'Obliczenia' },
  { value: 'AGGREGATION', label: 'Agregacja' },
  { value: 'VALIDATION', label: 'Walidacja' },
  { value: 'OUTPUT', label: 'Wyniki' },
] as const;

/**
 * Mapowanie faz na polskie etykiety.
 */
export const PHASE_LABELS: Record<string, string> = {
  INITIALIZATION: 'Inicjalizacja',
  CALCULATION: 'Obliczenia',
  AGGREGATION: 'Agregacja',
  VALIDATION: 'Walidacja',
  OUTPUT: 'Wyniki',
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Wyciągnij tekst z TraceValue do przeszukiwania.
 */
function extractValueText(value: TraceValue): string {
  const parts: string[] = [];
  if (value.value !== null && value.value !== undefined) {
    parts.push(String(value.value));
  }
  if (value.unit) {
    parts.push(value.unit);
  }
  if (value.label) {
    parts.push(value.label);
  }
  return parts.join(' ');
}

/**
 * Wyciągnij tekst z Record<string, TraceValue> do przeszukiwania.
 */
function extractRecordText(record: Record<string, TraceValue> | undefined): string {
  if (!record) return '';
  return Object.entries(record)
    .map(([key, value]) => `${key} ${extractValueText(value)}`)
    .join(' ');
}

/**
 * Pobierz cały tekst kroku do przeszukiwania.
 */
function getStepSearchableText(step: TraceStep): string {
  const parts: string[] = [];

  // Tytuł i opisy
  if (step.title) parts.push(step.title);
  if (step.description) parts.push(step.description);

  // LaTeX i podstawienia
  if (step.formula_latex) parts.push(step.formula_latex);
  if (step.substitution) parts.push(step.substitution);

  // Notatki
  if (step.notes) parts.push(step.notes);

  // Identyfikatory
  if (step.key) parts.push(step.key);
  if (step.equation_id) parts.push(step.equation_id);
  if (step.step_id) parts.push(step.step_id);

  // Faza
  if (step.phase) parts.push(step.phase);

  // Wartości wejściowe i wynikowe
  parts.push(extractRecordText(step.inputs));
  parts.push(extractRecordText(step.result));

  return parts.join(' ');
}

/**
 * Znajdź dopasowanie w tekście (case-insensitive).
 */
function findMatch(text: string, query: string): { start: number; length: number } | null {
  if (!text || !query) return null;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index === -1) return null;
  return { start: index, length: query.length };
}

/**
 * Sprawdź dopasowanie w konkretnym polu.
 */
function checkFieldMatch(
  step: TraceStep,
  field: string,
  query: string
): MatchedField | null {
  let text: string;

  switch (field) {
    case 'title':
      text = step.title ?? '';
      break;
    case 'description':
      text = step.description ?? '';
      break;
    case 'formula_latex':
      text = step.formula_latex ?? '';
      break;
    case 'substitution':
      text = step.substitution ?? '';
      break;
    case 'notes':
      text = step.notes ?? '';
      break;
    case 'key':
      text = step.key ?? '';
      break;
    case 'equation_id':
      text = step.equation_id ?? '';
      break;
    case 'inputs':
      text = extractRecordText(step.inputs);
      break;
    case 'result':
      text = extractRecordText(step.result);
      break;
    case 'phase':
      text = step.phase ?? '';
      break;
    default:
      return null;
  }

  const match = findMatch(text, query);
  if (!match) return null;

  return {
    field,
    text,
    matchStart: match.start,
    matchLength: match.length,
  };
}

/**
 * Sprawdź czy krok ma problemy/walidacje.
 * Krok uznajemy za "problemowy" jeśli:
 * - Ma fazę VALIDATION
 * - Ma notatki zawierające słowa kluczowe
 */
function stepHasProblems(step: TraceStep): boolean {
  // Faza walidacji
  if (step.phase === 'VALIDATION') return true;

  // Słowa kluczowe w notatkach
  const problemKeywords = ['błąd', 'error', 'problem', 'ostrzeżenie', 'warning', 'przekroczenie', 'naruszenie'];
  const notes = (step.notes ?? '').toLowerCase();
  return problemKeywords.some((keyword) => notes.includes(keyword));
}

// =============================================================================
// Main Search Function
// =============================================================================

/**
 * Przeszukaj kroki i zwróć wyniki.
 * Wyniki są deterministyczne - zawsze ta sama kolejność dla tych samych danych.
 */
export function searchTraceSteps(
  steps: TraceStep[],
  query: string,
  filters: TraceFilterOptions
): SearchMatch[] {
  const results: SearchMatch[] = [];
  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

  // Pola do przeszukiwania w określonej kolejności (dla determinizmu)
  const searchFields = [
    'title',
    'description',
    'formula_latex',
    'substitution',
    'notes',
    'key',
    'equation_id',
    'inputs',
    'result',
    'phase',
  ];

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];

    // Filtr po fazie
    if (filters.phase !== null && step.phase !== filters.phase) {
      continue;
    }

    // Filtr "tylko problemy"
    if (filters.onlyProblems && !stepHasProblems(step)) {
      continue;
    }

    // Jeśli nie ma query, wszystkie przefiltrowane kroki są wynikami
    if (!hasQuery) {
      results.push({
        stepIndex,
        matchedFields: [],
        matchKey: `step-${stepIndex}`,
      });
      continue;
    }

    // Sprawdź dopasowanie w polach
    const matchedFields: MatchedField[] = [];
    for (const field of searchFields) {
      const fieldMatch = checkFieldMatch(step, field, trimmedQuery);
      if (fieldMatch) {
        matchedFields.push(fieldMatch);
      }
    }

    // Jeśli są dopasowania, dodaj do wyników
    if (matchedFields.length > 0) {
      results.push({
        stepIndex,
        matchedFields,
        matchKey: `step-${stepIndex}`,
      });
    }
  }

  return results;
}

/**
 * Sprawdź czy krok pasuje do wyszukiwania (bez szczegółów).
 */
export function stepMatchesSearch(
  step: TraceStep,
  query: string,
  filters: TraceFilterOptions
): boolean {
  const trimmedQuery = query.trim();

  // Filtr po fazie
  if (filters.phase !== null && step.phase !== filters.phase) {
    return false;
  }

  // Filtr "tylko problemy"
  if (filters.onlyProblems && !stepHasProblems(step)) {
    return false;
  }

  // Jeśli nie ma query, krok pasuje
  if (!trimmedQuery) {
    return true;
  }

  // Sprawdź pełnotekstowe dopasowanie
  const searchableText = getStepSearchableText(step).toLowerCase();
  return searchableText.includes(trimmedQuery.toLowerCase());
}

/**
 * Pobierz indeks następnego wyniku (cyklicznie).
 */
export function getNextResultIndex(
  currentIndex: number,
  totalResults: number
): number {
  if (totalResults === 0) return 0;
  return (currentIndex + 1) % totalResults;
}

/**
 * Pobierz indeks poprzedniego wyniku (cyklicznie).
 */
export function getPrevResultIndex(
  currentIndex: number,
  totalResults: number
): number {
  if (totalResults === 0) return 0;
  return (currentIndex - 1 + totalResults) % totalResults;
}

/**
 * Utwórz początkowy stan wyszukiwania.
 */
export function createInitialSearchState(totalSteps: number): TraceSearchState {
  return {
    query: '',
    filters: {
      phase: null,
      onlyProblems: false,
    },
    results: [],
    activeResultIndex: 0,
    totalSteps,
  };
}

/**
 * Sprawdź czy są dostępne walidacje (do ukrycia filtru "tylko problemy").
 */
export function hasValidationSteps(steps: TraceStep[]): boolean {
  return steps.some((step) => step.phase === 'VALIDATION' || stepHasProblems(step));
}

/**
 * Pobierz unikalne fazy występujące w krokach.
 */
export function getAvailablePhases(steps: TraceStep[]): string[] {
  const phases = new Set<string>();
  for (const step of steps) {
    if (step.phase) {
      phases.add(step.phase);
    }
  }
  // Deterministyczna kolejność
  return Array.from(phases).sort();
}
