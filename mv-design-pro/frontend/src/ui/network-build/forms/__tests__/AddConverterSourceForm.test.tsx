import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AddConverterSourceForm } from '../AddConverterSourceForm';

const closeFormMock = vi.fn();
const openOperationFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();

const appState = { activeCaseId: 'case-1' };
const networkBuildState = {
  activeOperationForm: {
    op: 'add_converter_source',
    context: {
      station_ref: 'st-1',
      bus_nn_ref: 'bus-nn-1',
      source_technology: 'PV',
      connection_variant: 'nn_side',
    },
  },
  closeOperationForm: closeFormMock,
  openOperationForm: openOperationFormMock,
};

const snapshotWithExistingField = {
  substations: [
    {
      id: 'st-1',
      ref_id: 'st-1',
      name: 'ST-1',
      bus_refs: ['bus-sn-1', 'bus-nn-1'],
      transformer_refs: ['tr-1'],
    },
  ],
  buses: [
    { id: 'bus-sn-1', ref_id: 'bus-sn-1', name: 'Szyna SN', voltage_kv: 15 },
    { id: 'bus-nn-1', ref_id: 'bus-nn-1', name: 'Szyna nN', voltage_kv: 0.4 },
  ],
  bays: [
    {
      id: 'bay-source-1',
      ref_id: 'bay-source-1',
      name: 'Pole zrodlowe nN #1',
      bay_role: 'SOURCE',
      substation_ref: 'st-1',
      bus_ref: 'bus-nn-1',
      meta: { feeder_role: 'ZRODLO_NN_BESS' },
    },
  ],
  transformers: [
    {
      ref_id: 'tr-1',
      name: 'TR-1',
      lv_bus_ref: 'bus-nn-1',
      sn_mva: 1,
    },
  ],
} as const;

const snapshotWithoutExistingField = {
  ...snapshotWithExistingField,
  bays: [],
} as const;

let snapshotState: typeof snapshotWithExistingField | typeof snapshotWithoutExistingField =
  snapshotWithExistingField;

vi.mock('../../../app-state', () => ({
  useAppStateStore: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../topology/snapshotStore', () => ({
  useSnapshotStore: (
    selector: (state: {
      snapshot: typeof snapshotState;
      executeDomainOperation: typeof executeDomainOperationMock;
    }) => unknown,
  ) =>
    selector({
      snapshot: snapshotState,
      executeDomainOperation: executeDomainOperationMock,
    }),
}));

vi.mock('../../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: typeof networkBuildState) => unknown) =>
    selector(networkBuildState),
  useActiveOperationForm: () => networkBuildState.activeOperationForm,
  useActiveOperationContext: () => networkBuildState.activeOperationForm.context,
}));

vi.mock('../../../catalog/api', () => ({
  fetchConverterTypes: vi.fn(async () => [
    {
      id: 'conv-pv-15',
      name: 'PV 1 MW 15 kV',
      manufacturer: 'Bad Voltage Co',
      kind: 'PV',
      un_kv: 15,
      sn_mva: 1.1,
      pmax_mw: 1.0,
      qmin_mvar: -0.2,
      qmax_mvar: 0.2,
      cosphi_min: 0.9,
      cosphi_max: 1,
    },
    {
      id: 'conv-pv-1',
      name: 'PV 1 MW',
      manufacturer: 'PV Co',
      kind: 'PV',
      un_kv: 0.4,
      sn_mva: 1.1,
      pmax_mw: 1.0,
      qmin_mvar: -0.2,
      qmax_mvar: 0.2,
      cosphi_min: 0.9,
      cosphi_max: 1,
    },
    {
      id: 'conv-bess-1',
      name: 'BESS 0.5 MW',
      manufacturer: 'BESS Co',
      kind: 'BESS',
      un_kv: 0.4,
      sn_mva: 0.6,
      pmax_mw: 0.5,
      qmin_mvar: -0.1,
      qmax_mvar: 0.1,
      cosphi_min: 0.9,
      cosphi_max: 1,
      e_kwh: 1000,
    },
  ]),
  fetchLvApparatusTypes: vi.fn(async () => [
    {
      id: 'ap-nn-1',
      name: 'Rozlacznik nN 630 A',
      manufacturer: 'Switch Co',
      device_kind: 'ROZLACZNIK',
      u_n_kv: 0.4,
      i_n_a: 630,
    },
  ]),
}));

vi.mock('../../../field/useFieldReadModel', () => ({
  useFieldReadModel: () => ({
    data: { fields: [] },
  }),
}));

vi.mock('../../../topology/modals/CatalogPicker', () => ({
  CatalogPicker: ({
    label,
    entries,
    selectedId,
    onChange,
  }: {
    label: string;
    entries: Array<{ id: string; name: string }>;
    selectedId: string;
    onChange: (id: string) => void;
  }) => (
    <div data-testid={`catalog-${label}`}>
      <span>{label}</span>
      {entries.length > 0 ? (
        <button type="button" onClick={() => onChange(entries[0]?.id ?? '')}>
          {selectedId || `wybierz:${label}`}
        </button>
      ) : (
        <span>ladowanie:{label}</span>
      )}
    </div>
  ),
}));

describe('AddConverterSourceForm', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    openOperationFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    snapshotState = snapshotWithExistingField;
    networkBuildState.activeOperationForm.context = {
      station_ref: 'st-1',
      bus_nn_ref: 'bus-nn-1',
      source_technology: 'PV',
      connection_variant: 'nn_side',
    };
  });

  it('wysyla kanoniczny payload add_converter_source dla nowego pola nN', async () => {
    executeDomainOperationMock.mockResolvedValue({ snapshot: { header: { name: 'case-1' } } });

    render(<AddConverterSourceForm />);

    await waitFor(() => {
      expect(screen.getByText(/wybierz:Przekształtnik PV/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('wybierz:Aparat nN'));
    fireEvent.click(screen.getByText(/wybierz:Przekształtnik PV/i));
    fireEvent.change(screen.getByLabelText('Moc robocza P [MW]'), { target: { value: '0.75' } });
    fireEvent.click(screen.getByRole('button', { name: /Dodaj/i }));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_converter_source',
        expect.objectContaining({
          source_technology: 'PV',
          connection_variant: 'nn_side',
          station_ref: 'st-1',
          bus_nn_ref: 'bus-nn-1',
          placement: 'NEW_FIELD',
          source_name: 'Blok PV',
          quantity: 1,
          power_setpoint_mw: 0.75,
          catalog_binding: expect.objectContaining({
            catalog_namespace: 'ZRODLO_NN_PV',
            catalog_item_id: 'conv-pv-1',
          }),
          source_field: expect.objectContaining({
            source_field_kind: 'PV',
            catalog_binding: expect.objectContaining({
              catalog_namespace: 'APARAT_NN',
              catalog_item_id: 'ap-nn-1',
            }),
          }),
        }),
      );
    });

    expect(closeFormMock).toHaveBeenCalledTimes(1);
  });

  it('wysyla wariant blokowy bez tworzenia pola zrodlowego', async () => {
    executeDomainOperationMock.mockResolvedValue({ snapshot: { header: { name: 'case-1' } } });

    render(<AddConverterSourceForm />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Przekształtnik PV/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'BESS' }));
    fireEvent.click(screen.getByRole('button', { name: /Blokowe do SN/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Przekształtnik BESS/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Przekształtnik BESS/i }));
    fireEvent.click(screen.getByRole('button', { name: /Dodaj/i }));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_converter_source',
        expect.objectContaining({
          source_technology: 'BESS',
          connection_variant: 'block_transformer',
          station_ref: 'st-1',
          bus_nn_ref: 'bus-nn-1',
          blocking_transformer_ref: 'tr-1',
          source_field: undefined,
          existing_field_ref: undefined,
          bess_mode: 'DWUKIERUNKOWY',
        }),
      );
    });
  });

  it('otwiera kanoniczne add_nn_outgoing_field z jawna intencja SOURCE, gdy brak istniejacego pola', async () => {
    snapshotState = snapshotWithoutExistingField;

    render(<AddConverterSourceForm />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Użyj istniejącego pola źródłowego/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Użyj istniejącego pola źródłowego/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Dodaj pole źródłowe/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Dodaj pole źródłowe/i }));

    expect(openOperationFormMock).toHaveBeenCalledWith('add_nn_outgoing_field', {
      station_ref: 'st-1',
      bus_nn_ref: 'bus-nn-1',
      field_role: 'SOURCE',
      source_field_kind: 'PV',
    });
  });
});
