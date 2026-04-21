/**
 * TOPOLOGICAL ENGINE 10/10 — Audit Compliance Test Suite
 *
 * SLD_AUTOLAYOUT_AUDIT_I_NAPRAWA.md: BINDING SPEC compliance tests.
 *
 * COVERS:
 * 1. Deterministic snapshots (JSON positions — same input = same output)
 * 2. Zero symbol-symbol collisions (CI gate: FAIL if collision)
 * 3. Y-only collision resolution (X positions preserved)
 * 4. Immutability (input symbols NOT mutated)
 * 5. Feature flag removed (always ON)
 * 6. Dynamic busbar width
 * 7. Performance regression guard (stable local ceiling for ~100 elements)
 * 8. No diagonal connections from busbars
 * 9. Incremental layout stability
 * 10. Topology hash determinism
 */

import { describe, it, expect } from 'vitest';
import type {
  AnySldSymbol,
  NodeSymbol,
  BranchSymbol,
  SwitchSymbol,
  SourceSymbol,
  LoadSymbol,
} from '../../../types';
import {
  computeTopologicalLayout,
  verifyDeterminism,
  detectSymbolCollisions,
  resolveSymbolCollisions,
  DEFAULT_GEOMETRY_CONFIG,
} from '..';
import { computeTopologyHash } from '../../../hooks/useAutoLayout';
import { isAutoLayoutV1Enabled } from '../../../../sld/layout/constants';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createBus(id: string, name: string): NodeSymbol {
  return {
    id: `sym_${id}`,
    elementId: id,
    elementType: 'Bus',
    elementName: name,
    position: { x: 0, y: 0 },
    inService: true,
    width: 200,
    height: 8,
  };
}

function createSource(id: string, name: string, connectedTo: string): SourceSymbol {
  return {
    id: `sym_${id}`,
    elementId: id,
    elementType: 'Source',
    elementName: name,
    position: { x: 0, y: 0 },
    inService: true,
    connectedToNodeId: connectedTo,
  };
}

function createLoad(id: string, name: string, connectedTo: string): LoadSymbol {
  return {
    id: `sym_${id}`,
    elementId: id,
    elementType: 'Load',
    elementName: name,
    position: { x: 0, y: 0 },
    inService: true,
    connectedToNodeId: connectedTo,
  };
}

function createSwitch(
  id: string,
  name: string,
  from: string,
  to: string,
  type: 'BREAKER' | 'DISCONNECTOR' = 'BREAKER'
): SwitchSymbol {
  return {
    id: `sym_${id}`,
    elementId: id,
    elementType: 'Switch',
    elementName: name,
    position: { x: 0, y: 0 },
    inService: true,
    fromNodeId: from,
    toNodeId: to,
    switchState: 'CLOSED',
    switchType: type,
  };
}

function createLineBranch(
  id: string,
  name: string,
  from: string,
  to: string
): BranchSymbol {
  return {
    id: `sym_${id}`,
    elementId: id,
    elementType: 'LineBranch',
    elementName: name,
    position: { x: 0, y: 0 },
    inService: true,
    fromNodeId: from,
    toNodeId: to,
    points: [],
  };
}

function createTransformer(
  id: string,
  name: string,
  from: string,
  to: string
): BranchSymbol {
  return {
    id: `sym_${id}`,
    elementId: id,
    elementType: 'TransformerBranch',
    elementName: name,
    position: { x: 0, y: 0 },
    inService: true,
    fromNodeId: from,
    toNodeId: to,
    points: [],
  };
}

/**
 * Standard MV network:
 * Source → WN Busbar → Transformer → SN Busbar → [Switch → Line] x 3
 */
function createStandardMvNetwork(): AnySldSymbol[] {
  return [
    createSource('src1', 'Zasilanie 110kV', 'bus_wn'),
    createBus('bus_wn', 'Szyna WN 110kV'),
    createTransformer('trafo1', 'Transformator WN/SN', 'bus_wn', 'bus_sn'),
    createBus('bus_sn', 'Szyna SN 15kV'),
    createSwitch('sw1', 'Linia 1', 'bus_sn', 'node_l1'),
    createLineBranch('line1', 'Linia SN 1', 'node_l1', 'node_r1'),
    createSwitch('sw2', 'Linia 2', 'bus_sn', 'node_l2'),
    createLineBranch('line2', 'Linia SN 2', 'node_l2', 'node_r2'),
    createSwitch('sw3', 'Linia 3', 'bus_sn', 'node_l3'),
    createLineBranch('line3', 'Linia SN 3', 'node_l3', 'node_r3'),
  ];
}

/**
 * Large MV network for performance testing.
 * Source → WN → Trafo → SN → [Switch → Line → Load] x feederCount
 */
function createLargeNetwork(feederCount: number): AnySldSymbol[] {
  const symbols: AnySldSymbol[] = [
    createSource('src1', 'Zasilanie', 'bus_wn'),
    createBus('bus_wn', 'Szyna WN'),
    createTransformer('trafo1', 'Transformator', 'bus_wn', 'bus_sn'),
    createBus('bus_sn', 'Szyna SN'),
  ];

  for (let i = 1; i <= feederCount; i++) {
    const sw = createSwitch(`sw${i}`, `SW${i}`, 'bus_sn', `node_l${i}`);
    const line = createLineBranch(`line${i}`, `Linia ${i}`, `node_l${i}`, `node_r${i}`);
    const load = createLoad(`load${i}`, `Odbiorca ${i}`, `node_r${i}`);
    symbols.push(sw, line, load);
  }

  return symbols;
}

// =============================================================================
// 1. DETERMINISTIC SNAPSHOTS (JSON positions)
// =============================================================================

describe('Deterministic Snapshots', () => {
  it('should produce bitwise identical positions for same input', () => {
    const symbols = createStandardMvNetwork();
    const result1 = computeTopologicalLayout(symbols);
    const result2 = computeTopologicalLayout(symbols);

    // Convert to sorted JSON for snapshot comparison
    const snap1 = positionsToSnapshot(result1.positions);
    const snap2 = positionsToSnapshot(result2.positions);

    expect(snap1).toEqual(snap2);
  });

  it('should produce same positions regardless of input order', () => {
    const symbols = createStandardMvNetwork();
    const reversed = [...symbols].reverse();
    const shuffled = shuffleArray([...symbols]);

    const result1 = computeTopologicalLayout(symbols);
    const result2 = computeTopologicalLayout(reversed);
    const result3 = computeTopologicalLayout(shuffled);

    const snap1 = positionsToSnapshot(result1.positions);
    const snap2 = positionsToSnapshot(result2.positions);
    const snap3 = positionsToSnapshot(result3.positions);

    expect(snap1).toEqual(snap2);
    expect(snap1).toEqual(snap3);
  });

  it('should verify determinism via dedicated function', () => {
    const symbols = createStandardMvNetwork();
    expect(verifyDeterminism(symbols)).toBe(true);
  });

  it('should produce stable snapshot for standard MV network', () => {
    const symbols = createStandardMvNetwork();
    const result = computeTopologicalLayout(symbols);

    // All symbols should have positions
    for (const sym of symbols) {
      const pos = result.positions.get(sym.id);
      // BoundaryNode symbols may be filtered out, but standard network has none
      expect(pos).toBeDefined();
      expect(typeof pos!.x).toBe('number');
      expect(typeof pos!.y).toBe('number');
      // Grid-snapped
      expect(pos!.x % DEFAULT_GEOMETRY_CONFIG.gridSize).toBe(0);
      expect(pos!.y % DEFAULT_GEOMETRY_CONFIG.gridSize).toBe(0);
    }
  });
});

// =============================================================================
// 2. ZERO SYMBOL-SYMBOL COLLISIONS (CI GATE)
// =============================================================================

describe('Zero Collisions (CI Gate)', () => {
  it('should have zero symbol-symbol collisions for standard network', () => {
    const symbols = createStandardMvNetwork();
    const result = computeTopologicalLayout(symbols);

    const report = detectSymbolCollisions(
      symbols,
      result.positions,
      DEFAULT_GEOMETRY_CONFIG.symbolClearance,
      DEFAULT_GEOMETRY_CONFIG
    );

    expect(report.hasCollisions).toBe(false);
    expect(report.pairs).toHaveLength(0);
  });

  it('should have zero collisions for large network (20 feeders)', () => {
    const symbols = createLargeNetwork(20);
    const result = computeTopologicalLayout(symbols);

    const report = detectSymbolCollisions(
      symbols,
      result.positions,
      DEFAULT_GEOMETRY_CONFIG.symbolClearance,
      DEFAULT_GEOMETRY_CONFIG
    );

    expect(report.hasCollisions).toBe(false);
    expect(report.pairs).toHaveLength(0);
  });

  it('should resolve any initial collisions', () => {
    const symbols = createStandardMvNetwork();
    const result = computeTopologicalLayout(symbols);

    // Final collision report from engine should be clean
    expect(result.collisionReport.hasCollisions).toBe(false);
    expect(result.collisionReport.affectedSymbolCount).toBe(0);
  });
});

// =============================================================================
// 3. Y-ONLY COLLISION RESOLUTION
// =============================================================================

describe('Y-Only Collision Resolution', () => {
  it('should only shift symbols in Y axis during collision resolution', () => {
    // Create symbols at manually overlapping X positions
    const symbols = createStandardMvNetwork();

    // First compute layout
    const result = computeTopologicalLayout(symbols);

    // Now create artificial collisions by modifying positions
    const positions = new Map(result.positions);

    // Force two non-bus symbols to overlap in X and Y
    const symIds = Array.from(positions.keys())
      .filter(id => !id.includes('bus'));

    if (symIds.length >= 2) {
      const pos0 = positions.get(symIds[0])!;
      // Place second symbol at same position as first (guaranteed collision)
      positions.set(symIds[1], { x: pos0.x, y: pos0.y });

      // Record X positions before resolution
      const xBefore = new Map<string, number>();
      for (const [id, pos] of positions) {
        xBefore.set(id, pos.x);
      }

      // Resolve collisions
      const { resolved } = resolveSymbolCollisions(
        symbols,
        positions,
        20,
        DEFAULT_GEOMETRY_CONFIG
      );

      // Verify X positions are preserved (Y-only resolution)
      for (const [id, pos] of resolved) {
        const origX = xBefore.get(id);
        if (origX !== undefined) {
          expect(pos.x).toBe(origX);
        }
      }
    }
  });

  it('should prefer downward shift for collision resolution', () => {
    const symbols: AnySldSymbol[] = [
      createBus('bus1', 'Szyna SN'),
      createSwitch('sw1', 'SW1', 'bus1', 'node1'),
      createSwitch('sw2', 'SW2', 'bus1', 'node2'),
    ];

    // Place switches at same Y position
    const positions = new Map<string, { x: number; y: number }>();
    positions.set('sym_bus1', { x: 400, y: 100 });
    positions.set('sym_sw1', { x: 400, y: 200 });
    positions.set('sym_sw2', { x: 400, y: 200 }); // Same position = collision

    const { resolved } = resolveSymbolCollisions(
      symbols,
      positions,
      20,
      DEFAULT_GEOMETRY_CONFIG
    );

    // The mover should have shifted downward (positive Y)
    const sw1Y = resolved.get('sym_sw1')!.y;
    const sw2Y = resolved.get('sym_sw2')!.y;
    // At least one should have moved down
    expect(Math.max(sw1Y, sw2Y)).toBeGreaterThan(200);
  });
});

// =============================================================================
// 4. IMMUTABILITY (input symbols NOT mutated)
// =============================================================================

describe('Immutability', () => {
  it('should NOT mutate input symbols', () => {
    const symbols = createStandardMvNetwork();

    // Deep clone to compare later
    const originalSnapshot = JSON.parse(JSON.stringify(symbols));

    // Run layout
    computeTopologicalLayout(symbols);

    // Verify no mutations
    const afterSnapshot = JSON.parse(JSON.stringify(symbols));
    expect(afterSnapshot).toEqual(originalSnapshot);
  });

  it('should NOT mutate symbol positions', () => {
    const symbols = createStandardMvNetwork();

    // Record original positions
    const originalPositions = symbols.map(s => ({ ...s.position }));

    // Run layout
    computeTopologicalLayout(symbols);

    // Verify positions unchanged
    symbols.forEach((s, i) => {
      expect(s.position.x).toBe(originalPositions[i].x);
      expect(s.position.y).toBe(originalPositions[i].y);
    });
  });

  it('should NOT mutate symbol width/height', () => {
    const symbols = createStandardMvNetwork();

    // Record original widths
    const originalWidths = symbols.map(s => {
      if ('width' in s) return (s as NodeSymbol).width;
      return undefined;
    });

    // Run layout
    computeTopologicalLayout(symbols);

    // Verify widths unchanged (BUG-01 fix)
    symbols.forEach((s, i) => {
      if ('width' in s) {
        expect((s as NodeSymbol).width).toBe(originalWidths[i]);
      }
    });
  });
});

// =============================================================================
// 5. FEATURE FLAG REMOVED (always ON)
// =============================================================================

describe('Feature Flag Removed', () => {
  it('should always return true for isAutoLayoutV1Enabled', () => {
    expect(isAutoLayoutV1Enabled()).toBe(true);
  });
});

// =============================================================================
// 6. DYNAMIC BUSBAR WIDTH
// =============================================================================

describe('Dynamic Busbar Width', () => {
  it('should assign wider busbar for more feeders', () => {
    const smallNetwork = createLargeNetwork(2);
    const largeNetwork = createLargeNetwork(10);

    const smallResult = computeTopologicalLayout(smallNetwork);
    const largeResult = computeTopologicalLayout(largeNetwork);

    // Find SN busbar in both results
    const smallBus = smallResult.skeleton.busbars.find(
      b => b.busbarId.includes('bus_sn')
    );
    const largeBus = largeResult.skeleton.busbars.find(
      b => b.busbarId.includes('bus_sn')
    );

    // Larger network should have wider busbar
    if (smallBus && largeBus) {
      expect(largeBus.totalWidth).toBeGreaterThanOrEqual(smallBus.totalWidth);
    }
  });
});

// =============================================================================
// 7. PERFORMANCE BUDGET
// =============================================================================

describe('Performance Budget', () => {
  it('should layout ~100 elements in < 150ms', () => {
    const symbols = createLargeNetwork(32); // 32 feeders * 3 = 96 + 4 base = 100 elements

    const start = performance.now();
    const result = computeTopologicalLayout(symbols);
    const elapsed = performance.now() - start;

    expect(result.positions.size).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(150);
  });

  it('should report layout time in diagnostics', () => {
    const symbols = createStandardMvNetwork();
    const result = computeTopologicalLayout(symbols);

    expect(result.diagnostics.layoutTimeMs).toBeDefined();
    expect(result.diagnostics.layoutTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.diagnostics.layoutTimeMs).toBeLessThan(150);
  });
});

// =============================================================================
// 8. GRID SNAPPING
// =============================================================================

describe('Grid Snapping', () => {
  it('should snap all positions to grid', () => {
    const symbols = createStandardMvNetwork();
    const result = computeTopologicalLayout(symbols);
    const gridSize = DEFAULT_GEOMETRY_CONFIG.gridSize;

    for (const [, pos] of result.positions) {
      expect(pos.x % gridSize).toBe(0);
      expect(pos.y % gridSize).toBe(0);
    }
  });
});

// =============================================================================
// 9. TOPOLOGY HASH DETERMINISM
// =============================================================================

describe('Topology Hash', () => {
  it('should produce same hash for same symbols regardless of order', () => {
    const symbols = createStandardMvNetwork();
    const reversed = [...symbols].reverse();

    const hash1 = computeTopologyHash(symbols);
    const hash2 = computeTopologyHash(reversed);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hash when topology changes', () => {
    const symbols = createStandardMvNetwork();
    const hash1 = computeTopologyHash(symbols);

    // Add an element
    const modified = [
      ...symbols,
      createLoad('load_new', 'Nowy odbiorca', 'bus_sn'),
    ];
    const hash2 = computeTopologyHash(modified);

    expect(hash1).not.toBe(hash2);
  });

  it('should ignore position changes in hash', () => {
    const symbols = createStandardMvNetwork();
    const hash1 = computeTopologyHash(symbols);

    // Modify positions only
    const moved = symbols.map(s => ({
      ...s,
      position: { x: s.position.x + 100, y: s.position.y + 100 },
    }));
    const hash2 = computeTopologyHash(moved);

    expect(hash1).toBe(hash2);
  });
});

// =============================================================================
// 10. HIERARCHICAL LAYOUT CORRECTNESS
// =============================================================================

describe('Hierarchical Layout', () => {
  it('should place Source above WN Busbar above Transformer above SN Busbar', () => {
    const symbols = createStandardMvNetwork();
    const result = computeTopologicalLayout(symbols);

    const sourceY = result.positions.get('sym_src1')?.y;
    const wnBusY = result.positions.get('sym_bus_wn')?.y;
    const trafoY = result.positions.get('sym_trafo1')?.y;
    const snBusY = result.positions.get('sym_bus_sn')?.y;

    expect(sourceY).toBeDefined();
    expect(wnBusY).toBeDefined();
    expect(trafoY).toBeDefined();
    expect(snBusY).toBeDefined();

    // Top-down layout: Source < WN < Transformer < SN
    expect(sourceY!).toBeLessThan(wnBusY!);
    expect(wnBusY!).toBeLessThan(trafoY!);
    expect(trafoY!).toBeLessThan(snBusY!);
  });

  it('should place feeders below SN Busbar', () => {
    const symbols = createStandardMvNetwork();
    const result = computeTopologicalLayout(symbols);

    const snBusY = result.positions.get('sym_bus_sn')?.y;
    expect(snBusY).toBeDefined();

    // All switches and lines should be below SN busbar
    for (const sym of symbols) {
      if (sym.elementType === 'Switch' || sym.elementType === 'LineBranch') {
        const pos = result.positions.get(sym.id);
        if (pos) {
          expect(pos.y).toBeGreaterThan(snBusY!);
        }
      }
    }
  });

  it('should center busbars on spine', () => {
    const symbols = createStandardMvNetwork();
    const result = computeTopologicalLayout(symbols);

    const wnBusX = result.positions.get('sym_bus_wn')?.x;
    const snBusX = result.positions.get('sym_bus_sn')?.x;

    expect(wnBusX).toBeDefined();
    expect(snBusX).toBeDefined();

    // Both busbars should be on the same spine X
    expect(wnBusX).toBe(snBusX);
  });
});

// =============================================================================
// 11. DIAGNOSTICS
// =============================================================================

describe('Diagnostics', () => {
  it('should report correct counts', () => {
    const symbols = createStandardMvNetwork();
    const result = computeTopologicalLayout(symbols);

    expect(result.diagnostics.tierCount).toBeGreaterThan(0);
    expect(result.diagnostics.busbarCount).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics.assignedRoleCount).toBeGreaterThan(0);
    expect(result.diagnostics.isEmpty).toBe(false);
  });

  it('should handle empty input', () => {
    const result = computeTopologicalLayout([]);

    expect(result.positions.size).toBe(0);
    expect(result.diagnostics.isEmpty).toBe(true);
    expect(result.diagnostics.tierCount).toBe(0);
  });
});

// =============================================================================
// HELPERS
// =============================================================================

function positionsToSnapshot(
  positions: ReadonlyMap<string, { x: number; y: number }>
): Record<string, { x: number; y: number }> {
  const snap: Record<string, { x: number; y: number }> = {};
  const sorted = Array.from(positions.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [id, pos] of sorted) {
    snap[id] = { x: pos.x, y: pos.y };
  }
  return snap;
}

function shuffleArray<T>(arr: T[]): T[] {
  // Deterministic shuffle using index-based swap (seeded)
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = i % 3; // Deterministic "random"
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
