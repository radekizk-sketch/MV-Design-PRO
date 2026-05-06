/**
 * StationConfiguratorSurface (E-13) — wrapper konfiguratora stacji SN/nN.
 *
 * Etap 3 dostawy: udostępnia istniejący StationConfigurator (10 kart) jako
 * powierzchnię workspace. Adapter danych snapshot → propsy konfiguratora
 * jest minimalny — czyta podstawowe parametry stacji z ENM, dla pól nieobecnych
 * wyświetla "Brak danych" (formatPolishValue).
 */

import { useMemo } from 'react';

import { StationConfigurator } from '../../network-build/station-configurator/StationConfigurator';
import { useSnapshotStore } from '../../topology/snapshotStore';
import type { WorkspaceSurfaceDescriptor } from '../types';

interface StationConfiguratorSurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

/** Minimalne propsy konfiguratora — używane gdy brak danych snapshot. */
function buildEmptyStationProps(stationName: string) {
  return {
    basic: {
      stationName,
      topologicalType: 'końcowa' as const,
      constructionType: 'kontenerowa' as const,
      snVoltageKv: 15,
      nnVoltageLevels: [0.4],
      completeness: 'missing' as const,
    },
    topology: {
      externalPorts: [],
      errors: [],
      endToEndConnectionsCount: 0,
      missingEndpointsCount: 0,
    },
    snSwitchgear: {
      layout: 'sectioned_busbar' as const,
      nominalVoltageKv: 15,
      nominalCurrentA: 630,
      nominalShortCircuitKa: 16,
      sectionsCount: 1,
      hasCoupler: false,
      baysCount: 0,
      reservesCount: 0,
      readinessLabelPl: 'brak danych',
    },
    bays: { bays: [] },
    transformer: { transformers: [], availableLvVoltages: [0.4] },
    nnSwitchgear: { switchgears: [] },
    loads: { loads: [] },
    protection: {
      relays: [],
      automation: [],
      interlocksConfigured: false,
      controlMode: 'lokalne' as const,
    },
    measurements: { cts: [], vts: [], metersCount: 0, telemetryCount: 0 },
    readiness: { items: [] },
  };
}

export function StationConfiguratorSurface(props: StationConfiguratorSurfaceProps): JSX.Element {
  const { surface } = props;
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const stationRef = surface.entityRef ?? null;

  const stationName = useMemo(() => {
    if (!stationRef) return 'Stacja niewybrana';
    if (!snapshot) return stationRef;
    const station = (snapshot.substations ?? []).find(
      (s: { ref_id: string; name?: string }) => s.ref_id === stationRef,
    );
    return station?.name ?? stationRef;
  }, [stationRef, snapshot]);

  const configuratorProps = useMemo(
    () => buildEmptyStationProps(stationName),
    [stationName],
  );

  return (
    <div data-testid="station-configurator-surface" className="flex h-full w-full flex-col p-4">
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
          E-13 · Konfigurator stacji SN/nN
        </div>
        <h2 className="mt-1 text-base font-semibold text-scada-text">
          {stationName}
        </h2>
        {!stationRef && (
          <p className="mt-2 rounded border border-amber-700 bg-amber-950/30 p-3 text-xs text-amber-200">
            Brak referencji do stacji w kontekście. Wybierz stację z lewego nawigatora
            modelu lub kliknij stację w SLD i wybierz "Otwórz konfigurator stacji".
          </p>
        )}
      </div>
      <div className="flex-1 overflow-auto rounded border border-scada-border bg-scada-panel">
        <StationConfigurator {...configuratorProps} />
      </div>
    </div>
  );
}

export default StationConfiguratorSurface;
