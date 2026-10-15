/**
 * MissingCatalogReview — Przegląd masowy: elementy bez katalogu.
 *
 * Tabela elementów ENM bez przypisanego typu katalogowego.
 * Kliknięcie wiersza → nawigacja do elementu + otwarcie formularza assign_catalog.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { useSelectionStore } from '../../selection';

// =============================================================================
// Types
// =============================================================================

interface MissingCatalogRow {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  severity: 'error' | 'warning';
}

// =============================================================================
// Component
// =============================================================================

export interface MissingCatalogReviewProps {
  className?: string;
}

export function MissingCatalogReview({ className }: MissingCatalogReviewProps) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const selectElement = useSelectionStore((s) => s.selectElement);

  const rows = useMemo((): MissingCatalogRow[] => {
    if (!snapshot) return [];
    const result: MissingCatalogRow[] = [];

    // Branches bez katalogu (only lines/cables have catalog_ref)
    for (const b of snapshot.branches ?? []) {
      if ((b.type === 'line_overhead' || b.type === 'cable') && !b.catalog_ref) {
        result.push({
          id: b.ref_id,
          name: b.name,
          category: 'branch',
          categoryLabel: b.type === 'line_overhead' ? 'Linia napowietrzna' : 'Kabel',
          severity: 'error',
        });
      }
    }

    // Transformatory bez katalogu
    for (const t of snapshot.transformers ?? []) {
      if (!t.catalog_ref) {
        result.push({
          id: t.ref_id,
          name: t.name,
          category: 'transformer',
          categoryLabel: 'Transformator',
          severity: 'error',
        });
      }
    }

    // Generatory bez katalogu
    for (const g of snapshot.generators ?? []) {
      if (!g.catalog_ref) {
        result.push({
          id: g.ref_id,
          name: g.name,
          category: 'generator',
          categoryLabel: g.gen_type === 'pv_inverter' ? 'Falownik PV'
            : g.gen_type === 'bess' ? 'Falownik BESS'
            : g.gen_type === 'wind_inverter' ? 'Inwerter wiatrowy'
            : 'Generator',
          severity: 'error',
        });
      }
    }

    // Loads bez katalogu
    for (const l of snapshot.loads ?? []) {
      if (!l.catalog_ref) {
        result.push({
          id: l.ref_id,
          name: l.name,
          category: 'load',
          categoryLabel: 'Obciążenie',
          severity: 'warning',
        });
      }
    }

    return result.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
      return a.name.localeCompare(b.name, 'pl');
    });
  }, [snapshot]);

  const handleRowClick = useCallback(
    (row: MissingCatalogRow) => {
      selectElement({
        id: row.id,
        type: row.category === 'branch' ? 'LineBranch'
          : row.category === 'transformer' ? 'TransformerBranch'
          : row.category === 'generator' ? 'Generator'
          : row.category === 'source' ? 'Source'
          : 'Load',
        name: row.name,
      });
      window.dispatchEvent(
        new CustomEvent('sld:center-on-element', { detail: { elementId: row.id } }),
      );
    },
    [selectElement],
  );

  const handleAssignCatalog = useCallback(
    (row: MissingCatalogRow) => {
      openOperationForm('assign_catalog_to_element', {
        element_ref: row.id,
        element_type: row.category,
      });
    },
    [openOperationForm],
  );

  const errorCount = rows.filter((r) => r.severity === 'error').length;
  const warningCount = rows.filter((r) => r.severity === 'warning').length;

  return (
    <div className={clsx('flex flex-col h-full', className)} data-testid="missing-catalog-review">
      {/* Header */}
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-[11px] font-semibold text-gray-800">Brakujące katalogi</h4>
            <p className="text-[10px] text-gray-500">
              Elementy bez przypisanego typu katalogowego
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            {errorCount > 0 && (
              <span className="px-1.5 py-0.5 bg-sygnal-blokada-tlo text-sygnal-blokada-tusz rounded font-medium">
                {errorCount} krytycznych
              </span>
            )}
            {warningCount > 0 && (
              <span className="px-1.5 py-0.5 bg-sygnal-uwaga-tlo text-sygnal-uwaga-tusz rounded font-medium">
                {warningCount} ostrzeżeń
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <svg className="w-8 h-8 mx-auto text-sygnal-ok mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[11px] text-gray-500">Wszystkie elementy mają przypisane katalogi</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 sticky top-0">
                <th className="px-3 py-1.5 text-left font-medium text-gray-500 w-6" />
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">Nazwa</th>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">Kategoria</th>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">ID</th>
                <th className="px-3 py-1.5 text-right font-medium text-gray-500">Akcja</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => handleRowClick(row)}
                  className="cursor-pointer border-b border-gray-50 hover:bg-sygnal-info-tlo transition-colors"
                >
                  <td className="px-3 py-1.5">
                    <span
                      className={clsx(
                        'inline-block w-2 h-2 rounded-full',
                        row.severity === 'error' ? 'bg-sygnal-blokada' : 'bg-sygnal-uwaga',
                      )}
                    />
                  </td>
                  <td className="px-3 py-1.5 font-medium text-gray-800">{row.name}</td>
                  <td className="px-3 py-1.5 text-gray-500">{row.categoryLabel}</td>
                  <td className="px-3 py-1.5 text-gray-400 font-mono text-[10px]">{row.id}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAssignCatalog(row);
                      }}
                      className="px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Przypisz
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      {rows.length > 0 && (
        <div className="px-4 py-1.5 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-400">
          {rows.length} elementów bez katalogu — kliknij wiersz aby zlokalizować na schemacie
        </div>
      )}
    </div>
  );
}
