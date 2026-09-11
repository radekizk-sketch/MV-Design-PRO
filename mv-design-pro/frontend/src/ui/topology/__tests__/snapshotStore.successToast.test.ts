import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

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
    // `Zapisano` dopisane w V12K-263 — jest forma DOKONANA (jak reszta listy),
    // a lista byla wyliczeniem czasownikow uzytych do tej pory, nie regula jezykowa.
    // Test zlapal moje dwa nowe komunikaty i to jest jego zamierzone dzialanie.
    const perfectivePrefixes = /^(Dodano|Wstawiono|Przedłużono|Rozpoczęto|Zamknięto|Ustawiono|Zaktualizowano|Przypisano|Usunięto|Zmieniono|Obliczono|Zwalidowano|Utworzono|Uruchomiono|Porównano|Wyeksportowano|Powiązano|Zapisano|Dołączono|Rozcięto|Scalono|Skopiowano)/;
    for (const [op, msg] of Object.entries(OPERATION_SUCCESS_MESSAGES)) {
      expect(msg, `${op}: "${msg}"`).toMatch(perfectivePrefixes);
    }
  });
});

/**
 * Parytet z kanonem backendu — DEKLARACJA PRZYPIĘTA TESTEM.
 *
 * Plik `operationSuccessMessages.ts` deklaruje, że pokrywa KAŻDĄ kanoniczną
 * operację domenową. Do tej pory pilnowała tego wyłącznie bramka pythonowa
 * (`scripts/success_toast_guard.py`), więc operacja dołożona w backendzie bez
 * komunikatu przechodziła całą regresję frontendu na zielono i dopiero CI
 * zapalało czerwień — po scaleniu, nie przy pisaniu kodu.
 *
 * Test czyta TEN SAM plik kanonu i TYM SAMYM wzorcem co bramka, więc nie da się
 * go zaspokoić lustrem w TS, które samo mogłoby się rozjechać z backendem.
 * Skutek: 16. operacja bez komunikatu (albo bez jawnego wpisu SILENT) zapala
 * czerwień w `vitest`, nie dopiero w bramce pythonowej.
 */
const CANON_OPERACJI = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'backend',
  'src',
  'domain',
  'canonical_operations.py',
);

function kanoniczneNazwyOperacji(): string[] {
  const tresc = fs.readFileSync(CANON_OPERACJI, 'utf-8');
  const nazwy = [...tresc.matchAll(/canonical_name="([a-z0-9_]+)"/g)].map((m) => m[1]);
  return [...new Set(nazwy)].sort();
}

describe('operationSuccessMessages — parytet z kanonem operacji backendu', () => {
  it('plik kanonu jest czytelny i niepusty (inaczej test milcząco nic nie sprawdza)', () => {
    expect(fs.existsSync(CANON_OPERACJI)).toBe(true);
    expect(kanoniczneNazwyOperacji().length).toBeGreaterThan(40);
  });

  it('KAŻDA operacja kanoniczna ma komunikat sukcesu albo jawny wpis SILENT', () => {
    const bezPokrycia = kanoniczneNazwyOperacji().filter(
      (op) => !(op in OPERATION_SUCCESS_MESSAGES) && !SILENT_OPERATIONS.has(op),
    );
    expect(bezPokrycia).toEqual([]);
  });

  it('operacja NIE MOŻE być jednocześnie opisana komunikatem i uznana za cichą', () => {
    // Sprzeczne wpisy przechodzą bramkę pythonową (liczy sumę zbiorów), a w
    // runtime wygrywa SILENT — komunikat byłby wtedy martwym tekstem.
    const sprzeczne = [...SILENT_OPERATIONS].filter((op) => op in OPERATION_SUCCESS_MESSAGES);
    expect(sprzeczne).toEqual([]);
  });
});
