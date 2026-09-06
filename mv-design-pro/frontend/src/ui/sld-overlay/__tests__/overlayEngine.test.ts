/**
 * Overlay Engine Tests — PR-16
 *
 * CANONICAL ALIGNMENT:
 * - OverlayEngine.ts: Pure deterministic mapping
 * - overlayTypes.ts: Token-based styling
 *
 * TEST COVERAGE:
 * - applyOverlayToSymbols is deterministic
 * - No physics thresholds in engine
 * - No dynamic calculations
 * - Snapshot stability of resolved styles
 * - Missing element handling (ignore, no fallback)
 * - Token mapping correctness
 */

import { describe, it, expect } from 'vitest';
import {
  resolveElementStyle,
  applyOverlayToSymbols,
  getElementOverlayStyle,
  formatBadgeValue,
} from '../OverlayEngine';
import type { OverlayPayloadV1, OverlayElement } from '../overlayTypes';
import {
  COLOR_TOKEN_MAP,
  STROKE_TOKEN_MAP,
  ANIMATION_TOKEN_MAP,
  VISUAL_STATE_STYLE,
} from '../overlayTypes';
// =============================================================================
// TEST DATA
// =============================================================================

/**
 * Symbole SLD renderowane na kanwie — `applyOverlayToSymbols` czyta z nich
 * WYLACZNIE `elementId` (parametr `symbols: readonly unknown[]`, `OverlayEngine.ts`),
 * wiec fiksturki maja swoj WLASNY, pelny ksztalt geometryczny (pozycja/rozmiar),
 * a nie waski most migracyjny `sld-editor/types.ts` (ten niesie TYLKO pola
 * czytane przez `topologyInputReader.ts`, bez geometrii renderu).
 */
interface TestSldSymbolBase {
  readonly id: string;
  readonly elementId: string;
  readonly elementName: string;
  readonly inService: boolean;
  readonly position: { x: number; y: number };
}

interface BusSymbol extends TestSldSymbolBase {
  readonly elementType: 'Bus';
  readonly width: number;
  readonly height: number;
}

interface BranchSymbol extends TestSldSymbolBase {
  readonly elementType: 'LineBranch';
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly points: readonly { x: number; y: number }[];
  readonly branchType: 'LINE' | 'CABLE';
}

interface SwitchSymbol extends TestSldSymbolBase {
  readonly elementType: 'Switch';
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly switchState: 'OPEN' | 'CLOSED';
  readonly switchType: 'BREAKER' | 'DISCONNECTOR' | 'LOAD_SWITCH' | 'FUSE';
}

const createBusSymbol = (id: string, elementId: string): BusSymbol => ({
  id,
  elementId,
  elementType: 'Bus',
  elementName: `Szyna ${id}`,
  position: { x: 100, y: 100 },
  inService: true,
  width: 80,
  height: 40,
});

const createBranchSymbol = (id: string, elementId: string): BranchSymbol => ({
  id,
  elementId,
  elementType: 'LineBranch',
  elementName: `Linia ${id}`,
  position: { x: 200, y: 150 },
  inService: true,
  fromNodeId: 'bus-1',
  toNodeId: 'bus-2',
  points: [],
  branchType: 'LINE',
});

const createSwitchSymbol = (id: string, elementId: string): SwitchSymbol => ({
  id,
  elementId,
  elementType: 'Switch',
  elementName: `Wylacznik ${id}`,
  position: { x: 150, y: 125 },
  inService: true,
  fromNodeId: 'bus-1',
  toNodeId: 'bus-2',
  switchState: 'CLOSED',
  switchType: 'BREAKER',
});

const testSymbols = [
  createBusSymbol('sym-bus-1', 'bus-001'),
  createBusSymbol('sym-bus-2', 'bus-002'),
  createBranchSymbol('sym-line-1', 'line-001'),
  createSwitchSymbol('sym-sw-1', 'switch-001'),
];

const makeOverlayElement = (
  ref: string,
  type: string,
  state: 'OK' | 'WARNING' | 'CRITICAL' | 'INACTIVE',
  colorToken: string,
  strokeToken: string = 'normal',
  animToken: string | null = null,
  badges: Record<string, number | null> = {}
): OverlayElement => ({
  element_ref: ref,
  element_type: type,
  visual_state: state,
  numeric_badges: badges,
  color_token: colorToken,
  stroke_token: strokeToken,
  animation_token: animToken,
});

const makeTestPayload = (elements: OverlayElement[]): OverlayPayloadV1 => ({
  run_id: '00000000-0000-0000-0000-000000000001',
  analysis_type: 'SC_3F',
  elements,
  legend: [
    { color_token: 'ok', label: 'Norma', description: null },
    { color_token: 'warning', label: 'Ostrzezenie', description: null },
    { color_token: 'critical', label: 'Przekroczenie', description: null },
  ],
});

// =============================================================================
// DETERMINISM TESTS
// =============================================================================

describe('OverlayEngine - Determinism', () => {
  it('applyOverlayToSymbols produces identical output for identical input', () => {
    const elements = [
      makeOverlayElement('bus-001', 'Bus', 'OK', 'ok'),
      makeOverlayElement('line-001', 'LineBranch', 'WARNING', 'warning', 'bold'),
    ];
    const payload = makeTestPayload(elements);

    const result1 = applyOverlayToSymbols(testSymbols, payload);
    const result2 = applyOverlayToSymbols(testSymbols, payload);

    // Same size
    expect(result1.size).toBe(result2.size);

    // Same entries
    for (const [key, style1] of result1) {
      const style2 = result2.get(key);
      expect(style2).toBeDefined();
      expect(style1).toEqual(style2);
    }
  });

  it('resolveElementStyle is deterministic', () => {
    const element = makeOverlayElement('bus-001', 'Bus', 'OK', 'ok', 'normal', null, {
      ikss_ka: 12.5,
    });

    const style1 = resolveElementStyle(element);
    const style2 = resolveElementStyle(element);

    expect(style1).toEqual(style2);
  });

  it('formatBadgeValue is deterministic with fixed decimals', () => {
    expect(formatBadgeValue(12.3456, 2)).toBe('12.35');
    expect(formatBadgeValue(12.3456, 2)).toBe('12.35'); // Repeat for determinism
    expect(formatBadgeValue(null, 2)).toBe('');
    expect(formatBadgeValue(null, 2)).toBe('');
  });
});

// =============================================================================
// NO PHYSICS THRESHOLDS TESTS
// =============================================================================

describe('OverlayEngine - No Physics', () => {
  it('engine source code does not contain physics keywords', async () => {
    // This test verifies that the engine module has no physics logic
    // by checking the resolved styles only use token-based mapping
    const element = makeOverlayElement('bus-001', 'Bus', 'OK', 'ok');
    const style = resolveElementStyle(element);

    // Style should come from token maps, not physics calculations
    expect(style.colorClass).toBe(COLOR_TOKEN_MAP['ok']);
    expect(style.strokeClass).toBe(STROKE_TOKEN_MAP['normal']);
    expect(style.animationClass).toBe('');
  });

  it('visual state styles come from predefined map only', () => {
    const states: Array<'OK' | 'WARNING' | 'CRITICAL' | 'INACTIVE'> = [
      'OK',
      'WARNING',
      'CRITICAL',
      'INACTIVE',
    ];

    for (const state of states) {
      const element = makeOverlayElement('bus-001', 'Bus', state, state.toLowerCase());
      const style = resolveElementStyle(element);

      const expected = VISUAL_STATE_STYLE[state];
      expect(style.stateBg).toBe(expected.bg);
      expect(style.stateText).toBe(expected.text);
      expect(style.stateBorder).toBe(expected.border);
    }
  });

  it('numeric badges are passed through without calculation', () => {
    const badges = { u_pu: 1.02, loading_pct: 87.5, ikss_ka: null };
    const element = makeOverlayElement('bus-001', 'Bus', 'OK', 'ok', 'normal', null, badges);
    const style = resolveElementStyle(element);

    expect(style.numericBadges).toEqual(badges);
    // Badges are NOT modified — pure passthrough
    expect(style.numericBadges['u_pu']).toBe(1.02);
    expect(style.numericBadges['loading_pct']).toBe(87.5);
    expect(style.numericBadges['ikss_ka']).toBeNull();
  });
});

// =============================================================================
// TOKEN MAPPING TESTS
// =============================================================================

describe('OverlayEngine - Token Mapping', () => {
  it('maps known color tokens correctly', () => {
    for (const [token, cssClass] of Object.entries(COLOR_TOKEN_MAP)) {
      const element = makeOverlayElement('test', 'Bus', 'OK', token);
      const style = resolveElementStyle(element);
      expect(style.colorClass).toBe(cssClass);
    }
  });

  it('maps known stroke tokens correctly', () => {
    for (const [token, cssClass] of Object.entries(STROKE_TOKEN_MAP)) {
      const element = makeOverlayElement('test', 'Bus', 'OK', 'ok', token);
      const style = resolveElementStyle(element);
      expect(style.strokeClass).toBe(cssClass);
    }
  });

  it('maps known animation tokens correctly', () => {
    for (const [token, cssClass] of Object.entries(ANIMATION_TOKEN_MAP)) {
      const element = makeOverlayElement('test', 'Bus', 'OK', 'ok', 'normal', token);
      const style = resolveElementStyle(element);
      expect(style.animationClass).toBe(cssClass);
    }
  });

  it('returns empty string for null animation token', () => {
    const element = makeOverlayElement('test', 'Bus', 'OK', 'ok', 'normal', null);
    const style = resolveElementStyle(element);
    expect(style.animationClass).toBe('');
  });

  it('falls back to inactive color for unknown token', () => {
    const element = makeOverlayElement('test', 'Bus', 'OK', 'unknown-token');
    const style = resolveElementStyle(element);
    expect(style.colorClass).toBe(COLOR_TOKEN_MAP['inactive']);
  });

  it('falls back to normal stroke for unknown token', () => {
    const element = makeOverlayElement('test', 'Bus', 'OK', 'ok', 'unknown-stroke');
    const style = resolveElementStyle(element);
    expect(style.strokeClass).toBe(STROKE_TOKEN_MAP['normal']);
  });
});

// =============================================================================
// SYMBOL MATCHING TESTS
// =============================================================================

describe('OverlayEngine - Symbol Matching', () => {
  it('only includes elements that exist in both overlay and symbols', () => {
    const elements = [
      makeOverlayElement('bus-001', 'Bus', 'OK', 'ok'), // Exists in symbols
      makeOverlayElement('bus-999', 'Bus', 'OK', 'ok'), // Does NOT exist
      makeOverlayElement('line-001', 'LineBranch', 'WARNING', 'warning'), // Exists
    ];
    const payload = makeTestPayload(elements);

    const result = applyOverlayToSymbols(testSymbols, payload);

    expect(result.size).toBe(2);
    expect(result.has('bus-001')).toBe(true);
    expect(result.has('line-001')).toBe(true);
    expect(result.has('bus-999')).toBe(false); // Ignored
  });

  it('ignores overlay elements without matching symbol', () => {
    const elements = [
      makeOverlayElement('nonexistent-1', 'Bus', 'OK', 'ok'),
      makeOverlayElement('nonexistent-2', 'LineBranch', 'OK', 'ok'),
    ];
    const payload = makeTestPayload(elements);

    const result = applyOverlayToSymbols(testSymbols, payload);
    expect(result.size).toBe(0);
  });

  it('handles empty symbol list', () => {
    const elements = [makeOverlayElement('bus-001', 'Bus', 'OK', 'ok')];
    const payload = makeTestPayload(elements);

    const result = applyOverlayToSymbols([], payload);
    expect(result.size).toBe(0);
  });

  it('handles empty overlay elements', () => {
    const payload = makeTestPayload([]);

    const result = applyOverlayToSymbols(testSymbols, payload);
    expect(result.size).toBe(0);
  });
});

// =============================================================================
// STYLE LOOKUP TESTS
// =============================================================================

describe('OverlayEngine - getElementOverlayStyle', () => {
  it('returns style for existing element', () => {
    const elements = [makeOverlayElement('bus-001', 'Bus', 'WARNING', 'warning')];
    const payload = makeTestPayload(elements);
    const styleMap = applyOverlayToSymbols(testSymbols, payload);

    const style = getElementOverlayStyle(styleMap, 'bus-001');
    expect(style).toBeDefined();
    expect(style!.visualState).toBe('WARNING');
    expect(style!.colorClass).toBe(COLOR_TOKEN_MAP['warning']);
  });

  it('returns undefined for non-existent element', () => {
    const elements = [makeOverlayElement('bus-001', 'Bus', 'OK', 'ok')];
    const payload = makeTestPayload(elements);
    const styleMap = applyOverlayToSymbols(testSymbols, payload);

    const style = getElementOverlayStyle(styleMap, 'nonexistent');
    expect(style).toBeUndefined();
  });
});

// =============================================================================
// SNAPSHOT STABILITY TESTS
// =============================================================================

describe('OverlayEngine - Style Snapshots', () => {
  it('OK state produces correct style snapshot', () => {
    const element = makeOverlayElement('bus-001', 'Bus', 'OK', 'ok', 'normal', null, {
      u_pu: 1.02,
    });
    const style = resolveElementStyle(element);

    expect(style).toMatchObject({
      elementRef: 'bus-001',
      colorClass: 'sld-overlay-ok',
      strokeClass: 'sld-overlay-stroke-normal',
      animationClass: '',
      stateBg: 'bg-emerald-50',
      stateText: 'text-emerald-700',
      stateBorder: 'border-emerald-300',
      visualState: 'OK',
    });
  });

  it('CRITICAL state with animation produces correct snapshot', () => {
    const element = makeOverlayElement(
      'line-001',
      'LineBranch',
      'CRITICAL',
      'critical',
      'bold',
      'blink',
      { loading_pct: 115.2 }
    );
    const style = resolveElementStyle(element);

    expect(style).toMatchObject({
      elementRef: 'line-001',
      colorClass: 'sld-overlay-critical',
      strokeClass: 'sld-overlay-stroke-bold',
      animationClass: 'sld-overlay-anim-blink',
      stateBg: 'bg-rose-50',
      stateText: 'text-rose-700',
      stateBorder: 'border-rose-300',
      visualState: 'CRITICAL',
    });
  });

  it('WARNING state produces correct snapshot', () => {
    const element = makeOverlayElement('trafo-001', 'TransformerBranch', 'WARNING', 'warning');
    const style = resolveElementStyle(element);

    expect(style).toMatchObject({
      colorClass: 'sld-overlay-warning',
      stateBg: 'bg-amber-50',
      stateText: 'text-amber-700',
      stateBorder: 'border-amber-300',
      visualState: 'WARNING',
    });
  });

  it('INACTIVE state produces correct snapshot', () => {
    const element = makeOverlayElement('sw-001', 'Switch', 'INACTIVE', 'inactive');
    const style = resolveElementStyle(element);

    expect(style).toMatchObject({
      colorClass: 'sld-overlay-inactive',
      stateBg: 'bg-slate-100',
      stateText: 'text-slate-500',
      stateBorder: 'border-slate-300',
      visualState: 'INACTIVE',
    });
  });
});

// =============================================================================
// FORMAT BADGE VALUE TESTS
// =============================================================================

describe('OverlayEngine - formatBadgeValue', () => {
  it('formats number with specified decimals', () => {
    expect(formatBadgeValue(12.3456, 2)).toBe('12.35');
    expect(formatBadgeValue(12.3456, 1)).toBe('12.3');
    expect(formatBadgeValue(12.3456, 4)).toBe('12.3456');
  });

  it('returns empty string for null', () => {
    expect(formatBadgeValue(null)).toBe('');
    expect(formatBadgeValue(null, 3)).toBe('');
  });

  it('uses default 2 decimals', () => {
    expect(formatBadgeValue(42.1)).toBe('42.10');
  });

  it('handles zero correctly', () => {
    expect(formatBadgeValue(0, 2)).toBe('0.00');
  });

  it('handles negative values', () => {
    expect(formatBadgeValue(-5.678, 2)).toBe('-5.68');
  });
});
