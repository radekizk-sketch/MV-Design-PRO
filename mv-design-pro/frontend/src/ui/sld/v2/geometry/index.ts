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

export {
  TopologicalLayoutEngine,
  createTopologicalLayoutEngine,
} from '../../../../engine/sld-layout/layoutEngine';

export { buildTopologyTree } from '../../../../engine/sld-layout/topologyTree';
export type { TopologyTree, TreeNode } from '../../../../engine/sld-layout/topologyTree';
