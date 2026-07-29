import { describe, expect, it } from 'vitest';

import type { TapChanger } from '../../../../../types/enm';
import { buildOltcAnnotation, formatTapPositionLabel } from '../oltcGlyph';

function tap(overrides: Partial<TapChanger>): TapChanger {
  return {
    regulation_type: 'OLTC',
    regulated_winding: 'HV',
    neutral_position: 0,
    current_position: 0,
    min_position: -8,
    max_position: 8,
    step_percent: 1.5,
    control_mode: 'AUTOMATIC',
    voltage_setpoint_kv: 15.5,
    deadband_kv: 0.3,
    ...overrides,
  };
}

describe('formatTapPositionLabel', () => {
  it('formatuje pozycję ze znakiem (minus typograficzny)', () => {
    expect(formatTapPositionLabel(0)).toBe('poz. 0');
    expect(formatTapPositionLabel(3)).toBe('poz. +3');
    expect(formatTapPositionLabel(-4)).toBe('poz. −4');
  });
});

describe('buildOltcAnnotation', () => {
  it('zwraca null dla braku regulacji', () => {
    expect(buildOltcAnnotation(null)).toBeNull();
    expect(buildOltcAnnotation(undefined)).toBeNull();
    expect(buildOltcAnnotation(tap({ regulation_type: 'NONE' }))).toBeNull();
  });

  it('mapuje OLTC automatyczny z U_zad', () => {
    const a = buildOltcAnnotation(tap({ regulation_type: 'OLTC', current_position: 3 }));
    expect(a).toEqual({
      kind: 'OLTC',
      positionLabel: 'poz. +3',
      modeLabel: 'AUTO',
      setpointLabel: 'U_zad 15.5 kV',
    });
  });

  it('tryb MANUAL → MAN, bez U_zad', () => {
    const a = buildOltcAnnotation(tap({ control_mode: 'MANUAL', current_position: -2 }));
    expect(a?.modeLabel).toBe('MAN');
    expect(a?.setpointLabel).toBeUndefined();
    expect(a?.positionLabel).toBe('poz. −2');
  });

  it('PROFILE/REMOTE traktowane jako AUTO', () => {
    expect(buildOltcAnnotation(tap({ control_mode: 'PROFILE' }))?.modeLabel).toBe('AUTO');
    expect(buildOltcAnnotation(tap({ control_mode: 'REMOTE' }))?.modeLabel).toBe('AUTO');
  });

  it('DETC bez U_zad nawet gdy setpoint podany (tylko AUTO pokazuje U_zad)', () => {
    const a = buildOltcAnnotation(tap({ regulation_type: 'DETC', control_mode: 'MANUAL' }));
    expect(a?.kind).toBe('DETC');
    expect(a?.setpointLabel).toBeUndefined();
  });

  it('AUTO bez dodatniego setpointu → brak U_zad (bez fabrykacji)', () => {
    expect(buildOltcAnnotation(tap({ voltage_setpoint_kv: null }))?.setpointLabel).toBeUndefined();
    expect(buildOltcAnnotation(tap({ voltage_setpoint_kv: 0 }))?.setpointLabel).toBeUndefined();
  });

  it('jest deterministyczny', () => {
    const t = tap({ current_position: 5 });
    expect(buildOltcAnnotation(t)).toEqual(buildOltcAnnotation(t));
  });
});
