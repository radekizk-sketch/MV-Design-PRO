/**
 * AuditTrailDiff — diff viewer dla operacji audytu (Etap 17 z planu).
 *
 * "Per-operation snapshot diff (przed/po) - link do ChangeAuditTrailPanel"
 *
 * Wyświetla side-by-side comparison parametrów operacji
 * (np. moc/typ/lokalizacja przed i po edycji).
 */

import type { OperationHistoryEntry } from './elementHistory';

export interface DiffEntry {
  key: string;
  label: string;
  before: unknown;
  after: unknown;
  changed: boolean;
}

interface AuditTrailDiffProps {
  beforeEntry: OperationHistoryEntry | null;
  afterEntry: OperationHistoryEntry;
  className?: string;
}

const FIELD_LABELS: Record<string, string> = {
  ratedPowerMva: 'Moc znamionowa [MVA]',
  voltageKv: 'Napięcie [kV]',
  ratedCurrentA: 'Prąd znamionowy [A]',
  primaryVoltageKv: 'Napięcie pierwotne [kV]',
  secondaryVoltageKv: 'Napięcie wtórne [kV]',
  cableLengthKm: 'Długość kabla [km]',
  crossSectionMm2: 'Przekrój [mm²]',
  manufacturerRef: 'Producent',
  catalogRef: 'Typ z katalogu',
  vectorGroup: 'Grupa wektorowa',
  bayKind: 'Rodzaj pola',
  protectionTypes: 'Funkcje zabezpieczeń',
  earthingType: 'Typ uziemienia',
  controlMode: 'Tryb regulacji',
};

export function computeDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
): DiffEntry[] {
  const allKeys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after),
  ]);
  const entries: DiffEntry[] = [];
  for (const key of allKeys) {
    const beforeVal = before?.[key];
    const afterVal = after[key];
    const changed = JSON.stringify(beforeVal) !== JSON.stringify(afterVal);
    entries.push({
      key,
      label: FIELD_LABELS[key] ?? key,
      before: beforeVal,
      after: afterVal,
      changed,
    });
  }
  return entries.sort((a, b) => {
    if (a.changed !== b.changed) return a.changed ? -1 : 1;
    return a.label.localeCompare(b.label, 'pl-PL');
  });
}

export function AuditTrailDiff({ beforeEntry, afterEntry, className }: AuditTrailDiffProps) {
  const diff = computeDiff(
    beforeEntry?.parameters as Record<string, unknown> | undefined,
    (afterEntry.parameters ?? {}) as Record<string, unknown>,
  );
  const changedCount = diff.filter((d) => d.changed).length;

  return (
    <div
      className={`flex flex-col gap-2 rounded border border-slate-200 bg-white p-3 ${className ?? ''}`}
      data-testid="audit-trail-diff"
    >
      <header className="flex items-center justify-between text-sm">
        <strong>
          Diff operacji: <code className="font-mono text-xs">{afterEntry.operation_name}</code>
        </strong>
        <span className="text-xs text-slate-500">
          {changedCount > 0 ? `${changedCount} zmiana(y)` : 'Brak zmian parametrów'}
        </span>
      </header>
      {diff.length === 0 ? (
        <p className="text-xs italic text-slate-500">Operacja bez parametrów.</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-slate-600">
            <tr>
              <th className="text-left">Pole</th>
              <th className="text-left">Przed</th>
              <th className="text-left">Po</th>
            </tr>
          </thead>
          <tbody>
            {diff.map((entry) => (
              <tr
                key={entry.key}
                className={entry.changed ? 'bg-amber-50' : ''}
                data-testid={`diff-row-${entry.key}`}
              >
                <td className="py-1 pr-2 font-medium text-slate-700">{entry.label}</td>
                <td className="py-1 pr-2 text-slate-600">
                  {formatValue(entry.before)}
                </td>
                <td className={`py-1 pr-2 ${entry.changed ? 'font-semibold text-amber-900' : 'text-slate-600'}`}>
                  {formatValue(entry.after)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return value.toLocaleString('pl-PL', { maximumFractionDigits: 3 });
  if (typeof value === 'boolean') return value ? 'tak' : 'nie';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
