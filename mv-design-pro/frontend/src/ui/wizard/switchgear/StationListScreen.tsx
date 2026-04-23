/**
 * StationListScreen (Screen A) — Lista stacji z podsumowaniem gotowości.
 *
 * RUN #3G §1.1.A: Tabela stacji z kolumnami gotowości pól, katalogów i powiązań.
 *
 * BINDING: Polish labels, no codenames, no guessing.
 */

import { useCallback } from 'react';
import { useSwitchgearStore, useStationList } from './useSwitchgearStore';
import type { StationListRowV1, ReadinessStatus } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readinessLabel(status: ReadinessStatus): string {
  switch (status) {
    case 'OK':
      return 'OK';
    case 'NIE':
      return 'Brak';
    case 'CZESCIOWO':
      return 'Częściowo';
  }
}

function readinessClass(status: ReadinessStatus): string {
  switch (status) {
    case 'OK':
      return 'switchgear-readiness--ok';
    case 'NIE':
      return 'switchgear-readiness--nie';
    case 'CZESCIOWO':
      return 'switchgear-readiness--partial';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StationListScreen(): JSX.Element {
  const stations = useStationList();
  const navigateToStationEdit = useSwitchgearStore((s) => s.navigateToStationEdit);

  const handleRowClick = useCallback(
    (stationId: string) => {
      navigateToStationEdit(stationId);
    },
    [navigateToStationEdit],
  );

  return (
    <div className="switchgear-station-list" data-testid="switchgear-station-list">
      <h2 className="switchgear-section-title">Rozdzielnica: pola i aparaty</h2>
      <p className="switchgear-section-desc">
        Lista stacji z podsumowaniem gotowości pól, katalogów aparatów i powiązań zabezpieczeń.
      </p>

      {stations.length === 0 ? (
        <div className="switchgear-empty" data-testid="switchgear-empty-stations">
          Brak stacji w modelu. Dodaj stację w kreatorze sieci (krok K3).
        </div>
      ) : (
        <table className="switchgear-table" data-testid="switchgear-station-table">
          <thead>
            <tr>
              <th>Nazwa stacji</th>
              <th>Typ stacji</th>
              <th>Pola SN</th>
              <th>Pola nN</th>
              <th>Gotowość pól</th>
              <th>Gotowość katalogów</th>
              <th>Gotowość powiązań</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((station: StationListRowV1) => (
              <tr
                key={station.stationId}
                className="switchgear-table-row"
                data-testid={`station-row-${station.stationId}`}
                onClick={() => handleRowClick(station.stationId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleRowClick(station.stationId);
                  }
                }}
              >
                <td className="switchgear-cell--name">{station.stationName}</td>
                <td>{station.stationType}</td>
                <td>{station.fieldCountSn}</td>
                <td>{station.fieldCountNn}</td>
                <td className={readinessClass(station.fieldReadiness)}>
                  {readinessLabel(station.fieldReadiness)}
                </td>
                <td className={readinessClass(station.catalogReadiness)}>
                  {readinessLabel(station.catalogReadiness)}
                </td>
                <td className={readinessClass(station.protectionReadiness)}>
                  {readinessLabel(station.protectionReadiness)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
