/**
 * M-02 (render-based) — L0 station-block overlap check on the real render.
 *
 * METHOD A (render, not layout-space): renders SldCanvasV2 at L0 via the
 * screenshot harness (`?lod=0`), then reads each station block's ACTUAL
 * rendered bounding box through Playwright `.boundingBox()`
 * (= getBoundingClientRect) and checks pairwise overlap.
 *
 * This deliberately measures the REAL DOM geometry — NOT the LayoutResult
 * node rectangles. The previous layout-space M-02 passed because it measured
 * `node.width/height` (which auto-fit scales together with positions), while
 * the renderer draws a FIXED-size L0 block; the two diverged and blocks
 * overlapped on screen. A render-based check cannot be fooled that way.
 *
 * NO dimension literal appears here: the box sizes come entirely from the
 * browser's layout of the committed >=52-station substrate fixture.
 *
 * Harness: e2e/sld-substrate-screenshot.spec.ts pattern.
 * Blocks: union of rendered station symbols (`data-owner-ref` `stn/<id>/…`).
 */
import { test, expect } from '@playwright/test';
import { adresHarnessu } from './adresHarnessu';

const HARNESS_URL = adresHarnessu('screenshot-harness.html');

interface Box {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 2D intersection area of two axis-aligned boxes (0 if disjoint/touching). */
function overlapArea(a: Box, b: Box): number {
  const ox = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return ox * oy;
}

test.describe('sld:M-02:l0-overlap (render-based)', () => {
  test('L0 station blocks do not overlap on the real render', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    // ?lod=0 forces overview level → stations render as fixed-size blocks.
    await page.goto(`${HARNESS_URL}?lod=0`);

    const harnessRoot = page.locator('[data-testid="sld-harness-root"]').first();
    await expect(harnessRoot).toHaveAttribute('data-status', 'ready', { timeout: 20000 });

    const canvas = page.locator('[data-testid="sld-canvas-v3"]').first();
    await expect(canvas).toBeVisible({ timeout: 15000 });
    // Let auto-fit + viewport transform settle before measuring.
    await page.waitForTimeout(900);

    // Karta PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA: na L0 stacja nie jest już glifem
    // zbiorczym — rysuje się ta sama kompozycja co na L1/L2. „Blok stacji" to
    // więc OBWIEDNIA wszystkich narysowanych symboli stacji (`data-owner-ref`
    // `stn/<id>/…`), mierzona przez przeglądarkę. Intencja M-02 bez zmian: bloki
    // stacji na przeglądzie nie nachodzą na siebie. Legenda arkusza wyłączona.
    const symbole = page.locator(
      'xpath=//*[@data-symbol-canon][starts-with(@data-owner-ref,"stn/")][not(ancestor::*[@data-testid="sld-sheet-legend"])]',
    );
    const pomiary = await symbole.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { ref: el.getAttribute('data-owner-ref') ?? '', x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    const wgStacji = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();
    for (const p of pomiary) {
      const czesci = p.ref.replace(/#.*$/, '').split('/');
      const baza = `${czesci[0]}/${czesci[1]}`;
      const b = wgStacji.get(baza) ?? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      wgStacji.set(baza, {
        minX: Math.min(b.minX, p.x),
        minY: Math.min(b.minY, p.y),
        maxX: Math.max(b.maxX, p.x + p.w),
        maxY: Math.max(b.maxY, p.y + p.h),
      });
    }
    const count = wgStacji.size;
    // Sanity: the substrate must render its full station set on L0.
    expect(count, 'expected >=50 L0 station blocks on the substrate').toBeGreaterThanOrEqual(50);

    const boxes: Box[] = [...wgStacji.entries()].map(([id, b]) => ({
      id,
      x: b.minX,
      y: b.minY,
      width: b.maxX - b.minX,
      height: b.maxY - b.minY,
    }));

    expect(boxes.length, 'every block must yield a rendered bounding box').toBe(count);

    // Pairwise overlap. Tolerate sub-pixel touching (anti-alias / shared border):
    // require a meaningful 2D overlap relative to the smaller block.
    const overlapping: string[] = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const area = overlapArea(boxes[i], boxes[j]);
        if (area <= 0) continue;
        const minDim = Math.min(
          boxes[i].width,
          boxes[i].height,
          boxes[j].width,
          boxes[j].height,
        );
        // Ignore mere touching/anti-alias seams (<= ~1px band along an edge).
        if (area > minDim * 1.0) {
          overlapping.push(
            `${boxes[i].id} ∩ ${boxes[j].id} = ${area.toFixed(0)}px²`,
          );
        }
      }
    }

    expect(
      overlapping.length,
      `overlapping L0 block pairs (${overlapping.length}): ${overlapping.slice(0, 20).join('; ')}`,
    ).toBe(0);
  });
});
