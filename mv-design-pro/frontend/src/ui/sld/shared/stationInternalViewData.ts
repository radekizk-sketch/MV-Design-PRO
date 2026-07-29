/**
 * F12-B (docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md §F12, spec §10.1 ARCH-4 —
 * pozycja „StationInternalView"): budowa `StationInternalViewProps` (minus
 * callbacki — patrz DECYZJA niżej) dla drill-down wnętrza stacji, WSPÓŁDZIELONA
 * między v2 (`SldWorkspaceContainer.tsx`) i v3 (`SldCanvasV3Workspace.tsx`).
 *
 * ŹRÓDŁO: wyciągnięte 1:1 z `useMemo` `internalStationProps` w
 * `v2/canvas/SldWorkspaceContainer.tsx`, wraz z helperami, których kontener
 * używał WYŁĄCZNIE do tego budowniczego (zweryfikowane grepem — pojedyncze
 * miejsce użycia każdego): `formatTechnicalNumberPl`/`formatKvPl`,
 * `inferStationTopologicalType`, `uniqueSortedVoltages`,
 * `STATION_INTERNAL_WIDTH_PX`/`STATION_INTERNAL_HEIGHT_PX`.
 *
 * DECYZJA (czystość funkcji): `StationInternalViewProps.onClose`/
 * `onSelectBay`/`onSelectTransformer` są callbacki UI zależne od stanu
 * lokalnego kontenera/workspace (`setInternalStationId`/`handleSelectElement`
 * w v2, odpowiednik w v3) — NIE są danymi wyprowadzalnymi czysto z
 * `snapshot`/`sldData`. Ta funkcja zwraca WSZYSTKO OPRÓCZ tych trzech pól
 * (`StationInternalViewData` = `Omit<StationInternalViewProps, 'onClose' |
 * 'onSelectBay' | 'onSelectTransformer'>`) — wołający (v2 kontener, v3
 * workspace) dokłada własne callbacki przy montażu `<StationInternalView>`,
 * każdy swoim wzorcem selekcji (v2: `handleSelectElement` dyspozytor; v3:
 * prostszy — patrz `SldCanvasV3Workspace.tsx` docstring montażu).
 *
 * Czysta funkcja (zero DOM/store/callbacków) — v2 i v3 wołają ją identycznie
 * wewnątrz własnego `useMemo`.
 */
import type { EnergyNetworkModel, Substation } from '../../../types/enm';
import { stationPublicIdentity } from '../../shared/publicTechnicalLabels';
import { selectStationDistributionTransformers } from '../../network-build/stationTransformerSelection';
import type { SldDataPayload } from '../v2/canvas/enmToSldAdapter';
import type { InternalDerDescriptor, StationInternalViewProps } from '../v2/canvas/StationInternalView';
import { findBusVoltage, findSubstationByRef, selectStationBays } from './detailDrawerData';

export const STATION_INTERNAL_WIDTH_PX = 880;
export const STATION_INTERNAL_HEIGHT_PX = 560;

const TECHNICAL_NUMBER_FORMAT_PL = new Intl.NumberFormat('pl-PL', {
  maximumFractionDigits: 2,
});

export function formatTechnicalNumberPl(value: number): string {
  return TECHNICAL_NUMBER_FORMAT_PL.format(value);
}

export function formatKvPl(value: number): string {
  return `${formatTechnicalNumberPl(value)} kV`;
}

export function inferStationTopologicalType(
  station: Substation | null,
  fallback?: StationInternalViewProps['topologicalType'],
): StationInternalViewProps['topologicalType'] {
  if (fallback) return fallback;
  switch (station?.station_type) {
    case 'inline':
      return 'przelotowa';
    case 'branch':
      return 'odgałęźna';
    case 'sectional':
      return 'sekcyjna';
    case 'terminal':
    default:
      return 'końcowa';
  }
}

export function uniqueSortedVoltages(values: Array<number | null | undefined>): number[] {
  return Array.from(
    new Set(
      values
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        .map((value) => Number(value.toFixed(3))),
    ),
  ).sort((a, b) => a - b);
}

/** Dane `StationInternalView` minus callbacki (`onClose`/`onSelectBay`/
 *  `onSelectTransformer`, patrz DECYZJA w nagłówku modułu). */
export type StationInternalViewData = Omit<
  StationInternalViewProps,
  'onClose' | 'onSelectBay' | 'onSelectTransformer'
>;

export function buildStationInternalViewData(
  snapshot: EnergyNetworkModel | null,
  sldData: SldDataPayload,
  internalStationId: string | null,
  containerSize: { readonly width: number; readonly height: number },
): StationInternalViewData | null {
  if (!internalStationId) return null;
  const station = findSubstationByRef(snapshot, internalStationId);
  const stationVisual = sldData.stations.find((item) => item.id === internalStationId);
  const stationTransformers = selectStationDistributionTransformers(snapshot, station);
  const stationBays = selectStationBays(snapshot, station);
  const stationBusRefs = new Set(station?.bus_refs ?? []);

  const snVoltageKv =
    uniqueSortedVoltages([
      ...Array.from(stationBusRefs).map((busRef) => findBusVoltage(snapshot, busRef)),
      ...stationTransformers.map((transformer) => transformer.uhv_kv),
    ].filter((voltage): voltage is number => typeof voltage === 'number' && voltage >= 1))[0]
    ?? 15;

  const nnVoltageLevels = uniqueSortedVoltages([
    ...Array.from(stationBusRefs)
      .map((busRef) => findBusVoltage(snapshot, busRef))
      .filter((voltage): voltage is number => typeof voltage === 'number' && voltage < 1),
    ...stationTransformers
      .map((transformer) => transformer.ulv_kv)
      .filter((voltage) => voltage < 1),
  ]);

  const overlayWidth = Math.min(
    STATION_INTERNAL_WIDTH_PX,
    Math.max(360, containerSize.width - 24),
  );
  const overlayHeight = Math.min(
    STATION_INTERNAL_HEIGHT_PX,
    Math.max(300, containerSize.height - 24),
  );

  return {
    substationId: internalStationId,
    name: station && snapshot ? stationPublicIdentity(snapshot, station).displayName : stationVisual?.name || internalStationId,
    topologicalType: inferStationTopologicalType(station, stationVisual?.topologicalType),
    snVoltageKv,
    nnVoltageLevels,
    bays: stationBays.map((bay) => ({
      bayId: bay.ref_id,
      designation: bay.name || bay.ref_id,
      bayRole: bay.bay_role,
      devices: [],
    })),
    transformers: stationTransformers.map((transformer) => ({
      transformerId: transformer.ref_id,
      designation: transformer.name || transformer.ref_id,
      snMva: transformer.sn_mva,
      uhvKv: transformer.uhv_kv,
      ulvKv: transformer.ulv_kv,
    })),
    nnSwitchgears: nnVoltageLevels.map((voltage) => ({
      designation: `Rozdzielnica nN ${formatKvPl(voltage)}`,
      nnVoltageKv: voltage,
      feedersCount: (snapshot?.loads ?? []).filter((load) => {
        const loadVoltage = findBusVoltage(snapshot, load.bus_ref);
        return loadVoltage !== null && Math.abs(loadVoltage - voltage) < 0.001;
      }).length,
    })),
    ders: (snapshot?.generators ?? [])
      .filter((generator) => generator.station_ref === internalStationId
        || generator.meta?.station_ref === internalStationId)
      .map<InternalDerDescriptor>((generator) => ({
        derId: generator.ref_id,
        kind: generator.gen_type === 'bess'
          ? 'BESS'
          : generator.gen_type === 'wind_inverter' || generator.gen_type === 'fw_pmsg' || generator.gen_type === 'fw_dfig' || generator.gen_type === 'fw_scig'
            ? 'FW'
            : 'PV',
        connectionSide:
          generator.connection_variant === 'nn_side' || generator.connection_variant === 'LV_BEHIND_STATION_TRANSFORMER'
            ? 'nn'
            : generator.connection_variant === 'block_transformer' || generator.connection_variant === 'DEDICATED_MV_CONNECTION'
              ? 'dedicated'
              : 'sn',
        count: 1,
      })),
    width: overlayWidth,
    height: overlayHeight,
  };
}
