/**
 * lodScaling tests — P0.6 F3 LOD-aware scaling pure functions.
 *
 * Covers SLD_INDUSTRIAL_SPEC § 5.3 (typografia hierarchiczna)
 * + AC-01 (tor mocy czytelny — różne grubości).
 */

import { describe, expect, it } from 'vitest';

import type { LodLevel } from '../LodPolicy';
import {
  LOD_ZOOM_THRESHOLDS,
  lodToElementPadding,
  lodToFontSize,
  lodToStrokeWidth,
  lodToSymbolScale,
  zoomToLod,
  type StrokeRole,
  type TextRole,
} from '../lodScaling';

describe('zoomToLod', () => {
  it('scale < 0.3 → LOD 0 (overview)', () => {
    expect(zoomToLod(0.1)).toBe(0);
    expect(zoomToLod(0.29)).toBe(0);
  });

  it('0.3 ≤ scale < 0.7 → LOD 1 (planview)', () => {
    expect(zoomToLod(0.3)).toBe(1);
    expect(zoomToLod(0.5)).toBe(1);
    expect(zoomToLod(0.69)).toBe(1);
  });

  it('0.7 ≤ scale < 1.5 → LOD 2 (standard)', () => {
    expect(zoomToLod(0.7)).toBe(2);
    expect(zoomToLod(1.0)).toBe(2);
    expect(zoomToLod(1.49)).toBe(2);
  });

  it('1.5 ≤ scale < 3.0 → LOD 3 (technical)', () => {
    expect(zoomToLod(1.5)).toBe(3);
    expect(zoomToLod(2.5)).toBe(3);
    expect(zoomToLod(2.99)).toBe(3);
  });

  it('scale ≥ 3.0 → LOD 4 (diagnostic)', () => {
    expect(zoomToLod(3.0)).toBe(4);
    expect(zoomToLod(10)).toBe(4);
  });

  it('threshold constants re-exported correctly', () => {
    expect(LOD_ZOOM_THRESHOLDS.LOD_0_MAX).toBe(0.3);
    expect(LOD_ZOOM_THRESHOLDS.LOD_1_MAX).toBe(0.7);
    expect(LOD_ZOOM_THRESHOLDS.LOD_2_MAX).toBe(1.5);
    expect(LOD_ZOOM_THRESHOLDS.LOD_3_MAX).toBe(3.0);
  });
});

describe('lodToFontSize', () => {
  it('LOD-2 standard returns base size for gpzName', () => {
    expect(lodToFontSize('gpzName', 2)).toBe(24);
  });

  it('LOD-0 overview enlarges fonts', () => {
    // 24 * 1.5 = 36
    expect(lodToFontSize('gpzName', 0)).toBe(36);
    // 16 * 1.5 = 24 (bayName bumped from 14→16 per WCAG iter 13)
    expect(lodToFontSize('bayName', 0)).toBe(24);
  });

  it('LOD-1 planview enlarges fonts mildly', () => {
    // 13 * 1.2 = 15.6 → 15.5 (deviceQ bumped 12→13)
    expect(lodToFontSize('deviceQ', 1)).toBe(15.5);
  });

  it('LOD-3 technical shrinks fonts mildly', () => {
    // 12 * 0.95 = 11.4 → 11.5 (parameter bumped 11→12)
    expect(lodToFontSize('parameter', 3)).toBe(11.5);
  });

  it('LOD-4 diagnostic shrinks fonts maximally (clamped to MIN_FONT_PX=10)', () => {
    // 11 * 0.9 = 9.9 → max(9.9, 10) = 10 (badge bumped 9→11, clamp)
    expect(lodToFontSize('badge', 4)).toBe(10);
  });

  it('rounds to nearest 0.5 px', () => {
    // 10 * 1.2 = 12 (footnote bumped 8→10)
    expect(lodToFontSize('footnote', 1)).toBe(12);
    // 12 * 0.9 = 10.8 → 11 (fieldMeasurement bumped 11→12)
    expect(lodToFontSize('fieldMeasurement', 4)).toBe(11);
  });

  it('WCAG iter 13: all roles ≥ MIN_FONT_PX=10 at LOD-4 diagnostic', () => {
    const roles: TextRole[] = [
      'gpzName',
      'bayName',
      'deviceQ',
      'parameter',
      'fieldMeasurement',
      'badge',
      'footnote',
    ];
    for (const role of roles) {
      expect(lodToFontSize(role, 4)).toBeGreaterThanOrEqual(10);
    }
  });

  it('all roles supported at LOD-2', () => {
    const roles: TextRole[] = [
      'gpzName',
      'bayName',
      'deviceQ',
      'parameter',
      'fieldMeasurement',
      'badge',
      'footnote',
    ];
    for (const role of roles) {
      expect(lodToFontSize(role, 2)).toBeGreaterThan(0);
    }
  });

  it('monotonic decrease across LOD for fixed role', () => {
    // LOD-0 should be largest, LOD-4 smallest for any role
    const sizes = ([0, 1, 2, 3, 4] as LodLevel[]).map((lod) =>
      lodToFontSize('parameter', lod),
    );
    expect(sizes[0]).toBeGreaterThan(sizes[2]);
    expect(sizes[2]).toBeGreaterThan(sizes[4]);
  });

  it('deterministic: same input → identical output', () => {
    expect(lodToFontSize('gpzName', 0)).toBe(lodToFontSize('gpzName', 0));
    expect(lodToFontSize('deviceQ', 3)).toBe(lodToFontSize('deviceQ', 3));
  });
});

describe('lodToStrokeWidth', () => {
  it('LOD-2 standard returns base stroke per AC-01', () => {
    expect(lodToStrokeWidth('transmission', 2)).toBe(5);
    expect(lodToStrokeWidth('transformer', 2)).toBe(4);
    expect(lodToStrokeWidth('busbar', 2)).toBe(4);
    expect(lodToStrokeWidth('trunk', 2)).toBe(3);
    expect(lodToStrokeWidth('branch', 2)).toBe(2);
    expect(lodToStrokeWidth('detail', 2)).toBe(1.5);
  });

  it('LOD-0 overview thickens main strokes', () => {
    // 5 * 1.4 = 7.0
    expect(lodToStrokeWidth('transmission', 0)).toBe(7);
    // 1.5 * 1.4 = 2.1 → rounded to 2.0 (0.25 step)
    expect(lodToStrokeWidth('detail', 0)).toBe(2);
  });

  it('LOD-4 diagnostic thins strokes for density', () => {
    // 5 * 0.9 = 4.5
    expect(lodToStrokeWidth('transmission', 4)).toBe(4.5);
    // 2 * 0.9 = 1.8 → rounded to 1.75
    expect(lodToStrokeWidth('branch', 4)).toBe(1.75);
  });

  it('rounds to 0.25 px increments', () => {
    // 3 * 1.2 = 3.6 → 3.5 (0.25 step)
    expect(lodToStrokeWidth('trunk', 1)).toBe(3.5);
  });

  it('all stroke roles supported at all LOD levels', () => {
    const roles: StrokeRole[] = [
      'transmission',
      'transformer',
      'busbar',
      'trunk',
      'branch',
      'detail',
    ];
    const lods: LodLevel[] = [0, 1, 2, 3, 4];
    for (const role of roles) {
      for (const lod of lods) {
        expect(lodToStrokeWidth(role, lod)).toBeGreaterThan(0);
      }
    }
  });

  it('AC-01: hierarchy preserved at LOD-2 (transmission > transformer = busbar > trunk > branch > detail)', () => {
    expect(lodToStrokeWidth('transmission', 2)).toBeGreaterThan(
      lodToStrokeWidth('transformer', 2),
    );
    expect(lodToStrokeWidth('transformer', 2)).toBe(lodToStrokeWidth('busbar', 2));
    expect(lodToStrokeWidth('busbar', 2)).toBeGreaterThan(lodToStrokeWidth('trunk', 2));
    expect(lodToStrokeWidth('trunk', 2)).toBeGreaterThan(lodToStrokeWidth('branch', 2));
    expect(lodToStrokeWidth('branch', 2)).toBeGreaterThan(lodToStrokeWidth('detail', 2));
  });

  it('deterministic: same input → identical output', () => {
    expect(lodToStrokeWidth('transmission', 0)).toBe(lodToStrokeWidth('transmission', 0));
    expect(lodToStrokeWidth('branch', 4)).toBe(lodToStrokeWidth('branch', 4));
  });
});

describe('lodToSymbolScale (iter 13: bumped per ETAP min 24 px)', () => {
  // Iter 12 CAD audit ujawnił że Pole TR1 symbol ~12 px (poniżej ETAP min 24).
  // Iter 13 fix: scale bumped żeby 16 px base × scale ≥ 24 px.
  it('LOD-0 overview: 1.6x', () => {
    expect(lodToSymbolScale(0)).toBe(1.6);
  });

  it('LOD-1 planview: 1.5x', () => {
    expect(lodToSymbolScale(1)).toBe(1.5);
  });

  it('LOD-2 standard: 1.5x (gwarantuje 24 px dla bazowego 16 px)', () => {
    expect(lodToSymbolScale(2)).toBe(1.5);
  });

  it('LOD-3 technical: 1.4x', () => {
    expect(lodToSymbolScale(3)).toBe(1.4);
  });

  it('LOD-4 diagnostic: 1.3x (gęste ale ETAP min 24 px utrzymane)', () => {
    expect(lodToSymbolScale(4)).toBe(1.3);
  });

  it('monotonic non-increasing across LOD (LOD-0 ≥ ... ≥ LOD-4)', () => {
    // Iter 13: LOD-1=LOD-2=1.5 (plateau) — used to be strict monotonic, now ≥
    const scales = ([0, 1, 2, 3, 4] as LodLevel[]).map(lodToSymbolScale);
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeLessThanOrEqual(scales[i - 1]);
    }
  });

  it('all LOD scales ≥ 1.3 (gwarantuje min 20.8 px dla 16 px base, ETAP min)', () => {
    for (const lod of [0, 1, 2, 3, 4] as LodLevel[]) {
      expect(lodToSymbolScale(lod)).toBeGreaterThanOrEqual(1.3);
    }
  });

  it('deterministic: same input → identical output', () => {
    expect(lodToSymbolScale(2)).toBe(lodToSymbolScale(2));
  });
});

describe('lodToElementPadding', () => {
  it('LOD-0 overview: 20 px (more spacing)', () => {
    expect(lodToElementPadding(0)).toBe(20);
  });

  it('LOD-2 standard: 12 px', () => {
    expect(lodToElementPadding(2)).toBe(12);
  });

  it('LOD-4 diagnostic: 6 px (tight packing)', () => {
    expect(lodToElementPadding(4)).toBe(6);
  });

  it('monotonic decrease across LOD', () => {
    const paddings = ([0, 1, 2, 3, 4] as LodLevel[]).map(lodToElementPadding);
    for (let i = 1; i < paddings.length; i++) {
      expect(paddings[i]).toBeLessThan(paddings[i - 1]);
    }
  });

  it('deterministic: same input → identical output', () => {
    expect(lodToElementPadding(0)).toBe(lodToElementPadding(0));
  });
});

describe('LOD scaling cross-invariants', () => {
  it('LOD-2 is identity (multiplier 1.0) for fonts and strokes', () => {
    // At LOD-2 the multiplier is exactly 1.0 — base sizes returned.
    expect(lodToFontSize('gpzName', 2)).toBe(24);
    expect(lodToStrokeWidth('transmission', 2)).toBe(5);
  });

  it('LOD-0 enlarges all scales for distance readability', () => {
    expect(lodToFontSize('gpzName', 0)).toBeGreaterThan(lodToFontSize('gpzName', 2));
    expect(lodToStrokeWidth('transmission', 0)).toBeGreaterThan(
      lodToStrokeWidth('transmission', 2),
    );
    expect(lodToSymbolScale(0)).toBeGreaterThan(lodToSymbolScale(2));
    expect(lodToElementPadding(0)).toBeGreaterThan(lodToElementPadding(2));
  });

  it('LOD-4 compresses all scales for information density', () => {
    expect(lodToFontSize('gpzName', 4)).toBeLessThan(lodToFontSize('gpzName', 2));
    expect(lodToStrokeWidth('transmission', 4)).toBeLessThan(
      lodToStrokeWidth('transmission', 2),
    );
    expect(lodToSymbolScale(4)).toBeLessThan(lodToSymbolScale(2));
    expect(lodToElementPadding(4)).toBeLessThan(lodToElementPadding(2));
  });
});
