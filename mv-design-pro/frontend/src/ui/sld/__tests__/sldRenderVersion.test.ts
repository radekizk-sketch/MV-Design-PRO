/**
 * F8a — testy `sldRenderVersion.ts` (rozstrzygnięcie wersji renderu SLD:
 * localStorage override > `featureFlags.USE_SLD_CANVAS_V3`).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../config/featureFlags', () => ({
  featureFlags: { USE_SLD_CANVAS_V3: true },
}));

import { resolveSldRenderVersion, SLD_RENDER_VERSION_STORAGE_KEY } from '../sldRenderVersion';
import { featureFlags } from '../../config/featureFlags';

function fakeStorage(value: string | null): Pick<Storage, 'getItem'> {
  return { getItem: (key: string) => (key === SLD_RENDER_VERSION_STORAGE_KEY ? value : null) };
}

describe('resolveSldRenderVersion', () => {
  beforeEach(() => {
    (featureFlags as { USE_SLD_CANVAS_V3: boolean }).USE_SLD_CANVAS_V3 = true;
  });

  it('brak override w storage: zwraca v3, gdy featureFlags.USE_SLD_CANVAS_V3=true (domyślny cutover)', () => {
    expect(resolveSldRenderVersion(fakeStorage(null))).toBe('v3');
  });

  it('brak override w storage: zwraca v2, gdy featureFlags.USE_SLD_CANVAS_V3=false', () => {
    (featureFlags as { USE_SLD_CANVAS_V3: boolean }).USE_SLD_CANVAS_V3 = false;
    expect(resolveSldRenderVersion(fakeStorage(null))).toBe('v2');
  });

  it('override "v2" w storage WYGRYWA nad featureFlags=true (fallback bez rebuildu)', () => {
    expect(resolveSldRenderVersion(fakeStorage('v2'))).toBe('v2');
  });

  it('override "v3" w storage WYGRYWA nad featureFlags=false', () => {
    (featureFlags as { USE_SLD_CANVAS_V3: boolean }).USE_SLD_CANVAS_V3 = false;
    expect(resolveSldRenderVersion(fakeStorage('v3'))).toBe('v3');
  });

  it('nieprawidłowa wartość w storage jest ignorowana (fallback na featureFlags)', () => {
    expect(resolveSldRenderVersion(fakeStorage('bogus'))).toBe('v3');
  });

  it('brak storage (undefined, np. SSR) nie rzuca — fallback na featureFlags', () => {
    expect(resolveSldRenderVersion(undefined)).toBe('v3');
  });
});
