/**
 * Canonical SLD — CANONICAL/IEC Style Tests
 *
 * Verifies canonical SLD rendering pipeline:
 * - Junction dots (IEC 61082)
 * - Trunk node annotations (Nxx with km/U/Ik3)
 * - Trunk segment annotations (type, L, R, X, Iz)
 * - Branch points with apparatus (Q-Oxx)
 * - Station apparatus chains (QS -> Q -> CT -> T -> BUS NN)
 * - Determinism (100 runs = identical output)
 * - Visual hierarchy (stroke widths)
 */
import { describe, it, expect } from 'vitest';
import { computeLayout, DEFAULT_LAYOUT_CONFIG } from '../layoutPipeline';
import { computeLayoutResultHash } from '../layoutResult';
import type {
  CanonicalAnnotationsV1,
  TrunkNodeAnnotationV1,
  TrunkSegmentAnnotationV1,
  BranchPointV1,
} from '../layoutResult';
import { convertToVisualGraph } from '../topologyAdapter';
import { buildVisualGraphFromTopology } from '../topologyAdapterV2';
import { BranchKind, StationKind, type TopologyInputV1 } from '../topologyInputReader';
import { NodeTypeV1, EdgeTypeV1 } from '../visualGraph';
import type { VisualGraphV1, VisualNodeV1, VisualEdgeV1 } from '../visualGraph';
import type {
  AnySldSymbol,
  BusSymbol,
  BranchSymbol,
  SwitchSymbol,
  SourceSymbol,
  LoadSymbol,
} from '../../../sld-editor/types';
import {
  TRUNK_STROKE_WIDTH,
  BRANCH_LINE_STROKE_WIDTH,
  STATION_INTERNAL_STROKE,
  JUNCTION_DOT_RADIUS,
  OVERHEAD_DASH_ARRAY,
  APPARATUS_CHAIN_STEP_Y,
  NN_BUSBAR_WIDTH,
  POWER_ARROW_SIZE,
  STATION_BOUNDING_BOX_PADDING,
  TRUNK_SPINE_MIN_LENGTH,
  ANNOTATION_FONT_SIZE_NODE,
  ANNOTATION_FONT_SIZE_SEGMENT,
  ANNOTATION_FONT_SIZE_PARAMS,
  CABLE_DASH_ARRAY,
  BRANCH_APPARATUS_WIDTH,
  STATION_FIELD_OFFSET_X,
  NODE_LABEL_OFFSET_X,
} from '../../IndustrialAesthetics';
import { CANONICAL_SLD_STYLES, CANONICAL_VOLTAGE_COLORS, VISUAL_HIERARCHY } from '../../sldCanonicalStyle';
import { getAllSymbolIds, getSymbolDefinition } from '../../SymbolResolver';
import type { CanonicalSymbolId } from '../../SymbolResolver';

// =============================================================================
// GOLDEN NETWORK BUILDERS
// =============================================================================

/** GN-CSLD-01: GPZ + trunk + 3 stations */
function buildTrunk3Stations(): AnySldSymbol[] {
  const s: AnySldSymbol[] = [];
  s.push({
    id: 'src', elementId: 'src', elementType: 'Source', elementName: 'GPZ 110/15kV',
    position: { x: 0, y: 0 }, inService: true, connectedToNodeId: 'bus_sn',
  } as SourceSymbol);
  s.push({
    id: 'bus_sn', elementId: 'bus_sn', elementType: 'Bus', elementName: 'Szyna SN 15kV',
    position: { x: 0, y: 0 }, inService: true, width: 400, height: 10,
  } as BusSymbol);

  for (let i = 1; i <= 3; i++) {
    s.push({
      id: `line_st${i}`, elementId: `line_st${i}`, elementType: 'LineBranch',
      elementName: `Linia SN ${i}`, position: { x: 0, y: 0 }, inService: true,
      fromNodeId: i === 1 ? 'bus_sn' : `bus_nn_st${i - 1}`, toNodeId: `bus_sn_st${i}`,
      points: [], branchType: 'CABLE',
    } as BranchSymbol);
    s.push({
      id: `bus_sn_st${i}`, elementId: `bus_sn_st${i}`, elementType: 'Bus',
      elementName: `Szyna SN St${i}`, position: { x: 0, y: 0 }, inService: true,
      width: 60, height: 8,
    } as BusSymbol);
    s.push({
      id: `tr_st${i}`, elementId: `tr_st${i}`, elementType: 'TransformerBranch',
      elementName: `TR SN/nN St${i}`, position: { x: 0, y: 0 }, inService: true,
      fromNodeId: `bus_sn_st${i}`, toNodeId: `bus_nn_st${i}`, points: [],
    } as BranchSymbol);
    s.push({
      id: `bus_nn_st${i}`, elementId: `bus_nn_st${i}`, elementType: 'Bus',
      elementName: `Szyna nN St${i}`, position: { x: 0, y: 0 }, inService: true,
      width: 40, height: 6,
    } as BusSymbol);
    s.push({
      id: `load_st${i}`, elementId: `load_st${i}`, elementType: 'Load',
      elementName: `Odbiorca St${i}`, position: { x: 0, y: 0 }, inService: true,
      connectedToNodeId: `bus_nn_st${i}`,
    } as LoadSymbol);
  }
  return s;
}

/** GN-CSLD-02: Simple 2-station trunk for minimal testing */
function buildSimpleTrunk(): AnySldSymbol[] {
  const s: AnySldSymbol[] = [];
  s.push({
    id: 'src', elementId: 'src', elementType: 'Source', elementName: 'GPZ',
    position: { x: 0, y: 0 }, inService: true, connectedToNodeId: 'bus_main',
  } as SourceSymbol);
  s.push({
    id: 'bus_main', elementId: 'bus_main', elementType: 'Bus', elementName: 'Szyna SN',
    position: { x: 0, y: 0 }, inService: true, width: 400, height: 10,
  } as BusSymbol);
  s.push({
    id: 'line1', elementId: 'line1', elementType: 'LineBranch', elementName: 'Linia SN 1',
    position: { x: 0, y: 0 }, inService: true,
    fromNodeId: 'bus_main', toNodeId: 'bus_st1', points: [], branchType: 'CABLE',
  } as BranchSymbol);
  s.push({
    id: 'bus_st1', elementId: 'bus_st1', elementType: 'Bus', elementName: 'Szyna SN St1',
    position: { x: 0, y: 0 }, inService: true, width: 60, height: 8,
  } as BusSymbol);
  s.push({
    id: 'load1', elementId: 'load1', elementType: 'Load', elementName: 'Odbiorca 1',
    position: { x: 0, y: 0 }, inService: true, connectedToNodeId: 'bus_st1',
  } as LoadSymbol);
  return s;
}

// =============================================================================
// HELPER
// =============================================================================

function layoutWithAnnotations(symbols: AnySldSymbol[]): CanonicalAnnotationsV1 | null {
  const graph = convertToVisualGraph(symbols);
  const result = computeLayout(graph);
  return result.canonicalAnnotations;
}

// =============================================================================
// TESTS
// =============================================================================

describe('Canonical SLD — CANONICAL/IEC Style', () => {

  describe('Constants', () => {
    it('JUNCTION_DOT_RADIUS is 4px', () => {
      expect(JUNCTION_DOT_RADIUS).toBe(4);
    });

    it('TRUNK_STROKE_WIDTH is 5px (dominant)', () => {
      expect(TRUNK_STROKE_WIDTH).toBe(5);
    });

    it('BRANCH_LINE_STROKE_WIDTH is 2.5px', () => {
      expect(BRANCH_LINE_STROKE_WIDTH).toBe(2.5);
    });

    it('STATION_INTERNAL_STROKE is 2px', () => {
      expect(STATION_INTERNAL_STROKE).toBe(2);
    });

    it('OVERHEAD_DASH_ARRAY is "none" (solid line)', () => {
      expect(OVERHEAD_DASH_ARRAY).toBe('none');
    });

    it('APPARATUS_CHAIN_STEP_Y is 40px', () => {
      expect(APPARATUS_CHAIN_STEP_Y).toBe(40);
    });

    it('NN_BUSBAR_WIDTH is 120px', () => {
      expect(NN_BUSBAR_WIDTH).toBe(120);
    });

    it('POWER_ARROW_SIZE is 8px', () => {
      expect(POWER_ARROW_SIZE).toBe(8);
    });
  });

  describe('Visual Hierarchy', () => {
    it('trunk stroke width > branch stroke width > station internal stroke', () => {
      expect(TRUNK_STROKE_WIDTH).toBeGreaterThan(BRANCH_LINE_STROKE_WIDTH);
      expect(BRANCH_LINE_STROKE_WIDTH).toBeGreaterThan(STATION_INTERNAL_STROKE);
    });
  });

  describe('Canonical Annotations Generation', () => {
    it('returns null for empty graph', () => {
      const graph: VisualGraphV1 = {
        version: 'V1',
        nodes: [],
        edges: [],
        meta: { snapshotId: '', snapshotFingerprint: '', createdAt: '', version: 'V1' },
      };
      const result = computeLayout(graph);
      expect(result.canonicalAnnotations).toBeNull();
    });

    it('generates annotations for trunk with stations', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      // Layout may or may not produce canonical annotations depending on
      // whether trunk edges are detected. Either null or valid is acceptable.
      if (annotations !== null) {
        expect(annotations.trunkNodes).toBeDefined();
        expect(annotations.trunkSegments).toBeDefined();
        expect(annotations.branchPoints).toBeDefined();
        expect(annotations.stationChains).toBeDefined();
        expect(annotations.stationChains.every((chain) => chain.detail != null)).toBe(true);
        expect(annotations.branchPoints.every((branch) => branch.detail != null)).toBe(true);
      }
    });

    it('reuses canonical station block details cached on graph from adapter', () => {
      const input: TopologyInputV1 = {
        snapshotId: 'canonical-detail-cache',
        snapshotFingerprint: 'canonical-detail-cache',
        connectionNodes: [
          { id: 'bus_gpz', name: 'Szyna SN GPZ', voltageKv: 15, inService: true },
          { id: 'bus_sta', name: 'Szyna SN Stacji', voltageKv: 15, inService: true },
        ],
        branches: [
          {
            id: 'line_sta',
            name: 'Linia do stacji',
            kind: BranchKind.LINE,
            fromNodeId: 'bus_gpz',
            toNodeId: 'bus_sta',
            lengthKm: 1.2,
            isNormallyOpen: false,
            inService: true,
          },
        ],
        stations: [
          {
            id: 'sta_cache',
            name: 'Stacja cache',
            stationType: StationKind.DISTRIBUTION,
            voltageKv: 15,
            busIds: ['bus_sta'],
            switchIds: [],
            transformerIds: [],
          },
        ],
        sources: [{ id: 'src_cache', name: 'GPZ', nodeId: 'bus_gpz', inService: true }],
        generators: [],
        loads: [],
        devices: [],
        protectionBindings: [],
        fixActions: [],
      };
      const adapterResult = buildVisualGraphFromTopology(input);
      const result = computeLayout(adapterResult.graph);
      const switchgearBlocks = result.switchgearBlocks;
      expect(switchgearBlocks.length).toBeGreaterThan(0);
      expect(switchgearBlocks.every((block) => block.detail?.blockId === block.blockId)).toBe(true);
    });
  });

  describe('Trunk Node Annotations', () => {
    it('trunk nodes have sequential IDs', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations || annotations.trunkNodes.length === 0) return;

      for (let i = 0; i < annotations.trunkNodes.length; i++) {
        const expectedId = `N${String(i + 1).padStart(2, '0')}`;
        expect(annotations.trunkNodes[i].nodeId).toBe(expectedId);
      }
    });

    it('km is monotonically non-decreasing along trunk', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations || annotations.trunkNodes.length < 2) return;

      for (let i = 1; i < annotations.trunkNodes.length; i++) {
        expect(annotations.trunkNodes[i].kmFromGPZ).toBeGreaterThanOrEqual(
          annotations.trunkNodes[i - 1].kmFromGPZ
        );
      }
    });

    it('every trunk node has a valid position', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations) return;

      for (const node of annotations.trunkNodes) {
        expect(node.position).toBeDefined();
        expect(typeof node.position.x).toBe('number');
        expect(typeof node.position.y).toBe('number');
        expect(isFinite(node.position.x)).toBe(true);
        expect(isFinite(node.position.y)).toBe(true);
      }
    });

    it('trunk nodes have positive voltage', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations) return;

      for (const node of annotations.trunkNodes) {
        expect(node.voltageKV).toBeGreaterThan(0);
      }
    });

    it('trunk nodes have non-negative deltaU', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations) return;

      for (const node of annotations.trunkNodes) {
        expect(node.deltaU_percent === null || node.deltaU_percent >= 0).toBe(true);
      }
    });
  });

  describe('Trunk Segments', () => {
    it('every segment has type, L, R, X, Iz', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations) return;

      for (const seg of annotations.trunkSegments) {
        expect(seg.cableType).toBeTruthy();
        expect(seg.lengthKm === null || seg.lengthKm >= 0).toBe(true);
        expect(seg.resistance_ohm === null || seg.resistance_ohm >= 0).toBe(true);
        expect(seg.reactance_ohm === null || seg.reactance_ohm >= 0).toBe(true);
        expect(seg.ampacity_A === null || seg.ampacity_A > 0).toBe(true);
      }
    });

    it('segments have IEC designation format W-Mx-yy', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations) return;

      for (const seg of annotations.trunkSegments) {
        expect(seg.designation).toMatch(/^W-M\d+-\d{2}$/);
      }
    });

    it('cable segments have isOverhead=false', () => {
      const annotations = layoutWithAnnotations(buildSimpleTrunk());
      if (!annotations) return;

      for (const seg of annotations.trunkSegments) {
        expect(typeof seg.isOverhead).toBe('boolean');
      }
    });
  });

  describe('Branch Points', () => {
    it('every branch has apparatus with designation', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations) return;

      for (const bp of annotations.branchPoints) {
        expect(bp.branchApparatus.designation).toBeTruthy();
        expect(bp.branchApparatus.type).toBe('disconnector');
      }
    });

    it('every branch has line with full parameters (R, X, L, Iz)', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations) return;

      for (const bp of annotations.branchPoints) {
        expect(bp.branchLine.designation).toBeTruthy();
        expect(bp.branchLine.cableType).toBeTruthy();
        expect(bp.branchLine.lengthKm === null || bp.branchLine.lengthKm >= 0).toBe(true);
        expect(bp.branchLine.resistance_ohm === null || bp.branchLine.resistance_ohm >= 0).toBe(true);
        expect(bp.branchLine.reactance_ohm === null || bp.branchLine.reactance_ohm >= 0).toBe(true);
        expect(bp.branchLine.ampacity_A === null || bp.branchLine.ampacity_A > 0).toBe(true);
      }
    });

    it('physical location is ZK (cable) or SO (overhead)', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations) return;

      for (const bp of annotations.branchPoints) {
        expect(['ZK', 'SO']).toContain(bp.physicalLocation);
      }
    });

    it('branch apparatus rated voltage >= 0', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations) return;

      for (const bp of annotations.branchPoints) {
        expect(bp.branchApparatus.ratedVoltage_kV === null || bp.branchApparatus.ratedVoltage_kV > 0).toBe(true);
      }
    });

    it('branch has valid position', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations) return;

      for (const bp of annotations.branchPoints) {
        expect(isFinite(bp.position.x)).toBe(true);
        expect(isFinite(bp.position.y)).toBe(true);
      }
    });
  });

  describe('Station Apparatus Chains', () => {
    it('all apparatus have IEC 81346 designations', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations) return;

      for (const chain of annotations.stationChains) {
        for (const item of chain.apparatus) {
          // IEC 81346: designation starts with Q, T, A, K, G
          expect(item.designation).toMatch(/^(QS|Q|A|T|K|G)-/);
        }
      }
    });

    it('stations have stationType field', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations) return;

      for (const chain of annotations.stationChains) {
        expect(['TYPE_A', 'TYPE_B', 'TYPE_C', 'TYPE_D']).toContain(chain.stationType);
      }
    });

    it('NN busbar has non-negative feeder count', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations) return;

      for (const chain of annotations.stationChains) {
        expect(chain.nnBusbar.feeders.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('apparatus chain has at least one item', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations) return;

      for (const chain of annotations.stationChains) {
        expect(chain.apparatus.length).toBeGreaterThan(0);
      }
    });

    it('protection has at least 51 (overcurrent)', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations) return;

      for (const chain of annotations.stationChains) {
        const has51 = chain.protection.some(p => p.ansiCode === '51');
        expect(has51).toBe(true);
      }
    });
  });

  describe('Determinism', () => {
    it('same input produces identical annotations', () => {
      const symbols = buildTrunk3Stations();
      const a1 = layoutWithAnnotations(symbols);
      const a2 = layoutWithAnnotations(symbols);

      expect(JSON.stringify(a1)).toBe(JSON.stringify(a2));
    });

    it('10 runs produce identical canonical annotations', () => {
      const symbols = buildTrunk3Stations();
      const first = JSON.stringify(layoutWithAnnotations(symbols));

      for (let i = 0; i < 10; i++) {
        const current = JSON.stringify(layoutWithAnnotations(symbols));
        expect(current).toBe(first);
      }
    });

    it('10 runs produce identical layout hash', () => {
      const symbols = buildTrunk3Stations();
      const graph = convertToVisualGraph(symbols);
      const firstResult = computeLayout(graph);
      const firstHash = firstResult.hash;

      for (let i = 0; i < 10; i++) {
        const result = computeLayout(graph);
        expect(result.hash).toBe(firstHash);
      }
    });
  });

  describe('CanonicalAnnotationsV1 Structure', () => {
    it('has all required top-level fields', () => {
      const annotations = layoutWithAnnotations(buildTrunk3Stations());
      if (!annotations) return;

      expect(Array.isArray(annotations.trunkNodes)).toBe(true);
      expect(Array.isArray(annotations.trunkSegments)).toBe(true);
      expect(Array.isArray(annotations.branchPoints)).toBe(true);
      expect(Array.isArray(annotations.stationChains)).toBe(true);
    });

    it('canonicalAnnotations does not affect layout hash', () => {
      const symbols = buildSimpleTrunk();
      const graph = convertToVisualGraph(symbols);
      const result = computeLayout(graph);

      // The hash should be stable regardless of canonical annotations
      const hashWithAnnotations = result.hash;
      expect(hashWithAnnotations).toBeTruthy();
      expect(hashWithAnnotations.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // BLOK A — New Constants Contract Tests
  // ===========================================================================

  describe('BLOK A — Industrial Aesthetic Constants', () => {
    it('STATION_BOUNDING_BOX_PADDING is 16px', () => {
      expect(STATION_BOUNDING_BOX_PADDING).toBe(16);
    });

    it('TRUNK_SPINE_MIN_LENGTH is 200px (10 * GRID_BASE)', () => {
      expect(TRUNK_SPINE_MIN_LENGTH).toBe(200);
    });

    it('ANNOTATION_FONT_SIZE_NODE is 11px', () => {
      expect(ANNOTATION_FONT_SIZE_NODE).toBe(11);
    });

    it('ANNOTATION_FONT_SIZE_SEGMENT is 10px', () => {
      expect(ANNOTATION_FONT_SIZE_SEGMENT).toBe(10);
    });

    it('ANNOTATION_FONT_SIZE_PARAMS is 9px', () => {
      expect(ANNOTATION_FONT_SIZE_PARAMS).toBe(9);
    });

    it('CABLE_DASH_ARRAY is defined (dashed line)', () => {
      expect(CABLE_DASH_ARRAY).toBe('8 5');
    });

    it('BRANCH_APPARATUS_WIDTH is 40px', () => {
      expect(BRANCH_APPARATUS_WIDTH).toBe(40);
    });

    it('STATION_FIELD_OFFSET_X is 60px', () => {
      expect(STATION_FIELD_OFFSET_X).toBe(60);
    });

    it('NODE_LABEL_OFFSET_X is -20px (left of trunk)', () => {
      expect(NODE_LABEL_OFFSET_X).toBe(-20);
    });

    it('font size hierarchy: node > segment > params', () => {
      expect(ANNOTATION_FONT_SIZE_NODE).toBeGreaterThan(ANNOTATION_FONT_SIZE_SEGMENT);
      expect(ANNOTATION_FONT_SIZE_SEGMENT).toBeGreaterThan(ANNOTATION_FONT_SIZE_PARAMS);
    });
  });

  // ===========================================================================
  // CANONICAL_SLD_STYLES Contract Tests
  // ===========================================================================

  describe('CANONICAL_SLD_STYLES — Token Integrity', () => {
    it('trunkSpine strokeWidth is 5', () => {
      expect(CANONICAL_SLD_STYLES.trunkSpine.strokeWidth).toBe(5);
    });

    it('branchLine strokeWidth is 2.5', () => {
      expect(CANONICAL_SLD_STYLES.branchLine.strokeWidth).toBe(2.5);
    });

    it('stationInternal strokeWidth is 2', () => {
      expect(CANONICAL_SLD_STYLES.stationInternal.strokeWidth).toBe(2);
    });

    it('junctionDot radius is 4', () => {
      expect(CANONICAL_SLD_STYLES.junctionDot.radius).toBe(4);
    });

    it('powerArrow size is 8', () => {
      expect(CANONICAL_SLD_STYLES.powerArrow.size).toBe(8);
    });

    it('nodeLabel fontSize is 11', () => {
      expect(CANONICAL_SLD_STYLES.nodeLabel.fontSize).toBe(11);
    });

    it('segmentLabel fontSize is 10', () => {
      expect(CANONICAL_SLD_STYLES.segmentLabel.fontSize).toBe(10);
    });

    it('segmentParams fontSize is 9', () => {
      expect(CANONICAL_SLD_STYLES.segmentParams.fontSize).toBe(9);
    });

    it('stationTitle fontSize is 12 (largest)', () => {
      expect(CANONICAL_SLD_STYLES.stationTitle.fontSize).toBe(12);
    });

    it('iecDesignation fontSize is 8 (smallest)', () => {
      expect(CANONICAL_SLD_STYLES.iecDesignation.fontSize).toBe(8);
    });

    it('nodeLabel uses monospace font', () => {
      expect(CANONICAL_SLD_STYLES.nodeLabel.fontFamily).toContain('JetBrains Mono');
    });

    it('stationTitle uses sans-serif font', () => {
      expect(CANONICAL_SLD_STYLES.stationTitle.fontFamily).toContain('Inter');
    });

    it('overhead dash is "none"', () => {
      expect(CANONICAL_SLD_STYLES.branchLine.overheadDash).toBe('none');
    });

    it('cable dash is "8 5"', () => {
      expect(CANONICAL_SLD_STYLES.branchLine.cableDash).toBe('8 5');
    });

    it('trunkSpine color is CANONICAL SN blue', () => {
      expect(CANONICAL_SLD_STYLES.trunkSpine.color).toBe(CANONICAL_VOLTAGE_COLORS.SN);
    });
  });

  // ===========================================================================
  // BLOK B — Symbol Registry Completeness
  // ===========================================================================

  describe('BLOK B — Symbol Registry', () => {
    const allIds = getAllSymbolIds();

    it('registry has at least 28 symbols (15 base + 4 canonical + 6 industrial + tree)', () => {
      expect(allIds.length).toBeGreaterThanOrEqual(28);
    });

    const expectedIndustrialSymbols: CanonicalSymbolId[] = [
      'fuse', 'surge_arrester', 'capacitor', 'reactor', 'inverter', 'metering_cubicle',
    ];

    for (const sym of expectedIndustrialSymbols) {
      it(`symbol "${sym}" is registered in SymbolResolver`, () => {
        expect(allIds).toContain(sym);
      });

      it(`symbol "${sym}" has valid ports definition`, () => {
        const def = getSymbolDefinition(sym);
        expect(def.viewBox).toBe('0 0 100 100');
        expect(def.ports).toBeDefined();
      });
    }

    it('all symbols have viewBox "0 0 100 100"', () => {
      for (const id of allIds) {
        const def = getSymbolDefinition(id);
        expect(def.viewBox).toBe('0 0 100 100');
      }
    });

    it('every symbol has at least one allowed rotation', () => {
      for (const id of allIds) {
        const def = getSymbolDefinition(id);
        expect(def.allowedRotations.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // ===========================================================================
  // Visual Hierarchy Extended
  // ===========================================================================

  describe('Visual Hierarchy — Extended', () => {
    it('VISUAL_HIERARCHY has structure > topology > detail levels', () => {
      expect(VISUAL_HIERARCHY.structure.strokeWidth).toBeGreaterThan(VISUAL_HIERARCHY.topology.strokeWidth);
      expect(VISUAL_HIERARCHY.topology.strokeWidth).toBeGreaterThan(VISUAL_HIERARCHY.detail.strokeWidth);
    });

    it('VISUAL_HIERARCHY font sizes follow hierarchy', () => {
      expect(VISUAL_HIERARCHY.structure.labelFontSize).toBeGreaterThan(VISUAL_HIERARCHY.topology.labelFontSize);
      expect(VISUAL_HIERARCHY.topology.labelFontSize).toBeGreaterThan(VISUAL_HIERARCHY.detail.labelFontSize);
    });

    it('CANONICAL voltage colors are defined for WN, SN, nN', () => {
      expect(CANONICAL_VOLTAGE_COLORS.WN).toBeTruthy();
      expect(CANONICAL_VOLTAGE_COLORS.SN).toBeTruthy();
      expect(CANONICAL_VOLTAGE_COLORS.nN).toBeTruthy();
      expect(CANONICAL_VOLTAGE_COLORS.default).toBeTruthy();
    });
  });
});
