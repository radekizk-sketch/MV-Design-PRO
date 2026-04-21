import type { AnySldSymbol, BranchSymbol, BusSymbol, LoadSymbol, SourceSymbol } from '../../sld-editor/types';
import { computeLayout, DEFAULT_LAYOUT_CONFIG } from './layoutPipeline';
import type { CanonicalAnnotationsV1 } from './layoutResult';
import { buildVisualGraphFromTopology } from './topologyAdapterV2';
import { BranchKind, GeneratorKind, StationKind, type TopologyInputV1 } from './topologyInputReader';

export type ReferenceScenarioId = 'leaf' | 'pass' | 'branch' | 'ring' | 'multi' | 'terrain' | 'sectional';

export interface ReferenceScenarioConnection {
  readonly id: string;
  readonly elementType: BranchSymbol['elementType'];
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly path: readonly { x: number; y: number }[];
  readonly branchType?: BranchSymbol['branchType'];
}

export interface ReferenceScenarioResult {
  readonly scenarioId: ReferenceScenarioId;
  readonly input: TopologyInputV1;
  readonly symbols: AnySldSymbol[];
  readonly connections: readonly ReferenceScenarioConnection[];
  readonly canonicalAnnotations: CanonicalAnnotationsV1 | null;
}

function buildBaseInput(snapshotId: string): TopologyInputV1 {
  return {
    snapshotId,
    snapshotFingerprint: `${snapshotId}_fp`,
    connectionNodes: [
      { id: 'bus_gpz', name: 'GPZ', voltageKv: 15, stationId: null, busIndex: null, inService: true },
      { id: 'bus_s1_sn', name: 'S1 SN', voltageKv: 15, stationId: 'st1', busIndex: null, inService: true },
      { id: 'bus_s1_nn', name: 'S1 nN', voltageKv: 0.4, stationId: 'st1', busIndex: null, inService: true },
      { id: 'bus_s2_sn', name: 'S2 SN', voltageKv: 15, stationId: 'st2', busIndex: null, inService: true },
      { id: 'bus_s2_nn', name: 'S2 nN', voltageKv: 0.4, stationId: 'st2', busIndex: null, inService: true },
    ],
    branches: [
      { id: 'line_g_s1', name: 'GPZ-S1', fromNodeId: 'bus_gpz', toNodeId: 'bus_s1_sn', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 1.2, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s1_s2', name: 'S1-S2', fromNodeId: 'bus_s1_sn', toNodeId: 'bus_s2_sn', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 0.8, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'tr_s1', name: 'TR S1', fromNodeId: 'bus_s1_sn', toNodeId: 'bus_s1_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-630', lengthKm: null, ratedPowerMva: 0.63, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_s2', name: 'TR S2', fromNodeId: 'bus_s2_sn', toNodeId: 'bus_s2_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-400', lengthKm: null, ratedPowerMva: 0.4, voltageHvKv: 15, voltageLvKv: 0.4 },
    ],
    devices: [],
    stations: [
      { id: 'st1', name: 'Stacja 1', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_s1_sn', 'bus_s1_nn'], branchIds: [], switchIds: [], transformerIds: ['tr_s1'] },
      { id: 'st2', name: 'Stacja 2', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_s2_sn', 'bus_s2_nn'], branchIds: [], switchIds: [], transformerIds: ['tr_s2'] },
    ],
    generators: [],
    sources: [{ id: 'src_gpz', name: 'Zasilanie GPZ', nodeId: 'bus_gpz', inService: true }],
    loads: [
      { id: 'load_s1', name: 'Odbiór S1', nodeId: 'bus_s1_nn', inService: true, pMw: 0.15, qMvar: 0.04 },
      { id: 'load_s2', name: 'Odbiór S2', nodeId: 'bus_s2_nn', inService: true, pMw: 0.1, qMvar: 0.03 },
    ],
    protectionBindings: [],
    logicalViews: {
      trunks: [{ id: 'trunk_main', segmentIds: ['line_g_s1', 'line_s1_s2'] }],
      branches: [],
      rings: [],
    },
    fixActions: [],
  };
}

function buildMultiInput(): TopologyInputV1 {
  return {
    snapshotId: 'canon_multi',
    snapshotFingerprint: 'canon_multi_fp',
    connectionNodes: [
      { id: 'bus_b1_nn', name: 'B1 nN', voltageKv: 0.4, stationId: null, busIndex: null, inService: true },
      { id: 'bus_b1_sn', name: 'B1 SN', voltageKv: 15, stationId: 'stb1', busIndex: null, inService: true },
      { id: 'bus_b2_nn', name: 'B2 nN', voltageKv: 0.4, stationId: null, busIndex: null, inService: true },
      { id: 'bus_b2_sn', name: 'B2 SN', voltageKv: 15, stationId: 'stb2', busIndex: null, inService: true },
      { id: 'bus_b3_nn', name: 'B3 nN', voltageKv: 0.4, stationId: null, busIndex: null, inService: true },
      { id: 'bus_b3_sn', name: 'B3 SN', voltageKv: 15, stationId: 'stb3', busIndex: null, inService: true },
      { id: 'bus_b4_nn', name: 'B4 nN', voltageKv: 0.4, stationId: null, busIndex: null, inService: true },
      { id: 'bus_b4_sn', name: 'B4 SN', voltageKv: 15, stationId: 'stb4', busIndex: null, inService: true },
      { id: 'bus_gpz', name: 'GPZ', voltageKv: 15, stationId: null, busIndex: null, inService: true },
      { id: 'bus_s1_nn', name: 'S1 nN', voltageKv: 0.4, stationId: null, busIndex: null, inService: true },
      { id: 'bus_s1_sn', name: 'S1 SN', voltageKv: 15, stationId: 'st1', busIndex: null, inService: true },
      { id: 'bus_s2_nn', name: 'S2 nN', voltageKv: 0.4, stationId: null, busIndex: null, inService: true },
      { id: 'bus_s2_sn', name: 'S2 SN', voltageKv: 15, stationId: 'st2', busIndex: null, inService: true },
      { id: 'bus_s3_nn', name: 'S3 nN', voltageKv: 0.4, stationId: null, busIndex: null, inService: true },
      { id: 'bus_s3_sn', name: 'S3 SN', voltageKv: 15, stationId: 'st3', busIndex: null, inService: true },
      { id: 'bus_s4_sn_a', name: 'S4 SN-A', voltageKv: 15, stationId: 'st4', busIndex: null, inService: true },
      { id: 'bus_s4_sn_b', name: 'S4 SN-B', voltageKv: 15, stationId: 'st4', busIndex: null, inService: true },
      { id: 'bus_s5_nn', name: 'S5 nN', voltageKv: 0.4, stationId: null, busIndex: null, inService: true },
      { id: 'bus_s5_sn', name: 'S5 SN', voltageKv: 15, stationId: 'st5', busIndex: null, inService: true },
    ],
    branches: [
      { id: 'buslink_s4', name: 'Sprzeglo S4', fromNodeId: 'bus_s4_sn_a', toNodeId: 'bus_s4_sn_b', kind: BranchKind.BUS_LINK, isNormallyOpen: false, inService: true, catalogRef: null, lengthKm: null, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_b1_b2', name: 'B1-B2', fromNodeId: 'bus_b1_sn', toNodeId: 'bus_b2_sn', kind: BranchKind.CABLE, isNormallyOpen: false, inService: true, catalogRef: 'XRUHAKXS-120', lengthKm: 0.5, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_g_s1', name: 'GPZ-S1', fromNodeId: 'bus_gpz', toNodeId: 'bus_s1_sn', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 1.5, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s1_b4', name: 'S1-B4', fromNodeId: 'bus_s1_sn', toNodeId: 'bus_b4_sn', kind: BranchKind.CABLE, isNormallyOpen: false, inService: true, catalogRef: 'XRUHAKXS-120', lengthKm: 0.8, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s1_s2', name: 'S1-S2', fromNodeId: 'bus_s1_sn', toNodeId: 'bus_s2_sn', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 1.2, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s2_b1', name: 'S2-B1', fromNodeId: 'bus_s2_sn', toNodeId: 'bus_b1_sn', kind: BranchKind.CABLE, isNormallyOpen: false, inService: true, catalogRef: 'XRUHAKXS-120', lengthKm: 0.7, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s2_s3', name: 'S2-S3', fromNodeId: 'bus_s2_sn', toNodeId: 'bus_s3_sn', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 0.9, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s3_b3', name: 'S3-B3', fromNodeId: 'bus_s3_sn', toNodeId: 'bus_b3_sn', kind: BranchKind.CABLE, isNormallyOpen: false, inService: true, catalogRef: 'XRUHAKXS-120', lengthKm: 0.6, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s3_s4', name: 'S3-S4', fromNodeId: 'bus_s3_sn', toNodeId: 'bus_s4_sn_a', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 2.0, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s4_s5', name: 'S4-S5', fromNodeId: 'bus_s4_sn_b', toNodeId: 'bus_s5_sn', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 2.5, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s5_s1_nop', name: 'S5-S1 punkt normalnie otwarty', fromNodeId: 'bus_s5_sn', toNodeId: 'bus_s1_sn', kind: BranchKind.LINE, isNormallyOpen: true, inService: true, catalogRef: 'AFL-120', lengthKm: 2.2, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'tr_b1', name: 'TR B1', fromNodeId: 'bus_b1_sn', toNodeId: 'bus_b1_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-250', lengthKm: null, ratedPowerMva: 0.25, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_b2', name: 'TR B2', fromNodeId: 'bus_b2_sn', toNodeId: 'bus_b2_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-160', lengthKm: null, ratedPowerMva: 0.16, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_b3', name: 'TR B3', fromNodeId: 'bus_b3_sn', toNodeId: 'bus_b3_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-250', lengthKm: null, ratedPowerMva: 0.25, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_b4', name: 'TR B4', fromNodeId: 'bus_b4_sn', toNodeId: 'bus_b4_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-400', lengthKm: null, ratedPowerMva: 0.4, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_s1', name: 'TR S1', fromNodeId: 'bus_s1_sn', toNodeId: 'bus_s1_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-630', lengthKm: null, ratedPowerMva: 0.63, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_s2', name: 'TR S2', fromNodeId: 'bus_s2_sn', toNodeId: 'bus_s2_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-400', lengthKm: null, ratedPowerMva: 0.4, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_s3', name: 'TR S3', fromNodeId: 'bus_s3_sn', toNodeId: 'bus_s3_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-400', lengthKm: null, ratedPowerMva: 0.4, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_s5', name: 'TR S5', fromNodeId: 'bus_s5_sn', toNodeId: 'bus_s5_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-250', lengthKm: null, ratedPowerMva: 0.25, voltageHvKv: 15, voltageLvKv: 0.4 },
    ],
    devices: [],
    stations: [
      { id: 'st1', name: 'Stacja 1 (przelotowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_s1_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_s1'] },
      { id: 'st2', name: 'Stacja 2 (odgaleźna)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_s2_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_s2'] },
      { id: 'st3', name: 'Stacja 3 (przelotowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_s3_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_s3'] },
      { id: 'st4', name: 'Stacja 4 (sekcyjna)', stationType: StationKind.SWITCHING, voltageKv: 15, busIds: ['bus_s4_sn_a', 'bus_s4_sn_b'], branchIds: [], switchIds: [], transformerIds: [] },
      { id: 'st5', name: 'Stacja 5 (końcowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_s5_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_s5'] },
      { id: 'stb1', name: 'Stacja B1 (przelotowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_b1_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_b1'] },
      { id: 'stb2', name: 'Stacja B2 (końcowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_b2_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_b2'] },
      { id: 'stb3', name: 'Stacja B3 (końcowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_b3_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_b3'] },
      { id: 'stb4', name: 'Stacja B4 (końcowa z PV)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_b4_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_b4'] },
    ],
    generators: [
      { id: 'gen_pv_b4', name: 'PV B4', nodeId: 'bus_b4_nn', kind: GeneratorKind.PV, catalogRef: null, inService: true, ratedPowerMw: 0.5, blockingTransformerId: null, connectionVariant: 'nn_side', stationRef: 'stb4' },
    ],
    sources: [{ id: 'src_gpz', name: 'Zasilanie GPZ', nodeId: 'bus_gpz', inService: true }],
    loads: [
      { id: 'load_b1', name: 'Odbiór B1', nodeId: 'bus_b1_nn', inService: true, pMw: 0.08, qMvar: 0.02 },
      { id: 'load_b2', name: 'Odbiór B2', nodeId: 'bus_b2_nn', inService: true, pMw: 0.05, qMvar: 0.01 },
      { id: 'load_b3', name: 'Odbiór B3', nodeId: 'bus_b3_nn', inService: true, pMw: 0.1, qMvar: 0.03 },
      { id: 'load_b4', name: 'Odbiór B4', nodeId: 'bus_b4_nn', inService: true, pMw: 0.12, qMvar: 0.03 },
      { id: 'load_s1', name: 'Odbiór S1', nodeId: 'bus_s1_nn', inService: true, pMw: 0.3, qMvar: 0.08 },
      { id: 'load_s2', name: 'Odbiór S2', nodeId: 'bus_s2_nn', inService: true, pMw: 0.2, qMvar: 0.06 },
      { id: 'load_s3', name: 'Odbiór S3', nodeId: 'bus_s3_nn', inService: true, pMw: 0.18, qMvar: 0.05 },
      { id: 'load_s5', name: 'Odbiór S5', nodeId: 'bus_s5_nn', inService: true, pMw: 0.1, qMvar: 0.03 },
    ],
    protectionBindings: [],
    logicalViews: {
      trunks: [{ id: 'trunk_main', segmentIds: ['line_g_s1', 'line_s1_s2', 'line_s2_s3', 'line_s3_s4', 'line_s4_s5'] }],
      branches: [
        { id: 'branch_s1_b4', segmentIds: ['line_s1_b4'] },
        { id: 'branch_s2_b1', segmentIds: ['line_s2_b1', 'line_b1_b2'] },
        { id: 'branch_s3_b3', segmentIds: ['line_s3_b3'] },
      ],
      rings: [{ id: 'ring_s5_s1', segmentIds: ['line_s5_s1_nop'], normallyOpenSegmentId: 'line_s5_s1_nop' }],
    },
    fixActions: [],
  };
}

function buildTerrainInput(): TopologyInputV1 {
  return {
    snapshotId: 'canon_terrain',
    snapshotFingerprint: 'canon_terrain_fp',
    connectionNodes: [
      // GPZ
      { id: 'bus_gpz', name: 'GPZ', voltageKv: 15, stationId: null, busIndex: null, inService: true },
      // Main trunk: S1
      { id: 'bus_s1_sn', name: 'S1 SN', voltageKv: 15, stationId: 'st1', busIndex: null, inService: true },
      { id: 'bus_s1_nn', name: 'S1 nN', voltageKv: 0.4, stationId: 'st1', busIndex: null, inService: true },
      // Main trunk: S2 (odgaleźna)
      { id: 'bus_s2_sn', name: 'S2 SN', voltageKv: 15, stationId: 'st2', busIndex: null, inService: true },
      { id: 'bus_s2_nn', name: 'S2 nN', voltageKv: 0.4, stationId: 'st2', busIndex: null, inService: true },
      // Main trunk: S3
      { id: 'bus_s3_sn', name: 'S3 SN', voltageKv: 15, stationId: 'st3', busIndex: null, inService: true },
      { id: 'bus_s3_nn', name: 'S3 nN', voltageKv: 0.4, stationId: 'st3', busIndex: null, inService: true },
      // Main trunk: S4 (sekcyjna — 2 szyny SN, no TR)
      { id: 'bus_s4_sn_a', name: 'S4 SN-A', voltageKv: 15, stationId: 'st4', busIndex: null, inService: true },
      { id: 'bus_s4_sn_b', name: 'S4 SN-B', voltageKv: 15, stationId: 'st4', busIndex: null, inService: true },
      // Main trunk: S5
      { id: 'bus_s5_sn', name: 'S5 SN', voltageKv: 15, stationId: 'st5', busIndex: null, inService: true },
      { id: 'bus_s5_nn', name: 'S5 nN', voltageKv: 0.4, stationId: 'st5', busIndex: null, inService: true },
      // Main trunk: S6 (końcowa)
      { id: 'bus_s6_sn', name: 'S6 SN', voltageKv: 15, stationId: 'st6', busIndex: null, inService: true },
      { id: 'bus_s6_nn', name: 'S6 nN', voltageKv: 0.4, stationId: 'st6', busIndex: null, inService: true },
      // Branch 1: S2 → B1 → B2
      { id: 'bus_b1_sn', name: 'B1 SN', voltageKv: 15, stationId: 'stb1', busIndex: null, inService: true },
      { id: 'bus_b1_nn', name: 'B1 nN', voltageKv: 0.4, stationId: 'stb1', busIndex: null, inService: true },
      { id: 'bus_b2_sn', name: 'B2 SN', voltageKv: 15, stationId: 'stb2', busIndex: null, inService: true },
      { id: 'bus_b2_nn', name: 'B2 nN', voltageKv: 0.4, stationId: 'stb2', busIndex: null, inService: true },
      // Branch 2: S2 → B3 (końcowa z PV)
      { id: 'bus_b3_sn', name: 'B3 SN', voltageKv: 15, stationId: 'stb3', busIndex: null, inService: true },
      { id: 'bus_b3_nn', name: 'B3 nN', voltageKv: 0.4, stationId: 'stb3', busIndex: null, inService: true },
      // Branch 3: S5 → B4 → B5
      { id: 'bus_b4_sn', name: 'B4 SN', voltageKv: 15, stationId: 'stb4', busIndex: null, inService: true },
      { id: 'bus_b4_nn', name: 'B4 nN', voltageKv: 0.4, stationId: 'stb4', busIndex: null, inService: true },
      { id: 'bus_b5_sn', name: 'B5 SN', voltageKv: 15, stationId: 'stb5', busIndex: null, inService: true },
      { id: 'bus_b5_nn', name: 'B5 nN', voltageKv: 0.4, stationId: 'stb5', busIndex: null, inService: true },
      // Sub-branch: B4 → B6 (branch of branch)
      { id: 'bus_b6_sn', name: 'B6 SN', voltageKv: 15, stationId: 'stb6', busIndex: null, inService: true },
      { id: 'bus_b6_nn', name: 'B6 nN', voltageKv: 0.4, stationId: 'stb6', busIndex: null, inService: true },
    ],
    branches: [
      // Main trunk lines
      { id: 'line_g_s1', name: 'GPZ-S1', fromNodeId: 'bus_gpz', toNodeId: 'bus_s1_sn', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 1.5, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s1_s2', name: 'S1-S2', fromNodeId: 'bus_s1_sn', toNodeId: 'bus_s2_sn', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 1.2, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s2_s3', name: 'S2-S3', fromNodeId: 'bus_s2_sn', toNodeId: 'bus_s3_sn', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 0.9, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s3_s4', name: 'S3-S4', fromNodeId: 'bus_s3_sn', toNodeId: 'bus_s4_sn_a', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 2.0, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s4_s5', name: 'S4-S5', fromNodeId: 'bus_s4_sn_b', toNodeId: 'bus_s5_sn', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 2.5, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s5_s6', name: 'S5-S6', fromNodeId: 'bus_s5_sn', toNodeId: 'bus_s6_sn', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 1.8, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      // Ring: S6 → S1 via NOP
      { id: 'line_s6_s1_nop', name: 'S6-S1 punkt normalnie otwarty', fromNodeId: 'bus_s6_sn', toNodeId: 'bus_s1_sn', kind: BranchKind.LINE, isNormallyOpen: true, inService: true, catalogRef: 'AFL-120', lengthKm: 3.0, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      // Bus coupler S4
      { id: 'buslink_s4', name: 'Sprzeglo S4', fromNodeId: 'bus_s4_sn_a', toNodeId: 'bus_s4_sn_b', kind: BranchKind.BUS_LINK, isNormallyOpen: false, inService: true, catalogRef: null, lengthKm: null, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      // Branch 1: S2 → B1 → B2
      { id: 'line_s2_b1', name: 'S2-B1', fromNodeId: 'bus_s2_sn', toNodeId: 'bus_b1_sn', kind: BranchKind.CABLE, isNormallyOpen: false, inService: true, catalogRef: 'XRUHAKXS-120', lengthKm: 0.7, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_b1_b2', name: 'B1-B2', fromNodeId: 'bus_b1_sn', toNodeId: 'bus_b2_sn', kind: BranchKind.CABLE, isNormallyOpen: false, inService: true, catalogRef: 'XRUHAKXS-120', lengthKm: 0.5, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      // Branch 2: S2 → B3
      { id: 'line_s2_b3', name: 'S2-B3', fromNodeId: 'bus_s2_sn', toNodeId: 'bus_b3_sn', kind: BranchKind.CABLE, isNormallyOpen: false, inService: true, catalogRef: 'XRUHAKXS-120', lengthKm: 0.6, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      // Branch 3: S5 → B4 → B5
      { id: 'line_s5_b4', name: 'S5-B4', fromNodeId: 'bus_s5_sn', toNodeId: 'bus_b4_sn', kind: BranchKind.CABLE, isNormallyOpen: false, inService: true, catalogRef: 'XRUHAKXS-120', lengthKm: 0.8, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_b4_b5', name: 'B4-B5', fromNodeId: 'bus_b4_sn', toNodeId: 'bus_b5_sn', kind: BranchKind.CABLE, isNormallyOpen: false, inService: true, catalogRef: 'XRUHAKXS-120', lengthKm: 0.4, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      // Sub-branch: B4 → B6
      { id: 'line_b4_b6', name: 'B4-B6', fromNodeId: 'bus_b4_sn', toNodeId: 'bus_b6_sn', kind: BranchKind.CABLE, isNormallyOpen: false, inService: true, catalogRef: 'XRUHAKXS-120', lengthKm: 0.3, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      // Transformers (all stations except S4 switching-only)
      { id: 'tr_s1', name: 'TR S1', fromNodeId: 'bus_s1_sn', toNodeId: 'bus_s1_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-630', lengthKm: null, ratedPowerMva: 0.63, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_s2', name: 'TR S2', fromNodeId: 'bus_s2_sn', toNodeId: 'bus_s2_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-400', lengthKm: null, ratedPowerMva: 0.4, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_s3', name: 'TR S3', fromNodeId: 'bus_s3_sn', toNodeId: 'bus_s3_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-400', lengthKm: null, ratedPowerMva: 0.4, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_s5', name: 'TR S5', fromNodeId: 'bus_s5_sn', toNodeId: 'bus_s5_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-250', lengthKm: null, ratedPowerMva: 0.25, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_s6', name: 'TR S6', fromNodeId: 'bus_s6_sn', toNodeId: 'bus_s6_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-250', lengthKm: null, ratedPowerMva: 0.25, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_b1', name: 'TR B1', fromNodeId: 'bus_b1_sn', toNodeId: 'bus_b1_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-250', lengthKm: null, ratedPowerMva: 0.25, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_b2', name: 'TR B2', fromNodeId: 'bus_b2_sn', toNodeId: 'bus_b2_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-160', lengthKm: null, ratedPowerMva: 0.16, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_b3', name: 'TR B3', fromNodeId: 'bus_b3_sn', toNodeId: 'bus_b3_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-250', lengthKm: null, ratedPowerMva: 0.25, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_b4', name: 'TR B4', fromNodeId: 'bus_b4_sn', toNodeId: 'bus_b4_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-400', lengthKm: null, ratedPowerMva: 0.4, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_b5', name: 'TR B5', fromNodeId: 'bus_b5_sn', toNodeId: 'bus_b5_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-160', lengthKm: null, ratedPowerMva: 0.16, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_b6', name: 'TR B6', fromNodeId: 'bus_b6_sn', toNodeId: 'bus_b6_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-160', lengthKm: null, ratedPowerMva: 0.16, voltageHvKv: 15, voltageLvKv: 0.4 },
    ],
    devices: [],
    stations: [
      { id: 'st1', name: 'Stacja 1 (przelotowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_s1_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_s1'] },
      { id: 'st2', name: 'Stacja 2 (odgaleźna)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_s2_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_s2'] },
      { id: 'st3', name: 'Stacja 3 (przelotowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_s3_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_s3'] },
      { id: 'st4', name: 'Stacja 4 (sekcyjna)', stationType: StationKind.SWITCHING, voltageKv: 15, busIds: ['bus_s4_sn_a', 'bus_s4_sn_b'], branchIds: [], switchIds: [], transformerIds: [] },
      { id: 'st5', name: 'Stacja 5 (przelotowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_s5_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_s5'] },
      { id: 'st6', name: 'Stacja 6 (końcowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_s6_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_s6'] },
      { id: 'stb1', name: 'Stacja B1 (przelotowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_b1_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_b1'] },
      { id: 'stb2', name: 'Stacja B2 (końcowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_b2_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_b2'] },
      { id: 'stb3', name: 'Stacja B3 (końcowa z PV)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_b3_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_b3'] },
      { id: 'stb4', name: 'Stacja B4 (przelotowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_b4_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_b4'] },
      { id: 'stb5', name: 'Stacja B5 (końcowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_b5_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_b5'] },
      { id: 'stb6', name: 'Stacja B6 (końcowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_b6_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_b6'] },
    ],
    generators: [
      { id: 'gen_pv_b3', name: 'PV B3', nodeId: 'bus_b3_nn', kind: GeneratorKind.PV, catalogRef: null, inService: true, ratedPowerMw: 0.5, blockingTransformerId: null, connectionVariant: 'nn_side', stationRef: 'stb3' },
    ],
    sources: [{ id: 'src_gpz', name: 'Zasilanie GPZ', nodeId: 'bus_gpz', inService: true }],
    loads: [
      { id: 'load_s1', name: 'Odbiór S1', nodeId: 'bus_s1_nn', inService: true, pMw: 0.3, qMvar: 0.08 },
      { id: 'load_s2', name: 'Odbiór S2', nodeId: 'bus_s2_nn', inService: true, pMw: 0.2, qMvar: 0.06 },
      { id: 'load_s3', name: 'Odbiór S3', nodeId: 'bus_s3_nn', inService: true, pMw: 0.18, qMvar: 0.05 },
      { id: 'load_s5', name: 'Odbiór S5', nodeId: 'bus_s5_nn', inService: true, pMw: 0.1, qMvar: 0.03 },
      { id: 'load_s6', name: 'Odbiór S6', nodeId: 'bus_s6_nn', inService: true, pMw: 0.08, qMvar: 0.02 },
      { id: 'load_b1', name: 'Odbiór B1', nodeId: 'bus_b1_nn', inService: true, pMw: 0.08, qMvar: 0.02 },
      { id: 'load_b2', name: 'Odbiór B2', nodeId: 'bus_b2_nn', inService: true, pMw: 0.05, qMvar: 0.01 },
      { id: 'load_b3', name: 'Odbiór B3', nodeId: 'bus_b3_nn', inService: true, pMw: 0.1, qMvar: 0.03 },
      { id: 'load_b4', name: 'Odbiór B4', nodeId: 'bus_b4_nn', inService: true, pMw: 0.12, qMvar: 0.03 },
      { id: 'load_b5', name: 'Odbiór B5', nodeId: 'bus_b5_nn', inService: true, pMw: 0.06, qMvar: 0.02 },
      { id: 'load_b6', name: 'Odbiór B6', nodeId: 'bus_b6_nn', inService: true, pMw: 0.04, qMvar: 0.01 },
    ],
    protectionBindings: [],
    logicalViews: {
      trunks: [{ id: 'trunk_main', segmentIds: ['line_g_s1', 'line_s1_s2', 'line_s2_s3', 'line_s3_s4', 'line_s4_s5', 'line_s5_s6'] }],
      branches: [
        { id: 'branch_s2_b1b2', segmentIds: ['line_s2_b1', 'line_b1_b2'] },
        { id: 'branch_s2_b3', segmentIds: ['line_s2_b3'] },
        { id: 'branch_s5_b4b5', segmentIds: ['line_s5_b4', 'line_b4_b5'] },
        { id: 'branch_b4_b6', segmentIds: ['line_b4_b6'] },
      ],
      rings: [{ id: 'ring_s6_s1', segmentIds: ['line_s6_s1_nop'], normallyOpenSegmentId: 'line_s6_s1_nop' }],
    },
    fixActions: [],
  };
}

function buildSectionalInput(): TopologyInputV1 {
  return {
    snapshotId: 'canon_sectional',
    snapshotFingerprint: 'canon_sectional_fp',
    connectionNodes: [
      { id: 'bus_gpz', name: 'GPZ', voltageKv: 15, stationId: null, busIndex: null, inService: true },
      { id: 'bus_s1_sn', name: 'S1 SN', voltageKv: 15, stationId: 'st1', busIndex: null, inService: true },
      { id: 'bus_s1_nn', name: 'S1 nN', voltageKv: 0.4, stationId: 'st1', busIndex: null, inService: true },
      { id: 'bus_s2_sn_a', name: 'S2 SN-A', voltageKv: 15, stationId: 'st2', busIndex: null, inService: true },
      { id: 'bus_s2_sn_b', name: 'S2 SN-B', voltageKv: 15, stationId: 'st2', busIndex: null, inService: true },
      { id: 'bus_s3_sn', name: 'S3 SN', voltageKv: 15, stationId: 'st3', busIndex: null, inService: true },
      { id: 'bus_s3_nn', name: 'S3 nN', voltageKv: 0.4, stationId: 'st3', busIndex: null, inService: true },
    ],
    branches: [
      { id: 'line_g_s1', name: 'GPZ-S1', fromNodeId: 'bus_gpz', toNodeId: 'bus_s1_sn', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 1.5, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s1_s2', name: 'S1-S2', fromNodeId: 'bus_s1_sn', toNodeId: 'bus_s2_sn_a', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 1.2, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'buslink_s2', name: 'Sprzeglo S2', fromNodeId: 'bus_s2_sn_a', toNodeId: 'bus_s2_sn_b', kind: BranchKind.BUS_LINK, isNormallyOpen: false, inService: true, catalogRef: null, lengthKm: null, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s2_s3', name: 'S2-S3', fromNodeId: 'bus_s2_sn_b', toNodeId: 'bus_s3_sn', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 0.9, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'tr_s1', name: 'TR S1', fromNodeId: 'bus_s1_sn', toNodeId: 'bus_s1_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-630', lengthKm: null, ratedPowerMva: 0.63, voltageHvKv: 15, voltageLvKv: 0.4 },
      { id: 'tr_s3', name: 'TR S3', fromNodeId: 'bus_s3_sn', toNodeId: 'bus_s3_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-400', lengthKm: null, ratedPowerMva: 0.4, voltageHvKv: 15, voltageLvKv: 0.4 },
    ],
    devices: [],
    stations: [
      { id: 'st1', name: 'Stacja 1 (przelotowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_s1_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_s1'] },
      { id: 'st2', name: 'Stacja 2 (sekcyjna)', stationType: StationKind.SWITCHING, voltageKv: 15, busIds: ['bus_s2_sn_a', 'bus_s2_sn_b'], branchIds: [], switchIds: [], transformerIds: [] },
      { id: 'st3', name: 'Stacja 3 (końcowa)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_s3_sn'], branchIds: [], switchIds: [], transformerIds: ['tr_s3'] },
    ],
    generators: [],
    sources: [{ id: 'src_gpz', name: 'Zasilanie GPZ', nodeId: 'bus_gpz', inService: true }],
    loads: [
      { id: 'load_s1', name: 'Odbiór S1', nodeId: 'bus_s1_nn', inService: true, pMw: 0.3, qMvar: 0.08 },
      { id: 'load_s3', name: 'Odbiór S3', nodeId: 'bus_s3_nn', inService: true, pMw: 0.18, qMvar: 0.05 },
    ],
    protectionBindings: [],
    logicalViews: {
      trunks: [{ id: 'trunk_main', segmentIds: ['line_g_s1', 'line_s1_s2', 'line_s2_s3'] }],
      branches: [],
      rings: [],
    },
    fixActions: [],
  };
}

function buildScenarioInput(scenarioId: ReferenceScenarioId): TopologyInputV1 {
  if (scenarioId === 'multi') {
    return buildMultiInput();
  }

  if (scenarioId === 'terrain') {
    return buildTerrainInput();
  }

  if (scenarioId === 'sectional') {
    return buildSectionalInput();
  }

  if (scenarioId === 'leaf') {
    const input = buildBaseInput('canon_leaf');
    return {
      ...input,
      connectionNodes: input.connectionNodes.filter((n) => !['bus_s2_sn', 'bus_s2_nn'].includes(n.id)),
      branches: input.branches.filter((b) => !['line_s1_s2', 'tr_s2'].includes(b.id)),
      stations: input.stations.filter((s) => s.id !== 'st2'),
      loads: input.loads.filter((l) => l.id !== 'load_s2'),
      logicalViews: {
        trunks: [{ id: 'trunk_leaf', segmentIds: ['line_g_s1'] }],
        branches: [],
        rings: [],
      },
    };
  }

  if (scenarioId === 'pass') {
    return buildBaseInput('canon_passthrough');
  }

  if (scenarioId === 'branch') {
    const input = buildBaseInput('canon_branch');
    return {
      ...input,
      connectionNodes: [
        ...input.connectionNodes,
        { id: 'bus_b1_sn', name: 'B1 SN', voltageKv: 15, stationId: 'stb', busIndex: null, inService: true },
        { id: 'bus_b1_nn', name: 'B1 nN', voltageKv: 0.4, stationId: 'stb', busIndex: null, inService: true },
      ],
      branches: [
        ...input.branches,
        { id: 'line_s1_b1', name: 'S1-B1', fromNodeId: 'bus_s1_sn', toNodeId: 'bus_b1_sn', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-70', lengthKm: 0.6, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
        { id: 'tr_b1', name: 'TR B1', fromNodeId: 'bus_b1_sn', toNodeId: 'bus_b1_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-250', lengthKm: null, ratedPowerMva: 0.25, voltageHvKv: 15, voltageLvKv: 0.4 },
      ],
      stations: [
        ...input.stations,
        { id: 'stb', name: 'Stacja B1', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_b1_sn', 'bus_b1_nn'], branchIds: [], switchIds: [], transformerIds: ['tr_b1'] },
      ],
      loads: [
        ...input.loads,
        { id: 'load_b1', name: 'Odbiór B1', nodeId: 'bus_b1_nn', inService: true, pMw: 0.08, qMvar: 0.02 },
      ],
      logicalViews: {
        trunks: [{ id: 'trunk_branch_main', segmentIds: ['line_g_s1', 'line_s1_s2'] }],
        branches: [{ id: 'branch_s1_b1', segmentIds: ['line_s1_b1'] }],
        rings: [],
      },
    };
  }

  const input = buildBaseInput('canon_ring');
  return {
    ...input,
    connectionNodes: [
      ...input.connectionNodes,
      { id: 'bus_s3_sn', name: 'S3 SN', voltageKv: 15, stationId: 'st3', busIndex: null, inService: true },
      { id: 'bus_s3_nn', name: 'S3 nN', voltageKv: 0.4, stationId: 'st3', busIndex: null, inService: true },
    ],
    branches: [
      ...input.branches,
      { id: 'line_s2_s3', name: 'S2-S3', fromNodeId: 'bus_s2_sn', toNodeId: 'bus_s3_sn', kind: BranchKind.LINE, isNormallyOpen: false, inService: true, catalogRef: 'AFL-120', lengthKm: 0.75, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'line_s3_s1_nop', name: 'S3-S1 punkt normalnie otwarty', fromNodeId: 'bus_s3_sn', toNodeId: 'bus_s1_sn', kind: BranchKind.LINE, isNormallyOpen: true, inService: true, catalogRef: 'AFL-120', lengthKm: 0.9, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null },
      { id: 'tr_s3', name: 'TR S3', fromNodeId: 'bus_s3_sn', toNodeId: 'bus_s3_nn', kind: BranchKind.TR_LINK, isNormallyOpen: false, inService: true, catalogRef: 'TR-400', lengthKm: null, ratedPowerMva: 0.4, voltageHvKv: 15, voltageLvKv: 0.4 },
    ],
    stations: [
      ...input.stations,
      { id: 'st3', name: 'Stacja 3', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus_s3_sn', 'bus_s3_nn'], branchIds: [], switchIds: [], transformerIds: ['tr_s3'] },
    ],
    loads: [
      ...input.loads,
      { id: 'load_s3', name: 'Odbiór S3', nodeId: 'bus_s3_nn', inService: true, pMw: 0.12, qMvar: 0.04 },
    ],
    logicalViews: {
      trunks: [{ id: 'trunk_ring_main', segmentIds: ['line_g_s1', 'line_s1_s2', 'line_s2_s3'] }],
      branches: [],
      rings: [{ id: 'ring_s3_s1', segmentIds: ['line_s3_s1_nop'], normallyOpenSegmentId: 'line_s3_s1_nop' }],
    },
  };
}

function routeToPoints(routeSegments: readonly { from: { x: number; y: number }; to: { x: number; y: number } }[]): { x: number; y: number }[] {
  if (routeSegments.length === 0) return [];
  const points = [{ x: routeSegments[0].from.x, y: routeSegments[0].from.y }];
  for (const segment of routeSegments) {
    points.push({ x: segment.to.x, y: segment.to.y });
  }
  return points;
}

function createSymbols(input: TopologyInputV1, layout: ReturnType<typeof computeLayout>): AnySldSymbol[] {
  const placements = new Map(layout.nodePlacements.map((p) => [p.nodeId, p]));

  const buses: BusSymbol[] = input.connectionNodes.map((node) => {
    const placement = placements.get(node.id);
    return {
      id: node.id,
      elementId: node.id,
      elementType: 'Bus',
      elementName: node.name,
      inService: node.inService,
      position: { x: placement?.position.x ?? 0, y: placement?.position.y ?? 0 },
      width: 90,
      height: 10,
    };
  });

  const sources: SourceSymbol[] = input.sources.map((source) => {
    const placement = placements.get(source.id) ?? placements.get(source.nodeId);
    return {
      id: source.id,
      elementId: source.id,
      elementType: 'Source',
      elementName: source.name,
      inService: source.inService,
      connectedToNodeId: source.nodeId,
      position: { x: placement?.position.x ?? 0, y: (placement?.position.y ?? 0) - 80 },
    };
  });

  const loads: LoadSymbol[] = input.loads.map((load) => {
    const placement = placements.get(load.id) ?? placements.get(load.nodeId);
    return {
      id: load.id,
      elementId: load.id,
      elementType: 'Load',
      elementName: load.name,
      inService: load.inService,
      connectedToNodeId: load.nodeId,
      position: { x: placement?.position.x ?? 0, y: (placement?.position.y ?? 0) + 90 },
    };
  });

  const branches: BranchSymbol[] = input.branches.map((branch) => {
    const edgeId = `edge_${branch.id}`;
    const route = layout.edgeRoutes.find((edge) => edge.edgeId === edgeId);
    const branchType = branch.kind === BranchKind.CABLE ? 'CABLE' : 'LINE';
    return {
      id: branch.id,
      elementId: branch.id,
      elementType: branch.kind === BranchKind.TR_LINK ? 'TransformerBranch' : 'LineBranch',
      elementName: branch.name,
      inService: branch.inService,
      fromNodeId: branch.fromNodeId,
      toNodeId: branch.toNodeId,
      branchType,
      position: route?.startPoint ?? { x: 0, y: 0 },
      points: route ? routeToPoints(route.segments) : [],
    };
  });

  return [...buses, ...branches, ...sources, ...loads];
}

function createConnections(symbols: readonly AnySldSymbol[]): readonly ReferenceScenarioConnection[] {
  return symbols
    .filter((symbol): symbol is BranchSymbol =>
      symbol.elementType === 'LineBranch' || symbol.elementType === 'TransformerBranch',
    )
    .map((symbol) => ({
      id: symbol.id,
      elementType: symbol.elementType,
      fromNodeId: symbol.fromNodeId,
      toNodeId: symbol.toNodeId,
      path: symbol.points,
      branchType: symbol.branchType,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function buildReferenceScenario(scenarioId: ReferenceScenarioId): ReferenceScenarioResult {
  const input = buildScenarioInput(scenarioId);
  const adapter = buildVisualGraphFromTopology(input);
  const layout = computeLayout(adapter.graph, DEFAULT_LAYOUT_CONFIG, adapter.stationBlockDetails);
  const symbols = createSymbols(input, layout);
  const connections = createConnections(symbols);

  return {
    scenarioId,
    input,
    symbols,
    connections,
    canonicalAnnotations: layout.canonicalAnnotations,
  };
}
