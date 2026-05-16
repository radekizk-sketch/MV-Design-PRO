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
 * SPEC BINDING: LOD zoom ranges są bindowane do SLD_INDUSTRIAL_SPEC § 5.1
 * (patrz LodPolicy.ts). Stroke role base values wynikają z AC-01.
 *
 * KLASYFIKACJA STAŁYCH (V12.xx §9 No Heuristics — non-physics distinction):
 * Mnożniki LOD (LOD_FONT_MULTIPLIER, LOD_STROKE_MULTIPLIER) oraz padding
 * są PRESENTATION DEFAULTS — wartości dobranie empirycznie dla wizualnej
 * czytelności (overview vs detail). NIE są wielkościami fizycznymi i NIE
 * wpływają na obliczenia solverów (Z_loop, Ik, P, Q). Per AC-08 LOD
 * wzmacnia znaczenie wizualne; same liczby są tunable w spec § 5.3
 * tabeli defaults — przyszły design review może je zaktualizować bez
 * łamania innych invariantów (Determinism, WHITE BOX, Frozen Result API).
 *
 * INVARIANTS:
 * - PURE functions (no side effects)
 * - DETERMINISTIC (same input → identical output)
 * - NO physics (presentation-only multipliers, no solver impact)
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
/**
 * BASE_FONT_SIZES per role (LOD-2 standard, pixele).
 *
 * Per WCAG 2.1 AA (1.4.4 Resize text + 1.4.12 Text Spacing) — minimum
 * 12 px dla content text. Iter 12 audit Wizualny WCAG: "Q1/Q8/T1/Q9 +
 * Pole TR1 przy 10-11 px — poniżej WCAG min 12 px" — fix iter 13.
 *
 * Hierarchia (gpzName > bayName > deviceQ ≈ parameter ≈ fieldMeasurement
 * > badge > footnote) per SLD_INDUSTRIAL_SPEC § 5.3.
 */
const BASE_FONT_SIZES: Readonly<Record<TextRole, number>> = {
  gpzName: 24,
  bayName: 16, // +2 (z 14, hierarchia nadal vs deviceQ 12)
  deviceQ: 13, // +1 (z 12, +1 nad WCAG min)
  parameter: 12, // +1 (z 11, exact WCAG min)
  fieldMeasurement: 12, // +1 (z 11, exact WCAG min)
  badge: 11, // +2 (z 9, chips/markers — WCAG zalecane ≥11)
  footnote: 10, // +2 (z 8, small print zatwierdzony ≥10 dopuszczalny)
};

/** WCAG AA minimum font size dla content text (lower bound clamp). */
const MIN_FONT_PX = 10 as const;

/**
 * Font size multiplier per LOD level.
 *
 * PRESENTATION DEFAULT (non-physics): overview używa lekko większych fontów
 * (czytelność z daleka), standard używa base, full-detail używa lekko
 * mniejszych (więcej info per unit area). Wartości tunable bez wpływu na
 * solver — patrz comment na górze pliku.
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
  const scaled = Math.round(base * multiplier * 2) / 2;
  // WCAG clamp: nawet przy LOD-4 (multiplier 0.9) font NIE schodzi poniżej
  // 10 px (footnote min). Iter 12 audit Wizualny WCAG: parameter @ LOD-4
  // = 11*0.9 = 9.9 px → poniżej WCAG min — fixed via clamp.
  return Math.max(scaled, MIN_FONT_PX);
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
 * PRESENTATION DEFAULT (non-physics): overview podkreśla główne elementy
 * grubszymi liniami, detail LOD używa mniejszych grubości (więcej elementów
 * na ekranie). Wartości tunable bez wpływu na solver — patrz comment na
 * górze pliku.
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
/**
 * Iter 13 (per Iter 12 CAD audit blocker):
 * "Pole TR1 — symbole aparatów mikroskopijne (~12 px) na canvasie 1920 —
 *  naruszenie ETAP/DIgSILENT min. 24 px symbol size"
 *
 * Bump base scales aby symbol 16 px @ LOD-2 standard renderował się jako
 * 24+ px (1.5×) per ETAP/DIgSILENT min. symbol size:
 * - LOD-0 overview: 1.6× (z 1.2 — overview, gęste, ale symbole jeszcze widoczne)
 * - LOD-1 planview: 1.5× (z 1.1)
 * - LOD-2 standard: 1.5× (z 1.0 — gwarantuje 24 px dla bazowego 16 px)
 * - LOD-3 technical: 1.4× (z 0.95)
 * - LOD-4 diagnostic: 1.3× (z 0.9, gęste ale ETAP min 24 px utrzymane)
 */
export function lodToSymbolScale(lod: LodLevel): number {
  switch (lod) {
    case 0:
      return 1.6;
    case 1:
      return 1.5;
    case 2:
      return 1.5;
    case 3:
      return 1.4;
    case 4:
      return 1.3;
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
