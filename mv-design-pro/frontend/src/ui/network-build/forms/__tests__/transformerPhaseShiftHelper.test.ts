import { describe, expect, it } from 'vitest';
import {
  parseVectorGroup,
  getCommonVectorGroups,
  checkParallelCompatibility,
} from '../transformerPhaseShiftHelper';

describe('parseVectorGroup', () => {
  it('Dyn11 → 330°', () => {
    const r = parseVectorGroup('Dyn11');
    expect(r?.phaseShiftClock).toBe(11);
    expect(r?.phaseShiftDegrees).toBe(330);
    expect(r?.description).toContain('zalecane');
  });

  it('Dyn5 → 150°', () => {
    const r = parseVectorGroup('Dyn5');
    expect(r?.phaseShiftDegrees).toBe(150);
  });

  it('YNyn0 → 0°', () => {
    const r = parseVectorGroup('YNyn0');
    expect(r?.phaseShiftDegrees).toBe(0);
  });

  it('YNd1 → 30°', () => {
    const r = parseVectorGroup('YNd1');
    expect(r?.phaseShiftDegrees).toBe(30);
  });

  it('niepoprawny format → null', () => {
    expect(parseVectorGroup('invalid')).toBe(null);
    expect(parseVectorGroup('Dy99')).toBe(null);
  });
});

describe('getCommonVectorGroups', () => {
  it('zawiera typowe grupy', () => {
    const groups = getCommonVectorGroups();
    expect(groups).toContain('Dyn11');
    expect(groups).toContain('YNyn0');
    expect(groups).toContain('Yzn11');
  });
});

describe('checkParallelCompatibility', () => {
  it('te same vector group + napięcia → compatible', () => {
    const r = checkParallelCompatibility('Dyn11', 'Dyn11', 15, 15, 0.4, 0.4, 6, 6);
    expect(r.isCompatible).toBe(true);
  });

  it('różne vector groups → incompatible', () => {
    const r = checkParallelCompatibility('Dyn5', 'Dyn11');
    expect(r.isCompatible).toBe(false);
    expect(r.issues[0]).toContain('przesunięcia');
  });

  it('różne napięcia HV >0.5% → issue', () => {
    const r = checkParallelCompatibility('Dyn11', 'Dyn11', 15, 16);
    expect(r.isCompatible).toBe(false);
    expect(r.issues[0]).toContain('HV');
  });

  it('różne Zsc >10% → issue', () => {
    const r = checkParallelCompatibility('Dyn11', 'Dyn11', 15, 15, 0.4, 0.4, 6, 8);
    expect(r.isCompatible).toBe(false);
    expect(r.issues[0]).toContain('Zsc');
  });

  it('niepoprawny vg → invalid', () => {
    const r = checkParallelCompatibility('invalid', 'Dyn11');
    expect(r.isCompatible).toBe(false);
  });
});
