/**
 * StationConfiguratorSurface (E-13) — wrapper konfiguratora stacji SN/nN.
 *
 * Karta 7 "Źródła i magazyny" jest pomostem do E-21/E-22/E-23: czyta
 * `useStationDerStore` aby pokazać DERy przypięte do tej stacji oraz
 * wywołuje `openRouteSurface('E-21'/'E-22'/'E-23')` z stationContext.
 *
 * Punkt 3 Phase 4: konfiguracja audytu 2 (mvNeutralGroundingRef etc.)
 * pull-from-backend przez `useStationAudit2Config` + UPSERT przez
 * `useUpdateStationAudit2Config` (React Query, optimistic updates).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStateStore } from '../../app-state';

import { StationConfigurator } from '../../network-build/station-configurator/StationConfigurator';
import type { StationConfigBayRow } from '../../network-build/station-configurator/cards/StationConfigBaysCard';
import type { ProtectionRow } from '../../network-build/station-configurator/cards/StationConfigProtectionCard';
import type { StationConfigTransformerRow } from '../../network-build/station-configurator/cards/StationConfigTransformerCard';
import {
  AddDerWizard,
  useStationAudit2Config,
  useStationDerStore,
  useUpdateStationAudit2Config,
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
 * Konfiguracja stacji audytu 2 — projekcja na potrzeby Surface.
 *
 * Punkt 3: dane plyną przez React Query z backendu (`station_audit2_configs`).
 * Optimistic updates przez `useUpdateStationAudit2Config`.
 */
interface StationLocalConfig {
  readonly mvNeutralGroundingRef: string | null;
}

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

  // Punkt 3 Phase 4: pull konfiguracji audytu 2 z backendu (React Query).
  const audit2Config = useStationAudit2Config(projectId, stationRef);
  const updateAudit2Config = useUpdateStationAudit2Config();
  const localConfig: StationLocalConfig = useMemo(
    () => ({
      mvNeutralGroundingRef: audit2Config.data?.mv_neutral_grounding_ref ?? null,
    }),
    [audit2Config.data?.mv_neutral_grounding_ref],
  );

  // Punkt 3 Phase 5: sync der_specs -> backend gdy DERs zmieniaja sie w lokalnym
  // Zustand store. Zustand pozostaje dla SLD rendering (kompatybilnosc z istniejacym
  // kodem); backend persystuje audit2-specific pola (BESS modes, block-trafo, P(f)).
  useEffect(() => {
    if (!projectId || !stationRef || !audit2Config.data) return;
    const targetDerSpecs = ders.map((d) => ({
      der_id: d.id,
      der_kind: d.der_kind,
      bess_operation_mode_refs: d.profiles.bess_operation_mode_refs ?? [],
      block_transformer_catalog_ref: d.catalogs.block_transformer_catalog_ref ?? null,
      pf_curve_ref: d.profiles.pf_curve_ref ?? null,
      // Phase 23: real device + nominal power (z catalogu, projekcja deterministic).
      device_catalog_ref: d.catalogs.device_catalog_ref ?? null,
      nominal_power_kw: d.nominal_power_kw,
    }));
    const currentDerSpecs = audit2Config.data.der_specs;
    // Compare by serialization — proste i deterministyczne.
    if (JSON.stringify(targetDerSpecs) === JSON.stringify(currentDerSpecs)) return;
    updateAudit2Config.mutate({
      projectId,
      stationId: stationRef,
      body: {
        mv_neutral_grounding_ref: audit2Config.data.mv_neutral_grounding_ref,
        tap_changer_refs: audit2Config.data.tap_changer_refs,
        der_specs: targetDerSpecs,
      },
    });
  }, [ders, projectId, stationRef, audit2Config.data]);

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

  // Phase 8: helper do mutacji audit2 config (centralizuje budowe body).
  const mutateAudit2 = useCallback(
    (patch: Partial<{
      mv_neutral_grounding_ref: string | null;
      tap_changer_refs: readonly string[];
      transformer_tap_changers: Record<string, string>;
      bay_hv_fuses: Record<string, string>;
      bay_vts: Record<string, string>;
    }>) => {
      if (!projectId || !stationRef) {
        notify('Najpierw wybierz aktywny projekt i stację.', 'warning');
        return;
      }
      const current = audit2Config.data;
      updateAudit2Config.mutate({
        projectId,
        stationId: stationRef,
        body: {
          mv_neutral_grounding_ref:
            patch.mv_neutral_grounding_ref !== undefined
              ? patch.mv_neutral_grounding_ref
              : current?.mv_neutral_grounding_ref ?? null,
          tap_changer_refs: [...(patch.tap_changer_refs ?? current?.tap_changer_refs ?? [])],
          der_specs: current?.der_specs ?? [],
          transformer_tap_changers: {
            ...(current?.transformer_tap_changers ?? {}),
            ...(patch.transformer_tap_changers ?? {}),
          },
          bay_hv_fuses: {
            ...(current?.bay_hv_fuses ?? {}),
            ...(patch.bay_hv_fuses ?? {}),
          },
          bay_vts: {
            ...(current?.bay_vts ?? {}),
            ...(patch.bay_vts ?? {}),
          },
          bay_device_withstand: current?.bay_device_withstand ?? {},
        },
      });
    },
    [projectId, stationRef, audit2Config.data, updateAudit2Config],
  );

  const configuratorProps = useMemo(() => {
    const base = buildBaseStationProps(stationName, localConfig);
    // Phase 8: projektuj per-transformer / per-bay refs z audit2Config do propsow.
    const transformerTapChangers = audit2Config.data?.transformer_tap_changers ?? {};
    const bayFuses = audit2Config.data?.bay_hv_fuses ?? {};
    const bayVts = audit2Config.data?.bay_vts ?? {};
    const bayWithstand = audit2Config.data?.bay_device_withstand ?? {};
    return {
      ...base,
      basic: {
        ...base.basic,
        onChange: (changes: { mvNeutralGroundingRef?: string | null }) => {
          if ('mvNeutralGroundingRef' in changes) {
            mutateAudit2({ mv_neutral_grounding_ref: changes.mvNeutralGroundingRef ?? null });
          }
        },
      },
      transformer: {
        ...base.transformer,
        // Phase 8: rzutuj tapChangerCatalogRef per row + onChange przekazuje
        // patch transformer_tap_changers do mutateAudit2.
        transformers: (base.transformer.transformers as readonly StationConfigTransformerRow[]).map((tr) => ({
          ...tr,
          tapChangerCatalogRef: transformerTapChangers[tr.transformerId] ?? null,
        })),
        onChange: (transformerId: string, changes: { tapChangerCatalogRef?: string | null }) => {
          if ('tapChangerCatalogRef' in changes) {
            mutateAudit2({
              transformer_tap_changers: {
                [transformerId]: changes.tapChangerCatalogRef ?? '',
              },
            });
          }
        },
      },
      bays: {
        ...base.bays,
        // Cast wymagany bo `base.bays.bays` w pustym stanie ma typ never[].
        // Mapowanie dziala poprawnie gdy snapshot dostarcza realne wpisy.
        bays: (base.bays.bays as readonly StationConfigBayRow[]).map((b) => ({
          ...b,
          hvFuseCatalogRef: bayFuses[b.bayId] ?? null,
        })),
        // Phase 18: HV fuse onChange propaguje do mutateAudit2.
        onChangeHvFuse: (bayId: string, fuseId: string | null) => {
          mutateAudit2({
            bay_hv_fuses: { [bayId]: fuseId ?? '' },
          });
        },
      },
      protection: {
        ...base.protection,
        // Phase 8: VT per-bay z audit2Config.bay_vts.
        relays: (base.protection.relays as readonly ProtectionRow[]).map((r) => ({
          ...r,
          vtCatalogRef: bayVts[r.bayDesignation] ?? null,
        })),
        // Phase 8: device withstand per-bay z audit2Config.
        deviceWithstandRows: Object.entries(bayWithstand).map(([bayDesignation, spec]) => ({
          bayDesignation,
          deviceCatalogRef: (spec as { device_id: string }).device_id,
          i_peak_calculated_ka: (spec as { i_peak_calculated_ka: number }).i_peak_calculated_ka,
          i_thermal_calculated_ka: (spec as { i_thermal_calculated_ka: number }).i_thermal_calculated_ka,
          t_clearing_s: (spec as { t_clearing_s: number }).t_clearing_s,
        })),
        // Phase 18: VT onChange per bay (select propaguje do mutateAudit2).
        onChangeVt: (bayDesignation: string, vtId: string | null) => {
          mutateAudit2({
            bay_vts: { [bayDesignation]: vtId ?? '' },
          });
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
  }, [stationName, stationRef, ders, handleOpenDer, handleShowOnSld, handleAddDer, requestDetach, localConfig, audit2Config.data, mutateAudit2]);

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
