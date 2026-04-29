import type { ElementType } from '../types';
import type { EnergyNetworkModel, LogicalViewsV1, TerminalRef } from '../../types/enm';

export interface BranchSourceDisplayContext {
  fromRef: string;
  sourceType: string;
  sourceName: string;
  sourceBusRef: string;
  voltageLabel: string;
  portLabel: string;
}

export interface ContinueTrunkDisplayContext {
  trunkId: string;
  terminalId: string;
  terminalPortId: string;
  terminalBusRef: string;
  terminalName: string;
  terminalVoltageLabel: string;
  isFirstTrunkSegment: boolean;
  existingSegmentCount: number;
}

export interface ResolvedElementNetworkContext {
  stationRef: string | null;
  busRef: string | null;
  busNnRef: string | null;
  feederRef: string | null;
}

export interface ContinueTrunkSelection {
  trunkId: string;
  terminalId: string;
  terminalPortId: string;
  terminalBusRef: string;
}

export interface ContinueTrunkOperationContext extends ContinueTrunkSelection {
  stationRef: string | null;
  busRef: string | null;
  terminalName: string;
  terminalVoltageLabel: string;
  isFirstTrunkSegment: boolean;
  existingSegmentCount: number;
}

export interface BranchStartOperationContext extends BranchSourceDisplayContext {
  stationRef: string | null;
  busRef: string | null;
}

export interface TransformerOperationContext {
  stationRef: string | null;
  stationName: string;
  hvBusRef: string | null;
  hvBusName: string;
  lvBusRef: string | null;
  lvBusName: string;
  isAllowed: boolean;
  blockReason: string | null;
}

export interface RingOperationContext {
  terminalAId: string;
  terminalBId: string;
  nopCandidates: Array<{ id: string; label: string; elementType: string }>;
}

const FALLBACK_LABEL = '—';
const UNKNOWN_SOURCE_TYPE_LABEL = 'Nie ustalono';
const STATION_SOURCE_TYPE_LABEL = 'Stacja SN/nN';
const SN_BUS_SOURCE_TYPE_LABEL = 'Szyna SN';
const ZKSN_SOURCE_TYPE_LABEL = 'ZKSN';
const BRANCH_POLE_SOURCE_TYPE_LABEL = 'Słup rozgałęźny';

const TRANSFORMER_INVALID_CONTEXT_LABEL = 'Transformator SN/nN mozna dodac tylko w kontekscie stacji SN/nN.';
const TRANSFORMER_GPS_BLOCK_LABEL = 'Transformator SN/nN nie nalezy do ukladu GPZ lub zrodla systemowego.';
const TRANSFORMER_BUSES_MISSING_LABEL = 'Stacja nie ma kompletnej pary szyn SN i nN dla transformatora.';

function readContextString(
  context: Record<string, unknown> | undefined,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = context?.[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return '';
}

function readContextNumber(
  context: Record<string, unknown> | undefined,
  key: string,
): number | null {
  const value = context?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readContextBoolean(
  context: Record<string, unknown> | undefined,
  key: string,
): boolean | null {
  const value = context?.[key];
  return typeof value === 'boolean' ? value : null;
}

function findStation(snapshot: EnergyNetworkModel | null, refId: string | null) {
  if (!snapshot || !refId) {
    return null;
  }
  return snapshot.substations.find((station) => station.ref_id === refId || station.id === refId) ?? null;
}

function findBay(snapshot: EnergyNetworkModel | null, refId: string | null) {
  if (!snapshot || !refId) {
    return null;
  }
  return snapshot.bays.find((bay) => bay.ref_id === refId || bay.id === refId) ?? null;
}

function findBus(snapshot: EnergyNetworkModel | null, refId: string | null) {
  if (!snapshot || !refId) {
    return null;
  }
  return snapshot.buses.find((bus) => bus.ref_id === refId || bus.id === refId) ?? null;
}

function findCorridor(snapshot: EnergyNetworkModel | null, refId: string | null) {
  if (!snapshot || !refId) {
    return null;
  }
  return snapshot.corridors?.find((corridor) => corridor.ref_id === refId || corridor.id === refId) ?? null;
}

function findSource(snapshot: EnergyNetworkModel | null, refId: string | null) {
  if (!snapshot || !refId) {
    return null;
  }
  return snapshot.sources.find((source) => source.ref_id === refId || source.id === refId) ?? null;
}

function findGenerator(snapshot: EnergyNetworkModel | null, refId: string | null) {
  if (!snapshot || !refId) {
    return null;
  }
  return snapshot.generators?.find((generator) => generator.ref_id === refId || generator.id === refId) ?? null;
}

function findLoad(snapshot: EnergyNetworkModel | null, refId: string | null) {
  if (!snapshot || !refId) {
    return null;
  }
  return snapshot.loads?.find((load) => load.ref_id === refId || load.id === refId) ?? null;
}

function findBranchPoint(snapshot: EnergyNetworkModel | null, refId: string | null) {
  if (!snapshot || !refId) {
    return null;
  }
  return snapshot.branch_points?.find((branchPoint) => (
    branchPoint.ref_id === refId || branchPoint.id === refId
  )) ?? null;
}

function findBranchPointByBus(snapshot: EnergyNetworkModel | null, busRef: string | null) {
  if (!snapshot || !busRef) {
    return null;
  }
  return snapshot.branch_points?.find((branchPoint) => (
    branchPoint.bus_ref === busRef
    || branchPoint.ports.MAIN_IN === busRef
    || branchPoint.ports.MAIN_OUT === busRef
    || branchPoint.ports.BRANCH.includes(busRef)
  )) ?? null;
}

function findTerminal(logicalViews: LogicalViewsV1 | null, elementId: string) {
  if (!logicalViews) {
    return null;
  }
  return logicalViews.terminals.find((terminal) => terminal.element_id === elementId || terminal.port_id === elementId) ?? null;
}

function findMatchingTerminals(logicalViews: LogicalViewsV1 | null, elementIds: Iterable<string>): TerminalRef[] {
  if (!logicalViews) {
    return [];
  }

  const ids = new Set(Array.from(elementIds).filter((id) => id.length > 0));
  if (ids.size === 0) {
    return [];
  }

  return logicalViews.terminals.filter((terminal) => (
    ids.has(terminal.element_id) || ids.has(terminal.port_id)
  ));
}

function findStationRefByBus(snapshot: EnergyNetworkModel | null, busRef: string | null): string | null {
  if (!snapshot || !busRef) {
    return null;
  }

  return snapshot.substations.find((station) => (
    Array.isArray(station.bus_refs) && station.bus_refs.includes(busRef)
  ))?.ref_id ?? null;
}

function findStationRefByTransformer(snapshot: EnergyNetworkModel | null, transformerRef: string | null): string | null {
  if (!snapshot || !transformerRef) {
    return null;
  }

  return snapshot.substations.find((station) => station.transformer_refs.includes(transformerRef))?.ref_id ?? null;
}

function findBusRefsForStation(station: EnergyNetworkModel['substations'][number] | null | undefined): string[] {
  return Array.isArray(station?.bus_refs) ? station.bus_refs : [];
}

function isSnBusVoltage(voltageKv: unknown): voltageKv is number {
  return typeof voltageKv === 'number' && Number.isFinite(voltageKv) && voltageKv >= 1;
}

function isLvBusVoltage(voltageKv: unknown): voltageKv is number {
  return typeof voltageKv === 'number' && Number.isFinite(voltageKv) && voltageKv > 0 && voltageKv < 1;
}

function sortBusesByVoltageAscending(
  left: EnergyNetworkModel['buses'][number],
  right: EnergyNetworkModel['buses'][number],
): number {
  if (left.voltage_kv !== right.voltage_kv) {
    return left.voltage_kv - right.voltage_kv;
  }
  return (left.name ?? left.ref_id).localeCompare(right.name ?? right.ref_id);
}

function sortBusesByVoltageDescending(
  left: EnergyNetworkModel['buses'][number],
  right: EnergyNetworkModel['buses'][number],
): number {
  if (left.voltage_kv !== right.voltage_kv) {
    return right.voltage_kv - left.voltage_kv;
  }
  return (left.name ?? left.ref_id).localeCompare(right.name ?? right.ref_id);
}

function formatElementContextLabel(
  name: string | null | undefined,
  refId: string | null | undefined,
): string {
  if (typeof name === 'string' && name.trim()) {
    return name.trim();
  }
  if (typeof refId === 'string' && refId.trim()) {
    return refId.trim();
  }
  return FALLBACK_LABEL;
}

function resolveTransformerContextForStation(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null,
  preferredBusRef?: string | null,
  preferredHvBusRef?: string | null,
  preferredLvBusRef?: string | null,
): TransformerOperationContext {
  const station = findStation(snapshot, stationRef);
  const stationName = formatElementContextLabel(station?.name, stationRef);

  if (!station) {
    return {
      stationRef: stationRef ?? null,
      stationName,
      hvBusRef: null,
      hvBusName: FALLBACK_LABEL,
      lvBusRef: null,
      lvBusName: FALLBACK_LABEL,
      isAllowed: false,
      blockReason: TRANSFORMER_INVALID_CONTEXT_LABEL,
    };
  }

  if (station.station_type === 'gpz') {
    return {
      stationRef: station.ref_id,
      stationName,
      hvBusRef: null,
      hvBusName: FALLBACK_LABEL,
      lvBusRef: null,
      lvBusName: FALLBACK_LABEL,
      isAllowed: false,
      blockReason: TRANSFORMER_GPS_BLOCK_LABEL,
    };
  }

  const stationBuses = findBusRefsForStation(station)
    .map((refId) => findBus(snapshot, refId))
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null);

  const explicitHvBus = findBus(snapshot, preferredHvBusRef ?? null);
  const explicitLvBus = findBus(snapshot, preferredLvBusRef ?? null);
  const preferredBus = findBus(snapshot, preferredBusRef ?? null);

  const snCandidates = stationBuses
    .filter((candidate) => isSnBusVoltage(candidate.voltage_kv))
    .sort(sortBusesByVoltageDescending);
  const lvCandidates = stationBuses
    .filter((candidate) => isLvBusVoltage(candidate.voltage_kv))
    .sort(sortBusesByVoltageAscending);

  const hvBus =
    (explicitHvBus && isSnBusVoltage(explicitHvBus.voltage_kv) ? explicitHvBus : null)
    ?? (preferredBus && isSnBusVoltage(preferredBus.voltage_kv) ? preferredBus : null)
    ?? snCandidates[0]
    ?? null;
  const lvBus =
    (explicitLvBus && isLvBusVoltage(explicitLvBus.voltage_kv) ? explicitLvBus : null)
    ?? (preferredBus && isLvBusVoltage(preferredBus.voltage_kv) ? preferredBus : null)
    ?? lvCandidates[0]
    ?? null;

  const isAllowed = Boolean(hvBus?.ref_id && lvBus?.ref_id);

  return {
    stationRef: station.ref_id,
    stationName,
    hvBusRef: hvBus?.ref_id ?? null,
    hvBusName: formatElementContextLabel(hvBus?.name, hvBus?.ref_id ?? null),
    lvBusRef: lvBus?.ref_id ?? null,
    lvBusName: formatElementContextLabel(lvBus?.name, lvBus?.ref_id ?? null),
    isAllowed,
    blockReason: isAllowed ? null : TRANSFORMER_BUSES_MISSING_LABEL,
  };
}

function findRingPartner(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
  currentTerminal: TerminalRef | null,
): TerminalRef | null {
  if (!snapshot || !logicalViews || !currentTerminal) {
    return null;
  }

  const currentBus = findBus(snapshot, currentTerminal.element_id);
  const currentVoltage = currentBus?.voltage_kv ?? null;

  return logicalViews.terminals.find((candidate) => {
    if (candidate.element_id === currentTerminal.element_id) {
      return false;
    }
    if (candidate.status !== 'OTWARTY' && candidate.status !== 'ZAREZERWOWANY_DLA_RINGU') {
      return false;
    }
    if (candidate.trunk_id && currentTerminal.trunk_id && candidate.trunk_id === currentTerminal.trunk_id) {
      return false;
    }
    if (currentVoltage == null) {
      return true;
    }

    return findBus(snapshot, candidate.element_id)?.voltage_kv === currentVoltage;
  }) ?? null;
}

export function resolveNopCandidates(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null = null,
) {
  if (!snapshot || !logicalViews) {
    return [];
  }

  const branchByRef = new Map(snapshot.branches.map((branch) => [branch.ref_id, branch]));
  const trunks = Array.isArray(logicalViews.trunks) ? logicalViews.trunks : [];
  const candidateIds = Array.from(new Set(
    trunks
      .map((trunk) => trunk.no_point_ref)
      .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0),
  ));

  return candidateIds.map((candidateId) => {
    const branch = branchByRef.get(candidateId);
    return {
      id: candidateId,
      label: branch?.name ?? candidateId,
      elementType: 'NORMAL_OPEN_POINT',
    };
  });
}

export function resolveStationRefForElement(
  snapshot: EnergyNetworkModel | null,
  elementId: string,
  elementType: ElementType,
): string | null {
  switch (elementType) {
    case 'Station':
      return elementId;
    case 'Bus':
    case 'BusNN':
      return findStationRefByBus(snapshot, elementId);
    case 'Source':
      return findStationRefByBus(snapshot, findSource(snapshot, elementId)?.bus_ref ?? null);
    case 'TransformerBranch':
      return findStationRefByTransformer(snapshot, elementId);
    case 'BaySN':
    case 'FeederNN':
    case 'SourceFieldNN':
      return findBay(snapshot, elementId)?.substation_ref ?? null;
    case 'Generator':
    case 'PVInverter':
    case 'BESSInverter':
    case 'Genset':
    case 'UPS': {
      const generator = findGenerator(snapshot, elementId);
      return generator?.station_ref
        ?? findStationRefByBus(snapshot, generator?.bus_ref ?? null);
    }
    case 'Load':
    case 'LoadNN':
      return findStationRefByBus(snapshot, findLoad(snapshot, elementId)?.bus_ref ?? null);
    default:
      return null;
  }
}

export function resolveBusRefForElement(
  snapshot: EnergyNetworkModel | null,
  elementId: string,
  elementType: ElementType,
): string | null {
  switch (elementType) {
    case 'Bus':
    case 'BusNN':
      return elementId;
    case 'Source':
      return findSource(snapshot, elementId)?.bus_ref ?? null;
    case 'BaySN':
    case 'FeederNN':
    case 'SourceFieldNN':
      return findBay(snapshot, elementId)?.bus_ref ?? null;
    case 'Generator':
    case 'PVInverter':
    case 'BESSInverter':
    case 'Genset':
    case 'UPS':
      return findGenerator(snapshot, elementId)?.bus_ref ?? null;
    case 'Load':
    case 'LoadNN':
      return findLoad(snapshot, elementId)?.bus_ref ?? null;
    default:
      return null;
  }
}

export function resolveElementNetworkContext(
  snapshot: EnergyNetworkModel | null,
  elementId: string,
  elementType: ElementType,
): ResolvedElementNetworkContext {
  const stationRef = resolveStationRefForElement(snapshot, elementId, elementType);
  const busRef = resolveBusRefForElement(snapshot, elementId, elementType);
  const busNnRef = (() => {
    if (elementType === 'BusNN') {
      return elementId;
    }
    const bus = findBus(snapshot, busRef);
    if (bus && bus.voltage_kv > 0 && bus.voltage_kv < 1) {
      return bus.ref_id;
    }
    const station = findStation(snapshot, stationRef);
    return findBusRefsForStation(station)
      .map((ref) => findBus(snapshot, ref))
      .find((candidate) => candidate != null && candidate.voltage_kv > 0 && candidate.voltage_kv < 1)
      ?.ref_id ?? null;
  })();
  const feederRef = (() => {
    if (elementType === 'FeederNN') {
      return elementId;
    }
    const load = findLoad(snapshot, elementId);
    return typeof load?.meta?.feeder_ref === 'string' ? load.meta.feeder_ref : null;
  })();

  return {
    stationRef,
    busRef,
    busNnRef,
    feederRef,
  };
}

export function resolveBranchSourceRef(
  snapshot: EnergyNetworkModel | null,
  elementId: string | null,
  stationRef: string | null,
  busRef: string | null,
): string | null {
  const branchPoint = findBranchPoint(snapshot, elementId) ?? findBranchPointByBus(snapshot, busRef);
  const bay = findBay(snapshot, elementId);
  const effectiveStationRef =
    stationRef
    || resolveStationRefForElement(snapshot, busRef ?? '', 'Bus')
    || snapshot?.bays.find((candidate) => candidate.bus_ref === busRef && candidate.bay_role === 'FEEDER')?.substation_ref
    || snapshot?.bays.find((candidate) => candidate.bus_ref === busRef)?.substation_ref
    || null;

  if (branchPoint?.branch_point_type === 'branch_pole') {
    return `${branchPoint.ref_id}.BRANCH`;
  }

  if (branchPoint?.branch_point_type === 'zksn') {
    const branchPorts = Array.isArray(branchPoint.ports.BRANCH) ? branchPoint.ports.BRANCH : [];
    if (branchPorts.length === 0) {
      return `${branchPoint.ref_id}.BRANCH_1`;
    }

    if (busRef) {
      const matchedPortIndex = branchPorts.findIndex((candidateBusRef) => candidateBusRef === busRef);
      if (matchedPortIndex >= 0) {
        return `${branchPoint.ref_id}.BRANCH_${matchedPortIndex + 1}`;
      }
    }

    const occupiedPorts = branchPoint.branch_occupied ?? {};
    const freePortIndex = branchPorts.findIndex((_, index) => !occupiedPorts[`BRANCH_${index + 1}`]);
    const selectedPortIndex = freePortIndex >= 0 ? freePortIndex : 0;
    return `${branchPoint.ref_id}.BRANCH_${selectedPortIndex + 1}`;
  }

  if (bay && bay.bay_role === 'FEEDER' && effectiveStationRef) {
    return `${effectiveStationRef}.BRANCH`;
  }

  if (effectiveStationRef) {
    const feederBay = snapshot?.bays.find((candidate) => (
      candidate.substation_ref === effectiveStationRef && candidate.bay_role === 'FEEDER'
    ));
    if (feederBay) {
      return `${effectiveStationRef}.BRANCH`;
    }
  }

  return null;
}

export function resolveBranchSourceContext(
  snapshot: EnergyNetworkModel | null,
  fromRef: string,
): BranchSourceDisplayContext {
  if (!snapshot || !fromRef || !fromRef.includes('.')) {
    return {
      fromRef,
      sourceType: UNKNOWN_SOURCE_TYPE_LABEL,
      sourceName: fromRef || FALLBACK_LABEL,
      sourceBusRef: '',
      voltageLabel: FALLBACK_LABEL,
      portLabel: '',
    };
  }

  const [elementRef, portId] = fromRef.split('.', 2);
  const station = findStation(snapshot, elementRef);
  if (station) {
    const feederBay = snapshot.bays.find((candidate) => (
      (candidate.substation_ref === station.ref_id || candidate.substation_ref === station.id)
      && candidate.bay_role === 'FEEDER'
    ));
    const sourceBus = findBus(snapshot, feederBay?.bus_ref ?? null);
    return {
      fromRef,
      sourceType: STATION_SOURCE_TYPE_LABEL,
      sourceName: station.name ?? elementRef,
      sourceBusRef: feederBay?.bus_ref ?? '',
      voltageLabel: sourceBus ? `${sourceBus.voltage_kv} kV` : FALLBACK_LABEL,
      portLabel: portId,
    };
  }

  const bus = findBus(snapshot, elementRef);
  if (bus) {
    return {
      fromRef,
      sourceType: SN_BUS_SOURCE_TYPE_LABEL,
      sourceName: bus.name ?? elementRef,
      sourceBusRef: bus.ref_id ?? bus.id ?? elementRef,
      voltageLabel: `${bus.voltage_kv} kV`,
      portLabel: portId,
    };
  }

  const branchPoint = findBranchPoint(snapshot, elementRef);
  if (!branchPoint) {
    return {
      fromRef,
      sourceType: UNKNOWN_SOURCE_TYPE_LABEL,
      sourceName: elementRef,
      sourceBusRef: '',
      voltageLabel: FALLBACK_LABEL,
      portLabel: portId,
    };
  }

  let sourceBusRef = '';
  if (branchPoint.branch_point_type === 'branch_pole') {
    sourceBusRef = branchPoint.ports.BRANCH[0] ?? '';
  } else if (portId.startsWith('BRANCH_')) {
    const index = Number(portId.split('_')[1]) - 1;
    sourceBusRef = branchPoint.ports.BRANCH[index] ?? '';
  } else {
    sourceBusRef = branchPoint.ports.BRANCH[0] ?? '';
  }

  const branchBus = findBus(snapshot, sourceBusRef);
  return {
    fromRef,
    sourceType: branchPoint.branch_point_type === 'zksn' ? ZKSN_SOURCE_TYPE_LABEL : BRANCH_POLE_SOURCE_TYPE_LABEL,
    sourceName: branchPoint.name,
    sourceBusRef,
    voltageLabel: branchBus ? `${branchBus.voltage_kv} kV` : FALLBACK_LABEL,
    portLabel: portId,
  };
}

export function resolveBranchStartOperationContext(
  snapshot: EnergyNetworkModel | null,
  elementId: string,
  elementType: ElementType,
): BranchStartOperationContext {
  const networkContext = resolveElementNetworkContext(snapshot, elementId, elementType);
  const fromRef = resolveBranchSourceRef(snapshot, elementId, networkContext.stationRef, networkContext.busRef) ?? '';
  const display = resolveBranchSourceContext(snapshot, fromRef);

  return {
    ...display,
    stationRef: networkContext.stationRef,
    busRef: networkContext.busRef,
  };
}

export function resolveTransformerOperationContext(
  snapshot: EnergyNetworkModel | null,
  elementId: string,
  elementType: ElementType,
): TransformerOperationContext {
  const networkContext = resolveElementNetworkContext(snapshot, elementId, elementType);
  return resolveTransformerContextForStation(
    snapshot,
    networkContext.stationRef,
    networkContext.busRef,
  );
}

export function resolveTransformerOperationContextFromOperation(
  snapshot: EnergyNetworkModel | null,
  context: Record<string, unknown> | undefined,
): TransformerOperationContext {
  const stationRef = typeof context?.station_ref === 'string' ? context.station_ref.trim() : null;
  const busRef = typeof context?.bus_ref === 'string' ? context.bus_ref.trim() : null;
  const hvBusRef = typeof context?.hv_bus_ref === 'string' ? context.hv_bus_ref.trim() : null;
  const lvBusRef = typeof context?.lv_bus_ref === 'string' ? context.lv_bus_ref.trim() : null;

  return resolveTransformerContextForStation(snapshot, stationRef, busRef, hvBusRef, lvBusRef);
}

export function resolveBranchSourceContextFromOperation(
  snapshot: EnergyNetworkModel | null,
  context: Record<string, unknown> | undefined,
): BranchSourceDisplayContext {
  const fromRef = readContextString(context, 'from_ref');
  const sourceBusRef = readContextString(context, 'source_bus_ref');
  const sourceType = readContextString(context, 'source_type_label');
  const sourceName = readContextString(context, 'source_name');
  const sourceVoltageLabel = readContextString(context, 'source_voltage_label');
  const sourcePortLabel = readContextString(context, 'source_port_label');

  if (!fromRef) {
    return {
      fromRef: '',
      sourceType: sourceType || UNKNOWN_SOURCE_TYPE_LABEL,
      sourceName: sourceName || FALLBACK_LABEL,
      sourceBusRef,
      voltageLabel: sourceVoltageLabel || FALLBACK_LABEL,
      portLabel: sourcePortLabel,
    };
  }

  const resolved = resolveBranchSourceContext(snapshot, fromRef);
  return {
    fromRef,
    sourceType: sourceType || resolved.sourceType,
    sourceName: sourceName || resolved.sourceName,
    sourceBusRef: sourceBusRef || resolved.sourceBusRef,
    voltageLabel: sourceVoltageLabel || resolved.voltageLabel,
    portLabel: sourcePortLabel || resolved.portLabel,
  };
}

function findTrunkTerminalForBus(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
  busRef: string | null,
  stationRef: string | null,
): TerminalRef | null {
  if (!snapshot || !logicalViews || !busRef) {
    return null;
  }

  const directTerminals = findMatchingTerminals(logicalViews, [busRef]);
  if (directTerminals.length === 1) {
    return directTerminals[0];
  }
  if (directTerminals.length > 1) {
    return null;
  }

  const matchingBays = snapshot.bays.filter((bay) => (
    bay.bus_ref === busRef
    && (!stationRef || bay.substation_ref === stationRef)
  ));
  const bayTerminalCandidates = findMatchingTerminals(
    logicalViews,
    matchingBays.flatMap((bay) => [bay.ref_id, bay.id]),
  );

  return bayTerminalCandidates.length === 1 ? bayTerminalCandidates[0] : null;
}

export function resolveContinueTrunkSelection(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
  elementId: string,
  busRef: string | null,
  stationRef: string | null,
): ContinueTrunkSelection {
  const directTerminals = findMatchingTerminals(logicalViews, [elementId]);
  const terminal = directTerminals.length === 1
    ? directTerminals[0]
    : directTerminals.length === 0
      ? findTrunkTerminalForBus(snapshot, logicalViews, busRef, stationRef)
      : null;
  const terminalId = terminal?.element_id ?? '';
  const terminalBusRef = busRef ?? terminal?.element_id ?? '';

  return {
    trunkId: terminal?.trunk_id ?? '',
    terminalId,
    terminalPortId: terminal?.port_id ?? '',
    terminalBusRef,
  };
}

export function resolveContinueTrunkOperationContext(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
  elementId: string,
  elementType: ElementType,
): ContinueTrunkOperationContext {
  const networkContext = resolveElementNetworkContext(snapshot, elementId, elementType);
  if (elementType === 'Source') {
    const sourceBus = findBus(snapshot, networkContext.busRef);
    return {
      trunkId: '',
      terminalId: '',
      terminalPortId: '',
      terminalBusRef: networkContext.busRef ?? '',
      stationRef: networkContext.stationRef,
      busRef: networkContext.busRef,
      terminalName: sourceBus?.name ?? FALLBACK_LABEL,
      terminalVoltageLabel: sourceBus ? `${sourceBus.voltage_kv} kV` : FALLBACK_LABEL,
      isFirstTrunkSegment: true,
      existingSegmentCount: 0,
    };
  }

  const selection = resolveContinueTrunkSelection(
    snapshot,
    logicalViews,
    elementId,
    networkContext.busRef,
    networkContext.stationRef,
  );
  const terminalBus = findBus(snapshot, selection.terminalBusRef || selection.terminalId);
  const corridor = findCorridor(snapshot, selection.trunkId);

  return {
    ...selection,
    stationRef: networkContext.stationRef,
    busRef: networkContext.busRef,
    terminalName: terminalBus?.name ?? selection.terminalId,
    terminalVoltageLabel: terminalBus ? `${terminalBus.voltage_kv} kV` : FALLBACK_LABEL,
    isFirstTrunkSegment: selection.trunkId.length === 0,
    existingSegmentCount: corridor?.ordered_segment_refs.length ?? 0,
  };
}

export function resolveRingOperationContext(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
  elementId: string,
  elementType: ElementType,
): RingOperationContext {
  const networkContext = resolveElementNetworkContext(snapshot, elementId, elementType);
  const currentTerminal = findTerminal(logicalViews, elementId)
    ?? (networkContext.busRef ? findTerminal(logicalViews, networkContext.busRef) : null);
  const partner = findRingPartner(snapshot, logicalViews, currentTerminal);

  return {
    terminalAId: currentTerminal?.element_id ?? elementId,
    terminalBId: partner?.element_id ?? '',
    nopCandidates: resolveNopCandidates(snapshot, logicalViews),
  };
}

export function resolveContinueTrunkContextFromOperation(
  snapshot: EnergyNetworkModel | null,
  context: Record<string, unknown> | undefined,
): ContinueTrunkDisplayContext {
  const trunkId = readContextString(context, 'trunk_id', 'trunkId');
  const terminalId = readContextString(context, 'from_terminal_id', 'terminal_id', 'terminalId');
  const terminalPortId = readContextString(context, 'terminal_port_id', 'port_id');
  const terminalBusRef = readContextString(context, 'from_bus_ref');
  const terminalBus = findBus(snapshot, terminalBusRef || terminalId);
  const existingSegmentCount = readContextNumber(context, 'existing_segment_count');
  const isFirstTrunkSegment = readContextBoolean(context, 'is_first_trunk_segment');
  const terminalName = readContextString(context, 'terminal_name');
  const terminalVoltageLabel = readContextString(context, 'terminal_voltage_label');

  return {
    trunkId,
    terminalId,
    terminalPortId,
    terminalBusRef,
    terminalName: terminalName || terminalBus?.name || terminalId || FALLBACK_LABEL,
    terminalVoltageLabel: terminalVoltageLabel || (terminalBus ? `${terminalBus.voltage_kv} kV` : FALLBACK_LABEL),
    isFirstTrunkSegment: isFirstTrunkSegment ?? trunkId.length === 0,
    existingSegmentCount: existingSegmentCount ?? 0,
  };
}
