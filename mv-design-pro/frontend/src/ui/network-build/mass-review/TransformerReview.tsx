/**
 * TransformerReview — Przegląd masowy transformatorów SN/nN.
 *
 * Tabela transformatorów z parametrami: Sn, Uk%, wektor, katalog, stacja, status.
 * Kliknięcie → nawigacja + podgląd w inspektorze.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { useSelectionStore } from '../../selection';
import { kontekstTransformatorowStacji, stationRefOfTransformer } from '../../shared/transformatoryStacji';

// =============================================================================
// Component
// =============================================================================

export interface TransformerReviewProps {
  className?: string;
}

export function TransformerReview({ className }: TransformerReviewProps) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const selectElement = useSelectionStore((s) => s.selectElement);

  const blockerRefs = useMemo(() => {
    const set = new Set<string>();
    for (const b of readiness?.blockers ?? []) {
      if (b.element_ref) set.add(b.element_ref);
    }
    return set;
  }, [readiness]);

  const rows = useMemo(() => {
    if (!snapshot) return [];
    // Kontekst jedynej reguły transformatorów stacji raz na migawkę (pętla po transformatorach).
    const kontekstTransformatorow = kontekstTransformatorowStacji(snapshot);

    return (snapshot.transformers ?? []).map((t) => {
      // SZYNY-STACJI-LUSTRO: stacja transformatora z JEDNEJ reguły „transformatory stacji”.
      const stationRef = stationRefOfTransformer(snapshot, t.ref_id, kontekstTransformatorow);
      const station = (snapshot.substations ?? []).find((s) => s.ref_id === stationRef);
      return {
        id: t.ref_id,
        name: t.name,
        snMva: t.sn_mva,
        ukPercent: t.uk_percent,
        vectorGroup: t.vector_group ?? '—',
        catalogRef: t.catalog_ref ?? null,
        stationName: station?.name ?? '—',
        stationId: station?.id ?? null,
        hasBlocker: blockerRefs.has(t.ref_id),
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  }, [snapshot, blockerRefs]);

  const handleRowClick = useCallback(
    (row: (typeof rows)[0]) => {
      selectElement({ id: row.id, type: 'TransformerBranch', name: row.name });
      window.dispatchEvent(
        new CustomEvent('sld:center-on-element', { detail: { elementId: row.id } }),
      );
    },
    [selectElement],
  );

  const handleAssignCatalog = useCallback(
    (id: string) => {
      openOperationForm('assign_catalog_to_element', {
        element_ref: id,
        element_type: 'transformer',
      });
    },
    [openOperationForm],
  );

  const withCatalog = rows.filter((r) => r.catalogRef).length;

  return (
    <div className={clsx('flex flex-col h-full', className)} data-testid="transformer-review">
      {/* Header */}
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-[11px] font-semibold text-gray-800">Transformatory SN/nN</h4>
            <p className="text-[10px] text-gray-500">
              {rows.length} transformatorów — {withCatalog} z katalogiem
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[11px] text-gray-400">Brak transformatorów w modelu</p>
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 sticky top-0">
                <th className="px-3 py-1.5 text-left font-medium text-gray-500 w-6" />
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">Nazwa</th>
                <th className="px-3 py-1.5 text-right font-medium text-gray-500">Sn [kVA]</th>
                <th className="px-3 py-1.5 text-right font-medium text-gray-500">uk [%]</th>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">Grupa</th>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">Stacja</th>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">Katalog</th>
                <th className="px-3 py-1.5 text-right font-medium text-gray-500">Akcja</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => handleRowClick(row)}
                  className={clsx(
                    'cursor-pointer border-b border-gray-50 transition-colors',
                    row.hasBlocker ? 'bg-red-50/30 hover:bg-red-50' : 'hover:bg-blue-50',
                  )}
                >
                  <td className="px-3 py-1.5">
                    <span
                      className={clsx(
                        'inline-block w-2 h-2 rounded-full',
                        row.hasBlocker ? 'bg-red-500' : row.catalogRef ? 'bg-green-500' : 'bg-amber-400',
                      )}
                    />
                  </td>
                  <td className="px-3 py-1.5 font-medium text-gray-800">{row.name}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{(row.snMva * 1000).toFixed(0)}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{row.ukPercent.toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-gray-500">{row.vectorGroup}</td>
                  <td className="px-3 py-1.5 text-gray-500">{row.stationName}</td>
                  <td className="px-3 py-1.5">
                    {row.catalogRef ? (
                      <span className="text-green-600">{row.catalogRef}</span>
                    ) : (
                      <span className="text-red-500 font-medium">Brak</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {!row.catalogRef && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAssignCatalog(row.id);
                        }}
                        className="px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Przypisz
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
