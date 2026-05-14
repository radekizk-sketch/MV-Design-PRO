/**
 * SldLodContext — React Context dla LOD propagacji do rendererów.
 *
 * Per P0.6 LOD refactor + renderer wiring (iter 23 follow-up):
 * Zamiast każdy renderer hardcoded fontSize/scale, używają LOD z context
 * + lodToFontSize/lodToSymbolScale/lodToStrokeWidth z lodScaling.ts.
 *
 * INVARIANTS:
 * - Pure context (no state mutation, no physics)
 * - Default LOD = 2 (standard) gdy provider nieobecny
 * - Backwards compatible: renderer może ignorować context i używać hardcoded
 *
 * Reference:
 * - frontend/src/ui/sld/v2/lod/lodScaling.ts (BASE_FONT_SIZES + multipliers)
 * - docs/sld/SLD_INDUSTRIAL_SPEC_v1.md § 5.3 (typografia hierarchiczna)
 * - iter 12 audit Wizualny WCAG NO-GO 7/10 — mikrotypografia 10-11 px
 */

import { createContext, useContext, type ReactNode } from 'react';

import type { LodLevel } from './LodPolicy';
import {
  lodToFontSize,
  lodToStrokeWidth,
  lodToSymbolScale,
  type StrokeRole,
  type TextRole,
} from './lodScaling';

interface SldLodContextValue {
  readonly lod: LodLevel;
  /** Helper: oblicz font size dla roli przy bieżącym LOD. */
  readonly getFontSize: (role: TextRole) => number;
  /** Helper: oblicz stroke width dla roli przy bieżącym LOD. */
  readonly getStrokeWidth: (role: StrokeRole) => number;
  /** Helper: oblicz symbol scale przy bieżącym LOD. */
  readonly getSymbolScale: () => number;
}

const DEFAULT_LOD: LodLevel = 2;

const SldLodContext = createContext<SldLodContextValue>({
  lod: DEFAULT_LOD,
  getFontSize: (role) => lodToFontSize(role, DEFAULT_LOD),
  getStrokeWidth: (role) => lodToStrokeWidth(role, DEFAULT_LOD),
  getSymbolScale: () => lodToSymbolScale(DEFAULT_LOD),
});

export function SldLodProvider({
  lod,
  children,
}: {
  readonly lod: LodLevel;
  readonly children: ReactNode;
}): JSX.Element {
  const value: SldLodContextValue = {
    lod,
    getFontSize: (role) => lodToFontSize(role, lod),
    getStrokeWidth: (role) => lodToStrokeWidth(role, lod),
    getSymbolScale: () => lodToSymbolScale(lod),
  };
  return <SldLodContext.Provider value={value}>{children}</SldLodContext.Provider>;
}

/**
 * Hook: odczytaj LOD context.
 * Bez providera zwraca default LOD=2 (standard).
 */
export function useSldLod(): SldLodContextValue {
  return useContext(SldLodContext);
}
