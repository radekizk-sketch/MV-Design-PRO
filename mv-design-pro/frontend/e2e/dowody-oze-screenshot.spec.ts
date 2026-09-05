/**
 * Runda dowodowa — ekrany OZE (karta V-A, dyrektywa właściciela: „pokaż wszystkie
 * ekrany z pełnymi dowodami akademickimi i udowodnij").
 *
 * Sceny harnessu (`?creator=X&theme=light|dark`, realne komponenty + zaszczepione
 * store'y + podmieniony fetch o kształcie 1:1 z backendem):
 *  - lom     — „Praca wyspowa": checki per porównanie + OTWARTY wywód okna
 *              normatywnego 81R (KaTeX; NC RfG Art. 13 / PTPiREE),
 *  - frt     — „Walidacja modelu falownika": trajektorie z OTWARTYM wywodem
 *              marginesu (T-C) ORAZ sekwencja zapadów z OTWARTYM śladem kontekstu
 *              siły sieci SCR (T-B),
 *  - oltc    — „Badania regulacji OLTC": sweep pozycji zaczepów + OTWARTY ślad
 *              wywodu przekładni t(n) (kształt z power_flow_oltc_studies.py),
 *  - macierz — macierz NC RfG z werdyktami testów + OTWARTY ślad testu T16
 *              (Wzór → Dane → Podstawienie → Wynik → jednostki).
 * Wyjście: docs/audit/visual/dowody/dowody_*.png (oba motywy, ślad OTWARTY).
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/dowody');
const THEMES = ['light', 'dark'] as const;

/** Zbiera błędy konsoli/strony (twarda bramka: zero błędów na scenie). */
function zbierajBledy(page: Page): string[] {
  const errs: string[] = [];
  const szum = (t: string): boolean =>
    /favicon|Download the React DevTools|Failed to load resource/i.test(t);
  page.on('console', (m) => {
    if (m.type() === 'error' && !szum(m.text())) errs.push(m.text());
  });
  page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));
  return errs;
}

async function otworzScene(page: Page, scena: string, theme: string): Promise<void> {
  await page.setViewportSize({ width: 1220, height: 1000 });
  await page.goto(`${HARNESS_URL}?creator=${scena}&theme=${theme}`, {
    waitUntil: 'domcontentloaded',
    timeout: 40000,
  });
  const root = page.locator('[data-testid="creator-harness-root"]').first();
  await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });
}

test.describe('dowody-oze:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of THEMES) {
    test(`lom — wywód checka 81R otwarty — ${theme}`, async ({ page }) => {
      const errs = zbierajBledy(page);
      await otworzScene(page, 'lom', theme);

      // Tabela pól z werdyktami backendu (statusy PL, zero oceny w UI).
      const tabela = page.getByTestId('mvd-wyn-tabela');
      await expect(tabela).toContainText('Pole BESS B');
      await expect(tabela).toContainText('Ostrzeżenie');

      // Natywny klik wiersza pola → szczegół z porównaniami i normą.
      await page.getByTestId('mvd-wyn-wiersz').filter({ hasText: 'Pole BESS B' }).click();
      const szczegol = page.getByTestId('mvd-lom-szczegol');
      await expect(szczegol).toContainText('Szybkość zmian częstotliwości (df/dt)');
      await expect(szczegol).toContainText('df/dt ≥ 2.0 Hz/s'); // okno normatywne
      await expect(szczegol).toContainText('Rozporządzenie Komisji (UE) 2016/631'); // norma

      // OTWARTY wywód checka 81R: KaTeX wyrenderowany + werdykt w krokach.
      await page.getByTestId('mvd-lom-check-slad-0-btn').click();
      const slad = page.getByTestId('mvd-lom-check-slad-0');
      await expect(slad.locator('[data-testid="math-rendered"]').first()).toBeVisible();
      await expect(slad).toContainText('Dane: nastawa = 1.0000');
      await expect(slad).toContainText('Werdykt: WARN');

      await page.waitForTimeout(300);
      expect(errs, `zero błędów konsoli (lom/${theme})`).toEqual([]);
      const out = path.join(OUTPUT_DIR, `dowody_lom_${theme}.png`);
      await page.locator('[data-testid="creator-harness-root"]').screenshot({ path: out });
      expect(fs.existsSync(out)).toBe(true);
    });

    test(`frt — wywód marginesu (T-C) i ślad siły sieci (T-B) otwarte — ${theme}`, async ({
      page,
    }) => {
      const errs = zbierajBledy(page);
      await otworzScene(page, 'frt', theme);

      // Jawny bieg trajektorii: dobór modułu/operatora → „Uruchom test FRT".
      await page.getByTestId('mvd-frt-modul').selectOption('der-pv-1');
      await page.getByTestId('mvd-frt-operator').selectOption('pse');
      await page.getByTestId('mvd-frt-oblicz').click();

      const werdykt = page.getByTestId('mvd-frt-werdykt');
      await expect(werdykt).toContainText('Model odzwierciedla wymagania profilu operatora');
      await expect(page.getByTestId('mvd-frt-wynik')).toContainText('w obwiedni');

      // T-C: OTWARTY wywód marginesu scenariusza (m_U — KaTeX wyrenderowany).
      await page.getByTestId('mvd-frt-slad-0-btn').click();
      const sladWywodu = page.getByTestId('mvd-frt-slad-0');
      await expect(sladWywodu.locator('[data-testid="math-rendered"]').first()).toBeVisible();
      await expect(sladWywodu).toContainText('liczba punktow trajektorii: 10');
      await expect(sladWywodu).toContainText('Werdykt: w obwiedni');

      await page.waitForTimeout(300);
      const outTraj = path.join(OUTPUT_DIR, `dowody_frt_trajektorie_${theme}.png`);
      await page.getByTestId('mvd-frt-wynik').screenshot({ path: outTraj });
      expect(fs.existsSync(outTraj)).toBe(true);

      // T-B: sekwencja zapadów z kontekstem siły sieci — dwa zapady jak w
      // odpowiedzi (0,05/0,15 s + 0,02/0,5 s), przebieg zwarciowy + węzeł.
      await page.getByTestId('mvd-frt-sekw-dodaj').click();
      await page.getByTestId('mvd-frt-sekw-glebokosc-1').fill('0.02');
      await page.getByTestId('mvd-frt-sekw-czas-1').fill('0.5');
      await page.getByTestId('mvd-frt-sekw-run').selectOption('run-sc-9');
      await page.getByTestId('mvd-frt-sekw-bus').fill('bus-oze-1');
      await page.getByTestId('mvd-frt-sekw-oblicz').click();

      await expect(page.getByTestId('mvd-frt-sekw-werdykt')).toContainText(
        'sekwencja niezaliczona — zapad 2',
      );
      const kontekst = page.getByTestId('mvd-frt-sekw-kontekst');
      await expect(kontekst).toContainText('sieć słaba');
      await expect(kontekst).toContainText('2,250'); // SCR z backendu (fmt PL)

      // OTWARTY ślad pełnej jawności kontekstu siły sieci. INTENCJA (K10):
      // wzór SCR renderowany KaTeX-em (element złożony, nie surowe ASCII),
      // a podstawienie i wynik liczbowy pozostają tekstem — to one dowodzą,
      // że wartości płyną z backendu.
      await page.getByTestId('mvd-frt-sekw-slad-otworz').click();
      const sladKontekstu = page.getByTestId('mvd-frt-sekw-slad');
      await expect(sladKontekstu.locator('.katex').first()).toBeVisible();
      await expect(sladKontekstu).toContainText('SCR = 45,0 / 20,0');
      await expect(sladKontekstu).toContainText('SCR = 2,25');

      await page.waitForTimeout(300);
      expect(errs, `zero błędów konsoli (frt/${theme})`).toEqual([]);
      const outSekw = path.join(OUTPUT_DIR, `dowody_frt_sekwencja_${theme}.png`);
      await page.getByTestId('mvd-frt-sekwencja').screenshot({ path: outSekw });
      expect(fs.existsSync(outSekw)).toBe(true);
    });

    test(`oltc — sweep z otwartym wywodem przekładni — ${theme}`, async ({ page }) => {
      const errs = zbierajBledy(page);
      await otworzScene(page, 'oltc', theme);

      // Jawny bieg badania sweep (domyślny rodzaj) na aktywnym przypadku.
      await page.getByTestId('mvd-oltc-uruchom').click();
      const wynik = page.getByTestId('mvd-oltc-wynik-sweep');
      await expect(wynik).toBeVisible();
      await expect(wynik).toContainText('0.9750'); // przekładnia t(-2)
      await expect(wynik).toContainText('15.303 kV'); // U szyny regulowanej n=-2

      // OTWARTY ślad wywodu sweep: t(n) = 1 + (n - n0)·du/100 (KaTeX) + dane.
      await page.getByTestId('mvd-oltc-sweep-slad-btn').click();
      const slad = page.getByTestId('mvd-oltc-sweep-slad');
      await expect(slad.locator('[data-testid="math-rendered"]').first()).toBeVisible();
      await expect(slad).toContainText('Dane: krok zaczepu du = 1.2500 %, pozycja neutralna n0 = 0.');
      await expect(slad).toContainText('Kryterium odczytu');

      await page.waitForTimeout(300);
      expect(errs, `zero błędów konsoli (oltc/${theme})`).toEqual([]);
      const out = path.join(OUTPUT_DIR, `dowody_oltc_sweep_${theme}.png`);
      await page.locator('[data-testid="creator-harness-root"]').screenshot({ path: out });
      expect(fs.existsSync(out)).toBe(true);
    });

    test(`macierz — werdykty NC RfG z otwartym śladem testu — ${theme}`, async ({ page }) => {
      const errs = zbierajBledy(page);
      await otworzScene(page, 'macierz', theme);

      // Jawny bieg testów zgodności (przycisk aktywny — moduły kompletne).
      const przeprowadz = page.getByTestId('mvd-oze-przeprowadz');
      await expect(przeprowadz).toBeEnabled();
      await przeprowadz.click();

      // Macierz wypełniona werdyktami z odpowiedzi solvera (pass/fail/no_data).
      await expect(page.getByTestId('mvd-oze-komorka-wynik').first()).toBeVisible();
      const tabela = page.getByTestId('mvd-oze-macierz-tabela');
      await expect(tabela).toContainText('LVRT - pozostanie w pracy przy zapadzie napięcia');
      await expect(page.getByTestId('mvd-oze-podsum-moduly')).toContainText('niezgodny');
      await expect(page.getByTestId('mvd-oze-podsum-moduly')).toContainText('zgodny');

      // Klik komórki „niespełniony" (T16 × BESS) → szczegół werdyktu + ślad.
      await page
        .getByTestId('mvd-oze-komorka-wynik')
        .filter({ hasText: 'niespełniony' })
        .first()
        .click();
      const szczegol = page.getByTestId('mvd-oze-szczegol-wynik');
      await expect(szczegol).toContainText('Odbudowa mocy czynnej po zakłóceniu');
      await expect(szczegol).toContainText('Odbudowa P po zakłóceniu: 1.800s.');

      // OTWARTY ślad testu (kanon: Wzór → Dane → Podstawienie → Wynik → jednostki).
      await page.getByTestId('mvd-oze-slad-otworz').click();
      const kroki = page.getByTestId('mvd-oze-slad-kroki');
      await expect(kroki).toContainText('t_recovery,module <= t_recovery,profile');
      await expect(kroki).toContainText('1.800 <= 1.000');
      await expect(kroki).toContainText('s - s = s.');

      await page.waitForTimeout(300);
      expect(errs, `zero błędów konsoli (macierz/${theme})`).toEqual([]);
      const out = path.join(OUTPUT_DIR, `dowody_macierz_${theme}.png`);
      await page.locator('[data-testid="creator-harness-root"]').screenshot({ path: out });
      expect(fs.existsSync(out)).toBe(true);
    });
  }
});
