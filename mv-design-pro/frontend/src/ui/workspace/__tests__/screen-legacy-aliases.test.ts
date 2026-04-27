import { describe, expect, it } from 'vitest';

import {
  CANONICAL_SCREEN_CODES,
  getScreenDefinition,
  resolveLegacyScreenAlias,
  resolveScreenByRoute,
} from '../screenCanonRegistry';

describe('screen legacy aliases', () => {
  it('keeps old E-10..E-34 meanings only as explicit legacy aliases', () => {
    expect(resolveLegacyScreenAlias('old:E-10')?.id).toBe('E-10');
    expect(resolveLegacyScreenAlias('old:E-11')?.id).toBe('E-12');
    expect(resolveLegacyScreenAlias('old:E-14')?.id).toBe('E-11');
    expect(resolveLegacyScreenAlias('old:E-24')?.id).toBe('E-24');
    expect(resolveLegacyScreenAlias('old:E-26')?.id).toBe('E-38');
    expect(resolveLegacyScreenAlias('old:E-27')?.id).toBe('E-37');
    expect(resolveLegacyScreenAlias('old:E-34')?.id).toBe('E-30');
  });

  it('resolves canonical routes without scattered route maps', () => {
    for (const screenId of CANONICAL_SCREEN_CODES) {
      const route = resolveScreenByRoute(getScreenDefinition(screenId).canonicalRoute);
      expect(route?.id).toBe(screenId);
    }
    expect(resolveScreenByRoute('/workspace/reports')?.id).toBe('E-37');
  });
});
