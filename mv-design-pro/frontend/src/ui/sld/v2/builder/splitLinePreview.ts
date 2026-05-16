/**
 * Split Line Preview — P0.9 split-preview foundation.
 *
 * STATUS: PURE FUNCTIONS (foundation, no breaking changes)
 * Reference:
 * - docs/audit/ENGINEER_WORKFLOW_AUDIT.md § 3.3 (split-preview brakuje)
 * - docs/sld/SLD_ENGINEER_WORKFLOW_END_TO_END.md Krok 7 (split z preview/cancel/commit)
 * - frontend/src/ui/sld/SldEditorPage.tsx:882 (existing insert tool)
 *
 * Pure functions wspierające UX: gdy użytkownik klika na środek odcinka SN
 * i wybiera "Podziel + wstaw stację", komponent rendering musi pokazać
 * preview (split point + 2 nowe segmenty + placeholder stacji) ZANIM
 * commit do ENM_OP.
 *
 * Ten module dostarcza CZYSTE FUNKCJE geometryczne — bez React, bez DOM,
 * bez side effects. Integration w SldEditorPage (preview overlay komponent)
 * to follow-up.
 *
 * INVARIANTS:
 * - PURE functions (zero side effects)
 * - DETERMINISTIC (same input → identical output)
 * - NO physics calculations (only geometry)
 * - Polish error messages
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface LineSegment {
  readonly startId: string;
  readonly endId: string;
  readonly start: Point;
  readonly end: Point;
}

export interface SplitPreviewResult {
  /** Punkt na linii gdzie pojawi się nowa stacja. */
  readonly splitPoint: Point;
  /** Pozycja względna na linii (0..1) — 0 = start, 1 = end. */
  readonly splitT: number;
  /** Pierwszy nowy segment (od start do splitPoint). */
  readonly segment1: LineSegment;
  /** Drugi nowy segment (od splitPoint do end). */
  readonly segment2: LineSegment;
  /** Długości segmentów (dla wyświetlenia użytkownikowi). */
  readonly lengthRatio1: number;
  readonly lengthRatio2: number;
}

// ---------------------------------------------------------------------------
// Math helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Project a point onto a line segment and clamp to [0..1].
 *
 * Returns parametric position `t` along the line (0 = start, 1 = end).
 * Used to find the nearest point on segment for cursor hover preview.
 */
export function projectOntoSegment(
  cursor: Point,
  segmentStart: Point,
  segmentEnd: Point,
): number {
  const dx = segmentEnd.x - segmentStart.x;
  const dy = segmentEnd.y - segmentStart.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return 0; // Degenerate: zero-length segment
  }
  const t = ((cursor.x - segmentStart.x) * dx + (cursor.y - segmentStart.y) * dy) / lengthSq;
  return Math.max(0, Math.min(1, t));
}

/**
 * Linear interpolation between two points at parameter t (0..1).
 *
 * Returns the point at fraction `t` along the line. Used to compute
 * the actual split point coordinates from `splitT`.
 */
export function lerpPoint(start: Point, end: Point, t: number): Point {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

/**
 * Compute distance between two points (Euclidean).
 */
export function distanceBetween(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---------------------------------------------------------------------------
// Main preview function
// ---------------------------------------------------------------------------

/**
 * Build split preview from cursor position over an existing line segment.
 *
 * Used by SLD editor when user activates `insert_station_on_segment_sn` tool
 * and hovers over a line. Returns geometry for rendering 2 new segments +
 * placeholder station marker.
 *
 * IDs konwencja:
 * - segment1: `${originalLineId}__before`
 * - segment2: `${originalLineId}__after`
 * - station placeholder: `${originalLineId}__station_preview`
 *
 * Note: te ID są TYLKO dla preview rendering — actual ENM_OP użyje
 * deterministycznego idempotency_key (per V12.xx canon).
 *
 * @param cursor Cursor position from mouse event (after coord transform)
 * @param line Line being split (with start/end coords and node IDs)
 * @returns SplitPreviewResult or null if cursor too close to endpoint
 *          (clamped to MIN_SPLIT_DISTANCE_RATIO from endpoints)
 */
export function buildSplitPreview(
  cursor: Point,
  line: LineSegment,
  options?: {
    /** Minimum distance from endpoints as ratio (default 0.05 = 5%). */
    minEndpointDistanceRatio?: number;
  },
): SplitPreviewResult | null {
  const minRatio = options?.minEndpointDistanceRatio ?? 0.05;
  if (!Number.isFinite(minRatio) || minRatio < 0 || minRatio >= 0.5) {
    throw new Error(
      `Niepoprawne minEndpointDistanceRatio=${minRatio}. ` +
        'Musi być w zakresie [0, 0.5).',
    );
  }

  // Project cursor onto segment
  const t = projectOntoSegment(cursor, line.start, line.end);
  // Clamp away from endpoints (split too close to endpoint is degenerate)
  if (t < minRatio || t > 1 - minRatio) {
    return null; // Cursor too close to endpoint
  }

  const splitPoint = lerpPoint(line.start, line.end, t);
  const stationId = `${line.startId}__station_preview`;

  return {
    splitPoint,
    splitT: t,
    segment1: {
      startId: line.startId,
      endId: stationId,
      start: line.start,
      end: splitPoint,
    },
    segment2: {
      startId: stationId,
      endId: line.endId,
      start: splitPoint,
      end: line.end,
    },
    lengthRatio1: t,
    lengthRatio2: 1 - t,
  };
}

/**
 * Format split preview as polish UX message for status bar / tooltip.
 *
 * Example: "Podział linii: 35% / 65% (250 m / 464 m)"
 */
export function formatSplitPreviewLabel(
  preview: SplitPreviewResult,
  totalLengthMeters?: number,
): string {
  const pct1 = Math.round(preview.lengthRatio1 * 100);
  const pct2 = 100 - pct1;
  if (totalLengthMeters !== undefined && Number.isFinite(totalLengthMeters)) {
    const m1 = Math.round(totalLengthMeters * preview.lengthRatio1);
    const m2 = Math.round(totalLengthMeters - m1);
    return `Podział linii: ${pct1}% / ${pct2}% (${m1} m / ${m2} m)`;
  }
  return `Podział linii: ${pct1}% / ${pct2}%`;
}
