import type { TopologyInputV1 } from './topologyInputReader';
import type { StationBlockBuildResult } from './stationBlockBuilder';
import { FieldRoleV1, EmbeddingRoleV1 } from './fieldDeviceContracts';
import { StationKind, DeviceKind } from './topologyInputReader';

export type VisualPortSide = 'gora' | 'dol' | 'lewo' | 'prawo';
export interface VisualPortContract { readonly id: string; readonly side: VisualPortSide }

export type VisualTopologyClass = 'rozdzielczy' | 'sieciowy_glowny' | 'sieciowy_odgalezny' | 'sieciowy_wtorny' | 'stacyjny' | 'aparatowy';

export interface VisualBaseContract {
  readonly id: string;
  readonly kind: string;
  readonly role: string;
  readonly domainElementId: string;
  readonly topologyClass: VisualTopologyClass;
  readonly ports: readonly VisualPortContract[];
  readonly selectionElementId: string;
  readonly inspectorElementId: string;
}

export interface GpzVisual extends VisualBaseContract { readonly kind: 'gpz' }
export interface BusbarSnVisual extends VisualBaseContract { readonly kind: 'szyna_sn' }
export interface FieldSnVisual extends VisualBaseContract { readonly kind: 'pole_sn'; readonly stationId: string; readonly fieldRole: FieldRoleV1 }
export interface TrunkSegmentVisual extends VisualBaseContract { readonly kind: 'segment_magistrali' }
export interface BranchSegmentVisual extends VisualBaseContract { readonly kind: 'segment_odgalezienia' }
export interface BranchJunctionVisual extends VisualBaseContract { readonly kind: 'punkt_rozgalezienia'; readonly nodeId: string }
export interface StationVisual extends VisualBaseContract { readonly kind: 'stacja_sn_nn'; readonly stationRole: 'koncowa' | 'przelotowa' | 'odgalezna' | 'sekcyjna' }
export interface RingConnectorVisual extends VisualBaseContract { readonly kind: 'lacze_pierscieniowe' }
export interface NopVisual extends VisualBaseContract { readonly kind: 'punkt_normalnie_otwarty'; readonly segmentId: string }

/** Rozdzielnia wejściowa SN — GPZ switchgear room. */
export interface RozdzielniaSnVisual extends VisualBaseContract { readonly kind: 'rozdzielnia_sn'; readonly gpzId: string }

/** Pole zasilające — infeed field from WN transformer. */
export interface PoleZasilajaceVisual extends VisualBaseContract { readonly kind: 'pole_zasilajace'; readonly stationId: string }

/** Pole magistralowe — trunk line field. */
export interface PoleMagistraloweVisual extends VisualBaseContract { readonly kind: 'pole_magistralowe'; readonly stationId: string }

/** Pole transformatorowe — transformer field SN/nN. */
export interface PoleTransformatoweVisual extends VisualBaseContract { readonly kind: 'pole_transformatorowe'; readonly stationId: string; readonly transformerId: string }

/** Pole sekcyjne — sectional field (coupler/section switch). */
export interface PoleSekcyjneVisual extends VisualBaseContract { readonly kind: 'pole_sekcyjne'; readonly stationId: string }

/** Pole pomiarowe — measurement field (CT/VT). */
export interface PolePomiaroweVisual extends VisualBaseContract { readonly kind: 'pole_pomiarowe'; readonly stationId: string }

/** Segment sieci wtórny — secondary network segment (not trunk, not branch). */
export interface SecondarySegmentVisual extends VisualBaseContract { readonly kind: 'segment_wtorny' }

/** Węzeł liniowy — network junction node without station. */
export interface WezelLiniowyVisual extends VisualBaseContract { readonly kind: 'wezel_liniowy'; readonly nodeId: string }

export interface VisualTopologyContractV1 {
  readonly gpz: readonly GpzVisual[];
  readonly rozdzielnieSn: readonly RozdzielniaSnVisual[];
  readonly busbarsSn: readonly BusbarSnVisual[];
  readonly fieldsSn: readonly FieldSnVisual[];
  readonly polaZasilajace: readonly PoleZasilajaceVisual[];
  readonly polaMagistralowe: readonly PoleMagistraloweVisual[];
  readonly polaTransformatorowe: readonly PoleTransformatoweVisual[];
  readonly polaSekcyjne: readonly PoleSekcyjneVisual[];
  readonly polaPomiarowe: readonly PolePomiaroweVisual[];
  readonly trunkSegments: readonly TrunkSegmentVisual[];
  readonly branchSegments: readonly BranchSegmentVisual[];
  readonly secondarySegments: readonly SecondarySegmentVisual[];
  readonly branchJunctions: readonly BranchJunctionVisual[];
  readonly wezlyLiniowe: readonly WezelLiniowyVisual[];
  readonly stations: readonly StationVisual[];
  readonly ringConnectors: readonly RingConnectorVisual[];
  readonly nops: readonly NopVisual[];
}

interface SegmentationEdgeSets {
  readonly trunkEdgeIds: ReadonlySet<string>;
  readonly branchEdgeIds: ReadonlySet<string>;
  readonly secondaryEdgeIds: ReadonlySet<string>;
}

const p = (id: string, side: VisualPortSide): VisualPortContract => ({ id, side });
const portsLinearVertical = (): readonly VisualPortContract[] => [p('in', 'gora'), p('out', 'dol')];


function isNetworkSegmentKind(kind: TopologyInputV1['branches'][number]['kind']): boolean {
  return kind === 'LINE' || kind === 'CABLE';
}

function mapStationRole(role: EmbeddingRoleV1): StationVisual['stationRole'] {
  if (role === EmbeddingRoleV1.TRUNK_INLINE) return 'przelotowa';
  if (role === EmbeddingRoleV1.TRUNK_BRANCH) return 'odgalezna';
  if (role === EmbeddingRoleV1.LOCAL_SECTIONAL) return 'sekcyjna';
  return 'koncowa';
}

export function buildVisualTopologyContract(
  input: TopologyInputV1,
  segmentation: SegmentationEdgeSets,
  stationBlockDetails: StationBlockBuildResult,
): VisualTopologyContractV1 {
  const gpz: GpzVisual[] = input.sources.map((source): GpzVisual => ({
    id: `gpz_${source.id}`,
    kind: 'gpz',
    role: 'zrodlo_systemowe',
    domainElementId: source.id,
    topologyClass: 'rozdzielczy',
    ports: [p('wyjscie_sn', 'dol')],
    selectionElementId: source.id,
    inspectorElementId: source.id,
  })).sort((a, b) => a.id.localeCompare(b.id));

  const busbarsSn: BusbarSnVisual[] = input.connectionNodes
    .filter((node) => node.voltageKv !== null && node.voltageKv >= 6)
    .map((node): BusbarSnVisual => ({
      id: `szyna_sn_${node.id}`,
      kind: 'szyna_sn',
      role: 'szyna_rozdzielcza_sn',
      domainElementId: node.id,
      topologyClass: 'rozdzielczy',
      ports: [p('lewo', 'lewo'), p('prawo', 'prawo')],
      selectionElementId: node.id,
      inspectorElementId: node.id,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const fieldsSn: FieldSnVisual[] = stationBlockDetails.allFields
    .filter((field) => !field.fieldRole.includes('_NN'))
    .map((field): FieldSnVisual => ({
      id: `pole_sn_${field.id}`,
      kind: 'pole_sn',
      role: `pole_${field.fieldRole.toLowerCase()}`,
      domainElementId: field.id,
      stationId: field.stationId,
      fieldRole: field.fieldRole,
      topologyClass: 'rozdzielczy',
      ports: portsLinearVertical(),
      selectionElementId: field.stationId,
      inspectorElementId: field.stationId,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const trunkSegments: TrunkSegmentVisual[] = input.branches
    .filter((branch) => segmentation.trunkEdgeIds.has(branch.id) && isNetworkSegmentKind(branch.kind))
    .map((branch): TrunkSegmentVisual => ({
      id: `trunk_${branch.id}`,
      kind: 'segment_magistrali',
      role: 'tok_glowny_sn',
      domainElementId: branch.id,
      topologyClass: 'sieciowy_glowny',
      ports: portsLinearVertical(),
      selectionElementId: branch.id,
      inspectorElementId: branch.id,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const branchSegments: BranchSegmentVisual[] = input.branches
    .filter((branch) => segmentation.branchEdgeIds.has(branch.id) && isNetworkSegmentKind(branch.kind))
    .map((branch): BranchSegmentVisual => ({
      id: `branch_${branch.id}`,
      kind: 'segment_odgalezienia',
      role: 'odgalezienie_sn',
      domainElementId: branch.id,
      topologyClass: 'sieciowy_odgalezny',
      ports: [p('start', 'lewo'), p('end', 'dol')],
      selectionElementId: branch.id,
      inspectorElementId: branch.id,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const stationById = new Map(stationBlockDetails.stationBlocks.map((block) => [block.blockId, block] as const));
  const stations: StationVisual[] = input.stations
    .map((station): StationVisual => {
      const block = stationById.get(station.id);
      const embedding = block?.embeddingRole ?? EmbeddingRoleV1.TRUNK_LEAF;
      return {
        id: `stacja_${station.id}`,
        kind: 'stacja_sn_nn',
        role: `stacja_${mapStationRole(embedding)}`,
        stationRole: mapStationRole(embedding),
        domainElementId: station.id,
        topologyClass: 'stacyjny',
        ports: [
          p('wejscie_sn', 'gora'),
          ...(embedding === EmbeddingRoleV1.TRUNK_LEAF ? [] : [p('wyjscie_sn', 'dol')]),
          ...(embedding === EmbeddingRoleV1.TRUNK_BRANCH ? [p('port_odgalezienia', 'prawo')] : []),
        ],
        selectionElementId: station.id,
        inspectorElementId: station.id,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const ringIds = new Set((input.logicalViews?.rings ?? []).flatMap((ring) => ring.segmentIds));
  const secondaryBranches = input.branches
    .filter((branch) => segmentation.secondaryEdgeIds.has(branch.id) && isNetworkSegmentKind(branch.kind));
  const ringConnectors: RingConnectorVisual[] = secondaryBranches
    .map((branch): RingConnectorVisual => ({
      id: `ring_${branch.id}`,
      kind: 'lacze_pierscieniowe',
      role: ringIds.has(branch.id) ? 'lacze_wtorne_ring' : 'lacze_wtorne_rezerwowe',
      domainElementId: branch.id,
      topologyClass: 'sieciowy_wtorny',
      ports: [p('a', 'lewo'), p('b', 'prawo')],
      selectionElementId: branch.id,
      inspectorElementId: branch.id,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const nops: NopVisual[] = input.branches
    .filter((branch) => branch.isNormallyOpen && isNetworkSegmentKind(branch.kind))
    .map((branch): NopVisual => ({
      id: `nop_${branch.id}`,
      kind: 'punkt_normalnie_otwarty',
      role: 'nop_eksploatacyjny',
      segmentId: branch.id,
      domainElementId: branch.id,
      topologyClass: 'sieciowy_wtorny',
      ports: [p('a', 'lewo'), p('b', 'prawo')],
      selectionElementId: branch.id,
      inspectorElementId: branch.id,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const adjacency = new Map<string, { trunk: number; branch: number }>();
  for (const branch of input.branches) {
    if (!isNetworkSegmentKind(branch.kind)) continue;
    const entryFrom = adjacency.get(branch.fromNodeId) ?? { trunk: 0, branch: 0 };
    const entryTo = adjacency.get(branch.toNodeId) ?? { trunk: 0, branch: 0 };
    if (segmentation.trunkEdgeIds.has(branch.id)) {
      entryFrom.trunk += 1;
      entryTo.trunk += 1;
    }
    if (segmentation.branchEdgeIds.has(branch.id)) {
      entryFrom.branch += 1;
      entryTo.branch += 1;
    }
    adjacency.set(branch.fromNodeId, entryFrom);
    adjacency.set(branch.toNodeId, entryTo);
  }

  const branchJunctions: BranchJunctionVisual[] = [...adjacency.entries()]
    .filter(([, count]) => count.trunk >= 1 && count.branch >= 1)
    .map(([nodeId]): BranchJunctionVisual => ({
      id: `rozdziel_${nodeId}`,
      kind: 'punkt_rozgalezienia',
      role: 'wezlowy_rozdzial_sn',
      nodeId,
      domainElementId: nodeId,
      topologyClass: 'sieciowy_odgalezny',
      ports: [p('in', 'gora'), p('trunk_out', 'dol'), p('branch_out', 'prawo')],
      selectionElementId: nodeId,
      inspectorElementId: nodeId,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // --- RozdzielnieSn: GPZ / MAIN_SUBSTATION stations ---
  const gpzStations = input.stations.filter((s) => s.stationType === StationKind.MAIN_SUBSTATION);
  const gpzStationIds = new Set(gpzStations.map((s) => s.id));

  const rozdzielnieSn: RozdzielniaSnVisual[] = gpzStations
    .map((station): RozdzielniaSnVisual => ({
      id: `rozdzielnia_sn_${station.id}`,
      kind: 'rozdzielnia_sn',
      role: 'rozdzielnia_wejsciowa_sn',
      gpzId: station.id,
      domainElementId: station.id,
      topologyClass: 'rozdzielczy',
      ports: [p('wejscie_wn', 'gora'), p('wyjscie_sn', 'dol')],
      selectionElementId: station.id,
      inspectorElementId: station.id,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // --- PolaZasilajace: GPZ line bays in MAIN_SUBSTATION stations ---
  const snFields = stationBlockDetails.allFields.filter((f) => !f.fieldRole.includes('_NN'));

  const polaZasilajace: PoleZasilajaceVisual[] = snFields
    .filter((field) =>
      (field.fieldRole === FieldRoleV1.GPZ_LINE_BAY || field.fieldRole === FieldRoleV1.LINE_IN)
      && gpzStationIds.has(field.stationId),
    )
    .map((field): PoleZasilajaceVisual => ({
      id: `pole_zasilajace_${field.id}`,
      kind: 'pole_zasilajace',
      role: 'pole_zasilajace_wn',
      stationId: field.stationId,
      domainElementId: field.id,
      topologyClass: 'rozdzielczy',
      ports: portsLinearVertical(),
      selectionElementId: field.stationId,
      inspectorElementId: field.stationId,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // --- PolaMagistralowe: LINE_OUT fields connected to trunk segments ---
  const trunkEdgeNodeIds = new Set<string>();
  for (const branch of input.branches) {
    if (segmentation.trunkEdgeIds.has(branch.id) && isNetworkSegmentKind(branch.kind)) {
      trunkEdgeNodeIds.add(branch.fromNodeId);
      trunkEdgeNodeIds.add(branch.toNodeId);
    }
  }

  const polaMagistralowe: PoleMagistraloweVisual[] = snFields
    .filter((field) => {
      if (field.fieldRole !== FieldRoleV1.LINE_OUT) return false;
      // Check if any terminal of this field connects to a trunk node
      const outNode = field.terminals.outgoingNodeId;
      return outNode !== null && trunkEdgeNodeIds.has(outNode);
    })
    .map((field): PoleMagistraloweVisual => ({
      id: `pole_magistralowe_${field.id}`,
      kind: 'pole_magistralowe',
      role: 'pole_magistralowe_sn',
      stationId: field.stationId,
      domainElementId: field.id,
      topologyClass: 'rozdzielczy',
      ports: portsLinearVertical(),
      selectionElementId: field.stationId,
      inspectorElementId: field.stationId,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // --- PolaTransformatorowe: TRANSFORMER_SN_NN fields ---
  // Build field→transformer lookup from station transformer IDs
  const fieldToTransformerMap = new Map<string, string>();
  for (const station of input.stations) {
    const block = stationById.get(station.id);
    if (!block) continue;
    const trFields = block.fields.filter((f) => f.fieldRole === FieldRoleV1.TRANSFORMER_SN_NN);
    // Pair transformer fields with station transformerIds in order
    for (let i = 0; i < trFields.length; i++) {
      const trId = station.transformerIds[i] ?? '';
      fieldToTransformerMap.set(trFields[i].id, trId);
    }
  }

  const polaTransformatorowe: PoleTransformatoweVisual[] = snFields
    .filter((field) => field.fieldRole === FieldRoleV1.TRANSFORMER_SN_NN)
    .map((field): PoleTransformatoweVisual => ({
      id: `pole_transformatorowe_${field.id}`,
      kind: 'pole_transformatorowe',
      role: 'pole_transformatorowe_sn_nn',
      stationId: field.stationId,
      transformerId: fieldToTransformerMap.get(field.id) ?? '',
      domainElementId: field.id,
      topologyClass: 'rozdzielczy',
      ports: portsLinearVertical(),
      selectionElementId: field.stationId,
      inspectorElementId: field.stationId,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // --- PolaSekcyjne: COUPLER_SN or BUS_TIE fields ---
  const polaSekcyjne: PoleSekcyjneVisual[] = snFields
    .filter((field) => field.fieldRole === FieldRoleV1.COUPLER_SN || field.fieldRole === FieldRoleV1.BUS_TIE)
    .map((field): PoleSekcyjneVisual => ({
      id: `pole_sekcyjne_${field.id}`,
      kind: 'pole_sekcyjne',
      role: 'pole_sekcyjne_sn',
      stationId: field.stationId,
      domainElementId: field.id,
      topologyClass: 'rozdzielczy',
      ports: portsLinearVertical(),
      selectionElementId: field.stationId,
      inspectorElementId: field.stationId,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // --- PolaPomiarowe: devices of kind CT or VT ---
  const polaPomiarowe: PolePomiaroweVisual[] = input.devices
    .filter((device) => device.kind === DeviceKind.CT || device.kind === DeviceKind.VT)
    .map((device): PolePomiaroweVisual => {
      // Resolve stationId from the device's node
      const node = input.connectionNodes.find((n) => n.id === device.nodeId);
      return {
        id: `pole_pomiarowe_${device.id}`,
        kind: 'pole_pomiarowe',
        role: device.kind === DeviceKind.CT ? 'pole_pomiarowe_ct' : 'pole_pomiarowe_vt',
        stationId: node?.stationId ?? '',
        domainElementId: device.id,
        topologyClass: 'aparatowy',
        ports: portsLinearVertical(),
        selectionElementId: device.id,
        inspectorElementId: device.id,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  // --- SecondarySegments: secondary edges NOT in ringIds and NOT normally-open ---
  const secondarySegments: SecondarySegmentVisual[] = input.branches
    .filter((branch) =>
      segmentation.secondaryEdgeIds.has(branch.id) &&
      isNetworkSegmentKind(branch.kind) &&
      !ringIds.has(branch.id) &&
      !branch.isNormallyOpen
    )
    .map((branch): SecondarySegmentVisual => ({
      id: `secondary_${branch.id}`,
      kind: 'segment_wtorny',
      role: 'segment_wtorny_sn',
      domainElementId: branch.id,
      topologyClass: 'sieciowy_wtorny',
      ports: [p('a', 'lewo'), p('b', 'prawo')],
      selectionElementId: branch.id,
      inspectorElementId: branch.id,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // --- WezlyLiniowe: connection nodes on trunk/branch but NOT in any station ---
  const trunkOrBranchNodeIds = new Set<string>();
  for (const branch of input.branches) {
    if (!isNetworkSegmentKind(branch.kind)) continue;
    if (segmentation.trunkEdgeIds.has(branch.id) || segmentation.branchEdgeIds.has(branch.id)) {
      trunkOrBranchNodeIds.add(branch.fromNodeId);
      trunkOrBranchNodeIds.add(branch.toNodeId);
    }
  }

  const wezlyLiniowe: WezelLiniowyVisual[] = input.connectionNodes
    .filter((node) => trunkOrBranchNodeIds.has(node.id) && node.stationId === null)
    .map((node): WezelLiniowyVisual => ({
      id: `wezel_liniowy_${node.id}`,
      kind: 'wezel_liniowy',
      role: 'wezel_liniowy_sn',
      nodeId: node.id,
      domainElementId: node.id,
      topologyClass: 'sieciowy_glowny',
      ports: portsLinearVertical(),
      selectionElementId: node.id,
      inspectorElementId: node.id,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    gpz,
    rozdzielnieSn,
    busbarsSn,
    fieldsSn,
    polaZasilajace,
    polaMagistralowe,
    polaTransformatorowe,
    polaSekcyjne,
    polaPomiarowe,
    trunkSegments,
    branchSegments,
    secondarySegments,
    branchJunctions,
    wezlyLiniowe,
    stations,
    ringConnectors,
    nops,
  };
}
