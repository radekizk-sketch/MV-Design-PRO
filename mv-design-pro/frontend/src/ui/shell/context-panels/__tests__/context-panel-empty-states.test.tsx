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
    buildPhaseLabel: 'Do analizy',
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
  it('panel Układy PV/BESS/FW pokazuje przyczynę oraz akcję techniczną', () => {
    render(<OzContextPanel />);
    expect(screen.getByText(/Dodaj układ PV\/BESS\/FW w wybranej kategorii/)).toBeInTheDocument();
    expect(screen.getByText(/Warunek przejścia/)).toBeInTheDocument();
    expect(screen.getByTestId('oz-empty-go-model')).toBeInTheDocument();
    expect(screen.getByTestId('oz-counter-power')).toHaveTextContent('Σ P: nie wyznaczono');
    expect(screen.queryByText('0.00 MW')).not.toBeInTheDocument();
  });

  it('panel Schemat i topologia prowadzi do Modelu sieci z pustej kanwy', () => {
    act(() => {
      useSnapshotStore.getState().reset();
    });
    const { container } = render(<SchematContextPanel />);
    expect(screen.getByText(/Start pustej kanwy/)).toBeInTheDocument();
    expect(screen.getByText(/Wybierz wariant GPZ z katalogu/)).toBeInTheDocument();
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

    expect(screen.getByText(/Rozpocznij konfigurację od kompletnego wariantu GPZ/)).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/snapshot|Przypadek/i);

    act(() => {
      useSnapshotStore.getState().reset();
    });
  });

  it('panel Schemat i topologia nie pokazuje listy konfiguracji, gdy topologia jest pusta', () => {
    act(() => {
      useSnapshotStore.setState({
        snapshot: {
          header: { hash_sha256: 'hash-empty-topology' },
          sources: [],
          buses: [],
          bays: [],
          branches: [],
          substations: [],
          transformers: [],
          generators: [],
          loads: [],
        } as any,
        readiness: {
          ready: false,
          blockers: [
            {
              code: 'gpz.required',
              element_ref: null,
              message_pl: 'Skonfiguruj GPZ jako kompletny układ zasilania.',
            },
            {
              code: 'sn.required',
              element_ref: null,
              message_pl: 'Wybierz wariant rozdzielni SN i sekcji szyn.',
            },
          ],
          warnings: [],
        } as any,
      });
    });

    const { container } = render(<SchematContextPanel />);

    expect(screen.getByText(/Pierwszy układ sieci/)).toBeInTheDocument();
    expect(screen.getByText(/Wybierz wariant GPZ z katalogu/)).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/Do konfiguracji|Skonfiguruj GPZ jako|Wybierz wariant rozdzielni SN/);

    act(() => {
      useSnapshotStore.getState().reset();
    });
  });

  it('po utworzeniu GPZ prowadzi do wyprowadzenia magistrali SN z pola liniowego', async () => {
    networkBuildMocks.openRouteSurface.mockClear();
    act(() => {
      useSelectionStore.getState().clearSelection();
      useSnapshotStore.setState({
        snapshot: {
          header: { hash_sha256: 'hash-gpz-only' },
          sources: [{ ref_id: 'gpz/1/source/main', name: 'GPZ 1' }],
          buses: [{ ref_id: 'gpz/1/bus/s1', name: 'Szyna GPZ S1', voltage_kv: 15 }],
          bays: [{ ref_id: 'gpz/1/bay/001', name: 'Pole odpływowe 1', bay_role: 'OUT' }],
          branches: [{ ref_id: 'gpz/1/tr/1', name: 'TR1 110/15 kV', type: 'transformer' }],
          substations: [{ ref_id: 'gpz/1/substation', name: 'GPZ 1', station_type: 'gpz' }],
          transformers: [{ ref_id: 'gpz/1/tr/1', name: 'TR1 25 MVA' }],
          generators: [],
          loads: [],
        } as any,
        readiness: null,
      });
    });

    render(<SchematContextPanel />);

    expect(screen.getByText('Wyprowadź magistralę SN z pola GPZ')).toBeInTheDocument();
    expect(screen.getByText('Wyprowadź odcinek')).toBeInTheDocument();
    expect(screen.getByText('GPZ jest utworzony. Teraz wybierz pole liniowe i wyprowadź z jego zacisku pierwszy odcinek magistrali SN.')).toBeInTheDocument();
    expect(screen.queryByText('Układ przygotowany do obliczeń')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('schemat-action-show-normal-open-points'));

    expect(useSelectionStore.getState().selectedElement).toMatchObject({
      id: 'gpz/1/bay/001',
      type: 'BaySN',
      name: 'Pole odpływowe 1',
    });
    expect(networkBuildMocks.openOperationForm).toHaveBeenCalledWith('continue_trunk_segment_sn', expect.objectContaining({
      element_ref: 'gpz/1/bay/001',
      element_type: 'BaySN',
      field_ref: 'gpz/1/bay/001',
      terminal_id: 'gpz/1/bay/001',
      terminal_name: 'Pole odpływowe 1',
      terminal_voltage_label: 'SN',
    }));
    expect(networkBuildMocks.openRouteSurface).not.toHaveBeenCalled();
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

    await userEvent.click(screen.getByTestId('model-tree-row-stn/1/nn_source/pv_inverter'));
    expect(networkBuildMocks.openRouteSurface).toHaveBeenLastCalledWith('E-21', expect.objectContaining({
      entityRef: 'stn/1/nn_source/pv_inverter',
      entityType: 'pv_source',
      titlePl: 'PV 01',
    }));
  });

  it('ukrywa surowe referencje techniczne w nazwach odcinkow drzewa', () => {
    act(() => {
      useSnapshotStore.setState({
        snapshot: {
          header: { hash_sha256: 'hash-e2e' },
          sources: [],
          buses: [],
          bays: [],
          branches: [
            {
              ref_id: 'seg/4c91e33924540576433c30ade2431340/segment',
              name: 'Odcinek /segment',
              type: 'cable',
              length_km: 0.18,
            },
          ],
          substations: [
            {
              id: 'station-1',
              ref_id: 'station-1',
              station_type: 'inline',
            },
          ],
          transformers: [],
          generators: [],
          loads: [],
        } as any,
        readiness: null,
      });
    });

    render(<SchematContextPanel />);

    expect(screen.getByText('Odcinek 01')).toBeInTheDocument();
    expect(screen.queryByText(/\/segment/)).not.toBeInTheDocument();
  });

  it('pokazuje projektowe oznaczenie katalogowe kabla zamiast identyfikatora technicznego', () => {
    act(() => {
      useSnapshotStore.setState({
        snapshot: {
          header: { hash_sha256: 'hash-e2e' },
          sources: [],
          buses: [],
          bays: [],
          branches: [
            {
              ref_id: 'seg/1/segment',
              name: 'Odcinek SN',
              type: 'cable',
              catalog_ref: 'cable-base-epr-al-1c-150',
              length_km: 0.31,
            },
          ],
          substations: [],
          transformers: [],
          generators: [],
          loads: [],
        } as any,
        readiness: null,
      });
    });

    render(<SchematContextPanel />);

    expect(screen.getByText(/Kabel SN EPR Al 1x150 mm² · 0,31 km/)).toBeInTheDocument();
    expect(screen.queryByText(/Base Epr/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cable-base/i)).not.toBeInTheDocument();
  });

  it('oddziela nazwę źródła od opisu technicznego w drzewie schematu', () => {
    act(() => {
      useSnapshotStore.setState({
        snapshot: {
          header: { hash_sha256: 'hash-e2e' },
          sources: [],
          buses: [],
          bays: [],
          branches: [],
          substations: [
            {
              ref_id: 'station-1',
              station_code: 'S01',
              station_type: 'mv_lv_inline',
              name: 'Stacja przelotowa',
            },
          ],
          transformers: [],
          generators: [
            {
              ref_id: 'der_bess_1',
              name: 'Blok BESS',
              gen_type: 'bess',
              p_mw: 0.5,
              station_ref: 'station-1',
            },
            {
              ref_id: 'der_bess_2',
              name: 'Blok BESS',
              gen_type: 'bess',
              p_mw: 0.5,
              station_ref: 'station-1',
            },
          ],
          loads: [],
        } as any,
        readiness: null,
      });
    });

    render(<SchematContextPanel />);

    const row = screen.getByTestId('model-tree-row-der_bess_1');
    expect(row).toHaveTextContent(/BESS 01 · układ 1/);
    expect(row).toHaveTextContent(/magazyn energii/);
    expect(row).toHaveTextContent(/S01/);
    expect(row).toHaveTextContent(/0,5 MW/);
    expect(row).not.toHaveTextContent('Blok BESS');
    expect(row.textContent ?? '').not.toMatch(/BESSmagazyn|BESSBESS|FWźródło|PVfalownik/u);
    expect(row.textContent ?? '').not.toMatch(/[ÂĹÅĂ]/u);
  });

  it('ogranicza szum dużych kolekcji w drzewie i pozwala dotrzeć do pozycji wyszukiwarką', async () => {
    const loads = Array.from({ length: 30 }, (_, index) => ({
      ref_id: `load-${String(index + 1).padStart(2, '0')}`,
      name: `Odbiór testowy ${String(index + 1).padStart(2, '0')}`,
      bus_ref: 'bus-nn',
      p_mw: 0.03,
    }));
    act(() => {
      useSnapshotStore.setState({
        snapshot: {
          header: { hash_sha256: 'hash-e2e' },
          sources: [],
          buses: [{ ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 }],
          bays: [],
          branches: [],
          substations: [],
          transformers: [],
          generators: [],
          loads,
        } as any,
        readiness: null,
      });
    });

    render(<SchematContextPanel />);

    expect(screen.getByText('Odbiór testowy 01')).toBeInTheDocument();
    expect(screen.queryByText('Odbiór testowy 29')).not.toBeInTheDocument();
    expect(screen.getByTestId('model-tree-overflow-odbiory-nn')).toHaveTextContent(
      '22 pozycji dostępnych przez wyszukiwarkę albo kartę układu.',
    );

    await userEvent.type(screen.getByTestId('project-tree-search-input'), 'Odbiór testowy 29');
    expect(screen.getByText('Odbiór testowy 29')).toBeInTheDocument();
    expect(screen.queryByTestId('model-tree-overflow-odbiory-nn')).not.toBeInTheDocument();
  });

  it('nawigator modelu w obszarze Model nie ma pustych wierszy', async () => {
    networkBuildMocks.openRouteSurface.mockClear();
    act(() => {
      useAppStateStore.getState().setActiveProject('project-test', 'Projekt testowy');
      useAppStateStore.getState().setActiveCase('case-test', 'Zwarcie maksymalne IEC 60909', 'ShortCircuitCase', 'NONE');
    });

    render(<MoContextPanel />);
    expect(screen.getByText('w konfiguracji')).toBeInTheDocument();
    expect(screen.queryByText('OK')).not.toBeInTheDocument();
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

  it('ukrywa surowe referencje bp i switch_state w liście konfiguracji technicznej', () => {
    act(() => {
      useSnapshotStore.setState({
        snapshot: {
          header: { hash_sha256: 'hash-e2e' },
          sources: [{ ref_id: 'gpz/1/source/main', name: 'Źródło GPZ 15 kV' }],
          buses: [],
          bays: [],
          branches: [],
          substations: [],
          transformers: [],
          generators: [],
          loads: [],
          branch_points: [{ ref_id: 'bp/abc123/zksn', name: 'bp/abc123/zksn' }],
        } as any,
        readiness: {
          ready: false,
          blockers: [
            {
              code: 'branch_point.switch_state_missing',
              message_pl: "ZKSN 'bp/abc123/zksn' nie ma stanu łącznika (switch_state).",
              element_ref: 'bp/abc123/zksn',
              severity: 'BLOCKER',
            },
          ],
          warnings: [],
        },
      });
    });

    render(<SchematContextPanel />);

    expect(screen.getByText('ZKSN wymaga wskazania stanu normalnego łącznika.')).toBeInTheDocument();
    expect(screen.queryByText(/bp\//)).not.toBeInTheDocument();
    expect(screen.queryByText(/switch_state/)).not.toBeInTheDocument();
  });

  it('panel Wyniki i analizy prowadzi do Studiów obliczeniowych, gdy nie ma wyników', () => {
    render(<WynikiContextPanel />);
    expect(screen.getByText(/Warunek przejścia/)).toBeInTheDocument();
    expect(screen.getByTestId('wyniki-action-go-studies')).toBeInTheDocument();
  });
});
