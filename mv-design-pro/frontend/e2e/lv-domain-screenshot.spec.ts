/**
 * DOWÓD WIZUALNY projekcji domeny nN — `LvDomainView` na harnessie
 * `lv-domain-harness.html` (kanon `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md`
 * §4 — LOD 0/1/2 projekcji nN na jednej geometrii; projekcja SN z portalem:
 * `e2e/lv-portal-screenshot.spec.ts`).
 *
 * MACIERZ KADRÓW = [4 warianty topologii] × [3 poziomy szczegółowości] ×
 * [2 motywy] = 24 zrzuty:
 *  - dwie sekcje ze sprzęgłem OTWARTYM i ZAMKNIĘTYM (dowód, że stan
 *    sekcjonowania zmienia rysunek, a nie animację symbolu),
 *  - rozdzielnica z incomerem i pełnym torem odpływów,
 *  - energizacja i wyspy (szyna bez napięcia + wyspa zasilana z DER).
 *
 * BRAMKI KLASY (liczone w tym specu, nie „na oko"):
 *  1. każdy kadr jasny różni się BAJTOWO od swojego odpowiednika ciemnego —
 *     motyw musi realnie sterować paletą rysunku, a nie tylko atrybutem na
 *     dokumencie (deklaracja motywu bez pokrycia była tu zastanym długiem);
 *  2. każdy poziom szczegółowości tej samej fixtury różni się BAJTOWO od
 *     pozostałych — poziom, który nic nie zmienia, jest atrapą.
 * Ciągłość TORU między poziomami (to, czego bramka bajtowa NIE sprawdzi)
 * jest przypięta osobno, w `src/ui/sld/v3/lv-domain/__tests__/
 * lodProjekcjaNn.test.tsx` — porównaniem wszystkich prymitywów rysunku.
 *
 * WERDYKT WIZUALNY NALEŻY DO WŁAŚCICIELA (zasada nr 2 CLAUDE.md): ten spec
 * generuje PNG i sprawdza kontrakt DOM (obecność węzłów/krawędzi toru oraz
 * oznaczeń stanu), nie certyfikuje jakości wizualnej.
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/lv-domain-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual');

const POZIOMY = [0, 1, 2] as const;
const MOTYWY = ['dark', 'light'] as const;

interface WariantKadru {
  /** Człon nazwy pliku: `lv_domain_<slug>_lod<n>_<motyw>.png`. */
  readonly slug: string;
  readonly opis: string;
  readonly query: string;
  /** Kontrakt DOM sprawdzany PRZED każdym zrzutem tego wariantu. */
  readonly asercjeDom: (page: Page) => Promise<void>;
}

async function widocznyWezel(page: Page, testId: string): Promise<void> {
  await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible();
}

const WARIANTY: readonly WariantKadru[] = [
  {
    slug: 'multi_qbc-open',
    opis: 'dwie sekcje, sprzęgło OTWARTE',
    query: 'fixture=multi&qbc=open',
    asercjeDom: async (page) => {
      await widocznyWezel(page, 'lv-domain-node-anchor:tr1');
      await widocznyWezel(page, 'lv-domain-node-anchor:tr2');
      await widocznyWezel(page, 'lv-domain-node-pv1');
      await widocznyWezel(page, 'lv-domain-node-coupler');
      await widocznyWezel(page, 'lv-domain-node-boundary:tie_to_other');
      await widocznyWezel(page, 'lv-domain-node-boundary-terminal:tie_to_other');
      await expect(page.locator('[data-testid="lv-domain-edge-coupler"]')).toHaveAttribute('data-edge-kind', 'coupler');
      // Stan OTWARTY niesie SYMBOL (pusty korpus) — na każdym poziomie.
      await expect(
        page.locator('[data-testid="lv-domain-node-coupler"] g[data-symbol-canon="nnBreaker"] rect'),
      ).toHaveAttribute('fill', 'none');
    },
  },
  {
    slug: 'multi_qbc-closed',
    opis: 'dwie sekcje, sprzęgło ZAMKNIĘTE',
    query: 'fixture=multi&qbc=closed',
    asercjeDom: async (page) => {
      await widocznyWezel(page, 'lv-domain-node-anchor:tr1');
      await widocznyWezel(page, 'lv-domain-node-anchor:tr2');
      await widocznyWezel(page, 'lv-domain-node-coupler');
      await expect(
        page.locator('[data-testid="lv-domain-node-coupler"] g[data-symbol-canon="nnBreaker"] rect'),
      ).not.toHaveAttribute('fill', 'none');
    },
  },
  {
    slug: 'stationC',
    opis: 'rozdzielnica z incomerem, trzy odpływy w pełnym torze, źródło PV w pełnym torze',
    query: 'fixture=stationC',
    asercjeDom: async (page) => {
      await widocznyWezel(page, 'lv-domain-node-stnC/QF-TR1');
      await widocznyWezel(page, 'lv-domain-node-stnC/nn_lv_terminal');
      await widocznyWezel(page, 'lv-domain-node-stnC/PV1');
      await widocznyWezel(page, 'lv-domain-node-stnC/QF-03');
      await expect(page.locator('[data-testid="lv-domain-edge-stnC/kabel_QF-03"]')).toHaveAttribute('data-edge-kind', 'cable');
    },
  },
  {
    slug: 'island',
    opis: 'energizacja i wyspy: szyna bez napięcia + wyspa zasilana wyłącznie z DER',
    query: 'fixture=island',
    asercjeDom: async (page) => {
      await widocznyWezel(page, 'lv-domain-node-stnW/RGNN-A');
      await widocznyWezel(page, 'lv-domain-node-stnW/RGNN-B');
      await widocznyWezel(page, 'lv-domain-node-stnW/PV-D');
      // Stan zasilania jest widoczny na KAŻDYM poziomie (stan ruchowy).
      await expect(page.locator('[data-testid="lv-domain-node-stnW/RGN-C"]')).toHaveAttribute('data-energized', 'false');
      await expect(page.locator('[data-testid="lv-domain-node-stnW/RGN-D"]')).toHaveAttribute('data-der-only', 'true');
      await widocznyWezel(page, 'lv-domain-bus-bez-napiecia-stnW/RGN-C');
      await widocznyWezel(page, 'lv-domain-bus-wyspa-der-stnW/RGN-D');
    },
  },
];

function sha256Pliku(sciezka: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(sciezka)).digest('hex');
}

test.describe('lv-domain:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const wariant of WARIANTY) {
    test(`Domena nN — ${wariant.opis} — poziomy 0/1/2 × oba motywy — zapis PNG + bramki bajtowe`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width: 1400, height: 1000 });
      const bledyKonsoli: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') bledyKonsoli.push(msg.text());
      });
      page.on('pageerror', (err) => bledyKonsoli.push(`PAGEERROR: ${err.message}`));

      const skroty = new Map<string, string>();
      for (const motyw of MOTYWY) {
        for (const lod of POZIOMY) {
          const url = `${HARNESS_URL}?${wariant.query}&theme=${motyw}&lod=${lod}`;
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

          const korzen = page.locator('[data-testid="lv-domain-view-root"]').first();
          await expect(korzen).toHaveAttribute('data-status', 'ok', { timeout: 20_000 });
          await expect(korzen).toHaveAttribute('data-lod', String(lod));
          await expect(korzen).toHaveAttribute(
            'data-theme-mode',
            motyw === 'light' ? 'light_technical' : 'dark_scada',
          );
          // Status wyniku jest jawny na każdym poziomie (tożsamość wyniku).
          await widocznyWezel(page, 'lv-domain-result-freshness');
          await wariant.asercjeDom(page);

          await page.waitForTimeout(250);
          const plik = path.join(OUTPUT_DIR, `lv_domain_${wariant.slug}_lod${lod}_${motyw}.png`);
          await page.screenshot({ path: plik, fullPage: false });
          expect(fs.existsSync(plik)).toBe(true);
          skroty.set(`${motyw}:${lod}`, sha256Pliku(plik));
          console.log(`Saved: ${plik}`);
        }
      }

      // Bramka 1 — motyw realnie steruje paletą rysunku.
      for (const lod of POZIOMY) {
        expect(
          skroty.get(`dark:${lod}`),
          `kadr jasny i ciemny są bajtowo identyczne (poziom ${lod}) — motyw nie steruje rysunkiem`,
        ).not.toBe(skroty.get(`light:${lod}`));
      }
      // Bramka 2 — każdy poziom szczegółowości daje INNY rysunek.
      for (const motyw of MOTYWY) {
        const wPoziomach = POZIOMY.map((lod) => skroty.get(`${motyw}:${lod}`));
        expect(new Set(wPoziomach).size, `poziomy 0/1/2 dały identyczne kadry (motyw ${motyw})`).toBe(POZIOMY.length);
      }

      expect(bledyKonsoli, `błędy konsoli: ${bledyKonsoli.join(' | ')}`).toEqual([]);
    });
  }

  test('Domena nN — nakładka SWZ włączona bez wyniku — zapis PNG (uczciwy stan zerowy)', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`${HARNESS_URL}?fixture=multi&theme=dark&overlay=swz`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    const korzen = page.locator('[data-testid="lv-domain-view-root"]').first();
    await expect(korzen).toHaveAttribute('data-status', 'ok', { timeout: 20_000 });
    // Harness nie podaje wyników SWZ — status MUSI powiedzieć to WPROST,
    // zamiast fabrykować ciszą pustą nakładkę jako „aktywną z wynikiem".
    await expect(page.locator('[data-testid="lv-domain-overlay-status"]')).toHaveText('Nakładka: SWZ · brak wyniku (uruchom bieg)');

    const plik = path.join(OUTPUT_DIR, 'lv_domain_multi_overlay-swz_lod2_dark.png');
    await page.screenshot({ path: plik, fullPage: false });
    console.log(`Saved: ${plik}`);
    expect(fs.existsSync(plik)).toBe(true);
  });
});
