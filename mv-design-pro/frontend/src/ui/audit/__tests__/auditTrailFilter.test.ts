import { describe, expect, it } from 'vitest';
import {
  applyAuditTrailFilter,
  groupAuditByDate,
  listUniqueUsers,
  listUniqueOperations,
  describeFilter,
} from '../auditTrailFilter';
import type { OperationHistoryEntry } from '../elementHistory';

const history: OperationHistoryEntry[] = [
  {
    operation_name: 'add_grid_source_sn',
    element_ref: 'gpz/main',
    user_id: 'jan',
    timestamp: '2026-05-01T10:00:00Z',
    note: 'Pierwsza wersja',
  },
  {
    operation_name: 'add_sn_bay',
    element_ref: 'gpz/main/bay/1',
    user_id: 'jan',
    timestamp: '2026-05-02T11:00:00Z',
    note: 'Pole liniowe',
  },
  {
    operation_name: 'add_sn_bay',
    element_ref: 'gpz/main/bay/2',
    user_id: 'anna',
    timestamp: '2026-05-03T12:00:00Z',
    note: 'Pole transformatorowe',
  },
];

describe('applyAuditTrailFilter', () => {
  it('zwraca wszystko gdy filter pusty', () => {
    expect(applyAuditTrailFilter(history, {})).toEqual(history);
  });

  it('filtruje po dacie od', () => {
    const r = applyAuditTrailFilter(history, { dateFrom: '2026-05-02T00:00:00Z' });
    expect(r).toHaveLength(2);
  });

  it('filtruje po dacie do', () => {
    const r = applyAuditTrailFilter(history, { dateTo: '2026-05-02T00:00:00Z' });
    expect(r).toHaveLength(1);
  });

  it('filtruje po user_id', () => {
    expect(applyAuditTrailFilter(history, { userId: 'jan' })).toHaveLength(2);
    expect(applyAuditTrailFilter(history, { userId: 'anna' })).toHaveLength(1);
  });

  it('filtruje po operation_name', () => {
    expect(applyAuditTrailFilter(history, { operationName: 'add_sn_bay' })).toHaveLength(2);
  });

  it('filtruje po element_ref', () => {
    expect(applyAuditTrailFilter(history, { elementRef: 'gpz/main/bay/1' })).toHaveLength(1);
  });

  it('search text w note (case-insensitive)', () => {
    expect(applyAuditTrailFilter(history, { searchText: 'POLE' })).toHaveLength(2);
    expect(applyAuditTrailFilter(history, { searchText: 'transformator' })).toHaveLength(1);
  });

  it('kombinacja: user=jan + operation=add_sn_bay', () => {
    const r = applyAuditTrailFilter(history, {
      userId: 'jan',
      operationName: 'add_sn_bay',
    });
    expect(r).toHaveLength(1);
  });
});

describe('groupAuditByDate', () => {
  it('grupuje wpisy po dacie', () => {
    const groups = groupAuditByDate(history);
    expect(groups).toHaveLength(3); // 3 różne daty
    expect(groups[0].date).toBe('2026-05-03'); // sortowane desc
  });

  it('wiele wpisów tego samego dnia → jedna grupa', () => {
    const sameDayHistory = [
      ...history,
      {
        operation_name: 'edit',
        element_ref: 'gpz/main',
        user_id: 'jan',
        timestamp: '2026-05-01T14:00:00Z',
      },
    ];
    const groups = groupAuditByDate(sameDayHistory);
    const may1 = groups.find((g) => g.date === '2026-05-01');
    expect(may1?.entries).toHaveLength(2);
  });
});

describe('listUniqueUsers', () => {
  it('lista posortowana alfabetycznie', () => {
    expect(listUniqueUsers(history)).toEqual(['anna', 'jan']);
  });
});

describe('listUniqueOperations', () => {
  it('lista bez duplikatów', () => {
    expect(listUniqueOperations(history)).toEqual(['add_grid_source_sn', 'add_sn_bay']);
  });
});

describe('describeFilter', () => {
  it('zwraca "wszystkie" dla pustego', () => {
    expect(describeFilter({})).toBe('wszystkie');
  });

  it('opisuje aktywne filtry PL', () => {
    const desc = describeFilter({ userId: 'jan', searchText: 'pole' });
    expect(desc).toContain('użytkownik: jan');
    expect(desc).toContain('szukaj: "pole"');
  });
});
