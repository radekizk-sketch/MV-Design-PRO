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
  type DerKind,
  type DerStationContext,
} from '../../network-build/der-configurator/DerConfigurator';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import {
  selectDerById,
  useStationDerStore,
  getNcRfgProfile,
} from '../../network-build/station-der';
import { MISSING_DASH } from '../../shared/formatPolishValue';
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

function DerSurfaceShell({
  surface,
  screenCode,
  derKind,
  title,
  testId,
}: DerWrapperProps): JSX.Element {
  const derId = surface.entityRef ?? null;
  const der = useStationDerStore((state) =>
    derId ? selectDerById(state, derId) : null,
  );
  const projectName = useAppStateStore((state) => state.activeProjectName);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);

  const navigateToStation = useCallback(() => {
    if (!der?.station_id) return;
    openRouteSurface('E-13', {
      entityRef: der.station_id,
      subjectKind: 'helper_context',
    });
  }, [der?.station_id, openRouteSurface]);

  const stationContext: DerStationContext | undefined = useMemo(() => {
    if (!der) return undefined;
    return {
      stationId: der.station_id,
      stationName: der.station_id, // fallback — pełna nazwa stacji wymaga snapshotu
      projectName: projectName ?? undefined,
      connectionSide: der.connection_side,
      pccRef: der.pcc_ref,
      bayRef: der.bay_ref,
      transformerRef: der.transformer_ref,
      lvBusbarRef: der.lv_busbar_ref,
      onNavigateToStation: navigateToStation,
    };
  }, [der, projectName, navigateToStation]);

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

function connectionSidePl(side: 'SN' | 'nN' | 'dedicated_transformer'): string {
  switch (side) {
    case 'SN':
      return 'po stronie SN';
    case 'nN':
      return 'po stronie nN';
    case 'dedicated_transformer':
      return 'transformator dedykowany';
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
