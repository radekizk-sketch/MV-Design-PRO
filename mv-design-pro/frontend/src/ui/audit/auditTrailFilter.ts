/**
 * auditTrailFilter — filtry audit trail (Etap 17 z planu).
 *
 * "Filtry: data, user, typ operacji"
 * "Search po komentarzu/notatce"
 */

import type { OperationHistoryEntry } from './elementHistory';

export interface AuditTrailFilter {
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  operationName?: string;
  searchText?: string;
  elementRef?: string;
}

export function applyAuditTrailFilter(
  history: readonly OperationHistoryEntry[],
  filter: AuditTrailFilter,
): OperationHistoryEntry[] {
  return history.filter((entry) => {
    // Date range
    if (filter.dateFrom && entry.timestamp < filter.dateFrom) return false;
    if (filter.dateTo && entry.timestamp > filter.dateTo) return false;

    // User
    if (filter.userId && entry.user_id !== filter.userId) return false;

    // Operation
    if (filter.operationName && entry.operation_name !== filter.operationName) return false;

    // Element
    if (filter.elementRef && entry.element_ref !== filter.elementRef) return false;

    // Search text in note (case-insensitive)
    if (filter.searchText) {
      const haystack = (entry.note ?? '').toLowerCase();
      const needle = filter.searchText.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}

export interface AuditTrailGroupedByDate {
  date: string;
  entries: OperationHistoryEntry[];
}

export function groupAuditByDate(
  history: readonly OperationHistoryEntry[],
): AuditTrailGroupedByDate[] {
  const groups = new Map<string, OperationHistoryEntry[]>();
  for (const entry of history) {
    const date = entry.timestamp.slice(0, 10);
    if (!groups.has(date)) {
      groups.set(date, []);
    }
    groups.get(date)!.push(entry);
  }
  return Array.from(groups.entries())
    .map(([date, entries]) => ({ date, entries }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function listUniqueUsers(history: readonly OperationHistoryEntry[]): string[] {
  const users = new Set<string>();
  for (const entry of history) {
    if (entry.user_id) users.add(entry.user_id);
  }
  return Array.from(users).sort();
}

export function listUniqueOperations(history: readonly OperationHistoryEntry[]): string[] {
  const ops = new Set<string>();
  for (const entry of history) {
    ops.add(entry.operation_name);
  }
  return Array.from(ops).sort();
}

export function describeFilter(filter: AuditTrailFilter): string {
  const parts: string[] = [];
  if (filter.dateFrom) parts.push(`od ${filter.dateFrom}`);
  if (filter.dateTo) parts.push(`do ${filter.dateTo}`);
  if (filter.userId) parts.push(`użytkownik: ${filter.userId}`);
  if (filter.operationName) parts.push(`operacja: ${filter.operationName}`);
  if (filter.elementRef) parts.push(`element: ${filter.elementRef}`);
  if (filter.searchText) parts.push(`szukaj: "${filter.searchText}"`);
  return parts.length > 0 ? parts.join(', ') : 'wszystkie';
}
