/**
 * StationConfiguratorSurface (E-13) — wrapper konfiguratora stacji SN/nN.
 *
 * Karta 7 "Źródła i magazyny" jest pomostem do E-21/E-22/E-23: czyta
 * `useStationDerStore` aby pokazać DERy przypięte do tej stacji oraz
 * wywołuje `openRouteSurface('E-21'/'E-22'/'E-23')` z stationContext.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStateStore } from '../../app-state';

import { StationConfigurator } from '../../network-build/station-configurator/StationConfigurator';
import {
  AddDerWizard,
  useStationDerStore,
  selectDersOfStation,
} from '../../network-build/station-der';
import type { AddDerKindRequest } from '../../network-build/station-configurator/cards/StationConfigDerSourcesCard';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { notify } from '../../notifications/store';
import type { WorkspaceSurfaceDescriptor } from '../types';

interface StationConfiguratorSurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

/**
 * Lokalne oznaczenia dla Pakietu H/G — dane konfiguracyjne stacji
 * trzymane w stanie Surface'u dopóki nie ma backendowej trwałości.
 * Po podłączeniu backendu: zmienić na pull-from-snapshot.
 */
interface StationLocalConfig {
  readonly mvNeutralGroundingRef: string | null;
}

const EMPTY_STATION_CONFIG: StationLocalConfig = {
  mvNeutralGroundingRef: null,
};

/** Minimalne propsy konfiguratora — używane gdy brak danych snapshot. */
function buildBaseStationProps(stationName: string, localConfig: StationLocalConfig) {
  return {
    basic: {
      stationName,
      topologicalType: 'końcowa' as const,
      constructionType: 'kontenerowa' as const,
      snVoltageKv: 15,
      nnVoltageLevels: [0.4],
      completeness: 'missing' as const,
      mvNeutralGroundingRef: localConfig.mvNeutralGroundingRef,
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
    // Karta 6 "Strona nN i poziomy napięć" zawiera rozdzielnice nN +
    // sekcję "Odbiory nN" — niezbędną dla Power Flow i VDROP.
    nnSwitchgear: { switchgears: [], loads: [] },
    protection: {
      relays: [],
      automation: [],
      interlocksConfigured: false,
      controlMode: 'lokalne' as const,
      // Pakiet G: typ uziemienia synchronizowany z karty 1 (basic).
      mvNeutralGroundingType: mapGroundingRefToType(localConfig.mvNeutralGroundingRef),
      deviceWithstandRows: [],
    },
    measurements: { cts: [], vts: [], metersCount: 0, telemetryCount: 0 },
    readiness: { items: [] },
  };
}

/** Mapowanie catalog_ref do typu uziemienia (dla ProtectionCard validation). */
function mapGroundingRefToType(
  ref: string | null,
): 'isolated' | 'petersen_coil' | 'resistor_grounded' | 'directly_grounded' | undefined {
  if (!ref) return undefined;
  if (ref === 'mng_isolated') return 'isolated';
  if (ref === 'mng_petersen') return 'petersen_coil';
  if (ref.startsWith('mng_resistor')) return 'resistor_grounded';
  if (ref === 'mng_directly') return 'directly_grounded';
  return undefined;
}

/** Mapowanie rodzaju DER → screenCode konfiguratora. */
const DER_KIND_TO_SCREEN: Record<AddDerKindRequest, 'E-21' | 'E-22' | 'E-23'> = {
  PV: 'E-21',
  BESS: 'E-22',
  FW: 'E-23',
};

export function StationConfiguratorSurface(props: StationConfiguratorSurfaceProps): JSX.Element {
  const { surface } = props;
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const stationRef = surface.entityRef ?? null;
  const ders = useStationDerStore((state) =>
    stationRef ? selectDersOfStation(state, stationRef) : [],
  );
  const detachDer = useStationDerStore((state) => state.detachDer);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const projectId = useAppStateStore((state) => state.activeProjectId);

  const [pendingDetach, setPendingDetach] = useState<{ derId: string; name: string } | null>(null);
  const [wizardKind, setWizardKind] = useState<AddDerKindRequest | null>(null);
  // Pakiet H: lokalna konfiguracja stacji (uziemienie neutralne).
  const [localConfig, setLocalConfig] = useState<StationLocalConfig>(EMPTY_STATION_CONFIG);

  // Nasłuch event'a wystawianego przez DerSourcesCard.
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ stationId: string; kind: AddDerKindRequest }>).detail;
      if (detail?.stationId === stationRef && detail.kind) {
        setWizardKind(detail.kind);
      }
    };
    window.addEventListener('mvdesignpro:add-der-request', listener);
    return () => window.removeEventListener('mvdesignpro:add-der-request', listener);
  }, [stationRef]);

  const stationName = useMemo(() => {
    if (!stationRef) return 'Stacja niewybrana';
    if (!snapshot) return stationRef;
    const station = (snapshot.substations ?? []).find(
      (s: { ref_id: string; name?: string }) => s.ref_id === stationRef,
    );
    return station?.name ?? stationRef;
  }, [stationRef, snapshot]);

  const handleOpenDer = useCallback(
    (derId: string, derKind: AddDerKindRequest) => {
      const screenCode = DER_KIND_TO_SCREEN[derKind];
      openRouteSurface(screenCode, {
        entityRef: derId,
        subjectKind: 'helper_context',
        payload: { stationId: stationRef ?? null },
      });
    },
    [openRouteSurface, stationRef],
  );

  const handleAddDer = useCallback(
    (kind: AddDerKindRequest) => {
      if (!stationRef) {
        notify('Wybierz stację, aby dodać źródło lub magazyn.', 'warning');
        return;
      }
      // Faza D doda kreator AddDerWizard (5-krokowy flow). Tutaj wystawiamy
      // event w window — controller modalu nasłuchuje.
      window.dispatchEvent(
        new CustomEvent('mvdesignpro:add-der-request', {
          detail: { stationId: stationRef, kind },
        }),
      );
    },
    [stationRef],
  );

  const handleShowOnSld = useCallback(
    (derId: string) => {
      // Naprawa hmi.1: przekazujemy derId jako entityRef do SLD aby skupić
      // kamerę na DER (selection). SldWorkspaceContainer odczytuje
      // routeState.payload.focusElementRef.
      openRouteSurface('E-01', {
        entityRef: derId,
        subjectKind: 'helper_context',
        payload: { focusElementRef: derId, stationId: stationRef ?? null },
      });
    },
    [openRouteSurface, stationRef],
  );

  const requestDetach = useCallback(
    (derId: string) => {
      const der = ders.find((d) => d.id === derId);
      if (!der) return;
      setPendingDetach({ derId, name: der.name });
    },
    [ders],
  );

  const confirmDetach = useCallback(() => {
    if (!pendingDetach) return;
    detachDer(pendingDetach.derId);
    notify(`Odłączono "${pendingDetach.name}" od stacji.`, 'info');
    setPendingDetach(null);
  }, [pendingDetach, detachDer]);

  const configuratorProps = useMemo(() => {
    const base = buildBaseStationProps(stationName, localConfig);
    return {
      ...base,
      basic: {
        ...base.basic,
        // Pakiet H: onChange dla uziemienia neutralnego propaguje do localConfig.
        onChange: (changes: { mvNeutralGroundingRef?: string | null }) => {
          if ('mvNeutralGroundingRef' in changes) {
            setLocalConfig((s) => ({
              ...s,
              mvNeutralGroundingRef: changes.mvNeutralGroundingRef ?? null,
            }));
          }
        },
      },
      derSources: {
        stationId: stationRef ?? 'unselected',
        ders,
        onOpenDer: handleOpenDer,
        onShowOnSld: handleShowOnSld,
        onAddDer: handleAddDer,
        onDetachDer: requestDetach,
      },
    };
  }, [stationName, stationRef, ders, handleOpenDer, handleShowOnSld, handleAddDer, requestDetach, localConfig]);

  return (
    <div data-testid="station-configurator-surface" className="flex h-full w-full flex-col p-4">
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
          E-13 · Konfigurator stacji SN/nN
        </div>
        <h2 className="mt-1 text-base font-semibold text-scada-text">{stationName}</h2>
        {!stationRef && (
          <p className="mt-2 rounded border border-amber-700 bg-amber-950/30 p-3 text-xs text-amber-200">
            Brak referencji do stacji w kontekście. Wybierz stację z lewego nawigatora
            modelu lub kliknij stację w SLD i wybierz "Otwórz konfigurator stacji".
          </p>
        )}
      </div>
      <div className="flex-1 overflow-auto rounded border border-scada-border bg-scada-panel">
        <StationConfigurator {...configuratorProps} defaultCard="der-sources" />
      </div>

      {/* AddDerWizard — 5-krokowy kreator dodawania DER. */}
      <AddDerWizard
        isOpen={wizardKind !== null}
        stationId={stationRef}
        stationName={stationName}
        derKind={wizardKind ?? 'PV'}
        projectId={projectId ?? 'no-project'}
        onClose={() => setWizardKind(null)}
      />

      {/* Confirm detach modal */}
      {pendingDetach && (
        <div
          data-testid="der-detach-confirm"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        >
          <div className="w-[420px] max-w-[90vw] rounded-lg border border-scada-border bg-scada-panel p-5 shadow-2xl">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-scada-muted">
              Operacja nieodwracalna
            </div>
            <h3 className="text-base font-semibold text-scada-text">
              Odłączyć "{pendingDetach.name}" od stacji?
            </h3>
            <p className="mt-2 text-sm text-scada-muted">
              Spowoduje to usunięcie obiektu DER z modelu sieci wraz z relacją
              station_der_connection. Konfiguracja katalogu i profili NC RfG
              zostanie utracona.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDetach(null)}
                className="rounded border border-scada-border px-3 py-1.5 text-sm text-scada-text hover:bg-scada-hover-nav"
                data-testid="der-detach-cancel"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={confirmDetach}
                className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
                data-testid="der-detach-ok"
              >
                Odłącz
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StationConfiguratorSurface;
