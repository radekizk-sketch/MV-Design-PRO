/**
 * elementHistory — per-element audit trail (Etap 17 z planu).
 *
 * "Per-element history (right-click element → 'Pokaż historię tego elementu')"
 *
 * Filtruje OperationHistory entries dla konkretnego element_ref.
 * Konsumowane przez AuditTrailPanel + context menu actions.
 */

export interface OperationHistoryEntry {
  operation_name: string;
  element_ref: string | null;
  user_id: string | null;
  timestamp: string;
  parameters?: Record<string, unknown>;
  note?: string;
}

export interface ElementHistoryQuery {
  elementRef: string;
  history: readonly OperationHistoryEntry[];
  includeRelated?: boolean;
}

export function filterElementHistory({
  elementRef,
  history,
  includeRelated = false,
}: ElementHistoryQuery): OperationHistoryEntry[] {
  const directMatches = history.filter((entry) => entry.element_ref === elementRef);
  if (!includeRelated) {
    return directMatches;
  }
  const relatedMatches = history.filter(
    (entry) =>
      entry.element_ref !== elementRef
      && (entry.parameters?.['related_to'] === elementRef
        || entry.parameters?.['parent_ref'] === elementRef),
  );
  return [...directMatches, ...relatedMatches].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
}

export interface ElementHistorySummary {
  elementRef: string;
  totalOps: number;
  firstOp: OperationHistoryEntry | null;
  lastOp: OperationHistoryEntry | null;
  uniqueUsers: string[];
  uniqueOperations: string[];
}

export function summarizeElementHistory(
  elementRef: string,
  history: readonly OperationHistoryEntry[],
): ElementHistorySummary {
  const entries = filterElementHistory({ elementRef, history });
  const users = new Set<string>();
  const ops = new Set<string>();
  for (const entry of entries) {
    if (entry.user_id) users.add(entry.user_id);
    ops.add(entry.operation_name);
  }
  return {
    elementRef,
    totalOps: entries.length,
    firstOp: entries[0] ?? null,
    lastOp: entries[entries.length - 1] ?? null,
    uniqueUsers: Array.from(users).sort(),
    uniqueOperations: Array.from(ops).sort(),
  };
}
