import { describe, expect, it } from 'vitest';

import { overlayProjection } from './fixtures';

describe('SldOverlayProjection baseViewHash', () => {
  it('rebuilds overlay identity when base view changes', () => {
    const overlay = overlayProjection();
    expect(overlay.baseViewHash).toBe('view-1');
    expect(overlayProjection({ baseViewHash: 'view-2' }).overlayHash).not.toBe(overlay.overlayHash);
  });
});
