import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  derived: {
    buildPhase: 'READY',
    buildPhaseLabel: 'Układ skonfigurowany',
    blockersByCategory: { total: 0, topologia: 0, katalogi: 0, eksploatacja: 0 },
    isReady: true,
    // V12K-319 (karta X3): licznik zero znaczy „bez zagadnien" WYLACZNIE wtedy,
    // gdy gotowosc zostala ustalona. Atrapa bez tego pola opisywala stan, ktory
    // w produkcji jest nieustalona gotowoscia — i mimo to oczekiwala zielonego
    // werdyktu, czyli przypinala defekt zamiast zachowania.
    readinessUstalona: true,
  },
  snapshot: {
    buses: [{}],
    branches: [{}],
    transformers: [{}],
    generators: [{}],
    substations: [{}],
  },
}));

vi.mock('../networkBuildStore', () => ({
  selectFieldStationCount: (snapshot: { substations?: Array<{ station_type?: string }> } | null) =>
    (snapshot?.substations ?? []).filter(
      (station) => String(station.station_type ?? '').toLowerCase() !== 'gpz',
    ).length,
  useNetworkBuildDerived: () => mocks.derived,
}));

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: any) => selector({ snapshot: mocks.snapshot }),
}));

import { TopContextBar } from '../TopContextBar';

describe('TopContextBar', () => {
  beforeEach(() => {
    mocks.derived = {
      buildPhase: 'READY',
      buildPhaseLabel: 'Układ skonfigurowany',
      blockersByCategory: { total: 0, topologia: 0, katalogi: 0, eksploatacja: 0 },
      isReady: true,
      readinessUstalona: true,
    };
  });

  it('pokazuje język konfiguracji układu bez blokad i modelowego statusu', () => {
    const { container } = render(<TopContextBar projectName="Projekt testowy" caseName="Zakres SN" />);

    expect(screen.getByText('Układ bez zagadnień konfiguracji')).toBeInTheDocument();
    expect(screen.getByText('Układ do analizy')).toBeInTheDocument();
    expect(screen.getByText('Kontrola')).toBeInTheDocument();
    expect(screen.getByText('odcinki SN')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/blokad|Model gotowy|Model w toku|gałęzie|galezie|Przeglądy|Przeglady/u);
  });

  it('zastępuje blokady zagadnieniami konfiguracji', () => {
    mocks.derived = {
      buildPhase: 'HAS_STATIONS',
      buildPhaseLabel: 'Układ w konfiguracji',
      blockersByCategory: { total: 3, topologia: 1, katalogi: 1, eksploatacja: 1 },
      isReady: false,
      readinessUstalona: true,
    };

    const { container } = render(<TopContextBar projectName="Projekt testowy" />);

    expect(screen.getByText(/3 zagadnień konfiguracji/)).toBeInTheDocument();
    expect(screen.getAllByText('Układ w konfiguracji').length).toBeGreaterThan(0);
    expect(container.textContent ?? '').not.toMatch(/blokad|Model gotowy|Model w toku/u);
  });
  it('gotowosc NIEUSTALONA → zamiast zielonej plakietki mowi, ze nie ustalono', () => {
    mocks.derived = {
      buildPhase: 'READY',
      buildPhaseLabel: 'Układ skonfigurowany',
      // Zera z BRAKU POMIARU wygladaja identycznie jak zera z pomiaru —
      // rozroznia je wylacznie sygnal ustalonej gotowosci.
      blockersByCategory: { total: 0, topologia: 0, katalogi: 0, eksploatacja: 0 },
      isReady: false,
      readinessUstalona: false,
    };

    render(<TopContextBar projectName="Projekt testowy" />);

    expect(screen.getByTestId('top-context-gotowosc-nieustalona')).toBeInTheDocument();
    expect(screen.queryByText('Układ bez zagadnień konfiguracji')).toBeNull();
  });
});
