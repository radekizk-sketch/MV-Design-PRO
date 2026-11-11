/**
 * Karta EKRANY-EAZ-ZIEMNOZWARCIOWE — kadry ekranu koordynacji zabezpieczeń z rodziną nadprądową
 * 50/51 (zakładka „Nadprądowe 51/50”) i rodzinami ziemnozwarciowymi (zakładka zwarć doziemnych),
 * w obu motywach i dwóch oknach (1440×900, 1280×720). Scena harnessu `koordynacja` jest zasilana
 * fixturami REALNYCH biegów backendu (sieć złota G08) — ten sam wynik, który serwuje API.
 *
 * Wyrocznia: wiersze rodziny 50/51 na ekranie = wiersze `nadpradowe.wiersze` fixtury wyniku
 * (urządzenie i stan maszynowy), kolumny = kolumny rodziny z wyniku. Klik natywny; zero błędów
 * konsoli i renderu.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { adresHarnessu } from './adresHarnessu';
import { katalogZrzutow } from './katalogZrzutow';
import { zbierajNieudaneZadaniaApi } from './nieudaneZadaniaApi';
import { tabelePrzyciete, widocznoscSkrajnychKolumn, type WidocznoscKolumn } from './scenaDoziemieniaE2e';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const OUTPUT_DIR = katalogZrzutow(path.resolve(_dirname, '../../docs/uiux/zrzuty/ekrany-eaz'));

type Wiersz = { urzadzenie_ref: string; stan: string; braki: unknown[] };
type Rodzina = { id: string; kolumny: { klucz: string }[] };
const WYNIK = JSON.parse(
  fs.readFileSync(path.resolve(_dirname, '../src/harness-fixtures/generated/koordynacja_scena_wynik.json'), 'utf-8'),
) as { nadpradowe: { wiersze: Wiersz[]; rodziny: Rodzina[] } };

const OKNA = [
  { szer: 1440, wys: 900 },
  { szer: 1280, wys: 720 },
] as const;

for (const theme of ['dark', 'light'] as const) {
  test(`koordynacja — rodzina 50/51 i zwarcia doziemne — ${theme}`, async ({ page }) => {
    const errs: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon|React DevTools|Failed to load resource/i.test(m.text())) errs.push(m.text());
    });
    page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));
    zbierajNieudaneZadaniaApi(page, errs);

    await page.setViewportSize({ width: OKNA[0].szer, height: OKNA[0].wys });
    await page.goto(`${HARNESS_URL}?creator=koordynacja&theme=${theme}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    const root = page.locator('[data-testid="creator-harness-root"]').first();
    await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

    const ocen = page.getByTestId('mvd-ocena-zabezpieczen-uruchom');
    await expect(ocen).toBeEnabled({ timeout: 15000 });
    await ocen.click();
    await expect(page.getByTestId('mvd-ocena-zabezpieczen-wynik')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('coordination-run-min')).toContainText('✓', { timeout: 15000 });
    await page.getByTestId('run-analysis-button').click();
    await expect(page.getByTestId('coordination-devices')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('tab-nadpradowe').click();
    const nadpr = page.getByTestId('coordination-nadpradowe');
    await expect(nadpr).toBeVisible({ timeout: 15000 });
    const wiersze = nadpr.locator('[data-testid="coordination-nadpradowe-wiersz"]');
    await expect(wiersze).toHaveCount(WYNIK.nadpradowe.wiersze.length);
    expect(
      await wiersze.evaluateAll((w) => w.map((e) => `${e.getAttribute('data-urzadzenie')}|${e.getAttribute('data-status')}`)),
    ).toEqual(WYNIK.nadpradowe.wiersze.map((w) => `${w.urzadzenie_ref}|${w.stan}`));
    const kolumny = await nadpr.locator('th[data-kolumna]').evaluateAll((t) => t.map((e) => e.getAttribute('data-kolumna')));
    expect(kolumny).toEqual(WYNIK.nadpradowe.rodziny[0].kolumny.map((k) => k.klucz));
    // Zakładka z tabelą rodziny: panel biegów i urządzeń domyślnie zwinięty (pełna szerokość).
    await expect(page.getByTestId('coordination-panel-przelacz')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('coordination-panel-boczny')).toHaveCount(0);
    // Porządek wierszy z backendu: stacje S01…S04 (druga linia komórki „Pole”).
    const stacje = await nadpr.getByTestId('coordination-nadpradowe-kontener').allTextContents();
    expect(stacje.length).toBeGreaterThan(0);
    expect(stacje).toEqual([...stacje].sort((a, b) => a.localeCompare(b, 'pl', { numeric: true })));

    // Filtr wierszy przy liczniku braków: stan widoczny, porządek bez zmian, domyślnie wszystkie.
    const filtr = nadpr.getByTestId('coordination-nadpradowe-filtr');
    await expect(filtr).toHaveAttribute('data-filtr', 'wszystkie');
    const zWynikiem = WYNIK.nadpradowe.wiersze.filter((w) => w.braki.length === 0);
    await filtr.getByTestId('coordination-nadpradowe-filtr-z-wynikiem').click();
    await expect(filtr).toHaveAttribute('data-filtr', 'z-wynikiem');
    await expect(filtr.getByTestId('coordination-nadpradowe-filtr-z-wynikiem')).toHaveAttribute('aria-pressed', 'true');
    expect(await wiersze.evaluateAll((w) => w.map((e) => e.getAttribute('data-urzadzenie')))).toEqual(
      zWynikiem.map((w) => w.urzadzenie_ref),
    );
    await filtr.getByTestId('coordination-nadpradowe-filtr-bez-nastaw').click();
    await expect(wiersze).toHaveCount(WYNIK.nadpradowe.wiersze.length - zWynikiem.length);
    await filtr.getByTestId('coordination-nadpradowe-filtr-wszystkie').click();
    await expect(wiersze).toHaveCount(WYNIK.nadpradowe.wiersze.length);

    // Kontrast tekstu wiersza rodziny względem tła, na którym leży (WCAG 2.x, ≥ 4,5:1 dla tekstu
    // zwykłego) — w motywie ciemnym tabela z tokenów leżała na białej karcie (≈1,3:1).
    const kontrast = (testid: string) =>
      page.getByTestId(testid).locator(`[data-testid="${testid}-wiersz"] td`).first().evaluate((td) => {
        const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
        const lum = (c: number[]) => {
          const [r, g, b] = c.slice(0, 3).map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        let el: Element | null = td;
        let tlo = 'rgb(255, 255, 255)';
        while (el) {
          const c = getComputedStyle(el).backgroundColor;
          const a = rgb(c);
          if (!(a.length === 4 && a[3] === 0) && c !== 'transparent') {
            tlo = c;
            break;
          }
          el = el.parentElement;
        }
        const l1 = lum(rgb(getComputedStyle(td).color));
        const l2 = lum(rgb(tlo));
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      });
    expect(await kontrast('coordination-nadpradowe'), 'kontrast wiersza 50/51').toBeGreaterThanOrEqual(4.5);
    await page.getByTestId('tab-ziemne').click();
    await expect(page.getByTestId('coordination-ziemne')).toBeVisible({ timeout: 15000 });
    expect(await kontrast('coordination-ziemne'), 'kontrast wiersza ziemnozwarciowego').toBeGreaterThanOrEqual(4.5);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const pomiar: Record<string, WidocznoscKolumn[]> = {};
    for (const { szer, wys } of OKNA) {
      const okno = `${szer}x${wys}`;
      await page.setViewportSize({ width: szer, height: wys });
      for (const zakladka of ['nadpradowe', 'ziemne'] as const) {
        await page.getByTestId(`tab-${zakladka}`).click();
        const tabela = page.getByTestId(`coordination-${zakladka}`);
        await expect(tabela).toBeVisible({ timeout: 15000 });
        // Źródła wymagań rozwinięte na czas pomiaru — ich tabela też musi się zmieścić.
        const zrodla = tabela.getByTestId(`coordination-${zakladka}-zrodla`);
        const zZrodlami = (await zrodla.count()) > 0;
        if (zZrodlami) await zrodla.locator('summary').click();
        await page.waitForTimeout(300);
        const w = await widocznoscSkrajnychKolumn(tabela);
        pomiar[`${zakladka}-${okno}`] = w;
        expect(w.length, `tabele ${zakladka} ${okno}`).toBeGreaterThan(0);
        expect(tabelePrzyciete(w), `koordynacja ${zakladka} ${okno}`).toEqual([]);
        if (zZrodlami) await zrodla.locator('summary').click();
        await tabela.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUTPUT_DIR, `koordynacja-${zakladka}-${okno}-${theme}.png`) });
      }
    }
    const plik = path.resolve(process.env.POMIAR_EAZ_KATALOG ?? 'test-results', `pomiar-koordynacja-${theme}.json`);
    fs.mkdirSync(path.dirname(plik), { recursive: true });
    fs.writeFileSync(plik, `${JSON.stringify(pomiar, null, 2)}\n`);
    expect(errs, `błędy renderu koordynacji/${theme}`).toEqual([]);
  });
}
