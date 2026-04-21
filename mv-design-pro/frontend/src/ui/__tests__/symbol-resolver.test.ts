/**
 * SymbolResolver Tests
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § A.2: Symbol types mapping
 * - canonical_symbols/ports.json: Port definitions
 *
 * Tests:
 * - Element type to CANONICAL symbol mapping
 * - Fallback for unknown types
 * - Port definitions and transformations
 * - Branch type (LINE vs CABLE) distinction
 * - Switch type (BREAKER vs DISCONNECTOR) distinction
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveSymbol,
  getSymbolDefinition,
  hasCanonicalSymbol,
  getAllSymbolIds,
  transformPort,
  getTransformedPorts,
  type CanonicalSymbolId,
} from '../sld/SymbolResolver';
import type {
  NodeSymbol,
  BranchSymbol,
  SwitchSymbol,
  SourceSymbol,
  LoadSymbol,
} from '../sld-editor/types';

// Mock console.warn to test warnings
const originalWarn = console.warn;
let warnMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  warnMock = vi.fn();
  console.warn = warnMock;
});

afterEach(() => {
  console.warn = originalWarn;
});

describe('SymbolResolver', () => {
  describe('resolveSymbol', () => {
    it('should resolve Bus to busbar symbol', () => {
      const busSymbol: NodeSymbol = {
        id: 'bus-1',
        elementId: 'elem-bus-1',
        elementType: 'Bus',
        elementName: 'Szyna zbiorcza 1',
        position: { x: 100, y: 100 },
        inService: true,
        width: 80,
        height: 10,
      };

      const resolved = resolveSymbol(busSymbol);

      expect(resolved).not.toBeNull();
      expect(resolved?.symbolId).toBe('busbar');
      expect(resolved?.ports.left).toEqual({ x: 0, y: 50 });
      expect(resolved?.ports.right).toEqual({ x: 100, y: 50 });
    });

    it('should resolve LineBranch with branchType=LINE to line_overhead (solid)', () => {
      const lineSymbol: BranchSymbol = {
        id: 'line-1',
        elementId: 'elem-line-1',
        elementType: 'LineBranch',
        elementName: 'Linia napowietrzna 1',
        position: { x: 200, y: 100 },
        inService: true,
        fromNodeId: 'bus-1',
        toNodeId: 'bus-2',
        points: [],
        branchType: 'LINE',
      };

      const resolved = resolveSymbol(lineSymbol);

      expect(resolved).not.toBeNull();
      expect(resolved?.symbolId).toBe('line_overhead');
      expect(resolved?.style?.lineType).toBe('solid');
      expect(resolved?.style?.strokeDasharray).toBe('none');
    });

    it('should resolve LineBranch with branchType=CABLE to line_cable (dashed)', () => {
      const cableSymbol: BranchSymbol = {
        id: 'cable-1',
        elementId: 'elem-cable-1',
        elementType: 'LineBranch',
        elementName: 'Linia kablowa 1',
        position: { x: 200, y: 100 },
        inService: true,
        fromNodeId: 'bus-1',
        toNodeId: 'bus-2',
        points: [],
        branchType: 'CABLE',
      };

      const resolved = resolveSymbol(cableSymbol);

      expect(resolved).not.toBeNull();
      expect(resolved?.symbolId).toBe('line_cable');
      expect(resolved?.style?.lineType).toBe('dashed');
      expect(resolved?.style?.strokeDasharray).toBe('8,4');
    });

    it('should default LineBranch without branchType to line_cable', () => {
      const lineSymbol: BranchSymbol = {
        id: 'line-2',
        elementId: 'elem-line-2',
        elementType: 'LineBranch',
        elementName: 'Linia 2',
        position: { x: 200, y: 100 },
        inService: true,
        fromNodeId: 'bus-1',
        toNodeId: 'bus-2',
        points: [],
        // branchType not specified
      };

      const resolved = resolveSymbol(lineSymbol);

      expect(resolved).not.toBeNull();
      expect(resolved?.symbolId).toBe('line_cable');
    });

    it('should resolve TransformerBranch to transformer_2w', () => {
      const trafoSymbol: BranchSymbol = {
        id: 'trafo-1',
        elementId: 'elem-trafo-1',
        elementType: 'TransformerBranch',
        elementName: 'Transformator 1',
        position: { x: 300, y: 100 },
        inService: true,
        fromNodeId: 'bus-1',
        toNodeId: 'bus-2',
        points: [],
      };

      const resolved = resolveSymbol(trafoSymbol);

      expect(resolved).not.toBeNull();
      expect(resolved?.symbolId).toBe('transformer_2w');
      expect(resolved?.ports.top).toEqual({ x: 50, y: 0 });
      expect(resolved?.ports.bottom).toEqual({ x: 50, y: 100 });
    });

    it('should resolve Switch with switchType=BREAKER to circuit_breaker', () => {
      const breakerSymbol: SwitchSymbol = {
        id: 'sw-1',
        elementId: 'elem-sw-1',
        elementType: 'Switch',
        elementName: 'Wylacznik 1',
        position: { x: 150, y: 100 },
        inService: true,
        fromNodeId: 'bus-1',
        toNodeId: 'bus-2',
        switchState: 'CLOSED',
        switchType: 'BREAKER',
      };

      const resolved = resolveSymbol(breakerSymbol);

      expect(resolved).not.toBeNull();
      expect(resolved?.symbolId).toBe('circuit_breaker');
    });

    it('should resolve Switch with switchType=DISCONNECTOR to disconnector', () => {
      const disconnectorSymbol: SwitchSymbol = {
        id: 'sw-2',
        elementId: 'elem-sw-2',
        elementType: 'Switch',
        elementName: 'Rozlacznik 1',
        position: { x: 150, y: 100 },
        inService: true,
        fromNodeId: 'bus-1',
        toNodeId: 'bus-2',
        switchState: 'OPEN',
        switchType: 'DISCONNECTOR',
      };

      const resolved = resolveSymbol(disconnectorSymbol);

      expect(resolved).not.toBeNull();
      expect(resolved?.symbolId).toBe('disconnector');
    });

    it('should resolve Switch with switchType=LOAD_SWITCH to circuit_breaker', () => {
      const loadSwitchSymbol: SwitchSymbol = {
        id: 'sw-3',
        elementId: 'elem-sw-3',
        elementType: 'Switch',
        elementName: 'Lacznik 1',
        position: { x: 150, y: 100 },
        inService: true,
        fromNodeId: 'bus-1',
        toNodeId: 'bus-2',
        switchState: 'CLOSED',
        switchType: 'LOAD_SWITCH',
      };

      const resolved = resolveSymbol(loadSwitchSymbol);

      expect(resolved).not.toBeNull();
      expect(resolved?.symbolId).toBe('circuit_breaker');
    });

    it('should resolve Switch with switchType=FUSE to fuse', () => {
      const fuseSymbol: SwitchSymbol = {
        id: 'sw-4',
        elementId: 'elem-sw-4',
        elementType: 'Switch',
        elementName: 'Bezpiecznik 1',
        position: { x: 150, y: 100 },
        inService: true,
        fromNodeId: 'bus-1',
        toNodeId: 'bus-2',
        switchState: 'CLOSED',
        switchType: 'FUSE',
      };

      const resolved = resolveSymbol(fuseSymbol);

      expect(resolved).not.toBeNull();
      expect(resolved?.symbolId).toBe('fuse');
    });

    it('should resolve Source to utility_feeder', () => {
      const sourceSymbol: SourceSymbol = {
        id: 'src-1',
        elementId: 'elem-src-1',
        elementType: 'Source',
        elementName: 'Zasilanie sieci',
        position: { x: 50, y: 50 },
        inService: true,
        connectedToNodeId: 'bus-1',
      };

      const resolved = resolveSymbol(sourceSymbol);

      expect(resolved).not.toBeNull();
      expect(resolved?.symbolId).toBe('utility_feeder');
      expect(resolved?.ports.bottom).toEqual({ x: 50, y: 100 });
    });

    it('should resolve Load to load symbol', () => {
      const loadSymbol: LoadSymbol = {
        id: 'load-1',
        elementId: 'elem-load-1',
        elementType: 'Load',
        elementName: 'Odbiornik 1',
        position: { x: 400, y: 100 },
        inService: true,
        connectedToNodeId: 'bus-1',
      };

      const resolved = resolveSymbol(loadSymbol);

      expect(resolved).not.toBeNull();
      expect(resolved!.symbolId).toBe('load');
    });
  });

  describe('hasCanonicalSymbol', () => {
    it('should return true for Bus', () => {
      const busSymbol: NodeSymbol = {
        id: 'bus-1',
        elementId: 'elem-bus-1',
        elementType: 'Bus',
        elementName: 'Szyna 1',
        position: { x: 100, y: 100 },
        inService: true,
        width: 80,
        height: 10,
      };

      expect(hasCanonicalSymbol(busSymbol)).toBe(true);
    });

    it('should return true for Load', () => {
      const loadSymbol: LoadSymbol = {
        id: 'load-1',
        elementId: 'elem-load-1',
        elementType: 'Load',
        elementName: 'Odbiornik 1',
        position: { x: 400, y: 100 },
        inService: true,
        connectedToNodeId: 'bus-1',
      };

      expect(hasCanonicalSymbol(loadSymbol)).toBe(true);
    });
  });

  describe('getSymbolDefinition', () => {
    it('should return correct definition for each symbol ID', () => {
      const symbolIds: CanonicalSymbolId[] = [
        'busbar',
        'circuit_breaker',
        'disconnector',
        'line_overhead',
        'line_cable',
        'transformer_2w',
        'transformer_3w',
        'generator',
        'pv',
        'fw',
        'bess',
        'utility_feeder',
        'ground',
        'ct',
        'vt',
      ];

      for (const symbolId of symbolIds) {
        const def = getSymbolDefinition(symbolId);

        expect(def.symbolId).toBe(symbolId);
        expect(def.viewBox).toBe('0 0 100 100');
        expect(def.ports).toBeDefined();
        expect(def.allowedRotations).toBeDefined();
        expect(def.description).toBeDefined();
      }
    });
  });

  describe('getAllSymbolIds', () => {
    it('should return all published CANONICAL symbol IDs', () => {
      const ids = getAllSymbolIds();

      expect(ids).toHaveLength(37);
      // Core SLD symbols
      expect(ids).toContain('busbar');
      expect(ids).toContain('circuit_breaker');
      expect(ids).toContain('disconnector');
      expect(ids).toContain('line_overhead');
      expect(ids).toContain('line_cable');
      expect(ids).toContain('transformer_2w');
      expect(ids).toContain('transformer_3w');
      expect(ids).toContain('generator');
      expect(ids).toContain('pv');
      expect(ids).toContain('fw');
      expect(ids).toContain('bess');
      expect(ids).toContain('system_source');
      expect(ids).toContain('utility_feeder');
      expect(ids).toContain('branch_pole');
      expect(ids).toContain('zksn');
      expect(ids).toContain('cable_head');
      expect(ids).toContain('ground');
      expect(ids).toContain('ct');
      expect(ids).toContain('vt');
      // Canonical SLD symbols
      expect(ids).toContain('overcurrent_relay');
      expect(ids).toContain('directional_relay');
      expect(ids).toContain('earthing_switch');
      expect(ids).toContain('load_arrow');
      // Industrial canonical SLD symbols
      expect(ids).toContain('fuse');
      expect(ids).toContain('surge_arrester');
      expect(ids).toContain('capacitor');
      expect(ids).toContain('reactor');
      expect(ids).toContain('inverter');
      expect(ids).toContain('metering_cubicle');
      expect(ids).toContain('motor');
      // Tree-specific symbols
      expect(ids).toContain('load');
      expect(ids).toContain('project');
      expect(ids).toContain('catalog');
      expect(ids).toContain('study_case');
      expect(ids).toContain('results');
      expect(ids).toContain('folder');
    });
  });

  describe('transformPort', () => {
    it('should not transform port at 0 degrees', () => {
      const port = { x: 50, y: 0 };
      const transformed = transformPort(port, 0);

      expect(transformed).toEqual({ x: 50, y: 0 });
    });

    it('should transform port at 90 degrees', () => {
      // Formula: new_x = 100 - y, new_y = x
      const port = { x: 50, y: 0 };
      const transformed = transformPort(port, 90);

      expect(transformed).toEqual({ x: 100, y: 50 });
    });

    it('should transform port at 180 degrees', () => {
      // Formula: new_x = 100 - x, new_y = 100 - y
      const port = { x: 50, y: 0 };
      const transformed = transformPort(port, 180);

      expect(transformed).toEqual({ x: 50, y: 100 });
    });

    it('should transform port at 270 degrees', () => {
      // Formula: new_x = y, new_y = 100 - x
      const port = { x: 50, y: 0 };
      const transformed = transformPort(port, 270);

      expect(transformed).toEqual({ x: 0, y: 50 });
    });
  });

  describe('getTransformedPorts', () => {
    it('should transform all ports of circuit_breaker at 90 degrees', () => {
      const ports = getTransformedPorts('circuit_breaker', 90);

      // Original: top(50,0), bottom(50,100)
      // At 90°: top becomes (100, 50), bottom becomes (0, 50)
      expect(ports.top).toEqual({ x: 100, y: 50 });
      expect(ports.bottom).toEqual({ x: 0, y: 50 });
    });

    it('should not change ports at 0 degrees', () => {
      const ports = getTransformedPorts('busbar', 0);

      // Original: left(0,50), right(100,50)
      expect(ports.left).toEqual({ x: 0, y: 50 });
      expect(ports.right).toEqual({ x: 100, y: 50 });
    });
  });
});

describe('CANONICAL Symbol Library Verification', () => {
  it('should have distinct symbols for line_overhead and line_cable', () => {
    const overhead = getSymbolDefinition('line_overhead');
    const cable = getSymbolDefinition('line_cable');

    expect(overhead.symbolId).not.toBe(cable.symbolId);
    expect(overhead.style?.lineType).toBe('solid');
    expect(cable.style?.lineType).toBe('dashed');
  });

  it('should have distinct symbols for PV, FW, BESS', () => {
    const pv = getSymbolDefinition('pv');
    const fw = getSymbolDefinition('fw');
    const bess = getSymbolDefinition('bess');

    expect(pv.symbolId).toBe('pv');
    expect(fw.symbolId).toBe('fw');
    expect(bess.symbolId).toBe('bess');

    // All have bottom port for connection
    expect(pv.ports.bottom).toEqual({ x: 50, y: 100 });
    expect(fw.ports.bottom).toEqual({ x: 50, y: 100 });
    expect(bess.ports.bottom).toEqual({ x: 50, y: 100 });
  });

  it('should have circuit_breaker with 4-way rotation', () => {
    const breaker = getSymbolDefinition('circuit_breaker');

    expect(breaker.allowedRotations).toEqual([0, 90, 180, 270]);
  });

  it('should have PV with only 0 degree rotation (sun orientation)', () => {
    const pv = getSymbolDefinition('pv');

    expect(pv.allowedRotations).toEqual([0]);
  });
});
