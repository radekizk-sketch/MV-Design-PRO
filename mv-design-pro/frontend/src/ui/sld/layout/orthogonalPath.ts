/**
 * SLD AUTO-LAYOUT — Orthogonal Path Builder
 *
 * Buduje ortogonalne ścieżki (tylko kąty 90°) dla wyprowadzeń z szyny.
 *
 * STRUKTURA ŚCIEŻKI:
 * 1. anchor → stubEnd (prostopadły do szyny)
 * 2. stubEnd → elbow (w lane, równoległy do szyny)
 * 3. elbow → exit (opcjonalny, do punktu docelowego)
 *
 * ZASADY:
 * - Brak skosów (tylko 90°)
 * - Brak krzywych
 * - Wszystkie segmenty H/V
 *
 * DETERMINIZM: Te same dane wejściowe → identyczny output
 *
 * CANONICAL ALIGNMENT:
 * - CANONICAL software visual standards (no diagonal from busbars)
 * - Canonical routing principles
 */

import type {
  BusbarInput,
  FeederInput,
  Point2D,
  PathSegment,
  AnchorAssignment,
  LaneAssignment,
  FeederLayoutResult,
  FeederLayoutMeta,
  AutoLayoutResult,
  AutoLayoutOptions,
  SpacingResult,
} from './types';
import {
  calculateMargin,
  calculateMinSpacing,
  calculateStubLength,
  calculateLanePitch,
  snapToGrid,
  GRID_SIZE,
  SIDE_DIRECTION,
} from './constants';
import {
  assignAnchors,
  anchorToPoint,
  calculateBusbarLength,
} from './anchorLayout';
import {
  assignLanesWithCoordinates,
  calculateStubEnd,
  calculateElbowPoint,
} from './laneRouter';

// =============================================================================
// PATH SEGMENT BUILDERS
// =============================================================================

/**
 * Create a line segment.
 */
export function createLineSegment(from: Point2D, to: Point2D): PathSegment {
  return {
    kind: 'L',
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
  };
}

/**
 * Check if a segment is degenerate (zero length).
 */
export function isSegmentDegenerate(segment: PathSegment, tolerance: number = 0.1): boolean {
  const dx = Math.abs(segment.to.x - segment.from.x);
  const dy = Math.abs(segment.to.y - segment.from.y);
  return dx < tolerance && dy < tolerance;
}

/**
 * Build orthogonal path for a single feeder.
 *
 * Path structure: anchor → stubEnd → elbow (→ optional exit)
 *
 * @param bus - Busbar definition
 * @param anchor - Anchor point on busbar
 * @param stubEnd - End of stub segment
 * @param laneCoordinate - Lane Y (H bus) or X (V bus)
 * @param exitX - Optional exit X coordinate (for DIRECT_TO_TARGET mode)
 * @returns Array of path segments
 */
export function buildOrthogonalPath(
  bus: BusbarInput,
  anchor: Point2D,
  stubEnd: Point2D,
  laneCoordinate: number,
  exitX?: number
): PathSegment[] {
  const segments: PathSegment[] = [];

  // Segment 1: anchor → stubEnd (perpendicular to bus)
  const seg1 = createLineSegment(anchor, stubEnd);
  if (!isSegmentDegenerate(seg1)) {
    segments.push(seg1);
  }

  // Calculate elbow point (where stub meets lane)
  const elbow = calculateElbowPoint(bus, anchor, laneCoordinate);

  // Segment 2: stubEnd → elbow (in lane direction if needed)
  // This handles the case where stubEnd and elbow are different
  // (stubEnd is at the end of stub, elbow is at lane coordinate)
  if (bus.axis === 'H') {
    // For H bus: stub goes vertically, elbow is at (anchor.x, laneY)
    // stubEnd is at (anchor.x, anchor.y + stubLen)
    // They should be the same point if lane is at stubEnd
    const seg2 = createLineSegment(stubEnd, elbow);
    if (!isSegmentDegenerate(seg2)) {
      segments.push(seg2);
    }

    // Segment 3: horizontal run in lane (if exitX provided)
    if (exitX !== undefined && exitX !== anchor.x) {
      const laneEnd: Point2D = { x: exitX, y: laneCoordinate };
      const seg3 = createLineSegment(elbow, laneEnd);
      if (!isSegmentDegenerate(seg3)) {
        segments.push(seg3);
      }
    }
  } else {
    // For V bus: stub goes horizontally, elbow is at (laneX, anchor.y)
    const seg2 = createLineSegment(stubEnd, elbow);
    if (!isSegmentDegenerate(seg2)) {
      segments.push(seg2);
    }

    // Segment 3: vertical run in lane (if exitY provided, using exitX as Y coordinate)
    if (exitX !== undefined && exitX !== anchor.y) {
      const laneEnd: Point2D = { x: laneCoordinate, y: exitX };
      const seg3 = createLineSegment(elbow, laneEnd);
      if (!isSegmentDegenerate(seg3)) {
        segments.push(seg3);
      }
    }
  }

  return segments;
}

/**
 * Snap all points in path segments to grid.
 */
export function snapPathToGrid(segments: PathSegment[], gridSize: number = GRID_SIZE): PathSegment[] {
  return segments.map((seg) => ({
    kind: seg.kind,
    from: {
      x: snapToGrid(seg.from.x, gridSize),
      y: snapToGrid(seg.from.y, gridSize),
    },
    to: {
      x: snapToGrid(seg.to.x, gridSize),
      y: snapToGrid(seg.to.y, gridSize),
    },
  }));
}

// =============================================================================
// COMPLETE FEEDER LAYOUT
// =============================================================================

/**
 * Build complete layout for a single feeder.
 *
 * @param bus - Busbar definition
 * @param feeder - Feeder input
 * @param anchorAssignment - Anchor assignment
 * @param laneAssignment - Lane assignment
 * @param spacingResult - Spacing result for this feeder's side
 * @param stubLength - Stub length
 * @returns Complete feeder layout result
 */
export function buildFeederLayout(
  bus: BusbarInput,
  feeder: FeederInput,
  anchorAssignment: AnchorAssignment,
  laneAssignment: LaneAssignment,
  spacingResult: SpacingResult,
  stubLength: number
): FeederLayoutResult {
  // Get anchor point
  const anchor = anchorToPoint(bus, anchorAssignment);

  // Calculate stub end
  const stubEnd = calculateStubEnd(bus, anchor, feeder.side, stubLength);

  // Build path segments
  const pathSegments = buildOrthogonalPath(
    bus,
    anchor,
    stubEnd,
    laneAssignment.laneCoordinate,
    feeder.targetPosition ? (bus.axis === 'H' ? feeder.targetPosition.x : feeder.targetPosition.y) : undefined
  );

  // Snap to grid
  const snappedSegments = snapPathToGrid(pathSegments);

  // Build metadata
  const meta: FeederLayoutMeta = {
    spacingUsed: spacingResult.spacingUsed,
    compressed: spacingResult.compressed,
    direction: SIDE_DIRECTION[feeder.side],
  };

  return {
    id: feeder.id,
    anchor: {
      x: snapToGrid(anchor.x),
      y: snapToGrid(anchor.y),
    },
    stubEnd: {
      x: snapToGrid(stubEnd.x),
      y: snapToGrid(stubEnd.y),
    },
    laneIndex: laneAssignment.laneIndex,
    pathSegments: snappedSegments,
    meta,
  };
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

/**
 * Compute complete auto-layout for busbar feeders.
 *
 * DETERMINISTIC: Same input → identical output
 *
 * This is the main entry point for the auto-layout algorithm.
 *
 * @param bus - Busbar definition
 * @param feeders - Feeder definitions
 * @param options - Layout options
 * @returns Complete auto-layout result
 */
export function computeBusbarAutoLayout(
  bus: BusbarInput,
  feeders: readonly FeederInput[],
  options?: AutoLayoutOptions
): AutoLayoutResult {
  // Calculate parameters
  const margin = options?.marginOverride ?? calculateMargin(bus.thickness);
  const minSpacing = options?.minSpacingOverride ?? calculateMinSpacing(bus.thickness);
  const stubLength = options?.stubLengthOverride ?? calculateStubLength(bus.thickness);
  const lanePitch = options?.lanePitchOverride ?? calculateLanePitch(bus.thickness);
  const busLength = calculateBusbarLength(bus);

  // Handle empty feeders
  if (feeders.length === 0) {
    return {
      feeders: [],
      params: {
        margin,
        minSpacing,
        stubLength,
        lanePitch,
        busLength,
      },
    };
  }

  // Step 1: Assign anchors
  const { assignments: anchorAssignments, spacingResult: spacingResults } = assignAnchors(
    bus,
    feeders,
    margin,
    minSpacing
  );

  // Step 2: Assign lanes
  const laneAssignments = assignLanesWithCoordinates(
    bus,
    anchorAssignments,
    feeders,
    stubLength,
    lanePitch
  );

  // Step 3: Build layout for each feeder
  const feederLayouts: FeederLayoutResult[] = [];

  // Create lookup maps
  const anchorByFeederId = new Map(
    anchorAssignments.map((a) => [a.feederId, a])
  );
  const feederById = new Map(feeders.map((f) => [f.id, f]));

  // Sort feeder IDs for deterministic output
  const sortedFeederIds = [...anchorByFeederId.keys()].sort();

  for (const feederId of sortedFeederIds) {
    const feeder = feederById.get(feederId);
    const anchorAssignment = anchorByFeederId.get(feederId);
    const laneAssignment = laneAssignments.get(feederId);

    if (!feeder || !anchorAssignment || !laneAssignment) {
      continue;
    }

    // Get spacing result for this feeder's side
    const sideSpacingResult = spacingResults.get(feeder.side) ?? {
      positions: [],
      spacingUsed: minSpacing,
      compressed: false,
    };

    const layout = buildFeederLayout(
      bus,
      feeder,
      anchorAssignment,
      laneAssignment,
      sideSpacingResult,
      stubLength
    );

    feederLayouts.push(layout);
  }

  return {
    feeders: feederLayouts,
    params: {
      margin,
      minSpacing,
      stubLength,
      lanePitch,
      busLength,
    },
  };
}

// =============================================================================
// PATH CONVERSION UTILITIES
// =============================================================================

/**
 * Convert path segments to polyline points (for SVG rendering).
 *
 * @param segments - Path segments
 * @returns Array of points
 */
export function segmentsToPolyline(segments: readonly PathSegment[]): Point2D[] {
  if (segments.length === 0) {
    return [];
  }

  const points: Point2D[] = [segments[0].from];

  for (const segment of segments) {
    // Avoid duplicating the last point if it matches
    const lastPoint = points[points.length - 1];
    if (lastPoint.x !== segment.from.x || lastPoint.y !== segment.from.y) {
      points.push(segment.from);
    }
    points.push(segment.to);
  }

  return points;
}

/**
 * Convert path segments to SVG path data string.
 *
 * @param segments - Path segments
 * @returns SVG path data (M/L commands)
 */
export function segmentsToSvgPath(segments: readonly PathSegment[]): string {
  if (segments.length === 0) {
    return '';
  }

  const commands: string[] = [];
  commands.push(`M ${segments[0].from.x} ${segments[0].from.y}`);

  for (const segment of segments) {
    commands.push(`L ${segment.to.x} ${segment.to.y}`);
  }

  return commands.join(' ');
}

/**
 * Calculate total path length.
 *
 * @param segments - Path segments
 * @returns Total length in pixels
 */
export function calculatePathLength(segments: readonly PathSegment[]): number {
  let total = 0;

  for (const segment of segments) {
    const dx = Math.abs(segment.to.x - segment.from.x);
    const dy = Math.abs(segment.to.y - segment.from.y);
    total += dx + dy; // Manhattan distance for orthogonal paths
  }

  return total;
}
