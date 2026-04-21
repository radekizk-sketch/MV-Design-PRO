import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticsOverlay } from '../DiagnosticsOverlay';
import { buildOverlayPositionMaps } from '../overlayUtils';

const useFilteredSanityChecksMock = vi.fn();

vi.mock('../../protection', () => ({
  useFilteredSanityChecks: (...args: unknown[]) => useFilteredSanityChecksMock(...args),
  SEVERITY_COLORS: {
    ERROR: { marker: 'bg-rose-500', border: 'border-rose-600' },
    WARN: { marker: 'bg-amber-500', border: 'border-amber-600' },
    INFO: { marker: 'bg-sky-500', border: 'border-sky-600' },
  },
  SEVERITY_LABELS_PL: {
    ERROR: 'Błąd',
    WARN: 'Ostrzeżenie',
    INFO: 'Informacja',
  },
  SANITY_CHECK_CODE_LABELS_PL: {
    CHECK_A: 'Kontrola A',
  },
}));

vi.mock('../DiagnosticsLegend', () => ({
  DiagnosticsLegend: () => <div data-testid="sld-diagnostics-legend">Legenda</div>,
}));

vi.mock('../overlayUtils', () => ({
  buildOverlayPositionMaps: vi.fn(() => ({
    nodePositions: new Map(),
    branchPositions: new Map(),
  })),
}));

const mockedBuildOverlayPositionMaps = vi.mocked(buildOverlayPositionMaps);

const viewport = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
};

const errorDiagnostics = {
  element_id: 'bus1',
  element_type: 'Bus',
  max_severity: 'ERROR',
  error_count: 1,
  warn_count: 0,
  info_count: 0,
  results: [{ code: 'CHECK_A' }],
};

describe('DiagnosticsOverlay', () => {
  beforeEach(() => {
    useFilteredSanityChecksMock.mockReset();
    mockedBuildOverlayPositionMaps.mockReturnValue({
      nodePositions: new Map(),
      branchPositions: new Map(),
    });
  });

  it('pokazuje jawną blokadę po polsku, gdy brak diagnostyki', () => {
    useFilteredSanityChecksMock.mockReturnValue({
      filteredByElement: new Map(),
      errorCount: 0,
      warnCount: 0,
      infoCount: 0,
      hasResults: false,
    });

    render(
      <DiagnosticsOverlay
        symbols={[]}
        viewport={viewport}
        visible={true}
        filter="ALL"
        onMarkerClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('sld-diagnostics-overlay-empty-state')).toHaveTextContent(
      'Brak diagnostyki do wyświetlenia dla aktywnego widoku.',
    );
    expect(screen.queryByTestId('sld-diagnostics-overlay-unmapped-state')).not.toBeInTheDocument();
  });

  it('pokazuje jawną blokadę po polsku, gdy markery nie mają geometrii', () => {
    useFilteredSanityChecksMock.mockReturnValue({
      filteredByElement: new Map([['bus1', errorDiagnostics]]),
      errorCount: 1,
      warnCount: 0,
      infoCount: 0,
      hasResults: true,
    });

    render(
      <DiagnosticsOverlay
        symbols={[]}
        viewport={viewport}
        visible={true}
        filter="ALL"
        onMarkerClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('sld-diagnostics-overlay-unmapped-state')).toHaveTextContent(
      'nie udało się powiązać markerów z geometrią schematu',
    );
    expect(screen.getByTestId('sld-diagnostics-legend')).toBeInTheDocument();
  });

  it('kliknięcie markera prowadzi do realnego efektu wyboru elementu', () => {
    const onMarkerClick = vi.fn();
    useFilteredSanityChecksMock.mockReturnValue({
      filteredByElement: new Map([['bus1', errorDiagnostics]]),
      errorCount: 1,
      warnCount: 0,
      infoCount: 0,
      hasResults: true,
    });
    mockedBuildOverlayPositionMaps.mockReturnValue({
      nodePositions: new Map([['bus1', { x: 40, y: 50 }]]),
      branchPositions: new Map(),
    });

    render(
      <DiagnosticsOverlay
        symbols={[]}
        viewport={viewport}
        visible={true}
        filter="ALL"
        onMarkerClick={onMarkerClick}
      />,
    );

    fireEvent.click(screen.getByTestId('sld-diagnostics-marker-bus1-CHECK_A'));

    expect(onMarkerClick).toHaveBeenCalledWith({
      id: 'bus1',
      type: 'Bus',
      name: 'bus1',
    });
  });
});
