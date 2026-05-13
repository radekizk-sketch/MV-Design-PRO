/**
 * SLD Industrial Visual Regression — P0.10 / PLAN_SLD_REWORK F5
 *
 * STATUS: SCAFFOLDING (baseline generation needed)
 * Reference: docs/sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md (AC-11)
 *            docs/plan/PLAN_SLD_REWORK.md § 7
 *
 * Visual regression coverage for SLD industrial-grade rendering.
 *
 * COVERAGE
 * --------
 * - 4 reference networks × 4 LOD levels = 16 snapshots (MVP)
 * - Extension to 60 snapshots (15 fixtures × 4 LOD) in follow-up sprints
 *
 * USAGE
 * -----
 * Baseline generation (run once on stable layout):
 *   npm run test:e2e:update-snapshots -- --grep "visual:sld"
 *
 * Regression check (CI default):
 *   npm run test:e2e -- --grep "visual:sld"
 *
 * INVARIANTS
 * ----------
 * - Tests use #sld-view reference scenarios (no network creation required)
 * - LOD levels controlled via window.__sld_lod_override = N (debug hook)
 *   When LOD override hook is not yet wired in main pipeline (TBD F3),
 *   only LOD-2 (standard) snapshots are captured (single baseline per scenario)
 * - Snapshots in __snapshots__/ are LFS-eligible (binary PNGs)
 * - Threshold 0.5% per AC-11 (playwright.config.ts toHaveScreenshot)
 *
 * NOT INCLUDED IN THIS SCAFFOLD
 * -----------------------------
 * - Live network E2E visual diffs (covered by other specs)
 * - SCADA overlay visual states (deferred to F4 completion)
 * - DXF export visual diff (deferred to P2)
 */

import { test, expect } from '@playwright/test';

// Reference scenario IDs from frontend/src/ui/sld/SLDViewPage.tsx
const REFERENCE_SCENARIOS = ['leaf', 'pass', 'branch', 'ring'] as const;
type ScenarioId = (typeof REFERENCE_SCENARIOS)[number];

// Level-of-Detail levels per SLD_INDUSTRIAL_SPEC_v1.md § 5.1.
// LOD-2 (standard) is the default canonical baseline for visual regression.
// Other LODs are scaffolded but skipped until LOD policy is wired (F3).
const LOD_OVERVIEW = 0;
const LOD_PLANVIEW = 1;
const LOD_STANDARD = 2;
const LOD_TECHNICAL = 3;
const LOD_FULL = 4;
const _LOD_LEVELS = [LOD_OVERVIEW, LOD_PLANVIEW, LOD_STANDARD, LOD_TECHNICAL, LOD_FULL] as const;

test.describe('visual:sld:industrial', () => {
  for (const scenarioId of REFERENCE_SCENARIOS) {
    test(`reference scenario ${scenarioId} — LOD-2 (standard)`, async ({ page }) => {
      // Reset hash + navigate to SLD view with scenario param
      await page.goto(`/#sld-view?ref=${scenarioId}`);

      // Wait for the SLD canvas to be ready (deterministic geometry computed)
      const canvas = page.locator('[data-testid="sld-canvas-root"]').first();
      await expect(canvas).toBeVisible({ timeout: 15000 });

      // Wait one frame for layout pipeline to settle
      await page.waitForTimeout(200);

      // Snapshot baseline: __snapshots__/sld_industrial_visual.spec.ts/{scenarioId}-lod-2.png
      // Threshold from playwright.config.ts: 0.5% pixel diff (AC-11)
      await expect(canvas).toHaveScreenshot(`${scenarioId}-lod-2.png`, {
        animations: 'disabled',
        caret: 'hide',
      });
    });
  }
});

test.describe('visual:sld:themes', () => {
  test('dark_scada theme baseline — ring topology @ LOD-2', async ({ page }) => {
    // Default theme is dark_scada (V12K-007). Once F4 ships theme switcher,
    // this snapshot pins the canonical dark mode appearance.
    await page.goto('/#sld-view?ref=ring');
    const canvas = page.locator('[data-testid="sld-canvas-root"]').first();
    await expect(canvas).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(200);

    await expect(canvas).toHaveScreenshot('theme-dark_scada-ring-lod-2.png', {
      animations: 'disabled',
      caret: 'hide',
    });
  });

  // light_technical theme: TODO — wire after F4 ships theme switcher
  // toggle via data-attribute on body / CSS variable override.
  test.skip('light_technical theme baseline — ring topology @ LOD-2 (TODO F4)', async () => {
    // Will be implemented after F4 (theme switcher exposed in DOM).
    // Acceptance: snapshot uses light_technical palette per V12K-007
    // for export-grade SLD rendering.
  });
});

// LOD-aware snapshots — SKIPPED until F3 wires LOD policy override hook.
// These tests are kept as planning skeletons so updating to enabled is a
// 1-line edit (`test.skip` → `test`) once the runtime hook lands.
test.describe.skip('visual:sld:lod', () => {
  for (const scenarioId of REFERENCE_SCENARIOS) {
    for (const lod of [LOD_OVERVIEW, LOD_PLANVIEW, LOD_TECHNICAL]) {
      test(`reference ${scenarioId} — LOD-${lod}`, async ({ page }) => {
        await page.goto(`/#sld-view?ref=${scenarioId}&lod=${lod}`);
        const canvas = page.locator('[data-testid="sld-canvas-root"]').first();
        await expect(canvas).toBeVisible({ timeout: 15000 });
        await page.waitForTimeout(200);
        await expect(canvas).toHaveScreenshot(`${scenarioId}-lod-${lod}.png`, {
          animations: 'disabled',
          caret: 'hide',
        });
      });
    }
  }
});
