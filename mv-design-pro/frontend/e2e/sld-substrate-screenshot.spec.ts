/**
 * SLD Substrate Screenshot — B-02 feasibility + PNGs.
 *
 * Captures real renders of SldCanvasV3 (F12-C: jedyny render po kasacji sciezki v2) on the ≥52-station substrate
 * (sldSubstrate52s.enm.json) without backend.
 *
 * The harness page is served by Vite at /screenshot-harness.html.
 * Data comes from the committed fixture via buildSldDataFromSnapshot.
 *
 * Outputs committed to docs/audit/visual/ (create dir if missing).
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';

const _dirname = path.dirname(fileURLToPath(import.meta.url));

const HARNESS_URL = adresHarnessu('screenshot-harness.html');
const OUTPUT_DIR = path.resolve(
  _dirname,
  '../../docs/audit/visual',
);

test.describe('sld:substrate:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  test('substrate-53s overview (L0 auto-fit) — save PNG', async ({ page }) => {
    // Collect console errors for diagnosis
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

    await page.goto(HARNESS_URL);

    // Wait for the harness root to signal "ready" (fixture loaded + adapted)
    const harnessRoot = page.locator('[data-testid="sld-harness-root"]').first();
    await expect(harnessRoot).toBeVisible({ timeout: 20000 });
    await expect(harnessRoot).toHaveAttribute('data-status', 'ready', { timeout: 20000 });

    // Wait for the SVG canvas to appear
    const canvas = page.locator('[data-testid="sld-canvas-v3"]').first();
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // Wait for auto-fit to settle
    await page.waitForTimeout(800);

    // Read actual element counts from DOM attributes
    const stationCount = await harnessRoot.getAttribute('data-stations');
    const cableRunCount = await harnessRoot.getAttribute('data-cable-runs');
    const gpzCount = await harnessRoot.getAttribute('data-gpzs');
    const lodAttr = await canvas.getAttribute('data-scene-lod');
    const scaleAttr = await canvas.getAttribute('viewBox');

    console.log(`Harness ready: stations=${stationCount} cable_runs=${cableRunCount} gpzs=${gpzCount}`);
    console.log(`Canvas: lod=${lodAttr} viewBox=${scaleAttr}`);
    if (consoleErrors.length > 0) {
      console.log(`Console errors: ${consoleErrors.join('\n')}`);
    }

    // Capture full-page PNG
    const overviewPath = path.join(OUTPUT_DIR, 'sld_substrate_53_overview.png');
    await page.screenshot({ path: overviewPath, fullPage: false });
    console.log(`Saved: ${overviewPath}`);

    // Also capture just the SVG canvas element
    const canvasPath = path.join(OUTPUT_DIR, 'sld_substrate_53_canvas_only.png');
    await canvas.screenshot({ path: canvasPath });
    console.log(`Saved: ${canvasPath}`);

    // Verify station count is >=52
    expect(Number(stationCount)).toBeGreaterThanOrEqual(52);

    // Verify files were written
    expect(fs.existsSync(overviewPath)).toBe(true);
    expect(fs.existsSync(canvasPath)).toBe(true);
  });

  test('substrate-53s wide viewport (1920x1080) — save PNG', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(HARNESS_URL);

    const harnessRoot = page.locator('[data-testid="sld-harness-root"]').first();
    await expect(harnessRoot).toHaveAttribute('data-status', 'ready', { timeout: 20000 });

    const canvas = page.locator('[data-testid="sld-canvas-v3"]').first();
    await expect(canvas).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(800);

    const widePath = path.join(OUTPUT_DIR, 'sld_substrate_53_1920x1080.png');
    await page.screenshot({ path: widePath, fullPage: false });
    console.log(`Saved: ${widePath}`);
    expect(fs.existsSync(widePath)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // LOD demonstration (M-08 readability fix): L0 = readable blocks, L2 = detail.
  // ---------------------------------------------------------------------------

  test('substrate-53s L0 overview (readable blocks) — save PNG', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    // ?lod=0 forces overview level → stations render as readable BLOCKS
    // (name + readiness), no micro-apparatus clutter (the density fix).
    await page.goto(`${HARNESS_URL}?lod=0`);

    const harnessRoot = page.locator('[data-testid="sld-harness-root"]').first();
    await expect(harnessRoot).toHaveAttribute('data-status', 'ready', { timeout: 20000 });

    const canvas = page.locator('[data-testid="sld-canvas-v3"]').first();
    await expect(canvas).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(900);

    // Count readable blocks vs apparatus detail markers (proves the structural fix).
    // GPZ jest WYŁĄCZONY z licznika aparatury: gramatyka L0 (spec §21/F13.1)
    // renderuje GPZ jako PEŁNY blok rozdzielni (kolumna WN DS/CB/CT + pole
    // liniowe SN) także w widoku planu — intencja M-08 („zero mikro-aparatury")
    // dotyczy STACJI ciągów, nie dominanty GPZ.
    const blocks = await page.locator('[data-symbol-canon="stationCollapsed"]').count();
    // `data-symbol-canon` żyje na glifie, `data-testid` na wrapperze symbolu
    // — wykluczenie GPZ liczone arytmetycznie (total − potomkowie wrapperów
    // gpz-canonical-*), bo CSS :not() nie sięga przodka.
    const APPARATUS = '[data-symbol-canon="breaker"], [data-symbol-canon="disconnector"]';
    const apparatusTotal = await page.locator(APPARATUS).count();
    // Poza licznikiem także LEGENDA arkusza (glify wzorcowe „Wyłącznik"/
    // „Odłącznik" w ramce IEC — nie są aparaturą sieci).
    //
    // NAPRAWA (karta TESTY-DRYF-E2E poz. 5, 2026-08-12; ta sama KLASA co
    // `sld-pa-powerflow-tor.spec.ts` N-1 — dwie RÓWNOLEGŁE rodziny testidów
    // GPZ): wykluczenie znało wyłącznie starszy wrapper `gpz-canonical-*`.
    // Blok GPZ ZWINIĘTY na L0 (`buildScene.ts` ~L2548-2559, symbol
    // „aparat ciągłości" pola odejściowego) renderuje wyłącznik pod TESTIDEM
    // `sld-v3-l0-gpz-bay-*` — INNĄ rodziną (ten sam glif co reszta bloku
    // zwiniętego GPZ, `sld-v3-l0-gpz-*`), więc dawne wykluczenie go nie
    // łapało i liczyło jako „aparaturę stacji" (regres testu, nie produktu:
    // gramatyka L0 §21/F13.1 od początku zakładała PEŁNY blok rozdzielni GPZ
    // — kolumna WN + pole liniowe — na każdym poziomie szczegółu).
    // `closest()` obejmuje SAM element i przodków jedną asercją.
    const apparatusExcluded = await page.locator(APPARATUS).evaluateAll((nodes) =>
      nodes.filter(
        (n) =>
          n.closest('[data-testid^="gpz-canonical-"]') != null
          || n.closest('[data-testid^="sld-v3-l0-gpz-"]') != null
          || n.closest('[data-testid="sld-sheet-legend"]') != null,
      ).length,
    );
    const detail = apparatusTotal - apparatusExcluded;
    const lodAttr = await canvas.getAttribute('data-scene-lod');
    console.log(`L0: blocks=${blocks} aparatura=${detail} data-scene-lod=${lodAttr}`);

    const l0Path = path.join(OUTPUT_DIR, 'sld_substrate_53_L0.png');
    await page.screenshot({ path: l0Path, fullPage: false });
    console.log(`Saved: ${l0Path}`);

    // L0 must render blocks and (near-)zero mini-RMU apparatus across the network.
    expect(blocks).toBeGreaterThanOrEqual(50);
    expect(detail).toBe(0);
    expect(fs.existsSync(l0Path)).toBe(true);
  });

  test('substrate-53s L2 detail (zoomed apparatus) — save PNG', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    // F12-C: ?lod=2 = pelny detal v3 (kontrakt LOD 0..2, spec par. 7);
    // dawny ?focus=auto (v2 centerOnElementId) bez odpowiednika v3 - kadr
    // szczegolu robi clip ponizej.
    await page.goto(`${HARNESS_URL}?lod=2`);

    const harnessRoot = page.locator('[data-testid="sld-harness-root"]').first();
    await expect(harnessRoot).toHaveAttribute('data-status', 'ready', { timeout: 20000 });

    const canvas = page.locator('[data-testid="sld-canvas-v3"]').first();
    await expect(canvas).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(900);

    const blocks = await page.locator('[data-symbol-canon="stationCollapsed"]').count();
    const detail = await page.locator('[data-symbol-canon="breaker"], [data-symbol-canon="disconnector"]').count();
    const lodAttr = await canvas.getAttribute('data-scene-lod');
    console.log(`L2: blocks=${blocks} aparatura=${detail} data-scene-lod=${lodAttr}`);

    const l2Path = path.join(OUTPUT_DIR, 'sld_substrate_53_L2.png');
    await page.screenshot({ path: l2Path, fullPage: false });
    console.log(`Saved: ${l2Path}`);

    // Also capture a clipped region centered on the content so individual
    // apparatus (fields WE/WY/TR, cable heads, results) is legible (zoomed detail).
    const l2DetailPath = path.join(OUTPUT_DIR, 'sld_substrate_53_L2_detail.png');
    await page.screenshot({
      path: l2DetailPath,
      clip: { x: 560, y: 280, width: 800, height: 540 },
    });
    console.log(`Saved: ${l2DetailPath}`);

    // L2 renders full apparatus detail, no overview blocks.
    expect(blocks).toBe(0);
    expect(detail).toBeGreaterThan(0);
    expect(fs.existsSync(l2Path)).toBe(true);
    expect(fs.existsSync(l2DetailPath)).toBe(true);
  });
});
