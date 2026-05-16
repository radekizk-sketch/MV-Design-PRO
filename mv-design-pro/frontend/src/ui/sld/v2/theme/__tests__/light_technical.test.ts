/**
 * Light Technical Theme tokens — P0.7 partial (V12K-007).
 *
 * Reference: docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md § 4
 *            docs/sld/SLD_INDUSTRIAL_SPEC_v1.md § 6.1
 *            docs/v12xx/REJESTR_KONFLIKTOW.md V12K-007
 *
 * Verifies that light_technical palette tokens are parity z dark_scada
 * tokens (jakość kontraktowa motywów eksportu).
 */

import { describe, expect, it } from 'vitest';

import {
  LIGHT_TECHNICAL_COLORS,
  LIGHT_TECHNICAL_COLOR_BG,
  LIGHT_TECHNICAL_COLOR_DEVICE_CLOSED,
  LIGHT_TECHNICAL_COLOR_DEVICE_OPEN,
  LIGHT_TECHNICAL_COLOR_LINE_PRIMARY,
  LIGHT_TECHNICAL_COLOR_TEXT_PRIMARY,
  SLD_V2_COLORS,
  type ThemeMode,
} from '../tokens';

describe('Light Technical Theme — V12K-007 eksport tokens', () => {
  it('uses white background (printable, toner-friendly)', () => {
    expect(LIGHT_TECHNICAL_COLOR_BG).toBe('#FFFFFF');
  });

  it('uses black primary line (high contrast on white)', () => {
    expect(LIGHT_TECHNICAL_COLOR_LINE_PRIMARY).toBe('#000000');
  });

  it('uses black primary text', () => {
    expect(LIGHT_TECHNICAL_COLOR_TEXT_PRIMARY).toBe('#000000');
  });

  it('uses darker device-closed (dark green for readability on white)', () => {
    // dark_scada: #07983A — too saturated for print
    // light_technical: darker variant
    expect(LIGHT_TECHNICAL_COLOR_DEVICE_CLOSED).toBe('#007A3D');
  });

  it('uses darker device-open (dark red for readability on white)', () => {
    expect(LIGHT_TECHNICAL_COLOR_DEVICE_OPEN).toBe('#B71C1C');
  });

  it('LIGHT_TECHNICAL_COLORS object exposes all parity tokens', () => {
    // Each dark_scada key MUST have light_technical counterpart
    const darkKeys = Object.keys(SLD_V2_COLORS) as Array<keyof typeof SLD_V2_COLORS>;
    const lightKeys = Object.keys(LIGHT_TECHNICAL_COLORS) as Array<
      keyof typeof LIGHT_TECHNICAL_COLORS
    >;

    // The light theme may be a subset (no SCADA-specific badges yet),
    // but the core SLD palette MUST be in parity.
    const requiredKeys = [
      'bg',
      'linePrimary',
      'deviceClosed',
      'deviceOpen',
      'textPrimary',
    ] as const;
    for (const key of requiredKeys) {
      expect(darkKeys).toContain(key);
      expect(lightKeys).toContain(key);
    }
  });

  it('ThemeMode literal type accepts only known modes', () => {
    // Sanity check that the type guard compiles
    const valid: ThemeMode[] = ['dark_scada', 'light_technical'];
    expect(valid).toEqual(['dark_scada', 'light_technical']);
  });

  it('dark vs light bg are distinct (no accidental palette collision)', () => {
    expect(SLD_V2_COLORS.bg).not.toBe(LIGHT_TECHNICAL_COLORS.bg);
  });
});
