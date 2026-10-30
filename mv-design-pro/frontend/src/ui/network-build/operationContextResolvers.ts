import type { ElementType } from '../types';
import type { Bay, BranchPointSN, EnergyNetworkModel, LogicalViewsV1, TerminalRef } from '../../types/enm';
import { powyzejPasmaNn, wPasmieNn } from '../../ui2/model/pasmaNapieciowe';
import { poleLinioweWolne } from './zajetoscPol';
import { stacjaSzyn, szynyStacji } from '../shared/szynyStacji';
import { pole, pola, polaSnStacji, punktPrzylaczeniaPola, zaciskPola } from '../shared/polaStacji';
import { stationRefOfTransformer } from '../shared/transformatoryStacji';

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
  lineFieldRef?: string;
}

export interface ContinueTrunkOperationContext extends ContinueTrunkSelection {
  stationRef: string | null;
  busRef: string | null;
  terminalName: string;
  terminalVoltageLabel: string;
  isFirstTrunkSegment: boolean;
  existingSegmentCount: number;
}

interface StationCorridorEndpoint {
  trunkId: string;
  terminalId: string;
  terminalPortId: string;
  terminalBusRef: string;
}

interface StationLineFieldEndpoint {
  trunkId: string;
  fieldRef: string;
  terminalBusRef: string;
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
}

const FALLBACK_LABEL = '—';
const UNKNOWN_SOURCE_TYPE_LABEL = 'Nie ustalono';
const SN_BUS_SOURCE_TYPE_LABEL = 'Szyna SN';
const LINE_BAY_SOURCE_TYPE_LABEL = 'Pole liniowe SN';
const ZKSN_SOURCE_TYPE_LABEL = 'ZKSN';
const BRANCH_POLE_SOURCE_TYPE_LABEL = 'Słup rozgałęźny';

const TRANSFORMER_INVALID_CONTEXT_LABEL = 'Transformator SN/nN można dodać tylko w kontekście stacji SN/nN.';
const TRANSFORMER_GPS_BLOCK_LABEL = 'Transformator SN/nN nie należy do układu GPZ ani źródła systemowego.';
const TRANSFORMER_BUSES_MISSING_LABEL = 'Stacja nie ma kompletnej pary szyn SN i nN dla transformatora.';

export function resolveBranchPointBranchPortId(portCount: number, index: number): string {
  return portCount > 1 ? `BRANCH_${index + 1}` : 'BRANCH'; // ui-terminology-ignore
}

/**
 * Port startu odgałęzienia z punktu odgałęźnego w JEDYNEJ postaci (rozstrzygnięcie architekta
 * 2026-10-30, karta UX-04/POLE-LINIOWE-WZORZEC; backend `_rozwiaz_port_startu`): zacisk
 * `index`-tego portu odgałęźnego (`ports.BRANCH[index]`). Punkt bez tego portu daje własny
 * `ref_id` — domena odmawia nazwanym kodem (`branch_point.required_port_missing`), zamiast
 * domysłu portu po stronie UI.
 */
export function portStartuPunktu(branchPoint: BranchPointSN, index: number): string {
  const porty = Array.isArray(branchPoint.ports?.BRANCH) ? branchPoint.ports.BRANCH : []; // ui-terminology-ignore
  return porty[index] ?? branchPoint.ref_id;
}

/** Etykieta portu odgałęźnego punktu dla projektanta (bez identyfikatorów portów modelu). */
function etykietaPortuPunktu(branchPoint: BranchPointSN, index: number): string {
  const porty = Array.isArray(branchPoint.ports?.BRANCH) ? branchPoint.ports.BRANCH : []; // ui-terminology-ignore
  if (branchPoint.branch_point_type === 'branch_pole') return 'port boczny słupa rozgałęźnego';
  return porty.length > 1 ? `port odgałęźny ${index + 1} z ${porty.length}` : 'port odgałęźny';
}

export function resolveBranchPointBranchPortOccupancy(
  branchPoint: BranchPointSN,
  index: number,
): string | null {
  const branchPorts = Array.isArray(branchPoint.ports?.BRANCH) ? branchPoint.ports.BRANCH : []; // ui-terminology-ignore
  const canonicalPortId = resolveBranchPointBranchPortId(branchPorts.length, index);
  const legacySinglePortId = branchPorts.length === 1 ? `BRANCH_${index + 1}` : null; // ui-terminology-ignore
  return (
    branchPoint.branch_occupied?.[canonicalPortId]
    ?? (legacySinglePortId ? branchPoint.branch_occupied?.[legacySinglePortId] : null)
    ?? null
  );
}

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
  return pole(snapshot, refId) ?? pola(snapshot).find((bay) => bay.id === refId) ?? null;
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

function findBranch(snapshot: EnergyNetworkModel | null, refId: string | null) {
  if (!snapshot || !refId) {
    return null;
  }
  return snapshot.branches?.find((branch) => branch.ref_id === refId || branch.id === refId) ?? null;
}

function findCorridorForSegment(snapshot: EnergyNetworkModel | null, refId: string | null) {
  if (!snapshot || !refId) {
    return null;
  }
  return snapshot.corridors?.find((corridor) => (
    corridor.ref_id === refId
    || corridor.id === refId
    || corridor.ordered_segment_refs.includes(refId)
  )) ?? null;
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
    || branchPoint.ports.BRANCH.includes(busRef) // ui-terminology-ignore
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

  // SZYNY-STACJI-LUSTRO: szyna (także zacisk pola, szyna za aparatem pola nN) → stacja
  // z jednego lustra `szynyStacji`.
  return stacjaSzyn(snapshot).get(busRef) ?? null;
}

/** Szyny strony SN stacji z jednego lustra przynależności (`szynyStacji`): szyny główne SN
 *  i zaciski pól SN — odcinek przyłączony zasadą toru kończy się na zacisku pola. */
function findStationSnBusRefs(
  snapshot: EnergyNetworkModel,
  station: EnergyNetworkModel['substations'][number],
): string[] {
  return [...szynyStacji(snapshot, station)]
    .sort()
    .filter((ref) => isSnBusVoltage(findBus(snapshot, ref)?.voltage_kv));
}

function findStationRefByTransformer(snapshot: EnergyNetworkModel | null, transformerRef: string | null): string | null {
  if (!snapshot || !transformerRef) {
    return null;
  }

  // SZYNY-STACJI-LUSTRO: stacja transformatora z JEDNEJ reguły „transformatory stacji”.
  return stationRefOfTransformer(snapshot, transformerRef);
}

function findBusRefsForStation(station: EnergyNetworkModel['substations'][number] | null | undefined): string[] {
  return Array.isArray(station?.bus_refs) ? station.bus_refs : [];
}

function isSnBusVoltage(voltageKv: unknown): voltageKv is number {
  return typeof voltageKv === 'number' && powyzejPasmaNn(voltageKv);
}

function isLvBusVoltage(voltageKv: unknown): voltageKv is number {
  return typeof voltageKv === 'number' && wPasmieNn(voltageKv);
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

function isLineContinuationBayRole(role: unknown): boolean {
  return ['OUT', 'FEEDER'].includes(String(role ?? '').toUpperCase());
}

function isBranchStartBayRole(role: unknown): boolean {
  return String(role ?? '').toUpperCase() === 'FEEDER';
}

/**
 * Pole SN stacji zdolne do startu odgałęzienia (karta W5-B: rekordy `bays`, jedna reguła dla
 * pól wszystkich stacji): rola odgałęźna (`FEEDER`), własny zacisk pola (POLA-W-TORZE —
 * odcinek przyłącza się do zacisku) i zajętość WOLNA potwierdzona przez model odczytu
 * backendu (`line_fields`). `preferredBusRef` zawęża do pola na tej szynie albo z tym zaciskiem.
 */
function findBranchCapableStationField(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
  stationRef: string | null,
  preferredBusRef?: string | null,
): Bay | null {
  const station = findStation(snapshot, stationRef);
  if (!station) return null;

  return [...polaSnStacji(snapshot, station.ref_id)]
    .filter((bay) => (
      poleZdolneDoOdgalezienia(bay, logicalViews)
      && (!preferredBusRef || bay.bus_ref === preferredBusRef || zaciskPola(bay) === preferredBusRef)
    ))
    .sort((left, right) => (
      lineFieldRoleRank(left.bay_role) - lineFieldRoleRank(right.bay_role)
      || left.ref_id.localeCompare(right.ref_id)
    ))[0] ?? null;
}

/** Predykat startu odgałęzienia z pola — JEDEN dla pola wskazanego i pola wybieranego ze
 *  stacji (dawniej rekord `bays` przechodził bez sprawdzenia zacisku i zajętości). */
function poleZdolneDoOdgalezienia(bay: Bay, logicalViews: LogicalViewsV1 | null): boolean {
  return isBranchStartBayRole(bay.bay_role)
    && Boolean(zaciskPola(bay))
    // Karta POLE-ZAJĘTE: zajętość z modelu odczytu backendu, nie z własnego licznika.
    && poleLinioweWolne(logicalViews, bay.ref_id);
}

function lineFieldRoleRank(role: unknown): number {
  const normalized = String(role ?? '').toUpperCase();
  if (normalized === 'FEEDER') return 0;
  if (normalized === 'OUT') return 1;
  return 9;
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
    if (bus && wPasmieNn(bus.voltage_kv)) {
      return bus.ref_id;
    }
    const station = findStation(snapshot, stationRef);
    return findBusRefsForStation(station)
      .map((ref) => findBus(snapshot, ref))
      .find((candidate) => candidate != null && wPasmieNn(candidate.voltage_kv))
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
  logicalViews: LogicalViewsV1 | null,
  elementId: string | null,
  stationRef: string | null,
  busRef: string | null,
): string | null {
  const branchPoint = findBranchPoint(snapshot, elementId) ?? findBranchPointByBus(snapshot, busRef);
  const bay = findBay(snapshot, elementId);
  const polaModelu = pola(snapshot);
  const effectiveStationRef =
    stationRef
    || resolveStationRefForElement(snapshot, busRef ?? '', 'Bus')
    || polaModelu.find((candidate) => candidate.bus_ref === busRef && candidate.bay_role === 'FEEDER')?.substation_ref
    || polaModelu.find((candidate) => candidate.bus_ref === busRef)?.substation_ref
    || null;

  // Port startu w JEDYNEJ postaci (backend `_rozwiaz_port_startu`): `ref_id` pola liniowego,
  // gdy ciąg startuje z pola; inaczej zacisk portu odgałęźnego punktu.
  if (branchPoint?.branch_point_type === 'branch_pole') {
    return portStartuPunktu(branchPoint, 0);
  }

  if (branchPoint?.branch_point_type === 'zksn') {
    const branchPorts = Array.isArray(branchPoint.ports.BRANCH) ? branchPoint.ports.BRANCH : []; // ui-terminology-ignore
    if (branchPorts.length === 0) {
      return null;
    }

    if (busRef && branchPorts.includes(busRef)) {
      return busRef;
    }

    const freePortIndex = branchPorts.findIndex((_, index) => (
      !resolveBranchPointBranchPortOccupancy(branchPoint, index)
    ));
    return portStartuPunktu(branchPoint, freePortIndex >= 0 ? freePortIndex : 0);
  }

  if (bay && poleZdolneDoOdgalezienia(bay, logicalViews)) {
    return bay.ref_id;
  }

  if (effectiveStationRef) {
    const stationField = findBranchCapableStationField(snapshot, logicalViews, effectiveStationRef, busRef);
    if (stationField) {
      return stationField.ref_id;
    }
  }

  return null;
}

export function resolveBranchSourceContext(
  snapshot: EnergyNetworkModel | null,
  fromRef: string,
): BranchSourceDisplayContext {
  const nieustalony: BranchSourceDisplayContext = {
    fromRef,
    sourceType: UNKNOWN_SOURCE_TYPE_LABEL,
    sourceName: fromRef || FALLBACK_LABEL,
    sourceBusRef: '',
    voltageLabel: FALLBACK_LABEL,
    portLabel: '',
  };
  if (!snapshot || !fromRef) {
    return nieustalony;
  }

  // Port startu w JEDYNEJ postaci (backend `_rozwiaz_port_startu`): `ref_id` pola liniowego
  // SN albo zacisk — szyna portu odgałęźnego punktu lub szyna końca ciągu.
  const bay = findBay(snapshot, fromRef);
  if (bay && isLineContinuationBayRole(bay.bay_role)) {
    // Karta W5-B: jeden rekord pola. Odcinek przyłącza się w punkcie przyłączenia pola
    // (własny zacisk, a bez niego szyna pola — POLA-W-TORZE); nazwa: stacja i pole.
    const sourceBusRef = punktPrzylaczeniaPola(bay) ?? '';
    const sourceBus = findBus(snapshot, sourceBusRef);
    const stationOfBay = findStation(snapshot, bay.substation_ref ?? null);
    return {
      fromRef,
      sourceType: LINE_BAY_SOURCE_TYPE_LABEL,
      sourceName: stationOfBay?.name ? `${stationOfBay.name} · ${bay.name}` : bay.name,
      sourceBusRef,
      voltageLabel: sourceBus ? `${sourceBus.voltage_kv} kV` : FALLBACK_LABEL,
      portLabel: 'zacisk pola liniowego',
    };
  }

  const branchPoint = snapshot.branch_points?.find((candidate) => (
    Array.isArray(candidate.ports?.BRANCH) && candidate.ports.BRANCH.includes(fromRef) // ui-terminology-ignore
  ));
  if (branchPoint) {
    const index = branchPoint.ports.BRANCH.indexOf(fromRef); // ui-terminology-ignore
    const branchBus = findBus(snapshot, fromRef);
    return {
      fromRef,
      sourceType: branchPoint.branch_point_type === 'zksn' ? ZKSN_SOURCE_TYPE_LABEL : BRANCH_POLE_SOURCE_TYPE_LABEL,
      sourceName: branchPoint.name,
      sourceBusRef: fromRef,
      voltageLabel: branchBus ? `${branchBus.voltage_kv} kV` : FALLBACK_LABEL,
      portLabel: etykietaPortuPunktu(branchPoint, index),
    };
  }

  const bus = findBus(snapshot, fromRef);
  if (bus) {
    return {
      fromRef,
      sourceType: SN_BUS_SOURCE_TYPE_LABEL,
      sourceName: bus.name ?? fromRef,
      sourceBusRef: bus.ref_id ?? bus.id ?? fromRef,
      voltageLabel: `${bus.voltage_kv} kV`,
      portLabel: 'zacisk końca ciągu',
    };
  }

  return nieustalony;
}

export function resolveBranchStartOperationContext(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
  elementId: string,
  elementType: ElementType,
): BranchStartOperationContext {
  const networkContext = resolveElementNetworkContext(snapshot, elementId, elementType);
  const fromRef = resolveBranchSourceRef(
    snapshot,
    logicalViews,
    elementId,
    networkContext.stationRef,
    networkContext.busRef,
  ) ?? '';
  const display = resolveBranchSourceContext(snapshot, fromRef);
  // Element jest POLEM (rekord `bays`), które nie jest punktem startu odgałęzienia (zajęte,
  // bez zacisku, rola inna niż odgałęźna): szyna pola NIE jest zastępczym punktem startu —
  // odcinek z pola przyłącza się w zacisku pola (POLA-W-TORZE), nie na szynie rozdzielnicy.
  const poleBezStartu = !fromRef && findBay(snapshot, elementId) !== null;

  return {
    ...display,
    stationRef: networkContext.stationRef,
    busRef: poleBezStartu ? null : networkContext.busRef,
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

  const matchingBays = pola(snapshot).filter((bay) => (
    bay.bus_ref === busRef
    && (!stationRef || bay.substation_ref === stationRef)
  ));
  const bayTerminalCandidates = findMatchingTerminals(
    logicalViews,
    matchingBays.flatMap((bay) => [bay.ref_id, bay.id]),
  );

  return bayTerminalCandidates.length === 1 ? bayTerminalCandidates[0] : null;
}

function isTerminalAvailableForContinuation(terminal: TerminalRef): boolean {
  return (
    terminal.status === 'OTWARTY'
    || terminal.status === 'ZAREZERWOWANY_DLA_RINGU'
  );
}

function findTrunkTerminalForStation(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
  stationRef: string | null,
): TerminalRef | null {
  const station = findStation(snapshot, stationRef);
  if (!snapshot || !logicalViews || !station) {
    return null;
  }

  const stationSnBusRefs = findStationSnBusRefs(snapshot, station);

  if (stationSnBusRefs.length === 0) {
    return null;
  }

  const stationBayRefs = polaSnStacji(snapshot, station.ref_id)
    .filter((bay) => stationSnBusRefs.includes(bay.bus_ref))
    .flatMap((bay) => [bay.ref_id, bay.id])
    .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0);

  const terminals = findMatchingTerminals(logicalViews, [
    station.ref_id,
    station.id,
    ...stationSnBusRefs,
    ...stationBayRefs,
  ])
    .filter(isTerminalAvailableForContinuation)
    .sort((left, right) => {
      const leftEndScore = left.port_id === 'trunk_end' ? 0 : 1;
      const rightEndScore = right.port_id === 'trunk_end' ? 0 : 1;
      if (leftEndScore !== rightEndScore) return leftEndScore - rightEndScore;
      return `${left.trunk_id ?? ''}:${left.element_id}:${left.port_id}`
        .localeCompare(`${right.trunk_id ?? ''}:${right.element_id}:${right.port_id}`);
    });

  return terminals[0] ?? null;
}

function findCorridorEndpointForStation(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null,
): StationCorridorEndpoint | null {
  const station = findStation(snapshot, stationRef);
  if (!snapshot || !station) {
    return null;
  }

  const stationSnBusRefs = new Set(findStationSnBusRefs(snapshot, station));
  if (stationSnBusRefs.size === 0) {
    return null;
  }

  for (const corridor of snapshot.corridors ?? []) {
    const segments = corridor.ordered_segment_refs
      .map((segmentRef) => findBranch(snapshot, segmentRef))
      .filter((segment): segment is NonNullable<typeof segment> => Boolean(segment));
    if (segments.length === 0) {
      continue;
    }

    const stationSegmentIndex = segments.findIndex((segment) => (
      stationSnBusRefs.has(segment.from_bus_ref)
      || stationSnBusRefs.has(segment.to_bus_ref)
    ));
    if (stationSegmentIndex < 0) {
      continue;
    }

    const tail = segments[segments.length - 1];
    const terminalBusRef = stationSnBusRefs.has(tail.to_bus_ref)
      ? tail.from_bus_ref
      : tail.to_bus_ref;
    if (!terminalBusRef) {
      continue;
    }

    return {
      trunkId: corridor.ref_id,
      terminalId: terminalBusRef,
      terminalPortId: 'trunk_end',
      terminalBusRef,
    };
  }

  return null;
}

function findCorridorRefForStation(
  snapshot: EnergyNetworkModel | null,
  station: EnergyNetworkModel['substations'][number],
): string {
  if (!snapshot) return '';

  const stationSnBusRefs = new Set(findStationSnBusRefs(snapshot, station));

  for (const corridor of snapshot.corridors ?? []) {
    const hasStationSegment = corridor.ordered_segment_refs
      .map((segmentRef) => findBranch(snapshot, segmentRef))
      .some((segment) => Boolean(
        segment
        && (stationSnBusRefs.has(segment.from_bus_ref) || stationSnBusRefs.has(segment.to_bus_ref)),
      ));
    if (hasStationSegment) return corridor.ref_id;
  }

  return '';
}

function findStationLineFieldEndpoint(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
  stationRef: string | null,
): StationLineFieldEndpoint | null {
  const station = findStation(snapshot, stationRef);
  if (!snapshot || !station) return null;

  // Karta W5-B: pola SN stacji z rekordów `bays` — jeden nośnik (dawniej lista w `meta` stacji
  // uzupełniana kopiami rekordów `bays`, z zaciskiem przepisywanym między kanałami).
  const fieldEndpoint = polaSnStacji(snapshot, station.ref_id)
    .map((bay) => ({
      fieldRef: bay.ref_id,
      terminalBusRef: zaciskPola(bay),
      bayRole: bay.bay_role,
      trunkId: findTerminal(logicalViews, bay.ref_id)?.trunk_id ?? '',
    }))
    .filter((candidate) => (
      candidate.terminalBusRef
      && isLineContinuationBayRole(candidate.bayRole)
      // Karta POLE-ZAJĘTE: wolne = potwierdzone przez model odczytu backendu.
      && poleLinioweWolne(logicalViews, candidate.fieldRef)
    ))
    .sort((left, right) => left.fieldRef.localeCompare(right.fieldRef))[0];

  if (!fieldEndpoint?.terminalBusRef) return null;

  return {
    trunkId: fieldEndpoint.trunkId || findCorridorRefForStation(snapshot, station),
    fieldRef: fieldEndpoint.fieldRef,
    terminalBusRef: fieldEndpoint.terminalBusRef,
  };
}

export function resolveContinueTrunkSelection(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
  elementId: string,
  busRef: string | null,
  stationRef: string | null,
): ContinueTrunkSelection {
  if (stationRef) {
    const stationField = findStationLineFieldEndpoint(snapshot, logicalViews, stationRef);
    if (stationField) {
      return {
        trunkId: stationField.trunkId,
        terminalId: stationField.fieldRef,
        terminalPortId: 'field_out',
        terminalBusRef: stationField.terminalBusRef,
        lineFieldRef: stationField.fieldRef,
      };
    }

    return {
      trunkId: '',
      terminalId: '',
      terminalPortId: '',
      terminalBusRef: '',
    };
  }

  const directTerminals = findMatchingTerminals(logicalViews, [elementId]);
  const terminal = directTerminals.length === 1
    ? directTerminals[0]
    : directTerminals.length === 0
      ? findTrunkTerminalForBus(snapshot, logicalViews, busRef, stationRef)
        ?? findTrunkTerminalForStation(snapshot, logicalViews, stationRef)
      : null;
  const corridorEndpoint = terminal ? null : findCorridorEndpointForStation(snapshot, stationRef);
  const terminalId = terminal?.element_id ?? corridorEndpoint?.terminalId ?? '';
  const terminalBay = findBay(snapshot, terminal?.element_id ?? null);
  const terminalBayBusRef = zaciskPola(terminalBay);
  const terminalBusRef =
    (typeof terminalBayBusRef === 'string' && terminalBayBusRef.trim() ? terminalBayBusRef.trim() : '')
    || busRef
    || terminalBay?.bus_ref
    || corridorEndpoint?.terminalBusRef
    || terminal?.element_id
    || '';

  return {
    trunkId: terminal?.trunk_id ?? corridorEndpoint?.trunkId ?? '',
    terminalId,
    terminalPortId: terminal?.port_id ?? corridorEndpoint?.terminalPortId ?? '',
    terminalBusRef,
    lineFieldRef: terminalBay && isLineContinuationBayRole(terminalBay.bay_role)
      ? terminalBay.ref_id
      : undefined,
  };
}

export function resolveContinueTrunkOperationContext(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
  elementId: string,
  elementType: ElementType,
): ContinueTrunkOperationContext {
  const networkContext = resolveElementNetworkContext(snapshot, elementId, elementType);
  if (elementType === 'LineBranch') {
    const corridor = findCorridorForSegment(snapshot, elementId);
    const segmentRefs = corridor?.ordered_segment_refs ?? [];
    const lastSegment = findBranch(
      snapshot,
      segmentRefs.length > 0 ? segmentRefs[segmentRefs.length - 1] : elementId,
    );
    const terminalBusRef = lastSegment?.to_bus_ref ?? '';
    const terminalBus = findBus(snapshot, terminalBusRef);
    return {
      trunkId: corridor?.ref_id ?? '',
      terminalId: terminalBusRef,
      terminalPortId: 'trunk_end',
      terminalBusRef,
      stationRef: networkContext.stationRef,
      busRef: terminalBusRef || networkContext.busRef,
      terminalName: terminalBus?.name ?? terminalBusRef ?? FALLBACK_LABEL,
      terminalVoltageLabel: terminalBus ? `${terminalBus.voltage_kv} kV` : FALLBACK_LABEL,
      isFirstTrunkSegment: false,
      existingSegmentCount: segmentRefs.length,
    };
  }
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
    elementType === 'Station' ? networkContext.stationRef : null,
  );
  const terminalBus = findBus(snapshot, selection.terminalBusRef || selection.terminalId);
  const corridor = findCorridor(snapshot, selection.trunkId);
  const station = elementType === 'Station' ? findStation(snapshot, networkContext.stationRef) : null;
  const stationContinuationName =
    station
      ? `${formatElementContextLabel(station.name, station.ref_id)} - port wyjściowy SN`
      : '';

  return {
    ...selection,
    terminalPortId: station ? 'station_out' : selection.terminalPortId,
    stationRef: networkContext.stationRef,
    busRef: networkContext.busRef,
    terminalName: stationContinuationName || terminalBus?.name || selection.terminalId,
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
