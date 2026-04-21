/**
 * SLD Editor Utils — Eksporty
 *
 * CANONICAL ALIGNMENT:
 * - SLD_KANONICZNA_SPECYFIKACJA.md
 * - AUDYT_SLD_CANONICAL.md
 * - SLD_AUTOLAYOUT_AUDIT_I_NAPRAWA.md: BINDING SPEC
 *
 * NOTE: Legacy autoLayout.ts has been REMOVED.
 * The topological engine (topological-layout/) is the sole layout engine.
 */

// Geometry utilities
export {
  getSymbolBoundingBox,
  getCombinedBoundingBox,
  getBoundingBoxCenter,
  alignSymbols,
  distributeSymbols,
  snapPositionToGrid,
  isPointInsideBox,
  doBoundingBoxesIntersect,
} from './geometry';

// Auto-layout (topological engine — canonical, sole engine)
export {
  computeTopologicalLayout,
  verifyDeterminism,
  processIncrementalUpdate,
  assignTopologicalRoles,
  detectSymbolCollisions,
  resolveSymbolCollisions,
  calculateSymbolBounds,
  validateExportMargins,
  processAutoInsert,
  checkInsertStability,
  buildGeometricSkeleton,
  resolveOrientation,
  DEFAULT_GEOMETRY_CONFIG,
  deepFreezeSymbols,
} from './topological-layout';

export type {
  TopologicalLayoutResult,
  LayoutGeometryConfig,
  LayoutDiagnostics,
  CollisionReport,
  AutoInsertResult,
} from './topological-layout';

// SLD Validator
export {
  validateSld,
  shouldBlockSave,
  getValidationSummary,
  filterIssuesBySeverity,
} from './sldValidator';
export type {
  ValidationSeverity,
  ValidationIssue,
  ValidationResult,
  ValidationOptions,
} from './sldValidator';
