/**
 * SLD Theme Context — P0.7 / PLAN_SLD_REWORK F4 — Theme Provider
 *
 * STATUS: SCAFFOLDING (theme switcher integration TODO w pełnym F4)
 * Reference:
 * - docs/v12xx/REJESTR_KONFLIKTOW.md V12K-007 (dark_scada ekran vs light_technical eksport)
 * - docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md § 4 (dwa motywy)
 * - docs/sld/SLD_INDUSTRIAL_SPEC_v1.md § 6.1
 *
 * Provides ThemeMode context for renderers + exporters. Two modes:
 * - 'dark_scada': default screen palette (#101316 BG, neon accents)
 * - 'light_technical': export palette (#FFFFFF BG, dark green/red, printer-friendly)
 *
 * USAGE
 * -----
 *   import { ThemeProvider, useTheme, useThemeColors } from './themeContext';
 *
 *   <ThemeProvider mode="dark_scada">
 *     <SldCanvas />
 *   </ThemeProvider>
 *
 *   // W komponencie:
 *   const { mode, colors } = useTheme();
 *   const stroke = colors.linePrimary;
 *
 * EXPORT MODE
 * -----------
 * Eksporter MUSI zawsze używać 'light_technical' (V12K-007 binding):
 *   <ThemeProvider mode="light_technical">
 *     <SldCanvasForExport />
 *   </ThemeProvider>
 *
 * INVARIANTS
 * ----------
 * - Default mode = 'dark_scada' (ekran)
 * - Mode change via CSS variables (instant, no re-render flicker)
 * - Eksport zawsze light_technical (egzekwowane w exportSvg.ts / exportPdf.ts)
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import {
  LIGHT_TECHNICAL_COLORS,
  SLD_V2_COLORS,
  type ThemeMode,
} from './tokens';

/**
 * Theme context value — paletka + mode identifier.
 * Renderery konsumują przez `useTheme()` zamiast bezpośrednio importować SLD_V2_COLORS.
 */
export interface SldThemeContextValue {
  mode: ThemeMode;
  /** Aktywna paletka (struktura tożsama dla obu motywów). */
  colors: typeof SLD_V2_COLORS | typeof LIGHT_TECHNICAL_COLORS;
  /** Helper: czy paletka eksportowa (light_technical)? */
  isExportTheme: boolean;
}

const SldThemeContext = createContext<SldThemeContextValue | null>(null);

/**
 * Resolve palette object for a given mode.
 *
 * Used by both Provider and direct consumers (export pipelines).
 */
export function getThemeColors(mode: ThemeMode): SldThemeContextValue['colors'] {
  return mode === 'light_technical' ? LIGHT_TECHNICAL_COLORS : SLD_V2_COLORS;
}

interface SldThemeProviderProps {
  mode?: ThemeMode;
  children: ReactNode;
}

/**
 * ThemeProvider — opakowuje renderery SLD w wybrany motyw.
 *
 * Default mode = 'dark_scada' (ekran operatora). Eksporter MUSI explicit
 * podać mode='light_technical' (V12K-007).
 */
export function SldThemeProvider({
  mode = 'dark_scada',
  children,
}: SldThemeProviderProps): JSX.Element {
  const value = useMemo<SldThemeContextValue>(
    () => ({
      mode,
      colors: getThemeColors(mode),
      isExportTheme: mode === 'light_technical',
    }),
    [mode],
  );

  return (
    <SldThemeContext.Provider value={value}>{children}</SldThemeContext.Provider>
  );
}

/**
 * useTheme — hook dla rendererów do konsumpcji motywu.
 *
 * Throws gdy używany poza ThemeProvider (fail-fast — wymusza
 * jawne owinięcie SLD canvas providerem zamiast cichego fallbacku
 * na dark_scada, który mógłby ucichotni problem z eksportem).
 */
export function useTheme(): SldThemeContextValue {
  const ctx = useContext(SldThemeContext);
  if (ctx === null) {
    throw new Error(
      'useTheme: must be called inside <SldThemeProvider>. ' +
        'Wrap your SLD canvas (or expose explicit mode for export pipelines).',
    );
  }
  return ctx;
}

/**
 * useThemeColors — convenience hook gdy renderer potrzebuje tylko palety.
 */
export function useThemeColors(): SldThemeContextValue['colors'] {
  return useTheme().colors;
}

/**
 * useThemeMode — convenience hook gdy renderer potrzebuje tylko mode (np.
 * do warunkowego pokazywania/ukrywania interaktywnych elementów w eksporcie).
 */
export function useThemeMode(): ThemeMode {
  return useTheme().mode;
}
