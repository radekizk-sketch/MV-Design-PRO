/**
 * AuditTrailExport — eksport historii operacji do CSV/JSON dla operatora OSD.
 *
 * Wynik trafia jako załącznik "Historia zmian projektu" do wniosku
 * przyłączeniowego. CSV pasuje do narzędzi PSE/Energa/Tauron/Enea/PGE.
 */

import type { SnapshotOperationHistoryEntry } from '../topology/snapshotStore';

const CSV_HEADERS = [
  'Data',
  'Operacja',
  'Element',
  'Identyfikator elementu',
  'Status',
  'Utworzone',
  'Zmodyfikowane',
  'Usunięte',
];

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatTimestampForCsv(iso: string): string {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  } catch {
    return iso;
  }
}

export function exportAuditTrailCsv(entries: readonly SnapshotOperationHistoryEntry[]): string {
  const rows = [CSV_HEADERS.join(',')];
  for (const e of entries) {
    rows.push(
      [
        escapeCsv(formatTimestampForCsv(e.timestamp)),
        escapeCsv(e.operationLabel ?? e.operation),
        escapeCsv(e.elementName ?? ''),
        escapeCsv(e.elementRef ?? ''),
        escapeCsv(e.status),
        escapeCsv((e.createdElementIds ?? []).join('; ')),
        escapeCsv((e.updatedElementIds ?? []).join('; ')),
        escapeCsv((e.deletedElementIds ?? []).join('; ')),
      ].join(','),
    );
  }
  return rows.join('\n');
}

export function exportAuditTrailJson(entries: readonly SnapshotOperationHistoryEntry[]): string {
  return JSON.stringify(
    entries.map((e) => ({
      timestamp: e.timestamp,
      operation: e.operation,
      operation_label_pl: e.operationLabel,
      element_ref: e.elementRef,
      element_name: e.elementName,
      status: e.status,
      created_elements: e.createdElementIds ?? [],
      updated_elements: e.updatedElementIds ?? [],
      deleted_elements: e.deletedElementIds ?? [],
    })),
    null,
    2,
  );
}

export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
