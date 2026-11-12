/**
 * POLA GPZ Z SZABLONÓW ENEA — zrzuty pól Z.7, Z.12, Z.13, Z.14, Z.15, Z.16, Z.17 i całej
 * rozdzielnicy z polem zespołu uziemiającego (karta POLA-GPZ-SZABLONY).
 *
 * Fikstury `gpz110kvPolaSzablonow` i `gpz110kvPoleZu{Z13,Z14,Z15}` (`public/test-fixtures/`)
 * powstają z generatora `backend/tests/reference_networks/fikstury_enm_sld.py` (operacje
 * domenowe: `add_sn_bay` + `set_bay_equipment` szablonem pola GPZ). Jeden zespół uziemiający
 * w wyspie galwanicznej SN (bloker E-W5-04), więc Z.14 i Z.15 mają własne sceny. Harness
 * `screenshot-harness.html`, OBA motywy, poziom detalu L2.
 *
 * Spec sprawdza WYŁĄCZNIE fakty strukturalne DOM (pole ma narysowane elementy; pole ZU ma
 * transformator ZNyn11 z wyprowadzonym punktem neutralnym i aparaty gałęzi punktu neutralnego
 * wariantu) i zapisuje PNG. Werdykt wizualny NALEŻY DO WŁAŚCICIELA (zasada nr 2, B-02).
 * Zrzuty do dokumentacji: `ZRZUTY_DO_DOKUMENTACJI=1` (`e2e/katalogZrzutow.ts`).
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';
import { katalogZrzutow } from './katalogZrzutow';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('screenshot-harness.html');
const OUTPUT_DIR = katalogZrzutow(path.resolve(_dirname, '../../docs/uiux/zrzuty/pola-gpz'));
const FIKSTURY = path.resolve(_dirname, '../public/test-fixtures');

interface PoleFikstury {
  readonly ref_id: string;
  readonly bay_role: string;
  readonly bay_template_ref?: string | null;
}

function polaFikstury(fikstura: string): readonly PoleFikstury[] {
  const dane = JSON.parse(fs.readFileSync(path.join(FIKSTURY, `${fikstura}.enm.json`), 'utf-8')) as {
    enm: { bays: PoleFikstury[] };
  };
  return dane.enm.bays;
}

/** Kadr pola: plik, fikstura, szablon (fragment `bay_template_ref`), aparaty gałęzi ZU. */
const KADRY = [
  { plik: 'pole-z7', fikstura: 'gpz110kvPolaSzablonow', szablon: '_enea_z7' },
  { plik: 'pole-z12', fikstura: 'gpz110kvPolaSzablonow', szablon: '_enea_z12' },
  { plik: 'pole-z13', fikstura: 'gpz110kvPoleZuZ13', szablon: '_enea_z13', galezie: ['coil'] },
  { plik: 'pole-z14', fikstura: 'gpz110kvPoleZuZ14', szablon: '_enea_z14', galezie: ['coil', 'resistor'] },
  { plik: 'pole-z15', fikstura: 'gpz110kvPoleZuZ15', szablon: '_enea_z15', galezie: ['resistor'] },
  { plik: 'pole-z16', fikstura: 'gpz110kvPolaSzablonow', szablon: '_enea_z16' },
  { plik: 'pole-z17', fikstura: 'gpz110kvPolaSzablonow', szablon: '_enea_z17' },
] as const;

async function otworzHarness(page: Page, fikstura: string, theme: 'dark' | 'light'): Promise<string[]> {
  await page.setViewportSize({ width: 1800, height: 1100 });
  const bledy: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') bledy.push(msg.text());
  });
  page.on('pageerror', (err) => bledy.push(`PAGEERROR: ${err.message}`));
  await page.goto(`${HARNESS_URL}?fixture=${fikstura}&theme=${theme}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await expect(page.locator('[data-testid="sld-harness-root"]').first()).toHaveAttribute('data-status', 'ready', {
    timeout: 20_000,
  });
  await expect(page.locator('[data-testid="sld-canvas-v3"]').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(900);
  return bledy;
}

/** Ramka ekranowa wszystkich elementów pola (testId z refem pola) — sonda DOM, nie zgadywanie. */
async function ramkaPola(page: Page, bayRef: string): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate((ref) => {
    const kanwa = document.querySelector('[data-testid="sld-canvas-v3"]');
    // Rysunek pola: prefiks `gpz-canonical-bay-⟨ref⟩` i tło pola `sld-v3-gpz-panel-⟨ref⟩` (tło
    // obejmuje tusz pola razem z podpisami, które nie niosą `data-testid`; tabela pól na arkuszu
    // też jest w kanwie, więc samo „zawiera ref” brało pół ekranu).
    const elementy = [...(kanwa?.querySelectorAll('[data-testid]') ?? [])].filter((el) => {
      const id = el.getAttribute('data-testid') ?? '';
      return id.startsWith(`gpz-canonical-bay-${ref}`) || id === `sld-v3-gpz-panel-${ref}`;
    });
    if (elementy.length === 0) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const el of elementy) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      x0 = Math.min(x0, r.left);
      y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right);
      y1 = Math.max(y1, r.bottom);
    }
    return Number.isFinite(x0) ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
  }, bayRef);
}

test.describe('pola-gpz:screenshot — pola GPZ z szablonów ENEA Zeszyt 1', () => {
  test.use({ deviceScaleFactor: 2 });

  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const kadr of KADRY) {
    for (const theme of ['dark', 'light'] as const) {
      test(`${kadr.plik} — motyw ${theme} — pole narysowane, zapis PNG`, async ({ page }) => {
        const pole = polaFikstury(kadr.fikstura).find((b) => (b.bay_template_ref ?? '').includes(kadr.szablon));
        expect(pole, `fikstura ${kadr.fikstura} bez pola szablonu ${kadr.szablon}`).toBeDefined();
        const bledy = await otworzHarness(page, kadr.fikstura, theme);
        expect(bledy, bledy.join('\n')).toEqual([]);

        if ('galezie' in kadr) {
          const prefiks = `gpz-canonical-bay-${pole!.ref_id}`;
          const tr = page.locator(`[data-testid="${prefiks}-transformer2W"]`);
          await expect(tr).toHaveCount(1);
          await expect(tr.locator('[data-punkt-neutralny="wyprowadzony"]')).toHaveCount(1);
          for (const rodzaj of ['coil', 'resistor'] as const) {
            const galaz = rodzaj === 'coil' ? 'dlawik' : 'rezystor';
            await expect(
              page.locator(`[data-testid="${prefiks}-zespol-${galaz}-aparat"] [data-earthing-kind="${rodzaj}"], [data-testid="${prefiks}-zespol-${galaz}-aparat"][data-earthing-kind="${rodzaj}"]`),
            ).toHaveCount((kadr.galezie as readonly string[]).includes(rodzaj) ? 1 : 0);
          }
        }

        await expect(page.locator(`[data-testid="sld-v3-gpz-panel-${pole!.ref_id}"]`)).toHaveCount(1);
        const ramka = await ramkaPola(page, pole!.ref_id);
        expect(ramka, `pole ${pole!.ref_id} bez elementów na rysunku`).not.toBeNull();
        const margines = 40;
        const plik = path.join(OUTPUT_DIR, `${kadr.plik}-${theme === 'dark' ? 'ciemny' : 'jasny'}.png`);
        await page.screenshot({
          path: plik,
          clip: {
            x: Math.max(0, ramka!.x - margines),
            y: Math.max(0, ramka!.y - margines),
            width: ramka!.width + 2 * margines,
            height: ramka!.height + 2 * margines,
          },
        });
        expect(fs.existsSync(plik)).toBe(true);
      });
    }
  }

  for (const theme of ['dark', 'light'] as const) {
    test(`rozdzielnica z polem ZU (Z.13) i polami Z.7, Z.12, Z.16, Z.17 — motyw ${theme}`, async ({ page }) => {
      const bledy = await otworzHarness(page, 'gpz110kvPolaSzablonow', theme);
      expect(bledy, bledy.join('\n')).toEqual([]);
      const plik = path.join(OUTPUT_DIR, `rozdzielnica-pola-zu-${theme === 'dark' ? 'ciemny' : 'jasny'}.png`);
      await page.screenshot({ path: plik, fullPage: false });
      expect(fs.existsSync(plik)).toBe(true);
    });
  }
});
