/**
 * ELK SLD layout adapter — barrel export (Pakiet J).
 */

export {
  ELK_GLOBAL_LAYOUT_OPTIONS,
  ELK_NODE_LAYOUT_OPTIONS,
  elkPortOptions,
} from './elkLayoutOptions';
export type { ElkPortSide } from './elkLayoutOptions';

export {
  canonicalSerializeCoordinates,
  canonicalSerializeElkGraph,
  fromElkLaidGraph,
  toElkGraph,
} from './elkAdapter';
export type {
  CoordinatesMap,
  ElkEdge,
  ElkGraph,
  ElkLaidGraph,
  ElkLaidNode,
  ElkNode,
  ElkPort,
  VisualEdgeInput,
  VisualGraphInput,
  VisualNodeInput,
  VisualPortInput,
} from './elkAdapter';
