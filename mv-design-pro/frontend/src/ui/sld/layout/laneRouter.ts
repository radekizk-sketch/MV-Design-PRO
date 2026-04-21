/**
 * SLD AUTO-LAYOUT — Lane Assignment + Routing
 *
 * Deterministyczny algorytm przypisywania lane'ów (korytarzy) dla feeders.
 *
 * ALGORYTM:
 * 1. Grupuj feedery po stronie (side)
 * 2. Sortuj po orderKey (determinizm)
 * 3. Pakuj do lane'ów z minimalnym odstępem
 * 4. Oblicz współrzędne lane'ów
 *
 * LANE CONCEPT:
 * - Lane to korytarz równoległy do szyny
 * - Lane 0 jest najbliżej szyny (tuż za stub)
 * - Lane 1, 2, ... są coraz dalej od szyny
 * - Linie w różnych lane'ach nie nachodzą na siebie
 *
 * DETERMINIZM: Te same dane wejściowe → identyczny output
 *
 * CANONICAL ALIGNMENT:
 * - CANONICAL software visual standards
 * - Canonical routing principles
 */

import type {
  BusbarInput,
  FeederInput,
  FeederSide,
  AnchorAssignment,
  LaneAssignment,
  Point2D,
} from './types';
import {
  calculateStubLength,
  calculateLanePitch,
  SIDE_DIRECTION,
} from './constants';
import { getBusbarPerpendicular } from './anchorLayout';

// =============================================================================
// LANE ASSIGNMENT ALGORITHM
// =============================================================================

/**
 * Interval representing a feeder's horizontal/vertical span on the lane.
 */
interface FeederInterval {
  feederId: string;
  start: number; // Min position on busbar axis
  end: number;   // Max position on busbar axis
  orderKey: string;
}

/**
 * Check if two intervals overlap (with small tolerance).
 */
function intervalsOverlap(a: FeederInterval, b: FeederInterval, tolerance: number = 2): boolean {
  return a.start - tolerance < b.end && a.end + tolerance > b.start;
}

/**
 * Assign feeders to lanes using greedy packing.
 *
 * Algorithm:
 * - Process feeders in sorted order (by position, then orderKey)
 * - Assign each feeder to the first lane where it doesn't overlap
 * - Create new lane if no existing lane has space
 *
 * @param anchors - Anchor assignments (with positions)
 * @param stubLength - Length of stub segment
 * @returns Lane assignments
 */
export function assignLanes(
  anchors: readonly AnchorAssignment[],
  stubLength: number
): LaneAssignment[] {
  if (anchors.length === 0) {
    return [];
  }

  // Create intervals for each feeder
  // Interval represents the horizontal span that needs clearance
  // For simplicity, use anchor position +/- half stub length as the span
  const halfSpan = stubLength / 2;
  const intervals: FeederInterval[] = anchors.map((anchor) => ({
    feederId: anchor.feederId,
    start: anchor.position - halfSpan,
    end: anchor.position + halfSpan,
    orderKey: anchor.orderKey,
  }));

  // Sort by position (primary) and orderKey (secondary) for determinism
  intervals.sort((a, b) => {
    const posA = (a.start + a.end) / 2;
    const posB = (b.start + b.end) / 2;
    if (posA !== posB) {
      return posA - posB;
    }
    return a.orderKey.localeCompare(b.orderKey);
  });

  // Lane packing: assign each feeder to first available lane
  const lanes: FeederInterval[][] = [];
  const assignments: LaneAssignment[] = [];

  for (const interval of intervals) {
    let assignedLane = -1;

    // Find first lane where interval doesn't overlap with existing
    for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
      const lane = lanes[laneIndex];
      const hasOverlap = lane.some((existing) => intervalsOverlap(existing, interval));

      if (!hasOverlap) {
        assignedLane = laneIndex;
        break;
      }
    }

    // If no lane found, create new one
    if (assignedLane === -1) {
      assignedLane = lanes.length;
      lanes.push([]);
    }

    // Add to lane
    lanes[assignedLane].push(interval);

    assignments.push({
      feederId: interval.feederId,
      laneIndex: assignedLane,
      laneCoordinate: 0, // Will be calculated later
    });
  }

  return assignments;
}

/**
 * Calculate lane coordinates based on bus position, side, and lane index.
 *
 * @param bus - Busbar definition
 * @param side - Exit side
 * @param laneIndex - Lane index (0 = closest to bus)
 * @param stubLength - Stub length
 * @param lanePitch - Lane pitch (spacing between lanes)
 * @returns Lane coordinate (Y for H bus, X for V bus)
 */
export function calculateLaneCoordinate(
  bus: BusbarInput,
  side: FeederSide,
  laneIndex: number,
  stubLength: number,
  lanePitch: number
): number {
  const busPerpendicular = getBusbarPerpendicular(bus);
  const direction = SIDE_DIRECTION[side];

  // Lane 0 is at: bus + direction * (thickness/2 + stubLength)
  // Lane N is at: lane0 + direction * N * lanePitch
  const halfThickness = bus.thickness / 2;
  const lane0Offset = halfThickness + stubLength;
  const laneOffset = lane0Offset + laneIndex * lanePitch;

  return busPerpendicular + direction * laneOffset;
}

/**
 * Complete lane assignment with coordinates.
 *
 * @param bus - Busbar definition
 * @param anchors - Anchor assignments
 * @param feeders - Original feeder inputs (for side info)
 * @param stubLengthOverride - Optional stub length override
 * @param lanePitchOverride - Optional lane pitch override
 * @returns Lane assignments with coordinates
 */
export function assignLanesWithCoordinates(
  bus: BusbarInput,
  anchors: readonly AnchorAssignment[],
  feeders: readonly FeederInput[],
  stubLengthOverride?: number,
  lanePitchOverride?: number
): Map<string, LaneAssignment> {
  const stubLength = stubLengthOverride ?? calculateStubLength(bus.thickness);
  const lanePitch = lanePitchOverride ?? calculateLanePitch(bus.thickness);

  // Create feeder lookup
  const feederById = new Map(feeders.map((f) => [f.id, f]));

  // Group anchors by side
  const anchorsBySide = new Map<FeederSide, AnchorAssignment[]>();
  for (const anchor of anchors) {
    const feeder = feederById.get(anchor.feederId);
    if (!feeder) continue;

    const side = feeder.side;
    const group = anchorsBySide.get(side) ?? [];
    group.push(anchor);
    anchorsBySide.set(side, group);
  }

  const result = new Map<string, LaneAssignment>();

  // Process each side separately
  for (const [side, sideAnchors] of anchorsBySide) {
    // Assign lanes within this side
    const laneAssignments = assignLanes(sideAnchors, stubLength);

    // Calculate coordinates for each assignment
    for (const assignment of laneAssignments) {
      const coordinate = calculateLaneCoordinate(
        bus,
        side,
        assignment.laneIndex,
        stubLength,
        lanePitch
      );

      result.set(assignment.feederId, {
        feederId: assignment.feederId,
        laneIndex: assignment.laneIndex,
        laneCoordinate: coordinate,
      });
    }
  }

  return result;
}

// =============================================================================
// STUB END CALCULATION
// =============================================================================

/**
 * Calculate stub end point (perpendicular exit from anchor).
 *
 * Stub always exits perpendicular to busbar.
 *
 * @param bus - Busbar definition
 * @param anchor - Anchor position
 * @param side - Exit side
 * @param stubLength - Stub length
 * @returns Stub end point
 */
export function calculateStubEnd(
  bus: BusbarInput,
  anchor: Point2D,
  side: FeederSide,
  stubLength: number
): Point2D {
  const direction = SIDE_DIRECTION[side];

  if (bus.axis === 'H') {
    // Horizontal bus: stub goes vertically
    return {
      x: anchor.x,
      y: anchor.y + direction * stubLength,
    };
  }

  // Vertical bus: stub goes horizontally
  return {
    x: anchor.x + direction * stubLength,
    y: anchor.y,
  };
}

/**
 * Calculate elbow point where stub meets lane.
 *
 * @param bus - Busbar definition
 * @param anchor - Anchor position on busbar
 * @param laneCoordinate - Lane coordinate (Y for H bus, X for V bus)
 * @returns Elbow point
 */
export function calculateElbowPoint(
  bus: BusbarInput,
  anchor: Point2D,
  laneCoordinate: number
): Point2D {
  if (bus.axis === 'H') {
    // Horizontal bus: elbow is at (anchor.x, laneCoordinate)
    return {
      x: anchor.x,
      y: laneCoordinate,
    };
  }

  // Vertical bus: elbow is at (laneCoordinate, anchor.y)
  return {
    x: laneCoordinate,
    y: anchor.y,
  };
}

// =============================================================================
// LANE ROUTING HELPERS
// =============================================================================

/**
 * Get maximum lane index used for a given side.
 *
 * @param laneAssignments - Lane assignments map
 * @param feeders - Feeder inputs (for side info)
 * @param side - Exit side
 * @returns Maximum lane index (-1 if no feeders on this side)
 */
export function getMaxLaneIndex(
  laneAssignments: Map<string, LaneAssignment>,
  feeders: readonly FeederInput[],
  side: FeederSide
): number {
  let maxLane = -1;

  for (const feeder of feeders) {
    if (feeder.side !== side) continue;

    const assignment = laneAssignments.get(feeder.id);
    if (assignment && assignment.laneIndex > maxLane) {
      maxLane = assignment.laneIndex;
    }
  }

  return maxLane;
}

/**
 * Calculate total lane depth (distance from bus to outermost lane).
 *
 * @param maxLaneIndex - Maximum lane index
 * @param stubLength - Stub length
 * @param lanePitch - Lane pitch
 * @param halfThickness - Half of busbar thickness
 * @returns Total depth from bus center to outermost lane
 */
export function calculateLaneDepth(
  maxLaneIndex: number,
  stubLength: number,
  lanePitch: number,
  halfThickness: number
): number {
  if (maxLaneIndex < 0) {
    return 0;
  }

  // Depth = half thickness + stub + lanes
  return halfThickness + stubLength + maxLaneIndex * lanePitch;
}
