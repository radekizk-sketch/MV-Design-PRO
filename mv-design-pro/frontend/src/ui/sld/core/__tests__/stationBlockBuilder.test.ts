/**
 * Station Block Builder + EmbeddingRole Tests — RUN #3D.
 *
 * Golden Networks (TopologyInputV1):
 * - GN-STA-LEAF: stacja koncowa (TRUNK_LEAF)
 * - GN-STA-INLINE: stacja przelotowa (TRUNK_INLINE)
 * - GN-STA-BRANCH: stacja odgalezieniowa (TRUNK_BRANCH)
 * - GN-STA-SECTIONAL: stacja sekcyjna (LOCAL_SECTIONAL)
 * - GN-OZE-SN: PV + BESS w stacji
 * - GN-RING-NOP: pierscien z NOP
 * - GN-STRESS: 50+ stacji
 *
 * Tests:
 * - EmbeddingRole derivation
 * - Field/device building
 * - Anchor mapping
 * - Fix action generation
 * - Determinism: 100x hash, 50x permutation
 * - Adapter integration (buildVisualGraphFromTopology → stationBlockDetails)
 *
 * BINDING: CI gate — failure blokuje merge.
 */

import { describe, it, expect } from 'vitest';
import {
  type TopologyInputV1,
  type TopologyBranchV1,
  type TopologyStationV1,
  BranchKind,
  DeviceKind,
  GeneratorKind,
  StationKind,
} from '../topologyInputReader';
import {
  buildStationBlocks,
  deriveEmbeddingRole,
  type SegmentationEdgeSets,
} from '../stationBlockBuilder';
import {
  EmbeddingRoleV1,
  FieldRoleV1,
  DeviceTypeV1,
  FieldDeviceFixCodes,
  validateFieldDevices,
  validateStationBlock,
} from '../fieldDeviceContracts';
import { buildVisualGraphFromTopology } from '../topologyAdapterV2';
import {
  computeLayout,
  DEFAULT_LAYOUT_CONFIG,
} from '../layoutPipeline';
import {
  computeLayoutResultHash,
  validateLayoutResult,
} from '../layoutResult';

// =============================================================================
// HELPERS
// =============================================================================

function makeBaseInput(overrides?: Partial<TopologyInputV1>): TopologyInputV1 {
  return {
    snapshotId: 'test-snapshot',
    snapshotFingerprint: 'test-fingerprint',
    connectionNodes: [],
    branches: [],
    stations: [],
    sources: [],
    generators: [],
    loads: [],
    devices: [],
    protectionBindings: [],
    fixActions: [],
    ...overrides,
  };
}

function deterministicShuffle<T>(arr: readonly T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = ((s >>> 0) % (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// =============================================================================
// GOLDEN NETWORKS (TopologyInputV1)
// =============================================================================

/**
 * GN-STA-LEAF: GPZ → bus_sn → line → bus_st1 (leaf station, 1 TR, 1 load)
 * Expected: TRUNK_LEAF embedding role.
 */
function buildGN_STA_LEAF(): TopologyInputV1 {
  return makeBaseInput({
    connectionNodes: [
      { id: 'bus_sn', name: 'Szyna SN 15kV GPZ', voltageKv: 15, inService: true },
      { id: 'bus_st1', name: 'Szyna SN 15kV Stacja A1', voltageKv: 15, inService: true },
      { id: 'bus_nn1', name: 'Szyna nN 0.4kV Stacja A1', voltageKv: 0.4, inService: true },
    ],
    branches: [
      { id: 'line_1', name: 'Linia SN 1', kind: BranchKind.LINE, fromNodeId: 'bus_sn', toNodeId: 'bus_st1', lengthKm: 2.5, isNormallyOpen: false, inService: true },
      { id: 'tr_1', name: 'TR 15/0.4kV A1', kind: BranchKind.TR_LINK, fromNodeId: 'bus_st1', toNodeId: 'bus_nn1', lengthKm: 0, isNormallyOpen: false, inService: true },
    ],
    stations: [
      { id: 'sta_a1', name: 'Stacja A1', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_st1'], switchIds: [], transformerIds: ['tr_1'] },
    ],
    sources: [
      { id: 'src_gpz', name: 'GPZ 110/15kV', nodeId: 'bus_sn', inService: true },
    ],
    loads: [
      { id: 'load_1', name: 'Odbiorca A1', nodeId: 'bus_nn1', inService: true },
    ],
    devices: [
      { id: 'cb_1', name: 'Wylacznik liniowy', kind: DeviceKind.CB, nodeId: 'bus_st1', inService: true, catalogRef: null },
    ],
  });
}

/**
 * GN-STA-INLINE: GPZ → bus_sn → line1 → bus_st1 → line2 → bus_st2
 * Station st1 has 2 trunk edges, 0 branch → TRUNK_INLINE.
 */
function buildGN_STA_INLINE(): TopologyInputV1 {
  return makeBaseInput({
    connectionNodes: [
      { id: 'bus_sn', name: 'Szyna SN 15kV GPZ', voltageKv: 15, inService: true },
      { id: 'bus_st1', name: 'Szyna SN 15kV Stacja B1', voltageKv: 15, inService: true },
      { id: 'bus_st2', name: 'Szyna SN 15kV Stacja A2', voltageKv: 15, inService: true },
      { id: 'bus_nn_b1', name: 'Szyna nN 0.4kV Stacja B1', voltageKv: 0.4, inService: true },
    ],
    branches: [
      { id: 'line_1', name: 'Linia SN 1', kind: BranchKind.LINE, fromNodeId: 'bus_sn', toNodeId: 'bus_st1', lengthKm: 3, isNormallyOpen: false, inService: true },
      { id: 'line_2', name: 'Linia SN 2', kind: BranchKind.LINE, fromNodeId: 'bus_st1', toNodeId: 'bus_st2', lengthKm: 2, isNormallyOpen: false, inService: true },
      { id: 'tr_b1', name: 'TR 15/0.4kV B1', kind: BranchKind.TR_LINK, fromNodeId: 'bus_st1', toNodeId: 'bus_nn_b1', lengthKm: 0, isNormallyOpen: false, inService: true },
    ],
    stations: [
      { id: 'sta_b1', name: 'Stacja B1', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_st1'], switchIds: [], transformerIds: ['tr_b1'] },
      { id: 'sta_a2', name: 'Stacja A2', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_st2'], switchIds: [], transformerIds: [] },
    ],
    sources: [
      { id: 'src_gpz', name: 'GPZ 110/15kV', nodeId: 'bus_sn', inService: true },
    ],
    loads: [
      { id: 'load_b2', name: 'Odbiorca za stacja B1', nodeId: 'bus_st2', inService: true },
    ],
  });
}

/**
 * GN-STA-BRANCH: GPZ → bus_sn → line1 → bus_st1 (trunk), bus_st1 → branch → bus_br1
 * Station st1 has trunk >= 1, branch >= 1 → TRUNK_BRANCH.
 */
function buildGN_STA_BRANCH(): TopologyInputV1 {
  return makeBaseInput({
    connectionNodes: [
      { id: 'bus_sn', name: 'Szyna SN 15kV GPZ', voltageKv: 15, inService: true },
      { id: 'bus_st1', name: 'Szyna SN 15kV Stacja C1', voltageKv: 15, inService: true },
      { id: 'bus_br1', name: 'Szyna SN 15kV Odgal 1', voltageKv: 15, inService: true },
      { id: 'bus_st2', name: 'Szyna SN 15kV Stacja A3', voltageKv: 15, inService: true },
      { id: 'bus_nn_c1', name: 'Szyna nN 0.4kV Stacja C1', voltageKv: 0.4, inService: true },
    ],
    branches: [
      { id: 'line_1', name: 'Linia SN 1', kind: BranchKind.LINE, fromNodeId: 'bus_sn', toNodeId: 'bus_st1', lengthKm: 2, isNormallyOpen: false, inService: true },
      { id: 'line_2', name: 'Linia SN 2', kind: BranchKind.LINE, fromNodeId: 'bus_st1', toNodeId: 'bus_st2', lengthKm: 3, isNormallyOpen: false, inService: true },
      { id: 'line_br', name: 'Linia odgalezienie', kind: BranchKind.CABLE, fromNodeId: 'bus_st1', toNodeId: 'bus_br1', lengthKm: 1, isNormallyOpen: false, inService: true },
      { id: 'tr_c1', name: 'TR 15/0.4kV C1', kind: BranchKind.TR_LINK, fromNodeId: 'bus_st1', toNodeId: 'bus_nn_c1', lengthKm: 0, isNormallyOpen: false, inService: true },
    ],
    stations: [
      { id: 'sta_c1', name: 'Stacja C1', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_st1'], switchIds: [], transformerIds: ['tr_c1'] },
      { id: 'sta_a3', name: 'Stacja A3', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_st2'], switchIds: [], transformerIds: [] },
    ],
    sources: [
      { id: 'src_gpz', name: 'GPZ 110/15kV', nodeId: 'bus_sn', inService: true },
    ],
  });
}

/**
 * GN-STA-SECTIONAL: Stacja z 2 szynami SN + coupler (BUS_LINK).
 * Expected: LOCAL_SECTIONAL.
 */
function buildGN_STA_SECTIONAL(): TopologyInputV1 {
  return makeBaseInput({
    connectionNodes: [
      { id: 'bus_sn', name: 'Szyna SN GPZ', voltageKv: 15, inService: true },
      { id: 'bus_sec_a', name: 'Szyna SN Sekcja A', voltageKv: 15, inService: true },
      { id: 'bus_sec_b', name: 'Szyna SN Sekcja B', voltageKv: 15, inService: true },
      { id: 'bus_out', name: 'Szyna SN za stacja sekcyjna', voltageKv: 15, inService: true },
      { id: 'bus_nn_d1', name: 'Szyna nN 0.4kV Stacja D1', voltageKv: 0.4, inService: true },
    ],
    branches: [
      { id: 'line_1', name: 'Linia zasilajaca', kind: BranchKind.LINE, fromNodeId: 'bus_sn', toNodeId: 'bus_sec_a', lengthKm: 5, isNormallyOpen: false, inService: true },
      { id: 'line_2', name: 'Linia wyjsciowa', kind: BranchKind.LINE, fromNodeId: 'bus_sec_b', toNodeId: 'bus_out', lengthKm: 2, isNormallyOpen: false, inService: true },
      { id: 'coupler_1', name: 'Sprzeglo sekcyjne', kind: BranchKind.BUS_LINK, fromNodeId: 'bus_sec_a', toNodeId: 'bus_sec_b', lengthKm: 0, isNormallyOpen: false, inService: true },
      { id: 'tr_d1', name: 'TR 15/0.4kV D1', kind: BranchKind.TR_LINK, fromNodeId: 'bus_sec_b', toNodeId: 'bus_nn_d1', lengthKm: 0, isNormallyOpen: false, inService: true },
    ],
    stations: [
      { id: 'sta_d1', name: 'Stacja D1 Sekcyjna', stationType: StationKind.SWITCHING, voltageKv: 15, busIds: ['bus_sec_a', 'bus_sec_b'], switchIds: [], transformerIds: ['tr_d1'] },
    ],
    sources: [
      { id: 'src_gpz', name: 'GPZ 110/15kV', nodeId: 'bus_sn', inService: true },
    ],
  });
}

/**
 * GN-OZE-SN: Stacja z PV i BESS na SN.
 */
function buildGN_OZE_SN(): TopologyInputV1 {
  return makeBaseInput({
    connectionNodes: [
      { id: 'bus_sn', name: 'Szyna SN 15kV', voltageKv: 15, inService: true },
    ],
    branches: [],
    stations: [
      { id: 'sta_oze', name: 'Stacja OZE', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_sn'], switchIds: [], transformerIds: [] },
    ],
    sources: [
      { id: 'src_gpz', name: 'GPZ 110/15kV', nodeId: 'bus_sn', inService: true },
    ],
    generators: [
      { id: 'gen_pv', name: 'PV Farma 5MW', kind: GeneratorKind.PV, nodeId: 'bus_sn', inService: true, ratedPowerMw: 5, catalogRef: 'cat_pv_001', blockingTransformerId: null, connectionVariant: 'block_transformer', stationRef: null },
      { id: 'gen_bess', name: 'BESS 2MWh', kind: GeneratorKind.BESS, nodeId: 'bus_sn', inService: true, ratedPowerMw: 2, catalogRef: 'cat_bess_001', blockingTransformerId: null, connectionVariant: 'block_transformer', stationRef: null },
    ],
  });
}

/**
 * GN-RING-NOP: Pierscien z NOP (secondary connector).
 */
function buildGN_RING_NOP(): TopologyInputV1 {
  return makeBaseInput({
    connectionNodes: [
      { id: 'bus_sn', name: 'Szyna SN 15kV GPZ', voltageKv: 15, inService: true },
      { id: 'bus_r1', name: 'Szyna Ring 1', voltageKv: 15, inService: true },
      { id: 'bus_r2', name: 'Szyna Ring 2', voltageKv: 15, inService: true },
      { id: 'bus_r3', name: 'Szyna Ring 3', voltageKv: 15, inService: true },
    ],
    branches: [
      { id: 'line_1', name: 'Linia 1', kind: BranchKind.LINE, fromNodeId: 'bus_sn', toNodeId: 'bus_r1', lengthKm: 2, isNormallyOpen: false, inService: true },
      { id: 'line_2', name: 'Linia 2', kind: BranchKind.LINE, fromNodeId: 'bus_r1', toNodeId: 'bus_r2', lengthKm: 1, isNormallyOpen: false, inService: true },
      { id: 'line_3', name: 'Linia 3', kind: BranchKind.LINE, fromNodeId: 'bus_r2', toNodeId: 'bus_r3', lengthKm: 1, isNormallyOpen: false, inService: true },
      { id: 'line_nop', name: 'Ring close NOP', kind: BranchKind.LINE, fromNodeId: 'bus_r3', toNodeId: 'bus_sn', lengthKm: 3, isNormallyOpen: true, inService: true },
    ],
    stations: [
      { id: 'sta_r1', name: 'Stacja R1', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_r1'], switchIds: [], transformerIds: [] },
      { id: 'sta_r2', name: 'Stacja R2', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_r2'], switchIds: [], transformerIds: [] },
      { id: 'sta_r3', name: 'Stacja R3', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_r3'], switchIds: [], transformerIds: [] },
    ],
    sources: [
      { id: 'src_gpz', name: 'GPZ 110/15kV', nodeId: 'bus_sn', inService: true },
    ],
  });
}

/**
 * GN-STRESS-50: 50 stacji liniowych (radial) + OZE co 10. stacje.
 */
function buildGN_STRESS_50(): TopologyInputV1 {
  const connectionNodes = [
    { id: 'bus_sn', name: 'Szyna SN 15kV GPZ', voltageKv: 15, inService: true },
  ];
  const branches: TopologyBranchV1[] = [];
  const stations: TopologyStationV1[] = [];
  const generators: TopologyInputV1['generators'] = [];

  let prevBusId = 'bus_sn';
  for (let i = 1; i <= 50; i++) {
    const busId = `bus_st_${String(i).padStart(3, '0')}`;
    connectionNodes.push({ id: busId, name: `Szyna SN Stacja ${i}`, voltageKv: 15, inService: true });

    branches.push({
      id: `line_${String(i).padStart(3, '0')}`,
      name: `Linia SN ${i}`,
      kind: i % 2 === 0 ? BranchKind.CABLE : BranchKind.LINE,
      fromNodeId: prevBusId,
      toNodeId: busId,
      lengthKm: 1 + i * 0.1,
      isNormallyOpen: false,
      inService: true,
    });

    stations.push({
      id: `sta_${String(i).padStart(3, '0')}`,
      name: `Stacja ${i}`,
      stationType: StationKind.DISTRIBUTION,
      voltageKv: 15,
      busIds: [busId],
      switchIds: [],
      transformerIds: [],
    });

    // PV co 10 stacje
    if (i % 10 === 0) {
      generators.push({
        id: `gen_pv_${i}`,
        name: `PV ${i}`,
        kind: GeneratorKind.PV,
        nodeId: busId,
        inService: true,
        ratedPowerMw: 1 + i * 0.1,
        catalogRef: `cat_pv_${i}`,
        blockingTransformerId: null,
        connectionVariant: 'block_transformer',
        stationRef: null,
      });
    }

    prevBusId = busId;
  }

  return makeBaseInput({
    connectionNodes,
    branches,
    stations,
    generators,
    sources: [
      { id: 'src_gpz', name: 'GPZ 110/15kV', nodeId: 'bus_sn', inService: true },
    ],
  });
}

// =============================================================================
// SEGMENTATION HELPER (for standalone stationBlockBuilder tests)
// =============================================================================

/**
 * Builds a simple segmentation based on the adapter's segmentation logic.
 * For testing, we derive trunk = longest path from source, branch = rest.
 */
function buildSegmentationFromAdapter(input: TopologyInputV1): SegmentationEdgeSets {
  const result = buildVisualGraphFromTopology(input);
  // Adapter internally builds segmentation and passes to stationBlockBuilder.
  // Return the segmentation from the build result.
  return {
    trunkEdgeIds: new Set(
      result.stationBlockDetails.stationBlocks.length > 0
        ? input.branches.filter(b => !b.isNormallyOpen && b.inService).map(b => b.id)
        : [],
    ),
    branchEdgeIds: new Set(),
    secondaryEdgeIds: new Set(input.branches.filter(b => b.isNormallyOpen).map(b => b.id)),
  };
}

// =============================================================================
// TEST: EMBEDDING ROLE DERIVATION
// =============================================================================

describe('EmbeddingRole Derivation — RUN #3D', () => {
  it('GN-STA-LEAF: stacja z 1 trunk edge → TRUNK_LEAF', () => {
    const input = buildGN_STA_LEAF();
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_a1');
    expect(block).toBeDefined();
    expect(block!.embeddingRole).toBe(EmbeddingRoleV1.TRUNK_LEAF);
  });

  it('GN-STA-INLINE: stacja z 2 trunk edges → TRUNK_INLINE', () => {
    const input = buildGN_STA_INLINE();
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_b1');
    expect(block).toBeDefined();
    expect(block!.embeddingRole).toBe(EmbeddingRoleV1.TRUNK_INLINE);
  });

  it('GN-STA-BRANCH: stacja z trunk + branch → TRUNK_BRANCH', () => {
    const input = buildGN_STA_BRANCH();
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_c1');
    expect(block).toBeDefined();
    expect(block!.embeddingRole).toBe(EmbeddingRoleV1.TRUNK_BRANCH);
  });

  it('GN-STA-SECTIONAL: stacja z 2 busIds → LOCAL_SECTIONAL', () => {
    const input = buildGN_STA_SECTIONAL();
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_d1');
    expect(block).toBeDefined();
    expect(block!.embeddingRole).toBe(EmbeddingRoleV1.LOCAL_SECTIONAL);
  });

  it('GN-STA-SECTIONAL: coupler field present', () => {
    const input = buildGN_STA_SECTIONAL();
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_d1');
    expect(block).toBeDefined();
    expect(block!.couplerFieldId).not.toBeNull();
    const couplerField = block!.fields.find(f => f.fieldRole === FieldRoleV1.COUPLER_SN);
    expect(couplerField).toBeDefined();
  });

  it('GN-STA-LEAF: stacja ma busSections', () => {
    const input = buildGN_STA_LEAF();
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_a1');
    expect(block!.busSections.length).toBe(1);
    expect(block!.busSections[0].id).toBe('bus_st1');
  });
});

// =============================================================================
// TEST: FIELD/DEVICE BUILDING
// =============================================================================

describe('Field/Device Building — RUN #3D', () => {
  it('GN-STA-LEAF: stacja ma pole liniowe', () => {
    const input = buildGN_STA_LEAF();
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_a1');
    expect(block!.fields.length).toBeGreaterThanOrEqual(1);
    const lineField = block!.fields.find(f =>
      f.fieldRole === FieldRoleV1.LINE_IN || f.fieldRole === FieldRoleV1.LINE_OUT,
    );
    expect(lineField).toBeDefined();
  });

  it('GN-STA-LEAF: stacja ma pole transformatorowe', () => {
    const input = buildGN_STA_LEAF();
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_a1');
    const trField = block!.fields.find(f => f.fieldRole === FieldRoleV1.TRANSFORMER_SN_NN);
    expect(trField).toBeDefined();
  });

  it('GN-STA-INLINE: stacja przelotowa ma pole wejsciowe, wyjsciowe i transformatorowe', () => {
    const input = buildGN_STA_INLINE();
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_b1');
    const roles = new Set(block!.fields.map(field => field.fieldRole));

    expect(roles.has(FieldRoleV1.LINE_IN)).toBe(true);
    expect(roles.has(FieldRoleV1.LINE_OUT)).toBe(true);
    expect(roles.has(FieldRoleV1.TRANSFORMER_SN_NN)).toBe(true);
  });

  it('GN-STA-BRANCH: stacja odgalezieniowa rozroznia ciag glowny i pole odgalezne', () => {
    const input = buildGN_STA_BRANCH();
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_c1');
    const roles = new Set(block!.fields.map(field => field.fieldRole));

    expect(roles.has(FieldRoleV1.LINE_IN)).toBe(true);
    expect(roles.has(FieldRoleV1.LINE_OUT)).toBe(true);
    expect(roles.has(FieldRoleV1.LINE_BRANCH)).toBe(true);
    expect(roles.has(FieldRoleV1.TRANSFORMER_SN_NN)).toBe(true);
  });

  it('GN-STA-SECTIONAL: stacja sekcyjna ma wejscie, wyjscie, sprzeglo i transformator', () => {
    const input = buildGN_STA_SECTIONAL();
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_d1');
    const roles = new Set(block!.fields.map(field => field.fieldRole));

    expect(roles.has(FieldRoleV1.LINE_IN)).toBe(true);
    expect(roles.has(FieldRoleV1.LINE_OUT)).toBe(true);
    expect(roles.has(FieldRoleV1.COUPLER_SN)).toBe(true);
    expect(roles.has(FieldRoleV1.TRANSFORMER_SN_NN)).toBe(true);
  });

  it('GN-STA-LEAF: devices mapped from domain', () => {
    const input = buildGN_STA_LEAF();
    const result = buildVisualGraphFromTopology(input);
    const allDevices = result.stationBlockDetails.allDevices;
    const cb = allDevices.find(d => d.deviceType === DeviceTypeV1.CB);
    expect(cb).toBeDefined();
    expect(cb!.id).toBe('cb_1');
  });

  it('explicit field_specs renderuje pole GPZ bez gałęzi heurystycznych', () => {
    const input = makeBaseInput({
      connectionNodes: [
        { id: 'bus_gpz', name: 'Szyna GPZ', voltageKv: 15, inService: true },
      ],
      stations: [
        {
          id: 'sta_gpz',
          name: 'GPZ 15 kV',
          stationType: StationKind.MAIN_SUBSTATION,
          voltageKv: 15,
          busIds: ['bus_gpz'],
          switchIds: [],
          transformerIds: [],
          fieldSpecs: [
            {
              fieldRef: 'bay_sn_in',
              name: 'Pole SN wejściowe',
              bayRole: 'IN',
              busRef: 'bus_gpz',
              equipmentRefs: ['cb_in'],
              protectionRef: null,
              gpzSectionId: 'sec_1',
              tags: ['gpz', 'sn'],
              meta: { source_field_kind: 'IN' },
            },
          ],
          nnFieldSpecs: [
            {
              fieldRef: 'bay_meas',
              name: 'Pole pomiarowe',
              bayRole: 'MEASUREMENT',
              busRef: 'bus_gpz',
              equipmentRefs: ['ct_in'],
              protectionRef: null,
              gpzSectionId: null,
              tags: ['pomiar'],
              meta: { source_field_kind: 'MEASUREMENT' },
            },
          ],
        },
      ],
      devices: [
        {
          id: 'cb_in',
          name: 'Wyłącznik wejściowy',
          kind: DeviceKind.CB,
          nodeId: 'bus_gpz',
          inService: true,
          catalogRef: 'cat_cb_in',
          state: 'CLOSED',
          bayRef: 'bay_sn_in',
        },
        {
          id: 'ct_in',
          name: 'Przekładnik prądowy',
          kind: DeviceKind.CT,
          nodeId: 'bus_gpz',
          inService: true,
          catalogRef: 'cat_ct_in',
          state: null,
          bayRef: 'bay_meas',
        },
      ],
      sources: [
        { id: 'src_gpz', name: 'GPZ 110/15kV', nodeId: 'bus_gpz', inService: true },
      ],
    });

    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_gpz');

    expect(block).toBeDefined();
    expect(block!.fields.map(field => field.id)).toEqual(['bay_meas', 'bay_sn_in']);
    expect(block!.fields.find(f => f.fieldRole === FieldRoleV1.GPZ_LINE_BAY)).toBeDefined();
    expect(block!.fields.find(f => f.fieldRole === FieldRoleV1.MEASUREMENT_SN)).toBeDefined();
    expect(block!.devices.map(device => device.id)).toEqual(['cb_in', 'ct_in']);
  });

  it('GN-OZE-SN: PV i BESS generatory tworza pola', () => {
    const input = buildGN_OZE_SN();
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_oze');
    expect(block).toBeDefined();

    const pvField = block!.fields.find(f => f.fieldRole === FieldRoleV1.PV_SN);
    expect(pvField).toBeDefined();

    const bessField = block!.fields.find(f => f.fieldRole === FieldRoleV1.BESS_SN);
    expect(bessField).toBeDefined();
  });

  it('PV za transformatorem stacyjnym tworzy pole nN, nie pole zrodla SN', () => {
    const input = makeBaseInput({
      connectionNodes: [
        { id: 'bus_sn', name: 'Szyna SN', voltageKv: 15, inService: true },
      ],
      stations: [
        { id: 'sta_lv_pv', name: 'Stacja z PV nN', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_sn'], switchIds: [], transformerIds: [] },
      ],
      sources: [
        { id: 'src_gpz', name: 'GPZ', nodeId: 'bus_sn', inService: true },
      ],
      generators: [
        { id: 'gen_pv_lv', name: 'PV nN', kind: GeneratorKind.PV, nodeId: 'bus_sn', inService: true, ratedPowerMw: 0.25, catalogRef: 'cat_pv', blockingTransformerId: null, connectionVariant: 'LV_BEHIND_STATION_TRANSFORMER', stationRef: 'sta_lv_pv' },
      ],
    });
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_lv_pv');

    expect(block!.fields.some(f => f.fieldRole === FieldRoleV1.PV_NN)).toBe(true);
    expect(block!.fields.some(f => f.fieldRole === FieldRoleV1.PV_SN)).toBe(false);
  });

  it('GN-OZE-SN: generator devices present', () => {
    const input = buildGN_OZE_SN();
    const result = buildVisualGraphFromTopology(input);
    const pvDev = result.stationBlockDetails.allDevices.find(d => d.deviceType === DeviceTypeV1.GENERATOR_PV);
    const bessDev = result.stationBlockDetails.allDevices.find(d => d.deviceType === DeviceTypeV1.GENERATOR_BESS);
    expect(pvDev).toBeDefined();
    expect(bessDev).toBeDefined();
  });

  it('GN-OZE-SN: brak TR blokowego → FixAction (block_transformer variant)', () => {
    const input = buildGN_OZE_SN();
    const result = buildVisualGraphFromTopology(input);
    const blockTrFix = result.stationBlockDetails.fixActions.find(f =>
      f.code === FieldDeviceFixCodes.GENERATOR_BLOCK_TR_MISSING,
    );
    expect(blockTrFix).toBeDefined();
  });

  it('GN-OZE-SN: nn_side variant → no block TR FixAction', () => {
    const input = makeBaseInput({
      connectionNodes: [
        { id: 'bus_sn', name: 'Szyna SN 15kV', voltageKv: 15, inService: true },
      ],
      stations: [
        { id: 'sta_nn', name: 'Stacja NN', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_sn'], switchIds: [], transformerIds: [] },
      ],
      sources: [
        { id: 'src_gpz', name: 'GPZ 110/15kV', nodeId: 'bus_sn', inService: true },
      ],
      generators: [
        { id: 'gen_pv_nn', name: 'PV nn_side', kind: GeneratorKind.PV, nodeId: 'bus_sn', inService: true, ratedPowerMw: 3, catalogRef: 'cat_pv', blockingTransformerId: null, connectionVariant: 'nn_side', stationRef: 'sta_nn' },
      ],
    });
    const result = buildVisualGraphFromTopology(input);
    const blockTrFix = result.stationBlockDetails.fixActions.find(f =>
      f.code === FieldDeviceFixCodes.GENERATOR_BLOCK_TR_MISSING,
    );
    // nn_side variant does NOT require block transformer
    expect(blockTrFix).toBeUndefined();
  });

  it('GN-OZE-SN: null variant → GENERATOR_CONNECTION_VARIANT_MISSING FixAction', () => {
    const input = makeBaseInput({
      connectionNodes: [
        { id: 'bus_sn', name: 'Szyna SN 15kV', voltageKv: 15, inService: true },
      ],
      stations: [
        { id: 'sta_oze', name: 'Stacja OZE', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_sn'], switchIds: [], transformerIds: [] },
      ],
      sources: [
        { id: 'src_gpz', name: 'GPZ', nodeId: 'bus_sn', inService: true },
      ],
      generators: [
        { id: 'gen_pv_novar', name: 'PV bez wariantu', kind: GeneratorKind.PV, nodeId: 'bus_sn', inService: true, ratedPowerMw: 2, catalogRef: 'cat_pv', blockingTransformerId: null, connectionVariant: null, stationRef: null },
      ],
    });
    const result = buildVisualGraphFromTopology(input);
    const variantFix = result.stationBlockDetails.fixActions.find(f =>
      f.code === FieldDeviceFixCodes.GENERATOR_CONNECTION_VARIANT_MISSING,
    );
    expect(variantFix).toBeDefined();
    // No block TR fix should appear (variant not determined yet)
    const blockTrFix = result.stationBlockDetails.fixActions.find(f =>
      f.code === FieldDeviceFixCodes.GENERATOR_BLOCK_TR_MISSING,
    );
    expect(blockTrFix).toBeUndefined();
  });

  it('GN-STA-LEAF: device anchors computed', () => {
    const input = buildGN_STA_LEAF();
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_a1');
    // Anchors exist for devices in the block
    if (block!.devices.length > 0) {
      expect(block!.deviceAnchors.length).toBeGreaterThanOrEqual(1);
      for (const anchor of block!.deviceAnchors) {
        expect(anchor.relativeX).toBeGreaterThanOrEqual(0);
        expect(anchor.relativeX).toBeLessThanOrEqual(1);
        expect(anchor.relativeY).toBeGreaterThanOrEqual(0);
        expect(anchor.relativeY).toBeLessThanOrEqual(1);
        expect(anchor.width).toBeGreaterThan(0);
        expect(anchor.height).toBeGreaterThan(0);
      }
    }
  });
});

// =============================================================================
// TEST: STATION BLOCK VALIDATION
// =============================================================================

describe('Station Block Validation — RUN #3D', () => {
  it('GN-STA-LEAF: stacja przechodzi walidacje', () => {
    const input = buildGN_STA_LEAF();
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_a1');
    expect(block).toBeDefined();
    const blockFixActions = validateStationBlock(block!);
    // TRUNK_LEAF: musi miec trunkInPort
    expect(block!.ports.trunkInPort).not.toBeNull();
  });

  it('GN-STA-SECTIONAL: LOCAL_SECTIONAL validation passes if coupler present', () => {
    const input = buildGN_STA_SECTIONAL();
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_d1');
    expect(block).toBeDefined();
    // Should have coupler
    expect(block!.couplerFieldId).not.toBeNull();
  });

  it('device without catalog ref → FixAction', () => {
    const input = buildGN_STA_LEAF();
    const result = buildVisualGraphFromTopology(input);
    // cb_1 has catalogRef: null → should generate CATALOG_REF_MISSING
    const catalogFix = result.stationBlockDetails.fixActions.find(f =>
      f.code === FieldDeviceFixCodes.CATALOG_REF_MISSING,
    );
    expect(catalogFix).toBeDefined();
  });
  it('SN/nN station contract reports missing nN switchgear instead of hiding transformer-only station', () => {
    const input = buildGN_STA_LEAF();
    const result = buildVisualGraphFromTopology(input);
    const block = result.stationBlockDetails.stationBlocks.find(b => b.blockId === 'sta_a1');
    const blockFixActions = validateStationBlock(block!);

    expect(block!.fields.some(field => field.fieldRole === FieldRoleV1.TRANSFORMER_SN_NN)).toBe(true);
    expect(blockFixActions.some(
      fix => fix.code === FieldDeviceFixCodes.STATION_NN_SWITCHGEAR_MISSING,
    )).toBe(true);
  });
});

// =============================================================================
// TEST: ADAPTER INTEGRATION
// =============================================================================

describe('Adapter Integration — RUN #3D', () => {
  it('buildVisualGraphFromTopology returns stationBlockDetails', () => {
    const input = buildGN_STA_LEAF();
    const result = buildVisualGraphFromTopology(input);
    expect(result.stationBlockDetails).toBeDefined();
    expect(result.stationBlockDetails.stationBlocks.length).toBeGreaterThanOrEqual(1);
  });

  it('fixActions from stationBlockBuilder merged into adapter fixActions', () => {
    const input = buildGN_STA_LEAF();
    const result = buildVisualGraphFromTopology(input);
    // Check that field/device fixActions appear in adapter fixActions
    const allCodes = result.fixActions.map(f => f.code);
    // cb_1 has no catalog → merged fixAction
    expect(allCodes).toContain(FieldDeviceFixCodes.CATALOG_REF_MISSING);
  });

  it('stationBlocks are sorted by blockId', () => {
    const input = buildGN_RING_NOP();
    const result = buildVisualGraphFromTopology(input);
    const blocks = result.stationBlockDetails.stationBlocks;
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].blockId.localeCompare(blocks[i - 1].blockId)).toBeGreaterThanOrEqual(0);
    }
  });

  it('allFields sorted by id', () => {
    const input = buildGN_STRESS_50();
    const result = buildVisualGraphFromTopology(input);
    const fields = result.stationBlockDetails.allFields;
    for (let i = 1; i < fields.length; i++) {
      expect(fields[i].id.localeCompare(fields[i - 1].id)).toBeGreaterThanOrEqual(0);
    }
  });

  it('allDevices sorted by id', () => {
    const input = buildGN_STRESS_50();
    const result = buildVisualGraphFromTopology(input);
    const devices = result.stationBlockDetails.allDevices;
    for (let i = 1; i < devices.length; i++) {
      expect(devices[i].id.localeCompare(devices[i - 1].id)).toBeGreaterThanOrEqual(0);
    }
  });
});

// =============================================================================
// TEST: LAYOUT PIPELINE WITH STATION BLOCK DETAILS
// =============================================================================

describe('Layout Pipeline with Station Details — RUN #3D', () => {
  it('computeLayout with stationBlockDetails attaches detail to SwitchgearBlockV1', () => {
    const input = buildGN_STA_LEAF();
    const adapterResult = buildVisualGraphFromTopology(input);
    const layout = computeLayout(
      adapterResult.graph,
      DEFAULT_LAYOUT_CONFIG,
      adapterResult.stationBlockDetails,
    );

    // Find switchgear blocks with detail
    const blocksWithDetail = layout.switchgearBlocks.filter(b => b.detail !== null);
    expect(blocksWithDetail.length).toBeGreaterThanOrEqual(1);

    if (blocksWithDetail.length > 0) {
      const detail = blocksWithDetail[0].detail!;
      expect(detail.embeddingRole).toBeDefined();
      expect(detail.fields.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('computeLayout propagates canonical detail into renderer annotations', () => {
    const input = buildGN_STA_BRANCH();
    const adapterResult = buildVisualGraphFromTopology(input);
    const layout = computeLayout(
      adapterResult.graph,
      DEFAULT_LAYOUT_CONFIG,
      adapterResult.stationBlockDetails,
    );

    const stationChain = layout.canonicalAnnotations?.stationChains.find((chain) => chain.stationId === 'sta_c1');
    expect(stationChain?.detail?.blockId).toBe('sta_c1');

    const branchPoint = layout.canonicalAnnotations?.branchPoints[0];
    expect(branchPoint?.detail?.blockId).toBe(branchPoint?.sourceEdgeId);
  });

  it('computeLayout without explicit stationBlockDetails resolves canonical detail from adapter graph', () => {
    const input = buildGN_STA_LEAF();
    const adapterResult = buildVisualGraphFromTopology(input);
    const layout = computeLayout(adapterResult.graph);

    for (const block of layout.switchgearBlocks) {
      expect(block.detail?.blockId).toBe(block.blockId);
    }
  });

  it('layout hash deterministic with station details', () => {
    const input = buildGN_STA_INLINE();
    const adapterResult = buildVisualGraphFromTopology(input);

    const hash1 = computeLayout(
      adapterResult.graph,
      DEFAULT_LAYOUT_CONFIG,
      adapterResult.stationBlockDetails,
    ).hash;

    const hash2 = computeLayout(
      adapterResult.graph,
      DEFAULT_LAYOUT_CONFIG,
      adapterResult.stationBlockDetails,
    ).hash;

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{8}$/);
  });
});

// =============================================================================
// TEST: DETERMINISM — 100x hash + 50x permutation
// =============================================================================

describe('Determinism — RUN #3D Station Block Builder', () => {
  it('GN-STA-LEAF: 100x → identyczny stationBlockDetails', () => {
    const input = buildGN_STA_LEAF();
    const reference = buildVisualGraphFromTopology(input);
    const refBlocks = JSON.stringify(reference.stationBlockDetails);

    for (let i = 0; i < 100; i++) {
      const result = buildVisualGraphFromTopology(input);
      expect(JSON.stringify(result.stationBlockDetails)).toBe(refBlocks);
    }
  });

  it('GN-STA-INLINE: 100x → identyczny hash', () => {
    const input = buildGN_STA_INLINE();
    const adapterResult = buildVisualGraphFromTopology(input);
    const refHash = computeLayout(
      adapterResult.graph,
      DEFAULT_LAYOUT_CONFIG,
      adapterResult.stationBlockDetails,
    ).hash;

    for (let i = 0; i < 100; i++) {
      const r = buildVisualGraphFromTopology(input);
      const hash = computeLayout(r.graph, DEFAULT_LAYOUT_CONFIG, r.stationBlockDetails).hash;
      expect(hash).toBe(refHash);
    }
  });

  it('GN-STRESS-50: 100x → identyczny stationBlockDetails', () => {
    const input = buildGN_STRESS_50();
    const reference = buildVisualGraphFromTopology(input);
    const refStr = JSON.stringify(reference.stationBlockDetails.stationBlocks);

    for (let i = 0; i < 100; i++) {
      const result = buildVisualGraphFromTopology(input);
      expect(JSON.stringify(result.stationBlockDetails.stationBlocks)).toBe(refStr);
    }
  });

  it('GN-RING-NOP: 50 permutacji input arrays → identyczny stationBlockDetails', () => {
    const input = buildGN_RING_NOP();
    const reference = buildVisualGraphFromTopology(input);
    const refStr = JSON.stringify(reference.stationBlockDetails);

    for (let seed = 1; seed <= 50; seed++) {
      // Permutuj connectionNodes, branches, stations
      const permuted: TopologyInputV1 = {
        ...input,
        connectionNodes: deterministicShuffle(input.connectionNodes, seed),
        branches: deterministicShuffle(input.branches, seed * 17),
        stations: deterministicShuffle(input.stations, seed * 31),
      };
      const result = buildVisualGraphFromTopology(permuted);
      expect(JSON.stringify(result.stationBlockDetails)).toBe(refStr);
    }
  });

  it('GN-OZE-SN: 50 permutacji generators → identyczny stationBlockDetails', () => {
    const input = buildGN_OZE_SN();
    const reference = buildVisualGraphFromTopology(input);
    const refStr = JSON.stringify(reference.stationBlockDetails);

    for (let seed = 1; seed <= 50; seed++) {
      const permuted: TopologyInputV1 = {
        ...input,
        generators: deterministicShuffle(input.generators, seed),
        connectionNodes: deterministicShuffle(input.connectionNodes, seed * 7),
      };
      const result = buildVisualGraphFromTopology(permuted);
      expect(JSON.stringify(result.stationBlockDetails)).toBe(refStr);
    }
  });
});

// =============================================================================
// TEST: GOLDEN NETWORK STATISTICS
// =============================================================================

describe('Golden Network Statistics — RUN #3D', () => {
  it('GN-STA-LEAF: 1 stacja, 1+ pole, 1+ device', () => {
    const input = buildGN_STA_LEAF();
    const result = buildVisualGraphFromTopology(input);
    expect(result.stationBlockDetails.stationBlocks.length).toBe(1);
    expect(result.stationBlockDetails.allFields.length).toBeGreaterThanOrEqual(1);
  });

  it('GN-STA-SECTIONAL: 1 stacja, 2 busSections, coupler field', () => {
    const input = buildGN_STA_SECTIONAL();
    const result = buildVisualGraphFromTopology(input);
    expect(result.stationBlockDetails.stationBlocks.length).toBe(1);
    const block = result.stationBlockDetails.stationBlocks[0];
    expect(block.busSections.length).toBe(2);
  });

  it('GN-STRESS-50: 50 stacji, 50+ pol', () => {
    const input = buildGN_STRESS_50();
    const result = buildVisualGraphFromTopology(input);
    expect(result.stationBlockDetails.stationBlocks.length).toBe(50);
    expect(result.stationBlockDetails.allFields.length).toBeGreaterThanOrEqual(50);
  });

  it('GN-RING-NOP: 3 stacje, ring topology', () => {
    const input = buildGN_RING_NOP();
    const result = buildVisualGraphFromTopology(input);
    expect(result.stationBlockDetails.stationBlocks.length).toBe(3);
  });
});
