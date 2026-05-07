/**
 * Surface'y źródeł OZE (E-21/E-22/E-23) zintegrowane z E-13 Stacja SN/nN.
 *
 *  - PvSourceSurface (E-21): PV/FV
 *  - BessSurface (E-22): BESS (magazyn energii)
 *  - FwSurface (E-23): Farma wiatrowa
 *
 * Faza E: pełna integracja z `useStationDerStore`:
 *   - Surface czyta DER po `entityRef` z store'a (StationDerConnection).
 *   - Breadcrumb `Projekt > Stacja > DER` w DerConfigurator.
 *   - Klik breadcrumb-a stacji nawiguje z powrotem do E-13 z station_context.
 *   - Brak ENM-derived danych — używamy single source of truth ze
 *     `useStationDerStore`.
 *
 * Single source of truth: ten sam StationDerConnection renderuje się tutaj
 * i w E-13 Karta 7 — zmiana w jednym miejscu propaguje się natychmiast.
 */

import { useCallback, useMemo } from 'react';

import { useAppStateStore } from '../../app-state';
import {
  DerConfigurator,
  type DerCardId,
  type DerKind,
  type DerStationContext,
} from '../../network-build/der-configurator/DerConfigurator';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import {
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  selectDerById,
  useStationDerStore,
  getNcRfgProfile,
} from '../../network-build/station-der';
import type { ConnectionSide, StationDerConnection } from '../../network-build/station-der';
import { MISSING_DASH } from '../../shared/formatPolishValue';
import { useSnapshotStore } from '../../topology/snapshotStore';
import type { Generator } from '../../../types/enm';
import type { WorkspaceSurfaceDescriptor } from '../types';

interface DerSurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

interface DerWrapperProps {
  readonly surface: WorkspaceSurfaceDescriptor;
  readonly screenCode: string;
  readonly derKind: DerKind;
  readonly title: string;
  readonly testId: string;
}

function connectionSideFromGenerator(generator: Generator): ConnectionSide {
  switch (generator.connection_variant) {
    case 'DEDICATED_MV_CONNECTION':
    case 'block_transformer':
      return 'dedicated_transformer';
    case 'SOURCE_CONNECTION_STATION':
      return 'SN';
    default:
      return 'nN';
  }
}

function buildDerFromGenerator(
  generator: Generator | null | undefined,
  fallbackKind: DerKind,
): StationDerConnection | null {
  if (!generator) return null;
  const connectionSide = connectionSideFromGenerator(generator);
  return {
    id: generator.ref_id,
    project_id: 'snapshot',
    station_id: generator.station_ref ?? '',
    der_kind: fallbackKind,
    name: generator.name || generator.ref_id,
    connection_side: connectionSide,
    pcc_ref: (generator as { pcc_ref?: string | null }).pcc_ref ?? generator.bus_ref ?? null,
    bay_ref: (generator as { bay_ref?: string | null }).bay_ref ?? null,
    transformer_ref:
      (generator as { transformer_ref?: string | null }).transformer_ref
      ?? (connectionSide === 'dedicated_transformer' ? `tr_${generator.ref_id}` : null),
    lv_busbar_ref:
      (generator as { lv_busbar_ref?: string | null }).lv_busbar_ref
      ?? (connectionSide === 'nN' ? generator.bus_ref ?? null : null),
    connection_node_ref: null,
    internal_cable_ref: null,
    voltage_level_ref: (generator as { voltage_level_ref?: string | null }).voltage_level_ref ?? null,
    catalogs: {
      ...EMPTY_DER_CATALOGS,
      device_catalog_ref: generator.catalog_ref ?? null,
    },
    profiles: { ...EMPTY_DER_PROFILES },
    nominal_power_kw: typeof generator.p_mw === 'number' ? generator.p_mw * 1000 : null,
    completeness: generator.catalog_ref ? 'partial' : 'missing_profile',
    readiness: { ...EMPTY_DER_READINESS },
    created_at: '',
    updated_at: '',
  };
}

function FieldRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2 border-b border-scada-border/60 py-1 last:border-b-0">
      <dt className="text-scada-muted">{label}</dt>
      <dd className="font-medium text-scada-text">{value}</dd>
    </div>
  );
}

function buildDerCards(der: StationDerConnection): Partial<Record<DerCardId, JSX.Element>> {
  return {
    basic: (
      <dl>
        <FieldRow label="Nazwa" value={der.name} />
        <FieldRow label="Punkt przyłączenia" value={der.pcc_ref ?? MISSING_DASH} />
        <FieldRow
          label="Moc znamionowa"
          value={der.nominal_power_kw !== null ? `${der.nominal_power_kw} kW` : MISSING_DASH}
        />
        <FieldRow label="Pozycja katalogowa" value={der.catalogs.device_catalog_ref ?? MISSING_DASH} />
      </dl>
    ),
    topology: (
      <dl>
        <FieldRow label="Stacja" value={der.station_id || MISSING_DASH} />
        <FieldRow label="Strona przyłączenia" value={connectionSidePl(der.connection_side)} />
        <FieldRow label="Pole SN" value={der.bay_ref ?? MISSING_DASH} />
        <FieldRow label="Szyna nN" value={der.lv_busbar_ref ?? MISSING_DASH} />
        <FieldRow label="Transformator" value={der.transformer_ref ?? MISSING_DASH} />
      </dl>
    ),
    inverters: (
      <dl>
        <FieldRow label="Urządzenie z katalogu" value={der.catalogs.device_catalog_ref ?? MISSING_DASH} />
        <FieldRow label="Bateria" value={der.catalogs.battery_catalog_ref ?? MISSING_DASH} />
        <FieldRow label="Sterownik" value={der.catalogs.controller_catalog_ref ?? MISSING_DASH} />
      </dl>
    ),
    'frt-hvrt': (
      <dl>
        <FieldRow label="Krzywa LVRT" value={der.profiles.lvrt_curve_ref ?? MISSING_DASH} />
        <FieldRow label="Krzywa HVRT" value={der.profiles.hvrt_curve_ref ?? MISSING_DASH} />
      </dl>
    ),
    ncrfg: (
      <dl>
        <FieldRow label="Zgodność przyłączeniowa" value={der.profiles.nc_rfg_profile_ref ?? MISSING_DASH} />
        <FieldRow label="Regulacja" value={der.profiles.regulation_profile_ref ?? MISSING_DASH} />
      </dl>
    ),
    readiness: (
      <dl>
        <FieldRow label="Status konfiguracji" value={der.completeness} />
        <FieldRow label="Zwarcie 3-fazowe" value={der.readiness.sc_3f} />
        <FieldRow label="Zgodność przyłączeniowa" value={der.readiness.nc_rfg} />
      </dl>
    ),
  };
}

function DerSurfaceShell({
  surface,
  screenCode,
  derKind,
  title,
  testId,
}: DerWrapperProps): JSX.Element {
  const derId = surface.entityRef
    ?? (typeof surface.routeState.payload?.derId === 'string' ? surface.routeState.payload.derId : null);
  const storeDer = useStationDerStore((state) =>
    derId ? selectDerById(state, derId) : null,
  );
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const snapshotDer = useMemo(
    () => buildDerFromGenerator(
      derId ? snapshot?.generators?.find((generator) => generator.ref_id === derId) : null,
      derKind,
    ),
    [derId, derKind, snapshot?.generators],
  );
  const der = storeDer ?? snapshotDer;
  const derView = der;
  const projectName = useAppStateStore((state) => state.activeProjectName);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);

  const navigateToStation = useCallback(() => {
    if (!derView?.station_id) return;
    openRouteSurface('E-13', {
      entityRef: derView.station_id,
      subjectKind: 'helper_context',
    });
  }, [derView?.station_id, openRouteSurface]);

  const stationContext: DerStationContext | undefined = useMemo(() => {
    if (!derView) return undefined;
    const station = snapshot?.substations?.find(
      (item) => item.ref_id === derView.station_id || item.id === derView.station_id,
    );
    return {
      stationId: derView.station_id,
      stationName: station?.name ?? derView.station_id,
      projectName: projectName ?? undefined,
      connectionSide: derView.connection_side,
      pccRef: derView.pcc_ref,
      bayRef: derView.bay_ref,
      transformerRef: derView.transformer_ref,
      lvBusbarRef: derView.lv_busbar_ref,
      onNavigateToStation: navigateToStation,
    };
  }, [derView, projectName, navigateToStation, snapshot?.substations]);

  return (
    <div
      data-testid={testId}
      data-station-id={der?.station_id ?? ''}
      className="flex h-full w-full flex-col p-4"
    >
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
          {screenCode} · {title}
        </div>
        <h2 className="mt-1 text-base font-semibold text-scada-text">
          {der?.name ?? 'Źródło niewybrane'}
        </h2>
        {!der && (
          <p className="mt-2 rounded border border-amber-700 bg-amber-950/30 p-3 text-xs text-amber-200">
            Brak referencji do źródła OZE w kontekście. Otwórz konfigurator z
            poziomu E-13 Karta "Źródła i magazyny" (przycisk "Otwórz") albo z
            menu kontekstowego SLD.
          </p>
        )}
      </div>
      <div className="flex-1 overflow-auto rounded border border-scada-border bg-scada-panel">
        <DerConfigurator
          derId={derId ?? 'unselected'}
          derKind={derKind}
          stationContext={stationContext}
          children={der ? buildDerCards(der) : undefined}
        />
      </div>
      {der && (
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          <DerKpi label="Punkt przyłączenia" value={connectionSidePl(der.connection_side)} />
          <DerKpi
            label="Moc znamionowa"
            value={der.nominal_power_kw !== null ? `${der.nominal_power_kw} kW` : MISSING_DASH}
          />
          <DerKpi
            label="Profil NC RfG"
            value={
              der.profiles.nc_rfg_profile_ref
                ? getNcRfgProfile(der.profiles.nc_rfg_profile_ref)?.label_pl ?? MISSING_DASH
                : MISSING_DASH
            }
          />
        </div>
      )}
    </div>
  );
}

function DerKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-scada-border bg-scada-surface p-2">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-scada-muted">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-scada-text">{value}</div>
    </div>
  );
}

function connectionSidePl(
  side: 'SN' | 'nN' | 'dedicated_transformer' | 'at_zksn' | 'at_branch_pole' | 'at_cable_joint',
): string {
  switch (side) {
    case 'SN':
      return 'po stronie SN';
    case 'nN':
      return 'po stronie nN';
    case 'dedicated_transformer':
      return 'transformator dedykowany';
    case 'at_zksn':
      return 'na ZK SN';
    case 'at_branch_pole':
      return 'na słupie rozgałęźnym';
    case 'at_cable_joint':
      return 'na mufie kablowej';
  }
}

export function PvSourceSurface({ surface }: DerSurfaceProps): JSX.Element {
  return (
    <DerSurfaceShell
      surface={surface}
      screenCode="E-21"
      derKind="PV"
      title="Konfigurator źródła PV/FV"
      testId="pv-source-surface"
    />
  );
}

export function BessSurface({ surface }: DerSurfaceProps): JSX.Element {
  return (
    <DerSurfaceShell
      surface={surface}
      screenCode="E-22"
      derKind="BESS"
      title="Konfigurator BESS (magazyn energii)"
      testId="bess-surface"
    />
  );
}

export function FwSurface({ surface }: DerSurfaceProps): JSX.Element {
  return (
    <DerSurfaceShell
      surface={surface}
      screenCode="E-23"
      derKind="FW"
      title="Konfigurator farmy wiatrowej"
      testId="fw-surface"
    />
  );
}
