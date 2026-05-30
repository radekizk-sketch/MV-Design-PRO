/**
 * Geometria SLD V1 — publiczny punkt wejścia (kontrakt + silnik layoutu).
 *
 * @see docs/sld/SLD_GEOMETRY_CONTRACT_V1.md
 */

export type {
  EnmSnapshot,
  LayoutMode,
  LodLevel,
  PortSide,
  PortAnchor,
  NodeGeometry,
  EdgeGeometry,
  LayoutBBox,
  LayoutResult,
  LayoutFrame,
  LayoutEngine,
} from './layoutContract';

// Jedyna definicja footprintu bloku L0 (renderer + layout importują TĘ stałą).
export { L0_STATION_BLOCK } from './layoutContract';

export {
  TopologicalLayoutEngine,
  createTopologicalLayoutEngine,
} from '../../../../engine/sld-layout/layoutEngine';

export { buildTopologyTree } from '../../../../engine/sld-layout/topologyTree';
export type { TopologyTree, TreeNode } from '../../../../engine/sld-layout/topologyTree';

// Warstwa odczytu geometrii dla rendererów (V-07) — krawędzie port→port z LayoutResult.
export {
  buildPortAnchoredGeometryFromENM,
  projectPortAnchoredGeometry,
  buildPortAnchoredEdges,
  indexPorts,
  toCableRuns,
} from './portAnchoredGeometry';
export type {
  GeometryPoint,
  PortAnchoredEdge,
  PortAnchoredGeometry,
  PortAnchoredCableRun,
} from './portAnchoredGeometry';
