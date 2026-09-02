/**
 * T2-WYNIKI (PLAN_SLD_NN_TOPOLOGIA_2026-08 §T2, §0 pkt 2 „odznaka SWZ na
 * kanwie") — dokończenie kontraktu P0.8 (`overlay.ts::swzByOwnerRef` istniał,
 * odznaka NIE była wdrożona). Wzorzec IDENTYCZNY z testem badge OLTC
 * (`sldCanvasV3.test.tsx` „V12K-092"): fixture REALNA `sldSubstrate52s`,
 * `overlay` skonstruowany ręcznie (ten sam kontrakt `SldV3Overlay`, zero
 * fetch w teście renderu — produkcyjny fetch danych SWZ żyje dziś w
 * `v3/lv-domain/projectionApi.ts`, jedyne wywołanie `fetch` całej domeny nN
 * po kasacji martwego hooka `useSwzOverlay.ts` w slice E, 2026-09-01).
 *
 * Zakres: trzy tony (spełnia/nie spełnia/nierozstrzygalne) + brak danych =
 * brak odznaki (fail-closed, §14.2 „overlay wyłączony bez wyniku").
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { SldCanvasV3, computeSwzBadgePlacements } from '../SldCanvasV3';
import { buildSwzOverlayFromResponses, type SldV3Overlay, type SwzApiResponse } from '../overlay';

afterEach(() => cleanup());

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;

/** Realny aparat (symbol `elementKind==='apparatus'`) sceny danego LOD +
 *  jego `meta.ownerRef` — TEN SAM wzorzec co `transformerRefOnScene` dla
 *  badge OLTC. */
function apparatusRefOnScene(lod: 0 | 1 | 2): string {
  const scene = buildSceneV3(enm, lod);
  const sym = scene.symbols.find((s) => s.meta?.elementKind === 'apparatus' && s.meta.ownerRef);
  expect(sym, `symbol aparatu obecny na L${lod}`).toBeTruthy();
  return sym!.meta!.ownerRef!;
}

function swzResponse(breakerRef: string, overrides: Partial<NonNullable<SwzApiResponse['swz']>> = {}): SwzApiResponse {
  return {
    status: 'OK',
    breaker_ref: breakerRef,
    swz: {
      status: 'spełnia',
      przyczyna_pl: 'Ik1_min ≥ Ia wymagane',
      ik1_min_a: 250,
      ia_wymagane_a: 160,
      t_wymagany_s: 0.4,
      margines: 1.5625,
      ...overrides,
    },
  };
}

function overlayWithSwz(entries: SldV3Overlay['swzByOwnerRef']): SldV3Overlay {
  return { energizedByTestId: {}, swzByOwnerRef: entries };
}

describe('SldCanvasV3 — T2-WYNIKI: odznaka SWZ (warstwa sld-v3-swz-overlay)', () => {
  it('(a) aparat z werdyktem „spełnia" → odznaka tonu ok (✓) w warstwie sld-v3-swz-overlay', () => {
    const ref = apparatusRefOnScene(2);
    const overlay = buildSwzOverlayFromResponses([swzResponse(ref, { status: 'spełnia' })]);
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlayWithSwz(overlay)} />,
    );
    const badge = container.querySelector(`[data-swz-owner-ref="${ref}"]`);
    expect(badge).toBeTruthy();
    expect(badge?.getAttribute('data-swz-tone')).toBe('ok');
    expect(container.querySelector('[data-testid="sld-v3-swz-label-0"]')?.textContent).toBe('✓');
  });

  it('(b) aparat z werdyktem „nie spełnia" → odznaka tonu fail (✗)', () => {
    const ref = apparatusRefOnScene(2);
    const overlay = buildSwzOverlayFromResponses([swzResponse(ref, { status: 'nie spełnia', ik1_min_a: 80 })]);
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlayWithSwz(overlay)} />,
    );
    const badge = container.querySelector(`[data-swz-owner-ref="${ref}"]`);
    expect(badge?.getAttribute('data-swz-tone')).toBe('fail');
    expect(container.querySelector('[data-testid="sld-v3-swz-label-0"]')?.textContent).toBe('✗');
  });

  it('(c) werdykt „nierozstrzygalne" (trzeci stan, fail-closed) → odznaka tonu unknown (?)', () => {
    const ref = apparatusRefOnScene(2);
    const overlay = buildSwzOverlayFromResponses([swzResponse(ref, { status: 'nierozstrzygalne' })]);
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlayWithSwz(overlay)} />,
    );
    const badge = container.querySelector(`[data-swz-owner-ref="${ref}"]`);
    expect(badge?.getAttribute('data-swz-tone')).toBe('unknown');
    expect(container.querySelector('[data-testid="sld-v3-swz-label-0"]')?.textContent).toBe('?');
  });

  it('(d) bez overlay SWZ → warstwa pusta (zero atrap)', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} />,
    );
    expect(container.querySelector('[data-testid="sld-v3-swz-overlay"]')!.children.length).toBe(0);
  });

  it('(e) odpowiedź koperty status="brak danych"/"nie dotyczy" → BRAK odznaki (fail-closed, nie domyślne "ok")', () => {
    const ref = apparatusRefOnScene(2);
    const overlay = buildSwzOverlayFromResponses([
      { status: 'brak danych', breaker_ref: ref },
      { status: 'nie dotyczy', breaker_ref: 'inny-ref' },
    ]);
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlayWithSwz(overlay)} />,
    );
    expect(container.querySelector('[data-testid="sld-v3-swz-overlay"]')!.children.length).toBe(0);
  });

  it('(f) determinizm renderu: dwa rendery tych samych propsów → identyczny innerHTML warstwy SWZ', () => {
    const ref = apparatusRefOnScene(2);
    const overlay = overlayWithSwz(buildSwzOverlayFromResponses([swzResponse(ref, { status: 'spełnia' })]));
    const { container: a } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    const { container: b } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    expect(a.querySelector('[data-testid="sld-v3-swz-overlay"]')!.innerHTML).toBe(
      b.querySelector('[data-testid="sld-v3-swz-overlay"]')!.innerHTML,
    );
  });

  it('computeSwzBadgePlacements: brak overlay ⇒ zero placementów; wpis dla nieistniejącego refu ⇒ ignorowany', () => {
    const scene = buildSceneV3(enm, 2);
    expect(computeSwzBadgePlacements(scene, undefined)).toEqual([]);
    expect(
      computeSwzBadgePlacements(scene, {
        'nieznany-ref': { ownerRef: 'nieznany-ref', status: 'spełnia', przyczynaPl: 'x', ik1MinA: 1, iaWymaganeA: null, tWymaganyS: null, margines: null },
      }),
    ).toEqual([]);
  });
});
