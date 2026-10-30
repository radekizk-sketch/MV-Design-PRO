/**
 * SwitchReview — Przegląd masowy łączników SN.
 *
 * Tabela łączników: typ, stan (OPEN/CLOSED), NOP, katalog.
 * Kliknięcie → nawigacja + podgląd w inspektorze.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useSelectionStore } from '../../selection';
import { RODZAJ_GALEZI_PL } from '../../sld/shared/kartaTechnicznaElementu';

// =============================================================================
// Helpers
// =============================================================================

function switchStateLabel(state: string | null | undefined): string {
  switch (state) {
    case 'OPEN':
    case 'open': return 'Otwarty';
    case 'CLOSED':
    case 'closed': return 'Zamknięty';
    default: return state ?? '—';
  }
}

// =============================================================================
// Component
// =============================================================================

export interface SwitchReviewProps {
  className?: string;
}

export function SwitchReview({ className }: SwitchReviewProps) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const selectElement = useSelectionStore((s) => s.selectElement);

  const rows = useMemo(() => {
    if (!snapshot) return [];

    // Łączniki: rodzaj gałęzi 'switch'|'breaker'|'bus_coupler'|'disconnector'|'fuse'; nazwa
    // rodzaju z jednego słownika gałęzi (wcześniej lokalny słownik po kodach wielkimi
    // literami nazywał odłącznik „Rozłącznik”, a łącznik i sprzęgło pokazywał kodem).
    const switchTypes = ['switch', 'breaker', 'bus_coupler', 'disconnector', 'fuse'] as const;
    return (snapshot.branches ?? [])
      .filter((b) =>
        (switchTypes as readonly string[]).includes(b.type),
      )
      .map((b) => ({
        id: b.ref_id,
        name: b.name,
        rodzaj: RODZAJ_GALEZI_PL[b.type],
        state: b.status ?? 'closed',
        isNOP: false,
        catalogRef: b.catalog_ref ?? null,
        fromBus: b.from_bus_ref,
        toBus: b.to_bus_ref,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  }, [snapshot]);

  const handleRowClick = useCallback(
    (row: (typeof rows)[0]) => {
      selectElement({ id: row.id, type: 'Switch', name: row.name });
      window.dispatchEvent(
        new CustomEvent('sld:center-on-element', { detail: { elementId: row.id } }),
      );
    },
    [selectElement],
  );

  const openCount = rows.filter((r) => r.state === 'open').length;
  const nopCount = rows.filter((r) => r.isNOP).length;

  return (
    <div className={clsx('flex flex-col h-full', className)} data-testid="switch-review">
      {/* Header */}
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-[11px] font-semibold text-gray-800">Łączniki SN</h4>
            <p className="text-[10px] text-gray-500">
              {rows.length} łączników — {openCount} otwartych — {nopCount} NOP
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[11px] text-gray-400">Brak łączników w modelu</p>
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 sticky top-0">
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">Nazwa</th>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">Typ</th>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">Stan</th>
                <th className="px-3 py-1.5 text-center font-medium text-gray-500">NOP</th>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">Katalog</th>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => handleRowClick(row)}
                  className="cursor-pointer border-b border-gray-50 hover:bg-blue-50 transition-colors"
                >
                  <td className="px-3 py-1.5 font-medium text-gray-800">{row.name}</td>
                  <td className="px-3 py-1.5 text-gray-500">{row.rodzaj}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                        row.state === 'open'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-green-100 text-green-700',
                      )}
                    >
                      <span
                        className={clsx(
                          'w-1.5 h-1.5 rounded-full',
                          row.state === 'open' ? 'bg-amber-500' : 'bg-green-500',
                        )}
                      />
                      {switchStateLabel(row.state)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {row.isNOP ? (
                      <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-medium">
                        NOP
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {row.catalogRef ? (
                      <span className="text-green-600">{row.catalogRef}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-gray-400 font-mono text-[10px]">{row.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
