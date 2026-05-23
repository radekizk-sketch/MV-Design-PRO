import { describe, expect, it } from 'vitest';
import {
  filterElementHistory,
  summarizeElementHistory,
  type OperationHistoryEntry,
} from '../elementHistory';

const history: OperationHistoryEntry[] = [
  {
    operation_name: 'add_grid_source_sn',
    element_ref: 'gpz/main/source',
    user_id: 'user1',
    timestamp: '2026-05-01T10:00:00Z',
  },
  {
    operation_name: 'add_sn_bay',
    element_ref: 'gpz/main/bay/1',
    user_id: 'user1',
    timestamp: '2026-05-01T10:05:00Z',
    parameters: { parent_ref: 'gpz/main/source' },
  },
  {
    operation_name: 'edit_bay',
    element_ref: 'gpz/main/bay/1',
    user_id: 'user2',
    timestamp: '2026-05-02T11:00:00Z',
  },
  {
    operation_name: 'unrelated_op',
    element_ref: 'other/element',
    user_id: 'user1',
    timestamp: '2026-05-03T12:00:00Z',
  },
];

describe('filterElementHistory', () => {
  it('zwraca tylko entries dla danego element_ref', () => {
    const filtered = filterElementHistory({
      elementRef: 'gpz/main/bay/1',
      history,
    });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((e) => e.element_ref === 'gpz/main/bay/1')).toBe(true);
  });

  it('zwraca pustą listę gdy brak match', () => {
    const filtered = filterElementHistory({
      elementRef: 'nieistniejacy/ref',
      history,
    });
    expect(filtered).toHaveLength(0);
  });

  it('includeRelated=true dorzuca powiązane przez parent_ref', () => {
    const filtered = filterElementHistory({
      elementRef: 'gpz/main/source',
      history,
      includeRelated: true,
    });
    expect(filtered.length).toBeGreaterThan(1);
    // Sorted by timestamp
    expect(filtered[0].timestamp <= filtered[1].timestamp).toBe(true);
  });
});

describe('summarizeElementHistory', () => {
  it('liczy totalOps + first/last + unique users/ops', () => {
    const summary = summarizeElementHistory('gpz/main/bay/1', history);
    expect(summary.totalOps).toBe(2);
    expect(summary.firstOp?.operation_name).toBe('add_sn_bay');
    expect(summary.lastOp?.operation_name).toBe('edit_bay');
    expect(summary.uniqueUsers).toEqual(['user1', 'user2']);
    expect(summary.uniqueOperations).toEqual(['add_sn_bay', 'edit_bay']);
  });

  it('puste summary dla nieistniejącego ref', () => {
    const summary = summarizeElementHistory('brak', history);
    expect(summary.totalOps).toBe(0);
    expect(summary.firstOp).toBe(null);
    expect(summary.lastOp).toBe(null);
  });
});
