/**
 * IncompleteStationsReview — tabela stacji z oceną kompletności.
 *
 * Kolumny: Nazwa | Typ | Transformatory | Pola SN | Pola nN | Kontrola.
 * Filtr na stacje z brakującymi elementami.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useMemo } from 'react';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { formatStationTypeLabelPl } from '../../shared/stationTypeLabels';
import { useSelectionStore } from '../../selection';

// =============================================================================
// Helpers
// =============================================================================

interface StationRow {
  id: string;
  name: string;
  stationType: string;
  transformerCount: number;
  snBayCount: number;
  nnBusCount: number;
  blockerCount: number;
  isComplete: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function IncompleteStationsReview() {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const readiness = useSnapshotStore((s) => s.readiness);
  const selectElement = useSelectionStore((s) => s.selectElement);

  const rows = useMemo((): StationRow[] => {
    if (!snapshot) return [];
    return (snapshot.substations ?? []).map((station) => {
      const trCount = (snapshot.transformers ?? []).filter((t) =>
        station.transformer_refs?.includes(t.ref_id),
      ).length;
      const bayCount = (snapshot.bays ?? []).filter(
        (b) => b.substation_ref === station.id,
      ).length;
      const nnCount = (snapshot.buses ?? []).filter(
        (b) => station.bus_refs?.includes(b.ref_id) && b.voltage_kv < 1,
      ).length;
      const blockerCount = (readiness?.blockers ?? []).filter(
        (b) => b.element_ref === station.id,
      ).length;

      return {
        id: station.id,
        name: station.name,
        stationType: formatStationTypeLabelPl(station.station_type),
        transformerCount: trCount,
        snBayCount: bayCount,
        nnBusCount: nnCount,
        blockerCount,
        isComplete: trCount > 0 && bayCount > 0 && blockerCount === 0,
      };
    }).sort((a, b) => {
      // Incomplete first
      if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
      return a.name.localeCompare(b.name, 'pl');
    });
  }, [snapshot, readiness]);

  const handleNavigate = useCallback(
    (stationId: string) => {
      selectElement({ id: stationId, type: 'Station', name: stationId });
      window.dispatchEvent(
        new CustomEvent('sld:center-on-element', { detail: { elementId: stationId } }),
      );
    },
    [selectElement],
  );

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-500">Brak stacji</p>
          <p className="text-xs text-gray-400 mt-1">
            Dodaj stacje SN/nN do sieci
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto" data-testid="incomplete-stations-review">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <th className="px-3 py-2 font-medium text-gray-600">Nazwa</th>
            <th className="px-3 py-2 font-medium text-gray-600">Typ</th>
            <th className="px-3 py-2 font-medium text-gray-600 text-center">Transformatory</th>
            <th className="px-3 py-2 font-medium text-gray-600 text-center">Pola SN</th>
            <th className="px-3 py-2 font-medium text-gray-600 text-center">Szyny nN</th>
            <th className="px-3 py-2 font-medium text-gray-600 text-center">Zagadnienia</th>
            <th className="px-3 py-2 font-medium text-gray-600">Kontrola</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-gray-100 hover:bg-blue-50/50 cursor-pointer"
              onClick={() => handleNavigate(r.id)}
            >
              <td className="px-3 py-1.5 font-medium text-gray-800">{r.name}</td>
              <td className="px-3 py-1.5 text-gray-600">{r.stationType}</td>
              <td className="px-3 py-1.5 text-center">
                <span className={r.transformerCount === 0 ? 'text-red-600 font-medium' : 'text-gray-700'}>
                  {r.transformerCount}
                </span>
              </td>
              <td className="px-3 py-1.5 text-center">
                <span className={r.snBayCount === 0 ? 'text-red-600 font-medium' : 'text-gray-700'}>
                  {r.snBayCount}
                </span>
              </td>
              <td className="px-3 py-1.5 text-center text-gray-700">{r.nnBusCount}</td>
              <td className="px-3 py-1.5 text-center">
                {r.blockerCount > 0 ? (
                  <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[9px] font-medium">
                    {r.blockerCount}
                  </span>
                ) : (
                  <span className="text-gray-400">0</span>
                )}
              </td>
              <td className="px-3 py-1.5">
                {r.isComplete ? (
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Kompletna" />
                ) : (
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500" title="Niekompletna" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
