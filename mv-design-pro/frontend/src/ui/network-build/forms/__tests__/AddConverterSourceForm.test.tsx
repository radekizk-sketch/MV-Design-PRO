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

const ptpireeItems = vi.hoisted(() => [
  {
    id: 'ptpiree-pvco-pv-1-mw',
    sourceId: 'ptpiree-test',
    sourceVersion: 'WiPWC 1.3',
    sourceUrl: 'https://ptpiree.pl/test.pdf',
    sourcePage: 1,
    sourceRow: 7,
    documentNumber: 'PV-TEST-001',
    acceptanceDate: '31.12.2026',
    wosVersion: 'WOS 2025',
    manufacturer: 'PV Co',
    deviceKind: 'Falownik fotowoltaiczny',
    model: 'PV 1 MW',
    moduleTypes: ['A', 'B'],
    firmware: '1.0',
    certificateStatus: 'ptpiree_verified',
    electricalDataStatus: 'requires_datasheet',
  },
] as const);

vi.mock('../../station-der/ptpireeCertifiedInverters', () => ({
  PTPIREE_CERTIFIED_INVERTERS: ptpireeItems,
  loadPtpireeCertifiedInverters: vi.fn(async () => ptpireeItems),
  getPtpireeCertifiedInverter: vi.fn((id: string | null | undefined, registry = ptpireeItems) =>
    id ? registry.find((item) => item.id === id) ?? null : null,
  ),
  filterPtpireeCertifiedInverters: vi.fn((query: string, registry = ptpireeItems) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return registry;
    return registry.filter((item) =>
      `${item.manufacturer} ${item.model} ${item.documentNumber}`.toLowerCase().includes(normalized),
    );
  }),
  formatPtpireeCertificateLabel: vi.fn((item) =>
    item ? `${item.manufacturer} ${item.model} (${item.documentNumber})` : 'brak certyfikatu PTPiREE',
  ),
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
      expect(screen.getByText('conv-pv-1')).toBeInTheDocument();
      expect(screen.getByLabelText('Moc robocza P [MW]')).toHaveValue('1.000');
      expect(screen.getByLabelText('Qmin [Mvar]')).toHaveValue('-0.200');
      expect(screen.getByLabelText('Qmax [Mvar]')).toHaveValue('0.200');
      expect(screen.getByLabelText('Certyfikat PTPiREE')).toHaveValue('ptpiree-pvco-pv-1-mw');
    });

    fireEvent.click(screen.getByText('wybierz:Aparat nN'));
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
          source_name: 'PV 1 MW',
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
          materialized_params: expect.objectContaining({
            catalog_item_id: 'conv-pv-1',
            pmax_mw: 1,
            qmin_mvar: -0.2,
            qmax_mvar: 0.2,
            ptpiree_certificate_ref: 'ptpiree-pvco-pv-1-mw',
            ptpiree_document_number: 'PV-TEST-001',
            ptpiree_module_types: ['A', 'B'],
            ptpiree_electrical_data_status: 'requires_datasheet',
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
      expect(screen.getByText('conv-pv-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'BESS' }));
    fireEvent.click(screen.getByRole('button', { name: /Blokowe do SN/i }));
    await waitFor(() => {
      expect(screen.getByText('conv-bess-1')).toBeInTheDocument();
    });
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
