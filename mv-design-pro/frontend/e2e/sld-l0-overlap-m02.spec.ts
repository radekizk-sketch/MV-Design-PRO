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
 * Blocks: queryable via `[data-testid^="sld-v2-station-overview-block-"]`.
 */
import { test, expect } from '@playwright/test';

const HARNESS_URL = 'http://127.0.0.1:5173/screenshot-harness.html';

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

    // v3 (adaptacja po F12-C): blok L0 = glif `stationCollapsed` (kontur
    // kwadratu stacji, spec §3/F6b) — dawny testid sld-v2-station-overview-block-*
    // zniknął z kasacją renderu v2. Legenda arkusza wyłączona (glif wzorcowy).
    const blockLocator = page.locator(
      'xpath=//*[@data-symbol-canon="stationCollapsed"][not(ancestor::*[@data-testid="sld-sheet-legend"])]',
    );
    const count = await blockLocator.count();
    // Sanity: the substrate must render its full station set as L0 blocks.
    expect(count, 'expected >=50 L0 station blocks on the substrate').toBeGreaterThanOrEqual(50);

    // Read the ACTUAL rendered bounding box of every block (getBoundingClientRect
    // via Playwright). These sizes/positions are produced by the browser, not by
    // any literal in this test.
    const boxes: Box[] = [];
    for (let i = 0; i < count; i += 1) {
      const el = blockLocator.nth(i);
      const testId = await el.getAttribute('data-testid');
      const bb = await el.boundingBox();
      if (!bb) continue;
      boxes.push({
        id: (testId ?? `block-${i}`).replace('sld-v2-station-overview-block-', ''),
        x: bb.x,
        y: bb.y,
        width: bb.width,
        height: bb.height,
      });
    }

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
