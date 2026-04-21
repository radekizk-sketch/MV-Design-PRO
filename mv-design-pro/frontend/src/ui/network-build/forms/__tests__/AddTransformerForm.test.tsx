import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AddTransformerForm } from '../AddTransformerForm';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();

const appState = { activeCaseId: 'case-1' };
const snapshotState = {
  snapshot: {
    substations: [
      {
        id: 'st-1',
        ref_id: 'st-1',
        name: 'ST-1',
        station_type: 'mv_lv',
        bus_refs: ['bus-sn', 'bus-nn'],
        transformer_refs: [],
      },
      {
        id: 'gpz-1',
        ref_id: 'gpz-1',
        name: 'GPZ-1',
        station_type: 'gpz',
        bus_refs: ['bus-gpz'],
        transformer_refs: [],
      },
    ],
    buses: [
      { ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15 },
      { ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 },
      { ref_id: 'bus-gpz', name: 'Szyna GPZ', voltage_kv: 15 },
    ],
  },
  executeDomainOperation: executeDomainOperationMock,
};

const networkBuildState = {
  activeOperationForm: {
    context: {
      station_ref: 'st-1',
      hv_bus_ref: 'bus-sn',
      lv_bus_ref: 'bus-nn',
    },
  },
  closeOperationForm: closeFormMock,
};

vi.mock('../../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeCaseId: string }) => unknown) => selector(appState),
}));

vi.mock('../../../topology/snapshotStore', () => ({
  useSnapshotStore: (
    selector: (state: {
      snapshot: typeof snapshotState.snapshot;
      executeDomainOperation: typeof executeDomainOperationMock;
    }) => unknown,
  ) =>
    selector({
      snapshot: snapshotState.snapshot,
      executeDomainOperation: executeDomainOperationMock,
    }),
  selectBusOptions: (snapshot: typeof snapshotState.snapshot) =>
    snapshot.buses.map((bus) => ({
      ref_id: bus.ref_id,
      name: bus.name,
      voltage_kv: bus.voltage_kv,
    })),
}));

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
  }) => (
    <button
      type="button"
      data-testid="transformer-submit"
      onClick={() =>
        onSubmit({
          ref_id: 'tr-1',
          name: 'Trafo ST-1',
          hv_bus_ref: 'bus-sn',
          lv_bus_ref: 'bus-nn',
          tap_position: 0,
          catalog_ref: 'TRAFO_SN_NN/TMG-400',
          parameter_source: 'CATALOG',
          overrides: [],
        })
      }
    >
      Dodaj transformator
    </button>
  ),
}));

describe('AddTransformerForm', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    networkBuildState.activeOperationForm.context = {
      station_ref: 'st-1',
      hv_bus_ref: 'bus-sn',
      lv_bus_ref: 'bus-nn',
    };
  });

  it('wysyla transformator z kanonicznym kontekstem stacji SN/nN', async () => {
    executeDomainOperationMock.mockResolvedValue({ snapshot: { header: { name: 'case-1' } } });

    render(<AddTransformerForm />);

    fireEvent.click(screen.getByTestId('transformer-submit'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_transformer_sn_nn',
        expect.objectContaining({
          ref_id: 'tr-1',
          station_ref: 'st-1',
          hv_bus_ref: 'bus-sn',
          lv_bus_ref: 'bus-nn',
          catalog_binding: expect.objectContaining({
            catalog_namespace: 'TRAFO_SN_NN',
            catalog_item_id: 'TRAFO_SN_NN/TMG-400',
          }),
        }),
      );
    });

    expect(closeFormMock).toHaveBeenCalledTimes(1);
  });

  it('pokazuje jawna blokade dla kontekstu GPZ bez pary szyn SN/nN', () => {
    networkBuildState.activeOperationForm.context = {
      station_ref: 'gpz-1',
      hv_bus_ref: 'bus-gpz',
    };

    render(<AddTransformerForm />);

    expect(screen.getByTestId('add-transformer-block')).toBeInTheDocument();
    expect(screen.getByText('Blokada operacji')).toBeInTheDocument();
    expect(
      screen.getByText('Transformator SN/nN nie nalezy do ukladu GPZ lub zrodla systemowego.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('transformer-submit')).not.toBeInTheDocument();
  });
});
