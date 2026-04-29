/**
 * SLD energization projection.
 *
 * Production energization is derived from EngineeringSemanticModel only:
 * - source semantics come from engineering element kind/role/ports;
 * - topology comes from EngineeringConnection normalState and port ownership;
 * - SVG position and visual ElementType/name are not part of the decision.
 */

import type { AnySldSymbol, BranchSymbol, SourceSymbol, SwitchSymbol } from '../sld-editor/types';
import type { EngineeringElement, EngineeringSemanticModel, PortRole } from '../engineering-semantic';

/**
 * Energization state for SLD elements.
 */
export interface EnergizationState {
  /** Map of element ID to energized status */
  energizedElements: Map<string, boolean>;
  /** Source elements that provide energy */
  sourceElements: string[];
  /** Elements that are de-energized due to OPEN switches */
  deenergizedBySwitch: Map<string, string>;
}

function emptyState(): EnergizationState {
  return {
    energizedElements: new Map(),
    sourceElements: [],
    deenergizedBySwitch: new Map(),
  };
}

const SEMANTIC_SOURCE_ROLES = new Set<EngineeringElement['engineeringRole']>([
  'GPZ_SUPPLY_NODE',
  'PV_INVERTER',
  'BESS_CONVERTER',
  'WIND_SOURCE',
]);

const SEMANTIC_SOURCE_PORT_ROLES = new Set<PortRole>(['SOURCE_AC', 'SOURCE_DC']);

function isSemanticSource(element: EngineeringElement): boolean {
  return (
    element.elementKind === 'SOURCE'
    || SEMANTIC_SOURCE_ROLES.has(element.engineeringRole)
    || element.ports.some((port) => SEMANTIC_SOURCE_PORT_ROLES.has(port.role))
  );
}

function portOwnerMap(semanticModel: EngineeringSemanticModel): Map<string, string> {
  const owners = new Map<string, string>();
  for (const element of semanticModel.elements) {
    for (const port of element.ports) {
      owners.set(port.portId, element.refId);
    }
  }
  return owners;
}

function ensureSymbolAliases(
  state: EnergizationState,
  symbols: readonly AnySldSymbol[] | undefined,
): EnergizationState {
  if (!symbols) return state;

  for (const symbol of symbols) {
    const elementRef = symbol.elementId ?? symbol.id;
    if (state.energizedElements.has(elementRef)) {
      state.energizedElements.set(symbol.id, state.energizedElements.get(elementRef)!);
    }

    const blockingSwitch = state.deenergizedBySwitch.get(elementRef);
    if (blockingSwitch) {
      state.deenergizedBySwitch.set(symbol.id, blockingSwitch);
    }
  }

  return state;
}

/**
 * Calculate energization from the semantic model. This is the production path.
 */
export function calculateEnergization(
  semanticModel: EngineeringSemanticModel,
  semanticHash: string,
  symbols?: readonly AnySldSymbol[],
): EnergizationState {
  if (semanticModel.semanticHash !== semanticHash) {
    throw new Error('SLD energization requires a semanticHash matching EngineeringSemanticModel.semanticHash.');
  }

  const state = emptyState();
  const portOwners = portOwnerMap(semanticModel);
  const elementRefs = new Set(semanticModel.elements.map((element) => element.refId));
  const energizedRefs = new Set<string>();
  const adjacency = new Map<string, Set<string>>();
  const openBoundaries: Array<{ fromRef: string; toRef: string; blockerRef: string }> = [];

  for (const elementRef of elementRefs) {
    adjacency.set(elementRef, new Set());
    state.energizedElements.set(elementRef, false);
  }

  for (const connection of semanticModel.connections) {
    if (connection.connectionKind !== 'TOR_MOCY') continue;

    const fromRef = portOwners.get(connection.fromPortId);
    const toRef = portOwners.get(connection.toPortId);
    if (!fromRef || !toRef || fromRef === toRef) continue;

    if (connection.normalState === 'POLACZONE') {
      adjacency.get(fromRef)?.add(toRef);
      adjacency.get(toRef)?.add(fromRef);
      continue;
    }

    if (connection.normalState === 'ROZLACZONE') {
      openBoundaries.push({
        fromRef,
        toRef,
        blockerRef: connection.switchingDeviceRefId ?? connection.connectionId,
      });
    }
  }

  const queue: string[] = [];
  for (const element of semanticModel.elements) {
    if (!isSemanticSource(element)) continue;
    state.sourceElements.push(element.refId);
    energizedRefs.add(element.refId);
    queue.push(element.refId);
  }

  while (queue.length > 0) {
    const currentRef = queue.shift()!;
    for (const nextRef of adjacency.get(currentRef) ?? []) {
      if (energizedRefs.has(nextRef)) continue;
      energizedRefs.add(nextRef);
      queue.push(nextRef);
    }
  }

  for (const elementRef of energizedRefs) {
    state.energizedElements.set(elementRef, true);
  }

  for (const boundary of openBoundaries) {
    const fromEnergized = energizedRefs.has(boundary.fromRef);
    const toEnergized = energizedRefs.has(boundary.toRef);
    if (fromEnergized && !toEnergized) {
      state.deenergizedBySwitch.set(boundary.toRef, boundary.blockerRef);
    }
    if (toEnergized && !fromEnergized) {
      state.deenergizedBySwitch.set(boundary.fromRef, boundary.blockerRef);
    }
  }

  return ensureSymbolAliases(state, symbols);
}

/**
 * @legacy @testOnly
 * Local symbol-only energization retained for isolated legacy tests and for
 * pre-semantic rendering surfaces. Do not use when EngineeringSemanticModel is available.
 */
export function calculateLegacyTestOnlyEnergization(symbols: readonly AnySldSymbol[]): EnergizationState {
  const result = emptyState();

  if (symbols.length === 0) {
    return result;
  }

  const { nodeToElements, elementToNodes } = buildLegacyAdjacencyMap(symbols);
  const sources = symbols.filter(isLegacySourceElement);
  result.sourceElements = sources.map((source) => source.id);

  if (sources.length === 0) {
    for (const symbol of symbols) {
      result.energizedElements.set(symbol.id, false);
    }
    return result;
  }

  const energizedNodes = new Set<string>();
  const energizedElements = new Set<string>();
  const visitedElements = new Set<string>();
  const queue: string[] = [];

  for (const source of sources) {
    energizedElements.add(source.id);
    result.energizedElements.set(source.id, true);

    const connectedNodes = elementToNodes.get(source.id) || [];
    for (const nodeId of connectedNodes) {
      if (!energizedNodes.has(nodeId)) {
        energizedNodes.add(nodeId);
        queue.push(nodeId);
      }
    }
  }

  for (const symbol of symbols) {
    if (symbol.elementType === 'Bus' && energizedNodes.has(symbol.id)) {
      energizedElements.add(symbol.id);
    }
  }

  while (queue.length > 0) {
    const currentNodeId = queue.shift()!;
    const connectedElements = nodeToElements.get(currentNodeId) || [];

    for (const element of connectedElements) {
      if (visitedElements.has(element.id)) continue;
      visitedElements.add(element.id);

      if (element.elementType === 'Switch' && !legacySwitchAllowsFlow(element as SwitchSymbol)) {
        energizedElements.add(element.id);
        result.energizedElements.set(element.id, true);
        continue;
      }

      energizedElements.add(element.id);
      result.energizedElements.set(element.id, true);

      const elementNodes = elementToNodes.get(element.id) || [];
      for (const nodeId of elementNodes) {
        if (energizedNodes.has(nodeId)) continue;
        energizedNodes.add(nodeId);
        queue.push(nodeId);

        const busSymbol = symbols.find((symbol) => symbol.id === nodeId && symbol.elementType === 'Bus');
        if (busSymbol) {
          energizedElements.add(busSymbol.id);
          result.energizedElements.set(busSymbol.id, true);
        }
      }
    }
  }

  for (const symbol of symbols) {
    if (result.energizedElements.has(symbol.id)) continue;
    result.energizedElements.set(symbol.id, false);

    const connectedNodes = elementToNodes.get(symbol.id) || [];
    for (const nodeId of connectedNodes) {
      const nodeElements = nodeToElements.get(nodeId) || [];
      for (const nodeElement of nodeElements) {
        if (
          nodeElement.elementType === 'Switch'
          && !legacySwitchAllowsFlow(nodeElement as SwitchSymbol)
          && energizedElements.has(nodeElement.id)
        ) {
          result.deenergizedBySwitch.set(symbol.id, nodeElement.id);
          break;
        }
      }
      if (result.deenergizedBySwitch.has(symbol.id)) break;
    }
  }

  return result;
}

function isLegacySourceElement(symbol: AnySldSymbol): boolean {
  return symbol.elementType === 'Source';
}

function legacySwitchAllowsFlow(symbol: SwitchSymbol): boolean {
  return symbol.switchState === 'CLOSED';
}

function buildLegacyAdjacencyMap(
  symbols: readonly AnySldSymbol[],
): {
  nodeToElements: Map<string, AnySldSymbol[]>;
  elementToNodes: Map<string, string[]>;
} {
  const nodeToElements = new Map<string, AnySldSymbol[]>();
  const elementToNodes = new Map<string, string[]>();

  for (const symbol of symbols) {
    const connectedNodes: string[] = [];

    if (symbol.elementType === 'Switch') {
      const switchSymbol = symbol as SwitchSymbol;
      connectedNodes.push(switchSymbol.fromNodeId, switchSymbol.toNodeId);
    } else if (symbol.elementType === 'LineBranch' || symbol.elementType === 'TransformerBranch') {
      const branchSymbol = symbol as BranchSymbol;
      connectedNodes.push(branchSymbol.fromNodeId, branchSymbol.toNodeId);
    } else if (
      symbol.elementType === 'Source'
      || symbol.elementType === 'Load'
      || symbol.elementType === 'Generator'
      || symbol.elementType === 'Measurement'
      || symbol.elementType === 'ProtectionAssignment'
      || symbol.elementType === 'Relay'
    ) {
      const sourceOrLoad = symbol as SourceSymbol;
      if (sourceOrLoad.connectedToNodeId) {
        connectedNodes.push(sourceOrLoad.connectedToNodeId);
      }
    }

    elementToNodes.set(symbol.id, connectedNodes);

    for (const nodeId of connectedNodes) {
      const elements = nodeToElements.get(nodeId) || [];
      elements.push(symbol);
      nodeToElements.set(nodeId, elements);
    }
  }

  return { nodeToElements, elementToNodes };
}

/**
 * Check if an element is energized.
 */
export function isEnergized(
  elementId: string,
  energizationState: EnergizationState,
): boolean {
  return energizationState.energizedElements.get(elementId) ?? false;
}

/**
 * Get the switch that blocks energy to an element.
 */
export function getBlockingSwitch(
  elementId: string,
  energizationState: EnergizationState,
): string | null {
  return energizationState.deenergizedBySwitch.get(elementId) ?? null;
}
