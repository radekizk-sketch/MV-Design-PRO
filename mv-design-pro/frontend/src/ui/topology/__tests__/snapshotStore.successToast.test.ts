// @vitest-environment node
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
import { isCanonicalOpName } from '../../../types/domainOps';
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

  // W5-C: wywołujący, który wie więcej o skutku, podaje zdanie magazynowi — toast sukcesu
  // jest JEDEN (dawniej: centralny + lokalny). Iloczyn: {z komunikatem, bez} × {sukces, błąd}
  // × {operacja z komunikatem, operacja cicha}.
  it.each([
    ['assign_catalog_to_element', 'Przypisano typ: Kabel 120', 'sukces', 'Przypisano typ: Kabel 120'],
    ['assign_catalog_to_element', undefined, 'sukces', 'centralny'],
    ['refresh_snapshot', 'Odświeżono', 'sukces', 'Odświeżono'],
    ['refresh_snapshot', undefined, 'sukces', null],
    ['delete_element', 'Usunięto pole z modelu sieci.', 'blad', null],
  ] as const)('%s z komunikatem %s × %s → jeden toast %s', async (op, komunikat, wynik, oczekiwany) => {
    mockedExecuteDomainOp.mockResolvedValue(wynik === 'sukces' ? successResponse() : errorResponse());
    await useSnapshotStore
      .getState()
      .executeDomainOperation('case-1', op, {}, komunikat ? { komunikatSukcesuPl: komunikat } : undefined);
    const sukcesy = mockedNotify.mock.calls.filter((c) => c[1] === 'success').map((c) => c[0]);
    if (oczekiwany === null) expect(sukcesy).toEqual([]);
    else if (oczekiwany === 'centralny') expect(sukcesy).toEqual([getOperationSuccessMessage(op)]);
    else expect(sukcesy).toEqual([oczekiwany]);
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

  it('każdy klucz mapy to nazwa operacji kanonicznej — bez martwych wpisów', () => {
    // Komunikat pod nazwą, której żadne wywołanie nie wysyła (dawne `edit_bay`, warianty
    // `bus_nn_add_converter_source_*`), to fałszywa deklaracja pokrycia.
    const martwe = Object.keys(OPERATION_SUCCESS_MESSAGES).filter((op) => !isCanonicalOpName(op));
    expect(martwe).toEqual([]);
  });

  it('operacje ciche zwracają null', () => {
    for (const op of SILENT_OPERATIONS) {
      expect(getOperationSuccessMessage(op)).toBeNull();
    }
  });

  it('wszystkie komunikaty są w formie dokonanej (PL)', () => {
    // `Zapisano` dopisane w V12K-263 — jest forma DOKONANA (jak reszta listy),
    // a lista byla wyliczeniem czasownikow uzytych do tej pory, nie regula jezykowa.
    // Test zlapal moje dwa nowe komunikaty i to jest jego zamierzone dzialanie.
    // `Otwarto` (karta W5-C, `open_switch`) — forma dokonana jak `Zamknięto` dla `close_switch`.
    const perfectivePrefixes = /^(Otwarto|Dodano|Wstawiono|Przedłużono|Rozpoczęto|Zamknięto|Ustawiono|Zaktualizowano|Przypisano|Usunięto|Zmieniono|Obliczono|Zwalidowano|Utworzono|Uruchomiono|Porównano|Wyeksportowano|Powiązano|Zapisano|Podzielono|Scalono|Skopiowano)/;
    for (const [op, msg] of Object.entries(OPERATION_SUCCESS_MESSAGES)) {
      expect(msg, `${op}: "${msg}"`).toMatch(perfectivePrefixes);
    }
  });
});
