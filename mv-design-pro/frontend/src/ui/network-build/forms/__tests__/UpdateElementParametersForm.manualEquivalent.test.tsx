import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import UpdateElementParametersForm from '../UpdateElementParametersForm';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn(async () => undefined);
const appState = { activeCaseId: 'case-1' };
const snapshotState = {
  snapshot: {
    branches: [
      {
        ref_id: 'line-1',
        id: 'line-1',
        name: 'Odcinek testowy',
        type: 'cable',
        status: 'closed',
        length_km: 1.25,
        catalog_ref: 'KABEL-120',
        catalog_namespace: 'KABEL_SN',
        parameter_source: 'CATALOG',
        source_mode: 'KATALOG',
      },
    ],
    transformers: [],
    branch_points: [],
    generators: [],
    substations: [],
    loads: [],
    sources: [],
    buses: [],
  },
  executeDomainOperation: executeDomainOperationMock,
};
const networkBuildState = {
  activeOperationForm: {
    context: {
      element_ref: 'line-1',
      manual_equivalent: true,
    },
  },
  closeOperationForm: closeFormMock,
};

vi.mock('../../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeCaseId: string }) => unknown) =>
    selector(appState),
}));

vi.mock('../../../topology/snapshotStore', () => ({
  useSnapshotStore: (
    selector: (state: {
      snapshot: {
        branches: Array<Record<string, unknown>>;
        transformers: [];
        branch_points: [];
        generators: [];
        substations: [];
        loads: [];
        sources: [];
        buses: [];
      };
      executeDomainOperation: typeof executeDomainOperationMock;
    }) => unknown,
  ) =>
    selector(snapshotState),
}));

vi.mock('../../networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (state: {
      activeOperationForm: { context: Record<string, unknown> };
      closeOperationForm: typeof closeFormMock;
    }) => unknown,
  ) =>
    selector(networkBuildState),
  useActiveOperationForm: () => networkBuildState.activeOperationForm,
  useActiveOperationContext: () => networkBuildState.activeOperationForm.context,
}));

describe('UpdateElementParametersForm manual equivalent', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    executeDomainOperationMock.mockClear();
  });

  it('zapisuje umowę równoważną ręczną przez update_element_parameters', async () => {
    render(<UpdateElementParametersForm />);

    expect(screen.getByTestId('manual-equivalent-section')).toBeInTheDocument();
    expect(screen.getByTestId('manual-equivalent-toggle')).toBeChecked();

    fireEvent.click(screen.getByTestId('manual-equivalent-add-entry'));
    fireEvent.change(screen.getByTestId('manual-equivalent-key-0'), {
      target: { value: 'r_ohm_per_km' },
    });
    fireEvent.change(screen.getByTestId('manual-equivalent-value-0'), {
      target: { value: '0.253' },
    });
    fireEvent.change(screen.getByTestId('manual-equivalent-reason-0'), {
      target: { value: 'Pomiar projektowy' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Zapisz parametry' }));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'update_element_parameters',
        {
          element_ref: 'line-1',
          parameters: expect.objectContaining({
            source_mode: 'EKSPERCKI_RECZNY',
            catalog_namespace: null,
            parameter_source: 'OVERRIDE',
            materialized_params: null,
            r_ohm_per_km: 0.253,
            overrides: [
              {
                key: 'r_ohm_per_km',
                value: 0.253,
                reason: 'Pomiar projektowy',
              },
            ],
          }),
        },
      );
    });

    expect(closeFormMock).toHaveBeenCalledTimes(1);
  });
});
