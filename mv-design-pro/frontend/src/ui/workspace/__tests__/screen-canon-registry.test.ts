import { describe, expect, it } from 'vitest';

import {
  CANONICAL_SCREEN_CODES,
  SCREEN_CANON_REGISTRY,
  getScreenDefinition,
} from '../screenCanonRegistry';

describe('screenCanonRegistry', () => {
  it('defines the full E-00..E-39 canon in one registry (E-39 reactivated as Reference Network Validation)', () => {
    expect(CANONICAL_SCREEN_CODES).toHaveLength(40);
    expect(CANONICAL_SCREEN_CODES).toEqual(
      Array.from({ length: 40 }, (_, index) => `E-${String(index).padStart(2, '0')}`),
    );
  });

  it('keeps every screen implemented with canonical metadata', () => {
    for (const screenId of CANONICAL_SCREEN_CODES) {
      const definition = getScreenDefinition(screenId);
      expect(definition).toBe(SCREEN_CANON_REGISTRY[screenId]);
      expect(definition.id).toBe(screenId);
      expect(definition.code).toBe(screenId);
      expect(definition.labelFull).toMatch(/\S/);
      expect(definition.labelShort).toMatch(/\S/);
      expect(definition.areaId).toMatch(/\S/);
      expect(definition.icon).toMatch(/^ikona-/);
      expect(definition.canonicalRoute).toMatch(/^\/workspace\//);
      expect(definition.testId).toContain(screenId);
      expect(definition.implemented).toBe(true);
    }
  });
});
