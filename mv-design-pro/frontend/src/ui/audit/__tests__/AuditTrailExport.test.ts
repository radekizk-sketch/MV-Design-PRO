import { describe, expect, it } from 'vitest';
import { exportAuditTrailCsv, exportAuditTrailJson } from '../AuditTrailExport';
import type { SnapshotOperationHistoryEntry } from '../../topology/snapshotStore';

function makeEntry(overrides: Partial<SnapshotOperationHistoryEntry> = {}): SnapshotOperationHistoryEntry {
  return {
    id: 'op-1',
    timestamp: '2026-05-22T10:30:00.000Z',
    operation: 'add_grid_source_sn',
    operationLabel: 'Dodanie GPZ',
    elementRef: 'gpz-1',
    elementName: 'GPZ Główny',
    status: 'success',
    createdElementIds: ['gpz-1', 'bus-1'],
    updatedElementIds: [],
    deletedElementIds: [],
    ...overrides,
  };
}

describe('exportAuditTrailCsv', () => {
  it('zwraca CSV z nagłówkiem + wpisami', () => {
    const csv = exportAuditTrailCsv([makeEntry()]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Data');
    expect(lines[0]).toContain('Operacja');
    expect(lines[0]).toContain('Status');
    expect(lines.length).toBe(2);
  });

  it('escape przecinka w nazwie elementu', () => {
    const csv = exportAuditTrailCsv([
      makeEntry({ elementName: 'GPZ, sekcja 1' }),
    ]);
    expect(csv).toContain('"GPZ, sekcja 1"');
  });

  it('formatuje timestamp jako YYYY-MM-DD HH:MM:SS', () => {
    const csv = exportAuditTrailCsv([makeEntry()]);
    expect(csv).toMatch(/2026-05-22 10:30:00/);
  });

  it('puste createdElements jako pusty string', () => {
    const csv = exportAuditTrailCsv([makeEntry({ createdElementIds: [] })]);
    const lines = csv.split('\n');
    const cells = lines[1].split(',');
    // Indeks 5 = Utworzone
    expect(cells[5]).toBe('');
  });

  it('joinuje wiele ID-ów średnikiem', () => {
    const csv = exportAuditTrailCsv([
      makeEntry({ createdElementIds: ['gpz-1', 'bus-1', 'bus-2'] }),
    ]);
    expect(csv).toContain('gpz-1; bus-1; bus-2');
  });
});

describe('exportAuditTrailJson', () => {
  it('zwraca poprawny JSON z polskim labelem', () => {
    const json = exportAuditTrailJson([makeEntry()]);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].operation).toBe('add_grid_source_sn');
    expect(parsed[0].operation_label_pl).toBe('Dodanie GPZ');
    expect(parsed[0].status).toBe('success');
    expect(parsed[0].created_elements).toEqual(['gpz-1', 'bus-1']);
  });

  it('zwraca pretty-printed JSON (indent 2)', () => {
    const json = exportAuditTrailJson([makeEntry()]);
    expect(json).toContain('\n  ');
  });

  it('zwraca pustą tablicę dla pustej historii', () => {
    const json = exportAuditTrailJson([]);
    expect(JSON.parse(json)).toEqual([]);
  });
});
