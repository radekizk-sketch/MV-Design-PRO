/**
 * K20 full SLD screenshot — capture audit-grade scr po seed-gn20.mjs.
 *
 * Otwiera pierwszy projekt na liście (GN20 = most recent = first), waits
 * for SLD render, captures full canvas at 1920×1080 + 4K dla pixel-grade
 * audytu.
 *
 * USAGE: node scripts/screenshot-k20.mjs
 * REQUIRES:
 *   - backend up at http://127.0.0.1:8000
 *   - frontend dev at http://127.0.0.1:5173
 *   - GN20 project as most recent (run seed-gn20.mjs first)
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const OUT = process.env.OUT_DIR ?? '/home/user/MV-Design-PRO/mv-design-pro/docs/audit/visual_iteration_K20';
const APP_URL = 'http://127.0.0.1:5173';
// Z seed-gn20.mjs ostatniego uruchomienia (DER fix iter):
const CASE_ID = process.env.CASE_ID ?? '1a97f232-1c67-4828-986d-1096f4978792';

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  for (const { name, w, h } of [
    { name: '1920x1080', w: 1920, h: 1080 },
    { name: '4k', w: 3840, h: 2160 },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => {
      if (m.type() === 'error') logs.push(`console.error: ${m.text()}`);
    });
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

    // Step 1: home + click "Otwórz" na GN20 (najpierw)
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Znajdź najnowszy GN20 project (button "Otwórz" z najnowszym project name)
    const openBtns = await page.locator('button:has-text("Otwórz")').all();
    if (openBtns.length > 0) {
      await openBtns[0].click();
      await page.waitForTimeout(3000);
    }

    // Step 2: navigate to URL z ?case=<caseId> żeby aktywować case
    await page.goto(`${APP_URL}/?case=${CASE_ID}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(6000); // czekaj na snapshot fetch + render SLD

    // Open layer panel
    const layerBtn = page.locator('[data-testid="sld-layer-panel-toggle"]').first();
    if (await layerBtn.count()) {
      await layerBtn.click();
      await page.waitForTimeout(800);
    }

    const emptyState = await page.locator('[data-testid="sld-empty-state"]').count();
    const svgCount = await page.locator('svg').count();
    const stationRenderCount = await page.locator('[data-element-kind^="station"], [data-testid^="sld-v2-mini-rmu"]').count();
    const gpzRenderCount = await page.locator('[data-element-kind*="gpz"], [data-testid*="gpz"]').count();

    const path = `${OUT}/full_K20_${name}.png`;
    await page.screenshot({ path, fullPage: false });
    console.log(
      `[${name}] svg=${svgCount} stations=${stationRenderCount} gpz=${gpzRenderCount} emptyState=${emptyState} errors=${logs.length}`,
    );

    const canvas = page.locator('[data-testid="sld-workspace-container"]').first();
    if (await canvas.count()) {
      await canvas.screenshot({ path: `${OUT}/canvas_only_${name}.png` });
    }

    if (logs.length > 0) {
      console.log(`First 3 errors:\n  ${logs.slice(0, 3).join('\n  ')}`);
    }

    await ctx.close();
  }
  await browser.close();

  console.log(`Output: ${OUT}/`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
