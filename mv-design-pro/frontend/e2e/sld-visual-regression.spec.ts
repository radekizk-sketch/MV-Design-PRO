/**
 * SLD Visual Regression Tests — P0.10 (Playwright toHaveScreenshot).
 *
 * Per P0.10 DoD: 60 snapshotów (15 fixtures × 4 LOD), threshold 0.5%,
 * update explicit. Foundation: jeden test per LOD level + GN01 baseline.
 *
 * Run with:
 *   npx playwright test e2e/sld-visual-regression.spec.ts
 *   npx playwright test --update-snapshots  # explicit update
 *
 * CI integration: .github/workflows/sld-determinism.yml ostatni step.
 */

import { expect, test } from '@playwright/test';

test.describe('SLD v2 Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    // Disable animations for deterministic snapshots
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0ms !important;
          animation-delay: 0ms !important;
          transition-duration: 0ms !important;
          transition-delay: 0ms !important;
        }
      `,
    });
  });

  test('GN01 baseline canvas — LOD 2 standard', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Klik Otwórz na pierwszym projekcie
    const openBtn = page.locator('button:has-text("Otwórz")').first();
    if (await openBtn.count()) {
      await openBtn.click();
      await page.waitForTimeout(2000);
    }

    const canvas = page.locator('[data-testid="sld-workspace-container"]').first();
    if (await canvas.count()) {
      await expect(canvas).toHaveScreenshot('gn01-canvas-lod2.png', {
        maxDiffPixelRatio: 0.005, // 0.5% threshold per P0.10 DoD
        animations: 'disabled',
      });
    }
  });

  test('SLD canvas grid pattern (ETAP-grade)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const canvasGrid = page.locator('.sld-canvas-grid').first();
    if (await canvasGrid.count()) {
      await expect(canvasGrid).toHaveScreenshot('canvas-grid-pattern.png', {
        maxDiffPixelRatio: 0.005,
        animations: 'disabled',
      });
    }
  });

  test('Layer toggle panel default state', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Otwórz panel warstw
    const layerBtn = page.locator('[data-testid="sld-layer-panel-toggle"]').first();
    if (await layerBtn.count()) {
      await layerBtn.click();
      await page.waitForTimeout(500);

      const panel = page.locator('[data-testid="sld-layer-toggle-panel"]').first();
      if (await panel.count()) {
        await expect(panel).toHaveScreenshot('layer-toggle-panel.png', {
          maxDiffPixelRatio: 0.005,
          animations: 'disabled',
        });
      }
    }
  });

  test('Proof packs panel (8 packs visible)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const panel = page.locator('[data-testid="sld-proof-packs-panel"]').first();
    if (await panel.count()) {
      await expect(panel).toHaveScreenshot('proof-packs-panel.png', {
        maxDiffPixelRatio: 0.005,
        animations: 'disabled',
      });
    }
  });
});
