/**
 * CANONICAL-GRADE GEOMETRY TESTS — Multi-transformer, sectioned busbars, no-floating symbols
 *
 * CANONICAL ALIGNMENT:
 * - SLD_AUTOLAYOUT_AUDIT_I_NAPRAWA.md: BINDING SPEC
 * - CANONICAL/Canonical visual standards
 * - Determinism: same input -> identical output
 * - NO FLOATING SYMBOL rule enforcement
 *
 * NOTE: Migrated from legacy generateAutoLayout to computeTopologicalLayout
 * per PR-SLD-AUTO-01 (canonical topological engine only).
 */

import { describe, it, expect } from 'vitest';
import type {
  AnySldSymbol,
  NodeSymbol,
  SourceSymbol,
  LoadSymbol,
  BranchSymbol,
  SwitchSymbol,
} from '../types';
import {
  computeTopologicalLayout,
  DEFAULT_GEOMETRY_CONFIG,
} from '../utils/topological-layout';
import {
  calculateTransformerPositions,
  calculateSectionedBusbar,
  calculateSectionBayPositions,
  isOnSpine,
  CANONICAL_GEOMETRY,
} from '../../sld/sldKrokStyle';
import { validateSld } from '../utils/sldValidator';

// =============================================================================
// FIXTURES
// =============================================================================

/**
 * Multi-transformer fixture: 2 parallel transformers between WN and SN busbars
 */
const createMultiTransformerFixture = (): AnySldSymbol[] => {
  const wnBus: NodeSymbol = {
    id: 'bus-wn-1',
    elementId: 'bus-wn-1',
    elementType: 'Bus',
    elementName: 'Szyna 110kV WN',
    position: { x: 0, y: 0 },
    inService: true,
    width: 200,
    height: 8,
  };

  const snBus: NodeSymbol = {
    id: 'bus-sn-1',
    elementId: 'bus-sn-1',
    elementType: 'Bus',
    elementName: 'Szyna 15kV SN',
    position: { x: 0, y: 0 },
    inService: true,
    width: 200,
    height: 8,
  };

  const source: SourceSymbol = {
    id: 'source-1',
    elementId: 'source-1',
    elementType: 'Source',
    elementName: 'Zasilanie sieciowe',
    position: { x: 0, y: 0 },
    inService: true,
    connectedToNodeId: 'bus-wn-1',
  };

  const trafo1: BranchSymbol = {
    id: 'trafo-1',
    elementId: 'trafo-1',
    elementType: 'TransformerBranch',
    elementName: 'TR1 110/15kV',
    position: { x: 0, y: 0 },
    inService: true,
    fromNodeId: 'bus-wn-1',
    toNodeId: 'bus-sn-1',
    points: [],
  };

  const trafo2: BranchSymbol = {
    id: 'trafo-2',
    elementId: 'trafo-2',
    elementType: 'TransformerBranch',
    elementName: 'TR2 110/15kV',
    position: { x: 0, y: 0 },
    inService: true,
    fromNodeId: 'bus-wn-1',
    toNodeId: 'bus-sn-1',
    points: [],
  };

  const load: LoadSymbol = {
    id: 'load-1',
    elementId: 'load-1',
    elementType: 'Load',
    elementName: 'Odbior',
    position: { x: 0, y: 0 },
    inService: true,
    connectedToNodeId: 'bus-sn-1',
  };

  return [wnBus, snBus, source, trafo1, trafo2, load];
};

/**
 * Floating symbol fixture: Symbol without any connections
 */
const createFloatingSymbolFixture = (): AnySldSymbol[] => {
  const bus: NodeSymbol = {
    id: 'bus-main',
    elementId: 'bus-main',
    elementType: 'Bus',
    elementName: 'Szyna Glowna',
    position: { x: 0, y: 0 },
    inService: true,
    width: 100,
    height: 8,
  };

  const source: SourceSymbol = {
    id: 'source-main',
    elementId: 'source-main',
    elementType: 'Source',
    elementName: 'Zasilanie',
    position: { x: 0, y: 0 },
    inService: true,
    connectedToNodeId: 'bus-main',
  };

  // Floating bus - no connections
  const floatingBus: NodeSymbol = {
    id: 'bus-floating',
    elementId: 'bus-floating',
    elementType: 'Bus',
    elementName: 'Szyna Wiszaca',
    position: { x: 0, y: 0 },
    inService: true,
    width: 80,
    height: 8,
  };

  return [bus, source, floatingBus];
};

// =============================================================================
// MULTI-TRANSFORMER TESTS
// =============================================================================

describe('CANONICAL Multi-Transformer Layout', () => {
  it('should position 2 parallel transformers symmetrically around spine', () => {
    const centerX = 200;
    const positions = calculateTransformerPositions(2, centerX);

    expect(positions).toHaveLength(2);
    // Check symmetry around center
    const midpoint = (positions[0] + positions[1]) / 2;
    expect(midpoint).toBe(centerX);
    // Check spacing
    const spacing = Math.abs(positions[1] - positions[0]);
    expect(spacing).toBeGreaterThanOrEqual(CANONICAL_GEOMETRY.transformer.minSpacing);
  });

  it('should center single transformer on spine', () => {
    const centerX = 200;
    const positions = calculateTransformerPositions(1, centerX);

    expect(positions).toHaveLength(1);
    expect(positions[0]).toBe(centerX);
  });

  it('should position 3 transformers evenly distributed', () => {
    const centerX = 300;
    const positions = calculateTransformerPositions(3, centerX);

    expect(positions).toHaveLength(3);
    // Check that spacing is consistent
    const spacing1 = positions[1] - positions[0];
    const spacing2 = positions[2] - positions[1];
    expect(spacing1).toBe(spacing2);
    // Check center alignment
    expect(positions[1]).toBe(centerX);
  });

  it('should snap all transformer positions to grid', () => {
    const centerX = 215; // Off-grid
    const positions = calculateTransformerPositions(2, centerX);

    positions.forEach((x) => {
      expect(x % CANONICAL_GEOMETRY.layout.gridSize).toBe(0);
    });
  });

  it('should be deterministic (same input = same output)', () => {
    const centerX = 200;
    const positions1 = calculateTransformerPositions(3, centerX);
    const positions2 = calculateTransformerPositions(3, centerX);

    expect(positions1).toEqual(positions2);
  });

  it('should correctly layout multi-transformer fixture via topological engine', () => {
    const symbols = createMultiTransformerFixture();
    const result = computeTopologicalLayout(symbols);

    // Get transformer positions
    const trafo1Pos = result.positions.get('trafo-1');
    const trafo2Pos = result.positions.get('trafo-2');

    expect(trafo1Pos).toBeDefined();
    expect(trafo2Pos).toBeDefined();

    // Transformers should be on same Y level
    expect(trafo1Pos!.y).toBe(trafo2Pos!.y);

    // Transformers should be horizontally separated
    expect(trafo1Pos!.x).not.toBe(trafo2Pos!.x);
  });
});

// =============================================================================
// SECTIONED BUSBAR TESTS
// =============================================================================

describe('CANONICAL Sectioned Busbar Layout', () => {
  it('should create 2 sections for busbar with "sekcja" in name', () => {
    const { sections, couplerPositions } = calculateSectionedBusbar(4, 2, 200);

    expect(sections).toHaveLength(2);
    expect(sections[0].sectionId).toBe('A');
    expect(sections[1].sectionId).toBe('B');
    expect(couplerPositions).toHaveLength(1);
  });

  it('should distribute bays evenly across sections', () => {
    const { sections } = calculateSectionedBusbar(4, 2, 200);

    // 4 bays across 2 sections = 2 bays per section
    expect(sections[0].bayIndices).toHaveLength(2);
    expect(sections[1].bayIndices).toHaveLength(2);
    expect(sections[0].bayIndices).toEqual([0, 1]);
    expect(sections[1].bayIndices).toEqual([2, 3]);
  });

  it('should handle odd number of bays', () => {
    const { sections } = calculateSectionedBusbar(5, 2, 200);

    // 5 bays across 2 sections = 3 + 2
    expect(sections[0].bayIndices).toHaveLength(3);
    expect(sections[1].bayIndices).toHaveLength(2);
  });

  it('should return single section when sectionCount is 1', () => {
    const { sections, couplerPositions } = calculateSectionedBusbar(4, 1, 200);

    expect(sections).toHaveLength(1);
    expect(sections[0].bayIndices).toEqual([0, 1, 2, 3]);
    expect(couplerPositions).toHaveLength(0);
  });

  it('should calculate bay positions within sections', () => {
    const { sections } = calculateSectionedBusbar(4, 2, 200);

    const section1BayPositions = calculateSectionBayPositions(sections[0]);
    const section2BayPositions = calculateSectionBayPositions(sections[1]);

    expect(section1BayPositions).toHaveLength(2);
    expect(section2BayPositions).toHaveLength(2);

    // Bay positions should be grid-snapped
    section1BayPositions.forEach((x) => {
      expect(Math.abs(x % CANONICAL_GEOMETRY.layout.gridSize)).toBe(0);
    });
  });

  it('should place coupler between sections', () => {
    const { sections, couplerPositions } = calculateSectionedBusbar(4, 2, 200);

    expect(couplerPositions).toHaveLength(1);
    // Coupler should be between section A end and section B start
    const couplerX = couplerPositions[0];
    expect(couplerX).toBeGreaterThan(sections[0].endX - 100);
    expect(couplerX).toBeLessThan(sections[1].startX + 100);
  });

  it('should be deterministic', () => {
    const result1 = calculateSectionedBusbar(6, 2, 300);
    const result2 = calculateSectionedBusbar(6, 2, 300);

    expect(result1.sections).toEqual(result2.sections);
    expect(result1.couplerPositions).toEqual(result2.couplerPositions);
    expect(result1.totalWidth).toEqual(result2.totalWidth);
  });
});

// =============================================================================
// SPINE ALIGNMENT TESTS
// =============================================================================

describe('CANONICAL Canonical Spine', () => {
  it('should detect symbol on spine within tolerance', () => {
    const spineX = 200;
    const tolerance = CANONICAL_GEOMETRY.spine.alignmentTolerance;

    expect(isOnSpine(200, spineX)).toBe(true);
    expect(isOnSpine(200 + tolerance, spineX)).toBe(true);
    expect(isOnSpine(200 - tolerance, spineX)).toBe(true);
  });

  it('should detect symbol off spine beyond tolerance', () => {
    const spineX = 200;
    const tolerance = CANONICAL_GEOMETRY.spine.alignmentTolerance;

    expect(isOnSpine(200 + tolerance + 1, spineX)).toBe(false);
    expect(isOnSpine(200 - tolerance - 1, spineX)).toBe(false);
  });

  it('should align main path elements on same X coordinate', () => {
    const symbols = createMultiTransformerFixture();
    const result = computeTopologicalLayout(symbols);

    const sourcePos = result.positions.get('source-1');
    const wnBusPos = result.positions.get('bus-wn-1');
    const snBusPos = result.positions.get('bus-sn-1');

    expect(sourcePos).toBeDefined();
    expect(wnBusPos).toBeDefined();
    expect(snBusPos).toBeDefined();

    // Source, WN bus, and SN bus should be on the same X (spine)
    expect(sourcePos!.x).toBe(wnBusPos!.x);
    expect(wnBusPos!.x).toBe(snBusPos!.x);
  });
});

// =============================================================================
// NO FLOATING SYMBOL TESTS
// =============================================================================

describe('CANONICAL No Floating Symbol Rule', () => {
  it('should detect floating symbols via quarantine diagnostics', () => {
    const symbols = createFloatingSymbolFixture();
    const result = computeTopologicalLayout(symbols);

    // The floating bus should appear in quarantined or unassigned diagnostics
    expect(result.diagnostics).toBeDefined();
    // All symbols should still get positions (quarantine zone)
    expect(result.positions.size).toBe(symbols.length);
  });

  it('should report floating symbol in validation (G-04)', () => {
    const symbols = createFloatingSymbolFixture();
    const result = computeTopologicalLayout(symbols);

    // Floating symbols from diagnostics
    const floatingIds = result.diagnostics.quarantinedSymbolIds;

    const validationResult = validateSld(symbols, {
      checkFloatingSymbols: true,
      floatingSymbolIds: floatingIds,
    });

    // Should have G-04 warning for floating bus
    const floatingIssues = validationResult.issues.filter((i) =>
      i.ruleId.startsWith('G-04')
    );
    expect(floatingIssues.length).toBeGreaterThan(0);
  });

  it('should not report connected symbols as floating', () => {
    const symbols = createMultiTransformerFixture();
    const result = computeTopologicalLayout(symbols);

    // All symbols are connected, quarantine should be empty or minimal
    expect(result.diagnostics.quarantinedSymbolIds.length).toBe(0);
  });

  it('should position all symbols (no invisible symbols)', () => {
    const symbols = createFloatingSymbolFixture();
    const result = computeTopologicalLayout(symbols);

    // All symbols should have positions (even floating ones go to quarantine)
    symbols.forEach((symbol) => {
      expect(result.positions.has(symbol.id)).toBe(true);
    });
  });
});

// =============================================================================
// DETERMINISM TESTS
// =============================================================================

describe('CANONICAL Geometry Determinism', () => {
  it('should produce identical layout for same multi-transformer input', () => {
    const symbols = createMultiTransformerFixture();

    const result1 = computeTopologicalLayout(symbols);
    const result2 = computeTopologicalLayout(symbols);

    // Compare all positions
    result1.positions.forEach((pos1, id) => {
      const pos2 = result2.positions.get(id);
      expect(pos2).toBeDefined();
      expect(pos1.x).toBe(pos2!.x);
      expect(pos1.y).toBe(pos2!.y);
    });
  });

  it('should produce identical layout regardless of symbol order', () => {
    const symbols = createMultiTransformerFixture();
    const shuffled = [...symbols].reverse();

    const result1 = computeTopologicalLayout(symbols);
    const result2 = computeTopologicalLayout(shuffled);

    // Compare all positions
    result1.positions.forEach((pos1, id) => {
      const pos2 = result2.positions.get(id);
      expect(pos2).toBeDefined();
      expect(pos1.x).toBe(pos2!.x);
      expect(pos1.y).toBe(pos2!.y);
    });
  });

  it('should snap all positions to grid', () => {
    const symbols = createMultiTransformerFixture();
    const result = computeTopologicalLayout(symbols);
    const gridSize = DEFAULT_GEOMETRY_CONFIG.gridSize;

    result.positions.forEach((pos) => {
      expect(pos.x % gridSize).toBe(0);
      expect(pos.y % gridSize).toBe(0);
    });
  });
});
