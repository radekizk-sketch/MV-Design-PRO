/**
 * Zrzuty prezentacyjne fazy F2 programu ZWARCIA-PRO (karta właściciela pkt 5+12)
 * — żywe interakcje na scenie `creator=zwarcia` harnessu:
 *  - szczegół maszyny z wywodem dyplomowym (klik wkładu → μ/q/Ib → ślad KaTeX),
 *  - filtr źródeł (fraza bez trafień → stan „brak trafień", uczciwy, zero fabrykacji),
 *  - sortowanie po prądzie wkładu (klik nagłówka — sieć złota niesie JEDNĄ
 *    maszynę konwencjonalną w tym punkcie, więc klik nie przestawia wierszy;
 *    asercja pilnuje, że mechanizm nie gubi jedynego wiersza),
 *  - przełącznik wykresu głównego (ip oraz I²t).
 *
 * HARNESS-ZWARCIA-Z-BACKENDU (2026-09-16): wkłady pochodzą z REALNEGO biegu
 * backendu (`eksport_fixtur_harnessu.py::zwarcia_wklady_scena_zwarcia`, sieć
 * złota `build_golden_enm`) — punkt domyślny („Szyna SN") niesie DOKŁADNIE
 * jedną maszynę wirującą z krzywą zaniku IEC 60909 §6.6 (`Generator
 * synchroniczny`/`gen_sync`); falownik `gen_pv` sieci złotej fizycznie NIE MA
 * takiej krzywej (prąd ograniczony elektronicznie) i słusznie NIE pojawia się
 * w tej liście (zob. docstring generatora) — zastępuje dawne trzy ilustracyjne
 * wpisy („System (GPZ 110/15)", „Falownik PV 4 MW", „Magazyn BESS 2 MW").
 *
 * Wyjście: docs/audit/visual/flow-ekspert/flow_zwarcia_f2_*.png (oba motywy).
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert');
const THEMES = ['light', 'dark'] as const;

test.describe('zwarcia-f2:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of THEMES) {
    test(`F2 wkłady PRO — ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1220, height: 1000 });
      await page.goto(`${HARNESS_URL}?creator=zwarcia&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });
      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });
      const wklady = page.getByTestId('mvd-zwarcia-wklady');
      await expect(wklady).toContainText('Generator synchroniczny');

      // 1) Szczegół maszyny + wywód dyplomowy tej maszyny (otwarty).
      await wklady.getByTestId('mvd-wyn-tabela').getByText('Generator synchroniczny').click();
      const szczegol = page.getByTestId('mvd-zwarcia-wklad-szczegol');
      await expect(szczegol).toContainText('0,705'); // μ
      await szczegol.getByTestId('mvd-zwarcia-wklad-szczegol-slad-btn').click();
      await expect(
        szczegol.locator('[data-testid="math-rendered"]').first(),
      ).toBeVisible();
      await page.waitForTimeout(300);
      await wklady.screenshot({
        path: path.join(OUTPUT_DIR, `flow_zwarcia_f2_szczegol_${theme}.png`),
      });

      // 2) Sortowanie po prądzie wkładu (klik nagłówka) — JEDEN wiersz w tym
      // punkcie: klik MUSI przejść bez błędu i bez utraty wiersza (pełne
      // pokrycie wielu wierszy niesie test jednostkowy `wkladyZwarciowe.test.tsx`
      // z syntetyczną fixturą — ten spec jest zrzutem prezentacyjnym, nie
      // wyczerpującym testem sortowania).
      await wklady.getByTestId('mvd-wyn-th-prad').click();
      await expect(wklady.getByTestId('mvd-wyn-tabela')).toContainText('Generator synchroniczny');
      await page.waitForTimeout(200);
      await wklady.screenshot({
        path: path.join(OUTPUT_DIR, `flow_zwarcia_f2_sort_${theme}.png`),
      });

      // 3) Filtr źródeł: fraza BEZ trafień zawęża tabelę do uczciwego stanu
      // „brak trafień" (zero fabrykacji) — sieć złota nie niesie falownika w
      // tej liście (zob. docstring pliku), więc „Falownik” nie trafia nic.
      await wklady.getByTestId('mvd-zwarcia-wklady-filtr').fill('Falownik');
      await expect(wklady.getByTestId('mvd-zwarcia-wklady-filtr-brak')).toBeVisible();
      await expect(wklady.getByTestId('mvd-wyn-tabela')).toHaveCount(0);
      await page.waitForTimeout(200);
      await wklady.screenshot({
        path: path.join(OUTPUT_DIR, `flow_zwarcia_f2_filtr_${theme}.png`),
      });
      await wklady.getByTestId('mvd-zwarcia-wklady-filtr').fill('');
      await expect(wklady.getByTestId('mvd-wyn-tabela')).toContainText('Generator synchroniczny');

      // 4) Przełącznik wykresu głównego: ip, potem I²t.
      const wykres = page.getByTestId('mvd-zwarcia-wykres-blok');
      await wykres.getByTestId('mvd-zwarcia-wykres-btn-ip').click();
      await expect(wykres).toContainText('Prądy udarowe ip');
      await page.waitForTimeout(200);
      await wykres.screenshot({
        path: path.join(OUTPUT_DIR, `flow_zwarcia_f2_wykres_ip_${theme}.png`),
      });
      await wykres.getByTestId('mvd-zwarcia-wykres-btn-i2t').click();
      await expect(wykres).toContainText('I²t');
      await expect(wykres.getByTestId('mvd-zwarcia-wykres-btn-i2t')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await page.waitForTimeout(200);
      await wykres.screenshot({
        path: path.join(OUTPUT_DIR, `flow_zwarcia_f2_wykres_i2t_${theme}.png`),
      });
    });
  }
});
