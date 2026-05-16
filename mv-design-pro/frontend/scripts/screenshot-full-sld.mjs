/**
 * Full SLD screenshot — zrzut WIDOCZNEGO schematu po K1..K8.
 * Cele:
 *  1. Aktywuj projekt GN01 (po seed-gn01.mjs case is_active=true).
 *  2. Nawiguj do widoku SLD (root path domyślny renderuje SldWorkspaceContainer).
 *  3. Czekaj na renderowanie symboli (real ENM, NIE placeholder).
 *  4. Zrzut 1920×1080 + 4K dla CAD/SCADA audyt.
 *  5. Sprawdź data-testid="sld-empty-state" — jeśli widoczny, render placeholder.
 *  6. Zlicz <svg> elementów SLD canvas + GpzRenderer / CableRunRenderer instancje.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const OUT = '/home/user/MV-Design-PRO/mv-design-pro/docs/audit/visual_full_scada';
const APP_URL = 'http://127.0.0.1:5173';

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

    // 1. Start na home
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(3000);

    // 2. Klik "Otwórz" na projekcie "GN01 Demo SLD audyt"
    const openBtn = page
      .locator('button:has-text("Otwórz")')
      .first();
    if (await openBtn.count()) {
      await openBtn.click();
      await page.waitForTimeout(3000);
    }

    // 3. Klik "Przejdź do budowy GPZ" jeśli widoczny
    const buildBtn = page
      .locator('button:has-text("Przejdź do budowy GPZ")')
      .first();
    if (await buildBtn.count()) {
      await buildBtn.click();
      await page.waitForTimeout(3000);
    }

    // 4. Hard reload aby załadować snapshot z ENM
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    // 5. Otwórz panel warstw (jeśli widoczny CTA)
    const layerBtn = page
      .locator('[data-testid="sld-layer-panel-toggle"]')
      .first();
    if (await layerBtn.count()) {
      await layerBtn.click();
      await page.waitForTimeout(800);
    }

    // 6. Sprawdź czy empty state widoczny
    const emptyState = await page
      .locator('[data-testid="sld-empty-state"]')
      .count();
    const svgCount = await page.locator('svg').count();
    const renderTimestamp = await page.evaluate(
      () => document.documentElement.dataset.renderTime ?? '-',
    );

    // 7. Zrzut
    const path = `${OUT}/full_sld_${name}.png`;
    await page.screenshot({ path, fullPage: false });
    console.log(
      `[${name}] svg=${svgCount} emptyState=${emptyState} renderTime=${renderTimestamp} errors=${logs.length}`,
    );

    // 8. Zrzut samego canvasu (data-testid sld-workspace-container)
    const canvas = page
      .locator('[data-testid="sld-workspace-container"]')
      .first();
    if (await canvas.count()) {
      await canvas.screenshot({ path: `${OUT}/canvas_only_${name}.png` });
    }

    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
