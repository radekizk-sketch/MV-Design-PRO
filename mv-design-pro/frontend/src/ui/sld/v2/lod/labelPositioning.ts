/**
 * LOD-aware Label Positioning — P0.6 F3 foundation.
 *
 * STATUS: PURE FUNCTIONS (foundation, no breaking changes)
 * Reference:
 * - docs/sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md AC-06 (etykiety nie nachodzą)
 * - docs/sld/SLD_INDUSTRIAL_SPEC_v1.md § 5.1 (5-poziom LOD policy)
 * - frontend/src/ui/sld/v2/lod/LodPolicy.ts (5 LOD levels)
 *
 * Pure functions wspierające F3 LOD policy + collision avoidance dla etykiet.
 * Per AUDYT_BRAKI § 7.6 (LOD ukrywa znaczenie elektryczne) ten module zapewnia:
 *
 * 1. computeLabelVisibility — czy etykieta powinna być widoczna na danym LOD
 * 2. resolveCollidingLabels — przesunięcia żeby etykiety nie nachodziły
 * 3. compactLabelText — skróty tekstu per LOD (np. "Q01 51-NN" → "Q01" przy LOD-0)
 *
 * INVARIANTS:
 * - PURE functions (zero side effects, no DOM)
 * - DETERMINISTIC (same input → identical output)
 * - NO physics (presentation only)
 */

import type { LodLevel } from './LodPolicy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Klasa etykiety — różny priorytet widoczności per LOD.
 */
export type LabelImportance =
  | 'critical' // np. nazwy stacji, GPZ, główne źródła — widoczne ZAWSZE
  | 'primary' // tagi pól, transformer ratings — widoczne od LOD-1
  | 'secondary' // pomiary, parametry techniczne — widoczne od LOD-2
  | 'tertiary' // footnoty, snapshot info — widoczne od LOD-3
  | 'diagnostic'; // debug, raw IDs — tylko LOD-4

export interface LabelBox {
  /** Unique identifier dla collision resolver. */
  readonly id: string;
  /** Anchor X (where label centers). */
  readonly anchorX: number;
  /** Anchor Y (where label centers). */
  readonly anchorY: number;
  /** Approximate label width (chars × font size estimate). */
  readonly width: number;
  /** Label height (≈ font size). */
  readonly height: number;
  /** Importance bucket (drives LOD visibility). */
  readonly importance: LabelImportance;
  /** Optional source text (used by compactLabelText). */
  readonly text?: string;
}

export interface ResolvedLabel extends LabelBox {
  /** Final anchor X after collision resolution. */
  readonly resolvedX: number;
  /** Final anchor Y after collision resolution. */
  readonly resolvedY: number;
  /** Whether label visible at this LOD. */
  readonly visible: boolean;
  /**
   * Whether collision resolution failed (maxIterations exhausted).
   * Caller may emit a visual-regression warning or hide overlapping labels.
   * Always false for invisible labels.
   *
   * AC-06 invariant: if `unresolved === true`, this label still overlaps
   * with at least one previously-placed label after best-effort nudging.
   */
  readonly unresolved: boolean;
}

// ---------------------------------------------------------------------------
// Visibility per LOD
// ---------------------------------------------------------------------------

/**
 * Map importance → minimum LOD at which label appears.
 *
 * LOD-0 = mapview (only critical), LOD-4 = diagnostic (everything).
 */
const LABEL_MIN_LOD: Readonly<Record<LabelImportance, LodLevel>> = {
  critical: 0,
  primary: 1,
  secondary: 2,
  tertiary: 3,
  diagnostic: 4,
};

/**
 * Decide if label should be visible at given LOD.
 *
 * Examples:
 * - 'critical' label is visible at ALL LODs (0-4)
 * - 'secondary' label is visible from LOD-2 (0.7-1.5×) upwards
 * - 'diagnostic' label only at LOD-4 (>3.0×)
 */
export function computeLabelVisibility(
  importance: LabelImportance,
  currentLod: LodLevel,
): boolean {
  return currentLod >= LABEL_MIN_LOD[importance];
}

// ---------------------------------------------------------------------------
// Collision resolution
// ---------------------------------------------------------------------------

/**
 * Bounding-box collision detection.
 *
 * Returns true if rectangles overlap with at least `padding` margin.
 */
export function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  padding = 2,
): boolean {
  const aLeft = a.x - a.width / 2 - padding;
  const aRight = a.x + a.width / 2 + padding;
  const aTop = a.y - a.height / 2 - padding;
  const aBottom = a.y + a.height / 2 + padding;
  const bLeft = b.x - b.width / 2 - padding;
  const bRight = b.x + b.width / 2 + padding;
  const bTop = b.y - b.height / 2 - padding;
  const bBottom = b.y + b.height / 2 + padding;
  return !(aRight < bLeft || aLeft > bRight || aBottom < bTop || aTop > bBottom);
}

/**
 * Resolve overlapping labels by greedy nudge — moves lower-importance labels
 * vertically until they no longer collide.
 *
 * Algorithm:
 * 1. Sort labels by importance (critical first, diagnostic last)
 * 2. For each label, check against already-placed labels
 * 3. If collision, nudge vertically (down → up → down…) until no collision
 *    or max iterations reached
 * 4. Higher importance labels always win their preferred position
 *
 * INVARIANT: deterministic — same input always produces same output.
 *
 * Returns array in INPUT order (not sorted) with resolved positions.
 */
export function resolveCollidingLabels(
  labels: readonly LabelBox[],
  currentLod: LodLevel,
  options?: {
    nudgeStepPx?: number;
    maxIterations?: number;
    paddingPx?: number;
  },
): ResolvedLabel[] {
  const nudge = options?.nudgeStepPx ?? 8;
  const maxIter = options?.maxIterations ?? 20;
  const padding = options?.paddingPx ?? 2;

  // Compute visibility for each
  const visibility = new Map<string, boolean>();
  for (const lbl of labels) {
    visibility.set(lbl.id, computeLabelVisibility(lbl.importance, currentLod));
  }

  // Sort by importance (lower index = higher priority)
  const importanceOrder: Record<LabelImportance, number> = {
    critical: 0,
    primary: 1,
    secondary: 2,
    tertiary: 3,
    diagnostic: 4,
  };
  // Stable sort by (importance, then original index for determinism)
  const indexed = labels.map((lbl, idx) => ({ lbl, originalIdx: idx }));
  const sorted = indexed.slice().sort((a, b) => {
    const cmp = importanceOrder[a.lbl.importance] - importanceOrder[b.lbl.importance];
    return cmp !== 0 ? cmp : a.originalIdx - b.originalIdx;
  });

  // Greedy placement
  const placed: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
  const resolved = new Map<string, { x: number; y: number; unresolved: boolean }>();

  for (const { lbl } of sorted) {
    if (!visibility.get(lbl.id)) {
      resolved.set(lbl.id, { x: lbl.anchorX, y: lbl.anchorY, unresolved: false });
      continue;
    }
    let x = lbl.anchorX;
    let y = lbl.anchorY;
    let iter = 0;
    let direction = 1; // alternate down/up
    let stillColliding = false;
    while (iter < maxIter) {
      stillColliding = placed.some((p) =>
        boxesOverlap(
          { x, y, width: lbl.width, height: lbl.height },
          p,
          padding,
        ),
      );
      if (!stillColliding) break;
      y += direction * nudge;
      direction = -direction;
      // Increase nudge size every other iteration to break symmetric deadlocks
      if (iter % 2 === 1) y += direction * nudge;
      iter++;
    }
    placed.push({ id: lbl.id, x, y, width: lbl.width, height: lbl.height });
    resolved.set(lbl.id, { x, y, unresolved: stillColliding });
  }

  // Re-emit in INPUT order
  return labels.map((lbl) => {
    const r = resolved.get(lbl.id) ?? { x: lbl.anchorX, y: lbl.anchorY, unresolved: false };
    return {
      ...lbl,
      resolvedX: r.x,
      resolvedY: r.y,
      visible: visibility.get(lbl.id) ?? false,
      unresolved: r.unresolved,
    };
  });
}

// ---------------------------------------------------------------------------
// Text compaction
// ---------------------------------------------------------------------------

/**
 * Compact label text based on LOD.
 *
 * Examples:
 * - LOD-0: "Q01" (first token only)
 * - LOD-1: "Q01 51" (first 2 tokens)
 * - LOD-2: "Q01 51-NN" (full primary)
 * - LOD-3+: full text as-is
 */
export function compactLabelText(
  fullText: string,
  currentLod: LodLevel,
): string {
  if (currentLod >= 2) return fullText;
  if (!fullText) return '';
  const tokens = fullText.split(/\s+/).filter((t) => t.length > 0);
  if (currentLod === 0) return tokens[0] ?? '';
  // LOD-1: 2 tokens
  return tokens.slice(0, 2).join(' ');
}
