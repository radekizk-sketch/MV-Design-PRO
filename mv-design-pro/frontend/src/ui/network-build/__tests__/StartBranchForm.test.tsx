import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StartBranchForm } from '../forms/StartBranchForm';
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

describe('StartBranchForm', () => {
  beforeEach(() => {
    activeOperationContextState.value = undefined;
    closeOperationFormMock.mockReset();
    snapshotState.executeDomainOperation.mockClear();
    snapshotState.snapshot = {
      substations: [
        { id: 'st-1', ref_id: 'st-1', name: 'Stacja 1' },
      ],
      bays: [
        {
          id: 'bay-feeder-1',
          ref_id: 'bay-feeder-1',
          substation_ref: 'st-1',
          bus_ref: 'bus-sn-1',
          bay_role: 'FEEDER',
        },
      ],
      buses: [
        { id: 'bus-sn-1', ref_id: 'bus-sn-1', name: 'Szyna SN 1', voltage_kv: 15 },
      ],
      branch_points: [],
    };
  });

  it('renderuje kanoniczny kontekst odgalezienia zbudowany przez operationContext', () => {
    const context = buildOperationContext({
      canonicalOp: 'start_branch_segment_sn',
      elementId: 'st-1',
      elementType: 'Station',
      snapshot: snapshotState.snapshot,
      logicalViews: null,
    });

    activeOperationContextState.value = context;

    render(<StartBranchForm />);

    expect(screen.getByDisplayValue('st-1.BRANCH')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Stacja SN/nN')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Stacja 1')).toBeInTheDocument();
  });

  it('blokuje zapis, gdy kanoniczny port BRANCH nie zostal rozstrzygniety', () => {
    activeOperationContextState.value = {
      element_ref: 'bus-sn-1',
      element_type: 'Bus',
    };

    render(<StartBranchForm />);

    expect(screen.getByText('Brak jawnego źródła odgałęzienia')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rozpocznij odgałęzienie' })).toBeDisabled();
  });

  it('wysyla odgalezienie przez kanoniczny from_ref bez wtórnego zgadywania from_bus_ref', async () => {
    const context = buildOperationContext({
      canonicalOp: 'start_branch_segment_sn',
      elementId: 'st-1',
      elementType: 'Station',
      snapshot: snapshotState.snapshot,
      logicalViews: null,
    });

    snapshotState.executeDomainOperation.mockResolvedValue({ ok: true });
    activeOperationContextState.value = context;

    render(<StartBranchForm />);

    fireEvent.change(screen.getByPlaceholderText('np. 0.85'), { target: { value: '0.85' } });
    fireEvent.change(screen.getByPlaceholderText('np. XRUHAKXS-3x95'), {
      target: { value: 'XRUHAKXS-3x95' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rozpocznij odgałęzienie' }));

    await waitFor(() => {
      expect(snapshotState.executeDomainOperation).toHaveBeenCalledWith(
        'case-1',
        'start_branch_segment_sn',
        expect.objectContaining({
          from_ref: 'st-1.BRANCH',
          segment: expect.objectContaining({
            rodzaj: 'KABEL',
            dlugosc_m: 850,
          }),
        }),
      );
    });

    const payload = snapshotState.executeDomainOperation.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('from_bus_ref');
    expect(closeOperationFormMock).toHaveBeenCalledTimes(1);
  });
});
