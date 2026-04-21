/**
 * OzeReview — Przegląd masowy źródeł OZE i BESS.
 *
 * Tabela generatorów: typ (PV/BESS/wiatr/sync), moc, wariant przyłączenia,
 * transformator blokowy, katalog.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { useSelectionStore } from '../../selection';
import { formatGeneratorTypeShortLabelPl } from '../../shared/generatorTypeLabels';

// =============================================================================
// Helpers
// =============================================================================

function connectionLabel(variant: string | null | undefined): string {
  switch (variant) {
    case 'nn_side': return 'Strona nN';
    case 'block_transformer': return 'Trafo blokowy';
    default: return '—';
  }
}

// =============================================================================
// Component
// =============================================================================

export interface OzeReviewProps {
  className?: string;
}

export function OzeReview({ className }: OzeReviewProps) {
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

    return (snapshot.generators ?? [])
      .map((g) => {
        const station = g.station_ref
          ? (snapshot.substations ?? []).find((s) => s.id === g.station_ref)
          : null;

        return {
          id: g.ref_id,
          name: g.name,
          genType: g.gen_type ?? 'unknown',
          pMw: g.p_mw,
          qMvar: g.q_mvar,
          connectionVariant: g.connection_variant ?? null,
          stationName: station?.name ?? '—',
          catalogRef: g.catalog_ref ?? null,
          hasBlocker: blockerRefs.has(g.ref_id),
          hasBlockingTr: g.blocking_transformer_ref != null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  }, [snapshot, blockerRefs]);

  const handleRowClick = useCallback(
    (row: (typeof rows)[0]) => {
      selectElement({ id: row.id, type: 'Generator', name: row.name });
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
        element_type: 'generator',
      });
    },
    [openOperationForm],
  );

  const totalPower = rows.reduce((acc, r) => acc + r.pMw, 0);
  const pvCount = rows.filter((r) => r.genType === 'pv_inverter').length;
  const bessCount = rows.filter((r) => r.genType === 'bess').length;

  return (
    <div className={clsx('flex flex-col h-full', className)} data-testid="oze-review">
      {/* Header */}
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-[11px] font-semibold text-gray-800">Źródła OZE / BESS</h4>
            <p className="text-[10px] text-gray-500">
              {rows.length} generatorów ({pvCount} PV, {bessCount} BESS) — sumaryczna moc: {(totalPower * 1000).toFixed(0)} kW
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[11px] text-gray-400">Brak źródeł OZE/BESS w modelu</p>
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 sticky top-0">
                <th className="px-3 py-1.5 text-left font-medium text-gray-500 w-6" />
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">Nazwa</th>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">Typ</th>
                <th className="px-3 py-1.5 text-right font-medium text-gray-500">P [kW]</th>
                <th className="px-3 py-1.5 text-right font-medium text-gray-500">Q [kvar]</th>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">Przyłączenie</th>
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
                  <td className="px-3 py-1.5">
                    <span
                      className={clsx(
                        'px-1.5 py-0.5 rounded text-[10px] font-medium',
                        row.genType === 'pv_inverter' ? 'bg-yellow-100 text-yellow-700'
                          : row.genType === 'bess' ? 'bg-emerald-100 text-emerald-700'
                          : row.genType === 'wind_inverter' ? 'bg-sky-100 text-sky-700'
                          : 'bg-gray-100 text-gray-600',
                      )}
                    >
                  {formatGeneratorTypeShortLabelPl(row.genType)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-gray-600">
                    {(row.pMw * 1000).toFixed(1)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-gray-600">
                    {row.qMvar != null ? (row.qMvar * 1000).toFixed(1) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500">
                    {connectionLabel(row.connectionVariant)}
                    {row.hasBlockingTr && (
                      <span className="ml-1 text-[10px] text-blue-500">+ trafo</span>
                    )}
                  </td>
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

      {/* Footer summary */}
      {rows.length > 0 && (
        <div className="px-4 py-1.5 border-t border-gray-100 bg-gray-50 flex items-center gap-4 text-[10px] text-gray-400">
          <span>Suma P: {(totalPower * 1000).toFixed(0)} kW</span>
          <span>{pvCount} PV</span>
          <span>{bessCount} BESS</span>
          <span>{rows.filter((r) => !r.catalogRef).length} bez katalogu</span>
        </div>
      )}
    </div>
  );
}
