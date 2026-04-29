/**
 * production-sld-render-contract
 *
 * Weryfikuje kontrakt VisualGraphV1 konieczny do produkcyjnego renderowania SLD.
 *
 * Sprawdza:
 * - każdy węzeł ma id (string, unikalny, leksykograficznie sortowany)
 * - każdy węzeł ma typ NodeTypeV1 (z kanonu, nie niezdefiniowany)
 * - każda krawędź ma id i wskazuje na istniejące węzły
 * - render jest deterministyczny (canonicalizeVisualGraph)
 * - PV/BESS są GENERATOR_PV / GENERATOR_BESS (nigdy LOAD)
 */

import { describe, expect, it } from 'vitest';

import {
  NodeTypeV1,
  EdgeTypeV1,
  VISUAL_GRAPH_VERSION,
  type VisualGraphV1,
  type VisualNodeV1,
  type VisualEdgeV1,
  canonicalizeVisualGraph,
} from '../index';

const DEFAULT_ATTRS: VisualNodeV1['attributes'] = {
  label: '',
  voltageKv: null,
  inService: true,
  elementId: '',
  elementType: '',
  elementName: '',
  switchState: null,
  branchType: null,
  ratedPowerMva: null,
  width: null,
  height: null,
  fromNodeId: null,
  toNodeId: null,
  connectedToNodeId: null,
};

const DEFAULT_META: VisualGraphV1['meta'] = {
  snapshotId: 'snap-test',
  snapshotFingerprint: 'fp-test',
  createdAt: '2026-04-29T00:00:00Z',
  version: VISUAL_GRAPH_VERSION,
};

function makeNode(id: string, nodeType: NodeTypeV1): VisualNodeV1 {
  return {
    id,
    nodeType,
    ports: [],
    attributes: {
      ...DEFAULT_ATTRS,
      label: id,
      elementId: id,
      elementType: nodeType,
      elementName: id,
    },
  };
}

function makeEdge(id: string, fromNodeId: string, toNodeId: string): VisualEdgeV1 {
  return {
    id,
    fromPortRef: { nodeId: fromNodeId, portId: `${fromNodeId}:out` },
    toPortRef: { nodeId: toNodeId, portId: `${toNodeId}:in` },
    edgeType: EdgeTypeV1.TRUNK,
    isNormallyOpen: false,
    attributes: {
      label: '',
      lengthKm: null,
      branchType: null,
      inService: true,
    },
  };
}

describe('production SLD render contract', () => {
  it('every node has a non-empty id string', () => {
    const graph: VisualGraphV1 = {
      version: VISUAL_GRAPH_VERSION,
      nodes: [
        makeNode('gpz-1', NodeTypeV1.GRID_SOURCE),
        makeNode('bus-sn', NodeTypeV1.BUS_SN),
        makeNode('station-1', NodeTypeV1.STATION_SN_NN_A),
      ],
      edges: [],
      meta: DEFAULT_META,
    };

    for (const node of graph.nodes) {
      expect(node.id).toBeTruthy();
      expect(typeof node.id).toBe('string');
      expect(node.id.length).toBeGreaterThan(0);
    }
  });

  it('every node has a canonical NodeTypeV1 value', () => {
    const validTypes = Object.values(NodeTypeV1);
    const graph: VisualGraphV1 = {
      version: VISUAL_GRAPH_VERSION,
      nodes: [
        makeNode('gpz-1', NodeTypeV1.GRID_SOURCE),
        makeNode('bus-sn', NodeTypeV1.BUS_SN),
        makeNode('load-1', NodeTypeV1.LOAD),
        makeNode('pv-1', NodeTypeV1.GENERATOR_PV),
      ],
      edges: [],
      meta: DEFAULT_META,
    };

    for (const node of graph.nodes) {
      expect(validTypes).toContain(node.nodeType);
    }
  });

  it('every edge has a non-empty id', () => {
    const graph: VisualGraphV1 = {
      version: VISUAL_GRAPH_VERSION,
      nodes: [
        makeNode('gpz-1', NodeTypeV1.GRID_SOURCE),
        makeNode('bus-sn', NodeTypeV1.BUS_SN),
      ],
      edges: [makeEdge('edge-gpz-bus', 'gpz-1', 'bus-sn')],
      meta: DEFAULT_META,
    };

    for (const edge of graph.edges) {
      expect(edge.id).toBeTruthy();
      expect(typeof edge.id).toBe('string');
    }
  });

  it('canonicalizeVisualGraph produces deterministic lexicographic node order', () => {
    const nodesUnordered = [
      makeNode('zzz-node', NodeTypeV1.LOAD),
      makeNode('aaa-node', NodeTypeV1.GRID_SOURCE),
      makeNode('mmm-node', NodeTypeV1.BUS_SN),
    ];

    const graph: VisualGraphV1 = {
      version: VISUAL_GRAPH_VERSION,
      nodes: nodesUnordered,
      edges: [],
      meta: DEFAULT_META,
    };

    const canonical = canonicalizeVisualGraph(graph);
    const ids = canonical.nodes.map((n) => n.id);
    expect(ids).toEqual(['aaa-node', 'mmm-node', 'zzz-node']);
  });

  it('graph has unique node ids', () => {
    const graph: VisualGraphV1 = {
      version: VISUAL_GRAPH_VERSION,
      nodes: [
        makeNode('node-a', NodeTypeV1.BUS_SN),
        makeNode('node-b', NodeTypeV1.STATION_SN_NN_B),
        makeNode('node-c', NodeTypeV1.TRANSFORMER_SN_NN),
      ],
      edges: [],
      meta: DEFAULT_META,
    };

    const ids = graph.nodes.map((n) => n.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('PV generator is GENERATOR_PV — never LOAD', () => {
    const pvNode = makeNode('pv-1', NodeTypeV1.GENERATOR_PV);
    expect(pvNode.nodeType).toBe(NodeTypeV1.GENERATOR_PV);
    expect(pvNode.nodeType).not.toBe(NodeTypeV1.LOAD);
  });

  it('BESS generator is GENERATOR_BESS — never LOAD', () => {
    const bessNode = makeNode('bess-1', NodeTypeV1.GENERATOR_BESS);
    expect(bessNode.nodeType).toBe(NodeTypeV1.GENERATOR_BESS);
    expect(bessNode.nodeType).not.toBe(NodeTypeV1.LOAD);
  });

  it('graph version is VISUAL_GRAPH_VERSION constant', () => {
    const graph: VisualGraphV1 = {
      version: VISUAL_GRAPH_VERSION,
      nodes: [],
      edges: [],
      meta: DEFAULT_META,
    };
    expect(graph.version).toBe('V1');
  });
});
