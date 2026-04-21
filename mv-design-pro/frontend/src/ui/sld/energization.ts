/**
 * SLD Energization Algorithm (UI-only, deterministic)
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § D: Visual state encoding
 * - CANONICAL parity: energized vs de-energized visualization
 *
 * ALGORITHM:
 * - BFS traversal from source nodes
 * - Source types: utility_feeder, generator, pv, fw, bess
 * - OPEN switches block energy flow
 * - CLOSED switches allow energy flow
 *
 * BINDING:
 * - No backend/solver dependencies
 * - UI-only state calculation
 * - Deterministic (same input = same output)
 */

import type { AnySldSymbol, SwitchSymbol, BranchSymbol, SourceSymbol } from '../sld-editor/types';

/**
 * Energization state for SLD elements.
 */
export interface EnergizationState {
  /** Map of element ID to energized status */
  energizedElements: Map<string, boolean>;
  /** Source elements that provide energy */
  sourceElements: string[];
  /** Elements that are de-energized due to OPEN switches */
  deenergizedBySwitch: Map<string, string>; // elementId -> blocking switchId
}

/**
 * Source element types that provide energy to the network.
 * Per CANONICAL parity: utility_feeder, generator, pv, fw, bess
 */
const SOURCE_ELEMENT_NAMES = ['utility_feeder', 'generator', 'pv', 'fw', 'bess', 'grid', 'siec'];

/**
 * Check if an element is a source (provides energy).
 */
function isSourceElement(symbol: AnySldSymbol): boolean {
  if (symbol.elementType === 'Source') {
    return true;
  }
  // Check element name for source indicators
  const nameLower = symbol.elementName.toLowerCase();
  return SOURCE_ELEMENT_NAMES.some((source) => nameLower.includes(source));
}

/**
 * Check if a switch allows energy flow (CLOSED = allows, OPEN = blocks).
 */
function switchAllowsFlow(symbol: SwitchSymbol): boolean {
  return symbol.switchState === 'CLOSED';
}

/**
 * Build adjacency map from symbols.
 * Returns map of nodeId -> connected elements.
 */
function buildAdjacencyMap(
  symbols: AnySldSymbol[]
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
    } else if (symbol.elementType === 'Source' || symbol.elementType === 'Load') {
      const sourceOrLoad = symbol as SourceSymbol;
      if (sourceOrLoad.connectedToNodeId) {
        connectedNodes.push(sourceOrLoad.connectedToNodeId);
      }
    }

    // Store element -> nodes mapping
    elementToNodes.set(symbol.id, connectedNodes);

    // Store node -> elements mapping
    for (const nodeId of connectedNodes) {
      const elements = nodeToElements.get(nodeId) || [];
      elements.push(symbol);
      nodeToElements.set(nodeId, elements);
    }
  }

  return { nodeToElements, elementToNodes };
}

/**
 * Calculate energization state using BFS from source nodes.
 *
 * Algorithm:
 * 1. Find all source elements
 * 2. Mark source nodes as energized
 * 3. BFS traversal:
 *    - From energized nodes, traverse connected elements
 *    - If element is OPEN switch, do not continue through it
 *    - If element is CLOSED switch or branch, mark connected node as energized
 * 4. All unreached elements are de-energized
 *
 * @param symbols - All SLD symbols
 * @returns EnergizationState with energized/de-energized elements
 */
export function calculateEnergization(symbols: AnySldSymbol[]): EnergizationState {
  const result: EnergizationState = {
    energizedElements: new Map(),
    sourceElements: [],
    deenergizedBySwitch: new Map(),
  };

  if (symbols.length === 0) {
    return result;
  }

  // Build adjacency maps
  const { nodeToElements, elementToNodes } = buildAdjacencyMap(symbols);

  // Find all source elements
  const sources = symbols.filter(isSourceElement);
  result.sourceElements = sources.map((s) => s.id);

  // If no sources, everything is de-energized
  if (sources.length === 0) {
    for (const symbol of symbols) {
      result.energizedElements.set(symbol.id, false);
    }
    return result;
  }

  // BFS state
  const energizedNodes = new Set<string>();
  const energizedElements = new Set<string>();
  const visitedElements = new Set<string>();
  const queue: string[] = []; // Queue of node IDs

  // Start from source-connected nodes
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

  // Mark Bus nodes as energized
  for (const symbol of symbols) {
    if (symbol.elementType === 'Bus' && energizedNodes.has(symbol.id)) {
      energizedElements.add(symbol.id);
    }
  }

  // BFS traversal
  while (queue.length > 0) {
    const currentNodeId = queue.shift()!;
    const connectedElements = nodeToElements.get(currentNodeId) || [];

    for (const element of connectedElements) {
      if (visitedElements.has(element.id)) {
        continue;
      }
      visitedElements.add(element.id);

      // Check if this is a switch
      if (element.elementType === 'Switch') {
        const switchSymbol = element as SwitchSymbol;

        if (!switchAllowsFlow(switchSymbol)) {
          // OPEN switch - blocks energy flow
          // The switch itself can be reached but doesn't conduct
          energizedElements.add(element.id);
          result.energizedElements.set(element.id, true);
          // Don't traverse through OPEN switch - elements on the other side are not reached
          continue;
        }
      }

      // Element is energized (reachable through CLOSED path)
      energizedElements.add(element.id);
      result.energizedElements.set(element.id, true);

      // Get nodes connected to this element
      const elementNodes = elementToNodes.get(element.id) || [];
      for (const nodeId of elementNodes) {
        if (!energizedNodes.has(nodeId)) {
          energizedNodes.add(nodeId);
          queue.push(nodeId);

          // Mark Bus node as energized
          const busSymbol = symbols.find((s) => s.id === nodeId && s.elementType === 'Bus');
          if (busSymbol) {
            energizedElements.add(busSymbol.id);
            result.energizedElements.set(busSymbol.id, true);
          }
        }
      }
    }
  }

  // Mark all unreached elements as de-energized
  for (const symbol of symbols) {
    if (!result.energizedElements.has(symbol.id)) {
      result.energizedElements.set(symbol.id, false);

      // Try to find blocking switch
      const connectedNodes = elementToNodes.get(symbol.id) || [];
      for (const nodeId of connectedNodes) {
        const nodeElements = nodeToElements.get(nodeId) || [];
        for (const nodeElement of nodeElements) {
          if (
            nodeElement.elementType === 'Switch' &&
            !switchAllowsFlow(nodeElement as SwitchSymbol) &&
            energizedElements.has(nodeElement.id)
          ) {
            result.deenergizedBySwitch.set(symbol.id, nodeElement.id);
            break;
          }
        }
        if (result.deenergizedBySwitch.has(symbol.id)) break;
      }
    }
  }

  return result;
}

/**
 * Check if an element is energized.
 *
 * @param elementId - Element ID to check
 * @param energizationState - Calculated energization state
 * @returns true if energized, false if de-energized
 */
export function isEnergized(
  elementId: string,
  energizationState: EnergizationState
): boolean {
  return energizationState.energizedElements.get(elementId) ?? false;
}

/**
 * Get the switch that blocks energy to an element.
 *
 * @param elementId - Element ID to check
 * @param energizationState - Calculated energization state
 * @returns Switch ID that blocks energy, or null if not blocked by switch
 */
export function getBlockingSwitch(
  elementId: string,
  energizationState: EnergizationState
): string | null {
  return energizationState.deenergizedBySwitch.get(elementId) ?? null;
}
