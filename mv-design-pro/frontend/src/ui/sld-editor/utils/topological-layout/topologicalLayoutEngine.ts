/**
 * TOPOLOGICAL AUTO-LAYOUT ENGINE — Main Orchestrator
 *
 * Glowny silnik auto-layoutu topologicznego SLD.
 * Koordynuje wszystkie fazy:
 * 1. Analiza topologii (roleAssigner)
 * 2. Orientacja globalna (geometricSkeleton)
 * 3. Szkielet geometryczny (geometricSkeleton)
 * 4. Moduly, sloty, rytm (geometricSkeleton)
 * 5. Auto-insert (autoInsert)
 * 6. Kolizje i granice (collisionGuard)
 *
 * ZASADY:
 * - Ten sam model danych -> bitowo identyczny layout
 * - Kolizja symbol-symbol = FAIL CI
 * - Wspolrzedne sa WYNIKIEM, nie wejsciem
 * - Layout dziala ZAWSZE i SAM (bez przyciskow)
 *
 * DETERMINIZM: 100% gwarantowany
 */

import type { AnySldSymbol, Position } from '../../types';
import type {
  TopologicalLayoutResult,
  LayoutDiagnostics,
  GlobalOrientation,
  LayoutGeometryConfig,
  ModelOperation,
  AutoInsertResult,
} from './types';
import { assignTopologicalRoles } from './roleAssigner';
import { buildGeometricSkeleton, DEFAULT_GEOMETRY_CONFIG } from './geometricSkeleton';
import { detectSymbolCollisions, resolveSymbolCollisions } from './collisionGuard';
import { processAutoInsert } from './autoInsert';

// =============================================================================
// IMMUTABILITY GUARD (BUG-01 Prevention)
// =============================================================================

/**
 * Deep-freeze an array of symbols to catch accidental mutations.
 * Applied at engine entry point in development/test mode.
 *
 * ZERO SYMBOL MUTATIONS: Layout generates positions as OUTPUT.
 * Input symbols MUST remain bitwise identical after layout.
 */
export function deepFreezeSymbols<T extends object>(symbols: readonly T[]): readonly T[] {
  if (typeof Object.freeze !== 'function') return symbols;
  Object.freeze(symbols);
  for (const symbol of symbols) {
    if (symbol && typeof symbol === 'object') {
      Object.freeze(symbol);
      // Freeze nested position object if present
      const pos = (symbol as any).position;
      if (pos && typeof pos === 'object') {
        Object.freeze(pos);
      }
      // Freeze nested points array if present (BranchSymbol)
      const pts = (symbol as any).points;
      if (Array.isArray(pts)) {
        Object.freeze(pts);
        for (const pt of pts) {
          if (pt && typeof pt === 'object') Object.freeze(pt);
        }
      }
    }
  }
  return symbols;
}

// =============================================================================
// MAIN ENGINE
// =============================================================================

/**
 * Compute complete topological layout for SLD symbols.
 *
 * DETERMINISTIC: Same symbols -> bitwise identical layout.
 *
 * This is the main entry point for the topological layout engine.
 * It replaces the old generateAutoLayout function with a topology-driven
 * approach where coordinates are OUTPUT, not INPUT.
 *
 * @param symbols - SLD symbols to layout
 * @param config - Geometry configuration (optional, uses CANONICAL defaults)
 * @param orientation - Global orientation (default: 'top-down')
 * @returns Complete layout result with positions, roles, skeleton, collisions
 */
export function computeTopologicalLayout(
  symbols: readonly AnySldSymbol[],
  config: LayoutGeometryConfig = DEFAULT_GEOMETRY_CONFIG,
  orientation: GlobalOrientation = 'top-down'
): TopologicalLayoutResult {
  const startTime = performance.now();

  // IMMUTABILITY GUARD: Freeze input to catch accidental mutations (BUG-01)
  // In production, Object.freeze is a no-op on already-frozen objects.
  // In dev/test, this catches any .position = ..., .width = ..., etc.
  if (process.env.NODE_ENV !== 'production') {
    deepFreezeSymbols(symbols);
  }

  // Handle empty state
  if (symbols.length === 0) {
    return createEmptyResult(orientation, startTime);
  }

  // ==========================================
  // PHASE 1: TOPOLOGY ANALYSIS + ROLE ASSIGNMENT
  // ==========================================
  const {
    assignments: roleAssignments,
    connectionNodeIds,
    stationSymbolIds,
    feederChainsByBusbar,
  } = assignTopologicalRoles(symbols);

  // Filter BoundaryNode from working set
  const workingSymbols = symbols.filter((s) => !connectionNodeIds.includes(s.id));
  if (workingSymbols.length === 0) {
    return createEmptyResult(orientation, startTime, connectionNodeIds);
  }

  // ==========================================
  // PHASE 2-4: GEOMETRIC SKELETON (orientation + skeleton + slots)
  // ==========================================
  const skeleton = buildGeometricSkeleton(
    workingSymbols,
    roleAssignments,
    feederChainsByBusbar,
    stationSymbolIds,
    config,
    orientation
  );

  // ==========================================
  // PHASE 6: COLLISION DETECTION + RESOLUTION
  // ==========================================
  // First detect collisions
  const initialReport = detectSymbolCollisions(
    workingSymbols,
    skeleton.positions,
    config.symbolClearance,
    config
  );

  // Resolve if any
  let finalPositions: ReadonlyMap<string, Position>;

  if (initialReport.hasCollisions) {
    const mutablePositions = new Map(skeleton.positions);
    const resolution = resolveSymbolCollisions(
      workingSymbols,
      mutablePositions,
      20,
      config
    );
    finalPositions = resolution.resolved;
  } else {
    finalPositions = skeleton.positions;
  }

  // Final collision check (should be clean now)
  const finalReport = detectSymbolCollisions(
    workingSymbols,
    finalPositions,
    config.symbolClearance,
    config
  );

  // ==========================================
  // DIAGNOSTICS
  // ==========================================
  const unassigned = workingSymbols
    .filter((s) => !roleAssignments.has(s.id))
    .map((s) => s.id);

  const quarantined = workingSymbols
    .filter((s) => {
      const pos = finalPositions.get(s.id);
      if (!pos) return true;
      // Check if in quarantine zone (below normal layout area)
      let maxNormalY = 0;
      for (const tier of skeleton.tiers) {
        maxNormalY = Math.max(maxNormalY, tier.axialPosition);
      }
      return pos.y > maxNormalY + config.tierSpacing * 2;
    })
    .map((s) => s.id);

  const stationStacksMap = new Map<string, readonly string[]>();
  for (const [busId, chains] of feederChainsByBusbar) {
    for (const chain of chains) {
      if (chain.allSymbolIds.length > 1) {
        const key = chain.switchId ?? chain.branchId ?? busId;
        stationStacksMap.set(key, chain.allSymbolIds);
      }
    }
  }

  const diagnostics: LayoutDiagnostics = {
    orientation,
    spinePosition: skeleton.spinePosition,
    tierCount: skeleton.tiers.length,
    busbarCount: skeleton.busbars.length,
    sectionCount: skeleton.busbars.reduce((sum, b) => sum + b.sections.length, 0),
    slotCount: skeleton.allSlots.length,
    assignedRoleCount: roleAssignments.size,
    unassignedSymbolIds: unassigned,
    quarantinedSymbolIds: quarantined,
    filteredPccIds: connectionNodeIds,
    stationStacks: stationStacksMap,
    layoutTimeMs: performance.now() - startTime,
    isEmpty: false,
  };

  return {
    positions: finalPositions,
    roleAssignments,
    skeleton: {
      ...skeleton,
      positions: finalPositions,
    },
    collisionReport: finalReport,
    diagnostics,
  };
}

// =============================================================================
// INCREMENTAL UPDATE
// =============================================================================

/**
 * Process an incremental model operation.
 *
 * DETERMINISTIC: Same operation on same state -> same result.
 *
 * @param operation - Model operation (ADD/REMOVE/MODIFY)
 * @param currentSymbols - Current symbols
 * @param currentResult - Current layout result
 * @param config - Geometry config
 */
export function processIncrementalUpdate(
  operation: ModelOperation,
  currentSymbols: readonly AnySldSymbol[],
  currentResult: TopologicalLayoutResult | null,
  config: LayoutGeometryConfig = DEFAULT_GEOMETRY_CONFIG
): AutoInsertResult {
  return processAutoInsert(
    operation,
    currentSymbols,
    currentResult?.positions ?? new Map(),
    currentResult?.skeleton ?? null,
    config
  );
}

// =============================================================================
// DETERMINISM VERIFICATION
// =============================================================================

/**
 * Verify that the layout engine is deterministic.
 * Runs layout twice and compares results.
 *
 * @param symbols - SLD symbols
 * @param config - Geometry config
 * @returns True if layout is deterministic
 */
export function verifyDeterminism(
  symbols: readonly AnySldSymbol[],
  config: LayoutGeometryConfig = DEFAULT_GEOMETRY_CONFIG
): boolean {
  const result1 = computeTopologicalLayout(symbols, config);
  const result2 = computeTopologicalLayout(symbols, config);

  // Compare all positions
  if (result1.positions.size !== result2.positions.size) return false;

  for (const [id, pos1] of result1.positions) {
    const pos2 = result2.positions.get(id);
    if (!pos2 || pos1.x !== pos2.x || pos1.y !== pos2.y) {
      return false;
    }
  }

  // Compare role assignments
  if (result1.roleAssignments.size !== result2.roleAssignments.size) return false;

  for (const [id, role1] of result1.roleAssignments) {
    const role2 = result2.roleAssignments.get(id);
    if (!role2) return false;
    if (role1.role !== role2.role) return false;
    if (role1.canonicalLayer !== role2.canonicalLayer) return false;
    if (role1.voltageLevel !== role2.voltageLevel) return false;
  }

  return true;
}

// =============================================================================
// HELPERS
// =============================================================================

function createEmptyResult(
  orientation: GlobalOrientation,
  startTime: number,
  connectionNodeIds: string[] = []
): TopologicalLayoutResult {
  return {
    positions: new Map(),
    roleAssignments: new Map(),
    skeleton: {
      spinePosition: 0,
      tiers: [],
      busbars: [],
      allSlots: [],
      positions: new Map(),
    },
    collisionReport: {
      hasCollisions: false,
      pairs: [],
      affectedSymbolCount: 0,
    },
    diagnostics: {
      orientation,
      spinePosition: 0,
      tierCount: 0,
      busbarCount: 0,
      sectionCount: 0,
      slotCount: 0,
      assignedRoleCount: 0,
      unassignedSymbolIds: [],
      quarantinedSymbolIds: [],
      filteredPccIds: connectionNodeIds,
      stationStacks: new Map(),
      layoutTimeMs: performance.now() - startTime,
      isEmpty: true,
    },
  };
}
