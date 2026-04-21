import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InsertStationForm } from '../InsertStationForm';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();

const appState = { activeCaseId: 'case-1' };
const networkBuildState = {
  activeOperationForm: {
    context: {
      segment_id: 'seg-1',
      position_on_segment: 0.25,
      station_type: 'branch',
      name: 'ST-01',
    },
  },
  closeOperationForm: closeFormMock,
};

const snapshotState = {
  snapshot: {
    buses: [
      { ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15 },
      { ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 },
    ],
  },
  executeDomainOperation: executeDomainOperationMock,
};

vi.mock('../../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeCaseId: string }) => unknown) => selector(appState),
}));

vi.mock('../../../topology/snapshotStore', async () => {
  return {
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
      data-testid="station-submit"
      onClick={() =>
        onSubmit({
          ref_id: 'st-01',
          name: 'Stacja Konarzewo',
          hv_bus_ref: 'bus-sn',
          lv_bus_ref: 'bus-nn',
          tap_position: 0,
          catalog_ref: 'TRAFO_SN_NN/TMG-400',
          parameter_source: 'CATALOG',
          overrides: [],
        })
      }
    >
      Zapisz stację
    </button>
  ),
}));

describe('InsertStationForm', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
  });

  it('buduje bogatszy payload stacji z odpływami nN oraz przygotowaniem pod PV i BESS', async () => {
    executeDomainOperationMock.mockResolvedValue({ snapshot: { header: { name: 'case-1' } } });

    render(<InsertStationForm />);

    fireEvent.change(screen.getByLabelText('Liczba odpływów nN'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Dodaj przygotowanie pod PV po stronie nN/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Dodaj przygotowanie pod BESS po stronie nN/i }));
    fireEvent.click(screen.getByTestId('station-submit'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_station_on_segment_sn',
        expect.objectContaining({
          segment_id: 'seg-1',
          station_type: 'branch',
          station: expect.objectContaining({ station_type: 'branch' }),
          sn_fields: expect.arrayContaining([
            expect.objectContaining({ field_role: 'LINIA_IN' }),
            expect.objectContaining({ field_role: 'LINIA_OUT' }),
            expect.objectContaining({ field_role: 'LINIA_ODG' }),
            expect.objectContaining({ field_role: 'TRANSFORMATOROWE' }),
          ]),
          nn_block: expect.objectContaining({
            outgoing_feeders_nn_count: 5,
            outgoing_feeders_nn: [
              { feeder_role: 'ODPLYW_NN', catalog_bindings: null },
              { feeder_role: 'ODPLYW_NN', catalog_bindings: null },
              { feeder_role: 'ODPLYW_NN', catalog_bindings: null },
              { feeder_role: 'ZRODLO_NN_PV', catalog_bindings: null },
              { feeder_role: 'ZRODLO_NN_BESS', catalog_bindings: null },
            ],
          }),
        }),
      );
    });

    expect(closeFormMock).toHaveBeenCalledTimes(1);
  });
});
