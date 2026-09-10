/**
 * Zrzuty żywych kreatorów ui2 fali P-4/P-5 do oceny wizualnej (karta Z-2,
 * dyrektywa właściciela #8).
 *
 * Renderuje REALNE komponenty 9 kreatorów dodanych w fali P-4/P-5
 * (zrodlo-dyspozycyjne, odgalezienie, slup-odgalezny, zksn, przekaznik,
 * pomiar, pole-nn, przypisanie-katalogu, edycja-parametrow) z zaszczepionym
 * kontekstem/stanem i podmienionym `fetch` (creator-harness-main.tsx), w
 * motywie jasnym i ciemnym. Twarde asercje PRZED zrzutem: tytuł kreatora PL
 * widoczny, PanelTeorii obecny (jeśli kreator go ma), formularz kroku 1
 * wyrenderowany, zero błędów konsoli. Zrzut = jedyny dowód.
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

interface Scena {
  /** Wartość query param `?creator=`. */
  readonly creator: string;
  /** testid ramy kreatora (KreatorRama testid=). */
  readonly root: string;
  /** Tekst h2 tytułu ramy widoczny w nagłówku. */
  readonly tytul: string;
  /** testid sekcji formularza kroku 1 (stan po wejściu na scenę). */
  readonly krok1: string;
  /** testid PanelTeorii — wszystkie 9 kreatorów fali P-4/P-5 go mają. */
  readonly teoria: string;
  /** testid przycisku „Dalej", jeśli PanelTeorii jest na kroku 2 (nie na kroku 1). */
  readonly dalejDoTeorii?: string;
}

const SCENY: readonly Scena[] = [
  {
    creator: 'zrodlo-dyspozycyjne',
    root: 'mvd-kreator-zrodlo-dysp',
    tytul: 'MODEL SIECI · AGREGAT nN',
    krok1: 'mvd-kreator-zrodlo-dysp-pole',
    teoria: 'mvd-kreator-zrodlo-dysp-teoria',
    // PanelTeorii kreatora agregatu/UPS jest na kroku 2 „Parametry źródła".
    dalejDoTeorii: 'mvd-kreator-zrodlo-dysp-dalej',
  },
  {
    creator: 'odgalezienie',
    root: 'mvd-kreator-odgalezienie',
    tytul: 'MODEL SIECI · ODGAŁĘZIENIE SN',
    krok1: 'mvd-kreator-odgalezienie-sekcja',
    teoria: 'mvd-kreator-odgalezienie-teoria',
  },
  {
    creator: 'slup-odgalezny',
    root: 'mvd-kreator-slup',
    tytul: 'MODEL SIECI · SŁUP ROZGAŁĘŹNY SN',
    krok1: 'mvd-kreator-slup-sekcja',
    teoria: 'mvd-kreator-slup-teoria',
  },
  {
    creator: 'zksn',
    root: 'mvd-kreator-zksn',
    tytul: 'MODEL SIECI · ZŁĄCZE KABLOWE SN',
    krok1: 'mvd-kreator-zksn-sekcja',
    teoria: 'mvd-kreator-zksn-teoria',
  },
  {
    creator: 'przekaznik',
    root: 'mvd-kreator-przekaznik',
    tytul: 'Zabezpieczenie pola SN',
    krok1: 'mvd-kreator-przekaznik-pole',
    teoria: 'mvd-kreator-przekaznik-teoria',
  },
  {
    creator: 'pomiar',
    root: 'mvd-kreator-pomiar',
    tytul: 'Przekładnik prądowy CT',
    krok1: 'mvd-kreator-pomiar-pole',
    teoria: 'mvd-kreator-pomiar-teoria',
  },
  {
    creator: 'pole-nn',
    root: 'mvd-kreator-pole-nn',
    tytul: 'Pole odpływowe nN',
    krok1: 'mvd-kreator-pole-nn-pole',
    teoria: 'mvd-kreator-pole-nn-teoria',
  },
  {
    creator: 'przypisanie-katalogu',
    root: 'mvd-kreator-przypisanie',
    tytul: 'Przypisanie typu katalogowego',
    krok1: 'mvd-kreator-przypisanie-katalog',
    teoria: 'mvd-kreator-przypisanie-teoria',
  },
  {
    creator: 'edycja-parametrow',
    root: 'mvd-kreator-edycja',
    tytul: 'Edycja parametrów elementu',
    krok1: 'mvd-kreator-edycja-parametry',
    teoria: 'mvd-kreator-edycja-teoria',
  },
];

test.describe('kreatory-ekspert:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const scena of SCENY) {
    for (const theme of THEMES) {
      test(`${scena.creator} — ${theme}`, async ({ page }) => {
        const errs: string[] = [];
        const isNoise = (t: string): boolean =>
          /favicon|Download the React DevTools|Failed to load resource/i.test(t);
        page.on('console', (m) => {
          if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
        });
        page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${HARNESS_URL}?creator=${scena.creator}&theme=${theme}`, {
          waitUntil: 'domcontentloaded',
          timeout: 40000,
        });

        const root = page.locator(`[data-testid="${scena.root}"]`).first();
        await expect(root).toBeVisible({ timeout: 15000 });

        // Twarda asercja 1: tytuł kreatora PL widoczny.
        await expect(root.locator('h2.mvd-kreator-tytul')).toHaveText(scena.tytul);

        // Twarda asercja 2: formularz kroku 1 wyrenderowany (stan po wejściu na scenę,
        // przed jakąkolwiek nawigacją między krokami).
        await expect(page.getByTestId(scena.krok1)).toBeVisible();

        // Twarda asercja 3: PanelTeorii obecny. Wszystkie 9 kreatorów fali P-4/P-5
        // go mają; dla kreatora źródła dyspozycyjnego panel jest na kroku 2
        // („Parametry źródła") — przejście jest częścią weryfikacji przed zrzutem.
        if (scena.dalejDoTeorii) {
          await page.getByTestId(scena.dalejDoTeorii).click();
        }
        await expect(page.getByTestId(scena.teoria)).toBeVisible();

        // Twarda asercja 4: zero błędów konsoli.
        await page.waitForTimeout(400);
        if (errs.length > 0) console.log(`[${scena.creator}/${theme}] errors:\n${errs.join('\n')}`);
        expect(errs, `no console/page errors for ${scena.creator}/${theme}`).toEqual([]);

        // Zrzut TYLKO po przejściu asercji.
        const outPath = path.join(OUTPUT_DIR, `kreator-${scena.creator}-${theme}.png`);
        await root.screenshot({ path: outPath });
        expect(fs.existsSync(outPath)).toBe(true);
      });
    }
  }
});
