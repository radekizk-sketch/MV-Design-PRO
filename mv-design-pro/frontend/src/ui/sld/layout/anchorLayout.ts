/**
 * SLD AUTO-LAYOUT — Anchor Placement + Spacing
 *
 * Deterministyczny algorytm rozmieszczania anchorów na szynie.
 *
 * ALGORYTM:
 * 1. Sortuj feedery po orderKey (determinizm)
 * 2. Rozłóż równomiernie w oknie szyny (z marginesem M)
 * 3. Wymuś minimalny spacing (forward + backward pass)
 * 4. Jeśli brak miejsca: kompresja do równego rozkładu
 * 5. Clamp do [busMin+M, busMax-M]
 *
 * DETERMINIZM: Te same dane wejściowe → identyczny output
 *
 * CANONICAL ALIGNMENT:
 * - CANONICAL software visual standards
 * - Canonical layout principles
 */

import type {
  BusbarInput,
  FeederInput,
  FeederSide,
  Point2D,
  AnchorAssignment,
  SpacingResult,
} from './types';
import {
  calculateMargin,
  calculateMinSpacing,
  COMPRESSION_THRESHOLD,
} from './constants';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Calculate busbar length from endpoints.
 */
export function calculateBusbarLength(bus: BusbarInput): number {
  if (bus.axis === 'H') {
    return Math.abs(bus.p1.x - bus.p0.x);
  }
  return Math.abs(bus.p1.y - bus.p0.y);
}

/**
 * Get busbar start position (min coordinate on axis).
 */
export function getBusbarStart(bus: BusbarInput): number {
  if (bus.axis === 'H') {
    return Math.min(bus.p0.x, bus.p1.x);
  }
  return Math.min(bus.p0.y, bus.p1.y);
}

/**
 * Get busbar end position (max coordinate on axis).
 */
export function getBusbarEnd(bus: BusbarInput): number {
  if (bus.axis === 'H') {
    return Math.max(bus.p0.x, bus.p1.x);
  }
  return Math.max(bus.p0.y, bus.p1.y);
}

/**
 * Get busbar perpendicular coordinate (Y for H busbar, X for V busbar).
 */
export function getBusbarPerpendicular(bus: BusbarInput): number {
  if (bus.axis === 'H') {
    // For horizontal busbar, use Y coordinate (should be same for p0 and p1)
    return (bus.p0.y + bus.p1.y) / 2;
  }
  // For vertical busbar, use X coordinate
  return (bus.p0.x + bus.p1.x) / 2;
}

/**
 * Convert position along busbar to 2D point.
 */
export function positionToPoint(bus: BusbarInput, position: number): Point2D {
  const perpendicular = getBusbarPerpendicular(bus);

  if (bus.axis === 'H') {
    return { x: position, y: perpendicular };
  }
  return { x: perpendicular, y: position };
}

// =============================================================================
// TARGET CALCULATION (Step A)
// =============================================================================

/**
 * Calculate initial target positions for feeders.
 *
 * Równomierne rozłożenie w oknie szyny z marginesem M.
 *
 * @param feeders - Feeders sorted by orderKey
 * @param busStart - Busbar start position
 * @param busEnd - Busbar end position
 * @param margin - Margin M
 * @returns Array of target positions
 */
export function calculateInitialTargets(
  feeders: readonly FeederInput[],
  busStart: number,
  busEnd: number,
  margin: number
): number[] {
  const count = feeders.length;

  if (count === 0) {
    return [];
  }

  const usableStart = busStart + margin;
  const usableEnd = busEnd - margin;
  const usableLength = usableEnd - usableStart;

  if (count === 1) {
    // Single feeder: centered
    return [usableStart + usableLength / 2];
  }

  // Multiple feeders: evenly distributed
  const spacing = usableLength / (count - 1);
  const targets: number[] = [];

  for (let i = 0; i < count; i++) {
    targets.push(usableStart + i * spacing);
  }

  return targets;
}

// =============================================================================
// SPACING ENFORCEMENT (Step B)
// =============================================================================

/**
 * Enforce minimum spacing between anchors using forward + backward pass.
 *
 * If there's not enough space, compress spacing uniformly.
 *
 * @param positions - Initial positions
 * @param minSpacing - Minimum spacing Smin
 * @param busStart - Busbar start position (with margin)
 * @param busEnd - Busbar end position (with margin)
 * @returns Adjusted positions and metadata
 */
export function enforceSpacing1D(
  positions: readonly number[],
  minSpacing: number,
  busStart: number,
  busEnd: number
): SpacingResult {
  const count = positions.length;

  if (count === 0) {
    return { positions: [], spacingUsed: minSpacing, compressed: false };
  }

  if (count === 1) {
    // Single position: clamp to range
    const pos = Math.max(busStart, Math.min(busEnd, positions[0]));
    return { positions: [pos], spacingUsed: minSpacing, compressed: false };
  }

  const usableLength = busEnd - busStart;
  const requiredLength = (count - 1) * minSpacing;

  // Check if compression is needed
  if (requiredLength > usableLength * COMPRESSION_THRESHOLD) {
    // Compression mode: equal distribution
    const compressedSpacing = usableLength / (count - 1);
    const compressedPositions: number[] = [];

    for (let i = 0; i < count; i++) {
      compressedPositions.push(busStart + i * compressedSpacing);
    }

    return {
      positions: compressedPositions,
      spacingUsed: compressedSpacing,
      compressed: true,
    };
  }

  // Normal mode: forward + backward pass
  const result = [...positions];

  // Forward pass: ensure minimum spacing from left
  for (let i = 1; i < count; i++) {
    const minAllowed = result[i - 1] + minSpacing;
    if (result[i] < minAllowed) {
      result[i] = minAllowed;
    }
  }

  // Backward pass: ensure positions fit within range
  // If last position exceeds busEnd, shift everything back
  if (result[count - 1] > busEnd) {
    const overflow = result[count - 1] - busEnd;
    for (let i = 0; i < count; i++) {
      result[i] -= overflow;
    }

    // Re-run forward pass from start
    result[0] = Math.max(busStart, result[0]);
    for (let i = 1; i < count; i++) {
      const minAllowed = result[i - 1] + minSpacing;
      if (result[i] < minAllowed) {
        result[i] = minAllowed;
      }
    }

    // If still doesn't fit, fall back to compression
    if (result[count - 1] > busEnd) {
      const compressedSpacing = usableLength / (count - 1);
      const compressedPositions: number[] = [];

      for (let i = 0; i < count; i++) {
        compressedPositions.push(busStart + i * compressedSpacing);
      }

      return {
        positions: compressedPositions,
        spacingUsed: compressedSpacing,
        compressed: true,
      };
    }
  }

  // Clamp all positions to valid range
  for (let i = 0; i < count; i++) {
    result[i] = Math.max(busStart, Math.min(busEnd, result[i]));
  }

  return {
    positions: result,
    spacingUsed: minSpacing,
    compressed: false,
  };
}

// =============================================================================
// ANCHOR ASSIGNMENT
// =============================================================================

/**
 * Group feeders by exit side for separate processing.
 *
 * @param feeders - All feeders
 * @returns Map of side -> feeders
 */
export function groupFeedersBySide(
  feeders: readonly FeederInput[]
): Map<FeederSide, FeederInput[]> {
  const groups = new Map<FeederSide, FeederInput[]>();

  for (const feeder of feeders) {
    const group = groups.get(feeder.side) ?? [];
    group.push(feeder);
    groups.set(feeder.side, group);
  }

  // Sort each group by orderKey for determinism
  for (const [side, group] of groups) {
    group.sort((a, b) => a.orderKey.localeCompare(b.orderKey));
    groups.set(side, group);
  }

  return groups;
}

/**
 * Assign anchor positions to feeders on a busbar.
 *
 * DETERMINISTIC: Same input → same output
 *
 * @param bus - Busbar definition
 * @param feeders - Feeder definitions
 * @param marginOverride - Optional margin override
 * @param minSpacingOverride - Optional min spacing override
 * @returns Anchor assignments for each feeder
 */
export function assignAnchors(
  bus: BusbarInput,
  feeders: readonly FeederInput[],
  marginOverride?: number,
  minSpacingOverride?: number
): {
  assignments: AnchorAssignment[];
  spacingResult: Map<FeederSide, SpacingResult>;
} {
  if (feeders.length === 0) {
    return {
      assignments: [],
      spacingResult: new Map(),
    };
  }

  const margin = marginOverride ?? calculateMargin(bus.thickness);
  const minSpacing = minSpacingOverride ?? calculateMinSpacing(bus.thickness);

  const busStart = getBusbarStart(bus);
  const busEnd = getBusbarEnd(bus);
  const busLength = calculateBusbarLength(bus);

  // Usable range with margins
  const usableStart = busStart + margin;
  const usableEnd = busEnd - margin;

  // Group feeders by side
  const groups = groupFeedersBySide(feeders);

  const assignments: AnchorAssignment[] = [];
  const spacingResultMap = new Map<FeederSide, SpacingResult>();

  // Process each side separately
  for (const [side, sideFeepers] of groups) {
    // Calculate initial targets
    const initialTargets = calculateInitialTargets(
      sideFeepers,
      busStart,
      busEnd,
      margin
    );

    // Enforce spacing
    const spacingResult = enforceSpacing1D(
      initialTargets,
      minSpacing,
      usableStart,
      usableEnd
    );

    spacingResultMap.set(side, spacingResult);

    // Create assignments
    for (let i = 0; i < sideFeepers.length; i++) {
      const feeder = sideFeepers[i];
      const position = spacingResult.positions[i];
      const t = busLength > 0 ? (position - busStart) / busLength : 0.5;

      assignments.push({
        feederId: feeder.id,
        t,
        position,
        side: feeder.side,
        orderKey: feeder.orderKey,
      });
    }
  }

  // Sort assignments by feeder ID for determinism
  assignments.sort((a, b) => a.feederId.localeCompare(b.feederId));

  return { assignments, spacingResult: spacingResultMap };
}

/**
 * Convert anchor assignment to 2D point on busbar.
 *
 * @param bus - Busbar definition
 * @param assignment - Anchor assignment
 * @returns 2D anchor point
 */
export function anchorToPoint(bus: BusbarInput, assignment: AnchorAssignment): Point2D {
  return positionToPoint(bus, assignment.position);
}
