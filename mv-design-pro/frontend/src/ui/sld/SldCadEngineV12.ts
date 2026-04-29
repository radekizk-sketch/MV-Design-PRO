import type {
  Bay,
  Branch,
  Bus,
  EnergyNetworkModel,
  Generator,
  Load,
  LogicalViewsV1,
  Source,
  Substation,
  Transformer,
} from '../../types/enm';
import type { Connection, Position, AnySldSymbol } from '../sld-editor/types';
import type {
  EngineeringDiagnosticsProjection,
  EngineeringSemanticModel,
  SldBaseProjectionViewModel,
} from '../engineering-semantic';
import type { CanonicalAnnotationsV1 } from './core/layoutResult';
import { projectEnmSnapshotToSld } from './enmSnapshotToSldSymbols';
import {
  getSldLodLevel,
  type SldLodContext,
  type SldLodLevel,
} from './SldLevelOfDetailEngine';
import {
  createVoltageDomainPort,
  validateVoltageDomainConnection,
  type ConnectionValidationResult,
  type CrossDomainElementKind,
  type VoltageDomain,
  type VoltageDomainDirection,
  type VoltageDomainPort,
  type VoltageDomainPortRole,
} from './SldVoltageDomainGuard';

export type SldCadGraphNodeKind =
  | 'BUSBAR'
  | 'BAY_SN'
  | 'SEGMENT_SN'
  | 'TRANSFORMER'
  | 'SOURCE'
  | 'LOAD'
  | 'GENERATOR'
  | 'STATION';

export type SldCadGraphEdgeKind =
  | 'BUSBAR_TO_BAY'
  | 'SEGMENT'
  | 'TRANSFORMER_COUPLING'
  | 'SOURCE_CONNECTION'
  | 'LOAD_CONNECTION'
  | 'GENERATOR_CONNECTION';

export interface SldCadGraphNode {
  id: string;
  refId: string;
  kind: SldCadGraphNodeKind;
  label: string;
  voltageDomain: VoltageDomain | null;
  nominalVoltageKv: number | null;
  portIds: string[];
}

export interface SldCadGraphEdge {
  id: string;
  refId: string;
  kind: SldCadGraphEdgeKind;
  fromPortId: string;
  toPortId: string;
  crossDomainElement: CrossDomainElementKind | null;
  validation: ConnectionValidationResult;
}

export interface SldCadGraph {
  nodes: SldCadGraphNode[];
  ports: VoltageDomainPort[];
  edges: SldCadGraphEdge[];
}

export interface SldPrintProfile {
  name: 'techniczny-jasny';
  background: '#ffffff';
  conductor: '#111827';
  busbar: '#000000';
  apparatusClosed: '#138a3d';
  apparatusOpen: '#b91c1c';
  annotation: '#374151';
}

export interface SldCadEngineOptions {
  zoom?: number;
  hasActiveResults?: boolean;
  auditActive?: boolean;
  hasCriticalIssues?: boolean;
  focusedObject?: boolean;
}

export interface SldCadProjectionResult {
  symbols: AnySldSymbol[];
  connections: Connection[];
  canonicalAnnotations: CanonicalAnnotationsV1 | null;
  semanticModel: EngineeringSemanticModel | null;
  diagnostics: EngineeringDiagnosticsProjection | null;
  sldBaseProjection: SldBaseProjectionViewModel | null;
  graph: SldCadGraph;
  voltageValidation: ConnectionValidationResult[];
  lodLevel: SldLodLevel;
  printProfile: SldPrintProfile;
}

type SnapshotRecord = Partial<EnergyNetworkModel> & Record<string, unknown>;

interface MutableGraph {
  nodes: SldCadGraphNode[];
  ports: VoltageDomainPort[];
  edges: SldCadGraphEdge[];
  portById: Map<string, VoltageDomainPort>;
  primaryPortByRef: Map<string, string>;
}

function asSnapshotRecord(snapshot: Partial<EnergyNetworkModel> | Record<string, unknown> | null | undefined): SnapshotRecord | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return snapshot as SnapshotRecord;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function refOf(item: { ref_id?: string; id?: string; name?: string }, fallback: string): string {
  return item.ref_id || item.id || item.name || fallback;
}

function labelOf(item: { name?: string; ref_id?: string; id?: string }, fallback: string): string {
  return item.name || item.ref_id || item.id || fallback;
}

export function voltageDomainFromKv(voltageKv: number | null | undefined): VoltageDomain {
  if (typeof voltageKv !== 'number' || !Number.isFinite(voltageKv)) return 'SN';
  if (voltageKv >= 60) return 'WN';
  if (voltageKv >= 1) return 'SN';
  return 'NN';
}

function busPortRole(domain: VoltageDomain): VoltageDomainPortRole {
  if (domain === 'WN') return 'BUSBAR_WN';
  if (domain === 'NN') return 'BUSBAR_NN';
  return 'BUSBAR_SN';
}

function transformerPortRole(domain: VoltageDomain): VoltageDomainPortRole {
  if (domain === 'WN') return 'TRANSFORMER_WN';
  if (domain === 'NN') return 'TRANSFORMER_NN';
  return 'TRANSFORMER_SN';
}

function bayRoleToPortRole(role: Bay['bay_role']): VoltageDomainPortRole {
  switch (role) {
    case 'IN':
      return 'BAY_SN_IN';
    case 'TR':
      return 'BAY_SN_TRANSFORMER';
    case 'OUT':
    case 'FEEDER':
    case 'OZE':
    case 'COUPLER':
    case 'MEASUREMENT':
      return 'BAY_SN_OUT';
  }
}

function branchPortRole(branch: Branch, side: 'in' | 'out', domain: VoltageDomain): VoltageDomainPortRole {
  if (domain === 'NN') return 'LV_FEEDER_OUT';
  if (branch.type === 'cable' || branch.type === 'line_overhead') {
    return side === 'in' ? 'SEGMENT_SN_IN' : 'SEGMENT_SN_OUT';
  }
  if (branch.type === 'bus_coupler') return 'BAY_SN_OUT';
  return side === 'in' ? 'BAY_SN_IN' : 'BAY_SN_OUT';
}

function createPort(params: {
  id: string;
  ownerRefId: string;
  name: string;
  voltageDomain: VoltageDomain;
  nominalVoltageKv: number | null;
  role: VoltageDomainPortRole;
  direction?: VoltageDomainDirection;
}): VoltageDomainPort {
  return createVoltageDomainPort({
    id: params.id,
    ownerRefId: params.ownerRefId,
    name: params.name,
    voltageDomain: params.voltageDomain,
    nominalVoltageKv: params.nominalVoltageKv,
    role: params.role,
    direction: params.direction ?? 'DOWN',
    connectable: true,
  });
}

function addNode(graph: MutableGraph, node: SldCadGraphNode): void {
  graph.nodes.push(node);
}

function addPort(graph: MutableGraph, port: VoltageDomainPort): void {
  graph.ports.push(port);
  graph.portById.set(port.id, port);
  if (!graph.primaryPortByRef.has(port.ownerRefId)) {
    graph.primaryPortByRef.set(port.ownerRefId, port.id);
  }
}

function addEdge(
  graph: MutableGraph,
  params: Omit<SldCadGraphEdge, 'validation'>,
): void {
  const from = graph.portById.get(params.fromPortId);
  const to = graph.portById.get(params.toPortId);
  if (!from || !to) return;
  const validation = validateVoltageDomainConnection(from, to, {
    crossDomainElement: params.crossDomainElement,
  });
  graph.edges.push({ ...params, validation });
}

function busMapFromSnapshot(snapshot: SnapshotRecord): Map<string, Bus> {
  const map = new Map<string, Bus>();
  asArray<Bus>(snapshot.buses).forEach((bus, index) => {
    map.set(refOf(bus, `bus-${index}`), bus);
  });
  return map;
}

function busPortId(ref: string): string {
  return `${ref}:busbar`;
}

function addBuses(graph: MutableGraph, buses: Bus[]): void {
  buses.forEach((bus, index) => {
    const refId = refOf(bus, `bus-${index}`);
    const domain = voltageDomainFromKv(bus.voltage_kv);
    const port = createPort({
      id: busPortId(refId),
      ownerRefId: refId,
      name: `Port szyny ${labelOf(bus, refId)}`,
      voltageDomain: domain,
      nominalVoltageKv: bus.voltage_kv ?? null,
      role: busPortRole(domain),
      direction: 'RIGHT',
    });
    addNode(graph, {
      id: `node:${refId}`,
      refId,
      kind: 'BUSBAR',
      label: labelOf(bus, refId),
      voltageDomain: domain,
      nominalVoltageKv: bus.voltage_kv ?? null,
      portIds: [port.id],
    });
    addPort(graph, port);
  });
}

function addBranches(graph: MutableGraph, branches: Branch[], busesByRef: Map<string, Bus>): void {
  branches.forEach((branch, index) => {
    const refId = refOf(branch, `branch-${index}`);
    const fromBus = busesByRef.get(branch.from_bus_ref);
    const toBus = busesByRef.get(branch.to_bus_ref);
    const fromDomain = voltageDomainFromKv(fromBus?.voltage_kv);
    const toDomain = voltageDomainFromKv(toBus?.voltage_kv);
    const nominalVoltageKv = fromBus?.voltage_kv ?? toBus?.voltage_kv ?? null;
    const fromPort = createPort({
      id: `${refId}:in`,
      ownerRefId: refId,
      name: `Wejście odcinka ${labelOf(branch, refId)}`,
      voltageDomain: fromDomain,
      nominalVoltageKv: fromBus?.voltage_kv ?? null,
      role: branchPortRole(branch, 'in', fromDomain),
      direction: 'UP',
    });
    const toPort = createPort({
      id: `${refId}:out`,
      ownerRefId: refId,
      name: `Wyjście odcinka ${labelOf(branch, refId)}`,
      voltageDomain: toDomain,
      nominalVoltageKv: toBus?.voltage_kv ?? null,
      role: branchPortRole(branch, 'out', toDomain),
      direction: 'DOWN',
    });
    addNode(graph, {
      id: `node:${refId}`,
      refId,
      kind: 'SEGMENT_SN',
      label: labelOf(branch, refId),
      voltageDomain: fromDomain === toDomain ? fromDomain : null,
      nominalVoltageKv,
      portIds: [fromPort.id, toPort.id],
    });
    addPort(graph, fromPort);
    addPort(graph, toPort);

    const fromBusPortId = graph.primaryPortByRef.get(branch.from_bus_ref);
    const toBusPortId = graph.primaryPortByRef.get(branch.to_bus_ref);
    if (fromBusPortId) {
      addEdge(graph, {
        id: `${refId}:from-bus`,
        refId,
        kind: 'SEGMENT',
        fromPortId: fromBusPortId,
        toPortId: fromPort.id,
        crossDomainElement: null,
      });
    }
    addEdge(graph, {
      id: `${refId}:internal`,
      refId,
      kind: 'SEGMENT',
      fromPortId: fromPort.id,
      toPortId: toPort.id,
      crossDomainElement: null,
    });
    if (toBusPortId) {
      addEdge(graph, {
        id: `${refId}:to-bus`,
        refId,
        kind: 'SEGMENT',
        fromPortId: toPort.id,
        toPortId: toBusPortId,
        crossDomainElement: null,
      });
    }
  });
}

function addTransformers(graph: MutableGraph, transformers: Transformer[], busesByRef: Map<string, Bus>): void {
  transformers.forEach((transformer, index) => {
    const refId = refOf(transformer, `transformer-${index}`);
    const hvBus = busesByRef.get(transformer.hv_bus_ref);
    const lvBus = busesByRef.get(transformer.lv_bus_ref);
    const hvKv = hvBus?.voltage_kv ?? transformer.uhv_kv ?? null;
    const lvKv = lvBus?.voltage_kv ?? transformer.ulv_kv ?? null;
    const hvDomain = voltageDomainFromKv(hvKv);
    const lvDomain = voltageDomainFromKv(lvKv);
    const hvPort = createPort({
      id: `${refId}:hv`,
      ownerRefId: refId,
      name: `Strona górnego napięcia ${labelOf(transformer, refId)}`,
      voltageDomain: hvDomain,
      nominalVoltageKv: hvKv,
      role: transformerPortRole(hvDomain),
      direction: 'UP',
    });
    const lvPort = createPort({
      id: `${refId}:lv`,
      ownerRefId: refId,
      name: `Strona dolnego napięcia ${labelOf(transformer, refId)}`,
      voltageDomain: lvDomain,
      nominalVoltageKv: lvKv,
      role: transformerPortRole(lvDomain),
      direction: 'DOWN',
    });
    addNode(graph, {
      id: `node:${refId}`,
      refId,
      kind: 'TRANSFORMER',
      label: labelOf(transformer, refId),
      voltageDomain: null,
      nominalVoltageKv: null,
      portIds: [hvPort.id, lvPort.id],
    });
    addPort(graph, hvPort);
    addPort(graph, lvPort);

    const hvBusPortId = graph.primaryPortByRef.get(transformer.hv_bus_ref);
    const lvBusPortId = graph.primaryPortByRef.get(transformer.lv_bus_ref);
    if (hvBusPortId) {
      addEdge(graph, {
        id: `${refId}:hv-bus`,
        refId,
        kind: 'TRANSFORMER_COUPLING',
        fromPortId: hvBusPortId,
        toPortId: hvPort.id,
        crossDomainElement: null,
      });
    }
    addEdge(graph, {
      id: `${refId}:coupling`,
      refId,
      kind: 'TRANSFORMER_COUPLING',
      fromPortId: hvPort.id,
      toPortId: lvPort.id,
      crossDomainElement: 'TRANSFORMER',
    });
    if (lvBusPortId) {
      addEdge(graph, {
        id: `${refId}:lv-bus`,
        refId,
        kind: 'TRANSFORMER_COUPLING',
        fromPortId: lvPort.id,
        toPortId: lvBusPortId,
        crossDomainElement: null,
      });
    }
  });
}

function addBusBoundNode(
  graph: MutableGraph,
  params: {
    refId: string;
    label: string;
    kind: 'SOURCE' | 'LOAD' | 'GENERATOR';
    busRef: string;
    bus: Bus | undefined;
    edgeKind: 'SOURCE_CONNECTION' | 'LOAD_CONNECTION' | 'GENERATOR_CONNECTION';
  },
): void {
  const domain = voltageDomainFromKv(params.bus?.voltage_kv);
  const port = createPort({
    id: `${params.refId}:ac`,
    ownerRefId: params.refId,
    name: `Port przyłączeniowy ${params.label}`,
    voltageDomain: domain,
    nominalVoltageKv: params.bus?.voltage_kv ?? null,
    role: 'SOURCE_AC',
    direction: 'UP',
  });
  addNode(graph, {
    id: `node:${params.refId}`,
    refId: params.refId,
    kind: params.kind,
    label: params.label,
    voltageDomain: domain,
    nominalVoltageKv: params.bus?.voltage_kv ?? null,
    portIds: [port.id],
  });
  addPort(graph, port);
  const busPort = graph.primaryPortByRef.get(params.busRef);
  if (busPort) {
    addEdge(graph, {
      id: `${params.refId}:connection`,
      refId: params.refId,
      kind: params.edgeKind,
      fromPortId: busPort,
      toPortId: port.id,
      crossDomainElement: null,
    });
  }
}

function addSourcesLoadsAndGenerators(graph: MutableGraph, snapshot: SnapshotRecord, busesByRef: Map<string, Bus>): void {
  asArray<Source>(snapshot.sources).forEach((source, index) => {
    const refId = refOf(source, `source-${index}`);
    addBusBoundNode(graph, {
      refId,
      label: labelOf(source, refId),
      kind: 'SOURCE',
      busRef: source.bus_ref,
      bus: busesByRef.get(source.bus_ref),
      edgeKind: 'SOURCE_CONNECTION',
    });
  });
  asArray<Load>(snapshot.loads).forEach((load, index) => {
    const refId = refOf(load, `load-${index}`);
    addBusBoundNode(graph, {
      refId,
      label: labelOf(load, refId),
      kind: 'LOAD',
      busRef: load.bus_ref,
      bus: busesByRef.get(load.bus_ref),
      edgeKind: 'LOAD_CONNECTION',
    });
  });
  asArray<Generator>(snapshot.generators).forEach((generator, index) => {
    const refId = refOf(generator, `generator-${index}`);
    addBusBoundNode(graph, {
      refId,
      label: labelOf(generator, refId),
      kind: 'GENERATOR',
      busRef: generator.bus_ref,
      bus: busesByRef.get(generator.bus_ref),
      edgeKind: 'GENERATOR_CONNECTION',
    });
  });
}

function addBays(graph: MutableGraph, bays: Bay[], busesByRef: Map<string, Bus>): void {
  bays.forEach((bay, index) => {
    const refId = refOf(bay, `bay-${index}`);
    const bus = busesByRef.get(bay.bus_ref);
    const domain = voltageDomainFromKv(bus?.voltage_kv);
    const port = createPort({
      id: `${refId}:primary`,
      ownerRefId: refId,
      name: `Port pola SN ${labelOf(bay, refId)}`,
      voltageDomain: domain,
      nominalVoltageKv: bus?.voltage_kv ?? null,
      role: bayRoleToPortRole(bay.bay_role),
      direction: 'DOWN',
    });
    addNode(graph, {
      id: `node:${refId}`,
      refId,
      kind: 'BAY_SN',
      label: labelOf(bay, refId),
      voltageDomain: domain,
      nominalVoltageKv: bus?.voltage_kv ?? null,
      portIds: [port.id],
    });
    addPort(graph, port);
    const busPort = graph.primaryPortByRef.get(bay.bus_ref);
    if (busPort) {
      addEdge(graph, {
        id: `${refId}:bus`,
        refId,
        kind: 'BUSBAR_TO_BAY',
        fromPortId: busPort,
        toPortId: port.id,
        crossDomainElement: null,
      });
    }
  });
}

function buildSldCadGraph(snapshot: SnapshotRecord | null): SldCadGraph {
  const graph: MutableGraph = {
    nodes: [],
    ports: [],
    edges: [],
    portById: new Map(),
    primaryPortByRef: new Map(),
  };
  if (!snapshot) {
    return { nodes: [], ports: [], edges: [] };
  }

  const buses = asArray<Bus>(snapshot.buses);
  const busesByRef = busMapFromSnapshot(snapshot);
  addBuses(graph, buses);
  addBranches(graph, asArray<Branch>(snapshot.branches), busesByRef);
  addTransformers(graph, asArray<Transformer>(snapshot.transformers), busesByRef);
  addSourcesLoadsAndGenerators(graph, snapshot, busesByRef);
  addBays(graph, asArray<Bay>(snapshot.bays), busesByRef);

  asArray<Substation>(snapshot.substations).forEach((station, index) => {
    const refId = refOf(station, `station-${index}`);
    addNode(graph, {
      id: `node:${refId}`,
      refId,
      kind: 'STATION',
      label: labelOf(station, refId),
      voltageDomain: null,
      nominalVoltageKv: null,
      portIds: [],
    });
  });

  return {
    nodes: graph.nodes,
    ports: graph.ports,
    edges: graph.edges,
  };
}

export function validateSldCadGraph(graph: SldCadGraph): ConnectionValidationResult[] {
  return graph.edges.map((edge) => edge.validation);
}

export function createSldPrintProfile(): SldPrintProfile {
  return {
    name: 'techniczny-jasny',
    background: '#ffffff',
    conductor: '#111827',
    busbar: '#000000',
    apparatusClosed: '#138a3d',
    apparatusOpen: '#b91c1c',
    annotation: '#374151',
  };
}

export function createSldCadEngineV12Graph(
  snapshot: Partial<EnergyNetworkModel> | Record<string, unknown> | null | undefined,
): SldCadGraph {
  return buildSldCadGraph(asSnapshotRecord(snapshot));
}

export function projectEnmToSldCadV12(
  snapshot: Partial<EnergyNetworkModel> | Record<string, unknown> | null | undefined,
  logicalViews?: LogicalViewsV1 | null,
  options: SldCadEngineOptions = {},
): SldCadProjectionResult {
  const projection = projectEnmSnapshotToSld(snapshot, logicalViews);
  const graph = createSldCadEngineV12Graph(snapshot);
  const lodContext: SldLodContext = {
    zoom: options.zoom ?? 1,
    hasActiveResults: options.hasActiveResults,
    auditActive: options.auditActive,
    hasCriticalIssues: options.hasCriticalIssues,
    focusedObject: options.focusedObject,
  };

  return {
    ...projection,
    graph,
    voltageValidation: validateSldCadGraph(graph),
    lodLevel: getSldLodLevel(lodContext),
    printProfile: createSldPrintProfile(),
  };
}

export function extractSldGeometrySignature(result: Pick<SldCadProjectionResult, 'symbols' | 'connections'>): {
  symbolPositions: Array<{ id: string; position: Position | undefined }>;
  connectionPaths: Array<{ id: string; path: Position[] }>;
} {
  return {
    symbolPositions: result.symbols.map((symbol) => ({
      id: symbol.id,
      position: symbol.position,
    })),
    connectionPaths: result.connections.map((connection) => ({
      id: connection.id,
      path: connection.path,
    })),
  };
}
