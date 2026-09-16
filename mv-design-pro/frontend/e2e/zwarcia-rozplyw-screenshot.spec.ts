/**
 * Karta Z-3 (dowody wizualne — domknięcie pkt 7 karty właściciela): rozpływ
 * prądu zwarciowego (tor Thevenina/sieć nadrzędna + tor maszyny) „pokaż i
 * udowodnij" — tabela sekcji `RozplywZwarciowy` (realny `EkranZwarc`, scena
 * `creator=zwarcia-rozplyw` harnessu kreatorów) ORAZ schemat kanwy v3 z
 * overlayem zwarciowym (strzałki kierunku + znacznik pulse punktu zwarcia,
 * scena `screenshot-harness.html?fixture=gpzFeeder&overlay=faultflow`).
 *
 * HARNESS-ZWARCIA-Z-BACKENDU (2026-09-16): tabela `zwarcia-rozplyw:screenshot`
 * niesie liczby [kA] z REALNEGO biegu backendu (`short_circuit_sn` na sieci
 * złotej `build_golden_enm`, `eksport_fixtur_harnessu.py::
 * zwarcia_rozplyw_scena_zwarcia`) — punkt „Szyna SN" (pierwszy wg sortu
 * kanonicznego, bez preselekcji), tor sieci nadrzędnej (`THEVENIN_GRID`,
 * gałąź „TR 110/15") ORAZ tor falownika (`gen_pv`, gałąź „TR 15/0.4").
 *
 * HARNESS-RESZTA (kontynuacja, 2026-09-16, ścieżka b): schemat
 * `zwarcia-schemat:screenshot` DOMKNIĘTY — dawny dług (dawna fixtura testu
 * TH-1, `build_slack_radial_graph` + falownik `INV-B`, liczby POŻYCZONE z
 * INNEJ sieci niż renderowana) zastąpiony REALNYM biegiem `short_circuit_sn`
 * na KOPII gpzFeeder z dołożonym falownikiem Stacji S02
 * (`eksport_fixtur_harnessu.py::falowniki_rozplyw_scena_gpz_feeder_wynik`,
 * `screenshot-harness-main.tsx`/`FAULT_FLOW_DEMO_INPUT`). Przy okazji
 * naprawiony u źródła napotkany defekt klasy (`enm/canonical_analysis.py::
 * _sc_rozplyw_galeziowy`): `branch_id`/`from_node_id`/`to_node_id` niosły
 * klucz wewnętrzny grafu solvera zamiast `ref_id` domenowego — nakładka
 * strzałek na KAŻDEJ realnej sieci wychodziła pusta przed naprawą (zmierzone
 * sondą, `tests/enm/test_rozplyw_zwarciowy_przenosnosc.py`). Obie sceny nadal
 * NIE dzielą wspólnych liczb — każda ma WŁASNE realne źródło (gpzFeeder+
 * falownik S02 dla schematu, sieć złota dla tabeli).
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
      // Kolumna „źródło" (tryb ekspercki) — nagłówek kolumny, niezależny od danych.
      await expect(sekcja.getByTestId('mvd-wyn-th-zrodlo')).toBeVisible();
      // Wiersz sieci nadrzędnej (Thevenin, `source_id="THEVENIN_GRID"` -> PL).
      await expect(tabela).toContainText('sieć nadrzędna');
      // Wiersz maszyny (identyfikator falownika `gen_pv`, jak w kontrakcie backendu
      // — `zrodloRozplywuPL` pokazuje surowy `source_id`, gdy nie jest THEVENIN_GRID).
      await expect(tabela).toContainText('gen_pv');
      // Prąd sieci nadrzędnej [kA] w torze dominującym (gałąź TR 110/15) — format PL.
      await expect(tabela).toContainText('8,312');
      // Prąd falownika [kA] w torze TR 15/0.4.
      await expect(tabela).toContainText('0,017');
      // Nazwy gałęzi realne (tor sieci nadrzędnej i tor falownika idą RÓŻNYMI
      // gałęziami w tej sieci — inaczej niż w dawnej fixturze TH-1 z jedną linią).
      await expect(tabela).toContainText('TR 110/15');
      await expect(tabela).toContainText('TR 15/0.4');

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

      // Etykiety UCZCIWE: tor Thevenina „9,1 kA" (realny bieg gpzFeeder, GPZ
      // 250 MVA), tor falownika w amperach („16 A" — falownik 0,4 MW Stacji
      // S02; zaokrąglenie do „0,0 kA" fałszowałoby realny wkład).
      await expect(overlayLayer).toContainText('9,1 kA');
      await expect(overlayLayer).toContainText('16 A');

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
