import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AddNnOutgoingFieldForm } from '../AddNnOutgoingFieldForm';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();

const appState = { activeCaseId: 'case-1' };
const networkBuildState = {
  activeOperationForm: {
    op: 'add_nn_outgoing_field' as const,
    context: {
      station_ref: 'st-1',
      bus_nn_ref: 'bus-nn-1',
      field_role: 'SOURCE',
      source_field_kind: 'FW',
    },
  },
  closeOperationForm: closeFormMock,
};

const snapshot = {
  substations: [
    {
      id: 'st-1',
      ref_id: 'st-1',
      name: 'ST-1',
      bus_refs: ['bus-nn-1'],
      transformer_refs: [],
    },
  ],
  buses: [
    { id: 'bus-nn-1', ref_id: 'bus-nn-1', name: 'Szyna nN', voltage_kv: 0.4 },
  ],
} as const;

vi.mock('../../../app-state', () => ({
  useAppStateStore: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../topology/snapshotStore', () => ({
  useSnapshotStore: (
    selector: (state: {
      snapshot: typeof snapshot;
      executeDomainOperation: typeof executeDomainOperationMock;
    }) => unknown,
  ) =>
    selector({
      snapshot,
      executeDomainOperation: executeDomainOperationMock,
    }),
}));

vi.mock('../../networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (state: typeof networkBuildState) => unknown,
  ) => selector(networkBuildState),
  useActiveOperationForm: () => networkBuildState.activeOperationForm,
  useActiveOperationContext: () => networkBuildState.activeOperationForm.context,
}));

vi.mock('../../../catalog/api', () => ({
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

describe('AddNnOutgoingFieldForm', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    networkBuildState.activeOperationForm = {
      op: 'add_nn_outgoing_field',
      context: {
        station_ref: 'st-1',
        bus_nn_ref: 'bus-nn-1',
        field_role: 'SOURCE',
        source_field_kind: 'FW',
      },
    };
  });

  it('zapisuje pole przyłączeniowe przez kanoniczne add_nn_outgoing_field z jawną rolą SOURCE', async () => {
    executeDomainOperationMock.mockResolvedValue({});

    render(<AddNnOutgoingFieldForm />);

    await waitFor(() => {
      expect(screen.getByText('wybierz:Aparat nN z katalogu')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('wybierz:Aparat nN z katalogu'));
    fireEvent.click(screen.getByRole('button', { name: /Dodaj pole przyłączeniowe/i }));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_nn_outgoing_field',
        expect.objectContaining({
          station_ref: 'st-1',
          bus_nn_ref: 'bus-nn-1',
          field_role: 'SOURCE',
          source_field_kind: 'FW',
          catalog_binding: expect.objectContaining({
            catalog_namespace: 'APARAT_NN',
            catalog_item_id: 'ap-nn-1',
          }),
        }),
      );
    });

    expect(closeFormMock).toHaveBeenCalledTimes(1);
  });

  it('zapisuje zwykly odplyw nN przez kanoniczne add_nn_outgoing_field', async () => {
    executeDomainOperationMock.mockResolvedValue({});
    networkBuildState.activeOperationForm = {
      op: 'add_nn_outgoing_field',
      context: {
        station_ref: 'st-1',
        bus_nn_ref: 'bus-nn-1',
      },
    };

    render(<AddNnOutgoingFieldForm />);

    await waitFor(() => {
      expect(screen.getByText('wybierz:Aparat nN z katalogu')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('wybierz:Aparat nN z katalogu'));
    fireEvent.click(screen.getByRole('button', { name: /Dodaj pole nN/i }));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_nn_outgoing_field',
        expect.objectContaining({
          station_ref: 'st-1',
          bus_nn_ref: 'bus-nn-1',
          field_role: 'FEEDER',
        }),
      );
    });
  });

  it('zapisuje pole przyłączeniowe AGREGAT przez kanoniczne add_nn_outgoing_field z jawną rolą SOURCE', async () => {
    executeDomainOperationMock.mockResolvedValue({});
    networkBuildState.activeOperationForm = {
      op: 'add_nn_outgoing_field',
      context: {
        station_ref: 'st-1',
        bus_nn_ref: 'bus-nn-1',
        field_role: 'SOURCE',
        source_field_kind: 'AGREGAT',
      },
    };

    render(<AddNnOutgoingFieldForm />);

    await waitFor(() => {
      expect(screen.getByText('wybierz:Aparat nN z katalogu')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('wybierz:Aparat nN z katalogu'));
    fireEvent.click(screen.getByRole('button', { name: /Dodaj pole przyłączeniowe/i }));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_nn_outgoing_field',
        expect.objectContaining({
          field_role: 'SOURCE',
          source_field_kind: 'AGREGAT',
        }),
      );
    });
  });
});
