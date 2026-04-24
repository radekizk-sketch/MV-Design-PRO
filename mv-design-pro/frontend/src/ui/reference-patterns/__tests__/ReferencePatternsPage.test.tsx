/**
 * Reference Patterns Page Tests — Wzorce odniesienia
 *
 * Smoke tests for the ReferencePatternsPage component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReferencePatternsPage } from '../ReferencePatternsPage';
import { useReferencePatternsStore } from '../store';
import { VERDICT_LABELS_PL, CHECK_STATUS_LABELS_PL } from '../types';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ReferencePatternsPage', () => {
  beforeEach(() => {
    // Reset store before each test
    useReferencePatternsStore.setState({
      patterns: [],
      selectedPatternId: null,
      isLoadingPatterns: false,
      fixtures: [],
      selectedFixtureId: null,
      isLoadingFixtures: false,
      runResult: null,
      isRunningPattern: false,
      runError: null,
      activeTab: 'WYNIK',
      traceSearchQuery: '',
      isExporting: false,
      exportError: null,
    });

    // Mock fetch to return empty patterns
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ patterns: [] }),
    });
  });

  it('renders the page title', () => {
    render(<ReferencePatternsPage />);
    expect(screen.getByText('Wzorce odniesienia')).toBeInTheDocument();
  });

  it('renders empty state when no result', () => {
    render(<ReferencePatternsPage />);
    expect(
      screen.getByText(/Wybierz wariant referencyjny/)
    ).toBeInTheDocument();
  });

  it('renders tabs correctly', () => {
    render(<ReferencePatternsPage />);
    expect(screen.getByText('Wynik')).toBeInTheDocument();
    expect(screen.getByText('Checki')).toBeInTheDocument();
    expect(screen.getByText('Wartości pośrednie')).toBeInTheDocument();
    expect(screen.getByText('Ślad obliczeń')).toBeInTheDocument();
  });
});

describe('Verdict badges', () => {
  it('maps ZGODNE to correct Polish label', () => {
    expect(VERDICT_LABELS_PL['ZGODNE']).toBe('Zgodne');
  });

  it('maps GRANICZNE to correct Polish label', () => {
    expect(VERDICT_LABELS_PL['GRANICZNE']).toBe('Na granicy dopuszczalności');
  });

  it('maps NIEZGODNE to correct Polish label', () => {
    expect(VERDICT_LABELS_PL['NIEZGODNE']).toBe('Wymaga korekty');
  });
});

describe('Check status labels', () => {
  it('maps PASS to Spełnione', () => {
    expect(CHECK_STATUS_LABELS_PL['PASS']).toBe('Spełnione');
  });

  it('maps FAIL to Niespełnione', () => {
    expect(CHECK_STATUS_LABELS_PL['FAIL']).toBe('Niespełnione');
  });

  it('maps WARN to Ostrzeżenie', () => {
    expect(CHECK_STATUS_LABELS_PL['WARN']).toBe('Ostrzeżenie');
  });

  it('maps INFO to Informacja', () => {
    expect(CHECK_STATUS_LABELS_PL['INFO']).toBe('Informacja');
  });
});
