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
    // 14 * 1.5 = 21
    expect(lodToFontSize('bayName', 0)).toBe(21);
  });

  it('LOD-1 planview enlarges fonts mildly', () => {
    // 12 * 1.2 = 14.4 → rounded to 14.5
    expect(lodToFontSize('deviceQ', 1)).toBe(14.5);
  });

  it('LOD-3 technical shrinks fonts mildly', () => {
    // 11 * 0.95 = 10.45 → rounded to 10.5
    expect(lodToFontSize('parameter', 3)).toBe(10.5);
  });

  it('LOD-4 diagnostic shrinks fonts maximally', () => {
    // 9 * 0.9 = 8.1 → rounded to 8.0
    expect(lodToFontSize('badge', 4)).toBe(8);
  });

  it('rounds to nearest 0.5 px', () => {
    // 8 * 1.2 = 9.6 → 9.5
    expect(lodToFontSize('footnote', 1)).toBe(9.5);
    // 11 * 0.9 = 9.9 → 10.0
    expect(lodToFontSize('fieldMeasurement', 4)).toBe(10);
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

describe('lodToSymbolScale', () => {
  it('LOD-0 overview: 1.2x', () => {
    expect(lodToSymbolScale(0)).toBe(1.2);
  });

  it('LOD-1 planview: 1.1x', () => {
    expect(lodToSymbolScale(1)).toBe(1.1);
  });

  it('LOD-2 standard: 1.0x (no scaling)', () => {
    expect(lodToSymbolScale(2)).toBe(1.0);
  });

  it('LOD-3 technical: 0.95x', () => {
    expect(lodToSymbolScale(3)).toBe(0.95);
  });

  it('LOD-4 diagnostic: 0.9x', () => {
    expect(lodToSymbolScale(4)).toBe(0.9);
  });

  it('monotonic decrease across LOD', () => {
    const scales = ([0, 1, 2, 3, 4] as LodLevel[]).map(lodToSymbolScale);
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeLessThan(scales[i - 1]);
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
