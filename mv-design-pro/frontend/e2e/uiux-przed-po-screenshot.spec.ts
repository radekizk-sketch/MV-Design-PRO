/**
 * Zrzuty „przed/po” programu UIUX-PRZEMYSLOWY (kontrakt właściciela 2026-10-16, §10 pkt 7)
 * dla punktów UI-01 (górny obszar), UI-02 (wykorzystanie ekranu, panele) i UI-04 (kadrowanie
 * SLD) — materiał oceny właściciela (bramka B-02); spec NIE wystawia werdyktu wizualnego.
 *
 * Warunek porównania: ten sam spec, te same dane (sieć `siecKadrow`: GPZ, magistrala, stacje
 * odgałęźna, sekcyjna, końcowa i końcowa odgałęzienia), to samo okno, ten sam motyw startowy i te same
 * NATYWNE kroki użytkownika uruchamiane na drzewie „przed” (sprzed zmiany) i „po”. Różnica
 * obrazów wynika wyłącznie z produktu. Etap biegu nazywa zmienna `UIUX_ETAP` (`przed`/`po`),
 * domyślnie `po`; zrzuty: `docs/uiux/zrzuty/przed-po/<etap>/<punkt>-<scena>-<okno>-<motyw>.png`
 * (przez `katalogZrzutow` — do drzewa repo tylko z `ZRZUTY_DO_DOKUMENTACJI=1`).
 *
 * Sceny:
 *  - UI-01/UI-02 `powloka`: aplikacja po otwarciu projektu (przestrzeń schematu);
 *  - UI-02 `inspektor`: natywny klik w nazwę stacji na schemacie — inspektor otwarty;
 *  - UI-02 `panel-dolny`: panel dolny otwarty z paska stanu (jeśli powłoka go ma);
 *  - UI-04 `siec`: „Dopasuj widok” bez zaznaczenia;
 *  - UI-04 `dwuklik-stacji`: natywny dwuklik w nazwę stacji odgałęźnej w widoku sieci;
 *  - UI-04 `stacja-dopasuj`: zaznaczenie stacji odgałęźnej + „Dopasuj widok”.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { katalogZrzutow, KORZEN_REPO } from './katalogZrzutow';
import { otworzAplikacje, siecKadrow } from './siecKadrowStacji';

const ETAP = process.env.UIUX_ETAP === 'przed' ? 'przed' : 'po';
const KATALOG = katalogZrzutow(path.join(KORZEN_REPO, 'mv-design-pro/docs/uiux/zrzuty/przed-po', ETAP));
const MOTYWY = [
  { klucz: 'ciemny', theme: 'dark_scada' as const },
  { klucz: 'jasny', theme: 'light_technical' as const },
];
const OKNA_POWLOKI = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const OKNO_SLD = { width: 1440, height: 900 };

const plik = (punkt: string, scena: string, okno: { width: number; height: number }, motyw: string) =>
  path.join(KATALOG, `${punkt}-${scena}-${okno.width}x${okno.height}-${motyw}.png`);

/** Kroki niedostępne w danym drzewie zapisujemy jawnie (brak zrzutu ≠ zrzut pusty). */
const pominiete: string[] = [];

async function uspokoj(page: Page): Promise<void> {
  await page.waitForTimeout(700);
}

async function uchwytStacji(page: Page, ref: string) {
  const uchwyt = page.locator(`[data-hit-role="obrys"][data-hit-owner-ref^="${ref}#name-row"]`).first();
  await expect(uchwyt, `uchwyt nazwy stacji ${ref}`).toHaveCount(1, { timeout: 30_000 });
  return uchwyt;
}

test.describe(`UIUX przed/po — etap „${ETAP}”`, () => {
  test.describe.configure({ mode: 'serial' });
  let seed: Awaited<ReturnType<typeof siecKadrow>>;
  let refOdgaleznej: string;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    mkdirSync(KATALOG, { recursive: true });
    seed = await siecKadrow(request);
    const stacja = (seed.enm.substations ?? []).find((s) => s.name === 'Stacja Odgałęźna');
    expect(stacja).toBeTruthy();
    refOdgaleznej = stacja!.ref_id;
  });

  test.afterAll(() => {
    writeFileSync(path.join(KATALOG, `pominiete-${ETAP}.txt`), `${pominiete.join('\n')}\n`);
  });

  for (const motyw of MOTYWY) {
    for (const okno of OKNA_POWLOKI) {
      test(`UI-01/UI-02 powłoka ${okno.width}×${okno.height} ${motyw.klucz}`, async ({ page }) => {
        test.setTimeout(180_000);
        await otworzAplikacje(page, seed, okno, motyw.theme);
        await expect(page.locator('html')).toHaveAttribute('data-theme', motyw.theme);
        await page.getByTestId('sld-v3-fit-view').click();
        await uspokoj(page);
        await page.screenshot({ path: plik('ui01', 'powloka', okno, motyw.klucz) });

        await (await uchwytStacji(page, refOdgaleznej)).click();
        await uspokoj(page);
        await page.screenshot({ path: plik('ui02', 'inspektor', okno, motyw.klucz) });

        const bieg = page.getByTestId('mvd-status-run');
        if ((await bieg.count()) === 1) {
          await bieg.click();
          await expect(page.getByTestId('mvd-bottom-panel')).toBeVisible();
          await uspokoj(page);
          await page.screenshot({ path: plik('ui02', 'panel-dolny', okno, motyw.klucz) });
        } else {
          pominiete.push(`ui02-panel-dolny-${okno.width}x${okno.height}-${motyw.klucz}: powłoka nie ma panelu dolnego`);
        }
      });
    }

    test(`UI-04 kadrowanie SLD ${motyw.klucz}`, async ({ page }) => {
      test.setTimeout(180_000);
      await otworzAplikacje(page, seed, OKNO_SLD, motyw.theme);
      const dopasuj = page.getByTestId('sld-v3-fit-view');

      await dopasuj.click();
      await uspokoj(page);
      await page.screenshot({ path: plik('ui04', 'siec', OKNO_SLD, motyw.klucz) });

      await (await uchwytStacji(page, refOdgaleznej)).dblclick();
      await uspokoj(page);
      await page.screenshot({ path: plik('ui04', 'dwuklik-stacji', OKNO_SLD, motyw.klucz) });

      // Powrót do stanu wyjściowego tą samą drogą w obu drzewach: przeładowanie aplikacji.
      await otworzAplikacje(page, seed, OKNO_SLD, motyw.theme);
      await dopasuj.click();
      await uspokoj(page);
      await (await uchwytStacji(page, refOdgaleznej)).click();
      await dopasuj.click();
      await uspokoj(page);
      await page.screenshot({ path: plik('ui04', 'stacja-dopasuj', OKNO_SLD, motyw.klucz) });
    });
  }
});
