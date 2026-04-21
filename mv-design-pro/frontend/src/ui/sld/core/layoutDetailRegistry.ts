import type { StationBlockDetailV1 } from './fieldDeviceContracts';
import type { StationBlockBuildResult } from './stationBlockBuilder';
import type { VisualGraphV1 } from './visualGraph';

const stationBlockDetailRegistry = new WeakMap<VisualGraphV1, StationBlockBuildResult>();
const branchPointDetailRegistry = new WeakMap<VisualGraphV1, ReadonlyMap<string, StationBlockDetailV1>>();

export function registerStationBlockDetailsForGraph(
  graph: VisualGraphV1,
  stationBlockDetails: StationBlockBuildResult,
): void {
  stationBlockDetailRegistry.set(graph, stationBlockDetails);
}

export function resolveStationBlockDetailsForGraph(
  graph: VisualGraphV1,
): StationBlockBuildResult | undefined {
  return stationBlockDetailRegistry.get(graph);
}

export function registerBranchPointDetailsForGraph(
  graph: VisualGraphV1,
  branchPointDetails: ReadonlyMap<string, StationBlockDetailV1>,
): void {
  branchPointDetailRegistry.set(graph, branchPointDetails);
}

export function resolveBranchPointDetailsForGraph(
  graph: VisualGraphV1,
): ReadonlyMap<string, StationBlockDetailV1> | undefined {
  return branchPointDetailRegistry.get(graph);
}
