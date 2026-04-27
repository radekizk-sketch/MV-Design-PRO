/**
 * SldSemanticAdapter — builds SldSemanticModelV1 from AdapterResultV1.
 *
 * CANONICAL (BINDING):
 * - Takes existing AdapterResultV1 (graph + stationBlockDetails + extendedLogicalViews)
 * - Produces a single coherent SldSemanticModelV1
 * - Deterministic: same input → identical output
 * - No fabrication: missing data → diagnostic
 */

import type { AdapterResultV1, ExtendedLogicalViewsV1 } from './topologyAdapterV2';
import type { TopologyInputV1, TopologyBranchV1 } from './topologyInputReader';
import { BranchKind } from './topologyInputReader';
import { EmbeddingRoleV1, type FieldV1, type DeviceV1, FieldRoleV1 } from './fieldDeviceContracts';
import { EdgeTypeV1 } from './visualGraph';

import {
  type SldSemanticModelV1,
  type SldTrunkV1,
  type SldBranchPathV1,
  type SldInlineStationV1,
  type SldBranchStationV1,
  type SldSectionalStationV1,
  type SldTerminalStationV1,
  type SldReserveLinkV1,
  type SldBayV1,
  type SldDeviceV1,
  type SldSegmentV1,
  type SldStationRefV1,
  type SldBranchPointV1,
  type SldSemanticDiagnosticV1,
  StationKindSld,
  BayRoleSld,
  type BayRoleSld as BayRoleSldType,
} from './sldSemanticModel';

// =============================================================================
// MAIN BUILDER
// =============================================================================

/**
 * Builds SldSemanticModelV1 from TopologyInput and AdapterResult.
 *
 * DETERMINISM: sorted by id at every step.
 */
export function buildSldSemanticModel(
  input: TopologyInputV1,
  adapterResult: AdapterResultV1,
): SldSemanticModelV1 {
  const diagnostics: SldSemanticDiagnosticV1[] = [];
  const { stationBlockDetails, extendedLogicalViews } = adapterResult;

  // Build lookup maps
  const branchById = new Map<string, TopologyBranchV1>();
  for (const b of input.branches) {
    branchById.set(b.id, b);
  }

  const stationById = new Map<string, typeof input.stations[number]>();
  for (const s of input.stations) {
    stationById.set(s.id, s);
  }

  const blockByStation = new Map<string, (typeof stationBlockDetails.stationBlocks)[number]>();
  for (const block of stationBlockDetails.stationBlocks) {
    blockByStation.set(block.blockId, block);
  }

  // Build trunk segments
  const trunks = buildTrunks(input, extendedLogicalViews, branchById, blockByStation);

  // Build branch paths (pass trunks for parentTrunkId resolution)
  const branchPaths = buildBranchPaths(input, extendedLogicalViews, branchById, trunks);

  // Classify stations
  const inlineStations: SldInlineStationV1[] = [];
  const branchStations: SldBranchStationV1[] = [];
  const sectionalStations: SldSectionalStationV1[] = [];
  const terminalStations: SldTerminalStationV1[] = [];

  for (const block of [...stationBlockDetails.stationBlocks].sort((a, b) => a.blockId.localeCompare(b.blockId))) {
    const station = stationById.get(block.blockId);
    if (!station) continue;

    const bays = buildBaysFromFields(block.fields, stationBlockDetails.allDevices);

    switch (block.embeddingRole) {
      case EmbeddingRoleV1.TRUNK_INLINE: {
        const trunkInfo = findTrunkForStation(block.blockId, trunks);
        const inBay = bays.find(b => b.bayRole === BayRoleSld.LINE_IN) ?? null;
        const outBay = bays.find(b => b.bayRole === BayRoleSld.LINE_OUT) ?? null;

        if (!inBay || !outBay) {
          diagnostics.push({
            code: 'semantic.inline_station_missing_bay',
            message: `Stacja przelotowa '${station.name}' (${station.id}): brak pola IN lub OUT`,
            stationId: station.id,
            severity: 'WARNING',
          });
        }

        inlineStations.push({
          id: station.id,
          name: station.name,
          stationKind: StationKindSld.INLINE,
          embeddingRole: block.embeddingRole,
          trunkId: trunkInfo?.trunkId ?? '',
          incomingSegmentId: trunkInfo?.incomingSegmentId ?? '',
          outgoingSegmentId: trunkInfo?.outgoingSegmentId ?? '',
          incomingBay: inBay ?? makePlaceholderBay(station.id, BayRoleSld.LINE_IN),
          outgoingBay: outBay ?? makePlaceholderBay(station.id, BayRoleSld.LINE_OUT),
          transformerBays: bays.filter(b => b.bayRole === BayRoleSld.TRANSFORMER),
          branchBays: bays.filter(b => b.bayRole === BayRoleSld.BRANCH),
          generatorBays: bays.filter(b =>
            b.bayRole === BayRoleSld.PV ||
            b.bayRole === BayRoleSld.BESS ||
            b.bayRole === BayRoleSld.WIND
          ),
        });
        break;
      }

      case EmbeddingRoleV1.TRUNK_LEAF: {
        const inBay = bays.find(b => b.bayRole === BayRoleSld.LINE_IN) ?? null;
        terminalStations.push({
          id: station.id,
          name: station.name,
          stationKind: StationKindSld.TERMINAL,
          embeddingRole: block.embeddingRole,
          incomingBay: inBay,
          transformerBays: bays.filter(b => b.bayRole === BayRoleSld.TRANSFORMER),
          generatorBays: bays.filter(b =>
            b.bayRole === BayRoleSld.PV ||
            b.bayRole === BayRoleSld.BESS ||
            b.bayRole === BayRoleSld.WIND
          ),
        });
        break;
      }

      case EmbeddingRoleV1.TRUNK_BRANCH: {
        const inBay = bays.find(b => b.bayRole === BayRoleSld.LINE_IN) ?? null;
        const outBay = bays.find(b => b.bayRole === BayRoleSld.LINE_OUT) ?? null;
        branchStations.push({
          id: station.id,
          name: station.name,
          stationKind: StationKindSld.BRANCH,
          embeddingRole: block.embeddingRole,
          branchPathId: findBranchPathForStation(station.id, branchPaths),
          incomingBay: inBay,
          outgoingBay: outBay,
          transformerBays: bays.filter(b => b.bayRole === BayRoleSld.TRANSFORMER),
          generatorBays: bays.filter(b =>
            b.bayRole === BayRoleSld.PV ||
            b.bayRole === BayRoleSld.BESS ||
            b.bayRole === BayRoleSld.WIND
          ),
        });
        break;
      }

      case EmbeddingRoleV1.LOCAL_SECTIONAL: {
        const sortedBusIds = [...station.busIds].sort();
        const tieBay = bays.find(b => b.bayRole === BayRoleSld.COUPLER) ?? null;

        // Find NOP among incident branches
        const nopBranch = input.branches.find(b =>
          b.isNormallyOpen &&
          (station.busIds.includes(b.fromNodeId) || station.busIds.includes(b.toNodeId))
        );

        sectionalStations.push({
          id: station.id,
          name: station.name,
          stationKind: StationKindSld.SECTIONAL,
          embeddingRole: block.embeddingRole,
          sectionABusId: sortedBusIds[0] ?? station.id,
          sectionBBusId: sortedBusIds[1] ?? station.id,
          tieBay,
          normallyOpenPointId: nopBranch?.id ?? null,
          incomingBays: bays.filter(b => b.bayRole === BayRoleSld.LINE_IN),
          outgoingBays: bays.filter(b => b.bayRole === BayRoleSld.LINE_OUT),
          transformerBays: bays.filter(b => b.bayRole === BayRoleSld.TRANSFORMER),
        });
        break;
      }
    }
  }

  // Build reserve links
  const reserveLinks = buildReserveLinks(input, adapterResult);

  // Merge adapter fixActions into diagnostics
  for (const fa of adapterResult.fixActions) {
    diagnostics.push({
      code: fa.code,
      message: fa.message,
      stationId: fa.elementRef ?? null,
      severity: 'WARNING',
    });
  }

  return {
    version: 'V1',
    snapshotId: input.snapshotId,
    snapshotFingerprint: input.snapshotFingerprint,
    trunks: trunks.sort((a, b) => a.id.localeCompare(b.id)),
    branchPaths: branchPaths.sort((a, b) => a.id.localeCompare(b.id)),
    inlineStations: inlineStations.sort((a, b) => a.id.localeCompare(b.id)),
    branchStations: branchStations.sort((a, b) => a.id.localeCompare(b.id)),
    sectionalStations: sectionalStations.sort((a, b) => a.id.localeCompare(b.id)),
    terminalStations: terminalStations.sort((a, b) => a.id.localeCompare(b.id)),
    reserveLinks: reserveLinks.sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: diagnostics.sort((a, b) => a.code.localeCompare(b.code)),
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function buildTrunks(
  _input: TopologyInputV1,
  logicalViews: ExtendedLogicalViewsV1,
  branchById: ReadonlyMap<string, TopologyBranchV1>,
  _blockByStation: ReadonlyMap<string, { blockId: string; embeddingRole: EmbeddingRoleV1 }>,
): SldTrunkV1[] {
  return logicalViews.trunks.map(trunk => {
    const orderedSegments: SldSegmentV1[] = trunk.segmentIds.map(segId => {
      const branch = branchById.get(segId);
      return {
        segmentId: segId,
        fromNodeId: branch?.fromNodeId ?? '',
        toNodeId: branch?.toNodeId ?? '',
        branchType: branch?.kind === BranchKind.LINE ? 'LINE' as const
          : branch?.kind === BranchKind.CABLE ? 'CABLE' as const
          : null,
        lengthKm: branch?.lengthKm ?? null,
        label: branch?.name ?? segId,
      };
    });

    const orderedStationRefs: SldStationRefV1[] = (trunk.orderedStations ?? []).map((s, idx) => ({
      stationId: s.stationId,
      stationKind: mapRoleToKind(s.role),
      positionOnTrunk: idx,
    }));

    // Branch points: stations with attachedBranchIds
    const branchPoints: SldBranchPointV1[] = [];
    for (const s of trunk.orderedStations ?? []) {
      if (s.attachedBranchIds.length > 0) {
        branchPoints.push({
          nodeId: s.stationId,
          positionOnTrunk: orderedStationRefs.findIndex(r => r.stationId === s.stationId),
          branchPathIds: [...s.attachedBranchIds],
        });
      }
    }

    // Source node: first segment's from node
    const firstSeg = orderedSegments[0];
    const sourceNodeId = firstSeg?.fromNodeId ?? '';

    return {
      id: trunk.id,
      sourceFieldId: null,
      sourceNodeId,
      orderedSegments,
      orderedStationRefs,
      branchPoints,
    };
  });
}

function buildBranchPaths(
  _input: TopologyInputV1,
  logicalViews: ExtendedLogicalViewsV1,
  branchById: ReadonlyMap<string, TopologyBranchV1>,
  trunks: readonly SldTrunkV1[],
): SldBranchPathV1[] {
  // Build junction→trunk lookup: for each trunk, collect all node IDs from segments
  const junctionToTrunk = new Map<string, string>();
  for (const trunk of trunks) {
    for (const seg of trunk.orderedSegments) {
      if (seg.fromNodeId) junctionToTrunk.set(seg.fromNodeId, trunk.id);
      if (seg.toNodeId) junctionToTrunk.set(seg.toNodeId, trunk.id);
    }
    for (const ref of trunk.orderedStationRefs) {
      junctionToTrunk.set(ref.stationId, trunk.id);
    }
  }

  return logicalViews.branches.map(branch => {
    const orderedSegments: SldSegmentV1[] = branch.segmentIds.map(segId => {
      const b = branchById.get(segId);
      return {
        segmentId: segId,
        fromNodeId: b?.fromNodeId ?? '',
        toNodeId: b?.toNodeId ?? '',
        branchType: b?.kind === BranchKind.LINE ? 'LINE' as const
          : b?.kind === BranchKind.CABLE ? 'CABLE' as const
          : null,
        lengthKm: b?.lengthKm ?? null,
        label: b?.name ?? segId,
      };
    });

    // Derive parentTrunkId from junction node → trunk mapping
    const junctionId = branch.junctionNodeId ?? null;
    const parentTrunkId = junctionId ? (junctionToTrunk.get(junctionId) ?? null) : null;

    return {
      id: branch.id,
      junctionNodeId: junctionId,
      parentTrunkId,
      orderedSegments,
      orderedStationIds: branch.orderedStationIds ?? [],
    };
  });
}

function buildReserveLinks(
  input: TopologyInputV1,
  adapterResult: AdapterResultV1,
): SldReserveLinkV1[] {
  const secondaryEdges = adapterResult.graph.edges.filter(
    e => e.edgeType === EdgeTypeV1.SECONDARY_CONNECTOR
  );

  return secondaryEdges.map(edge => {
    const branch = input.branches.find(b => `edge_${b.id}` === edge.id);
    return {
      id: edge.id,
      fromNodeId: edge.fromPortRef.nodeId,
      toNodeId: edge.toPortRef.nodeId,
      isNormallyOpen: edge.isNormallyOpen,
      label: edge.attributes.label,
      branchType: branch?.kind === BranchKind.LINE ? 'LINE' as const
        : branch?.kind === BranchKind.CABLE ? 'CABLE' as const
        : null,
      lengthKm: branch?.lengthKm ?? null,
    };
  });
}

function buildBaysFromFields(
  fields: readonly FieldV1[],
  allDevices: readonly DeviceV1[],
): SldBayV1[] {
  return [...fields]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(field => {
      const fieldDevices = allDevices
        .filter(d => d.fieldId === field.id)
        .sort((a, b) => a.id.localeCompare(b.id));

      const sldDevices: SldDeviceV1[] = fieldDevices.map(d => ({
        id: d.id,
        deviceType: d.deviceType,
        state: null,
        label: d.id,
        catalogRef: d.catalogRef?.catalogId ?? null,
      }));

      return {
        id: field.id,
        bayRole: mapFieldRoleToBayRole(field.fieldRole),
        busSectionId: field.busSectionId,
        devices: sldDevices,
        connectedBranchId: field.terminals.incomingNodeId ?? field.terminals.outgoingNodeId ?? null,
        connectedGeneratorId: field.terminals.generatorNodeId ?? null,
        label: field.id,
      };
    });
}

function mapFieldRoleToBayRole(fieldRole: FieldRoleV1): BayRoleSldType {
  switch (fieldRole) {
    case FieldRoleV1.GPZ_LINE_BAY: return BayRoleSld.LINE_OUT;
    case FieldRoleV1.LINE_IN: return BayRoleSld.LINE_IN;
    case FieldRoleV1.LINE_OUT: return BayRoleSld.LINE_OUT;
    case FieldRoleV1.LINE_BRANCH: return BayRoleSld.BRANCH;
    case FieldRoleV1.TRANSFORMER_SN_NN: return BayRoleSld.TRANSFORMER;
    case FieldRoleV1.COUPLER_SN: return BayRoleSld.COUPLER;
    case FieldRoleV1.PV_SN: return BayRoleSld.PV;
    case FieldRoleV1.BESS_SN: return BayRoleSld.BESS;
    default: return BayRoleSld.LINE_IN;
  }
}

function mapRoleToKind(
  role: 'przelotowa' | 'odgalezna' | 'sekcyjna' | 'koncowa',
): StationKindSld {
  switch (role) {
    case 'przelotowa': return StationKindSld.INLINE;
    case 'odgalezna': return StationKindSld.BRANCH;
    case 'sekcyjna': return StationKindSld.SECTIONAL;
    case 'koncowa': return StationKindSld.TERMINAL;
  }
}

function findTrunkForStation(
  stationId: string,
  trunks: readonly SldTrunkV1[],
): { trunkId: string; incomingSegmentId: string; outgoingSegmentId: string } | null {
  for (const trunk of trunks) {
    const idx = trunk.orderedStationRefs.findIndex(r => r.stationId === stationId);
    if (idx >= 0) {
      const pos = trunk.orderedStationRefs[idx].positionOnTrunk;
      return {
        trunkId: trunk.id,
        incomingSegmentId: trunk.orderedSegments[pos]?.segmentId ?? '',
        outgoingSegmentId: trunk.orderedSegments[pos + 1]?.segmentId ?? trunk.orderedSegments[pos]?.segmentId ?? '',
      };
    }
  }
  return null;
}

function findBranchPathForStation(
  stationId: string,
  branchPaths: readonly SldBranchPathV1[],
): string | null {
  for (const bp of branchPaths) {
    if (bp.orderedStationIds.includes(stationId)) {
      return bp.id;
    }
  }
  return null;
}

function makePlaceholderBay(stationId: string, role: BayRoleSldType): SldBayV1 {
  return {
    id: `placeholder_${stationId}_${role}`,
    bayRole: role,
    busSectionId: stationId,
    devices: [],
    connectedBranchId: null,
    connectedGeneratorId: null,
    label: `[brak pola ${role}]`,
  };
}
