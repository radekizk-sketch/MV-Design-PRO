/**
 * Tests for PR-15: RunResultsInspector component
 *
 * Tests:
 * - test_results_inspector_renders_metrics_and_badges
 * - test_results_inspector_empty_state
 * - test_results_inspector_search_filter
 * - test_results_inspector_global_metrics
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { RunResultsInspector } from '../RunResultsInspector';
import type { ResultSetV1 } from '../../contracts/results';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeResultSet(
  overrides: Partial<ResultSetV1> = {},
): ResultSetV1 {
  return {
    contract_version: '1.0',
    run_id: 'test-run-001',
    analysis_type: 'SC_3F',
    solver_input_hash: 'a'.repeat(64),
    created_at: '2024-01-01T00:00:00Z',
    deterministic_signature: 'b'.repeat(64),
    global_results: { total_ikss_max_ka: 15.2 },
    element_results: [],
    overlay_payload: {
      elements: {
        'bus-1': {
          ref_id: 'bus-1',
          kind: 'bus',
          badges: [
            { label: 'BRAK KATALOGU', severity: 'WARNING', code: 'MISSING_CAT' },
          ],
          metrics: {
            IK_3F_A: {
              code: 'IK_3F_A',
              value: 12500,
              unit: 'A',
              format_hint: 'fixed0',
              source: 'solver',
            },
          },
          severity: 'WARNING',
        },
        'branch-1': {
          ref_id: 'branch-1',
          kind: 'branch',
          badges: [],
          metrics: {
            I_A: {
              code: 'I_A',
              value: 350.0,
              unit: 'A',
              format_hint: 'fixed1',
              source: 'solver',
            },
          },
          severity: 'INFO',
        },
      },
      legend: {
        title: 'Legenda wyników',
        entries: [
          { severity: 'INFO', label: 'Poprawne', description: 'OK' },
          { severity: 'WARNING', label: 'Ostrzeżenie', description: 'Uwaga' },
        ],
      },
      warnings: [
        {
          code: 'W-RDY-001',
          message: 'Obliczenia gotowe',
          severity: 'INFO',
          element_ref: null,
        },
      ],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RunResultsInspector', () => {
  it('renders metrics and badges for elements', () => {
    const rs = makeResultSet();
    render(<RunResultsInspector resultset={rs} />);

    // Inspector title
    expect(screen.getByTestId('inspector-title')).toHaveTextContent(
      'Wyniki analizy',
    );

    // Element cards
    const cards = screen.getAllByTestId('element-card');
    expect(cards.length).toBe(2);

    // Badge chip
    const badges = screen.getAllByTestId('badge-chip');
    expect(badges.length).toBe(1);
    expect(badges[0]).toHaveTextContent('BRAK KATALOGU');

    // Metric rows
    const metricRows = screen.getAllByTestId('metric-row');
    expect(metricRows.length).toBe(2); // IK_3F_A + I_A
  });

  it('renders empty state when resultset is null', () => {
    render(<RunResultsInspector resultset={null} />);

    expect(screen.getByTestId('inspector-empty')).toHaveTextContent(
      'Wyniki nie są dostępne do wyświetlenia',
    );
  });

  it('filters elements by search query', () => {
    const rs = makeResultSet();
    render(<RunResultsInspector resultset={rs} />);

    const searchInput = screen.getByTestId('element-search');

    // Initially both elements visible
    expect(screen.getAllByTestId('element-card').length).toBe(2);

    // Search for "bus"
    fireEvent.change(searchInput, { target: { value: 'bus' } });
    expect(screen.getAllByTestId('element-card').length).toBe(1);

    // Search for "xyz" — no results
    fireEvent.change(searchInput, { target: { value: 'xyz' } });
    expect(screen.getByTestId('no-results')).toHaveTextContent(
      'Brak elementów pasujących do wyszukiwania',
    );
  });

  it('renders global metrics section', () => {
    const rs = makeResultSet();
    render(<RunResultsInspector resultset={rs} />);

    const globalSection = screen.getByTestId('global-metrics-section');
    expect(globalSection).toBeInTheDocument();

    const globalRows = screen.getAllByTestId('global-metric-row');
    expect(globalRows.length).toBe(1);
  });

  it('renders warnings section', () => {
    const rs = makeResultSet();
    render(<RunResultsInspector resultset={rs} />);

    const warningsSection = screen.getByTestId('warnings-section');
    expect(warningsSection).toBeInTheDocument();

    const warningItems = screen.getAllByTestId('warning-item');
    expect(warningItems.length).toBe(1);
    expect(warningItems[0]).toHaveTextContent('Obliczenia gotowe');
  });

  it('renders legend section', () => {
    const rs = makeResultSet();
    render(<RunResultsInspector resultset={rs} />);

    const legendSection = screen.getByTestId('legend-section');
    expect(legendSection).toBeInTheDocument();

    const legendEntries = screen.getAllByTestId('legend-entry');
    expect(legendEntries.length).toBe(2);
  });

  it('does not render warnings section when no warnings', () => {
    const rs = makeResultSet({
      overlay_payload: {
        ...makeResultSet().overlay_payload,
        warnings: [],
      },
    });
    render(<RunResultsInspector resultset={rs} />);

    expect(screen.queryByTestId('warnings-section')).not.toBeInTheDocument();
  });
});
