import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContinueTrunkForm } from '../forms/ContinueTrunkForm';
import { buildOperationContext } from '../operationContext';

const snapshotState: {
  snapshot: any;
  executeDomainOperation: ReturnType<typeof vi.fn>;
} = {
  snapshot: null,
  executeDomainOperation: vi.fn(async () => undefined),
};

const closeOperationFormMock = vi.fn();
const activeOperationContextState: { value: Record<string, unknown> | undefined } = {
  value: undefined,
};

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeCaseId: string }) => unknown) =>
    selector({ activeCaseId: 'case-1' }),
}));

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (
    selector: (state: {
      snapshot: unknown;
      executeDomainOperation: () => Promise<void>;
    }) => unknown,
  ) => selector(snapshotState),
}));

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (state: { closeOperationForm: typeof closeOperationFormMock }) => unknown,
  ) =>
    selector({
      closeOperationForm: closeOperationFormMock,
    }),
  useActiveOperationContext: () => activeOperationContextState.value,
}));

describe('ContinueTrunkForm', () => {
  beforeEach(() => {
    activeOperationContextState.value = undefined;
    closeOperationFormMock.mockReset();
    snapshotState.executeDomainOperation.mockClear();
    snapshotState.snapshot = {
      substations: [
        {
          id: 'st-1',
          ref_id: 'st-1',
          name: 'Stacja 1',
          bus_refs: ['bus-sn-1'],
          transformer_refs: [],
        },
      ],
      bays: [
        {
          id: 'bay-out-1',
          ref_id: 'bay-out-1',
          substation_ref: 'st-1',
          bus_ref: 'bus-sn-1',
          bay_role: 'OUT',
          equipment_refs: [],
        },
      ],
      buses: [
        { id: 'bus-sn-1', ref_id: 'bus-sn-1', name: 'Szyna SN 1', voltage_kv: 15 },
      ],
      corridors: [
        { id: 'trunk-1', ref_id: 'trunk-1', ordered_segment_refs: ['seg-1', 'seg-2'] },
      ],
    };
  });

  it('renderuje kanoniczny kontekst kontynuacji magistrali', () => {
    const context = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: 'bay-out-1',
      elementType: 'BaySN',
      snapshot: snapshotState.snapshot,
      logicalViews: {
        terminals: [
          {
            element_id: 'bay-out-1',
            port_id: 'bay-out-1:OUT',
            trunk_id: 'trunk-1',
            status: 'DOSTEPNY',
          },
        ],
      } as any,
      extraContext: {
        segment_kind: 'KABEL_SN',
      },
    });

    activeOperationContextState.value = context;

    render(<ContinueTrunkForm />);

    expect(screen.getByDisplayValue('trunk-1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('bay-out-1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('bay-out-1:OUT')).toBeInTheDocument();
    expect(screen.getByDisplayValue('15 kV')).toBeInTheDocument();
  });

  it('blokuje zapis, gdy terminal magistrali nie zostal rozstrzygniety', () => {
    activeOperationContextState.value = {
      element_ref: 'source-gpz-1',
      element_type: 'Source',
    };

    render(<ContinueTrunkForm />);

    expect(screen.getByText('Brak jawnego terminala magistrali.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dodaj odcinek' })).toBeDisabled();
  });

  it('wysyla nowy odcinek przez kanoniczny from_terminal_id i opcjonalny trunk_id', async () => {
    const context = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: 'bay-out-1',
      elementType: 'BaySN',
      snapshot: snapshotState.snapshot,
      logicalViews: {
        terminals: [
          {
            element_id: 'bay-out-1',
            port_id: 'bay-out-1:OUT',
            trunk_id: 'trunk-1',
            status: 'DOSTEPNY',
          },
        ],
      } as any,
      extraContext: {
        segment_kind: 'KABEL_SN',
      },
    });

    snapshotState.executeDomainOperation.mockResolvedValue({ ok: true });
    activeOperationContextState.value = context;

    render(<ContinueTrunkForm />);

    fireEvent.change(screen.getByPlaceholderText('np. 350'), { target: { value: '350' } });
    fireEvent.change(screen.getByPlaceholderText('Wskaż pozycję katalogową'), {
      target: { value: 'XRUHAKXS-3x120' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj odcinek' }));

    await waitFor(() => {
        expect(snapshotState.executeDomainOperation).toHaveBeenCalledWith(
        'case-1',
        'continue_trunk_segment_sn',
        expect.objectContaining({
          trunk_id: 'trunk-1',
          from_terminal_id: 'bay-out-1',
          segment: expect.objectContaining({
            rodzaj: 'KABEL',
            dlugosc_m: 350,
          }),
        }),
      );
    });

    const payload = snapshotState.executeDomainOperation.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('from_bus_ref');
    expect(closeOperationFormMock).toHaveBeenCalledTimes(1);
  });
});
