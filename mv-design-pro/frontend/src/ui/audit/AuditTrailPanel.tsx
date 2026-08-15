/**
 * AuditTrailPanel — panel historii operacji domenowych dla wniosku OSD.
 *
 * Wyświetla timeline operacji z snapshotStore.operationHistory:
 *  - kto (user - placeholder w v1, do dodania gdy backend wystawi user_id)
 *  - kiedy (timestamp ISO 8601)
 *  - co (operation name + label PL)
 *  - gdzie (element_ref + element_name)
 *  - status (success / error / pending)
 *
 * Wymagany dla operatora OSD (PSE/Energa/Tauron/Enea/PGE) jako załącznik
 * "Historia zmian projektu" do wniosku przyłączeniowego.
 *
 * BINDING: 100% PL etykiety.
 */

import { useMemo, useState } from 'react';
import { useSnapshotStore, type SnapshotOperationHistoryEntry } from '../topology/snapshotStore';

type StatusFilter = 'all' | 'success' | 'error' | 'pending';

const OPERATION_LABELS_PL: Record<string, string> = {
  add_grid_source_sn: 'Dodanie GPZ',
  add_sn_bay: 'Dodanie pola SN',
  continue_trunk_segment_sn: 'Kontynuacja ciągu SN',
  start_branch_segment_sn: 'Start odgałęzienia',
  insert_station_on_segment_sn: 'Wstawienie stacji',
  insert_branch_pole_on_segment_sn: 'Wstawienie słupa',
  insert_zksn_on_segment_sn: 'Wstawienie ZKSN',
  insert_section_switch_sn: 'Wstawienie sprzęgła',
  set_normal_open_point: 'Ustawienie punktu rozłączenia',
  add_transformer_sn_nn: 'Dodanie transformatora',
  assign_catalog_to_element: 'Przypisanie typu katalogowego',
  update_element_parameters: 'Aktualizacja parametrów',
  add_converter_source: 'Dodanie źródła OZE',
  add_genset_nn: 'Dodanie agregatu',
  add_ups_nn: 'Dodanie UPS',
  add_nn_load: 'Dodanie odbioru nN',
  add_ct: 'Dodanie przekładnika CT',
  add_vt: 'Dodanie przekładnika VT',
  add_relay: 'Dodanie zabezpieczenia',
  delete_element: 'Usunięcie elementu',
  refresh_snapshot: 'Odświeżenie snapshotu',
};

function operationLabel(entry: SnapshotOperationHistoryEntry): string {
  return entry.operationLabel ?? OPERATION_LABELS_PL[entry.operation] ?? entry.operation;
}

function formatTimestamp(iso: string): string {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: SnapshotOperationHistoryEntry['status'] }) {
  if (status === 'success') {
    return (
      <span className="rounded bg-sygnal-ok-tlo px-1.5 py-0.5 text-[10px] font-semibold text-sygnal-ok-tusz">
        OK
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="rounded bg-sygnal-blokada-tlo px-1.5 py-0.5 text-[10px] font-semibold text-sygnal-blokada-tusz">
        Błąd
      </span>
    );
  }
  return (
    <span className="rounded bg-sygnal-uwaga-tlo px-1.5 py-0.5 text-[10px] font-semibold text-sygnal-uwaga-tusz">
      W toku
    </span>
  );
}

interface AuditTrailPanelProps {
  /** Opcjonalne filtrowanie po elementId (per-element history). */
  elementRef?: string;
  /** Maks liczba wpisów do pokazania (przed paginacją). Default 100. */
  maxEntries?: number;
  /** Callback gdy user klika "Pokaż element" w wpisie. */
  onSelectElement?: (ref: string) => void;
}

export function AuditTrailPanel({
  elementRef,
  maxEntries = 100,
  onSelectElement,
}: AuditTrailPanelProps): JSX.Element {
  const history = useSnapshotStore((s) => s.operationHistory);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEntries = useMemo(() => {
    let entries = history;
    if (elementRef) {
      entries = entries.filter(
        (e) =>
          e.elementRef === elementRef ||
          e.createdElementIds?.includes(elementRef) ||
          e.updatedElementIds?.includes(elementRef) ||
          e.deletedElementIds?.includes(elementRef),
      );
    }
    if (statusFilter !== 'all') {
      entries = entries.filter((e) => e.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      entries = entries.filter(
        (e) =>
          operationLabel(e).toLowerCase().includes(q) ||
          e.elementName?.toLowerCase().includes(q) ||
          e.operation.toLowerCase().includes(q),
      );
    }
    return entries.slice(0, maxEntries);
  }, [history, elementRef, statusFilter, searchQuery, maxEntries]);

  return (
    <div
      className="flex h-full flex-col rounded border border-scada-border bg-scada-panel text-scada-text"
      data-testid="audit-trail-panel"
    >
      <header className="flex items-center justify-between gap-2 border-b border-scada-border px-3 py-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-scada-muted">
            Historia zmian projektu
          </div>
          <div className="text-sm font-semibold">
            {elementRef
              ? `Operacje dla elementu (${filteredEntries.length})`
              : `Wszystkie operacje (${history.length})`}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded border border-scada-border bg-scada-bg px-1.5 py-1 text-[11px]"
            data-testid="audit-trail-status-filter"
            aria-label="Filtr statusu operacji"
          >
            <option value="all">Wszystkie</option>
            <option value="success">Udane</option>
            <option value="error">Błędy</option>
            <option value="pending">W toku</option>
          </select>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Szukaj operacji lub elementu"
            className="rounded border border-scada-border bg-scada-bg px-2 py-1 text-[11px] w-[180px]"
            data-testid="audit-trail-search"
            aria-label="Wyszukaj w historii"
          />
        </div>
      </header>

      {filteredEntries.length === 0 ? (
        <div
          className="flex flex-1 items-center justify-center p-6 text-center text-sm text-scada-muted"
          data-testid="audit-trail-empty"
        >
          {history.length === 0
            ? 'Historia jest pusta. Każda operacja domenowa (dodanie GPZ, pola, stacji...) trafia tu automatycznie.'
            : 'Brak wyników dla wybranych filtrów.'}
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-scada-border">
          {filteredEntries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-1 px-3 py-2 hover:bg-scada-hover-nav"
              data-testid={`audit-trail-entry-${entry.id}`}
              data-status={entry.status}
            >
              <div className="flex items-center gap-2">
                <StatusBadge status={entry.status} />
                <span className="text-[11px] font-semibold">{operationLabel(entry)}</span>
                <span className="ml-auto text-[10px] text-scada-muted">
                  {formatTimestamp(entry.timestamp)}
                </span>
              </div>
              {entry.elementName && (
                <div className="text-[11px] text-scada-muted">
                  Element: <span className="text-scada-text">{entry.elementName}</span>
                </div>
              )}
              {!elementRef && entry.elementRef && onSelectElement && (
                <button
                  type="button"
                  onClick={() => onSelectElement(entry.elementRef!)}
                  className="text-[10px] text-blue-400 hover:underline self-start"
                  data-testid={`audit-trail-show-element-${entry.id}`}
                >
                  Pokaż element na SLD
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <footer className="border-t border-scada-border px-3 py-2 text-[10px] text-scada-muted">
        Lista chronologiczna. Eksport do raportu OSD dostępny przez "Wniosek przyłączeniowy → załączniki".
      </footer>
    </div>
  );
}
