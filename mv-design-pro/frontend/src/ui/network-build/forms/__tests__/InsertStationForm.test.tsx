import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InsertStationForm } from '../InsertStationForm';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const fetchTransformerTypesMock = vi.fn();
const fetchConverterTypesMock = vi.fn();

const appState = { activeCaseId: 'case-1' };
const baseOperationContext = {
  segment_id: 'seg-1',
  position_on_segment: 0.25,
  station_type: 'branch',
  name: 'ST-01',
};
const networkBuildState = {
  activeOperationForm: {
    context: { ...baseOperationContext },
  },
  closeOperationForm: closeFormMock,
};

const baseSnapshot = {
  buses: [
    { ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15 },
    { ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 },
  ],
  branches: [
    { ref_id: 'seg-1', from_bus_ref: 'bus-sn', to_bus_ref: 'bus-sn' },
  ],
  corridors: [] as Array<{ ref_id: string; ordered_segment_refs: string[] }>,
};

const snapshotState = {
  snapshot: { ...baseSnapshot },
  executeDomainOperation: executeDomainOperationMock,
};

const transformerTypes = [
  {
    id: 'TR-15-04',
    name: 'TR 15/0,4 kV',
    manufacturer: 'Test',
    rated_power_mva: 0.63,
    voltage_hv_kv: 15,
    voltage_lv_kv: 0.4,
    uk_percent: 6,
    pk_kw: 6.5,
    i0_percent: 1.2,
    p0_kw: 1.1,
    vector_group: 'Dyn11',
    tap_min: -2,
    tap_max: 2,
    tap_step_percent: 2.5,
  },
  {
    id: 'TR-15-069',
    name: 'TR 15/0,69 kV',
    manufacturer: 'Test',
    rated_power_mva: 1,
    voltage_hv_kv: 15,
    voltage_lv_kv: 0.69,
    uk_percent: 6,
    pk_kw: 8,
    i0_percent: 1,
    p0_kw: 1,
    vector_group: 'Dyn11',
    tap_min: -2,
    tap_max: 2,
    tap_step_percent: 2.5,
  },
  {
    id: 'TR-20-04',
    name: 'TR 20/0,4 kV',
    manufacturer: 'Test',
    rated_power_mva: 0.63,
    voltage_hv_kv: 20,
    voltage_lv_kv: 0.4,
    uk_percent: 6,
    pk_kw: 6.5,
    i0_percent: 1.2,
    p0_kw: 1.1,
    vector_group: 'Dyn11',
    tap_min: -2,
    tap_max: 2,
    tap_step_percent: 2.5,
  },
];

const converterTypes = [
  {
    id: 'PV-069',
    name: 'Falownik PV 0,69 kV',
    manufacturer: 'PV Test',
    kind: 'PV' as const,
    un_kv: 0.69,
    sn_mva: 0.8,
    pmax_mw: 0.75,
  },
  {
    id: 'BESS-08',
    name: 'Falownik BESS 0,8 kV',
    manufacturer: 'BESS Test',
    kind: 'BESS' as const,
    un_kv: 0.8,
    sn_mva: 0.9,
    pmax_mw: 0.9,
  },
];

vi.mock('../../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeCaseId: string }) => unknown) => selector(appState),
}));

vi.mock('../../../catalog/api', () => ({
  fetchTransformerTypes: () => fetchTransformerTypesMock(),
  fetchConverterTypes: () => fetchConverterTypesMock(),
  getCatalogErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Błąd katalogu'),
}));

vi.mock('../../../topology/modals/CatalogPicker', () => ({
  CatalogPicker: ({
    label,
    entries,
    selectedId,
    onChange,
    error,
  }: {
    label: string;
    entries: Array<{ id: string; name: string; summary?: string }>;
    selectedId: string;
    onChange: (value: string) => void;
    error?: string;
  }) => (
    <div>
      <label>
        {label}
        <select
          aria-label={label}
          value={selectedId}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">— wybierz —</option>
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} {entry.summary}
            </option>
          ))}
        </select>
      </label>
      <div data-testid={`${label}-entries`}>{entries.map((entry) => entry.id).join(',')}</div>
      {error && <p>{error}</p>}
    </div>
  ),
}));

vi.mock('../../../topology/snapshotStore', async () => {
  const useSnapshotStore = (
    selector: (state: {
      snapshot: typeof snapshotState.snapshot;
      executeDomainOperation: typeof executeDomainOperationMock;
    }) => unknown,
  ) =>
    selector({
      snapshot: snapshotState.snapshot,
      executeDomainOperation: executeDomainOperationMock,
    });
  useSnapshotStore.getState = () => ({ error: null });

  return {
    useSnapshotStore,
    selectBusOptions: (snapshot: typeof snapshotState.snapshot) =>
      snapshot.buses.map((bus) => ({
        ref_id: bus.ref_id,
        name: bus.name,
        voltage_kv: bus.voltage_kv,
      })),
  };
});

vi.mock('../../networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (state: {
      activeOperationForm: { context: Record<string, unknown> };
      closeOperationForm: typeof closeFormMock;
    }) => unknown,
  ) => selector(networkBuildState),
  useActiveOperationForm: () => networkBuildState.activeOperationForm,
  useActiveOperationContext: () => networkBuildState.activeOperationForm.context,
}));

vi.mock('../shared/TransformerStationEditor', () => ({
  TransformerStationEditor: ({
    onSubmit,
    catalogEntries,
    stationSideLabels,
  }: {
    onSubmit: (data: {
      ref_id: string;
      name: string;
      hv_bus_ref: string;
      lv_bus_ref: string;
      tap_position: number;
      catalog_ref: string;
      parameter_source: 'CATALOG' | 'OVERRIDE';
      overrides: unknown[];
    }) => void;
    catalogEntries: Array<{ id: string; name: string; summary?: string }>;
    stationSideLabels: { high: string; low: string };
  }) => (
    <div>
      <div data-testid="station-side-low">{stationSideLabels.low}</div>
      <div data-testid="transformer-options">
        {catalogEntries.map((entry) => `${entry.id}:${entry.summary ?? ''}`).join('|')}
      </div>
      <button
        type="button"
        data-testid="station-submit"
        onClick={() =>
          onSubmit({
            ref_id: 'st-01',
            name: 'Stacja Konarzewo',
            hv_bus_ref: '__station_sn_side__',
            lv_bus_ref: '__station_nn_side__',
            tap_position: 0,
            catalog_ref: catalogEntries[0]?.id ?? '',
            parameter_source: 'CATALOG',
            overrides: [],
          })
        }
      >
        Zapisz stację
      </button>
    </div>
  ),
}));

describe('InsertStationForm', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    fetchTransformerTypesMock.mockReset();
    fetchConverterTypesMock.mockReset();
    fetchTransformerTypesMock.mockResolvedValue(transformerTypes);
    fetchConverterTypesMock.mockResolvedValue(converterTypes);
    networkBuildState.activeOperationForm.context = { ...baseOperationContext };
    snapshotState.snapshot = { ...baseSnapshot };
  });

  it('dla klasycznej stacji odbiorczej proponuje 0,4 kV i filtruje transformator SN/0,4 kV', async () => {
    executeDomainOperationMock.mockResolvedValue({ snapshot: { header: { name: 'case-1' } } });

    render(<InsertStationForm />);

    await waitFor(() => {
      expect(screen.getByTestId('transformer-options')).toHaveTextContent('TR-15-04');
    });
    expect(screen.getByTestId('transformer-options')).not.toHaveTextContent('TR-15-069');
    expect(screen.getByTestId('station-side-low')).toHaveTextContent('0,4 kV');

    fireEvent.click(screen.getByTestId('station-submit'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_station_on_segment_sn',
        expect.objectContaining({
          segment_id: 'seg-1',
          station: expect.objectContaining({
            station_type: 'branch',
            nn_voltage_kv: 0.4,
          }),
          transformer: expect.objectContaining({
            catalog_binding: expect.objectContaining({
              catalog_namespace: 'TRAFO_SN_NN',
              catalog_item_id: 'TR-15-04',
            }),
          }),
          nn_block: expect.objectContaining({
            nn_configuration: 'LOAD_NN',
            outgoing_feeders_nn_count: 2,
          }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalledTimes(1);
  });

  it('po wyborze schematu sekcyjnego wysyla pole sprzegla i zgodny typ stacji', async () => {
    executeDomainOperationMock.mockResolvedValue({ snapshot: { header: { name: 'case-1' } } });

    render(<InsertStationForm />);

    await waitFor(() => {
      expect(screen.getByTestId('transformer-options')).toHaveTextContent('TR-15-04');
    });

    fireEvent.click(screen.getByRole('button', { name: /Sekcyjna/i }));

    expect(screen.getAllByText(/Pole sprz/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('station-submit'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_station_on_segment_sn',
        expect.objectContaining({
          station: expect.objectContaining({
            station_type: 'sectional',
          }),
          sn_fields: expect.arrayContaining([
            expect.objectContaining({ field_role: 'SPRZEGLO' }),
          ]),
        }),
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0]?.[2];
    expect(payload.sn_fields).toHaveLength(4);
  });

  it('uzywa pierwszego odcinka z korytarza, gdy karta magistrali nie przekazuje segmentu bezposrednio', async () => {
    networkBuildState.activeOperationForm.context = {
      corridor_ref: 'corr-1',
      position_on_segment: 0.5,
      station_type: 'inline',
    };
    snapshotState.snapshot = {
      ...baseSnapshot,
      branches: [
        { ref_id: 'seg-from-corridor', from_bus_ref: 'bus-sn', to_bus_ref: 'bus-sn' },
      ],
      corridors: [
        { ref_id: 'corr-1', ordered_segment_refs: ['seg-from-corridor'] },
      ],
    };
    executeDomainOperationMock.mockResolvedValue({ snapshot: { header: { name: 'case-1' } } });

    render(<InsertStationForm />);

    await waitFor(() => {
      expect(screen.getByTestId('transformer-options')).toHaveTextContent('TR-15-04');
    });

    fireEvent.click(screen.getByTestId('station-submit'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_station_on_segment_sn',
        expect.objectContaining({
          segment_id: 'seg-from-corridor',
        }),
      );
    });
  });

  it('dla PV pobiera napięcie strony nN z katalogu falownika i dobiera transformator o tym samym LV', async () => {
    executeDomainOperationMock.mockResolvedValue({ snapshot: { header: { name: 'case-1' } } });

    render(<InsertStationForm />);

    fireEvent.click(screen.getByRole('button', { name: /PV przez falownik/i }));
    fireEvent.change(await screen.findByLabelText('Falownik z katalogu'), {
      target: { value: 'PV-069' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('transformer-options')).toHaveTextContent('TR-15-069');
    });
    expect(screen.getByTestId('transformer-options')).not.toHaveTextContent('TR-15-04');
    expect(screen.getByTestId('station-side-low')).toHaveTextContent('0,69 kV');

    fireEvent.click(screen.getByTestId('station-submit'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_station_on_segment_sn',
        expect.objectContaining({
          station: expect.objectContaining({
            nn_voltage_kv: 0.69,
          }),
          transformer: expect.objectContaining({
            catalog_binding: expect.objectContaining({
              catalog_item_id: 'TR-15-069',
            }),
          }),
          nn_block: expect.objectContaining({
            nn_configuration: 'PV_INVERTER',
            source_converter_catalog_ref: 'PV-069',
            source_converter_un_kv: 0.69,
            outgoing_feeders_nn: expect.arrayContaining([
              expect.objectContaining({ feeder_role: 'ZRODLO_NN_PV' }),
            ]),
          }),
        }),
      );
    });
  });

  it('blokuje zapis, gdy falownik wymaga napięcia bez zgodnego transformatora katalogowego', async () => {
    fetchTransformerTypesMock.mockResolvedValue([transformerTypes[0]]);

    render(<InsertStationForm />);

    fireEvent.click(screen.getByRole('button', { name: /PV przez falownik/i }));
    fireEvent.change(await screen.findByLabelText('Falownik z katalogu'), {
      target: { value: 'PV-069' },
    });

    await waitFor(() => {
      expect(screen.getByText(/Brak transformatora katalogowego zgodnego/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('station-submit'));

    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
