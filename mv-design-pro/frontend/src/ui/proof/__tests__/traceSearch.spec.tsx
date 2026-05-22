/**
 * Test: traceSearch module
 *
 * Tests for the trace search and filter functionality.
 * Verifies deterministic search, filters, and navigation.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  searchTraceSteps,
  stepMatchesSearch,
  getNextResultIndex,
  getPrevResultIndex,
  hasValidationSteps,
  getAvailablePhases,
  type TraceFilterOptions,
} from '../search/traceSearch';
import { TraceSearchBar } from '../search/TraceSearchBar';
import type { TraceStep } from '../../results-inspector/types';

// =============================================================================
// Test Fixtures
// =============================================================================

const mockSteps: TraceStep[] = [
  {
    step: 1,
    key: 'calc_z',
    title: 'Obliczenie impedancji Thevenina',
    phase: 'CALCULATION',
    formula_latex: 'Z_{th} = \\sqrt{R^2 + X^2}',
    inputs: {
      r_ohm: { value: 0.5, unit: 'Ω', label: 'Rezystancja' },
      x_ohm: { value: 2.5, unit: 'Ω', label: 'Reaktancja' },
    },
    substitution: 'Z_{th} = √(0.5² + 2.5²)',
    result: {
      z_thevenin_ohm: { value: 2.55, unit: 'Ω', label: 'Impedancja Thevenina' },
    },
    notes: 'Impedancja wyznaczona metodą składowych symetrycznych',
  },
  {
    step: 2,
    key: 'calc_ikss',
    title: 'Obliczenie prądu zwarciowego Ik"',
    phase: 'CALCULATION',
    formula_latex: "I_k'' = c \\cdot U_n / (\\sqrt{3} \\cdot Z_{th})",
    inputs: {
      c_un_kv: { value: 121, unit: 'kV', label: 'Napięcie źródłowe' },
      z_thevenin_ohm: { value: 2.55, unit: 'Ω', label: 'Impedancja Thevenina' },
    },
    result: {
      ikss_ka: { value: 27.38, unit: 'kA', label: 'Prąd zwarciowy początkowy' },
    },
  },
  {
    step: 3,
    key: 'validate_limits',
    title: 'Weryfikacja limitów prądowych',
    phase: 'VALIDATION',
    notes: 'Błąd: przekroczono dopuszczalną wartość prądu',
  },
  {
    step: 4,
    key: 'output_results',
    title: 'Wyniki końcowe',
    phase: 'OUTPUT',
  },
];

const defaultFilters: TraceFilterOptions = {
  phase: null,
  onlyProblems: false,
};

// =============================================================================
// searchTraceSteps Tests
// =============================================================================

describe('searchTraceSteps', () => {
  it('returns all steps when query is empty', () => {
    const results = searchTraceSteps(mockSteps, '', defaultFilters);

    expect(results).toHaveLength(4);
    expect(results[0].stepIndex).toBe(0);
    expect(results[1].stepIndex).toBe(1);
    expect(results[2].stepIndex).toBe(2);
    expect(results[3].stepIndex).toBe(3);
  });

  it('searches in title (case-insensitive)', () => {
    const results = searchTraceSteps(mockSteps, 'impedancji', defaultFilters);

    expect(results).toHaveLength(1);
    expect(results[0].stepIndex).toBe(0);
    expect(results[0].matchedFields.some((f) => f.field === 'title')).toBe(true);
  });

  it('searches in formula_latex', () => {
    const results = searchTraceSteps(mockSteps, 'sqrt', defaultFilters);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].matchedFields.some((f) => f.field === 'formula_latex')).toBe(true);
  });

  it('searches in notes', () => {
    const results = searchTraceSteps(mockSteps, 'symetrycznych', defaultFilters);

    expect(results).toHaveLength(1);
    expect(results[0].stepIndex).toBe(0);
    expect(results[0].matchedFields.some((f) => f.field === 'notes')).toBe(true);
  });

  it('searches in inputs', () => {
    const results = searchTraceSteps(mockSteps, 'Rezystancja', defaultFilters);

    expect(results).toHaveLength(1);
    expect(results[0].stepIndex).toBe(0);
    expect(results[0].matchedFields.some((f) => f.field === 'inputs')).toBe(true);
  });

  it('searches in result', () => {
    const results = searchTraceSteps(mockSteps, 'zwarciowy', defaultFilters);

    expect(results).toHaveLength(1);
    expect(results[0].stepIndex).toBe(1);
    expect(results[0].matchedFields.some((f) => f.field === 'result')).toBe(true);
  });

  it('searches in key identifier', () => {
    const results = searchTraceSteps(mockSteps, 'calc_z', defaultFilters);

    expect(results).toHaveLength(1);
    expect(results[0].stepIndex).toBe(0);
    expect(results[0].matchedFields.some((f) => f.field === 'key')).toBe(true);
  });

  it('returns deterministic results (same input = same output)', () => {
    const results1 = searchTraceSteps(mockSteps, 'obliczenie', defaultFilters);
    const results2 = searchTraceSteps(mockSteps, 'obliczenie', defaultFilters);

    expect(results1).toEqual(results2);
  });

  it('filters by phase', () => {
    const filters: TraceFilterOptions = {
      phase: 'VALIDATION',
      onlyProblems: false,
    };
    const results = searchTraceSteps(mockSteps, '', filters);

    expect(results).toHaveLength(1);
    expect(results[0].stepIndex).toBe(2);
  });

  it('filters by onlyProblems', () => {
    const filters: TraceFilterOptions = {
      phase: null,
      onlyProblems: true,
    };
    const results = searchTraceSteps(mockSteps, '', filters);

    expect(results).toHaveLength(1);
    expect(results[0].stepIndex).toBe(2); // VALIDATION step with "błąd" in notes
  });

  it('combines query and filters', () => {
    const filters: TraceFilterOptions = {
      phase: 'CALCULATION',
      onlyProblems: false,
    };
    const results = searchTraceSteps(mockSteps, 'prądu', filters);

    expect(results).toHaveLength(1);
    expect(results[0].stepIndex).toBe(1); // Only "Obliczenie prądu zwarciowego" matches both
  });

  it('assigns unique matchKey to each result', () => {
    const results = searchTraceSteps(mockSteps, '', defaultFilters);
    const keys = results.map((r) => r.matchKey);
    const uniqueKeys = new Set(keys);

    expect(uniqueKeys.size).toBe(results.length);
  });
});

// =============================================================================
// stepMatchesSearch Tests
// =============================================================================

describe('stepMatchesSearch', () => {
  it('returns true when query matches title', () => {
    expect(stepMatchesSearch(mockSteps[0], 'impedancji', defaultFilters)).toBe(true);
  });

  it('returns false when query does not match', () => {
    expect(stepMatchesSearch(mockSteps[0], 'nonexistent', defaultFilters)).toBe(false);
  });

  it('returns true when no query (empty string)', () => {
    expect(stepMatchesSearch(mockSteps[0], '', defaultFilters)).toBe(true);
  });

  it('respects phase filter', () => {
    const filters: TraceFilterOptions = {
      phase: 'OUTPUT',
      onlyProblems: false,
    };
    expect(stepMatchesSearch(mockSteps[0], '', filters)).toBe(false); // CALCULATION phase
    expect(stepMatchesSearch(mockSteps[3], '', filters)).toBe(true); // OUTPUT phase
  });

  it('respects onlyProblems filter', () => {
    const filters: TraceFilterOptions = {
      phase: null,
      onlyProblems: true,
    };
    expect(stepMatchesSearch(mockSteps[0], '', filters)).toBe(false); // No problems
    expect(stepMatchesSearch(mockSteps[2], '', filters)).toBe(true); // VALIDATION with "błąd"
  });
});

// =============================================================================
// Navigation Tests
// =============================================================================

describe('getNextResultIndex', () => {
  it('returns next index', () => {
    expect(getNextResultIndex(0, 5)).toBe(1);
    expect(getNextResultIndex(2, 5)).toBe(3);
  });

  it('wraps around at end', () => {
    expect(getNextResultIndex(4, 5)).toBe(0);
  });

  it('returns 0 when no results', () => {
    expect(getNextResultIndex(0, 0)).toBe(0);
  });
});

describe('getPrevResultIndex', () => {
  it('returns previous index', () => {
    expect(getPrevResultIndex(3, 5)).toBe(2);
    expect(getPrevResultIndex(1, 5)).toBe(0);
  });

  it('wraps around at start', () => {
    expect(getPrevResultIndex(0, 5)).toBe(4);
  });

  it('returns 0 when no results', () => {
    expect(getPrevResultIndex(0, 0)).toBe(0);
  });
});

// =============================================================================
// Helper Functions Tests
// =============================================================================

describe('hasValidationSteps', () => {
  it('returns true when VALIDATION phase exists', () => {
    expect(hasValidationSteps(mockSteps)).toBe(true);
  });

  it('returns false when no validation steps', () => {
    const stepsWithoutValidation = mockSteps.filter((s) => s.phase !== 'VALIDATION');
    expect(hasValidationSteps(stepsWithoutValidation)).toBe(false);
  });

  it('returns true when notes contain problem keywords', () => {
    const stepsWithProblem: TraceStep[] = [
      { step: 1, title: 'Test', notes: 'Ostrzeżenie: wartość zbyt wysoka' },
    ];
    expect(hasValidationSteps(stepsWithProblem)).toBe(true);
  });
});

describe('getAvailablePhases', () => {
  it('returns unique phases in sorted order', () => {
    const phases = getAvailablePhases(mockSteps);

    expect(phases).toContain('CALCULATION');
    expect(phases).toContain('VALIDATION');
    expect(phases).toContain('OUTPUT');
    expect(phases).toHaveLength(3);
  });

  it('returns empty array when no phases', () => {
    const stepsWithoutPhase: TraceStep[] = [{ step: 1, title: 'Test' }];
    const phases = getAvailablePhases(stepsWithoutPhase);

    expect(phases).toHaveLength(0);
  });

  it('returns deterministic order', () => {
    const phases1 = getAvailablePhases(mockSteps);
    const phases2 = getAvailablePhases(mockSteps);

    expect(phases1).toEqual(phases2);
  });
});

// =============================================================================
// TraceSearchBar Tests
// =============================================================================

describe('TraceSearchBar', () => {
  const defaultProps = {
    query: '',
    onQueryChange: vi.fn(),
    filters: defaultFilters,
    onFiltersChange: vi.fn(),
    results: [],
    activeResultIndex: 0,
    onNavigateToResult: vi.fn(),
    availablePhases: ['CALCULATION', 'VALIDATION', 'OUTPUT'],
    showProblemsFilter: true,
  };

  it('renders search input with correct testid', () => {
    render(<TraceSearchBar {...defaultProps} />);

    expect(screen.getByTestId('trace-search-input')).toBeInTheDocument();
  });

  it('renders search input with Polish placeholder', () => {
    render(<TraceSearchBar {...defaultProps} />);

    expect(screen.getByPlaceholderText('Szukaj w śladzie obliczeń...')).toBeInTheDocument();
  });

  it('calls onQueryChange when typing', () => {
    const onQueryChange = vi.fn();
    render(<TraceSearchBar {...defaultProps} onQueryChange={onQueryChange} />);

    fireEvent.change(screen.getByTestId('trace-search-input'), {
      target: { value: 'test query' },
    });

    expect(onQueryChange).toHaveBeenCalledWith('test query');
  });

  it('shows navigation buttons when query is present', () => {
    render(<TraceSearchBar {...defaultProps} query="test" />);

    expect(screen.getByTestId('trace-search-prev')).toBeInTheDocument();
    expect(screen.getByTestId('trace-search-next')).toBeInTheDocument();
  });

  it('hides navigation buttons when query is empty', () => {
    render(<TraceSearchBar {...defaultProps} query="" />);

    expect(screen.queryByTestId('trace-search-prev')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-search-next')).not.toBeInTheDocument();
  });

  it('shows result count', () => {
    const results = [
      { stepIndex: 0, matchedFields: [], matchKey: 'step-0' },
      { stepIndex: 1, matchedFields: [], matchKey: 'step-1' },
    ];
    render(
      <TraceSearchBar
        {...defaultProps}
        query="test"
        results={results}
        activeResultIndex={0}
      />
    );

    expect(screen.getByTestId('trace-search-count')).toHaveTextContent('1 z 2');
  });

  it('shows "Nie znaleziono wyników" when no results', () => {
    render(<TraceSearchBar {...defaultProps} query="test" results={[]} />);

    expect(screen.getByTestId('trace-search-count')).toHaveTextContent('Nie znaleziono wyników');
  });

  it('calls onNavigateToResult with next index when clicking next', () => {
    const onNavigateToResult = vi.fn();
    const results = [
      { stepIndex: 0, matchedFields: [], matchKey: 'step-0' },
      { stepIndex: 1, matchedFields: [], matchKey: 'step-1' },
    ];
    render(
      <TraceSearchBar
        {...defaultProps}
        query="test"
        results={results}
        activeResultIndex={0}
        onNavigateToResult={onNavigateToResult}
      />
    );

    fireEvent.click(screen.getByTestId('trace-search-next'));

    expect(onNavigateToResult).toHaveBeenCalledWith(1);
  });

  it('calls onNavigateToResult with prev index when clicking prev', () => {
    const onNavigateToResult = vi.fn();
    const results = [
      { stepIndex: 0, matchedFields: [], matchKey: 'step-0' },
      { stepIndex: 1, matchedFields: [], matchKey: 'step-1' },
    ];
    render(
      <TraceSearchBar
        {...defaultProps}
        query="test"
        results={results}
        activeResultIndex={1}
        onNavigateToResult={onNavigateToResult}
      />
    );

    fireEvent.click(screen.getByTestId('trace-search-prev'));

    expect(onNavigateToResult).toHaveBeenCalledWith(0);
  });

  it('renders phase filter with Polish labels', () => {
    render(<TraceSearchBar {...defaultProps} />);

    expect(screen.getByTestId('trace-filter-phase')).toBeInTheDocument();
    expect(screen.getByText('Wszystkie')).toBeInTheDocument();
    expect(screen.getByText('Obliczenia')).toBeInTheDocument();
    expect(screen.getByText('Walidacja')).toBeInTheDocument();
    expect(screen.getByText('Wyniki')).toBeInTheDocument();
  });

  it('calls onFiltersChange when phase filter changes', () => {
    const onFiltersChange = vi.fn();
    render(<TraceSearchBar {...defaultProps} onFiltersChange={onFiltersChange} />);

    fireEvent.change(screen.getByTestId('trace-filter-phase'), {
      target: { value: 'VALIDATION' },
    });

    expect(onFiltersChange).toHaveBeenCalledWith({
      phase: 'VALIDATION',
      onlyProblems: false,
    });
  });

  it('renders "Tylko problemy" checkbox when showProblemsFilter is true', () => {
    render(<TraceSearchBar {...defaultProps} showProblemsFilter={true} />);

    expect(screen.getByTestId('trace-filter-problems')).toBeInTheDocument();
    expect(screen.getByText('Tylko problemy')).toBeInTheDocument();
  });

  it('hides "Tylko problemy" checkbox when showProblemsFilter is false', () => {
    render(<TraceSearchBar {...defaultProps} showProblemsFilter={false} />);

    expect(screen.queryByTestId('trace-filter-problems')).not.toBeInTheDocument();
  });

  it('calls onFiltersChange when "Tylko problemy" is toggled', () => {
    const onFiltersChange = vi.fn();
    render(<TraceSearchBar {...defaultProps} onFiltersChange={onFiltersChange} />);

    fireEvent.click(screen.getByTestId('trace-filter-problems'));

    expect(onFiltersChange).toHaveBeenCalledWith({
      phase: null,
      onlyProblems: true,
    });
  });
});

// =============================================================================
// No Codenames Test
// =============================================================================

describe('No Codenames in Search Module', () => {
  it('does not expose codenames in search results', () => { // no-codenames-ignore
    // Search for potential codenames
    const results = searchTraceSteps(mockSteps, '', defaultFilters);

    // Verify matchKey format doesn't contain codenames
    for (const result of results) {
      expect(result.matchKey).not.toContain('P11'); // no-codenames-ignore
      expect(result.matchKey).not.toContain('P14'); // no-codenames-ignore
      expect(result.matchKey).not.toContain('P17'); // no-codenames-ignore
    }
  });
});
