import { describe, expect, it } from 'vitest';

import {
  CANONICAL_SCREEN_CODES,
  SCREEN_CANON_REGISTRY,
  getScreenDefinition,
} from '../screenCanonRegistry';

describe('screenCanonRegistry', () => {
  it('defines the full E-00..E-50 canon (minus E-39, retired card K2) in one registry with V12.6 academic screens', () => {
    // E-39 ("Walidacja sieci referencyjnych" / ReferenceNetworkSurface) skasowane
    // karta K2 (2026-09-09) — druga ścieżka fizyki, zero konsumentów poza sobą.
    // Luka w numeracji celowa (nie renumerujemy E-40..E-50, są zajęte) — patrz
    // komentarz przy `CanonScreenId` w screenCanonRegistry.ts.
    const oczekiwane = Array.from({ length: 51 }, (_, index) => `E-${String(index).padStart(2, '0')}`).filter(
      (code) => code !== 'E-39',
    );
    expect(CANONICAL_SCREEN_CODES).toHaveLength(50);
    expect(CANONICAL_SCREEN_CODES).toEqual(oczekiwane);
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
