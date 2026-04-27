/**
 * ChangeAuditTrailPanel — historia zmian elementów ENM (Pakiet H).
 *
 * Filtracja: data, user, element_id, akcja.
 * White box: pure data view; mutacje przez snapshotStore (poza scope panelu).
 */

import { useCallback, useMemo, useState } from 'react';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'link_catalog'
  | 'unlink_catalog'
  | 'set_earthing'
  | 'set_profile';

export const AUDIT_ACTION_LABELS_PL: Readonly<Record<AuditAction, string>> = Object.freeze({
  create: 'Utworzenie',
  update: 'Edycja',
  delete: 'Usunięcie',
  link_catalog: 'Powiązanie z katalogiem',
  unlink_catalog: 'Odłączenie od katalogu',
  set_earthing: 'Konfiguracja uziemienia',
  set_profile: 'Ustawienie profilu',
});

export interface AuditEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  user: string;
  /** Element ENM którego dotyczy zmiana */
  element_id: string;
  element_type: string;
  action: AuditAction;
  /** Krótki opis zmiany (PL) */
  description_pl: string;
}

export interface AuditFilter {
  from_date?: string;
  to_date?: string;
  user?: string;
  element_id?: string;
  action?: AuditAction;
}

export function filterAudit(
  entries: ReadonlyArray<AuditEntry>,
  filter: AuditFilter,
): AuditEntry[] {
  return entries.filter((e) => {
    if (filter.from_date && e.timestamp < filter.from_date) return false;
    if (filter.to_date && e.timestamp > filter.to_date) return false;
    if (filter.user && !e.user.toLowerCase().includes(filter.user.toLowerCase())) return false;
    if (
      filter.element_id &&
      !e.element_id.toLowerCase().includes(filter.element_id.toLowerCase())
    )
      return false;
    if (filter.action && e.action !== filter.action) return false;
    return true;
  });
}

/**
 * Sort DESC po timestamp (najnowsze najpierw), tie-break po element_id ASC.
 */
export function sortAuditDesc(entries: ReadonlyArray<AuditEntry>): AuditEntry[] {
  return [...entries].sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return b.timestamp.localeCompare(a.timestamp);
    }
    return a.element_id.localeCompare(b.element_id);
  });
}

export interface ChangeAuditTrailPanelProps {
  entries: ReadonlyArray<AuditEntry>;
}

export function ChangeAuditTrailPanel({ entries }: ChangeAuditTrailPanelProps) {
  const [filter, setFilter] = useState<AuditFilter>({});

  const filteredAndSorted = useMemo(
    () => sortAuditDesc(filterAudit(entries, filter)),
    [entries, filter],
  );

  const updateFilter = useCallback(
    <K extends keyof AuditFilter>(key: K, value: AuditFilter[K]) => {
      setFilter((prev) => {
        const next = { ...prev };
        if (value === '' || value === undefined || value === null) {
          delete next[key];
        } else {
          next[key] = value;
        }
        return next;
      });
    },
    [],
  );

  const actions: AuditAction[] = Object.keys(AUDIT_ACTION_LABELS_PL) as AuditAction[];

  return (
    <div
      data-testid="change-audit-trail-panel"
      className="flex flex-col gap-3 p-3 bg-scada-surface text-scada-text border border-scada-border"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Historia zmian (ślad audytu)</h3>
        <span className="text-xs text-scada-muted" data-testid="audit-count">
          {filteredAndSorted.length} / {entries.length} wpisów
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs" data-testid="audit-filters">
        <label className="flex items-center gap-1">
          Od:
          <input
            type="date"
            value={filter.from_date ?? ''}
            onChange={(e) => updateFilter('from_date', e.target.value || undefined)}
            className="bg-scada-bg border border-scada-border px-1"
            data-testid="audit-filter-from"
          />
        </label>
        <label className="flex items-center gap-1">
          Do:
          <input
            type="date"
            value={filter.to_date ?? ''}
            onChange={(e) => updateFilter('to_date', e.target.value || undefined)}
            className="bg-scada-bg border border-scada-border px-1"
            data-testid="audit-filter-to"
          />
        </label>
        <label className="flex items-center gap-1">
          Użytkownik:
          <input
            type="text"
            value={filter.user ?? ''}
            onChange={(e) => updateFilter('user', e.target.value || undefined)}
            className="bg-scada-bg border border-scada-border px-1 w-32"
            data-testid="audit-filter-user"
          />
        </label>
        <label className="flex items-center gap-1">
          Element:
          <input
            type="text"
            value={filter.element_id ?? ''}
            onChange={(e) => updateFilter('element_id', e.target.value || undefined)}
            className="bg-scada-bg border border-scada-border px-1 w-32"
            data-testid="audit-filter-element"
          />
        </label>
        <label className="flex items-center gap-1">
          Akcja:
          <select
            value={filter.action ?? ''}
            onChange={(e) =>
              updateFilter('action', (e.target.value || undefined) as AuditAction | undefined)
            }
            className="bg-scada-bg border border-scada-border px-1"
            data-testid="audit-filter-action"
          >
            <option value="">Wszystkie</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABELS_PL[a]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filteredAndSorted.length === 0 ? (
        <p className="text-xs text-scada-muted" data-testid="audit-empty">
          Brak wpisów spełniających filtry.
        </p>
      ) : (
        <table className="w-full text-xs" data-testid="audit-table">
          <thead>
            <tr className="text-scada-muted">
              <th className="text-left">Data</th>
              <th className="text-left">Użytkownik</th>
              <th className="text-left">Element</th>
              <th className="text-left">Typ</th>
              <th className="text-left">Akcja</th>
              <th className="text-left">Opis</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((e, idx) => (
              <tr
                key={`${e.timestamp}-${e.element_id}-${idx}`}
                data-testid={`audit-row-${idx}`}
                className="border-t border-scada-border"
              >
                <td>{e.timestamp}</td>
                <td>{e.user}</td>
                <td>
                  <code>{e.element_id}</code>
                </td>
                <td>{e.element_type}</td>
                <td>{AUDIT_ACTION_LABELS_PL[e.action]}</td>
                <td>{e.description_pl}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
