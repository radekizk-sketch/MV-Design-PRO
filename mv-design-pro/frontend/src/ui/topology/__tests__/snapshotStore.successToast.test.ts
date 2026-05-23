import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../domainApi', () => ({
  executeDomainOp: vi.fn(),
}));

vi.mock('../../notifications/store', () => ({
  notify: vi.fn(),
}));

import { executeDomainOp } from '../domainApi';
import { notify } from '../../notifications/store';
import { useSnapshotStore } from '../snapshotStore';
import {
  OPERATION_SUCCESS_MESSAGES,
  SILENT_OPERATIONS,
  getOperationSuccessMessage,
} from '../operationSuccessMessages';

const mockedExecuteDomainOp = vi.mocked(executeDomainOp);
const mockedNotify = vi.mocked(notify);

function successResponse(hash = 'hash-2') {
  return {
    snapshot: {
      header: { revision: 2, hash_sha256: hash },
      buses: [],
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
    logical_views: { trunks: [], branches: [], secondary_connectors: [], terminals: [] },
    readiness: { ready: true, blockers: [], warnings: [] },
    fix_actions: [],
    materialized_params: null,
    layout: null,
    selection_hint: null,
    changes: { created_element_ids: [], updated_element_ids: [], deleted_element_ids: [] },
    domain_events: [],
  } as any;
}

function errorResponse(message = 'Walidacja nie powiodła się') {
  return { ...successResponse(), error: message, error_code: 'VALIDATION' } as any;
}

describe('snapshotStore central success toast', () => {
  beforeEach(() => {
    useSnapshotStore.getState().reset();
    mockedExecuteDomainOp.mockReset();
    mockedNotify.mockReset();
  });

  it('emituje toast sukcesu po udanej operacji domenowej', async () => {
    mockedExecuteDomainOp.mockResolvedValue(successResponse());
    await useSnapshotStore.getState().executeDomainOperation('case-1', 'add_grid_source_sn', {});
    expect(mockedNotify).toHaveBeenCalledWith('Dodano źródło zasilające GPZ', 'success');
  });

  it('emituje właściwy komunikat per operacja', async () => {
    mockedExecuteDomainOp.mockResolvedValue(successResponse());
    await useSnapshotStore.getState().executeDomainOperation('case-1', 'add_converter_source', {});
    expect(mockedNotify).toHaveBeenCalledWith('Dodano źródło przekształtnikowe (OZE)', 'success');
  });

  it('NIE emituje toast sukcesu gdy operacja zwraca error', async () => {
    mockedExecuteDomainOp.mockResolvedValue(errorResponse());
    await useSnapshotStore.getState().executeDomainOperation('case-1', 'add_sn_bay', {});
    const successCalls = mockedNotify.mock.calls.filter((c) => c[1] === 'success');
    expect(successCalls).toHaveLength(0);
  });

  it('NIE emituje toast dla operacji cichych (refresh_snapshot)', async () => {
    mockedExecuteDomainOp.mockResolvedValue(successResponse());
    await useSnapshotStore.getState().executeDomainOperation('case-1', 'refresh_snapshot', {});
    const successCalls = mockedNotify.mock.calls.filter((c) => c[1] === 'success');
    expect(successCalls).toHaveLength(0);
  });

  it('nieznana operacja dostaje generyczny komunikat (zawsze feedback)', async () => {
    mockedExecuteDomainOp.mockResolvedValue(successResponse());
    await useSnapshotStore.getState().executeDomainOperation('case-1', 'some_new_op', {});
    expect(mockedNotify).toHaveBeenCalledWith('Operacja zakończona powodzeniem', 'success');
  });
});

describe('operationSuccessMessages map', () => {
  it('pokrywa 5 krytycznych operacji workflow', () => {
    for (const op of [
      'add_grid_source_sn',
      'add_sn_bay',
      'continue_trunk_segment_sn',
      'insert_station_on_segment_sn',
      'add_converter_source',
    ]) {
      expect(OPERATION_SUCCESS_MESSAGES[op]).toBeTruthy();
    }
  });

  it('operacje ciche zwracają null', () => {
    for (const op of SILENT_OPERATIONS) {
      expect(getOperationSuccessMessage(op)).toBeNull();
    }
  });

  it('wszystkie komunikaty są w formie dokonanej (PL)', () => {
    const perfectivePrefixes = /^(Dodano|Wstawiono|Przedłużono|Rozpoczęto|Zamknięto|Ustawiono|Zaktualizowano|Przypisano|Usunięto|Zmieniono|Obliczono|Zwalidowano|Utworzono|Uruchomiono|Porównano|Wyeksportowano|Powiązano)/;
    for (const [op, msg] of Object.entries(OPERATION_SUCCESS_MESSAGES)) {
      expect(msg, `${op}: "${msg}"`).toMatch(perfectivePrefixes);
    }
  });
});
