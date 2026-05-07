import { act, render, screen } from '@testing-library/react';
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
import { useSnapshotStore } from '../../../topology/snapshotStore';

describe('context-panel-empty-states - stany puste z przyczyną i akcją', () => {
  it('panel Źródła i przyłączenia pokazuje przyczynę oraz akcję naprawczą', () => {
    render(<OzContextPanel />);
    expect(screen.getByText(/Brak źródeł przyłączonych/)).toBeInTheDocument();
    expect(screen.getByText(/Warunek przejścia/)).toBeInTheDocument();
    expect(screen.getByTestId('oz-empty-go-model')).toBeInTheDocument();
  });

  it('panel Schemat i topologia prowadzi do Modelu sieci z pustej kanwy', () => {
    act(() => {
      useSnapshotStore.getState().reset();
    });
    const { container } = render(<SchematContextPanel />);
    expect(screen.getByText(/Start pustej kanwy/)).toBeInTheDocument();
    expect(screen.getByText(/Dodaj GPZ jako pierwszy element modelu/)).toBeInTheDocument();
    expect(screen.getByText(/Wybierz albo utwórz zakres obliczeń/)).toBeInTheDocument();
    expect(screen.getByText(/Przejdź do budowy GPZ/)).toBeInTheDocument();
    expect(screen.getByTestId('schemat-action-go-model')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/snapshot|Przypadek/i);
  });

  it('panel Schemat i topologia nie pokazuje technicznego snapshotu przy pustej wersji modelu', () => {
    act(() => {
      useSnapshotStore.setState({
        snapshot: {
          header: { hash_sha256: 'hash-e2e' },
          sources: [],
          buses: [],
          bays: [],
          branches: [],
          substations: [],
          transformers: [],
          generators: [],
          loads: [],
        } as any,
        readiness: null,
      });
    });

    const { container } = render(<SchematContextPanel />);

    expect(screen.getByText(/Aktualna wersja modelu nie zawiera elementów schematu/)).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/snapshot|Przypadek/i);

    act(() => {
      useSnapshotStore.getState().reset();
    });
  });

  it('panel Wyniki i analizy prowadzi do Studiów obliczeniowych, gdy nie ma wyników', () => {
    render(<WynikiContextPanel />);
    expect(screen.getByText(/Warunek przejścia/)).toBeInTheDocument();
    expect(screen.getByTestId('wyniki-action-go-studies')).toBeInTheDocument();
  });
});
