/**
 * CONNECTION ROUTING TESTS — Testy algorytmu prowadzenia polaczen
 *
 * CANONICAL ALIGNMENT:
 * - SLD_KANONICZNA_SPECYFIKACJA.md § 4: Polaczenia
 * - SLD_KANONICZNA_SPECYFIKACJA.md § 9: Deterministycznosc
 * - AUDYT_SLD_CANONICAL.md: N-01, N-05
 *
 * TEST COVERAGE:
 * - Deterministycznosc routingu
 * - Orthogonal routing (katy 0/90 stopni)
 * - Snap do siatki
 * - Generowanie polaczen port-to-port
 */

import { describe, it, expect } from 'vitest';
import {
  generateConnections,
  verifyRoutingDeterminism,
  pathToSvgPoints,
} from '../utils/connectionRouting';
import {
  getPortPoint,
  selectBestPorts,
  getSymbolBoundingBox,
} from '../utils/portUtils';
import type { AnySldSymbol, NodeSymbol, BranchSymbol, SwitchSymbol, SourceSymbol, LoadSymbol } from '../types';

// =============================================================================
// TEST DATA: Prosta siec z Bus, Source, Branch
// =============================================================================

const createTestSymbols = (): AnySldSymbol[] => {
  const bus1: NodeSymbol = {
    id: 'bus1-symbol',
    elementId: 'bus1',
    elementType: 'Bus',
    elementName: 'Szyna 1',
    position: { x: 200, y: 100 },
    inService: true,
    width: 80,
    height: 40,
  };

  const bus2: NodeSymbol = {
    id: 'bus2-symbol',
    elementId: 'bus2',
    elementType: 'Bus',
    elementName: 'Szyna 2',
    position: { x: 200, y: 300 },
    inService: true,
    width: 80,
    height: 40,
  };

  const source: SourceSymbol = {
    id: 'source-symbol',
    elementId: 'source1',
    elementType: 'Source',
    elementName: 'Zrodlo',
    position: { x: 200, y: 40 },
    inService: true,
    connectedToNodeId: 'bus1',
  };

  const branch: BranchSymbol = {
    id: 'branch-symbol',
    elementId: 'branch1',
    elementType: 'LineBranch',
    elementName: 'Linia 1',
    position: { x: 200, y: 200 },
    inService: true,
    fromNodeId: 'bus1',
    toNodeId: 'bus2',
    points: [],
    branchType: 'CABLE',
  };

  return [bus1, bus2, source, branch];
};

// =============================================================================
// TESTY DETERMINISTYCZNOSCI
// =============================================================================

describe('Connection Routing - Determinism', () => {
  it('should generate identical connections for the same input', () => {
    const symbols = createTestSymbols();

    const connections1 = generateConnections(symbols);
    const connections2 = generateConnections(symbols);

    expect(connections1.length).toBe(connections2.length);

    for (let i = 0; i < connections1.length; i++) {
      const c1 = connections1[i];
      const c2 = connections2[i];

      expect(c1.id).toBe(c2.id);
      expect(c1.fromSymbolId).toBe(c2.fromSymbolId);
      expect(c1.toSymbolId).toBe(c2.toSymbolId);
      expect(c1.path.length).toBe(c2.path.length);

      for (let j = 0; j < c1.path.length; j++) {
        expect(c1.path[j].x).toBe(c2.path[j].x);
        expect(c1.path[j].y).toBe(c2.path[j].y);
      }
    }
  });

  it('should pass verifyRoutingDeterminism check', () => {
    const symbols = createTestSymbols();
    const isDeterministic = verifyRoutingDeterminism(symbols);
    expect(isDeterministic).toBe(true);
  });

  it('should maintain determinism with empty symbols array', () => {
    const symbols: AnySldSymbol[] = [];

    const connections1 = generateConnections(symbols);
    const connections2 = generateConnections(symbols);

    expect(connections1.length).toBe(0);
    expect(connections2.length).toBe(0);
  });
});

// =============================================================================
// TESTY ORTOGONALNOSCI
// =============================================================================

describe('Connection Routing - Orthogonality', () => {
  it('should generate paths with only horizontal and vertical segments', () => {
    const symbols = createTestSymbols();
    const connections = generateConnections(symbols);

    for (const connection of connections) {
      const { path } = connection;

      // Sprawdz kazdy odcinek sciezki
      for (let i = 0; i < path.length - 1; i++) {
        const pt1 = path[i];
        const pt2 = path[i + 1];

        // Odcinek musi byc poziomy (y1 === y2) lub pionowy (x1 === x2)
        const isHorizontal = pt1.y === pt2.y;
        const isVertical = pt1.x === pt2.x;

        expect(
          isHorizontal || isVertical,
          `Segment ${i} is not orthogonal: (${pt1.x},${pt1.y}) -> (${pt2.x},${pt2.y})`
        ).toBe(true);
      }
    }
  });
});

// =============================================================================
// TESTY SNAP TO GRID
// =============================================================================

describe('Connection Routing - Grid Snap', () => {
  it('should snap all path points to grid (20px)', () => {
    const symbols = createTestSymbols();
    const connections = generateConnections(symbols);
    const gridSize = 20;

    for (const connection of connections) {
      for (const point of connection.path) {
        const isOnGrid = point.x % gridSize === 0 && point.y % gridSize === 0;
        expect(
          isOnGrid,
          `Point (${point.x},${point.y}) is not on grid`
        ).toBe(true);
      }
    }
  });
});

// =============================================================================
// TESTY PORT UTILS
// =============================================================================

describe('Port Utils', () => {
  it('should calculate port point for Bus symbol', () => {
    const bus: NodeSymbol = {
      id: 'bus-symbol',
      elementId: 'bus1',
      elementType: 'Bus',
      elementName: 'Szyna',
      position: { x: 200, y: 100 },
      inService: true,
      width: 80,
      height: 40,
    };

    // Port 'left' dla Bus: x=0, y=50 w viewBox 100x100
    // Skalowanie: width=80, height=40
    // Pozycja: center at (200, 100), offset = -40, -20
    // Expected: x = 200 - 40 + 0 * (80/100) = 160
    //           y = 100 - 20 + 50 * (40/100) = 100
    const leftPort = getPortPoint(bus, 'left');
    expect(leftPort.x).toBe(160);
    expect(leftPort.y).toBe(100);

    // Port 'right' dla Bus: x=100, y=50 w viewBox 100x100
    // Expected: x = 200 - 40 + 100 * (80/100) = 240
    //           y = 100 - 20 + 50 * (40/100) = 100
    const rightPort = getPortPoint(bus, 'right');
    expect(rightPort.x).toBe(240);
    expect(rightPort.y).toBe(100);
  });

  it('should select best ports based on relative positions', () => {
    const bus1: NodeSymbol = {
      id: 'bus1-symbol',
      elementId: 'bus1',
      elementType: 'Bus',
      elementName: 'Szyna 1',
      position: { x: 200, y: 100 },
      inService: true,
      width: 80,
      height: 40,
    };

    const bus2: NodeSymbol = {
      id: 'bus2-symbol',
      elementId: 'bus2',
      elementType: 'Bus',
      elementName: 'Szyna 2',
      position: { x: 200, y: 300 },
      inService: true,
      width: 80,
      height: 40,
    };

    // bus2 jest ponizej bus1 -> polaczenie pionowe
    const { fromPort, toPort } = selectBestPorts(bus1, bus2);

    expect(fromPort).toBe('bottom');
    expect(toPort).toBe('top');
  });

  it('should calculate bounding box correctly', () => {
    const bus: NodeSymbol = {
      id: 'bus-symbol',
      elementId: 'bus1',
      elementType: 'Bus',
      elementName: 'Szyna',
      position: { x: 200, y: 100 },
      inService: true,
      width: 80,
      height: 40,
    };

    const bbox = getSymbolBoundingBox(bus);

    // Bus size: 80x40, centered at (200, 100)
    expect(bbox.x).toBe(160); // 200 - 40
    expect(bbox.y).toBe(80);  // 100 - 20
    expect(bbox.width).toBe(80);
    expect(bbox.height).toBe(40);
  });
});

// =============================================================================
// TESTY GENEROWANIA POLACZEN
// =============================================================================

describe('Connection Generation', () => {
  it('should generate connections for Branch symbols', () => {
    const symbols = createTestSymbols();
    const connections = generateConnections(symbols);

    // Oczekujemy polaczen dla: Source->Bus1, Branch (Bus1->Bus2)
    expect(connections.length).toBeGreaterThan(0);

    // Znajdz polaczenie dla Branch
    const branchConnection = connections.find(
      (c) => c.elementId === 'branch1'
    );

    expect(branchConnection).toBeDefined();
    if (branchConnection) {
      expect(branchConnection.path.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('should generate connections for Source symbols', () => {
    const symbols = createTestSymbols();
    const connections = generateConnections(symbols);

    // Znajdz polaczenie dla Source
    const sourceConnection = connections.find(
      (c) => c.elementId === 'source1'
    );

    expect(sourceConnection).toBeDefined();
    if (sourceConnection) {
      expect(sourceConnection.connectionType).toBe('source');
    }
  });

  it('should sort connections by ID for determinism', () => {
    const symbols = createTestSymbols();
    const connections = generateConnections(symbols);

    const ids = connections.map((c) => c.id);
    const sortedIds = [...ids].sort();

    expect(ids).toEqual(sortedIds);
  });
});

// =============================================================================
// TESTY SVG HELPERS
// =============================================================================

describe('SVG Helpers', () => {
  it('should convert path to SVG points string', () => {
    const path = [
      { x: 100, y: 100 },
      { x: 100, y: 200 },
      { x: 200, y: 200 },
    ];

    const points = pathToSvgPoints(path);
    expect(points).toBe('100,100 100,200 200,200');
  });

  it('should handle empty path', () => {
    const points = pathToSvgPoints([]);
    expect(points).toBe('');
  });

  it('should handle single point', () => {
    const points = pathToSvgPoints([{ x: 50, y: 75 }]);
    expect(points).toBe('50,75');
  });
});

// =============================================================================
// TESTY ZLOZONEJ SIECI
// =============================================================================

describe('Complex Network Routing', () => {
  it('should handle network with switches', () => {
    const bus1: NodeSymbol = {
      id: 'bus1-symbol',
      elementId: 'bus1',
      elementType: 'Bus',
      elementName: 'Szyna 1',
      position: { x: 200, y: 100 },
      inService: true,
      width: 80,
      height: 40,
    };

    const bus2: NodeSymbol = {
      id: 'bus2-symbol',
      elementId: 'bus2',
      elementType: 'Bus',
      elementName: 'Szyna 2',
      position: { x: 200, y: 300 },
      inService: true,
      width: 80,
      height: 40,
    };

    const sw: SwitchSymbol = {
      id: 'switch-symbol',
      elementId: 'switch1',
      elementType: 'Switch',
      elementName: 'Wylacznik',
      position: { x: 200, y: 200 },
      inService: true,
      fromNodeId: 'bus1',
      toNodeId: 'bus2',
      switchState: 'CLOSED',
      switchType: 'BREAKER',
    };

    const symbols: AnySldSymbol[] = [bus1, bus2, sw];
    const connections = generateConnections(symbols);

    // Switch generuje 2 polaczenia: from->switch i switch->to
    const switchConnections = connections.filter(
      (c) => c.elementId === 'switch1'
    );

    expect(switchConnections.length).toBe(2);
  });

  it('should handle network with loads', () => {
    const bus: NodeSymbol = {
      id: 'bus-symbol',
      elementId: 'bus1',
      elementType: 'Bus',
      elementName: 'Szyna',
      position: { x: 200, y: 100 },
      inService: true,
      width: 80,
      height: 40,
    };

    const load: LoadSymbol = {
      id: 'load-symbol',
      elementId: 'load1',
      elementType: 'Load',
      elementName: 'Obciazenie',
      position: { x: 200, y: 200 },
      inService: true,
      connectedToNodeId: 'bus1',
    };

    const symbols: AnySldSymbol[] = [bus, load];
    const connections = generateConnections(symbols);

    expect(connections.length).toBe(1);
    expect(connections[0].connectionType).toBe('load');
  });
});
