import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContinueTrunkForm } from '../ContinueTrunkForm';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();

const appState = { activeCaseId: 'case-1' };
const snapshotState = {
  snapshot: {
    corridors: [],
    buses: [
      { id: 'bus-gpz-1', ref_id: 'bus-gpz-1', name: 'Szyna GPZ 15 kV', voltage_kv: 15 },
    ],
  },
  executeDomainOperation: executeDomainOperationMock,
};

const networkBuildState = {
  activeOperationForm: {
    context: {
      from_bus_ref: 'bus-gpz-1',
      terminal_id: 'bus-gpz-1',
      segment_kind: 'KABEL_SN',
    },
  },
  closeOperationForm: closeFormMock,
};

vi.mock('../../../app-state', () => ({
  useAppStateStore: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../topology/snapshotStore', () => ({
  useSnapshotStore: (
    selector: (state: typeof snapshotState) => unknown,
  ) => selector(snapshotState),
}));

vi.mock('../../networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (state: typeof networkBuildState) => unknown,
  ) => selector(networkBuildState),
  useActiveOperationForm: () => networkBuildState.activeOperationForm,
  useActiveOperationContext: () => networkBuildState.activeOperationForm.context,
}));

describe('ContinueTrunkForm', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
  });

  it('pozwala utworzyć pierwszy odcinek magistrali z GPZ bez trunk_id', async () => {
    executeDomainOperationMock.mockResolvedValue({ ok: true });

    render(<ContinueTrunkForm />);

    expect(screen.getByText('Kontynuuj magistrale z terminala pola')).toBeInTheDocument();
    expect(screen.getByDisplayValue('bus-gpz-1')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('np. 350'), { target: { value: '400' } });
    fireEvent.change(screen.getByPlaceholderText('Wskaż pozycję katalogową'), {
      target: { value: 'XRUHAKXS-3x120' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj odcinek' }));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'continue_trunk_segment_sn',
        expect.objectContaining({
          from_terminal_id: 'bus-gpz-1',
          segment: expect.objectContaining({
            dlugosc_m: 400,
          }),
        }),
      );
    });

    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('trunk_id');
    expect(closeFormMock).toHaveBeenCalled();
  });
});
