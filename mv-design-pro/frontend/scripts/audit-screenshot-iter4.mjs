/**
 * Iter 2.5 — Interactive Playwright walkthrough.
 *
 * Otwórz projekt, kliknij CTA do budowy GPZ, zrzuć każdy widok.
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT_DIR = resolve(
  '/home/user/MV-Design-PRO/mv-design-pro/docs/audit/visual_iteration_4',
);
const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5173';

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  const log = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') log.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => log.push(`pageerror: ${err.message}`));

  // 1. Start screen
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: resolve(OUT_DIR, 'walk_01_dashboard.png'),
    fullPage: false,
  });

  // 2. Kliknij "Otwórz" na projekcie Demo SLD Audit
  try {
    const openBtn = page.locator('button:has-text("Otwórz")').first();
    if (await openBtn.count()) {
      await openBtn.click();
      await page.waitForTimeout(2500);
      await page.screenshot({
        path: resolve(OUT_DIR, 'walk_02_project_open.png'),
        fullPage: false,
      });
    } else {
      log.push('no "Otwórz" button found');
    }
  } catch (e) {
    log.push(`open click failed: ${e.message}`);
  }

  // 3. Kliknij "Przejdź do budowy GPZ"
  try {
    const buildBtn = page
      .locator('button:has-text("Przejdź do budowy GPZ")')
      .first();
    if (await buildBtn.count()) {
      await buildBtn.click();
      await page.waitForTimeout(2500);
      await page.screenshot({
        path: resolve(OUT_DIR, 'walk_03_build_gpz_view.png'),
        fullPage: false,
      });
    } else {
      log.push('no "Przejdź do budowy GPZ" button found');
    }
  } catch (e) {
    log.push(`build click failed: ${e.message}`);
  }

  // 4. Zrzut canvas SLD jeśli istnieje
  try {
    const canvasArea = page.locator('[data-testid*="sld"], svg').first();
    if (await canvasArea.count()) {
      await canvasArea.screenshot({
        path: resolve(OUT_DIR, 'walk_04_sld_canvas.png'),
      });
    }
  } catch (e) {
    log.push(`canvas screenshot failed: ${e.message}`);
  }

  // 5. Full page after navigation
  await page.screenshot({
    path: resolve(OUT_DIR, 'walk_05_final_state.png'),
    fullPage: false,
  });

  // 6. Próba kliknąć "Dodaj GPZ jako pierwszy element"
  try {
    const addGpzBtn = page
      .locator('text=/Dodaj GPZ.*pierwsz/i')
      .first();
    if (await addGpzBtn.count()) {
      await addGpzBtn.click();
      await page.waitForTimeout(2500);
      await page.screenshot({
        path: resolve(OUT_DIR, 'walk_06_add_gpz_clicked.png'),
        fullPage: false,
      });
    } else {
      log.push('no "Dodaj GPZ" button found');
    }
  } catch (e) {
    log.push(`add GPZ click failed: ${e.message}`);
  }

  // 7. Try left sidebar items
  for (const item of ['Schemat', 'Studia', 'Wyniki', 'Katalogi']) {
    try {
      const sidebarItem = page.locator(`text="${item}"`).first();
      if (await sidebarItem.count()) {
        await sidebarItem.click();
        await page.waitForTimeout(1500);
        await page.screenshot({
          path: resolve(OUT_DIR, `walk_07_sidebar_${item.toLowerCase()}.png`),
          fullPage: false,
        });
      }
    } catch (e) {
      log.push(`sidebar ${item} click failed: ${e.message}`);
    }
  }

  await context.close();
  await browser.close();

  await writeFile(
    resolve(OUT_DIR, 'walkthrough_log.json'),
    JSON.stringify({ log, appUrl: APP_URL }, null, 2),
    'utf-8',
  );
  console.log(`Done. Log entries: ${log.length}`);
  for (const e of log.slice(0, 20)) console.log(' -', e);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
