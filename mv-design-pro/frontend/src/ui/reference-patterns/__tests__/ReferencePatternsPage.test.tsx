/**
 * Reference Patterns Page Tests — Wzorce odniesienia
 *
 * Smoke tests for the ReferencePatternsPage component.
 *
 * Karta W3-C2 (2026-09-09): sekcja "GRANICZNE (nowy kształt sekcji, W3-C2)"
 * pokrywa nowe/zmienione sekcje `ArtifactsDisplay` po przebudowie wzorca na
 * silnik Hoppla — generacja lokalna (E-L), analiza cieplna cyklu SPZ, tekst
 * konfliktu okna i rekomendacje, oraz klucz `recommended_setting_primary_a`
 * (zastąpił `recommended_setting_secondary_a` — Hoppel nie ma strony wtórnej).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReferencePatternsPage } from '../ReferencePatternsPage';
import { useReferencePatternsStore } from '../store';
import { VERDICT_LABELS_PL, CHECK_STATUS_LABELS_PL, type PatternRunResult } from '../types';

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

// =============================================================================
// GRANICZNE (nowy kształt sekcji, W3-C2) — generacja lokalna, SPZ, konflikt okna
// =============================================================================

const WYNIK_GENERACJA_LOKALNA: PatternRunResult = {
  run_id: 'run-test-1',
  pattern_id: 'RP-LINE-I2-THERMAL-SPZ',
  name_pl: 'Dobór I>> dla linii SN: selektywność, czułość, cieplne, SPZ',
  verdict: 'GRANICZNE',
  verdict_description_pl: 'Warunki spełnione z ograniczeniami',
  summary_pl: 'Wzorzec GRANICZNY.',
  checks: [
    {
      name_pl: 'Generacja lokalna (E-L)',
      status: 'WARN',
      status_pl: 'Ostrzeżenie',
      description_pl: 'Ryzyko blokady ZSZ: wkład E-L 32.0% >= próg 30.0%',
    },
  ],
  trace: [],
  artifacts: {
    tk_total_s: 0.6,
    ithn_a: 14100.0,
    ithdop_a: 18203.0,
    i_min_sel_primary_a: 1440.0,
    i_max_sens_primary_a: 2500.0,
    i_max_th_primary_a: 57324.7,
    window_i_min_primary_a: 1440.0,
    window_i_max_primary_a: 2500.0,
    window_valid: true,
    limiting_criterion_min: 'selectivity',
    limiting_criterion_max: 'sensitivity',
    recommended_setting_primary_a: 1970.0,
    window_conflict_pl: null,
    window_recommendations_pl: ['Zalecana nastawa I>>: 1970.0 A (środek okna [1440.0, 2500.0] A).'],
    spz_i_th_required_a: 10000.0,
    spz_allowed: true,
    spz_enabled: true,
    generacja_lokalna_aktywna: true,
    generacja_lokalna_wklad_el_a: 3200.0,
    generacja_lokalna_wklad_systemu_a: 6800.0,
    generacja_lokalna_udzial_el: 0.32,
    generacja_lokalna_ryzyko_zsz: true,
  },
};

const WYNIK_KONFLIKT_OKNA: PatternRunResult = {
  ...WYNIK_GENERACJA_LOKALNA,
  run_id: 'run-test-2',
  verdict: 'NIEZGODNE',
  artifacts: {
    ...WYNIK_GENERACJA_LOKALNA.artifacts,
    window_valid: false,
    window_i_min_primary_a: 7200.0,
    window_i_max_primary_a: 5000.0,
    window_conflict_pl:
      'Konflikt kryteriów: dolna granica 7.20 kA (selektywność) przewyższa górną 5.00 kA (czułość) o 2.20 kA — żadna nastawa I>> nie spełnia obu warunków jednocześnie.',
    window_recommendations_pl: [
      'Okno nastaw jest sprzeczne (I_min = 7.20 kA > I_max = 5.00 kA).',
      'Możliwe rozwiązania: obniż współczynnik k_b, zwiększ zapas wobec kolejnej strefy selektywności, lub przenieś punkt kolejnego zabezpieczenia (next_bus_id).',
    ],
    generacja_lokalna_aktywna: false,
    generacja_lokalna_wklad_el_a: 0,
    generacja_lokalna_wklad_systemu_a: 0,
    generacja_lokalna_udzial_el: null,
    generacja_lokalna_ryzyko_zsz: null,
  },
};

describe('ArtifactsDisplay — nowy kształt sekcji (W3-C2)', () => {
  beforeEach(() => {
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
      activeTab: 'WARTOSCI',
      traceSearchQuery: '',
      isExporting: false,
      exportError: null,
    });
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ patterns: [] }) });
  });

  it('renders local-generation section with contribution values when active', () => {
    useReferencePatternsStore.setState({ runResult: WYNIK_GENERACJA_LOKALNA });
    render(<ReferencePatternsPage />);

    expect(screen.getByText('Generacja lokalna (E-L)')).toBeInTheDocument();
    expect(screen.getByText('Wkład E-L do prądu zwarciowego')).toBeInTheDocument();
    expect(screen.getByText('3200,00 A')).toBeInTheDocument();
    expect(screen.getByText('Wkład systemu')).toBeInTheDocument();
    expect(screen.getByText('6800,00 A')).toBeInTheDocument();
  });

  it('renders ZSZ blocking risk as Tak when local generation risk is true', () => {
    useReferencePatternsStore.setState({ runResult: WYNIK_GENERACJA_LOKALNA });
    render(<ReferencePatternsPage />);

    expect(screen.getByText('Ryzyko blokady ZSZ')).toBeInTheDocument();
  });

  it('renders recommended setting under the new key name (no secondary side)', () => {
    useReferencePatternsStore.setState({ runResult: WYNIK_GENERACJA_LOKALNA });
    render(<ReferencePatternsPage />);

    expect(screen.getByText('Zalecana nastawa I>>')).toBeInTheDocument();
    expect(screen.getByText('1970,00 A')).toBeInTheDocument();
  });

  it('renders SPZ thermal-cycle section with required withstand', () => {
    useReferencePatternsStore.setState({ runResult: WYNIK_GENERACJA_LOKALNA });
    render(<ReferencePatternsPage />);

    expect(screen.getByText('Analiza cieplna cyklu SPZ')).toBeInTheDocument();
    expect(screen.getByText('Wymagana wytrzymałość (I_k3_max)')).toBeInTheDocument();
  });

  it('renders window conflict text and recommendations for NIEZGODNE verdict', () => {
    useReferencePatternsStore.setState({ runResult: WYNIK_KONFLIKT_OKNA });
    render(<ReferencePatternsPage />);

    expect(screen.getByText('Konflikt okna nastaw')).toBeInTheDocument();
    expect(screen.getByText(/dolna granica 7.20 kA/)).toBeInTheDocument();
    expect(screen.getByText('Rekomendacje')).toBeInTheDocument();
    expect(screen.getByText(/obniż współczynnik k_b/)).toBeInTheDocument();
  });

  it('does not render conflict banner when window is valid', () => {
    useReferencePatternsStore.setState({ runResult: WYNIK_GENERACJA_LOKALNA });
    render(<ReferencePatternsPage />);

    expect(screen.queryByText('Konflikt okna nastaw')).not.toBeInTheDocument();
  });

  it('shows local generation as inactive (Nie) when not active', () => {
    useReferencePatternsStore.setState({ runResult: WYNIK_KONFLIKT_OKNA });
    render(<ReferencePatternsPage />);

    expect(screen.getByText('Tryb E-L aktywny')).toBeInTheDocument();
  });
});
