/**
 * SCHEMAT-10 S4 (V12K-135/136) — testy palety jasnej toru eksportu. Dowodzi:
 *  (a) jednostki: podmiana hex, wstrzyknięcie tła, nadpisanie stylu
 *      `currentColor` strzałek zwarciowych — każda NIEZALEŻNIE od pozostałych;
 *  (b) integracja na REALNYM markupie kanwy v3 (sieć referencyjna 52+ stacji,
 *      TA SAMA fixtura co S2/S3): po transformacji ZERO ciemnych hex
 *      (`colorTokens.ts`) w wyjściu, tło jasne obecne, PARYTET liczności
 *      elementów (segmenty/symbole/etykiety) identyczny przed/po — kolory z
 *      jasnej tabeli, nie utrata treści (spec §3 „parytet eksportu").
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  BASE_STROKE,
  CANVAS_BACKGROUND,
  HIGHLIGHT_COLOR,
  STATE_COLOR,
  VOLTAGE_COLOR,
} from '../../theme/colorTokens';
import { SldCanvasV3 } from '../../canvas/SldCanvasV3';
import {
  injectExportBackground,
  LIGHT_TECHNICAL_V3,
  rewriteFaultFlowStyleColors,
  substituteExportHexColors,
  toLightTechnicalExportSvg,
} from '../exportPalette';

afterEach(() => cleanup());

describe('exportPalette — substituteExportHexColors (jednostka)', () => {
  it('podmienia wszystkie ciemne wartości VOLTAGE_COLOR/STATE_COLOR/HIGHLIGHT_COLOR', () => {
    const darkValues = [
      CANVAS_BACKGROUND,
      BASE_STROKE,
      VOLTAGE_COLOR.hv,
      VOLTAGE_COLOR.sn,
      VOLTAGE_COLOR.nn,
      STATE_COLOR.closed,
      STATE_COLOR.open,
      STATE_COLOR.nop,
      HIGHLIGHT_COLOR.energized,
      HIGHLIGHT_COLOR.deenergized,
      HIGHLIGHT_COLOR.standby,
      HIGHLIGHT_COLOR.maintenance,
      HIGHLIGHT_COLOR.flow,
      HIGHLIGHT_COLOR.oltc,
      HIGHLIGHT_COLOR.fault,
      HIGHLIGHT_COLOR.faultWarning,
      HIGHLIGHT_COLOR.faultOk,
      HIGHLIGHT_COLOR.selection,
    ];
    const markup = darkValues.map((v) => `<path fill="${v}" stroke="${v}"/>`).join('');
    const out = substituteExportHexColors(markup);
    for (const dark of darkValues) {
      expect(out).not.toContain(dark);
    }
  });

  it('hv (=BASE_STROKE) i nop (=open) mapują na TEN SAM cel jasny (symetria z ciemnym)', () => {
    expect(VOLTAGE_COLOR.hv).toBe(BASE_STROKE);
    expect(STATE_COLOR.nop).toBe(STATE_COLOR.open);
    const out = substituteExportHexColors(`<a fill="${BASE_STROKE}"/><b fill="${VOLTAGE_COLOR.hv}"/>`);
    const outNop = substituteExportHexColors(`<a fill="${STATE_COLOR.open}"/><b fill="${STATE_COLOR.nop}"/>`);
    expect(out).toBe(`<a fill="${LIGHT_TECHNICAL_V3.baseStroke}"/><b fill="${LIGHT_TECHNICAL_V3.voltage.hv}"/>`);
    expect(LIGHT_TECHNICAL_V3.voltage.hv).toBe(LIGHT_TECHNICAL_V3.baseStroke);
    expect(outNop).toBe(
      `<a fill="${LIGHT_TECHNICAL_V3.state.open}"/><b fill="${LIGHT_TECHNICAL_V3.state.nop}"/>`,
    );
  });

  it('nie dotyka treści niebędącej jednym z tokenów (etykieta PL nietknięta)', () => {
    const markup = `<text>Stacja SN-12 · 15 kV</text><path fill="${VOLTAGE_COLOR.sn}"/>`;
    const out = substituteExportHexColors(markup);
    expect(out).toContain('Stacja SN-12 · 15 kV');
  });
});

describe('exportPalette — injectExportBackground (jednostka)', () => {
  it('wstrzykuje prostokąt tła po KAŻDYM otwierającym tagu <svg> (zagnieżdżenie SheetFrame)', () => {
    const markup = '<svg data-testid="outer"><svg data-testid="inner"></svg></svg>';
    const out = injectExportBackground(markup);
    const rectCount = (out.match(/<rect x="0" y="0" width="100%" height="100%"/g) ?? []).length;
    expect(rectCount).toBe(2);
    expect(out).toContain(`fill="${LIGHT_TECHNICAL_V3.canvasBackground}"`);
  });
});

describe('exportPalette — rewriteFaultFlowStyleColors (jednostka)', () => {
  it.each(['critical', 'warning', 'ok'] as const)(
    'nadpisuje style="color:..." dla tokenu %s, NIEZALEŻNIE od formy poprzedniej wartości (hex/rgb)',
    (token) => {
      const asHex = `<g data-fault-color-token="${token}" style="color: #E74C3C;">`;
      const asRgb = `<g data-fault-color-token="${token}" style="color: rgb(231, 76, 60);">`;
      const outHex = rewriteFaultFlowStyleColors(asHex);
      const outRgb = rewriteFaultFlowStyleColors(asRgb);
      expect(outHex).toBe(outRgb);
      expect(outHex).toContain(`data-fault-color-token="${token}"`);
      expect(outHex).toMatch(/style="color: #[0-9A-Fa-f]{6}"/);
    },
  );

  it('brak style="..." istniejącego ⇒ dopisuje go (defensywnie, markup nie musi mieć style dziś)', () => {
    const out = rewriteFaultFlowStyleColors('<g data-fault-color-token="critical">');
    expect(out).toMatch(/style="color: #[0-9A-Fa-f]{6}"/);
  });

  it('nie dotyka <g> bez data-fault-color-token', () => {
    const markup = '<g data-testid="x" style="color: #ABCDEF;">';
    expect(rewriteFaultFlowStyleColors(markup)).toBe(markup);
  });
});

// ---------------------------------------------------------------------------
// Integracja — markup REALNY kanwy v3 (sieć referencyjna 52+ stacji).
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const DARK_TOKEN_VALUES = [
  CANVAS_BACKGROUND,
  BASE_STROKE,
  VOLTAGE_COLOR.sn,
  VOLTAGE_COLOR.nn,
  STATE_COLOR.nop,
  HIGHLIGHT_COLOR.energized,
  HIGHLIGHT_COLOR.deenergized,
  HIGHLIGHT_COLOR.flow,
  HIGHLIGHT_COLOR.oltc,
  HIGHLIGHT_COLOR.fault,
];

/** Grupy sceny renderowane przez `SldCanvasV3.tsx` (`sld-v3-segments`/
 *  `sld-v3-symbols`/`sld-v3-labels`) — parytet = liczność DZIECI KAŻDEJ z
 *  tych grup identyczna przed/po transformacji (testId per element WEWNĄTRZ
 *  tych grup ma RÓŻNE konwencje nazewnicze zależnie od LOD/rodzaju elementu
 *  — `buildScene.ts` `testId` bywa `{bayRef}#{symbolId}`/`sld-v3-l0-{id}`/…,
 *  nie jeden wzorzec `sld-v3-symbol-N` — więc miarą parytetu jest LICZBA
 *  węzłów w grupie, nie dopasowanie wzorca nazw). */
const SCENE_GROUP_SELECTORS = [
  '[data-testid="sld-v3-segments"]',
  '[data-testid="sld-v3-symbols"]',
  '[data-testid="sld-v3-labels"]',
] as const;

function sceneGroupChildCounts(root: ParentNode): readonly number[] {
  return SCENE_GROUP_SELECTORS.map((selector) => root.querySelector(selector)?.children.length ?? -1);
}

function renderRealMarkupAtLod(lod: 0 | 1 | 2): { readonly svgEl: SVGSVGElement; readonly raw: string } {
  const { container } = render(<SldCanvasV3 snapshot={enm} width={1200} height={900} lodOverride={lod} />);
  const svgEl = container.querySelector<SVGSVGElement>('svg[data-testid="sld-canvas-v3"]');
  if (!svgEl) throw new Error('test setup: brak <svg data-testid="sld-canvas-v3"> po renderze');
  return { svgEl, raw: new XMLSerializer().serializeToString(svgEl) };
}

describe('exportPalette — integracja na realnym markupie kanwy (parytet eksportu)', () => {
  for (const lod of [0, 1, 2] as const) {
    it(`LOD ${lod}: ZERO wartości ciemnych po transformacji`, () => {
      const { raw } = renderRealMarkupAtLod(lod);
      const out = toLightTechnicalExportSvg(raw);
      for (const dark of DARK_TOKEN_VALUES) {
        expect(out).not.toContain(dark);
      }
    });

    it(`LOD ${lod}: tło jasne obecne`, () => {
      const out = toLightTechnicalExportSvg(renderRealMarkupAtLod(lod).raw);
      expect(out).toContain(`fill="${LIGHT_TECHNICAL_V3.canvasBackground}"`);
    });

    it(`LOD ${lod}: parytet elementów — liczności segmenty/symbole/etykiety identyczne przed/po`, () => {
      const { svgEl, raw } = renderRealMarkupAtLod(lod);
      const before = sceneGroupChildCounts(svgEl);
      expect(before.every((n) => n > 0)).toBe(true);

      const out = toLightTechnicalExportSvg(raw);
      const parsed = new DOMParser().parseFromString(out, 'image/svg+xml');
      expect(parsed.querySelector('parsererror')).toBeNull();
      const after = sceneGroupChildCounts(parsed);
      expect(after).toEqual(before);
    });
  }
});
