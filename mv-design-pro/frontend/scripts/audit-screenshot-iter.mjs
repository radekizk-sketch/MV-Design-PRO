/**
 * Iter 1 — Screenshot harness dla audytu wizualnego SLD.
 *
 * Łapie stronę dev (frontend-only, bez backendu) w 4 trybach viewport:
 * - desktop_1920 (1920×1080)
 * - desktop_4k (3840×2160)
 *
 * Bez backendu nie da się załadować referencyjnych sieci GN01..GN05, więc
 * iteracja 1 = baseline pustego app shell + dowolne stub state które
 * renderuje się bez API. To pozwala zespołowi specjalistów ocenić punkt
 * startowy 0/10.
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT_DIR = resolve(
  '/home/user/MV-Design-PRO/mv-design-pro/docs/audit/visual_iteration_1',
);
const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5173';

const VIEWPORTS = [
  { name: '1920x1080', w: 1920, h: 1080 },
  { name: '4k_3840x2160', w: 3840, h: 2160 },
];

const ROUTES = [
  { name: 'home', path: '/' },
  { name: 'projects', path: '/projects' },
  { name: 'sld', path: '/sld' },
  { name: 'workspace', path: '/workspace' },
  { name: 'designer', path: '/designer' },
  { name: 'study-cases', path: '/study-cases' },
];

async function captureRoute(browser, viewport, route) {
  const context = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.h },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  const url = APP_URL + route.path;
  let status = 'OK';
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(1500); // settle async renders
  } catch (e) {
    status = `NAV_FAIL: ${e.message}`;
  }
  const fileName = `${route.name}_${viewport.name}.png`;
  const path = resolve(OUT_DIR, fileName);
  try {
    await page.screenshot({ path, fullPage: false });
  } catch (e) {
    status = `SCREENSHOT_FAIL: ${e.message}`;
  }
  await context.close();
  return { route: route.name, viewport: viewport.name, status, errors, file: fileName };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const v of VIEWPORTS) {
    for (const r of ROUTES) {
      const result = await captureRoute(browser, v, r);
      results.push(result);
      console.log(
        `[${result.status === 'OK' ? '+' : '!'}] ${r.path} @ ${v.name} → ${result.file} (${result.status})`,
      );
      if (result.errors.length > 0) {
        console.log(`    errors: ${result.errors.slice(0, 3).join(' | ')}`);
      }
    }
  }
  await browser.close();

  // Write index.json with metadata
  const { writeFile } = await import('node:fs/promises');
  await writeFile(
    resolve(OUT_DIR, 'index.json'),
    JSON.stringify(
      { iteration: 1, appUrl: APP_URL, viewports: VIEWPORTS, results },
      null,
      2,
    ),
    'utf-8',
  );
  console.log(`\nDone. ${results.length} screenshots in ${OUT_DIR}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
