/**
 * Pulpit instalacji OZE w standardzie warsztatu KD6 (karta PULPIT-OZE-KD6): pomiar i zrzuty.
 *
 * Pomiar (meldunek karty, kontrakt prezentacji §10 „Kryterium odbioru"): wysokość ekranu pulpitu
 * w px, liczba słów na pierwszym planie (tekst widoczny bez rozwijania) i liczba natywnych
 * kliknięć od wejścia na pulpit do szczegółów wymagania. Pomiar zapisuje się do JSON obok zrzutów
 * — ta sama procedura na drzewie przed i po zmianie.
 *
 * Zrzuty: pulpit, rozwinięte szczegóły wymagania i adekwatność mocy biernej — oba motywy,
 * 1440×900 i 1280×720. Interakcje wyłącznie natywne (klik). Scena `pulpit-oze` harnessu: realne
 * komponenty, odpowiedzi backendu z fixtur generowanych (`scripts/eksport_fixtur_harnessu.py`).
 *
 * Wyjście: `PULPIT_OZE_ZRZUTY_DIR` (bieg lokalny poza repo) albo
 * docs/audit/visual/dowody/pulpit-kd6/.
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';
import { zbierajNieudaneZadaniaApi } from './nieudaneZadaniaApi';
import { bramkaTresciMatematycznej } from './trescMatematyczna';
import { katalogZrzutow } from './katalogZrzutow';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const OUTPUT_DIR = katalogZrzutow(
  process.env.PULPIT_OZE_ZRZUTY_DIR ??
    path.resolve(_dirname, '../../docs/audit/visual/dowody/pulpit-kd6'),
);
const THEMES = ['light', 'dark'] as const;
const EKRANY = [
  { w: 1440, h: 900 },
  { w: 1280, h: 720 },
] as const;

type ModelSceny = { generators: { ref_id: string; gen_type: string }[] };
const MODEL = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/macierz_scena_migawka.json'),
    'utf-8',
  ),
) as ModelSceny;
const MODUL_PV = MODEL.generators.find((g) => g.gen_type === 'pv_inverter')!.ref_id;

/** Wymaganie PV z liczbami (limit, wynik, margines) z oceny zatwierdzonego modelu sceny. */
type RekordW = {
  wymaganie_id: string;
  stosowalnosc: { dotyczy: boolean };
  oceny_skladowe: { wynik: unknown; limit: unknown; margines: { wartosc: unknown } | null }[];
};
const ZGODNOSC = JSON.parse(
  fs.readFileSync(
    path.resolve(
      _dirname,
      '../src/harness-fixtures/generated/ncrfg_zgodnosc_przekrojowa_scena_macierz.json',
    ),
    'utf-8',
  ),
) as { bieg: { ocena_wymagan: { der_ref: string; wymagania: RekordW[] }[] } };
const WYMAGANIE_PV = ZGODNOSC.bieg.ocena_wymagan
  .find((o) => o.der_ref === MODUL_PV)!
  .wymagania.find(
    (r) =>
      r.stosowalnosc.dotyczy &&
      r.oceny_skladowe.some((k) => k.wynik !== null && k.margines?.wartosc != null),
  )!.wymaganie_id;

function zbierajBledy(page: Page): string[] {
  const errs: string[] = [];
  const szum = (t: string): boolean =>
    /favicon|Download the React DevTools|Failed to load resource/i.test(t);
  page.on('console', (m) => {
    if (m.type() === 'error' && !szum(m.text())) errs.push(m.text());
  });
  page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));
  zbierajNieudaneZadaniaApi(page, errs);
  return errs;
}

async function otworzPulpit(page: Page, theme: string, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${HARNESS_URL}?creator=pulpit-oze&theme=${theme}`, {
    waitUntil: 'domcontentloaded',
    timeout: 40000,
  });
  const root = page.locator('[data-testid="creator-harness-root"]').first();
  await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });
  // Ocena zatwierdzonego modelu wczytana: dowód certyfikatu modułu PV na liście.
  await expect(page.getByTestId(`mvd-oze-pulpit-poz-dowod-${MODUL_PV}`)).toHaveAttribute(
    'data-stan',
    'dowod',
    { timeout: 15000 },
  );
  // Klik natywny: wybór modułu PV (wejście na jego kartę).
  await page.getByTestId(`mvd-oze-pulpit-poz-${MODUL_PV}`).click();
  await expect(page.getByTestId('mvd-oze-adekw-wynik')).toBeVisible({ timeout: 15000 });
}

/** Wysokość pulpitu i słowa widoczne bez rozwijania (innerText — tylko wyrenderowana treść). */
async function zmierz(page: Page): Promise<{ wysokosc_px: number; slowa: number }> {
  return page.getByTestId('mvd-oze-pulpit').evaluate((el) => {
    const tekst = (el as HTMLElement).innerText;
    return {
      wysokosc_px: Math.round(el.scrollHeight),
      slowa: tekst.split(/\s+/).filter((s) => /[\p{L}\p{N}]/u.test(s)).length,
    };
  });
}

async function zrzut(page: Page, errs: string[], nazwa: string, testid?: string): Promise<void> {
  await page.waitForTimeout(300);
  expect(errs, `zero błędów konsoli i API (${nazwa})`).toEqual([]);
  await bramkaTresciMatematycznej(page);
  const out = path.join(OUTPUT_DIR, `${nazwa}.png`);
  const cel = testid
    ? page.getByTestId(testid).first()
    : page.locator('[data-testid="creator-harness-root"]');
  await cel.screenshot({ path: out });
  expect(fs.existsSync(out)).toBe(true);
}

test.describe('pulpit-oze-kd6:screenshot', () => {
  test.describe.configure({ timeout: 180000 });

  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of THEMES) {
    for (const { w, h } of EKRANY) {
      test(`pulpit — pomiar i zrzuty — ${theme} ${w}×${h}`, async ({ page }) => {
        const errs = zbierajBledy(page);
        await otworzPulpit(page, theme, w, h);
        const pomiar = await zmierz(page);
        fs.writeFileSync(
          path.join(OUTPUT_DIR, `pomiar_${theme}_${w}x${h}.json`),
          JSON.stringify({ ...pomiar, ekran: `${w}x${h}`, motyw: theme }, null, 2),
        );
        await zrzut(page, errs, `pulpit_${theme}_${w}x${h}`);
        // Pierwszy plan w oknie przeglądarki (bez przewijania).
        await page.screenshot({ path: path.join(OUTPUT_DIR, `pulpit_okno_${theme}_${w}x${h}.png`) });
      });

      test(`szczegóły wymagania i adekwatność Q — ${theme} ${w}×${h}`, async ({ page }) => {
        const errs = zbierajBledy(page);
        // Klik 1: wybór modułu PV (w `otworzPulpit`).
        await otworzPulpit(page, theme, w, h);
        const wiersz = `mvd-oze-pulpit-wymagania-${MODUL_PV}-${WYMAGANIE_PV}`;
        await expect(page.getByTestId(wiersz)).toBeVisible();
        // Pierwszy plan: zdanie wyjaśnienia NIE stoi w wierszu (szczegóły na żądanie).
        await expect(page.getByTestId(`${wiersz}-zdanie`)).toHaveCount(0);
        // Klik 2 (natywny): „Szczegóły" wiersza wymagania.
        const przelacz = page.getByTestId(`${wiersz}-przelacz`);
        await przelacz.click();
        await expect(przelacz).toHaveAttribute('aria-expanded', 'true');
        await expect(page.getByTestId(`${wiersz}-zdanie`)).toBeVisible();
        await expect(page.getByTestId(`mvd-werdykt-${WYMAGANIE_PV}`)).toBeVisible();
        fs.writeFileSync(
          path.join(OUTPUT_DIR, `klikniecia_${theme}_${w}x${h}.json`),
          JSON.stringify({ klikniecia_do_szczegolu_wymagania: 2 }, null, 2),
        );
        await page.getByTestId(wiersz).scrollIntoViewIfNeeded();
        await zrzut(page, errs, `pulpit_szczegoly_${theme}_${w}x${h}`, `mvd-oze-pulpit-wymagania-${MODUL_PV}`);

        // Adekwatność Q: zwarta tabela źródeł; szczegóły źródła PV (wzory KaTeX, krój bazowy).
        const sekcja = page.getByTestId('mvd-oze-pulpit-adekwatnosc');
        await sekcja.scrollIntoViewIfNeeded();
        await zrzut(page, errs, `pulpit_adekwatnosc_q_${theme}_${w}x${h}`, 'mvd-oze-pulpit-adekwatnosc');
        await sekcja.getByTestId(`mvd-oze-adekw-slad-otworz-${MODUL_PV}`).click();
        const kroki = sekcja.getByTestId('mvd-oze-slad-kroki').first();
        await expect(kroki.locator('.katex').first()).toBeVisible();
        // Kroki obliczeń w kroju bazowym — zero `code` (monospace) w śladzie.
        await expect(kroki.locator('code')).toHaveCount(0);
        await zrzut(
          page,
          errs,
          `pulpit_adekwatnosc_q_szczegoly_${theme}_${w}x${h}`,
          'mvd-oze-pulpit-adekwatnosc',
        );
      });
    }
  }
});
