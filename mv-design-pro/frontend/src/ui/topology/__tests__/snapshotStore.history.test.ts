import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../domainApi', () => ({
  executeDomainOp: vi.fn(),
}));

import { executeDomainOp } from '../domainApi';
import { useSnapshotStore } from '../snapshotStore';

const mockedExecuteDomainOp = vi.mocked(executeDomainOp);

function createSuccessResponse(busName = 'Szyna SN-1') {
  return {
    snapshot: {
      header: { revision: 2 },
      buses: [
        {
          id: 'bus-1',
          ref_id: 'bus-1',
          name: busName,
        },
      ],
      branches: [],
      transformers: [],
      sources: [],
      loads: [],
      generators: [],
      substations: [],
      bays: [],
      junctions: [],
      corridors: [],
      measurements: [],
      protection_assignments: [],
      branch_points: [],
    },
    logical_views: {
      trunks: [],
      branches: [],
      secondary_connectors: [],
      terminals: [],
    },
    readiness: {
      ready: true,
      blockers: [],
      warnings: [],
    },
    fix_actions: [],
    materialized_params: null,
    layout: null,
    selection_hint: {
      element_id: 'bus-1',
      element_type: 'Bus',
      zoom_to: true,
    },
    changes: {
      created_element_ids: ['bus-1'],
      updated_element_ids: [],
      deleted_element_ids: [],
    },
    domain_events: [
      {
        event_seq: 1,
        event_type: 'created',
        element_id: 'bus-1',
      },
    ],
} as any;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe('snapshotStore operationHistory', () => {
  beforeEach(() => {
    useSnapshotStore.getState().reset();
    mockedExecuteDomainOp.mockReset();
  });

  it('stores successful domain operations in history with resolved element name', async () => {
    mockedExecuteDomainOp.mockResolvedValue(createSuccessResponse());

    await useSnapshotStore.getState().executeDomainOperation(
      'case-1',
      'add_grid_source_sn',
      { bus_ref: 'bus-1' },
    );

    const history = useSnapshotStore.getState().operationHistory;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      operation: 'add_grid_source_sn',
      elementRef: 'bus-1',
      elementName: 'Szyna SN-1',
      status: 'success',
      createdElementIds: ['bus-1'],
      updatedElementIds: [],
      deletedElementIds: [],
    });
  });

  it('stores error responses in history instead of leaving the modal empty', async () => {
    mockedExecuteDomainOp.mockResolvedValue({
      ...createSuccessResponse(),
      snapshot: null,
      selection_hint: null,
      changes: {
        created_element_ids: [],
        updated_element_ids: [],
        deleted_element_ids: [],
      },
      domain_events: [],
      error: 'Blad walidacji',
      error_code: 'VALIDATION',
    } as any);

    await useSnapshotStore.getState().executeDomainOperation(
      'case-1',
      'delete_element',
      { element_ref: 'station-1' },
    );

    const history = useSnapshotStore.getState().operationHistory;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      operation: 'delete_element',
      elementRef: 'station-1',
      elementName: null,
      status: 'error',
    });
  });

  it('ignores stale refresh responses after switching case context', async () => {
    const oldRefresh = deferred<any>();
    const newRefresh = deferred<any>();
    mockedExecuteDomainOp
      .mockReturnValueOnce(oldRefresh.promise)
      .mockReturnValueOnce(newRefresh.promise);

    const oldPromise = useSnapshotStore.getState().refreshFromBackend('case-old');
    useSnapshotStore.getState().reset();
    const newPromise = useSnapshotStore.getState().refreshFromBackend('case-new');

    newRefresh.resolve(createSuccessResponse('Szyna nowego przypadku'));
    await newPromise;

    oldRefresh.resolve(createSuccessResponse('Szyna starego przypadku'));
    await oldPromise;

    const state = useSnapshotStore.getState();
    expect(state.caseId).toBe('case-new');
    expect(state.snapshot?.buses?.[0]?.name).toBe('Szyna nowego przypadku');
  });
});
