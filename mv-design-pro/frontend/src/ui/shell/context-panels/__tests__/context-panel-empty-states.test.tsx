import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const networkBuildMocks = vi.hoisted(() => ({
  openRouteSurface: vi.fn(),
  openOperationForm: vi.fn(),
}));

vi.mock('../../../network-build/networkBuildStore', () => ({
  useNetworkBuildDerived: () => ({
    buildPhase: 'READY',
    buildPhaseLabel: 'Gotowy do analizy',
    sourceCount: 1,
    trunkCount: 1,
    branchCount: 0,
    stationCount: 1,
    transformerCount: 1,
    generatorCount: 1,
    trunkSegmentCount: 1,
    isReady: false,
    blockersByCategory: { total: 0 },
    ozeSourceSummaries: [],
    stationSummaries: [],
    transformerSummaries: [],
  }),
  useNetworkBuildStore: (selector: any) => selector({
    openRouteSurface: networkBuildMocks.openRouteSurface,
    openOperationForm: networkBuildMocks.openOperationForm,
    collapsedSections: new Set<string>(),
    toggleSection: vi.fn(),
  }),
}));

vi.mock('../../../network-build/ProcessPanel', () => ({
  ProcessPanel: () => <div data-testid="process-panel" />,
}));

vi.mock('../../../shared/generatorTypeLabels', () => ({
  formatGeneratorTypeShortLabelPl: (t: string) => t,
}));

import { OzContextPanel } from '../OzContextPanel';
import { SchematContextPanel } from '../SchematContextPanel';
import { WynikiContextPanel } from '../WynikiContextPanel';
import { MoContextPanel } from '../MoContextPanel';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { useSelectionStore } from '../../../selection';
import { useAppStateStore } from '../../../app-state/store';

describe('context-panel-empty-states - stany puste z przyczyną i akcją', () => {
  it('panel Źródła i przyłączenia pokazuje przyczynę oraz akcję naprawczą', () => {
    render(<OzContextPanel />);
    expect(screen.getByText(/Brak źródeł przyłączonych/)).toBeInTheDocument();
    expect(screen.getByText(/Warunek przejścia/)).toBeInTheDocument();
    expect(screen.getByTestId('oz-empty-go-model')).toBeInTheDocument();
    expect(screen.getByTestId('oz-counter-power')).toHaveTextContent('Σ P: brak danych');
    expect(screen.queryByText('0.00 MW')).not.toBeInTheDocument();
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

  it('klik w drzewie schematu otwiera właściwą kartę obiektu zamiast pustego inspektora', async () => {
    networkBuildMocks.openRouteSurface.mockClear();
    act(() => {
      useSelectionStore.getState().clearSelection();
      useSnapshotStore.setState({
        snapshot: {
          header: { hash_sha256: 'hash-e2e' },
          sources: [{ ref_id: 'gpz/1/substation', name: 'GPZ 1' }],
          buses: [{ ref_id: 'gpz/1/bus/s1', name: 'Szyna GPZ S1', voltage_kv: 15 }],
          bays: [{ ref_id: 'gpz/1/bay/001', name: 'Pole odpływowe 1', bay_role: 'OUT' }],
          branches: [{ ref_id: 'gpz/1/corridor/01', name: 'XRUHAKXS 120/25', type: 'cable', length_km: 0.5 }],
          substations: [{ ref_id: 'stn/1/station', name: 'Stacja SN/nN 1', station_type: 'przelotowa' }],
          transformers: [{ ref_id: 'stn/1/tr/sn-nn', name: 'TR 630 kVA', sn_mva: 0.63 }],
          generators: [{ ref_id: 'stn/1/nn_source/pv_inverter', name: 'Falownik PV 0.5 MW', gen_type: 'PV', p_mw: 0.5 }],
          loads: [],
        } as any,
        readiness: null,
      });
    });

    render(<SchematContextPanel />);
    await userEvent.click(screen.getByText('Pole odpływowe 1'));
    expect(useSelectionStore.getState().selectedElement).toMatchObject({
      id: 'gpz/1/bay/001',
      type: 'BaySN',
      name: 'Pole odpływowe 1',
    });
    expect(networkBuildMocks.openRouteSurface).toHaveBeenCalledWith('E-11', expect.objectContaining({
      entityRef: 'gpz/1/bay/001',
      entityType: 'sn_bay',
      titlePl: 'Pole odpływowe 1',
    }));

    await userEvent.click(screen.getByText('Falownik PV 0.5 MW'));
    expect(networkBuildMocks.openRouteSurface).toHaveBeenLastCalledWith('E-21', expect.objectContaining({
      entityRef: 'stn/1/nn_source/pv_inverter',
      entityType: 'pv_source',
      titlePl: 'Falownik PV 0.5 MW',
    }));
  });

  it('nawigator modelu w obszarze Model nie ma pustych wierszy', async () => {
    networkBuildMocks.openRouteSurface.mockClear();
    act(() => {
      useAppStateStore.getState().setActiveProject('project-test', 'Projekt testowy');
      useAppStateStore.getState().setActiveCase('case-test', 'Zwarcie maksymalne IEC 60909', 'ShortCircuitCase', 'NONE');
    });

    render(<MoContextPanel />);
    await userEvent.click(screen.getByText('Źródło zasilania'));
    expect(networkBuildMocks.openRouteSurface).toHaveBeenCalledWith('E-10', expect.objectContaining({
      entityType: 'gpz',
      titlePl: 'Konfiguracja GPZ',
    }));

    await userEvent.click(screen.getByText('Stacje SN/nN'));
    expect(networkBuildMocks.openRouteSurface).toHaveBeenLastCalledWith('E-13', expect.objectContaining({
      entityType: 'station',
      titlePl: 'Stacje SN/nN',
    }));
  });

  it('panel Wyniki i analizy prowadzi do Studiów obliczeniowych, gdy nie ma wyników', () => {
    render(<WynikiContextPanel />);
    expect(screen.getByText(/Warunek przejścia/)).toBeInTheDocument();
    expect(screen.getByTestId('wyniki-action-go-studies')).toBeInTheDocument();
  });
});
