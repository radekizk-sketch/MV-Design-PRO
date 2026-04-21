/**
 * SLD AUTO-LAYOUT INTEGRATION — Busbar Feeders Adapter
 *
 * Adapter konwertujący model SLD na dane wejściowe algorytmu auto-layout.
 * Ten moduł NIE modyfikuje domeny — buduje dane lokalnie na potrzeby layoutu.
 *
 * DETERMINIZM: Te same dane wejściowe → identyczny output
 * AUTO-LAYOUT (DEFAULT ON): Busbar feeders zawsze używają auto-layout.
 *
 * CANONICAL ALIGNMENT:
 * - layout/types.ts: BusbarInput, FeederInput
 * - sldCanonicalStyle.ts: CANONICAL_GEOMETRY tokens
 * - connectionRouting.ts: Connection types
 *
 * PUNKT INTEGRACJI:
 * Ten adapter jest wywoływany z connectionRouting.ts dla każdego busbar.
 * AUTO-FALLBACK: Jeśli adapter zwróci null lub wyjątek, connectionRouting
 * automatycznie używa standard routing dla danej krawędzi (bez crash).
 *
 * SIDE + ORDERKEY RULES:
 * - Side: TOP/BOTTOM dla H busbar, LEFT/RIGHT dla V busbar
 * - Tie-break: gdy pozycja równa, używa elementId
 * - OrderKey: side + position + elementId (deterministic sort)
 */

import type {
  BusbarInput,
  FeederInput,
  FeederSide,
  Point2D,
  AutoLayoutResult,
  PathSegment,
} from '../layout/types';
import type { AnySldSymbol, NodeSymbol, Position } from '../../sld-editor/types';
import { computeBusbarAutoLayout, segmentsToPolyline } from '../layout';
import { CANONICAL_GEOMETRY } from '../sldCanonicalStyle';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Busbar auto-layout input built from SLD model.
 */
export interface BusbarAutoLayoutInput {
  /** Busbar input for auto-layout algorithm */
  readonly bus: BusbarInput;
  /** Feeder inputs for auto-layout algorithm */
  readonly feeders: readonly FeederInput[];
  /** Map of feeder ID to connected symbol (for path completion) */
  readonly feederTargets: ReadonlyMap<string, AnySldSymbol>;
}

/**
 * Feeder path result from auto-layout.
 */
export interface FeederPathResult {
  /** Feeder ID */
  readonly feederId: string;
  /** Path as Position[] (for connection rendering) */
  readonly path: readonly Position[];
  /** Target symbol ID */
  readonly targetSymbolId: string;
}

/**
 * Complete busbar auto-layout result for rendering.
 */
export interface BusbarAutoLayoutRenderResult {
  /** Busbar ID */
  readonly busbarId: string;
  /** Feeder paths for rendering */
  readonly feederPaths: readonly FeederPathResult[];
  /** Layout metadata (for debugging) */
  readonly meta: {
    readonly params: AutoLayoutResult['params'];
    readonly feederCount: number;
  };
}

// =============================================================================
// ADAPTER HELPERS
// =============================================================================

/**
 * Determine busbar axis from geometry.
 * Uses position data to infer if busbar is horizontal or vertical.
 *
 * DETERMINISTIC: Pure function, same inputs → same output
 */
export function determineBusbarAxis(busSymbol: NodeSymbol): 'H' | 'V' {
  // NodeSymbol has width and height
  // If width > height → horizontal busbar (H)
  // If height > width → vertical busbar (V)
  // Equal or zero → default to horizontal (H)
  const { width, height } = busSymbol;

  if (width > height) {
    return 'H';
  }
  if (height > width) {
    return 'V';
  }

  // Default to horizontal for square or zero-dimension busbars
  return 'H';
}

/**
 * Calculate busbar endpoints (p0, p1) from NodeSymbol.
 * p0 = left/top, p1 = right/bottom (depending on axis)
 *
 * DETERMINISTIC: Pure function
 */
export function calculateBusbarEndpoints(
  busSymbol: NodeSymbol,
  axis: 'H' | 'V'
): { p0: Point2D; p1: Point2D } {
  const { position, width, height } = busSymbol;

  if (axis === 'H') {
    // Horizontal busbar: p0 = left, p1 = right
    // Position is typically the center or top-left depending on renderer
    // Assuming position is center:
    const halfWidth = width / 2;
    return {
      p0: { x: position.x - halfWidth, y: position.y },
      p1: { x: position.x + halfWidth, y: position.y },
    };
  } else {
    // Vertical busbar: p0 = top, p1 = bottom
    const halfHeight = height / 2;
    return {
      p0: { x: position.x, y: position.y - halfHeight },
      p1: { x: position.x, y: position.y + halfHeight },
    };
  }
}

/**
 * Determine feeder side relative to busbar.
 * Uses target symbol position relative to busbar to determine TOP/BOTTOM/LEFT/RIGHT.
 *
 * DETERMINISTIC: Pure function with tie-break rules:
 * - Horizontal busbar: TOP if targetY < busY, BOTTOM otherwise
 * - Vertical busbar: LEFT if targetX < busX, RIGHT otherwise
 * - Tie-break (equal position): use element ID comparison for determinism
 *
 * @param busSymbol - Busbar symbol
 * @param targetSymbol - Target connected symbol
 * @param axis - Busbar axis ('H' or 'V')
 * @returns Feeder exit side
 */
export function determineFeederSide(
  busSymbol: NodeSymbol,
  targetSymbol: AnySldSymbol,
  axis: 'H' | 'V'
): FeederSide {
  const busY = busSymbol.position.y;
  const busX = busSymbol.position.x;
  const targetY = targetSymbol.position.y;
  const targetX = targetSymbol.position.x;

  if (axis === 'H') {
    // Horizontal busbar: feeders exit TOP or BOTTOM
    if (targetY < busY) {
      return 'TOP';
    }
    if (targetY > busY) {
      return 'BOTTOM';
    }
    // TIE-BREAK: targetY === busY — use element ID for deterministic choice
    // Elements with lexically smaller ID go to TOP, others to BOTTOM
    return targetSymbol.elementId.localeCompare(busSymbol.elementId) < 0 ? 'TOP' : 'BOTTOM';
  } else {
    // Vertical busbar: feeders exit LEFT or RIGHT
    if (targetX < busX) {
      return 'LEFT';
    }
    if (targetX > busX) {
      return 'RIGHT';
    }
    // TIE-BREAK: targetX === busX — use element ID for deterministic choice
    return targetSymbol.elementId.localeCompare(busSymbol.elementId) < 0 ? 'LEFT' : 'RIGHT';
  }
}

/**
 * Generate deterministic order key for feeder.
 * Uses side, X position, element ID for stable sorting.
 *
 * DETERMINISTIC: Pure function with tie-break chain:
 * 1. Primary: side (grouped by exit side)
 * 2. Secondary: target X position (for H bus) or Y position (for V bus)
 * 3. Tertiary: element ID (final tie-break for identical positions)
 *
 * @param targetSymbol - Target connected symbol
 * @param side - Feeder exit side
 * @param _index - Index (unused, kept for API compat)
 * @returns Deterministic order key string
 */
export function generateFeederOrderKey(
  targetSymbol: AnySldSymbol,
  side: FeederSide,
  _index: number
): string {
  // Format: side + position (padded) + elementId
  // Position as integer for proper lexical sorting
  // Use X for TOP/BOTTOM (H busbar), Y for LEFT/RIGHT (V busbar)
  const isHorizontalBusbar = side === 'TOP' || side === 'BOTTOM';
  const posValue = isHorizontalBusbar ? targetSymbol.position.x : targetSymbol.position.y;

  // Convert to padded integer string (supports negative and up to 99999)
  // Add 100000 offset to handle negatives
  const paddedPos = (Math.round(posValue) + 100000).toString().padStart(6, '0');

  return `${side}_${paddedPos}_${targetSymbol.elementId}`;
}

/**
 * Get busbar thickness from NodeSymbol or default from CANONICAL_GEOMETRY.
 *
 * DETERMINISTIC: Pure function
 */
export function getBusbarThickness(busSymbol: NodeSymbol, axis: 'H' | 'V'): number {
  // For horizontal busbar, thickness is height
  // For vertical busbar, thickness is width
  const thickness = axis === 'H' ? busSymbol.height : busSymbol.width;

  // If thickness is too small or zero, use CANONICAL default
  if (thickness <= 0) {
    return CANONICAL_GEOMETRY.busbar.height;
  }

  return thickness;
}

// =============================================================================
// MAIN ADAPTER FUNCTIONS
// =============================================================================

/**
 * Build BusbarInput from NodeSymbol.
 *
 * DETERMINISTIC: Pure function
 *
 * @param busSymbol - Bus symbol from SLD model
 * @returns BusbarInput for auto-layout algorithm
 */
export function buildBusbarInput(busSymbol: NodeSymbol): BusbarInput {
  const axis = determineBusbarAxis(busSymbol);
  const { p0, p1 } = calculateBusbarEndpoints(busSymbol, axis);
  const thickness = getBusbarThickness(busSymbol, axis);

  return {
    id: busSymbol.id,
    axis,
    p0,
    p1,
    thickness,
  };
}

/**
 * Build FeederInput from connected symbol.
 *
 * DETERMINISTIC: Pure function
 *
 * @param connectionId - Connection ID (for feeder ID)
 * @param targetSymbol - Symbol connected to busbar (branch, switch, source, load)
 * @param busSymbol - Parent busbar symbol
 * @param axis - Busbar axis
 * @param feederIndex - Index for deterministic ordering
 * @returns FeederInput for auto-layout algorithm
 */
export function buildFeederInput(
  connectionId: string,
  targetSymbol: AnySldSymbol,
  busSymbol: NodeSymbol,
  axis: 'H' | 'V',
  feederIndex: number
): FeederInput {
  const side = determineFeederSide(busSymbol, targetSymbol, axis);
  const orderKey = generateFeederOrderKey(targetSymbol, side, feederIndex);

  return {
    id: connectionId,
    side,
    orderKey,
    // Target position for DIRECT_TO_TARGET mode (optional)
    targetPosition: {
      x: targetSymbol.position.x,
      y: targetSymbol.position.y,
    },
  };
}

/**
 * Find all symbols connected to a busbar.
 * Returns symbols that have this busbar as fromNodeId or toNodeId.
 *
 * DETERMINISTIC: Sorted by element ID
 *
 * @param busSymbol - Busbar symbol
 * @param allSymbols - All SLD symbols
 * @returns Array of (connectionId, connectedSymbol) tuples
 */
export function findBusbarFeeders(
  busSymbol: NodeSymbol,
  allSymbols: readonly AnySldSymbol[]
): Array<{ connectionId: string; symbol: AnySldSymbol }> {
  const busElementId = busSymbol.elementId;
  const feeders: Array<{ connectionId: string; symbol: AnySldSymbol }> = [];

  for (const symbol of allSymbols) {
    // Skip the busbar itself
    if (symbol.id === busSymbol.id) {
      continue;
    }

    // Check if this symbol connects to the busbar
    let isConnected = false;
    let connectionId = '';

    switch (symbol.elementType) {
      case 'LineBranch':
      case 'TransformerBranch': {
        const branch = symbol as { fromNodeId: string; toNodeId: string; id: string };
        if (branch.fromNodeId === busElementId || branch.toNodeId === busElementId) {
          isConnected = true;
          connectionId = symbol.id;
        }
        break;
      }
      case 'Switch': {
        const sw = symbol as { fromNodeId: string; toNodeId: string; id: string };
        if (sw.fromNodeId === busElementId) {
          isConnected = true;
          connectionId = `${symbol.id}_in`;
        } else if (sw.toNodeId === busElementId) {
          isConnected = true;
          connectionId = `${symbol.id}_out`;
        }
        break;
      }
      case 'Source': {
        const source = symbol as { connectedToNodeId: string; id: string };
        if (source.connectedToNodeId === busElementId) {
          isConnected = true;
          connectionId = `${symbol.id}_conn`;
        }
        break;
      }
      case 'Load': {
        const load = symbol as { connectedToNodeId: string; id: string };
        if (load.connectedToNodeId === busElementId) {
          isConnected = true;
          connectionId = `${symbol.id}_conn`;
        }
        break;
      }
    }

    if (isConnected && connectionId) {
      feeders.push({ connectionId, symbol });
    }
  }

  // Sort by element ID for determinism
  feeders.sort((a, b) => a.symbol.elementId.localeCompare(b.symbol.elementId));

  return feeders;
}

/**
 * Build complete auto-layout input for a busbar.
 *
 * DETERMINISTIC: Pure function, same inputs → same output
 *
 * @param busSymbol - Busbar symbol
 * @param allSymbols - All SLD symbols
 * @returns BusbarAutoLayoutInput or null if no feeders
 */
export function buildBusbarAutoLayoutInputs(
  busSymbol: NodeSymbol,
  allSymbols: readonly AnySldSymbol[]
): BusbarAutoLayoutInput | null {
  // Find all feeders connected to this busbar
  const feederData = findBusbarFeeders(busSymbol, allSymbols);

  if (feederData.length === 0) {
    return null;
  }

  // Build busbar input
  const bus = buildBusbarInput(busSymbol);

  // Build feeder inputs
  const feeders: FeederInput[] = [];
  const feederTargets = new Map<string, AnySldSymbol>();

  for (let i = 0; i < feederData.length; i++) {
    const { connectionId, symbol } = feederData[i];
    const feederInput = buildFeederInput(connectionId, symbol, busSymbol, bus.axis, i);
    feeders.push(feederInput);
    feederTargets.set(connectionId, symbol);
  }

  return {
    bus,
    feeders,
    feederTargets,
  };
}

// =============================================================================
// LAYOUT EXECUTION
// =============================================================================

/**
 * Convert PathSegment[] to Position[] for connection rendering.
 *
 * DETERMINISTIC: Pure function
 */
export function pathSegmentsToPositions(segments: readonly PathSegment[]): Position[] {
  const points = segmentsToPolyline(segments);
  return points.map((p) => ({ x: p.x, y: p.y }));
}

/**
 * Execute auto-layout for a busbar and return render-ready results.
 *
 * DETERMINISTIC: Same inputs → identical output
 *
 * @param input - BusbarAutoLayoutInput from buildBusbarAutoLayoutInputs
 * @returns BusbarAutoLayoutRenderResult with paths for rendering
 */
export function executeBusbarAutoLayout(
  input: BusbarAutoLayoutInput
): BusbarAutoLayoutRenderResult {
  // Run the auto-layout algorithm
  const layoutResult = computeBusbarAutoLayout(input.bus, input.feeders);

  // Convert results to render-ready format
  const feederPaths: FeederPathResult[] = [];

  for (const feederLayout of layoutResult.feeders) {
    const targetSymbol = input.feederTargets.get(feederLayout.id);

    if (!targetSymbol) {
      continue;
    }

    // Convert path segments to Position[]
    const path = pathSegmentsToPositions(feederLayout.pathSegments);

    feederPaths.push({
      feederId: feederLayout.id,
      path,
      targetSymbolId: targetSymbol.id,
    });
  }

  // Sort by feeder ID for determinism
  feederPaths.sort((a, b) => a.feederId.localeCompare(b.feederId));

  return {
    busbarId: input.bus.id,
    feederPaths,
    meta: {
      params: layoutResult.params,
      feederCount: feederPaths.length,
    },
  };
}

// =============================================================================
// COMPLETE INTEGRATION FUNCTION
// =============================================================================

/**
 * Generate auto-layout paths for all busbar feeders.
 * This is the main entry point for integration with connectionRouting.ts.
 *
 * DETERMINISTIC: Same inputs → identical output
 *
 * @param busSymbol - Busbar symbol
 * @param allSymbols - All SLD symbols
 * @returns Map of connectionId → Position[] path, or null if no feeders
 */
export function generateBusbarFeederPaths(
  busSymbol: NodeSymbol,
  allSymbols: readonly AnySldSymbol[]
): Map<string, Position[]> | null {
  // Build input
  const input = buildBusbarAutoLayoutInputs(busSymbol, allSymbols);

  if (!input) {
    return null;
  }

  // Execute layout
  const result = executeBusbarAutoLayout(input);

  // Convert to Map for easy lookup
  const pathMap = new Map<string, Position[]>();

  for (const feederPath of result.feederPaths) {
    pathMap.set(feederPath.feederId, [...feederPath.path]);
  }

  return pathMap;
}

/**
 * Check if a connection ID corresponds to a busbar feeder.
 *
 * @param connectionId - Connection ID to check
 * @param busbarFeederPaths - Map from generateBusbarFeederPaths
 * @returns true if this connection has an auto-layout path
 */
export function isBusbarFeederConnection(
  connectionId: string,
  busbarFeederPaths: Map<string, Position[]> | null
): boolean {
  if (!busbarFeederPaths) {
    return false;
  }
  return busbarFeederPaths.has(connectionId);
}

/**
 * Get auto-layout path for a busbar feeder connection.
 *
 * @param connectionId - Connection ID
 * @param busbarFeederPaths - Map from generateBusbarFeederPaths
 * @returns Position[] path or null if not found
 */
export function getBusbarFeederPath(
  connectionId: string,
  busbarFeederPaths: Map<string, Position[]> | null
): Position[] | null {
  if (!busbarFeederPaths) {
    return null;
  }
  return busbarFeederPaths.get(connectionId) ?? null;
}
