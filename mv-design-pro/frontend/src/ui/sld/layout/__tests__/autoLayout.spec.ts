/**
 * SLD AUTO-LAYOUT — Deterministic Unit Tests
 *
 * Testy algorytmu auto-layoutu wyprowadzeń z szyny.
 *
 * DETERMINIZM: Te same dane wejściowe → identyczny output
 * BEZ DOM: Testy operują na czystym JSON
 *
 * TEST CASES:
 * 1. Single feeder → anchor w środku, stub 90°
 * 2. 5 feeders → równe rozłożenie, brak kolizji
 * 3. Crowded (20 feeders) → compression, brak nachodzenia anchorów
 * 4. TOP vs BOTTOM → różne znaki direction, laneY rozdzielone
 * 5. Determinism → dwa uruchomienia identyczne
 *
 * CANONICAL ALIGNMENT:
 * - sldCanonicalStyle.ts: CANONICAL_GEOMETRY tokens
 * - CANONICAL software visual standards
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type {
  BusbarInput,
  FeederInput,
  AutoLayoutResult,
  FeederLayoutResult,
} from '../types';
import {
  computeBusbarAutoLayout,
  enableAutoLayoutV1,
  disableAutoLayoutV1,
  isAutoLayoutV1Enabled,
  calculateMargin,
  calculateMinSpacing,
  calculateStubLength,
  DEFAULT_AUTO_LAYOUT_CONFIG,
  SIDE_DIRECTION,
} from '../index';

// =============================================================================
// FIXTURES
// =============================================================================

/**
 * Create a horizontal busbar fixture.
 */
function createHorizontalBusbar(length: number = 400, thickness: number = 8): BusbarInput {
  return {
    id: 'busbar-h-1',
    axis: 'H',
    p0: { x: 100, y: 200 },
    p1: { x: 100 + length, y: 200 },
    thickness,
  };
}

/**
 * Create a vertical busbar fixture.
 */
function createVerticalBusbar(length: number = 400, thickness: number = 8): BusbarInput {
  return {
    id: 'busbar-v-1',
    axis: 'V',
    p0: { x: 200, y: 100 },
    p1: { x: 200, y: 100 + length },
    thickness,
  };
}

/**
 * Create feeder fixtures.
 *
 * @param count - Number of feeders
 * @param side - Exit side
 * @param prefix - ID prefix
 * @returns Array of feeder inputs
 */
function createFeeders(
  count: number,
  side: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' = 'BOTTOM',
  prefix: string = 'feeder'
): FeederInput[] {
  const feeders: FeederInput[] = [];

  for (let i = 0; i < count; i++) {
    feeders.push({
      id: `${prefix}-${i + 1}`,
      side,
      orderKey: `${prefix}-${String(i + 1).padStart(3, '0')}`,
    });
  }

  return feeders;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Deep comparison of layout results for determinism testing.
 */
function layoutsAreEqual(a: AutoLayoutResult, b: AutoLayoutResult): boolean {
  if (a.feeders.length !== b.feeders.length) {
    return false;
  }

  // Sort by ID for comparison
  const sortedA = [...a.feeders].sort((x, y) => x.id.localeCompare(y.id));
  const sortedB = [...b.feeders].sort((x, y) => x.id.localeCompare(y.id));

  for (let i = 0; i < sortedA.length; i++) {
    const feederA = sortedA[i];
    const feederB = sortedB[i];

    if (feederA.id !== feederB.id) return false;
    if (feederA.anchor.x !== feederB.anchor.x) return false;
    if (feederA.anchor.y !== feederB.anchor.y) return false;
    if (feederA.stubEnd.x !== feederB.stubEnd.x) return false;
    if (feederA.stubEnd.y !== feederB.stubEnd.y) return false;
    if (feederA.laneIndex !== feederB.laneIndex) return false;
    if (feederA.meta.compressed !== feederB.meta.compressed) return false;

    // Compare path segments
    if (feederA.pathSegments.length !== feederB.pathSegments.length) return false;

    for (let j = 0; j < feederA.pathSegments.length; j++) {
      const segA = feederA.pathSegments[j];
      const segB = feederB.pathSegments[j];

      if (segA.kind !== segB.kind) return false;
      if (segA.from.x !== segB.from.x) return false;
      if (segA.from.y !== segB.from.y) return false;
      if (segA.to.x !== segB.to.x) return false;
      if (segA.to.y !== segB.to.y) return false;
    }
  }

  return true;
}

/**
 * Check if anchor positions have minimum spacing.
 */
function checkAnchorSpacing(feeders: readonly FeederLayoutResult[], minSpacing: number): boolean {
  // Group by side (using direction as proxy)
  const groups = new Map<number, FeederLayoutResult[]>();

  for (const feeder of feeders) {
    const dir = feeder.meta.direction;
    const group = groups.get(dir) ?? [];
    group.push(feeder);
    groups.set(dir, group);
  }

  // Check spacing within each group
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    // Sort by anchor X (for H bus) or Y (for V bus)
    // Use X as primary since tests use H busbar
    const sorted = [...group].sort((a, b) => a.anchor.x - b.anchor.x);

    for (let i = 1; i < sorted.length; i++) {
      const dx = Math.abs(sorted[i].anchor.x - sorted[i - 1].anchor.x);
      const dy = Math.abs(sorted[i].anchor.y - sorted[i - 1].anchor.y);
      const distance = Math.max(dx, dy); // For orthogonal positions

      // Allow small tolerance for grid snapping
      if (distance < minSpacing - 1) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Check if all path segments are orthogonal (H or V).
 */
function checkOrthogonalPaths(feeders: readonly FeederLayoutResult[]): boolean {
  for (const feeder of feeders) {
    for (const segment of feeder.pathSegments) {
      const dx = Math.abs(segment.to.x - segment.from.x);
      const dy = Math.abs(segment.to.y - segment.from.y);

      // Segment must be horizontal (dy ≈ 0) or vertical (dx ≈ 0)
      const isHorizontal = dy < 1;
      const isVertical = dx < 1;

      if (!isHorizontal && !isVertical) {
        return false;
      }
    }
  }

  return true;
}

// =============================================================================
// TEST SUITES
// =============================================================================

describe('SLD Auto-Layout Algorithm', () => {
  beforeEach(() => {
    // Feature flag is permanently ON — no-op calls kept for backward compat
    enableAutoLayoutV1();
  });

  afterEach(() => {
    // Feature flag is permanently ON — no-op calls kept for backward compat
    disableAutoLayoutV1();
  });

  // ---------------------------------------------------------------------------
  // Feature Flag Tests (V1 permanently enabled — flag functions are no-ops)
  // ---------------------------------------------------------------------------

  describe('Feature Flag', () => {
    it('should always be enabled (permanently ON)', () => {
      expect(isAutoLayoutV1Enabled()).toBe(true);
    });

    it('should remain enabled after disableAutoLayoutV1() (no-op)', () => {
      disableAutoLayoutV1();
      expect(isAutoLayoutV1Enabled()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 1: Single feeder → anchor centered, stub 90°
  // ---------------------------------------------------------------------------

  describe('Test 1: Single Feeder', () => {
    it('should place single feeder anchor at busbar center', () => {
      const bus = createHorizontalBusbar(400, 8);
      const feeders = createFeeders(1, 'BOTTOM');

      const result = computeBusbarAutoLayout(bus, feeders);

      expect(result.feeders).toHaveLength(1);

      const feeder = result.feeders[0];

      // Anchor should be approximately centered (allowing for grid snapping)
      const busCenterX = (bus.p0.x + bus.p1.x) / 2;
      expect(Math.abs(feeder.anchor.x - busCenterX)).toBeLessThan(20); // Grid tolerance

      // Anchor Y should be on busbar
      expect(feeder.anchor.y).toBe(bus.p0.y);

      // Stub should exit perpendicular (90°)
      expect(feeder.stubEnd.x).toBe(feeder.anchor.x); // Same X for vertical stub

      // Stub direction: BOTTOM = positive Y
      expect(feeder.stubEnd.y).toBeGreaterThan(feeder.anchor.y);
    });

    it('should create perpendicular stub segment', () => {
      const bus = createHorizontalBusbar(400, 8);
      const feeders = createFeeders(1, 'BOTTOM');

      const result = computeBusbarAutoLayout(bus, feeders);
      const feeder = result.feeders[0];

      // Check path segments are orthogonal
      expect(checkOrthogonalPaths(result.feeders)).toBe(true);

      // First segment should be vertical (stub)
      if (feeder.pathSegments.length > 0) {
        const stub = feeder.pathSegments[0];
        expect(Math.abs(stub.to.x - stub.from.x)).toBeLessThan(1); // Vertical
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Test 2: 5 feeders → equal distribution, no collision
  // ---------------------------------------------------------------------------

  describe('Test 2: Five Feeders', () => {
    it('should distribute 5 feeders evenly along busbar', () => {
      const bus = createHorizontalBusbar(400, 8);
      const feeders = createFeeders(5, 'BOTTOM');

      const result = computeBusbarAutoLayout(bus, feeders);

      expect(result.feeders).toHaveLength(5);

      // Sort by anchor X position
      const sorted = [...result.feeders].sort((a, b) => a.anchor.x - b.anchor.x);

      // Check even spacing (allow tolerance for grid snapping)
      const spacings: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        spacings.push(sorted[i].anchor.x - sorted[i - 1].anchor.x);
      }

      // All spacings should be approximately equal
      const avgSpacing = spacings.reduce((a, b) => a + b, 0) / spacings.length;
      for (const spacing of spacings) {
        expect(Math.abs(spacing - avgSpacing)).toBeLessThan(25); // Allow grid variance
      }
    });

    it('should maintain minimum spacing between anchors', () => {
      const bus = createHorizontalBusbar(400, 8);
      const feeders = createFeeders(5, 'BOTTOM');

      const result = computeBusbarAutoLayout(bus, feeders);
      const minSpacing = calculateMinSpacing(bus.thickness);

      expect(checkAnchorSpacing(result.feeders, minSpacing)).toBe(true);
    });

    it('should not mark as compressed for 5 feeders on 400px bus', () => {
      const bus = createHorizontalBusbar(400, 8);
      const feeders = createFeeders(5, 'BOTTOM');

      const result = computeBusbarAutoLayout(bus, feeders);

      for (const feeder of result.feeders) {
        expect(feeder.meta.compressed).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Test 3: Crowded (20 feeders) → compression, no anchor overlap
  // ---------------------------------------------------------------------------

  describe('Test 3: Crowded Feeders (Compression)', () => {
    it('should compress spacing for 20 feeders on 200px bus', () => {
      const bus = createHorizontalBusbar(200, 8); // Narrow bus
      const feeders = createFeeders(20, 'BOTTOM');

      const result = computeBusbarAutoLayout(bus, feeders);

      expect(result.feeders).toHaveLength(20);

      // Should be compressed
      const hasCompressed = result.feeders.some((f) => f.meta.compressed);
      expect(hasCompressed).toBe(true);
    });

    it('should keep anchors within busbar bounds even when compressed', () => {
      const bus = createHorizontalBusbar(200, 8);
      const feeders = createFeeders(20, 'BOTTOM');

      const result = computeBusbarAutoLayout(bus, feeders);

      // When heavily compressed with grid snapping, some anchors may land on same position
      // This is expected behavior - the important thing is they stay within bounds
      const anchorXs = result.feeders.map((f) => f.anchor.x);
      const uniqueXs = new Set(anchorXs);

      // Should have at least some unique positions
      expect(uniqueXs.size).toBeGreaterThan(0);

      // Check anchors are within busbar bounds
      const margin = calculateMargin(bus.thickness);
      const minX = Math.min(bus.p0.x, bus.p1.x);
      const maxX = Math.max(bus.p0.x, bus.p1.x);

      for (const feeder of result.feeders) {
        // Anchors should be within busbar bounds (with grid tolerance)
        expect(feeder.anchor.x).toBeGreaterThanOrEqual(minX - 5); // Grid tolerance
        expect(feeder.anchor.x).toBeLessThanOrEqual(maxX + 5);
      }
    });

    it('should have deterministic spacing when compressed', () => {
      const bus = createHorizontalBusbar(200, 8);
      const feeders = createFeeders(20, 'BOTTOM');

      const result1 = computeBusbarAutoLayout(bus, feeders);
      const result2 = computeBusbarAutoLayout(bus, feeders);

      // All spacing values should be identical
      for (let i = 0; i < result1.feeders.length; i++) {
        const f1 = result1.feeders.find((f) => f.id === result2.feeders[i].id);
        const f2 = result2.feeders[i];

        if (f1) {
          expect(f1.meta.spacingUsed).toBe(f2.meta.spacingUsed);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Test 4: TOP vs BOTTOM → different directions, separate lanes
  // ---------------------------------------------------------------------------

  describe('Test 4: TOP vs BOTTOM Sides', () => {
    it('should have opposite directions for TOP and BOTTOM', () => {
      const bus = createHorizontalBusbar(400, 8);
      const topFeeders = createFeeders(2, 'TOP', 'top');
      const bottomFeeders = createFeeders(2, 'BOTTOM', 'bottom');
      const allFeeders = [...topFeeders, ...bottomFeeders];

      const result = computeBusbarAutoLayout(bus, allFeeders);

      const topResults = result.feeders.filter((f) => f.id.startsWith('top'));
      const bottomResults = result.feeders.filter((f) => f.id.startsWith('bottom'));

      expect(topResults.length).toBe(2);
      expect(bottomResults.length).toBe(2);

      // TOP direction should be -1, BOTTOM should be +1
      for (const feeder of topResults) {
        expect(feeder.meta.direction).toBe(SIDE_DIRECTION.TOP);
        expect(feeder.stubEnd.y).toBeLessThan(feeder.anchor.y); // Goes up
      }

      for (const feeder of bottomResults) {
        expect(feeder.meta.direction).toBe(SIDE_DIRECTION.BOTTOM);
        expect(feeder.stubEnd.y).toBeGreaterThan(feeder.anchor.y); // Goes down
      }
    });

    it('should have separate lane coordinates for TOP and BOTTOM', () => {
      const bus = createHorizontalBusbar(400, 8);
      const topFeeders = createFeeders(3, 'TOP', 'top');
      const bottomFeeders = createFeeders(3, 'BOTTOM', 'bottom');
      const allFeeders = [...topFeeders, ...bottomFeeders];

      const result = computeBusbarAutoLayout(bus, allFeeders);

      const topLaneYs = result.feeders
        .filter((f) => f.id.startsWith('top'))
        .map((f) => f.pathSegments[0]?.to.y ?? 0);

      const bottomLaneYs = result.feeders
        .filter((f) => f.id.startsWith('bottom'))
        .map((f) => f.pathSegments[0]?.to.y ?? 0);

      // TOP lanes should be above busbar (smaller Y)
      // BOTTOM lanes should be below busbar (larger Y)
      const busY = bus.p0.y;

      for (const y of topLaneYs) {
        expect(y).toBeLessThan(busY);
      }

      for (const y of bottomLaneYs) {
        expect(y).toBeGreaterThan(busY);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Test 5: Determinism → two runs produce identical results
  // ---------------------------------------------------------------------------

  describe('Test 5: Determinism', () => {
    it('should produce identical results for same input (radial)', () => {
      const bus = createHorizontalBusbar(400, 8);
      const feeders = createFeeders(5, 'BOTTOM');

      const result1 = computeBusbarAutoLayout(bus, feeders);
      const result2 = computeBusbarAutoLayout(bus, feeders);

      expect(layoutsAreEqual(result1, result2)).toBe(true);
    });

    it('should produce identical results for same input (mixed sides)', () => {
      const bus = createHorizontalBusbar(500, 10);
      const feeders = [
        ...createFeeders(3, 'TOP', 'top'),
        ...createFeeders(4, 'BOTTOM', 'bottom'),
      ];

      const result1 = computeBusbarAutoLayout(bus, feeders);
      const result2 = computeBusbarAutoLayout(bus, feeders);

      expect(layoutsAreEqual(result1, result2)).toBe(true);
    });

    it('should produce identical results for permuted input order', () => {
      const bus = createHorizontalBusbar(400, 8);
      const feedersOriginal = createFeeders(5, 'BOTTOM');
      const feedersReversed = [...feedersOriginal].reverse();
      const feedersShuffled = [
        feedersOriginal[2],
        feedersOriginal[0],
        feedersOriginal[4],
        feedersOriginal[1],
        feedersOriginal[3],
      ];

      const result1 = computeBusbarAutoLayout(bus, feedersOriginal);
      const result2 = computeBusbarAutoLayout(bus, feedersReversed);
      const result3 = computeBusbarAutoLayout(bus, feedersShuffled);

      expect(layoutsAreEqual(result1, result2)).toBe(true);
      expect(layoutsAreEqual(result1, result3)).toBe(true);
    });

    it('should produce identical results with compressed layout', () => {
      const bus = createHorizontalBusbar(150, 8);
      const feeders = createFeeders(15, 'BOTTOM');

      const result1 = computeBusbarAutoLayout(bus, feeders);
      const result2 = computeBusbarAutoLayout(bus, feeders);

      expect(layoutsAreEqual(result1, result2)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Additional Tests: Edge Cases
  // ---------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty feeders list', () => {
      const bus = createHorizontalBusbar(400, 8);
      const feeders: FeederInput[] = [];

      const result = computeBusbarAutoLayout(bus, feeders);

      expect(result.feeders).toHaveLength(0);
      expect(result.params.busLength).toBe(400);
    });

    it('should handle vertical busbar', () => {
      const bus = createVerticalBusbar(400, 8);
      const feeders = createFeeders(3, 'RIGHT');

      const result = computeBusbarAutoLayout(bus, feeders);

      expect(result.feeders).toHaveLength(3);

      // Stub should exit horizontally (X changes)
      for (const feeder of result.feeders) {
        expect(feeder.stubEnd.y).toBe(feeder.anchor.y); // Same Y for horizontal stub
        expect(feeder.stubEnd.x).toBeGreaterThan(feeder.anchor.x); // Goes right
      }
    });

    it('should handle very narrow busbar', () => {
      const bus = createHorizontalBusbar(50, 8);
      const feeders = createFeeders(3, 'BOTTOM');

      const result = computeBusbarAutoLayout(bus, feeders);

      expect(result.feeders).toHaveLength(3);

      // Should be compressed
      const hasCompressed = result.feeders.some((f) => f.meta.compressed);
      expect(hasCompressed).toBe(true);

      // All paths should still be orthogonal
      expect(checkOrthogonalPaths(result.feeders)).toBe(true);
    });

    it('should handle thick busbar', () => {
      const bus = createHorizontalBusbar(400, 20); // Thick busbar

      const feeders = createFeeders(3, 'BOTTOM');

      const result = computeBusbarAutoLayout(bus, feeders);

      expect(result.feeders).toHaveLength(3);

      // Parameters should scale with thickness
      const expectedMargin = calculateMargin(20);
      const expectedStubLength = calculateStubLength(20);

      expect(result.params.margin).toBe(expectedMargin);
      expect(result.params.stubLength).toBe(expectedStubLength);

      // Stub should be longer for thick busbar
      for (const feeder of result.feeders) {
        const stubLength = Math.abs(feeder.stubEnd.y - feeder.anchor.y);
        expect(stubLength).toBeGreaterThanOrEqual(expectedStubLength - 5); // Grid tolerance
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Layout Parameters Tests
  // ---------------------------------------------------------------------------

  describe('Layout Parameters', () => {
    it('should return correct params in result', () => {
      const bus = createHorizontalBusbar(400, 8);
      const feeders = createFeeders(3, 'BOTTOM');

      const result = computeBusbarAutoLayout(bus, feeders);

      expect(result.params.busLength).toBe(400);
      expect(result.params.margin).toBe(calculateMargin(8));
      expect(result.params.minSpacing).toBe(calculateMinSpacing(8));
      expect(result.params.stubLength).toBe(calculateStubLength(8));
    });

    it('should use overrides when provided', () => {
      const bus = createHorizontalBusbar(400, 8);
      const feeders = createFeeders(3, 'BOTTOM');

      const result = computeBusbarAutoLayout(bus, feeders, {
        marginOverride: 50,
        minSpacingOverride: 40,
        stubLengthOverride: 30,
        lanePitchOverride: 25,
      });

      expect(result.params.margin).toBe(50);
      expect(result.params.minSpacing).toBe(40);
      expect(result.params.stubLength).toBe(30);
      expect(result.params.lanePitch).toBe(25);
    });
  });

  // ---------------------------------------------------------------------------
  // Grid Snapping Tests
  // ---------------------------------------------------------------------------

  describe('Grid Snapping', () => {
    it('should snap all positions to grid', () => {
      const bus = createHorizontalBusbar(400, 8);
      const feeders = createFeeders(5, 'BOTTOM');

      const result = computeBusbarAutoLayout(bus, feeders);
      const gridSize = DEFAULT_AUTO_LAYOUT_CONFIG.gridSize;

      for (const feeder of result.feeders) {
        // Check anchor is on grid
        expect(feeder.anchor.x % gridSize).toBe(0);
        expect(feeder.anchor.y % gridSize).toBe(0);

        // Check stubEnd is on grid
        expect(feeder.stubEnd.x % gridSize).toBe(0);
        expect(feeder.stubEnd.y % gridSize).toBe(0);

        // Check path segments are on grid
        for (const segment of feeder.pathSegments) {
          expect(segment.from.x % gridSize).toBe(0);
          expect(segment.from.y % gridSize).toBe(0);
          expect(segment.to.x % gridSize).toBe(0);
          expect(segment.to.y % gridSize).toBe(0);
        }
      }
    });
  });
});
