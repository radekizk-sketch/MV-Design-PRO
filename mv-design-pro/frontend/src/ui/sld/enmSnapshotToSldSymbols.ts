import type { EnergyNetworkModel } from '../../types/enm';
import { isInlineHelperBus } from '../shared/enmVisibility';
import type {
  AnySldSymbol,
  BranchSymbol,
  BusSymbol,
  Connection,
  GeneratorSymbol,
  LoadSymbol,
  Position,
  SourceSymbol,
  SwitchSymbol,
} from '../sld-editor/types';
import { generateConnections } from '../sld-editor/utils/connectionRouting';
import { buildVisualGraphFromTopology } from './core/topologyAdapterV2';
import { computeLayout } from './core/layoutPipeline';
import type { CanonicalAnnotationsV1, EdgeRouteV1 } from './core/layoutResult';
import { readTopologyFromENM } from './core/topologyInputReader';

type SnapshotLike = Partial<EnergyNetworkModel>;
type SnapshotRecord = Record<string, unknown>;
type ProjectedSymbol = AnySldSymbol & { helperBus?: boolean };

const EMPTY_CANONICAL_ANNOTATIONS: CanonicalAnnotationsV1 = {
  trunkNodes: [],
  trunkSegments: [],
  branchPoints: [],
  stationChains: [],
  gpzSections: [],
  gpzFeederFields: [],
  inlineBranchObjects: [],
};

function asRecords(value: unknown): SnapshotRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is SnapshotRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .sort((left, right) => {
      const leftRef = typeof left.ref_id === 'string' ? left.ref_id : '';
      const rightRef = typeof right.ref_id === 'string' ? right.ref_id : '';
      return leftRef.localeCompare(rightRef);
    });
}

function asTypedArray<T>(value: unknown): T[] {
  return asRecords(value) as unknown as T[];
}

function readString(record: SnapshotRecord, key: string, fallback = ''): string {
  const value = record[key];
  return typeof value === 'string' ? value : fallback;
}

function readNumber(record: SnapshotRecord, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isSwitchBranchType(branchType: string): boolean {
  return ['switch', 'breaker', 'bus_coupler', 'disconnector', 'fuse'].includes(branchType);
}

function toSwitchType(branchType: string): SwitchSymbol['switchType'] {
  switch (branchType) {
    case 'breaker':
    case 'bus_coupler':
      return 'BREAKER';
    case 'disconnector':
      return 'DISCONNECTOR';
    case 'fuse':
      return 'FUSE';
    default:
      return 'LOAD_SWITCH';
  }
}

function buildBusWidth(
  bus: SnapshotRecord,
  branches: SnapshotRecord[],
  sources: SnapshotRecord[],
  transformers: SnapshotRecord[],
): number {
  const refId = readString(bus, 'ref_id');
  const attachedCount = branches.filter(
    (branch) => readString(branch, 'from_bus_ref') === refId || readString(branch, 'to_bus_ref') === refId,
  ).length
    + sources.filter((source) => readString(source, 'bus_ref') === refId).length
    + transformers.filter(
      (transformer) =>
        readString(transformer, 'hv_bus_ref') === refId || readString(transformer, 'lv_bus_ref') === refId,
    ).length;

  if (/gpz/i.test(readString(bus, 'name'))) {
    return Math.max(240, 120 + attachedCount * 60);
  }

  return 160;
}

function isHelperBusSymbol(symbol: AnySldSymbol): boolean {
  return symbol.elementType === 'Bus' && (symbol as { helperBus?: boolean }).helperBus === true;
}

function buildBaseSymbols(
  snapshot: SnapshotLike,
  options: { includeHelperBuses?: boolean } = {},
): ProjectedSymbol[] {
  const symbols: ProjectedSymbol[] = [];
  const branches = asRecords(snapshot.branches);
  const sources = asRecords(snapshot.sources);
  const transformers = asRecords(snapshot.transformers);
  const includeHelperBuses = options.includeHelperBuses === true;

  for (const bus of asRecords(snapshot.buses)) {
    const refId = readString(bus, 'ref_id');
    if (!refId) {
      continue;
    }

    const helperBus = isInlineHelperBus(bus as never);
    if (helperBus && !includeHelperBuses) {
      continue;
    }

    symbols.push({
      id: refId,
      elementId: refId,
      elementType: 'Bus',
      elementName: readString(bus, 'name', refId),
      position: { x: 0, y: 0 },
      inService: true,
      width: buildBusWidth(bus, branches, sources, transformers),
      height: 8,
      helperBus,
    } as BusSymbol & { helperBus: boolean });
  }

  for (const source of sources) {
    const refId = readString(source, 'ref_id');
    if (!refId) {
      continue;
    }

    symbols.push({
      id: refId,
      elementId: refId,
      elementType: 'Source',
      elementName: readString(source, 'name', refId),
      position: { x: 0, y: 0 },
      inService: true,
      connectedToNodeId: readString(source, 'bus_ref'),
      sourceType: 'SYSTEM_SOURCE',
      slackBus: true,
      sourceModel: null,
    } as SourceSymbol);
  }

  for (const transformer of transformers) {
    const refId = readString(transformer, 'ref_id');
    if (!refId) {
      continue;
    }

    symbols.push({
      id: refId,
      elementId: refId,
      elementType: 'TransformerBranch',
      elementName: readString(transformer, 'name', refId),
      position: { x: 0, y: 0 },
      inService: true,
      fromNodeId: readString(transformer, 'hv_bus_ref'),
      toNodeId: readString(transformer, 'lv_bus_ref'),
      points: [],
    } as BranchSymbol);
  }

  for (const branch of branches) {
    const refId = readString(branch, 'ref_id');
    const branchType = readString(branch, 'type');
    if (!refId || !branchType) {
      continue;
    }

    if (isSwitchBranchType(branchType)) {
      symbols.push({
        id: refId,
        elementId: refId,
        elementType: 'Switch',
        elementName: readString(branch, 'name', refId),
        position: { x: 0, y: 0 },
        inService: readString(branch, 'status', 'closed') === 'closed',
        fromNodeId: readString(branch, 'from_bus_ref'),
        toNodeId: readString(branch, 'to_bus_ref'),
        switchState: readString(branch, 'status', 'closed') === 'open' ? 'OPEN' : 'CLOSED',
        switchType: toSwitchType(branchType),
      } as SwitchSymbol);
      continue;
    }

    symbols.push({
      id: refId,
      elementId: refId,
      elementType: 'LineBranch',
      elementName: readString(branch, 'name', refId),
      position: { x: 0, y: 0 },
      inService: readString(branch, 'status', 'closed') === 'closed',
      fromNodeId: readString(branch, 'from_bus_ref'),
      toNodeId: readString(branch, 'to_bus_ref'),
      points: [],
      branchType: branchType === 'cable' ? 'CABLE' : 'LINE',
    } as BranchSymbol);
  }

  for (const load of asRecords(snapshot.loads)) {
    const refId = readString(load, 'ref_id');
    if (!refId) {
      continue;
    }

    symbols.push({
      id: refId,
      elementId: refId,
      elementType: 'Load',
      elementName: readString(load, 'name', refId),
      position: { x: 0, y: 0 },
      inService: true,
      connectedToNodeId: readString(load, 'bus_ref'),
    } as LoadSymbol);
  }

  for (const generator of asRecords(snapshot.generators)) {
    const refId = readString(generator, 'ref_id');
    if (!refId) {
      continue;
    }

    symbols.push({
      id: refId,
      elementId: refId,
      elementType: 'Generator',
      elementName: readString(generator, 'name', refId),
      position: { x: 0, y: 0 },
      inService: true,
      connectedToNodeId: readString(generator, 'bus_ref'),
    } as GeneratorSymbol);
  }

  return symbols;
}

function normalizeSnapshotToEnm(snapshot: SnapshotLike): EnergyNetworkModel {
  const headerRecord =
    snapshot.header && typeof snapshot.header === 'object' && !Array.isArray(snapshot.header)
      ? (snapshot.header as unknown as SnapshotRecord)
      : {};

  const hash = readString(headerRecord, 'hash_sha256', 'enm-snapshot');
  const createdAt = readString(headerRecord, 'created_at', '1970-01-01T00:00:00Z');
  const updatedAt = readString(headerRecord, 'updated_at', createdAt);
  const name = readString(headerRecord, 'name', 'Migawka ENM');
  const revision = readNumber(headerRecord, 'revision', 0);

  return {
    header: {
      enm_version: '1.0',
      name,
      description: readString(headerRecord, 'description') || null,
      created_at: createdAt,
      updated_at: updatedAt,
      revision,
      hash_sha256: hash,
      defaults: {
        frequency_hz: 50,
        unit_system: 'SI',
      },
    },
    buses: asTypedArray<EnergyNetworkModel['buses'][number]>(snapshot.buses),
    branches: asTypedArray<EnergyNetworkModel['branches'][number]>(snapshot.branches),
    transformers: asTypedArray<EnergyNetworkModel['transformers'][number]>(snapshot.transformers),
    sources: asTypedArray<EnergyNetworkModel['sources'][number]>(snapshot.sources),
    loads: asTypedArray<EnergyNetworkModel['loads'][number]>(snapshot.loads),
    generators: asTypedArray<EnergyNetworkModel['generators'][number]>(snapshot.generators),
    substations: asTypedArray<EnergyNetworkModel['substations'][number]>(snapshot.substations),
    bays: asTypedArray<EnergyNetworkModel['bays'][number]>(snapshot.bays),
    junctions: asTypedArray<EnergyNetworkModel['junctions'][number]>(snapshot.junctions),
    branch_points: asTypedArray<NonNullable<EnergyNetworkModel['branch_points']>[number]>(snapshot.branch_points),
    corridors: asTypedArray<EnergyNetworkModel['corridors'][number]>(snapshot.corridors),
    measurements: asTypedArray<EnergyNetworkModel['measurements'][number]>(snapshot.measurements),
    protection_assignments: asTypedArray<
      EnergyNetworkModel['protection_assignments'][number]
    >(
      snapshot.protection_assignments,
    ),
    logical_views:
      snapshot.logical_views && typeof snapshot.logical_views === 'object' && !Array.isArray(snapshot.logical_views)
        ? (snapshot.logical_views as EnergyNetworkModel['logical_views'])
        : undefined,
  };
}

function pointsEqual(left: Position | null | undefined, right: Position | null | undefined): boolean {
  return Boolean(left) && Boolean(right) && left!.x === right!.x && left!.y === right!.y;
}

function edgeRouteToPath(route: EdgeRouteV1): Position[] {
  const path: Position[] = [];

  for (const segment of route.segments) {
    if (!pointsEqual(path[path.length - 1], segment.from)) {
      path.push({ x: segment.from.x, y: segment.from.y });
    }
    if (!pointsEqual(path[path.length - 1], segment.to)) {
      path.push({ x: segment.to.x, y: segment.to.y });
    }
  }

  if (path.length === 0) {
    path.push({ x: route.startPoint.x, y: route.startPoint.y });
    path.push({ x: route.endPoint.x, y: route.endPoint.y });
  }

  return path;
}

function toConnectionOverridePath(route: EdgeRouteV1): Position[] | undefined {
  const path = edgeRouteToPath(route);
  if (path.length <= 2) {
    return undefined;
  }
  return path.slice(1, -1);
}

function midpointFromPath(path: Position[]): Position {
  if (path.length === 0) {
    return { x: 0, y: 0 };
  }
  const start = path[0];
  const end = path[path.length - 1];
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
}

function buildCanonicalProjection(snapshot: SnapshotLike | null | undefined): EnmProjectionResult {
  if (!snapshot) {
    return {
      symbols: [],
      connections: [],
      canonicalAnnotations: EMPTY_CANONICAL_ANNOTATIONS,
    };
  }

  const enm = normalizeSnapshotToEnm(snapshot);
  const topology = readTopologyFromENM(enm, enm.header.hash_sha256);
  const adapter = buildVisualGraphFromTopology(topology);
  const layout = computeLayout(adapter.graph, undefined, adapter.stationBlockDetails);
  const baseSymbols = buildBaseSymbols(enm, { includeHelperBuses: true });
  const placementByNodeId = new Map(layout.nodePlacements.map((placement) => [placement.nodeId, placement] as const));
  const edgeRouteById = new Map(layout.edgeRoutes.map((route) => [route.edgeId, route] as const));
  const rawBusRecords = new Map(asRecords(snapshot.buses).map((bus) => [readString(bus, 'ref_id'), bus] as const));
  const rawBranchRecords = asRecords(snapshot.branches);
  const rawSourceRecords = asRecords(snapshot.sources);
  const rawTransformerRecords = asRecords(snapshot.transformers);

  const projectedSymbols = baseSymbols.map((symbol) => {
    if (
      symbol.elementType === 'Bus'
      || symbol.elementType === 'Source'
      || symbol.elementType === 'Load'
      || symbol.elementType === 'Generator'
    ) {
      const placement = placementByNodeId.get(symbol.id);
      if (!placement) {
        return symbol;
      }

      if (symbol.elementType === 'Bus') {
        const busRecord = rawBusRecords.get(symbol.id);
        return {
          ...symbol,
          position: placement.position,
          width:
            busRecord != null
              ? buildBusWidth(busRecord, rawBranchRecords, rawSourceRecords, rawTransformerRecords)
              : symbol.width,
          height: 8,
        } as ProjectedSymbol;
      }

      if (symbol.elementType === 'Source') {
        const connectedBusPlacement = placementByNodeId.get(symbol.connectedToNodeId);
        if (connectedBusPlacement) {
          return {
            ...symbol,
            position: {
              x: connectedBusPlacement.position.x,
              y: connectedBusPlacement.position.y - 140,
            },
          } as ProjectedSymbol;
        }
      }

      return {
        ...symbol,
        position: placement.position,
      } as ProjectedSymbol;
    }

    if (symbol.elementType === 'LineBranch' || symbol.elementType === 'TransformerBranch') {
      const route = edgeRouteById.get(`edge_${symbol.id}`);
      if (!route) {
        return symbol;
      }

      const path = edgeRouteToPath(route);
      return {
        ...symbol,
        position: midpointFromPath(path),
        points: path,
      } as ProjectedSymbol;
    }

    if (symbol.elementType === 'Switch') {
      const route = edgeRouteById.get(`edge_${symbol.id}`);
      if (!route) {
        return symbol;
      }

      return {
        ...symbol,
        position: midpointFromPath(edgeRouteToPath(route)),
      } as ProjectedSymbol;
    }

    return symbol;
  });

  const edgeBendOverrides: Record<string, Position[] | undefined> = {};
  for (const route of layout.edgeRoutes) {
    const override = toConnectionOverridePath(route);
    if (route.edgeId.startsWith('edge_src_')) {
      edgeBendOverrides[`${route.edgeId.slice('edge_src_'.length)}_conn`] = override;
      continue;
    }
    if (route.edgeId.startsWith('edge_load_')) {
      edgeBendOverrides[`${route.edgeId.slice('edge_load_'.length)}_conn`] = override;
      continue;
    }
    if (route.edgeId.startsWith('edge_')) {
      edgeBendOverrides[route.edgeId.slice('edge_'.length)] = override;
    }
  }

  return {
    symbols: projectedSymbols.filter((symbol) => !isHelperBusSymbol(symbol)),
    connections: generateConnections(projectedSymbols, {}, edgeBendOverrides),
    canonicalAnnotations: layout.canonicalAnnotations ?? EMPTY_CANONICAL_ANNOTATIONS,
  };
}

export function enmSnapshotToSldSymbols(snapshot: SnapshotLike | null | undefined): AnySldSymbol[] {
  return buildCanonicalProjection(snapshot).symbols;
}

export interface EnmProjectionResult {
  symbols: AnySldSymbol[];
  connections: Connection[];
  canonicalAnnotations: CanonicalAnnotationsV1 | null;
}

export function projectEnmSnapshotToSld(snapshot: SnapshotLike | null | undefined): EnmProjectionResult {
  return buildCanonicalProjection(snapshot);
}
