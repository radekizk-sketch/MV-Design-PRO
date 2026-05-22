/**
 * LabelDeclutter — Phase 2 (operator-grade SLD plan v2).
 *
 * **DETERMINISTYCZNY** algorytm placementu etykiet. NIE force-directed,
 * NIE RNG, NIE fps/time deps. Czysta funkcja.
 *
 * Algorytm (priority + reserve-bbox + hide-low-priority):
 *   1. Sortuj etykiety wg priority (GPZ > NMO > station > segment > device).
 *   2. Place high-priority first w domyślnej pozycji (preferred).
 *   3. Try alternative candidate positions in fixed order (right > left > top > bottom).
 *   4. Reserve bounding box dla umieszczonej etykiety.
 *   5. Hide / skompresuj lower-priority które kolidują.
 *   6. Locked labels (operator manualnie ułożył) NIE są przesuwane.
 *
 * Inwarianty:
 *   - Same input + same priorities → identical placement (deterministic).
 *   - Locked labels never moved.
 *   - Max 50 iteracji (hard limit zamiast infinite loop).
 *   - Output: dla każdej label → finalna pozycja LUB hidden=true.
 *
 * Acceptance Invariants 9 + 17:
 *   - Brak danych ≠ 0.00 (renderer ma data; declutter nie wymaga zewnętrznych metryk).
 *   - Force-directed/RNG nigdzie w pipeline produkcyjnym.
 *
 * @see SLD_CAD_INTERACTION_SPEC.md
 */

/**
 * Priority etykiet — wyższe = ważniejsze, umieszczane pierwsze.
 *
 * Kanon Phase 2:
 *   GPZ (Główny Punkt Zasilania) — najwyższy priorytet (1000).
 *   NMO (Punkt Normalnie Otwarty) — krytyczny dla operatora (900).
 *   STATION — stacje na ciągach (800).
 *   SEGMENT — kable/linie SN (500).
 *   DEVICE — aparaty w polu (300).
 *   MEASUREMENT — wartości pomiarowe (200).
 *   DECORATION — strzałki kierunkowe / heatmapy (100).
 */
export const LABEL_PRIORITY = {
  GPZ: 1000,
  NMO: 900,
  STATION: 800,
  SEGMENT: 500,
  DEVICE: 300,
  MEASUREMENT: 200,
  DECORATION: 100,
} as const;

export type LabelPriority = (typeof LABEL_PRIORITY)[keyof typeof LABEL_PRIORITY];

/** Pozycje kandydujące dla etykiety — fixed order (deterministic). */
export type LabelAnchor = 'right' | 'left' | 'top' | 'bottom' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

/** Stała kolejność prób — operator preferuje "right" jako default. */
export const ANCHOR_TRY_ORDER: readonly LabelAnchor[] = [
  'right',
  'left',
  'top-right',
  'bottom-right',
  'top-left',
  'bottom-left',
  'top',
  'bottom',
];

export interface LabelInput {
  readonly id: string;
  readonly text: string;
  readonly priority: LabelPriority;
  /** Anchor point (np. środek obiektu pod etykietą). */
  readonly anchorPoint: { readonly x: number; readonly y: number };
  /** Bounding box dimensions (width × height) — ustalany przez renderer. */
  readonly width: number;
  readonly height: number;
  /** Manual override: jeśli operator zablokował pozycję, declutter nie zmieni. */
  readonly lockedAnchor?: LabelAnchor | null;
  /** Preferred anchor (gdy operator preferuje konkretną stronę). */
  readonly preferredAnchor?: LabelAnchor | null;
}

export interface LabelPlacement {
  readonly id: string;
  /** Wybrany anchor (jedna z LabelAnchor). */
  readonly anchor: LabelAnchor;
  /** Wynikowy bounding box (top-left + width/height). */
  readonly bbox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** Czy ukryta (gdy nie znaleziono miejsca w max iterations). */
  readonly hidden: boolean;
  /** Czy locked (operator manualnie ułożył). */
  readonly locked: boolean;
}

const DEFAULT_OFFSET = 8; // px between anchor and label edge
const MAX_ITERATIONS = 50;

/**
 * Oblicza bounding box dla danego anchor + position.
 */
function computeBBox(label: LabelInput, anchor: LabelAnchor): {
  x: number; y: number; width: number; height: number;
} {
  const { anchorPoint: ap, width, height } = label;
  const halfW = width / 2;
  const halfH = height / 2;
  const off = DEFAULT_OFFSET;
  switch (anchor) {
    case 'right':       return { x: ap.x + off,        y: ap.y - halfH, width, height };
    case 'left':        return { x: ap.x - off - width, y: ap.y - halfH, width, height };
    case 'top':         return { x: ap.x - halfW,      y: ap.y - off - height, width, height };
    case 'bottom':      return { x: ap.x - halfW,      y: ap.y + off, width, height };
    case 'top-right':   return { x: ap.x + off,        y: ap.y - off - height, width, height };
    case 'top-left':    return { x: ap.x - off - width, y: ap.y - off - height, width, height };
    case 'bottom-right':return { x: ap.x + off,        y: ap.y + off, width, height };
    case 'bottom-left': return { x: ap.x - off - width, y: ap.y + off, width, height };
  }
}

/**
 * Sprawdza czy 2 bounding boxy kolidują (axis-aligned).
 */
function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y
  );
}

/**
 * Główna funkcja declutter — deterministyczna, pure.
 *
 * Algorytm:
 *   1. Sort labels po priority desc + id asc (stable order).
 *   2. Reserve bounding box dla każdej label w fixed try order.
 *   3. Locked labels są umieszczane w pozycji `lockedAnchor` (nie przesuwane).
 *   4. Lower priority labels które kolidują → hidden=true.
 *
 * @param labels Lista etykiet do umieszczenia.
 * @param maxIterations Default 50. Hard limit zamiast infinite loop.
 * @returns Lista placements w tym samym porządku co labels (po id).
 */
export function declutterLabels(
  labels: readonly LabelInput[],
  maxIterations: number = MAX_ITERATIONS,
): LabelPlacement[] {
  // Sort: priority desc, id asc — deterministic.
  const sorted = [...labels].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });

  const placements = new Map<string, LabelPlacement>();
  const reserved: { x: number; y: number; width: number; height: number }[] = [];

  let iterations = 0;
  const effectiveMaxIterations = Math.max(maxIterations, sorted.length);
  for (const label of sorted) {
    iterations += 1;
    if (iterations > effectiveMaxIterations) break;

    // Locked labels: użyj manualnej pozycji niezależnie od kolizji.
    if (label.lockedAnchor) {
      const bbox = computeBBox(label, label.lockedAnchor);
      placements.set(label.id, {
        id: label.id,
        anchor: label.lockedAnchor,
        bbox,
        hidden: false,
        locked: true,
      });
      reserved.push(bbox);
      continue;
    }

    // Try preferred anchor first jeśli podany.
    const tryOrder: LabelAnchor[] = label.preferredAnchor
      ? [label.preferredAnchor, ...ANCHOR_TRY_ORDER.filter((a) => a !== label.preferredAnchor)]
      : [...ANCHOR_TRY_ORDER];

    let placed: LabelPlacement | null = null;
    for (const anchor of tryOrder) {
      const bbox = computeBBox(label, anchor);
      const collides = reserved.some((r) => boxesOverlap(bbox, r));
      if (!collides) {
        placed = { id: label.id, anchor, bbox, hidden: false, locked: false };
        reserved.push(bbox);
        break;
      }
    }

    if (placed) {
      placements.set(label.id, placed);
    } else {
      // Brak miejsca → hidden (lower priority loses).
      const fallbackBBox = computeBBox(label, 'right');
      placements.set(label.id, {
        id: label.id,
        anchor: 'right',
        bbox: fallbackBBox,
        hidden: true,
        locked: false,
      });
    }
  }

  // Zachowaj order (po id labels[]) — output deterministyczny.
  return labels.map((l) => placements.get(l.id)!).filter(Boolean);
}

/**
 * Helper: pełen audit declutter run — zwraca metryki dla diagnostyki.
 */
export interface DeclutterMetrics {
  readonly totalLabels: number;
  readonly placedLabels: number;
  readonly hiddenLabels: number;
  readonly lockedLabels: number;
  readonly anchorDistribution: Readonly<Record<LabelAnchor, number>>;
}

export function computeDeclutterMetrics(placements: readonly LabelPlacement[]): DeclutterMetrics {
  const anchorDist: Record<LabelAnchor, number> = {
    'right': 0, 'left': 0, 'top': 0, 'bottom': 0,
    'top-right': 0, 'top-left': 0, 'bottom-right': 0, 'bottom-left': 0,
  };
  let placed = 0;
  let hidden = 0;
  let locked = 0;
  for (const p of placements) {
    if (p.locked) locked += 1;
    if (p.hidden) {
      hidden += 1;
    } else {
      placed += 1;
    }
    anchorDist[p.anchor] += 1;
  }
  return {
    totalLabels: placements.length,
    placedLabels: placed,
    hiddenLabels: hidden,
    lockedLabels: locked,
    anchorDistribution: anchorDist,
  };
}
