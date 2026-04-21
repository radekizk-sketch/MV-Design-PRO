/**
 * SLD AUTO-LAYOUT — Types
 *
 * Typy wejścia/wyjścia dla deterministycznego auto-layoutu wyprowadzeń z szyny.
 *
 * DETERMINIZM: Te same dane wejściowe → identyczny output
 * FEATURE FLAG: SLD_AUTO_LAYOUT_V1 (domyślnie OFF)
 *
 * CANONICAL ALIGNMENT:
 * - sldCanonicalStyle.ts: CANONICAL_GEOMETRY tokens
 * - autoLayout.ts: CANONICAL-grade hierarchiczny layout
 * - connectionRouting.ts: CANONICAL routing rules
 */

// =============================================================================
// COMMON TYPES
// =============================================================================

/**
 * 2D position (pixels).
 */
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/**
 * Busbar axis orientation.
 * H = horizontal busbar (feeders exit TOP/BOTTOM)
 * V = vertical busbar (feeders exit LEFT/RIGHT)
 */
export type BusbarAxis = 'H' | 'V';

/**
 * Feeder exit side relative to busbar.
 * TOP/BOTTOM for horizontal busbars.
 * LEFT/RIGHT for vertical busbars.
 */
export type FeederSide = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';

// =============================================================================
// INPUT TYPES
// =============================================================================

/**
 * Busbar definition for anchor layout.
 *
 * Opisuje szynę (Bus) z orientacją i pozycją.
 */
export interface BusbarInput {
  /** Unique busbar identifier */
  readonly id: string;

  /** Busbar axis orientation */
  readonly axis: BusbarAxis;

  /** Start point (left/top) of busbar centerline */
  readonly p0: Point2D;

  /** End point (right/bottom) of busbar centerline */
  readonly p1: Point2D;

  /** Busbar thickness in pixels (stroke width) */
  readonly thickness: number;
}

/**
 * Feeder definition for anchor layout.
 *
 * Opisuje wyprowadzenie (feeder) z szyny.
 */
export interface FeederInput {
  /** Unique feeder identifier */
  readonly id: string;

  /** Exit side from busbar */
  readonly side: FeederSide;

  /**
   * Order key for deterministic sorting.
   * Feeders are sorted by this key to ensure consistent anchor positions.
   * Typically: elementId or symbol name.
   */
  readonly orderKey: string;

  /**
   * Preferred lane index (optional).
   * If provided, layout will try to use this lane.
   * If not provided, lane is assigned automatically.
   */
  readonly preferredLane?: number;

  /**
   * Target position (optional, for DIRECT_TO_TARGET mode).
   * If provided, routing will attempt to reach this point.
   */
  readonly targetPosition?: Point2D;
}

/**
 * Auto-layout mode.
 *
 * BUS_LANES: Feeders routed through lanes parallel to busbar (default)
 * DIRECT_TO_TARGET: Feeders routed directly to target positions
 */
export type AutoLayoutMode = 'BUS_LANES' | 'DIRECT_TO_TARGET';

/**
 * Auto-layout options.
 */
export interface AutoLayoutOptions {
  /** Layout mode (default: BUS_LANES) */
  readonly mode?: AutoLayoutMode;

  /** Override margin M (pixels) */
  readonly marginOverride?: number;

  /** Override minimum spacing Smin (pixels) */
  readonly minSpacingOverride?: number;

  /** Override stub length (pixels) */
  readonly stubLengthOverride?: number;

  /** Override lane pitch (pixels) */
  readonly lanePitchOverride?: number;
}

/**
 * Complete auto-layout input.
 */
export interface AutoLayoutInput {
  /** Busbar definition */
  readonly bus: BusbarInput;

  /** Feeder definitions */
  readonly feeders: readonly FeederInput[];

  /** Layout options (optional) */
  readonly options?: AutoLayoutOptions;
}

// =============================================================================
// OUTPUT TYPES
// =============================================================================

/**
 * Path segment (orthogonal line segment).
 */
export interface PathSegment {
  /** Segment type: L = line (only 90° supported) */
  readonly kind: 'L';

  /** Start point */
  readonly from: Point2D;

  /** End point */
  readonly to: Point2D;
}

/**
 * Feeder layout metadata.
 */
export interface FeederLayoutMeta {
  /** Spacing actually used (may differ from Smin if compressed) */
  readonly spacingUsed: number;

  /** True if spacing was compressed due to crowding */
  readonly compressed: boolean;

  /** Computed direction multiplier (-1 for TOP/LEFT, +1 for BOTTOM/RIGHT) */
  readonly direction: -1 | 1;
}

/**
 * Single feeder layout result.
 */
export interface FeederLayoutResult {
  /** Feeder ID (matches input) */
  readonly id: string;

  /** Anchor point on busbar centerline */
  readonly anchor: Point2D;

  /** End of stub segment (perpendicular exit from busbar) */
  readonly stubEnd: Point2D;

  /** Assigned lane index (0 = closest to busbar) */
  readonly laneIndex: number;

  /** Complete orthogonal path segments */
  readonly pathSegments: readonly PathSegment[];

  /** Layout metadata */
  readonly meta: FeederLayoutMeta;
}

/**
 * Complete auto-layout result.
 */
export interface AutoLayoutResult {
  /** Layout results for each feeder */
  readonly feeders: readonly FeederLayoutResult[];

  /** Layout parameters used (for debugging) */
  readonly params: {
    readonly margin: number;
    readonly minSpacing: number;
    readonly stubLength: number;
    readonly lanePitch: number;
    readonly busLength: number;
  };
}

// =============================================================================
// INTERNAL TYPES (for algorithm)
// =============================================================================

/**
 * Anchor assignment (internal).
 */
export interface AnchorAssignment {
  /** Feeder ID */
  readonly feederId: string;

  /** Position along busbar axis (0.0 = start, 1.0 = end) */
  readonly t: number;

  /** Absolute position on busbar (pixels) */
  readonly position: number;

  /** Exit side */
  readonly side: FeederSide;

  /** Order key for sorting */
  readonly orderKey: string;
}

/**
 * Lane assignment (internal).
 */
export interface LaneAssignment {
  /** Feeder ID */
  readonly feederId: string;

  /** Lane index (0 = closest to busbar) */
  readonly laneIndex: number;

  /** Lane Y coordinate (for H busbar) or X coordinate (for V busbar) */
  readonly laneCoordinate: number;
}

/**
 * Spacing result from 1D spacing algorithm (internal).
 */
export interface SpacingResult {
  /** Adjusted positions */
  readonly positions: readonly number[];

  /** Spacing actually used */
  readonly spacingUsed: number;

  /** Whether compression was needed */
  readonly compressed: boolean;
}
