/**
 * LOD spine visibility — testy widoczności nowych element kinds spine_*.
 *
 * - spine_axis: widoczny od LOD 0 (overview) — szkielet topologii zawsze.
 * - spine_node: widoczny od LOD 0.
 * - spine_branch: widoczny od LOD 1 (medium) — odgałęzienia ukryte w overview.
 *
 * Plus mapping LodLabel produktowy.
 */
import { describe, expect, it } from 'vitest';
import { isVisibleAtLod, lodLabel, type LodLevel } from '../LodPolicy';

describe('LOD spine visibility', () => {
  it('spine_axis widoczny od LOD 0 (overview)', () => {
    for (const lod of [0, 1, 2, 3, 4] as LodLevel[]) {
      expect(isVisibleAtLod('spine_axis', lod)).toBe(true);
    }
  });

  it('spine_node widoczny od LOD 0', () => {
    for (const lod of [0, 1, 2, 3, 4] as LodLevel[]) {
      expect(isVisibleAtLod('spine_node', lod)).toBe(true);
    }
  });

  it('spine_branch ukryty w LOD 0 (overview), widoczny od LOD 1', () => {
    expect(isVisibleAtLod('spine_branch', 0)).toBe(false);
    for (const lod of [1, 2, 3, 4] as LodLevel[]) {
      expect(isVisibleAtLod('spine_branch', lod)).toBe(true);
    }
  });
});

describe('LOD label mapping', () => {
  it('LOD 0 → overview', () => {
    expect(lodLabel(0)).toBe('overview');
  });

  it('LOD 1 i 2 → medium', () => {
    expect(lodLabel(1)).toBe('medium');
    expect(lodLabel(2)).toBe('medium');
  });

  it('LOD 3 → detail', () => {
    expect(lodLabel(3)).toBe('detail');
  });

  it('LOD 4 → zoom-in', () => {
    expect(lodLabel(4)).toBe('zoom-in');
  });
});
