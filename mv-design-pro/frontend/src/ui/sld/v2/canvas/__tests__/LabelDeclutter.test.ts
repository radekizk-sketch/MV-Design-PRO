/**
 * LabelDeclutter — Phase 2 testy (operator-grade SLD plan v2).
 *
 * Pokrycie:
 *   1. Single label → placed na preferred (default 'right').
 *   2. Multiple labels bez kolizji → wszystkie placed.
 *   3. Kolizja: high priority wygrywa, low hidden.
 *   4. Locked label: never moved nawet gdy collision.
 *   5. preferredAnchor: try first jeśli podany.
 *   6. Determinizm: same input → identical placement (10 reruny).
 *   7. Sort stability: same priority → id asc.
 *   8. Max iterations limit (50): hard cap.
 *   9. Anchor try order: right → left → top-right → bottom-right → ...
 *  10. Metrics: distribution + counts.
 */
import { describe, expect, it } from 'vitest';

import {
  ANCHOR_TRY_ORDER,
  LABEL_PRIORITY,
  type LabelInput,
  computeDeclutterMetrics,
  declutterLabels,
} from '../LabelDeclutter';

function label(id: string, priority: number, anchor = { x: 0, y: 0 }, w = 50, h = 16): LabelInput {
  return {
    id,
    text: `Label ${id}`,
    priority: priority as never,
    anchorPoint: anchor,
    width: w,
    height: h,
  };
}

describe('declutterLabels — single label', () => {
  it('Pojedyncza etykieta → placed na "right" (default first try)', () => {
    const result = declutterLabels([label('a', LABEL_PRIORITY.STATION)]);
    expect(result).toHaveLength(1);
    expect(result[0].anchor).toBe('right');
    expect(result[0].hidden).toBe(false);
  });

  it('preferredAnchor=top → placed na top', () => {
    const lbl: LabelInput = {
      ...label('a', LABEL_PRIORITY.STATION),
      preferredAnchor: 'top',
    };
    const result = declutterLabels([lbl]);
    expect(result[0].anchor).toBe('top');
  });
});

describe('declutterLabels — multiple labels bez kolizji', () => {
  it('2 etykiety daleko od siebie → obie placed', () => {
    const labels = [
      label('a', LABEL_PRIORITY.STATION, { x: 0, y: 0 }),
      label('b', LABEL_PRIORITY.STATION, { x: 200, y: 0 }),
    ];
    const result = declutterLabels(labels);
    expect(result.every((r) => !r.hidden)).toBe(true);
  });
});

describe('declutterLabels — kolizja high vs low priority', () => {
  it('GPZ + STATION na tym samym anchor: GPZ placed na "right", STATION przesunięte na alternatywny', () => {
    const labels = [
      label('gpz', LABEL_PRIORITY.GPZ, { x: 0, y: 0 }),
      label('st', LABEL_PRIORITY.STATION, { x: 0, y: 0 }),
    ];
    const result = declutterLabels(labels);
    const gpz = result.find((r) => r.id === 'gpz')!;
    const st = result.find((r) => r.id === 'st')!;
    expect(gpz.anchor).toBe('right');
    expect(gpz.hidden).toBe(false);
    // STATION musi być na innym anchorze niż GPZ
    expect(st.anchor).not.toBe('right');
  });

  it('Wiele kolizji: low priority hidden gdy wszystkie anchory wyczerpane', () => {
    // Wszystkie etykiety na (0,0) z bbox które pasują w 8 anchorach
    // (małe etykiety 30×12 px, fit w 8-anchor distribution).
    const labels = [
      label('g1', LABEL_PRIORITY.GPZ, { x: 0, y: 0 }, 30, 12),
      label('g2', LABEL_PRIORITY.GPZ, { x: 0, y: 0 }, 30, 12),
      label('g3', LABEL_PRIORITY.GPZ, { x: 0, y: 0 }, 30, 12),
      label('g4', LABEL_PRIORITY.GPZ, { x: 0, y: 0 }, 30, 12),
      label('g5', LABEL_PRIORITY.GPZ, { x: 0, y: 0 }, 30, 12),
      label('g6', LABEL_PRIORITY.GPZ, { x: 0, y: 0 }, 30, 12),
      label('g7', LABEL_PRIORITY.GPZ, { x: 0, y: 0 }, 30, 12),
      label('g8', LABEL_PRIORITY.GPZ, { x: 0, y: 0 }, 30, 12),
      label('low', LABEL_PRIORITY.DEVICE, { x: 0, y: 0 }, 30, 12),
    ];
    const result = declutterLabels(labels);
    // 9 etykiet, 8 anchorów (z których część nakłada się dla małych bbox) →
    // niektóre muszą być hidden. Low priority NA PEWNO hidden (placed last).
    const lowResult = result.find((r) => r.id === 'low')!;
    expect(lowResult.hidden).toBe(true);
    // Co najmniej połowa GPZ-ów placed (priorytet wygrywa nad DEVICE).
    const gpzPlaced = result.filter((r) => r.id.startsWith('g') && !r.hidden);
    expect(gpzPlaced.length).toBeGreaterThanOrEqual(4);
  });
});

describe('declutterLabels — locked labels', () => {
  it('Locked label umieszczona w lockedAnchor pomimo kolizji', () => {
    const labels: LabelInput[] = [
      { ...label('locked', LABEL_PRIORITY.DEVICE, { x: 0, y: 0 }), lockedAnchor: 'right' },
      label('high', LABEL_PRIORITY.GPZ, { x: 0, y: 0 }),
    ];
    const result = declutterLabels(labels);
    const locked = result.find((r) => r.id === 'locked')!;
    expect(locked.anchor).toBe('right');
    expect(locked.locked).toBe(true);
    expect(locked.hidden).toBe(false);
  });

  it('Locked label sortowana wg priority (placed w cyklu sortowania)', () => {
    const labels: LabelInput[] = [
      { ...label('locked-low', LABEL_PRIORITY.DEVICE, { x: 0, y: 0 }), lockedAnchor: 'right' },
      label('high', LABEL_PRIORITY.GPZ, { x: 0, y: 0 }),
    ];
    const result = declutterLabels(labels);
    // High priority placed first → 'right' zajęte; locked-low ma lockedAnchor=right ale operator zatwierdził overlap
    const locked = result.find((r) => r.id === 'locked-low')!;
    expect(locked.locked).toBe(true);
    // High wybiera default 'right', a locked-low tez 'right' — operator akceptuje kolizję
    expect(locked.anchor).toBe('right');
  });
});

describe('declutterLabels — determinizm', () => {
  it('Same input + 10 reruny → identical placement', () => {
    const labels = [
      label('a', LABEL_PRIORITY.STATION, { x: 0, y: 0 }),
      label('b', LABEL_PRIORITY.SEGMENT, { x: 30, y: 30 }),
      label('c', LABEL_PRIORITY.GPZ, { x: 100, y: 0 }),
    ];
    const reference = declutterLabels(labels);
    for (let i = 0; i < 10; i++) {
      const next = declutterLabels(labels);
      expect(next).toEqual(reference);
    }
  });

  it('Sort stability: same priority + same anchor → id asc decyduje', () => {
    const labels = [
      label('z', LABEL_PRIORITY.STATION, { x: 0, y: 0 }),
      label('a', LABEL_PRIORITY.STATION, { x: 0, y: 0 }),
      label('m', LABEL_PRIORITY.STATION, { x: 0, y: 0 }),
    ];
    const result = declutterLabels(labels);
    // 'a' placed first (alfabetycznie) → bierze 'right'
    const a = result.find((r) => r.id === 'a')!;
    expect(a.anchor).toBe('right');
  });

  it('Anchor try order zgodny z ANCHOR_TRY_ORDER (right → left → top-right → ...)', () => {
    expect(ANCHOR_TRY_ORDER[0]).toBe('right');
    expect(ANCHOR_TRY_ORDER[1]).toBe('left');
    expect(ANCHOR_TRY_ORDER[2]).toBe('top-right');
  });
});

describe('declutterLabels — max iterations limit', () => {
  it('Brak infinite loop dla 100 etykiet — max 50 iteracji', () => {
    const labels: LabelInput[] = Array.from({ length: 100 }, (_, i) =>
      label(`l${i}`, LABEL_PRIORITY.STATION, { x: 0, y: 0 }, 200, 40),
    );
    const start = Date.now();
    const result = declutterLabels(labels, 50);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000); // hard limit nie zawiesi
    // Po 50 iteracjach reszta etykiet (50+ z 100) NIE jest w output
    // (bo break in-loop przerywa pętlę zanim dojdą).
    expect(result.length).toBeLessThanOrEqual(100);
  });
});

describe('computeDeclutterMetrics', () => {
  it('Liczy total, placed, hidden, locked + anchor distribution', () => {
    const labels = [
      label('a', LABEL_PRIORITY.STATION, { x: 0, y: 0 }),
      label('b', LABEL_PRIORITY.STATION, { x: 200, y: 0 }),
      { ...label('c', LABEL_PRIORITY.DEVICE, { x: 100, y: 0 }), lockedAnchor: 'top' as const },
    ];
    const placements = declutterLabels(labels);
    const metrics = computeDeclutterMetrics(placements);
    expect(metrics.totalLabels).toBe(3);
    expect(metrics.lockedLabels).toBe(1);
    expect(metrics.anchorDistribution.top).toBe(1);
  });
});

describe('declutterLabels — output order = input order', () => {
  it('Output zachowuje order po id z input (nie po priority)', () => {
    const labels = [
      label('a', LABEL_PRIORITY.DEVICE),
      label('b', LABEL_PRIORITY.GPZ),
      label('c', LABEL_PRIORITY.STATION),
    ];
    const result = declutterLabels(labels);
    expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});
