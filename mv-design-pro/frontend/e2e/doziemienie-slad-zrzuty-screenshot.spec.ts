/**
 * Doziemienie SN — „Ślad obliczenia” na ekranie składowych (E-29) w czterech sposobach pracy
 * punktu neutralnego × oba motywy (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, commit 5).
 *
 * Scena harnessu `wyniki-skladowe-doziemienie` karmi PRODUKCYJNY `EkranSkladowych` odpowiedziami
 * końcówek REALNEGO biegu 1F backendu (`doziemienie_sposoby_scena.json`, generator
 * `eksport_fixtur_harnessu.py::doziemienie_sposoby_scena`) na tej samej sieci co wyrocznia ręczna
 * `tests/enm/test_doziemienie_tryby_punktu_neutralnego.py` (GPZ 110/15 kV, 2 km kabla SN).
 *
 * Spec sprawdza fakty treści przed zrzutem — oczekiwania czytane z TEJ SAMEJ fixtury, którą scena
 * podaje ekranowi (przepływ backend → fixtura → ekran, nie zapamiętana liczba):
 *  - prąd w miejscu doziemienia w zapisie polskim (2 miejsca po przecinku),
 *  - każdy krok śladu sposobu (tytuł, wzór i podstawienie złożone przez KaTeX — tyle bloków
 *    wzorów, ile pól `*_latex` niesie krok),
 *  - krok prądu WŁASNEGO modelu sposobu obecny, kroki prądu pozostałych sposobów nieobecne
 *    (cztery sposoby rozróżnialne na ekranie, nie tylko w backendzie),
 *  - pierwszy plan sekcji bez surowego LaTeX-u i bez wzoru w postaci awaryjnej.
 * Werdykt wizualny NALEŻY DO WŁAŚCICIELA (zasada nr 2, bramka B-02) — spec tylko zapisuje PNG.
 * Zrzuty do dokumentacji: `ZRZUTY_DO_DOKUMENTACJI=1` (`e2e/katalogZrzutow.ts`).
 */
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';
import { katalogZrzutow } from './katalogZrzutow';
import { bramkaTresciMatematycznej } from './trescMatematyczna';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const OUTPUT_DIR = katalogZrzutow(path.resolve(_dirname, '../../docs/uiux/zrzuty/ux04-doziemienie'));

interface KrokSladu {
  readonly key: string;
  readonly title: string;
  readonly formula_latex: string;
  readonly substitution_latex: string | null;
}

interface ScenaSposobu {
  readonly wynik: {
    readonly rows: ReadonlyArray<{
      readonly doziemienie_sieci: { readonly tryb: string; readonly prad_a: number; readonly slad: KrokSladu[] };
    }>;
  };
}

const SCENY = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/doziemienie_sposoby_scena.json'),
    'utf-8',
  ),
) as Record<string, ScenaSposobu>;

/** Krok prądu modelu każdego sposobu — jeden na sposób (solver `doziemienie_sn`). */
const KROK_PRADU_SPOSOBU: Readonly<Record<string, string>> = {
  izolowany: 'doziemienie_prad_izolowany',
  kompensowany: 'doziemienie_prad_kompensowany',
  rezystor: 'doziemienie_prad_rezystor',
  bezposrednie: 'doziemienie_prad_bezposrednie',
};

const MOTYWY = [
  ['light', 'jasny'],
  ['dark', 'ciemny'],
] as const;

function pl2(wartosc: number): string {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(wartosc);
}

test.describe('doziemienie-slad:screenshot — ślad obliczenia czterech sposobów pracy punktu neutralnego', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  test('fixtura niesie dokładnie cztery sposoby, każdy z jednym wierszem szyny SN', () => {
    expect(Object.keys(SCENY).sort()).toEqual(Object.keys(KROK_PRADU_SPOSOBU).sort());
    for (const [sposob, scena] of Object.entries(SCENY)) {
      expect(scena.wynik.rows).toHaveLength(1);
      expect(scena.wynik.rows[0].doziemienie_sieci.tryb).toBe(sposob);
    }
  });

  for (const sposob of Object.keys(KROK_PRADU_SPOSOBU)) {
    for (const [theme, motyw] of MOTYWY) {
      test(`${sposob} — motyw ${motyw}`, async ({ page }) => {
        const bledy: string[] = [];
        const szum = (t: string): boolean => /favicon|Download the React DevTools|Failed to load resource/i.test(t);
        page.on('console', (m) => {
          if (m.type() === 'error' && !szum(m.text())) bledy.push(m.text());
        });
        page.on('pageerror', (e) => bledy.push(`PAGEERROR: ${e.message}`));

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${HARNESS_URL}?creator=wyniki-skladowe-doziemienie&sposob=${sposob}&theme=${theme}`, {
          waitUntil: 'domcontentloaded',
          timeout: 40000,
        });
        const root = page.locator('[data-testid="creator-harness-root"]').first();
        await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

        const doziemienie = SCENY[sposob].wynik.rows[0].doziemienie_sieci;
        const sekcja = page.getByTestId('mvd-skladowe-doziemienie');
        await expect(sekcja).toBeVisible();
        await expect(page.getByTestId('mvd-skladowe-doziemienie-prad').locator('dd')).toHaveText(
          `${pl2(doziemienie.prad_a)} A`,
        );

        const slad = page.getByTestId('mvd-skladowe-doziemienie-slad');
        await expect(slad).toBeVisible();
        await expect(slad.locator('li')).toHaveCount(doziemienie.slad.length);
        for (const krok of doziemienie.slad) {
          const pozycja = page.getByTestId(`mvd-skladowe-doziemienie-krok-${krok.key}`);
          await expect(pozycja).toContainText(krok.title);
          await expect(pozycja.locator('.katex-display')).toHaveCount(krok.substitution_latex === null ? 1 : 2);
        }
        for (const [inny, kluczKroku] of Object.entries(KROK_PRADU_SPOSOBU)) {
          await expect(page.getByTestId(`mvd-skladowe-doziemienie-krok-${kluczKroku}`)).toHaveCount(
            inny === sposob ? 1 : 0,
          );
        }

        await bramkaTresciMatematycznej(page, '[data-testid="mvd-skladowe-doziemienie"]');
        await page.waitForTimeout(300);
        expect(bledy, `błędy konsoli i strony (${sposob}, ${motyw})`).toEqual([]);

        const plik = path.join(OUTPUT_DIR, `doziemienie-slad-${sposob}-${motyw}.png`);
        await sekcja.screenshot({ path: plik });
        expect(fs.existsSync(plik)).toBe(true);
      });
    }
  }
});
