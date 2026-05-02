import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AddSnBayForm } from '../AddSnBayForm';

const closeFormMock = vi.fn();
const collapseSurfaceStackToMock = vi.fn();
const executeDomainOperationMock = vi.fn();

const appState = { activeCaseId: 'case-1' };
const networkBuildState = {
  activeOperationForm: {
    op: 'add_sn_bay',
    context: {
      station_ref: 'gpz-1',
      bus_ref: 'bus-gpz-1',
      bay_role: 'OUT',
      apparatus_kind: 'DISCONNECTOR',
    },
  },
  closeOperationForm: closeFormMock,
  collapseSurfaceStackTo: collapseSurfaceStackToMock,
};

const snapshotState = {
  substations: [
    {
      id: 'gpz-1',
      ref_id: 'gpz-1',
      name: 'GPZ Centrum',
      bus_refs: ['bus-gpz-1', 'bus-nn-1'],
      transformer_refs: [],
    },
  ],
  buses: [
    { id: 'bus-gpz-1', ref_id: 'bus-gpz-1', name: 'Szyna GPZ 15 kV', voltage_kv: 15 },
    { id: 'bus-nn-1', ref_id: 'bus-nn-1', name: 'Szyna nN 0.4 kV', voltage_kv: 0.4 },
  ],
  bays: [],
  sources: [],
  generators: [],
  loads: [],
  transformers: [],
} as any;

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
}));

vi.mock('../../../catalog/api', () => ({
  fetchMvApparatusTypes: vi.fn(async () => [
    {
      id: 'ap-sn-1',
      name: 'Rozlacznik SN 24 kV 630 A',
      manufacturer: 'Switch Co',
      device_kind: 'DISCONNECTOR',
      u_n_kv: 24,
      i_n_a: 630,
    },
  ]),
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
      <button type="button" onClick={() => onChange(entries[0]?.id ?? '')}>
        {selectedId || `wybierz:${label}`}
      </button>
    </div>
  ),
}));

describe('AddSnBayForm', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    collapseSurfaceStackToMock.mockReset();
    executeDomainOperationMock.mockReset();
    window.location.hash = '';
    snapshotState.substations = [
      {
        id: 'gpz-1',
        ref_id: 'gpz-1',
        name: 'GPZ Centrum',
        bus_refs: ['bus-gpz-1', 'bus-nn-1'],
        transformer_refs: [],
      },
    ];
    snapshotState.buses = [
      { id: 'bus-gpz-1', ref_id: 'bus-gpz-1', name: 'Szyna GPZ 15 kV', voltage_kv: 15 },
      { id: 'bus-nn-1', ref_id: 'bus-nn-1', name: 'Szyna nN 0.4 kV', voltage_kv: 0.4 },
    ];
    networkBuildState.activeOperationForm.context = {
      station_ref: 'gpz-1',
      bus_ref: 'bus-gpz-1',
      bay_role: 'OUT',
      apparatus_kind: 'DISCONNECTOR',
    };
  });

  it('wysyla kanoniczny payload add_sn_bay dla pola SN na szynie GPZ', async () => {
    executeDomainOperationMock.mockResolvedValue({ snapshot: { header: { name: 'case-1' } } });

    render(<AddSnBayForm />);

    await waitFor(() => {
      expect(screen.getByText('wybierz:Aparat SN z katalogu')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('wybierz:Aparat SN z katalogu'));
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj pole SN' }));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_sn_bay',
        expect.objectContaining({
          bus_ref: 'bus-gpz-1',
          station_ref: 'gpz-1',
          bay_role: 'OUT',
          apparatus_kind: 'DISCONNECTOR',
          catalog_binding: expect.objectContaining({
            catalog_namespace: 'APARAT_SN',
            catalog_item_id: 'ap-sn-1',
          }),
        }),
      );
    });

    expect(collapseSurfaceStackToMock).toHaveBeenCalledWith(null);
    expect(window.location.hash).toBe('#sld');
  });

  it('rozpoznaje stacje GPZ takze wtedy, gdy bus_ref i station.bus_refs uzywaja mieszanych id/ref_id', async () => {
    networkBuildState.activeOperationForm.context = {
      bus_ref: 'bus-gpz-ref-only',
      bay_role: 'OUT',
      apparatus_kind: 'DISCONNECTOR',
    };

    snapshotState.substations = [
      {
        id: 'gpz-1',
        ref_id: 'gpz-1',
        name: 'GPZ Centrum',
        bus_refs: ['bus-gpz-id-only'],
        transformer_refs: [],
      },
    ];
    snapshotState.buses = [
      { id: 'bus-gpz-id-only', ref_id: 'bus-gpz-ref-only', name: 'Szyna GPZ 15 kV', voltage_kv: 15 },
    ];
    executeDomainOperationMock.mockResolvedValue({ snapshot: { header: { name: 'case-1' } } });

    render(<AddSnBayForm />);

    await waitFor(() => {
      expect(screen.getByText('wybierz:Aparat SN z katalogu')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('wybierz:Aparat SN z katalogu'));
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj pole SN' }));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_sn_bay',
        expect.objectContaining({
          bus_ref: 'bus-gpz-ref-only',
          station_ref: 'gpz-1',
        }),
      );
    });
  });
});
