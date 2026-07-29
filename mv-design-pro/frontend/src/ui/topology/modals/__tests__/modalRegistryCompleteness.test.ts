import { describe, expect, it } from 'vitest';
import {
  OPERATION_SURFACE_REGISTRY,
  getOperationSurfaceByOp,
  getUnimplementedOperationSurfaces,
} from '../operationSurfaceRegistry';

describe('Operation surface registry', () => {
  it('has only implemented entries', () => {
    expect(getUnimplementedOperationSurfaces()).toEqual([]);
  });

  it('covers the active canonical operation set', () => {
    expect(OPERATION_SURFACE_REGISTRY.length).toBeGreaterThanOrEqual(20);
  });

  it('uses Polish labels', () => {
    const englishOnlyPatterns = /^(Add|Insert|Remove|Delete|Run|Edit|Open|Close|Create) /;
    for (const entry of OPERATION_SURFACE_REGISTRY) {
      expect(entry.labelPl).toBeTruthy();
      expect(entry.labelPl).not.toMatch(englishOnlyPatterns);
    }
  });

  it('uses snake_case canonical operations', () => {
    for (const entry of OPERATION_SURFACE_REGISTRY) {
      expect(entry.canonicalOp).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('has unique canonical operations', () => {
    const ops = OPERATION_SURFACE_REGISTRY.map((entry) => entry.canonicalOp);
    expect(new Set(ops).size).toBe(ops.length);
  });

  it('has component names in PascalCase', () => {
    for (const entry of OPERATION_SURFACE_REGISTRY) {
      expect(entry.componentName).toMatch(/^[A-Z]/);
    }
  });

  it('finds known entries by canonical op', () => {
    expect(getOperationSurfaceByOp('insert_section_switch_sn')?.componentName).toBe(
      'KreatorLacznikaSekcyjnego',
    );
    expect(getOperationSurfaceByOp('set_normal_open_point')?.componentName).toBe(
      'KreatorPierscienia',
    );
    expect(getOperationSurfaceByOp('add_sn_bay')?.componentName).toBe(
      'KreatorPolaSn',
    );
  });

  it('returns undefined for unknown operation', () => {
    expect(getOperationSurfaceByOp('nonexistent_operation')).toBeUndefined();
  });
});
