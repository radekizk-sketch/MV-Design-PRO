import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../network-build/ProcessPanel', () => ({
  ProcessPanel: () => <div data-testid="mock-process-panel">ProcessPanel</div>,
}));

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
  useNetworkBuildStore: () => ({}),
}));

vi.mock('../../../study-cases/StudyCaseList', () => ({
  StudyCaseList: () => <div data-testid="mock-study-case-list">StudyCaseList</div>,
}));

vi.mock('../../../study-cases/RunHistoryPanel', () => ({
  RunHistoryPanel: () => <div data-testid="mock-run-history">RunHistoryPanel</div>,
}));

vi.mock('../../../protection/ProtectionLibraryBrowser', () => ({
  ProtectionLibraryBrowser: () => (
    <div data-testid="mock-protection-library">ProtectionLibraryBrowser</div>
  ),
}));

vi.mock('../../../catalog/TypeLibraryBrowser', () => ({
  TypeLibraryBrowser: () => <div data-testid="mock-type-library">TypeLibraryBrowser</div>,
}));

vi.mock('../../../shared/generatorTypeLabels', () => ({
  formatGeneratorTypeShortLabelPl: (t: string) => t,
}));

import { useAppStateStore } from '../../../app-state/store';
import { AreaContextPanel } from '../AreaContextPanel';

describe('AreaContextPanel - routing dziewięciu obszarów', () => {
  it('renderuje panel Model sieci', () => {
    act(() => {
      useAppStateStore.getState().setActiveProject(null);
      useAppStateStore.getState().setActiveCase(null);
      useAppStateStore.getState().setActiveVariant(null);
    });
    render(<AreaContextPanel areaCode="MODEL_SIECI" />);
    expect(screen.getByTestId('mo-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mo-project-start')).toBeInTheDocument();
    expect(screen.getByTestId('mo-create-project')).toHaveTextContent(
      'Utwórz projekt i przejdź do GPZ',
    );
    expect(screen.getByText('Cel obliczeń')).toBeInTheDocument();
    expect(screen.getByText('Stan projektu')).toBeInTheDocument();
  });

  it('Model sieci: pierwszy krok tworzy jednoznaczny projekt z domyślnymi parametrami', () => {
    act(() => {
      useAppStateStore.getState().setActiveProject(null);
      useAppStateStore.getState().setActiveCase(null);
      useAppStateStore.getState().setActiveVariant(null);
    });
    render(<AreaContextPanel areaCode="MODEL_SIECI" />);

    act(() => {
      fireEvent.click(screen.getByTestId('mo-create-project'));
    });

    const state = useAppStateStore.getState();
    expect(state.activeProjectName).toBe('Sieć SN - projekt roboczy');
    expect(state.activeCaseName).toBe('Zwarcie maksymalne IEC 60909');
    expect(state.activeVariantName).toBe('Stan projektowany 2026');
  });

  it('renderuje panel Schemat i topologia', () => {
    render(<AreaContextPanel areaCode="SCHEMAT_TOPOLOGIA" />);
    expect(screen.getByTestId('schemat-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('schemat-action-show-topology')).toBeInTheDocument();
  });

  it('renderuje panel Studia obliczeniowe', () => {
    render(<AreaContextPanel areaCode="STUDIA_OBLICZENIOWE" />);
    expect(screen.getByTestId('an-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mock-study-case-list')).toBeInTheDocument();
  });

  it('renderuje panel Wyniki i analizy', () => {
    render(<AreaContextPanel areaCode="WYNIKI_ANALIZY" />);
    expect(screen.getByTestId('wyniki-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('wyniki-action-proof')).toBeInTheDocument();
  });

  it('renderuje panel Zabezpieczenia i automatyka', () => {
    render(<AreaContextPanel areaCode="ZABEZPIECZENIA_AUTOMATYKA" />);
    expect(screen.getByTestId('za-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mock-protection-library')).toBeInTheDocument();
  });

  it('renderuje panel Źródła i przyłączenia', () => {
    render(<AreaContextPanel areaCode="ZRODLA_PRZYLACZENIA" />);
    expect(screen.getByTestId('oz-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('oz-empty-go-model')).toBeInTheDocument();
  });

  it('renderuje panel Katalogi techniczne', () => {
    render(<AreaContextPanel areaCode="KATALOGI_TECHNICZNE" />);
    expect(screen.getByTestId('ad-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mock-type-library')).toBeInTheDocument();
  });

  it('renderuje panel Raporty i uzasadnienia', () => {
    render(<AreaContextPanel areaCode="RAPORTY_UZASADNIENIA" />);
    expect(screen.getByTestId('ra-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('ra-template-list')).toBeInTheDocument();
  });

  it('renderuje panel Historia i audyt', () => {
    render(<AreaContextPanel areaCode="HISTORIA_AUDYT" />);
    expect(screen.getByTestId('hi-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mock-run-history')).toBeInTheDocument();
  });

  it('mapuje stary kod obszaru do nowego identyfikatora', () => {
    render(<AreaContextPanel areaCode="TE" />);
    expect(screen.getByTestId('schemat-context-panel')).toBeInTheDocument();
  });

  it('Schemat: klik pokazania topologii przełącza tryb pracy bez martwego kliknięcia', () => {
    render(<AreaContextPanel areaCode="SCHEMAT_TOPOLOGIA" />);
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TW');
      fireEvent.click(screen.getByTestId('schemat-action-show-topology'));
    });
    expect(useAppStateStore.getState().activeWorkMode).toBe('TE');
  });

  it('Studia: wybór zwarcia aktywuje typ analizy', () => {
    act(() => {
      useAppStateStore.getState().setActiveAnalysisType(null);
    });
    render(<AreaContextPanel areaCode="STUDIA_OBLICZENIOWE" />);
    act(() => {
      fireEvent.click(screen.getByTestId('an-analysis-SC_3F'));
    });
    expect(useAppStateStore.getState().activeAnalysisType).toBe('SHORT_CIRCUIT');
  });
});
