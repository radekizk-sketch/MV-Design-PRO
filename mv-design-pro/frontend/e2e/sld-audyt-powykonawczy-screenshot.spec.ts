/**
 * AUDYT POWYKONAWCZY SLD (zadanie #76, dyrektywa właściciela 2026-07-23:
 * „SLD brak odbioru bez audytu ekranów — daj ekrany i sporządź audyt powykonawczy
 * zespołu ekspertów i poprawiaj").
 *
 * Ten spec dostarcza MATERIAŁ DO OGLĘDZIN: świeże renders HEAD na sieci wzorcowej
 * (≥52 stacje), po jednym kadrze na poziom detalu L0/L1/L2 w obu motywach. Nie jest
 * testem regresji wizualnej — jest generatorem dowodu do audytu wielosoczewkowego
 * (projektant SN, zwarciowiec/rozdzielnie, SCADA/UX, kartografia layoutu, kanon LOD).
 *
 * Poziomy wg `docs/sld/SLD_LOD_SPEC_OPERATOR_GRADE.md` §2:
 *   L0 — mapa sieci (bloki kompaktowe, przebiegi kabli),
 *   L1 — sieć terenowa (+ rozdzielnia GPZ, sekcje, głowice pól, NOP),
 *   L2 — obiekty i pola (+ detal stacji, aparaty, DER pełny).
 *
 * Bramki, które spec sprawdza po drodze (żeby zrzut nie kłamał):
 *   - kanwa faktycznie wyrenderowana (nie pusty SVG),
 *   - wymuszony poziom detalu DOTARŁ do kanwy (`data-lod-override`),
 *   - zero błędów konsoli — zrzut z wywróconym renderem nie jest materiałem audytu.
 *
 * Wyjście: docs/audit/visual/sld_audyt/sld_L<poziom>_<motyw>.png
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/screenshot-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/sld_audyt');

const POZIOMY = [0, 1, 2] as const;
const MOTYWY = ['light', 'dark'] as const;

/** Minimalna liczba stacji sieci wzorcowej — zrzut z ubogiego modelu nie jest audytem. */
const MIN_STACJI = 52;

async function otworzKanwe(page: Page, lod: number, motyw: string): Promise<string[]> {
  const bledy: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') bledy.push(msg.text());
  });
  page.on('pageerror', (err) => bledy.push(`PAGEERROR: ${err.message}`));

  await page.goto(`${HARNESS_URL}?lod=${lod}&theme=${motyw}`, { waitUntil: 'networkidle' });

  const korzen = page.locator('[data-testid="sld-harness-root"]').first();
  await expect(korzen).toBeVisible({ timeout: 20000 });
  await expect(korzen).toHaveAttribute('data-status', 'ready', { timeout: 20000 });

  // Wymuszony poziom detalu MUSI dotrzec do kanwy — inaczej wszystkie trzy kadry
  // pokazywalyby ten sam LOD i audyt oceniałby nieistniejący stan.
  await expect(korzen).toHaveAttribute('data-lod-override', String(lod));

  // Sieć wzorcowa, nie model demonstracyjny.
  const stacje = Number(await korzen.getAttribute('data-stations'));
  expect(stacje, `sieć wzorcowa ma mieć >= ${MIN_STACJI} stacji, jest ${stacje}`).toBeGreaterThanOrEqual(
    MIN_STACJI,
  );

  const kanwa = page.locator('[data-testid="sld-canvas-v3"]').first();
  await expect(kanwa).toBeVisible({ timeout: 15000 });

  // Kanwa nie moze byc pusta — pusty SVG wyglada na zrzucie jak „czysty schemat".
  const liczbaElementow = await kanwa.locator('g, path, rect, line, text').count();
  expect(liczbaElementow, 'kanwa SLD jest pusta — zrzut nie jest materiałem audytu').toBeGreaterThan(
    50,
  );

  await page.waitForTimeout(900); // auto-fit + ustalenie etykiet
  return bledy;
}

test.describe('SLD — audyt powykonawczy: ekrany L0/L1/L2', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const lod of POZIOMY) {
    for (const motyw of MOTYWY) {
      test(`poziom L${lod} (${motyw})`, async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        const bledy = await otworzKanwe(page, lod, motyw);

        await page.screenshot({
          path: path.join(OUTPUT_DIR, `sld_L${lod}_${motyw}.png`),
          fullPage: false,
        });

        expect(bledy, `bledy konsoli przy L${lod}/${motyw}: ${bledy.join(' | ')}`).toEqual([]);
      });
    }
  }
});
