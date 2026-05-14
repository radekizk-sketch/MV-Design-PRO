/**
 * labelPositioning tests — P0.6 F3 foundation pure functions.
 */

import { describe, expect, it } from 'vitest';

import type { LodLevel } from '../LodPolicy';
import {
  boxesOverlap,
  compactLabelText,
  computeLabelVisibility,
  resolveCollidingLabels,
  type LabelBox,
} from '../labelPositioning';

const LOD_0: LodLevel = 0;
const LOD_1: LodLevel = 1;
const LOD_2: LodLevel = 2;
const LOD_3: LodLevel = 3;
const LOD_4: LodLevel = 4;

describe('computeLabelVisibility — LOD thresholds', () => {
  it('critical visible at all LODs (0-4)', () => {
    for (const lod of [LOD_0, LOD_1, LOD_2, LOD_3, LOD_4]) {
      expect(computeLabelVisibility('critical', lod)).toBe(true);
    }
  });

  it('primary visible from LOD-1', () => {
    expect(computeLabelVisibility('primary', LOD_0)).toBe(false);
    expect(computeLabelVisibility('primary', LOD_1)).toBe(true);
    expect(computeLabelVisibility('primary', LOD_4)).toBe(true);
  });

  it('secondary visible from LOD-2', () => {
    expect(computeLabelVisibility('secondary', LOD_0)).toBe(false);
    expect(computeLabelVisibility('secondary', LOD_1)).toBe(false);
    expect(computeLabelVisibility('secondary', LOD_2)).toBe(true);
    expect(computeLabelVisibility('secondary', LOD_4)).toBe(true);
  });

  it('tertiary visible from LOD-3', () => {
    expect(computeLabelVisibility('tertiary', LOD_2)).toBe(false);
    expect(computeLabelVisibility('tertiary', LOD_3)).toBe(true);
  });

  it('diagnostic only at LOD-4', () => {
    expect(computeLabelVisibility('diagnostic', LOD_3)).toBe(false);
    expect(computeLabelVisibility('diagnostic', LOD_4)).toBe(true);
  });
});

describe('boxesOverlap — bounding-box collision', () => {
  it('non-overlapping far-apart returns false', () => {
    expect(
      boxesOverlap(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 100, y: 100, width: 10, height: 10 },
      ),
    ).toBe(false);
  });

  it('exact same box overlaps', () => {
    expect(
      boxesOverlap(
        { x: 50, y: 50, width: 20, height: 20 },
        { x: 50, y: 50, width: 20, height: 20 },
      ),
    ).toBe(true);
  });

  it('adjacent boxes (just touching) overlap with default padding', () => {
    // Box A: 0-10 x 0-10
    // Box B: 11-21 x 0-10 (1 px gap)
    // Default padding=2 → overlap
    expect(
      boxesOverlap(
        { x: 5, y: 5, width: 10, height: 10 },
        { x: 16, y: 5, width: 10, height: 10 },
      ),
    ).toBe(true);
  });

  it('boxes 5px apart with padding=0 do not overlap', () => {
    expect(
      boxesOverlap(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 0, width: 10, height: 10 },
        0,
      ),
    ).toBe(false);
  });
});

describe('resolveCollidingLabels — greedy nudge', () => {
  it('no labels → empty array', () => {
    expect(resolveCollidingLabels([], LOD_2)).toEqual([]);
  });

  it('non-overlapping labels keep their anchor positions', () => {
    const labels: LabelBox[] = [
      { id: 'a', anchorX: 10, anchorY: 10, width: 20, height: 10, importance: 'critical' },
      { id: 'b', anchorX: 100, anchorY: 10, width: 20, height: 10, importance: 'primary' },
    ];
    const result = resolveCollidingLabels(labels, LOD_2);
    expect(result[0].resolvedX).toBe(10);
    expect(result[0].resolvedY).toBe(10);
    expect(result[1].resolvedX).toBe(100);
    expect(result[1].resolvedY).toBe(10);
  });

  it('returns labels in INPUT order', () => {
    const labels: LabelBox[] = [
      { id: 'a', anchorX: 0, anchorY: 0, width: 10, height: 10, importance: 'critical' },
      { id: 'b', anchorX: 50, anchorY: 50, width: 10, height: 10, importance: 'primary' },
      { id: 'c', anchorX: 100, anchorY: 100, width: 10, height: 10, importance: 'secondary' },
    ];
    const result = resolveCollidingLabels(labels, LOD_2);
    expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('overlapping labels — lower importance nudged away', () => {
    const labels: LabelBox[] = [
      // critical stays put
      { id: 'crit', anchorX: 50, anchorY: 50, width: 30, height: 20, importance: 'critical' },
      // secondary at exact same spot — nudged
      { id: 'sec', anchorX: 50, anchorY: 50, width: 30, height: 20, importance: 'secondary' },
    ];
    const result = resolveCollidingLabels(labels, LOD_2);
    const crit = result.find((r) => r.id === 'crit')!;
    const sec = result.find((r) => r.id === 'sec')!;
    expect(crit.resolvedX).toBe(50);
    expect(crit.resolvedY).toBe(50);
    // Secondary moved
    expect(sec.resolvedY).not.toBe(50);
  });

  it('label not visible (below LOD threshold) — placed at anchor without nudging', () => {
    const labels: LabelBox[] = [
      { id: 'tert', anchorX: 50, anchorY: 50, width: 20, height: 10, importance: 'tertiary' },
    ];
    // LOD-1: tertiary invisible
    const result = resolveCollidingLabels(labels, LOD_1);
    expect(result[0].visible).toBe(false);
    expect(result[0].resolvedX).toBe(50);
    expect(result[0].resolvedY).toBe(50);
  });

  it('determinizm — same input → identical output', () => {
    const labels: LabelBox[] = [
      { id: 'a', anchorX: 0, anchorY: 0, width: 10, height: 10, importance: 'primary' },
      { id: 'b', anchorX: 5, anchorY: 0, width: 10, height: 10, importance: 'secondary' },
    ];
    const r1 = resolveCollidingLabels(labels, LOD_2);
    const r2 = resolveCollidingLabels(labels, LOD_2);
    expect(r1).toEqual(r2);
  });

  it('visibility flag correctly set per LOD', () => {
    const labels: LabelBox[] = [
      { id: 'crit', anchorX: 0, anchorY: 0, width: 10, height: 10, importance: 'critical' },
      { id: 'prim', anchorX: 50, anchorY: 0, width: 10, height: 10, importance: 'primary' },
      { id: 'diag', anchorX: 100, anchorY: 0, width: 10, height: 10, importance: 'diagnostic' },
    ];
    const result = resolveCollidingLabels(labels, LOD_1);
    expect(result.find((r) => r.id === 'crit')!.visible).toBe(true);
    expect(result.find((r) => r.id === 'prim')!.visible).toBe(true); // LOD-1+
    expect(result.find((r) => r.id === 'diag')!.visible).toBe(false); // diag only LOD-4
  });

  it('respects custom nudgeStepPx + maxIterations', () => {
    const labels: LabelBox[] = [
      { id: 'a', anchorX: 50, anchorY: 50, width: 30, height: 20, importance: 'critical' },
      { id: 'b', anchorX: 50, anchorY: 50, width: 30, height: 20, importance: 'primary' },
    ];
    const result = resolveCollidingLabels(labels, LOD_2, {
      nudgeStepPx: 20,
      maxIterations: 5,
    });
    const second = result.find((r) => r.id === 'b')!;
    expect(second.resolvedY).not.toBe(50);
  });
});

describe('compactLabelText — LOD-aware abbreviation', () => {
  it('LOD-0: first token only', () => {
    expect(compactLabelText('Q01 51-NN', LOD_0)).toBe('Q01');
  });

  it('LOD-1: first 2 tokens', () => {
    expect(compactLabelText('Q01 51-NN', LOD_1)).toBe('Q01 51-NN');
    expect(compactLabelText('TR1 25 MVA 110/15 kV Dyn11', LOD_1)).toBe('TR1 25');
  });

  it('LOD-2+: full text', () => {
    expect(compactLabelText('Q01 51-NN', LOD_2)).toBe('Q01 51-NN');
    expect(compactLabelText('TR1 25 MVA 110/15 kV Dyn11', LOD_3)).toBe(
      'TR1 25 MVA 110/15 kV Dyn11',
    );
  });

  it('empty string returns empty', () => {
    expect(compactLabelText('', LOD_0)).toBe('');
    expect(compactLabelText('', LOD_2)).toBe('');
  });

  it('handles single token', () => {
    expect(compactLabelText('GPZ', LOD_0)).toBe('GPZ');
    expect(compactLabelText('GPZ', LOD_2)).toBe('GPZ');
  });

  it('handles multiple whitespaces', () => {
    expect(compactLabelText('  Q01    51-NN  ', LOD_0)).toBe('Q01');
    expect(compactLabelText('Q01\t51-NN', LOD_1)).toBe('Q01 51-NN');
  });
});
