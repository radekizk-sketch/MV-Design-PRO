/**
 * Karta Z-3 (dowody wizualne — domknięcie pkt 7 karty właściciela): rozpływ
 * prądu zwarciowego (tor Thevenina/sieć nadrzędna + tor maszyny) „pokaż i
 * udowodnij" — tabela sekcji `RozplywZwarciowy` (realny `EkranZwarc`, scena
 * `creator=zwarcia-rozplyw` harnessu kreatorów) ORAZ schemat kanwy v3 z
 * overlayem zwarciowym (strzałki kierunku + znacznik pulse punktu zwarcia,
 * scena `screenshot-harness.html?fixture=gpzFeeder&overlay=faultflow`).
 *
 * Liczby [kA] obu scen pochodzą z JEDNEGO realnego wyniku IEC 60909 solvera
 * na fixturze testu TH-1 (`build_slack_radial_graph` + falownik `INV-B`,
 * `backend/tests/test_short_circuit_iec60909.py::
 * test_thevenin_addition_preserves_inverter_entries_byte_for_byte`) —
 * `creator-harness-main.tsx` (scena `zwarcia-rozplyw`) i
 * `screenshot-harness-main.tsx` (`FAULT_FLOW_DEMO_INPUT`) niosą TĘ SAMĄ
 * wartość Thevenina (5,552132022553349 kA ≈ ik_thevenin_ka) i maszyny
 * (0,024 kA) — jedna narracja, dwa realne render'y.
 *
 * Wyjście: docs/audit/visual/flow-ekspert/zwarcia-{rozplyw,schemat}-{light,dark}.png.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const CREATOR_HARNESS_URL = adresHarnessu('creator-harness.html');
const SCREENSHOT_HARNESS_URL = adresHarnessu('screenshot-harness.html');
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert');
const THEMES = ['light', 'dark'] as const;

test.describe('zwarcia-rozplyw:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of THEMES) {
    test(`Z-3 tabela rozpływu (tor Thevenina + maszyny) — ${theme}`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${CREATOR_HARNESS_URL}?creator=zwarcia-rozplyw&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });
      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

      const sekcja = page.getByTestId('mvd-zwarcia-rozplyw');
      await expect(sekcja).toBeVisible();
      await expect(sekcja).toContainText('Rozpływ prądu zwarciowego');

      const tabela = sekcja.getByTestId('mvd-wyn-tabela');
      // Wiersz sieci nadrzędnej (Thevenin, kolumna „źródło" — tryb ekspercki).
      await expect(sekcja.getByTestId('mvd-wyn-th-zrodlo')).toBeVisible();
      await expect(tabela).toContainText('sieć nadrzędna');
      // Wiersz maszyny (identyfikator falownika, jak w kontrakcie backendu).
      await expect(tabela).toContainText('INV-B');
      // Prąd sieci nadrzędnej [kA] — format PL, przecinek dziesiętny.
      await expect(tabela).toContainText('5,552');
      // Prąd maszyny [kA].
      await expect(tabela).toContainText('0,024');
      // Nazwa gałęzi (wspólna dla obu wpisów — jedna linia niesie oba tory).
      await expect(tabela).toContainText('Linia OZE');

      await page.waitForTimeout(200);
      expect(consoleErrors, `konsola bez błędów (${theme}): ${consoleErrors.join('; ')}`).toEqual([]);

      await sekcja.screenshot({
        path: path.join(OUTPUT_DIR, `zwarcia-rozplyw-${theme}.png`),
      });
    });
  }
});

test.describe('zwarcia-schemat:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of THEMES) {
    test(`Z-3 schemat v3 — strzałki + znacznik pulse punktu zwarcia — ${theme}`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

      await page.setViewportSize({ width: 1440, height: 900 });
      // `lod=0` wymuszony: znacznik pulse dopasowuje się do symbolu STACJI
      // (`stationCollapsed`), obecnego WYŁĄCZNIE na LOD 0 (na LOD 1/2 stacja
      // rozwija się w aparaturę — zweryfikowane sondą na realnej scenie).
      await page.goto(
        `${SCREENSHOT_HARNESS_URL}?fixture=gpzFeeder&overlay=faultflow&lod=0&theme=${theme}`,
        { waitUntil: 'domcontentloaded', timeout: 40000 },
      );
      const root = page.locator('[data-testid="sld-harness-root"]').first();
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 20000 });

      const canvas = page.locator('[data-testid="sld-canvas-v3"]').first();
      await expect(canvas).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(500); // auto-fit kamery

      // Warstwa nakładki zwarciowej realnie wyrenderowana — strzałki (tor
      // Thevenina, gałąź GPZ→Stacja S01 ORAZ tor maszyny, gałąź GPZ→Stacja
      // S02) + znacznik pulse punktu zwarcia (Stacja S01).
      const overlayLayer = page.getByTestId('sld-v3-fault-flow-overlay');
      await expect(overlayLayer).toBeVisible();
      // Grupy strzałek (`data-fault-owner-ref` — karta S-B): sprawdzane przez
      // grupę, nie przez `<line>` samą — oba odcinki są niemal poziome, więc
      // ich SVG bounding box ma znikomą wysokość i Playwright zgłasza je jako
      // „hidden" mimo realnego renderu (artefakt geometrii, nie defekt).
      const arrowGroups = overlayLayer.locator('[data-fault-owner-ref]');
      await expect(arrowGroups).toHaveCount(2);
      const arrowGroup = arrowGroups.first();
      await expect(arrowGroup).toBeVisible();
      const arrowLine = arrowGroup.locator('[data-testid$="-line"]').first();
      await expect(arrowLine).toBeAttached();
      const arrowHead = arrowGroup.locator('[data-testid$="-head"]').first();
      await expect(arrowHead).toBeVisible();
      const marker = overlayLayer.getByTestId('sld-v3-fault-point-marker');
      await expect(marker).toBeVisible();
      await expect(overlayLayer.getByTestId('sld-v3-fault-point-marker-dot')).toBeVisible();
      await expect(overlayLayer.getByTestId('sld-v3-fault-point-marker-pulse')).toBeVisible();

      // Etykiety UCZCIWE: tor Thevenina „5,6 kA", tor maszyny w amperach
      // („24 A" — zaokrąglenie do „0,0 kA" fałszowałoby realny wkład).
      await expect(overlayLayer).toContainText('5,6 kA');
      await expect(overlayLayer).toContainText('24 A');

      // Kadr do oceny właściciela bez legendy symboli arkusza (nakładała się
      // na tor rozpływu w małej fixturze) — ukrycie CZYSTO prezentacyjne,
      // wyłącznie na czas zrzutu (bez zmiany produkcyjnego renderu).
      await page.addStyleTag({ content: '[data-testid="sld-sheet-legend"]{display:none}' });

      await page.waitForTimeout(200);
      expect(consoleErrors, `konsola bez błędów (${theme}): ${consoleErrors.join('; ')}`).toEqual([]);

      // Kadr zawężony do warstwy nakładki (obie strzałki + znacznik pulse,
      // unia bounding boxów obu grup + znacznika) — odcinki S01/S02 leżą
      // blisko siebie geometrycznie (8 px świata, realny layout — zweryfikowane
      // sondą), pełny kadr arkusza rozmywałby je wśród legendy symboli powyżej.
      const arrowBoxes = await Promise.all((await arrowGroups.all()).map((locator) => locator.boundingBox()));
      const markerBox = await marker.boundingBox();
      const boxes = [...arrowBoxes, markerBox].filter((box): box is NonNullable<typeof box> => box !== null);
      if (boxes.length === 0) throw new Error('brak bounding box warstwy nakładki');
      const canvasBox = await canvas.boundingBox();
      if (!canvasBox) throw new Error('brak bounding box kanwy');
      const padding = 60;
      const unionLeft = Math.min(...boxes.map((b) => b.x));
      const unionTop = Math.min(...boxes.map((b) => b.y));
      const unionRight = Math.max(...boxes.map((b) => b.x + b.width));
      const unionBottom = Math.max(...boxes.map((b) => b.y + b.height));
      const clipLeft = Math.max(canvasBox.x, unionLeft - padding);
      const clipTop = Math.max(canvasBox.y, unionTop - padding);
      const clipRight = Math.min(canvasBox.x + canvasBox.width, unionRight + padding);
      const clipBottom = Math.min(canvasBox.y + canvasBox.height, unionBottom + padding);
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `zwarcia-schemat-${theme}.png`),
        clip: { x: clipLeft, y: clipTop, width: clipRight - clipLeft, height: clipBottom - clipTop },
      });
    });
  }
});
