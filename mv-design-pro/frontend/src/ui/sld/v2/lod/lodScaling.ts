/**
 * LOD-aware Scaling — P0.6 F3 foundation (final pure-function module).
 *
 * STATUS: PURE FUNCTIONS (foundation, no breaking changes)
 * Reference:
 * - docs/sld/SLD_INDUSTRIAL_SPEC_v1.md § 5.1 (5 LOD levels — zoom ranges)
 * - frontend/src/ui/sld/v2/lod/LodPolicy.ts
 * - frontend/src/ui/sld/v2/lod/labelPositioning.ts
 * - frontend/src/ui/sld/v2/lod/layerToggle.ts
 *
 * Pure functions wspierające F3 LOD-aware rendering:
 * 1. zoomToLod — map current viewport scale → LodLevel
 * 2. lodToFontSize — compute font size per LOD per text role
 * 3. lodToStrokeWidth — compute stroke width per LOD (thicker at overview)
 * 4. lodToSymbolScale — compute symbol scale factor per LOD
 *
 * Domyślne wartości zgodne z SLD_INDUSTRIAL_SPEC § 5.3 (Typografia hierarchiczna)
 * + AC-08 (LOD wzmacnia znaczenie elektryczne).
 *
 * INVARIANTS:
 * - PURE functions (no side effects)
 * - DETERMINISTIC (same input → identical output)
 * - NO physics
 */

import { LOD_ZOOM_THRESHOLDS, inferLodFromScale, type LodLevel } from './LodPolicy';

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { inferLodFromScale, LOD_ZOOM_THRESHOLDS };

/**
 * Konwersja zoom → LodLevel — wrapper z polską nazwą + JSDoc.
 *
 * Per SLD_INDUSTRIAL_SPEC_v1 § 5.1:
 *   scale < 0.3      → LOD-0 (overview/mapa)
 *   0.3 ≤ scale < 0.7 → LOD-1 (sieć/planview)
 *   0.7 ≤ scale < 1.5 → LOD-2 (obiekty/standard)
 *   1.5 ≤ scale < 3.0 → LOD-3 (szczegół techniczny)
 *   scale ≥ 3.0      → LOD-4 (diagnostyka)
 */
export function zoomToLod(scale: number): LodLevel {
  return inferLodFromScale(scale);
}

// ---------------------------------------------------------------------------
// Font scaling
// ---------------------------------------------------------------------------

/**
 * Text roles per SLD_INDUSTRIAL_SPEC_v1 § 5.3 (typografia hierarchiczna).
 */
export type TextRole =
  | 'gpzName'
  | 'bayName'
  | 'deviceQ'
  | 'parameter'
  | 'fieldMeasurement'
  | 'badge'
  | 'footnote';

/**
 * Base font sizes per role (LOD-2 standard) per SLD_INDUSTRIAL_SPEC § 5.3.
 */
const BASE_FONT_SIZES: Readonly<Record<TextRole, number>> = {
  gpzName: 24,
  bayName: 14,
  deviceQ: 12,
  parameter: 11,
  fieldMeasurement: 11,
  badge: 9,
  footnote: 8,
};

/**
 * Font size multiplier per LOD level.
 *
 * Strategia: overview używa lekko większych fontów (czytelność z daleka),
 * standard używa base, full-detail używa lekko mniejszych (więcej info per
 * unit area).
 */
const LOD_FONT_MULTIPLIER: Readonly<Record<LodLevel, number>> = {
  0: 1.5, // overview: większe fonty żeby czytać przy małej skali
  1: 1.2, // planview: lekko większe
  2: 1.0, // standard: base size
  3: 0.95, // technical: lekko mniejsze (więcej info)
  4: 0.9, // diagnostic: najmniejsze (maksimum info)
};

/**
 * Compute effective font size for a role at given LOD.
 *
 * Returns base size × LOD multiplier, rounded to nearest 0.5 px for
 * deterministic typography rendering.
 */
export function lodToFontSize(role: TextRole, lod: LodLevel): number {
  const base = BASE_FONT_SIZES[role];
  const multiplier = LOD_FONT_MULTIPLIER[lod];
  return Math.round(base * multiplier * 2) / 2;
}

// ---------------------------------------------------------------------------
// Stroke scaling
// ---------------------------------------------------------------------------

/**
 * Stroke role per AC-01 (tor mocy czytelny — różne grubości).
 */
export type StrokeRole = 'transmission' | 'transformer' | 'busbar' | 'trunk' | 'branch' | 'detail';

/**
 * Base stroke widths per role at LOD-2 (px).
 *
 * Per SLD_VISUAL_ACCEPTANCE_CRITERIA AC-01:
 *   - 110 kV: 5 px (transmission)
 *   - TR: 4 px (transformer)
 *   - Busbar SN: 4 px (busbar)
 *   - Trunk SN: 3 px (trunk)
 *   - Branch: 2 px (branch)
 *   - Cable run: 1.5 px (detail)
 */
const BASE_STROKE_WIDTHS: Readonly<Record<StrokeRole, number>> = {
  transmission: 5,
  transformer: 4,
  busbar: 4,
  trunk: 3,
  branch: 2,
  detail: 1.5,
};

/**
 * Stroke width multiplier per LOD.
 *
 * Strategia: overview podkreśla główne elementy grubszymi liniami,
 * detail LOD używa mniejszych grubości (więcej elementów na ekranie).
 */
const LOD_STROKE_MULTIPLIER: Readonly<Record<LodLevel, number>> = {
  0: 1.4,
  1: 1.2,
  2: 1.0,
  3: 0.95,
  4: 0.9,
};

/**
 * Compute effective stroke width per role at LOD.
 */
export function lodToStrokeWidth(role: StrokeRole, lod: LodLevel): number {
  const base = BASE_STROKE_WIDTHS[role];
  const multiplier = LOD_STROKE_MULTIPLIER[lod];
  return Math.round(base * multiplier * 4) / 4; // round to 0.25 px
}

// ---------------------------------------------------------------------------
// Symbol scaling
// ---------------------------------------------------------------------------

/**
 * Compute symbol scale factor per LOD.
 *
 * LOD-0: symbols slightly larger (visible at low zoom)
 * LOD-4: symbols smaller (more fit on screen)
 *
 * Used by SymbolRenderer to compute final SVG transform scale.
 */
export function lodToSymbolScale(lod: LodLevel): number {
  switch (lod) {
    case 0:
      return 1.2;
    case 1:
      return 1.1;
    case 2:
      return 1.0;
    case 3:
      return 0.95;
    case 4:
      return 0.9;
  }
}

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

/**
 * Compute padding around elements per LOD.
 *
 * Larger padding at overview, tighter packing at detail levels.
 */
export function lodToElementPadding(lod: LodLevel): number {
  switch (lod) {
    case 0:
      return 20;
    case 1:
      return 16;
    case 2:
      return 12;
    case 3:
      return 8;
    case 4:
      return 6;
  }
}
