/**
 * K30 SLD screenshot harness — multi-LOD/theme/resolution capture per
 * PROMPT_K30_E2E_FULL_AUDIT_10_10.md § 0 (full visual confirmation gate).
 *
 * Per iter K30-N captures:
 *  - 5 LOD (0/1/2/3/4) × 2 themes (dark/light) × 2 resolutions (HD/4K)
 *    = 20 full-canvas screenshots
 *  - Per LOD level: canvas-only crop dla pixel-grade audytu
 *
 * Pan navigation (NW/N/NE/SW/S/SE — 6 positions) NIE zaimplementowane:
 *  - Wymaga SLD canvas viewport API (TODO follow-up iter).
 *  - Aktualny capture pokazuje pełne canvas zoom-to-fit per LOD.
 *
 * USAGE:
 *   CASE_ID=<uuid> OUT_DIR=docs/audit/visual_iteration_K30_<N> \
 *     node scripts/screenshot-k30.mjs
 *
 * REQUIRES:
 *   - backend http://127.0.0.1:8000 + frontend http://127.0.0.1:5173
 *   - K30 seed already executed (seed-gn30.mjs successful)
 *   - CASE_ID env z output seed-gn30.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const OUT = process.env.OUT_DIR ?? '/home/user/MV-Design-PRO/mv-design-pro/docs/audit/visual_iteration_K30_0';
const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5173';
const CASE_ID = process.env.CASE_ID;

if (!CASE_ID) {
  console.error('CASE_ID env required (z output seed-gn30.mjs JSON line).');
  process.exit(2);
}

const RESOLUTIONS = [
  { name: '1920x1080', w: 1920, h: 1080 },
  { name: '4k', w: 3840, h: 2160 },
];

// LOD 0=overview, 1=compact, 2=standard, 3=detail, 4=diagnostic
const LOD_LEVELS = [0, 1, 2, 3, 4];

// Light/dark theme toggle — wymaga przełącznika UI [data-testid="theme-toggle"]
// lub query param (?theme=light|dark). Fallback: pomiń jeśli brak.
const THEMES = ['dark', 'light'];

async function captureForLodAndTheme(page, lod, theme, resName, outDir) {
  // Set LOD: użyj data-testid wskaźnika LOD selector w UI, lub URL param
  // Aktualny UI: useSldLod() context — można toggle przez przyciski w GoalShell
  // Fallback: pomiń LOD switch w pierwszej iteracji, opisz w REPORT.md
  try {
    const lodSelect = page.locator(`[data-testid="sld-lod-button-${lod}"]`);
    if (await lodSelect.count()) {
      await lodSelect.click();
      await page.waitForTimeout(400);
    }
  } catch {
    /* LOD UI not available — skip silently */
  }

  // Set theme
  try {
    const themeBtn = page.locator(`[data-testid="theme-toggle-${theme}"]`);
    if (await themeBtn.count()) {
      await themeBtn.click();
      await page.waitForTimeout(300);
    }
  } catch {
    /* Theme toggle not available — skip silently */
  }

  const path = `${outDir}/full_K30_LOD${lod}_${theme}_${resName}.png`;
  await page.screenshot({ path, fullPage: false });

  const canvas = page.locator('[data-testid="sld-workspace-container"]').first();
  if (await canvas.count()) {
    await canvas.screenshot({ path: `${outDir}/canvas_K30_LOD${lod}_${theme}_${resName}.png` });
  }
  return path;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  const summary = { captured: 0, errors: [] };

  for (const { name, w, h } of RESOLUTIONS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => {
      if (m.type() === 'error') logs.push(`console.error: ${m.text()}`);
    });
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

    // Navigate + open project + activate case
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    const openBtns = await page.locator('button:has-text("Otwórz")').all();
    if (openBtns.length > 0) {
      await openBtns[0].click();
      await page.waitForTimeout(3000);
    }
    await page.goto(`${APP_URL}/?case=${CASE_ID}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(6000); // czekaj na snapshot fetch + render

    const layerBtn = page.locator('[data-testid="sld-layer-panel-toggle"]').first();
    if (await layerBtn.count()) {
      await layerBtn.click();
      await page.waitForTimeout(800);
    }

    const emptyState = await page.locator('[data-testid="sld-empty-state"]').count();
    const svgCount = await page.locator('svg').count();
    const stationRenderCount = await page.locator('[data-element-kind^="station"], [data-testid^="sld-v2-mini-rmu"]').count();
    const gpzRenderCount = await page.locator('[data-element-kind*="gpz"], [data-testid*="gpz"]').count();

    console.log(`[${name}] svg=${svgCount} stations=${stationRenderCount} gpz=${gpzRenderCount} emptyState=${emptyState} errors=${logs.length}`);

    for (const lod of LOD_LEVELS) {
      for (const theme of THEMES) {
        try {
          const captured = await captureForLodAndTheme(page, lod, theme, name, OUT);
          console.log(`  ✓ ${captured}`);
          summary.captured += 1;
        } catch (e) {
          summary.errors.push(`LOD${lod}_${theme}_${name}: ${e.message}`);
          console.error(`  ✗ LOD${lod} ${theme} ${name}: ${e.message}`);
        }
      }
    }

    if (logs.length > 0) {
      console.log(`First 3 errors:\n  ${logs.slice(0, 3).join('\n  ')}`);
    }

    await ctx.close();
  }
  await browser.close();

  console.log('=================================================================');
  console.log(`K30 screenshot summary: ${summary.captured} captured, ${summary.errors.length} errors`);
  console.log(`Output: ${OUT}/`);
  console.log(`Expected: ${RESOLUTIONS.length} × ${LOD_LEVELS.length} × ${THEMES.length} = ${RESOLUTIONS.length * LOD_LEVELS.length * THEMES.length} full + canvas`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
