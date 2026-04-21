/**
 * SLD AUTO-LAYOUT — Public API
 *
 * Deterministyczny moduł auto-layoutu dla wyprowadzeń z szyny (busbar feeders).
 *
 * FEATURES:
 * - Anchor placement z equal spacing + compression przy tłoku
 * - Lane routing dla równoległych linii (bez nachodzenia)
 * - Orthogonal path builder (stub → elbow → run)
 * - Feature flag SLD_AUTO_LAYOUT_V1 (domyślnie OFF)
 *
 * DETERMINIZM: Te same dane wejściowe → identyczny output
 * BEZPIECZEŃSTWO: Feature flag pozwala włączyć/wyłączyć bez ryzyka regresji
 *
 * CANONICAL ALIGNMENT:
 * - sldCanonicalStyle.ts: CANONICAL_GEOMETRY tokens
 * - CANONICAL software visual standards (feeders exit perpendicular from busbar)
 * - Canonical layout principles
 *
 * USAGE:
 * ```typescript
 * import {
 *   computeBusbarAutoLayout,
 *   isAutoLayoutV1Enabled,
 *   enableAutoLayoutV1,
 * } from '@/ui/sld/layout';
 *
 * // Check feature flag
 * if (isAutoLayoutV1Enabled()) {
 *   const result = computeBusbarAutoLayout(bus, feeders);
 *   // Use result.feeders[].pathSegments for rendering
 * }
 * ```
 */

// =============================================================================
// PUBLIC TYPE EXPORTS
// =============================================================================

export type {
  // Common types
  Point2D,
  BusbarAxis,
  FeederSide,

  // Input types
  BusbarInput,
  FeederInput,
  AutoLayoutMode,
  AutoLayoutOptions,
  AutoLayoutInput,

  // Output types
  PathSegment,
  FeederLayoutMeta,
  FeederLayoutResult,
  AutoLayoutResult,

  // Internal types (exposed for advanced usage/testing)
  AnchorAssignment,
  LaneAssignment,
  SpacingResult,
} from './types';

// =============================================================================
// CONSTANTS EXPORTS
// =============================================================================

export {
  // Parameter calculators
  calculateMargin,
  calculateMinSpacing,
  calculateStubLength,
  calculateLanePitch,

  // Fixed constants
  DEFAULT_LANE_PITCH,
  GAP_ELBOW,
  GRID_SIZE,
  SIDE_DIRECTION,
  DEFAULT_AUTO_LAYOUT_CONFIG,

  // Grid snapping
  snapToGrid,

  // Feature flag
  isAutoLayoutV1Enabled,
  enableAutoLayoutV1,
  disableAutoLayoutV1,

  // Validation limits
  MAX_FEEDERS_PER_BUSBAR,
  MIN_BUSBAR_LENGTH,
  COMPRESSION_THRESHOLD,
} from './constants';

// =============================================================================
// ANCHOR LAYOUT EXPORTS
// =============================================================================

export {
  // Helpers
  calculateBusbarLength,
  getBusbarStart,
  getBusbarEnd,
  getBusbarPerpendicular,
  positionToPoint,

  // Target calculation
  calculateInitialTargets,

  // Spacing enforcement
  enforceSpacing1D,

  // Anchor assignment
  groupFeedersBySide,
  assignAnchors,
  anchorToPoint,
} from './anchorLayout';

// =============================================================================
// LANE ROUTING EXPORTS
// =============================================================================

export {
  // Lane assignment
  assignLanes,
  calculateLaneCoordinate,
  assignLanesWithCoordinates,

  // Stub/elbow calculation
  calculateStubEnd,
  calculateElbowPoint,

  // Lane utilities
  getMaxLaneIndex,
  calculateLaneDepth,
} from './laneRouter';

// =============================================================================
// ORTHOGONAL PATH EXPORTS
// =============================================================================

export {
  // Segment builders
  createLineSegment,
  isSegmentDegenerate,
  buildOrthogonalPath,
  snapPathToGrid,

  // Complete layout
  buildFeederLayout,
  computeBusbarAutoLayout,

  // Path conversion
  segmentsToPolyline,
  segmentsToSvgPath,
  calculatePathLength,
} from './orthogonalPath';

// =============================================================================
// CONVENIENCE ALIAS
// =============================================================================

/**
 * Main entry point for busbar auto-layout.
 *
 * Alias for computeBusbarAutoLayout for convenience.
 *
 * @param bus - Busbar definition
 * @param feeders - Feeder definitions
 * @param options - Layout options
 * @returns Complete auto-layout result
 */
export { computeBusbarAutoLayout as computeSldAutoLayout } from './orthogonalPath';
