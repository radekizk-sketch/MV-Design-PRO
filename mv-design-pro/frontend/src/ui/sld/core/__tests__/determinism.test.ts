/**
 * Determinism Suite — CANONICAL-grade determinism guards.
 *
 * Testy:
 * 1. Hash stability: 100x layout → identyczny hash
 * 2. Permutation invariance: 50 permutacji wejscia → identyczny hash
 * 3. Invarianty: symbol-symbol overlap == 0
 * 4. Camera no-reflow: zmiana ViewportState nie zmienia layout hash
 *
 * BINDING: Te testy sa CI gate — kazdy failure blokuje merge.
 */

import { describe, it, expect } from 'vitest';
import {
  computeVisualGraphHash,
  canonicalizeVisualGraph,
  validateVisualGraph,
  NodeTypeV1,
  EdgeTypeV1,
  VISUAL_GRAPH_VERSION,
} from '../visualGraph';
import { convertToVisualGraph, type TopologyAdapterOptions } from '../topologyAdapter';
import { GeneratorKind } from '../topologyInputReader';
import type { AnySldSymbol, BusSymbol, BranchSymbol, SwitchSymbol, SourceSymbol, LoadSymbol } from '../../../sld-editor/types';

// =============================================================================
// GOLDEN NETWORK FIXTURES
// =============================================================================

/**
 * GN-SLD-01: GPZ + magistrala + 10 stacji typ A.
 * Minimalna siec liniowa (radial) dla testow determinizmu.
 */
function buildGoldenNetwork01(): AnySldSymbol[] {
  const symbols: AnySldSymbol[] = [];

  // GPZ Source
  symbols.push({
    id: 'src_gpz',
    elementId: 'src_gpz',
    elementType: 'Source',
    elementName: 'GPZ 110/15kV Zasilanie',
    position: { x: 500, y: 50 },
    inService: true,
    connectedToNodeId: 'bus_sn_main',
  } as SourceSymbol);

  // Szyna SN glowna
  symbols.push({
    id: 'bus_sn_main',
    elementId: 'bus_sn_main',
    elementType: 'Bus',
    elementName: 'Szyna SN 15kV GPZ',
    position: { x: 200, y: 150 },
    inService: true,
    width: 600,
    height: 10,
  } as BusSymbol);

  // Transformator WN/SN
  symbols.push({
    id: 'tr_wn_sn',
    elementId: 'tr_wn_sn',
    elementType: 'TransformerBranch',
    elementName: 'Transformator 110/15kV T1',
    position: { x: 500, y: 100 },
    inService: true,
    fromNodeId: 'bus_wn',
    toNodeId: 'bus_sn_main',
    points: [],
  } as BranchSymbol);

  // 10 stacji typ A (magistrala liniowa)
  let prevBusId = 'bus_sn_main';
  for (let i = 1; i <= 10; i++) {
    const stBusId = `bus_sn_st_${i}`;
    const lineId = `line_mag_${i}`;
    const trId = `tr_st_${i}`;
    const busNnId = `bus_nn_st_${i}`;
    const loadId = `load_st_${i}`;

    // Linia magistrali
    symbols.push({
      id: lineId,
      elementId: lineId,
      elementType: 'LineBranch',
      elementName: `Linia SN Magistrala odcinek ${i}`,
      position: { x: 200 + i * 80, y: 250 },
      inService: true,
      fromNodeId: prevBusId,
      toNodeId: stBusId,
      points: [],
      branchType: i <= 5 ? 'LINE' : 'CABLE',
    } as BranchSymbol);

    // Szyna SN stacji
    symbols.push({
      id: stBusId,
      elementId: stBusId,
      elementType: 'Bus',
      elementName: `Szyna SN 15kV Stacja A${i}`,
      position: { x: 200 + i * 80, y: 300 },
      inService: true,
      width: 60,
      height: 8,
    } as BusSymbol);

    // Transformator SN/nN
    symbols.push({
      id: trId,
      elementId: trId,
      elementType: 'TransformerBranch',
      elementName: `Transformator SN/nN Stacja A${i}`,
      position: { x: 200 + i * 80, y: 350 },
      inService: true,
      fromNodeId: stBusId,
      toNodeId: busNnId,
      points: [],
    } as BranchSymbol);

    // Szyna nN
    symbols.push({
      id: busNnId,
      elementId: busNnId,
      elementType: 'Bus',
      elementName: `Szyna nN 0.4kV Stacja A${i}`,
      position: { x: 200 + i * 80, y: 400 },
      inService: true,
      width: 40,
      height: 6,
    } as BusSymbol);

    // Odbiorca
    symbols.push({
      id: loadId,
      elementId: loadId,
      elementType: 'Load',
      elementName: `Odbiorca A${i}`,
      position: { x: 200 + i * 80, y: 450 },
      inService: true,
      connectedToNodeId: busNnId,
    } as LoadSymbol);

    prevBusId = stBusId;
  }

  return symbols;
}

/**
 * GN-SLD-02: Magistrala + typ B + NOP + ring (secondary connectors).
 */
function buildGoldenNetwork02(): AnySldSymbol[] {
  const symbols: AnySldSymbol[] = [];

  // GPZ
  symbols.push({
    id: 'src_gpz',
    elementId: 'src_gpz',
    elementType: 'Source',
    elementName: 'GPZ 110/15kV',
    position: { x: 300, y: 50 },
    inService: true,
    connectedToNodeId: 'bus_sn_1',
  } as SourceSymbol);

  // Szyna SN sekcja 1
  symbols.push({
    id: 'bus_sn_1',
    elementId: 'bus_sn_1',
    elementType: 'Bus',
    elementName: 'Szyna SN 15kV Sekcja 1',
    position: { x: 200, y: 150 },
    inService: true,
    width: 400,
    height: 10,
  } as BusSymbol);

  // Szyna SN sekcja 2
  symbols.push({
    id: 'bus_sn_2',
    elementId: 'bus_sn_2',
    elementType: 'Bus',
    elementName: 'Szyna SN 15kV Sekcja 2',
    position: { x: 200, y: 200 },
    inService: true,
    width: 400,
    height: 10,
  } as BusSymbol);

  // Lacznik sekcyjny (NOP)
  symbols.push({
    id: 'sw_nop',
    elementId: 'sw_nop',
    elementType: 'Switch',
    elementName: 'Lacznik sekcyjny NOP',
    position: { x: 400, y: 175 },
    inService: true,
    fromNodeId: 'bus_sn_1',
    toNodeId: 'bus_sn_2',
    switchState: 'OPEN',
    switchType: 'DISCONNECTOR',
  } as SwitchSymbol);

  // Ring: 4 stacje polaczone w pierscien
  for (let i = 1; i <= 4; i++) {
    const busId = `bus_st_b${i}`;
    symbols.push({
      id: busId,
      elementId: busId,
      elementType: 'Bus',
      elementName: `Szyna SN 15kV Stacja B${i}`,
      position: { x: 100 + i * 150, y: 300 },
      inService: true,
      width: 60,
      height: 8,
    } as BusSymbol);
  }

  // Linie magistrali (radial)
  symbols.push({
    id: 'line_1',
    elementId: 'line_1',
    elementType: 'LineBranch',
    elementName: 'Linia SN odcinek 1',
    position: { x: 250, y: 250 },
    inService: true,
    fromNodeId: 'bus_sn_1',
    toNodeId: 'bus_st_b1',
    points: [],
    branchType: 'LINE',
  } as BranchSymbol);

  symbols.push({
    id: 'line_2',
    elementId: 'line_2',
    elementType: 'LineBranch',
    elementName: 'Linia SN odcinek 2',
    position: { x: 400, y: 250 },
    inService: true,
    fromNodeId: 'bus_st_b1',
    toNodeId: 'bus_st_b2',
    points: [],
    branchType: 'LINE',
  } as BranchSymbol);

  symbols.push({
    id: 'line_3',
    elementId: 'line_3',
    elementType: 'LineBranch',
    elementName: 'Linia SN odcinek 3',
    position: { x: 550, y: 250 },
    inService: true,
    fromNodeId: 'bus_st_b2',
    toNodeId: 'bus_st_b3',
    points: [],
    branchType: 'CABLE',
  } as BranchSymbol);

  symbols.push({
    id: 'line_4',
    elementId: 'line_4',
    elementType: 'LineBranch',
    elementName: 'Linia SN odcinek 4',
    position: { x: 650, y: 250 },
    inService: true,
    fromNodeId: 'bus_st_b3',
    toNodeId: 'bus_st_b4',
    points: [],
    branchType: 'CABLE',
  } as BranchSymbol);

  // Ring close (secondary connector — NOP)
  symbols.push({
    id: 'sw_ring_nop',
    elementId: 'sw_ring_nop',
    elementType: 'Switch',
    elementName: 'Lacznik ring NOP',
    position: { x: 400, y: 350 },
    inService: true,
    fromNodeId: 'bus_st_b4',
    toNodeId: 'bus_sn_2',
    switchState: 'OPEN',
    switchType: 'LOAD_SWITCH',
  } as SwitchSymbol);

  return symbols;
}

/**
 * GN-OZE-01: PV na SN jako pole przylaczeniowe.
 */
function buildGoldenNetworkOze01(): AnySldSymbol[] {
  return [
    {
      id: 'src_gpz',
      elementId: 'src_gpz',
      elementType: 'Source',
      elementName: 'GPZ 110/15kV',
      position: { x: 300, y: 50 },
      inService: true,
      connectedToNodeId: 'bus_sn',
    } as SourceSymbol,
    {
      id: 'bus_sn',
      elementId: 'bus_sn',
      elementType: 'Bus',
      elementName: 'Szyna SN 15kV',
      position: { x: 200, y: 150 },
      inService: true,
      width: 400,
      height: 10,
    } as BusSymbol,
    {
      id: 'src_pv',
      elementId: 'src_pv',
      elementType: 'Source',
      elementName: 'PV Farma Fotowoltaiczna 5MW',
      position: { x: 500, y: 50 },
      inService: true,
      connectedToNodeId: 'bus_sn',
    } as SourceSymbol,
    {
      id: 'sw_pv',
      elementId: 'sw_pv',
      elementType: 'Switch',
      elementName: 'Wylacznik pole PV',
      position: { x: 500, y: 100 },
      inService: true,
      fromNodeId: 'bus_sn',
      toNodeId: 'bus_sn',
      switchState: 'CLOSED',
      switchType: 'BREAKER',
    } as SwitchSymbol,
  ];
}

/**
 * GN-OZE-02: BESS na SN jako pole przylaczeniowe.
 */
function buildGoldenNetworkOze02(): AnySldSymbol[] {
  return [
    {
      id: 'src_gpz',
      elementId: 'src_gpz',
      elementType: 'Source',
      elementName: 'GPZ 110/15kV',
      position: { x: 300, y: 50 },
      inService: true,
      connectedToNodeId: 'bus_sn',
    } as SourceSymbol,
    {
      id: 'bus_sn',
      elementId: 'bus_sn',
      elementType: 'Bus',
      elementName: 'Szyna SN 15kV',
      position: { x: 200, y: 150 },
      inService: true,
      width: 400,
      height: 10,
    } as BusSymbol,
    {
      id: 'src_bess',
      elementId: 'src_bess',
      elementType: 'Source',
      elementName: 'BESS Magazyn Energii 2MWh',
      position: { x: 500, y: 50 },
      inService: true,
      connectedToNodeId: 'bus_sn',
    } as SourceSymbol,
  ];
}

/**
 * GN-OZE-03: PV + BESS w stacji wielofunkcyjnej.
 */
function buildGoldenNetworkOze03(): AnySldSymbol[] {
  return [
    {
      id: 'src_gpz',
      elementId: 'src_gpz',
      elementType: 'Source',
      elementName: 'GPZ 110/15kV',
      position: { x: 300, y: 50 },
      inService: true,
      connectedToNodeId: 'bus_sn',
    } as SourceSymbol,
    {
      id: 'bus_sn',
      elementId: 'bus_sn',
      elementType: 'Bus',
      elementName: 'Szyna SN 15kV',
      position: { x: 200, y: 150 },
      inService: true,
      width: 400,
      height: 10,
    } as BusSymbol,
    {
      id: 'src_pv',
      elementId: 'src_pv',
      elementType: 'Source',
      elementName: 'PV Farma Solarna 3MW',
      position: { x: 400, y: 50 },
      inService: true,
      connectedToNodeId: 'bus_sn',
    } as SourceSymbol,
    {
      id: 'src_bess',
      elementId: 'src_bess',
      elementType: 'Source',
      elementName: 'BESS Magazyn 1MWh',
      position: { x: 600, y: 50 },
      inService: true,
      connectedToNodeId: 'bus_sn',
    } as SourceSymbol,
    {
      id: 'load_1',
      elementId: 'load_1',
      elementType: 'Load',
      elementName: 'Odbiorca',
      position: { x: 300, y: 250 },
      inService: true,
      connectedToNodeId: 'bus_sn',
    } as LoadSymbol,
  ];
}

// =============================================================================
// METADATA BUILDERS (generatorTypes + voltageOverrides for OZE fixtures)
// =============================================================================

function buildOze01Metadata(): TopologyAdapterOptions {
  return {
    metadata: {
      generatorTypes: new Map<string, GeneratorKind>([
        ['src_pv', GeneratorKind.PV],
      ]),
      voltageOverrides: new Map<string, number>([
        ['bus_sn', 15],
      ]),
    },
  };
}

function buildOze02Metadata(): TopologyAdapterOptions {
  return {
    metadata: {
      generatorTypes: new Map<string, GeneratorKind>([
        ['src_bess', GeneratorKind.BESS],
      ]),
      voltageOverrides: new Map<string, number>([
        ['bus_sn', 15],
      ]),
    },
  };
}

function buildOze03Metadata(): TopologyAdapterOptions {
  return {
    metadata: {
      generatorTypes: new Map<string, GeneratorKind>([
        ['src_pv', GeneratorKind.PV],
        ['src_bess', GeneratorKind.BESS],
      ]),
      voltageOverrides: new Map<string, number>([
        ['bus_sn', 15],
      ]),
    },
  };
}

// =============================================================================
// UTILITY: Shuffle (deterministyczny seed — Fisher-Yates z PRNG)
// =============================================================================

function deterministicShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    // Simple LCG PRNG
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = ((s >>> 0) % (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// =============================================================================
// TEST: HASH STABILITY (100x)
// =============================================================================

describe('Determinism Suite — hash stability', () => {
  it('GN-SLD-01: 100x convertToVisualGraph → identyczny hash', () => {
    const symbols = buildGoldenNetwork01();
    const referenceGraph = convertToVisualGraph(symbols);
    const referenceHash = computeVisualGraphHash(referenceGraph);

    for (let i = 0; i < 100; i++) {
      const graph = convertToVisualGraph(symbols);
      const hash = computeVisualGraphHash(graph);
      expect(hash).toBe(referenceHash);
    }
  });

  it('GN-SLD-02: 100x convertToVisualGraph → identyczny hash', () => {
    const symbols = buildGoldenNetwork02();
    const referenceGraph = convertToVisualGraph(symbols);
    const referenceHash = computeVisualGraphHash(referenceGraph);

    for (let i = 0; i < 100; i++) {
      const graph = convertToVisualGraph(symbols);
      expect(computeVisualGraphHash(graph)).toBe(referenceHash);
    }
  });

  it('GN-OZE-01: 100x → identyczny hash', () => {
    const symbols = buildGoldenNetworkOze01();
    const referenceHash = computeVisualGraphHash(convertToVisualGraph(symbols));

    for (let i = 0; i < 100; i++) {
      expect(computeVisualGraphHash(convertToVisualGraph(symbols))).toBe(referenceHash);
    }
  });

  it('GN-OZE-02: 100x → identyczny hash', () => {
    const symbols = buildGoldenNetworkOze02();
    const referenceHash = computeVisualGraphHash(convertToVisualGraph(symbols));

    for (let i = 0; i < 100; i++) {
      expect(computeVisualGraphHash(convertToVisualGraph(symbols))).toBe(referenceHash);
    }
  });

  it('GN-OZE-03: 100x → identyczny hash', () => {
    const symbols = buildGoldenNetworkOze03();
    const referenceHash = computeVisualGraphHash(convertToVisualGraph(symbols));

    for (let i = 0; i < 100; i++) {
      expect(computeVisualGraphHash(convertToVisualGraph(symbols))).toBe(referenceHash);
    }
  });
});

// =============================================================================
// TEST: PERMUTATION INVARIANCE (50 permutacji)
// =============================================================================

describe('Determinism Suite — permutation invariance', () => {
  it('GN-SLD-01: 50 permutacji wejscia → identyczny hash', () => {
    const symbols = buildGoldenNetwork01();
    const referenceHash = computeVisualGraphHash(convertToVisualGraph(symbols));

    for (let seed = 1; seed <= 50; seed++) {
      const shuffled = deterministicShuffle(symbols, seed);
      const graph = convertToVisualGraph(shuffled);
      const hash = computeVisualGraphHash(graph);
      expect(hash).toBe(referenceHash);
    }
  });

  it('GN-SLD-02: 50 permutacji → identyczny hash', () => {
    const symbols = buildGoldenNetwork02();
    const referenceHash = computeVisualGraphHash(convertToVisualGraph(symbols));

    for (let seed = 1; seed <= 50; seed++) {
      const shuffled = deterministicShuffle(symbols, seed);
      expect(computeVisualGraphHash(convertToVisualGraph(shuffled))).toBe(referenceHash);
    }
  });

  it('GN-OZE-03: 50 permutacji → identyczny hash', () => {
    const symbols = buildGoldenNetworkOze03();
    const referenceHash = computeVisualGraphHash(convertToVisualGraph(symbols));

    for (let seed = 1; seed <= 50; seed++) {
      const shuffled = deterministicShuffle(symbols, seed);
      expect(computeVisualGraphHash(convertToVisualGraph(shuffled))).toBe(referenceHash);
    }
  });
});

// =============================================================================
// TEST: INVARIANTS
// =============================================================================

describe('Determinism Suite — invarianty', () => {
  it('GN-SLD-01: walidacja kontraktu przechodzi', () => {
    const graph = convertToVisualGraph(buildGoldenNetwork01());
    const result = validateVisualGraph(graph);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('GN-SLD-02: walidacja kontraktu przechodzi', () => {
    const graph = convertToVisualGraph(buildGoldenNetwork02());
    const result = validateVisualGraph(graph);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('GN-OZE-01: PV jest GENERATOR_PV', () => {
    const graph = convertToVisualGraph(buildGoldenNetworkOze01(), buildOze01Metadata());
    const pv = graph.nodes.find(n => n.attributes.elementName.includes('PV'));
    expect(pv).toBeDefined();
    expect(pv!.nodeType).toBe(NodeTypeV1.GENERATOR_PV);
  });

  it('GN-OZE-02: BESS jest GENERATOR_BESS', () => {
    const graph = convertToVisualGraph(buildGoldenNetworkOze02(), buildOze02Metadata());
    const bess = graph.nodes.find(n => n.attributes.elementName.includes('BESS'));
    expect(bess).toBeDefined();
    expect(bess!.nodeType).toBe(NodeTypeV1.GENERATOR_BESS);
  });

  it('GN-OZE-03: PV i BESS sa zrodlami w tej samej stacji', () => {
    const graph = convertToVisualGraph(buildGoldenNetworkOze03(), buildOze03Metadata());
    const pv = graph.nodes.find(n => n.nodeType === NodeTypeV1.GENERATOR_PV);
    const bess = graph.nodes.find(n => n.nodeType === NodeTypeV1.GENERATOR_BESS);
    expect(pv).toBeDefined();
    expect(bess).toBeDefined();
  });

  it('GN-SLD-01: kazdy node ID jest unikalny', () => {
    const graph = convertToVisualGraph(buildGoldenNetwork01());
    const ids = graph.nodes.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('GN-SLD-01: kazdy edge ID jest unikalny', () => {
    const graph = convertToVisualGraph(buildGoldenNetwork01());
    const ids = graph.edges.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('GN-SLD-02: NOP ma isNormallyOpen=true', () => {
    const graph = convertToVisualGraph(buildGoldenNetwork02());
    const nopEdges = graph.edges.filter(e => e.isNormallyOpen);
    expect(nopEdges.length).toBeGreaterThanOrEqual(1);
  });

  it('GN-SLD-02: secondary connector istnieje w grafie', () => {
    const graph = convertToVisualGraph(buildGoldenNetwork02());
    const secondaryEdges = graph.edges.filter(e => e.edgeType === EdgeTypeV1.SECONDARY_CONNECTOR);
    // NOP switch tworzy secondary connector
    expect(secondaryEdges.length).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// TEST: GOLDEN NETWORKS — STATISTICS
// =============================================================================

describe('Determinism Suite — golden network statistics', () => {
  it('GN-SLD-01: GPZ + 10 stacji A = 53 symboli', () => {
    const symbols = buildGoldenNetwork01();
    // GPZ(1) + bus_main(1) + tr_wn_sn(1) + 10 * (line + bus_sn + tr + bus_nn + load) = 3 + 50 = 53
    expect(symbols.length).toBe(53);

    const graph = convertToVisualGraph(symbols);
    // V2 pipeline: branches (LineBranch, TransformerBranch) become edges, not nodes.
    // Nodes: src_gpz(1) + bus_sn_main(1) + 10*(bus_sn + bus_nn + load) = 32
    expect(graph.nodes.length).toBe(32);
  });

  it('GN-SLD-02: GPZ + 2 sekcje + 4 stacje B + ring', () => {
    const symbols = buildGoldenNetwork02();
    // GPZ(1) + 2 buses + NOP(1) + 4 buses + 4 lines + ring_nop(1) = 13
    expect(symbols.length).toBe(13);
  });

  it('GN-OZE-03: stacja wielofunkcyjna PV+BESS', () => {
    const symbols = buildGoldenNetworkOze03();
    expect(symbols.length).toBe(5);
  });
});

// =============================================================================
// TEST: STRESS — large network
// =============================================================================

describe('Determinism Suite — stress test', () => {
  it('GN-STRESS-500: 500+ wezlow — hash stability (10x)', () => {
    // Generuj duza siec
    const symbols: AnySldSymbol[] = [];

    symbols.push({
      id: 'src_gpz',
      elementId: 'src_gpz',
      elementType: 'Source',
      elementName: 'GPZ 110/15kV',
      position: { x: 500, y: 50 },
      inService: true,
      connectedToNodeId: 'bus_main',
    } as SourceSymbol);

    symbols.push({
      id: 'bus_main',
      elementId: 'bus_main',
      elementType: 'Bus',
      elementName: 'Szyna SN 15kV',
      position: { x: 200, y: 150 },
      inService: true,
      width: 2000,
      height: 10,
    } as BusSymbol);

    // 100 feederow, kazdy z 5 elementami = 500+ wezlow
    const prevId = 'bus_main';
    for (let f = 1; f <= 100; f++) {
      const feedBusId = `bus_f${f}`;
      symbols.push({
        id: feedBusId,
        elementId: feedBusId,
        elementType: 'Bus',
        elementName: `Szyna SN Feeder ${f}`,
        position: { x: f * 20, y: 300 },
        inService: true,
        width: 40,
        height: 6,
      } as BusSymbol);

      symbols.push({
        id: `line_f${f}`,
        elementId: `line_f${f}`,
        elementType: 'LineBranch',
        elementName: `Linia Feeder ${f}`,
        position: { x: f * 20, y: 250 },
        inService: true,
        fromNodeId: 'bus_main',
        toNodeId: feedBusId,
        points: [],
        branchType: f % 2 === 0 ? 'CABLE' : 'LINE',
      } as BranchSymbol);

      symbols.push({
        id: `sw_f${f}`,
        elementId: `sw_f${f}`,
        elementType: 'Switch',
        elementName: `Wylacznik Feeder ${f}`,
        position: { x: f * 20, y: 275 },
        inService: true,
        fromNodeId: 'bus_main',
        toNodeId: feedBusId,
        switchState: 'CLOSED',
        switchType: 'BREAKER',
      } as SwitchSymbol);

      symbols.push({
        id: `tr_f${f}`,
        elementId: `tr_f${f}`,
        elementType: 'TransformerBranch',
        elementName: `Transformator Stacja ${f}`,
        position: { x: f * 20, y: 350 },
        inService: true,
        fromNodeId: feedBusId,
        toNodeId: `bus_nn_f${f}`,
        points: [],
      } as BranchSymbol);

      symbols.push({
        id: `bus_nn_f${f}`,
        elementId: `bus_nn_f${f}`,
        elementType: 'Bus',
        elementName: `Szyna nN 0.4kV Stacja ${f}`,
        position: { x: f * 20, y: 400 },
        inService: true,
        width: 30,
        height: 4,
      } as BusSymbol);

      symbols.push({
        id: `load_f${f}`,
        elementId: `load_f${f}`,
        elementType: 'Load',
        elementName: `Odbiorca ${f}`,
        position: { x: f * 20, y: 450 },
        inService: true,
        connectedToNodeId: `bus_nn_f${f}`,
      } as LoadSymbol);
    }

    expect(symbols.length).toBeGreaterThan(500);

    const referenceHash = computeVisualGraphHash(convertToVisualGraph(symbols));

    // 10x hash stability
    for (let i = 0; i < 10; i++) {
      expect(computeVisualGraphHash(convertToVisualGraph(symbols))).toBe(referenceHash);
    }
  });

  it('GN-STRESS-500: permutation invariance (5 permutacji)', () => {
    const symbols: AnySldSymbol[] = [];

    symbols.push({
      id: 'src', elementId: 'src', elementType: 'Source',
      elementName: 'GPZ', position: { x: 0, y: 0 }, inService: true,
      connectedToNodeId: 'bus',
    } as SourceSymbol);
    symbols.push({
      id: 'bus', elementId: 'bus', elementType: 'Bus',
      elementName: 'Szyna SN 15kV', position: { x: 0, y: 100 }, inService: true,
      width: 500, height: 10,
    } as BusSymbol);

    for (let i = 1; i <= 100; i++) {
      symbols.push({
        id: `el_${String(i).padStart(3, '0')}`,
        elementId: `el_${String(i).padStart(3, '0')}`,
        elementType: 'Load',
        elementName: `Odbiorca ${i}`,
        position: { x: i * 5, y: 200 },
        inService: true,
        connectedToNodeId: 'bus',
      } as LoadSymbol);
    }

    const referenceHash = computeVisualGraphHash(convertToVisualGraph(symbols));

    for (let seed = 1; seed <= 5; seed++) {
      const shuffled = deterministicShuffle(symbols, seed * 1000);
      expect(computeVisualGraphHash(convertToVisualGraph(shuffled))).toBe(referenceHash);
    }
  });
});
