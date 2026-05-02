import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../network-build/networkBuildStore', () => ({
  useNetworkBuildDerived: () => ({
    buildPhase: 'NO_SOURCE',
    buildPhaseLabel: 'Brak źródła zasilania',
    sourceCount: 0,
    trunkCount: 0,
    branchCount: 0,
    stationCount: 0,
    transformerCount: 0,
    generatorCount: 0,
    isReady: false,
    ozeSourceSummaries: [],
    stationSummaries: [],
    transformerSummaries: [],
  }),
}));

vi.mock('../../../shared/generatorTypeLabels', () => ({
  formatGeneratorTypeShortLabelPl: (t: string) => t,
}));

import { OzContextPanel } from '../OzContextPanel';
import { SchematContextPanel } from '../SchematContextPanel';
import { WynikiContextPanel } from '../WynikiContextPanel';

describe('context-panel-empty-states - stany puste z przyczyną i akcją', () => {
  it('panel Źródła i przyłączenia pokazuje przyczynę oraz akcję naprawczą', () => {
    render(<OzContextPanel />);
    expect(screen.getByText(/Brak źródeł przyłączonych/)).toBeInTheDocument();
    expect(screen.getByText(/Warunek przejścia/)).toBeInTheDocument();
    expect(screen.getByTestId('oz-empty-go-model')).toBeInTheDocument();
  });

  it('panel Schemat i topologia prowadzi do Modelu sieci z pustej kanwy', () => {
    render(<SchematContextPanel />);
    expect(screen.getByText(/Start pustej kanwy/)).toBeInTheDocument();
    expect(screen.getByText(/Dodaj GPZ jako pierwszy element modelu/)).toBeInTheDocument();
    expect(screen.getByText(/Przejdź do budowy GPZ/)).toBeInTheDocument();
    expect(screen.getByTestId('schemat-action-go-model')).toBeInTheDocument();
  });

  it('panel Wyniki i analizy prowadzi do Studiów obliczeniowych, gdy nie ma wyników', () => {
    render(<WynikiContextPanel />);
    expect(screen.getByText(/Warunek przejścia/)).toBeInTheDocument();
    expect(screen.getByTestId('wyniki-action-go-studies')).toBeInTheDocument();
  });
});
