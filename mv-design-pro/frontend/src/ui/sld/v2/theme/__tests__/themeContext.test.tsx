/**
 * ThemeContext tests — P0.7 / V12K-007.
 *
 * Verifies:
 * - Default mode = 'dark_scada' (ekran)
 * - mode='light_technical' switches palette
 * - useTheme outside Provider throws (fail-fast)
 * - getThemeColors() helper consistent z Provider
 * - V12K-007 invariant: BG distinct między motywami
 */

import { render, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  SldThemeProvider,
  getThemeColors,
  useTheme,
  useThemeColors,
  useThemeMode,
} from '../themeContext';
import { LIGHT_TECHNICAL_COLORS, SLD_V2_COLORS } from '../tokens';

function wrapperFactory(mode?: 'dark_scada' | 'light_technical') {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <SldThemeProvider mode={mode}>{children}</SldThemeProvider>;
  };
}

describe('SldThemeProvider — V12K-007', () => {
  it('defaults to dark_scada mode (ekran operatora)', () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: wrapperFactory(),
    });
    expect(result.current.mode).toBe('dark_scada');
    expect(result.current.isExportTheme).toBe(false);
  });

  it('switches to light_technical when mode prop is set', () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: wrapperFactory('light_technical'),
    });
    expect(result.current.mode).toBe('light_technical');
    expect(result.current.isExportTheme).toBe(true);
  });

  it('dark_scada palette has neon bg (#101316)', () => {
    const { result } = renderHook(() => useThemeColors(), {
      wrapper: wrapperFactory('dark_scada'),
    });
    expect(result.current.bg).toBe(SLD_V2_COLORS.bg);
  });

  it('light_technical palette has white bg (#FFFFFF) per V12K-007', () => {
    const { result } = renderHook(() => useThemeColors(), {
      wrapper: wrapperFactory('light_technical'),
    });
    expect(result.current.bg).toBe(LIGHT_TECHNICAL_COLORS.bg);
    expect(result.current.bg).toBe('#FFFFFF');
  });

  it('useThemeMode returns just the mode string', () => {
    const { result } = renderHook(() => useThemeMode(), {
      wrapper: wrapperFactory('light_technical'),
    });
    expect(result.current).toBe('light_technical');
  });
});

describe('useTheme — fail-fast outside Provider', () => {
  it('throws when called without ThemeProvider wrapper', () => {
    // Silence React error boundary console noise for this test
    const originalError = console.error;
    console.error = () => {};
    try {
      expect(() => renderHook(() => useTheme())).toThrow(
        /must be called inside <SldThemeProvider>/,
      );
    } finally {
      console.error = originalError;
    }
  });
});

describe('getThemeColors — helper for export pipelines', () => {
  it('returns dark_scada palette for dark_scada mode', () => {
    expect(getThemeColors('dark_scada')).toBe(SLD_V2_COLORS);
  });

  it('returns light_technical palette for light_technical mode', () => {
    expect(getThemeColors('light_technical')).toBe(LIGHT_TECHNICAL_COLORS);
  });

  it('palettes are distinct objects (V12K-007 separation)', () => {
    expect(getThemeColors('dark_scada')).not.toBe(getThemeColors('light_technical'));
  });
});

describe('Provider renders children', () => {
  it('passes children through', () => {
    const { container } = render(
      <SldThemeProvider mode="light_technical">
        <div data-testid="child">hello</div>
      </SldThemeProvider>,
    );
    expect(container.querySelector('[data-testid="child"]')?.textContent).toBe(
      'hello',
    );
  });
});
