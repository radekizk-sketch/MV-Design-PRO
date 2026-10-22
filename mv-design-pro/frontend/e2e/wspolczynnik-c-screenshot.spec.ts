/**
 * Zrzuty „po" karty WSPOLCZYNNIK-C-JEDEN-NOSNIK (dyrektywa właściciela #8: ocena wizualna
 * po zmianie nośnika współczynnika napięciowego c — IEC 60909-0, tabela 1).
 *
 * Renderuje REALNE komponenty przez harness `/creator-harness.html` (fetch podmieniony na
 * kształty 1:1 z kontraktami backendu; scena „stacja" idzie na realny backend), interakcje
 * natywne. Zero liczenia c w interfejsie: liczby c i ich podstawa pochodzą z fikstury biegu
 * backendu (`zwarcia_wyniki_scena_zwarcia.json`) albo z zapisu wejścia inżyniera.
 *
 * Sceny (każda w motywie jasnym i ciemnym) → docs/audit/visual/wspolczynnik_c/po_<scena>_<motyw>.png:
 *  - panel_scenariuszy           — MAX/MIN i nadpisanie c z uzasadnieniem (formularz + lista),
 *  - karta_przypadku             — sekcja „Założenia" z notką o nośniku c (bez dawnych pól c),
 *  - ekran_zwarc                 — Założenia (c biegu) i Bilans IEC z „Podstawą współczynnika c",
 *  - tolerancja_nn_kreator       — kreator stacji, krok „Uziemienie i punkt neutralny",
 *  - ekran_zwarc_wartosc_robocza — karta TOLERANCJA-NN-WARTOSC-ROBOCZA: bieg na sieci bez
 *                                  deklaracji tolerancji sieci nN — założenie z dyskretnym
 *                                  znacznikiem „wartość robocza" i akcją „Zmień wartość",
 *                                  bilans punktu nN z podstawą c „(wartość robocza)",
 *  - zmiana_tolerancji_nn        — formularz parametrów otwarty akcją „Zmień wartość" tego
 *                                  założenia (pole deklaracji tolerancji transformatora).
 * Werdykt wizualny wystawia właściciel (B-02) — spec dostarcza wyłącznie zrzuty.
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';
import { katalogZrzutow } from './katalogZrzutow';
import { nazwaElementu } from './nazwyModelu';
import { bramkaTresciMatematycznej } from './trescMatematyczna';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
// Zrzuty do drzewa dokumentacji wyłącznie przy ZRZUTY_DO_DOKUMENTACJI=1 (`katalogZrzutow`);
// karta pisała wprost do `docs/`, co strażnik drzewa e2e (`straznikDrzewa.ts`) zgłosił po
// scaleniu na czubek partii 9 (partia integracji 11).
const OUTPUT_DIR = katalogZrzutow(path.resolve(_dirname, '../../docs/audit/visual/wspolczynnik_c'));
const THEMES = [
  { klucz: 'light', plik: 'jasny' },
  { klucz: 'dark', plik: 'ciemny' },
] as const;

/** Wiersz zwarć sieci nN z fikstury biegu backendu — niesie podstawę c z tolerancją +6 %. */
const ZWARCIA_WYNIKI = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/zwarcia_wyniki_scena_zwarcia.json'),
    'utf-8',
  ),
) as { rows: { target_id: string; c_zrodlo: string | null }[] };
const WIERSZ_NN = ZWARCIA_WYNIKI.rows.find((w) => (w.c_zrodlo ?? '').includes('pasmo nN'))!;
/** Ten sam punkt nN z biegu na wartości roboczej (sieć bez deklaracji tolerancji). */
const ZWARCIA_WYNIKI_ROBOCZE = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/zwarcia_wyniki_scena_tolerancja_robocza.json'),
    'utf-8',
  ),
) as { rows: { target_id: string; c_zrodlo: string | null }[] };
const WIERSZ_NN_ROBOCZY = ZWARCIA_WYNIKI_ROBOCZE.rows.find((w) =>
  (w.c_zrodlo ?? '').includes('(wartość robocza)'),
)!;

const SCENY = [
  'panel_scenariuszy',
  'karta_przypadku',
  'ekran_zwarc',
  'tolerancja_nn_kreator',
  'ekran_zwarc_wartosc_robocza',
  'zmiana_tolerancji_nn',
] as const;
type Scena = (typeof SCENY)[number];

const CREATOR: Record<Scena, string> = {
  panel_scenariuszy: 'panel-scenariuszy',
  karta_przypadku: 'karta-przypadku',
  ekran_zwarc: 'zwarcia',
  tolerancja_nn_kreator: 'stacja',
  ekran_zwarc_wartosc_robocza: 'zwarcia-tolerancja-robocza',
  zmiana_tolerancji_nn: 'edycja-tolerancja-nn',
};

/**
 * Rozpływ i ślad podziału prądu WYBRANEGO punktu nN — realna odpowiedź biegu sceny (fikstura
 * `zwarcia_rozplyw_scena_*` to mapa dla KAŻDEGO punktu), nie komunikat błędu pobrania. Prąd
 * zwarcia szyny nN płynie przez transformator SN/nN, więc tabela rozpływu nosi jego gałąź.
 */
async function rozplywIPodzialPunktuNn(page: Page): Promise<void> {
  const rozplyw = page.getByTestId('mvd-zwarcia-rozplyw');
  await expect(rozplyw.getByTestId('mvd-zwarcia-rozplyw-tabela')).toContainText('TR 15/0.4');
  await expect(rozplyw.getByTestId('mvd-zwarcia-rozplyw-blad')).toHaveCount(0);
  const slad = page.getByTestId('mvd-zwarcia-slad-rozplywu');
  await expect(slad.getByTestId('mvd-zwarcia-slad-rozplywu-lista')).toBeVisible();
  await expect(slad.getByTestId('mvd-zwarcia-slad-rozplywu-blad')).toHaveCount(0);
}

async function prowadzScene(page: Page, scena: Scena): Promise<void> {
  if (scena === 'panel_scenariuszy') {
    // Lista scenariuszy (MAX, MIN, nadpisanie z uzasadnieniem) z kolumny „c".
    await expect(page.getByTestId('mvd-scenariusze-tabela')).toBeVisible();
    await expect(page.getByTestId('mvd-scenariusze-c-scen-max')).toContainText('MAX');
    await expect(page.getByTestId('mvd-scenariusze-c-scen-min')).toContainText('MIN');
    await expect(page.getByTestId('mvd-scenariusze-c-scen-nadpisanie')).toContainText(
      'uzgodnienie z operatorem sieci',
    );
    // Formularz: scenariusz MIN → nadpisanie c z uzasadnieniem (natywne kliki i wpisy).
    await page.getByTestId('mvd-scenariusze-dodaj').click();
    await expect(page.getByTestId('mvd-scenariusze-sekcja-c')).toBeVisible();
    await page.getByTestId('mvd-scenariusze-scenariusz-MIN').check();
    await page.getByTestId('mvd-scenariusze-nadpisz-c').check();
    await page.getByTestId('mvd-scenariusze-c-wartosc').fill('1.05');
    await page
      .getByTestId('mvd-scenariusze-c-uzasadnienie')
      .fill('uzgodnienie z operatorem sieci, ograniczenie c·Un ≤ Um');
    await expect(page.getByTestId('mvd-scenariusze-c-uzasadnienie')).toHaveValue(/operatorem/);
  } else if (scena === 'karta_przypadku') {
    await expect(page.getByTestId('mvd-karta')).toBeVisible();
    await expect(page.getByTestId('mvd-karta-zalozenie-c-nosnik')).toBeVisible();
  } else if (scena === 'ekran_zwarc') {
    await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible();
    await expect(page.getByTestId('mvd-wyn-zalozenia')).toContainText('Współczynnik napięciowy c');
    // Wiersz sieci nN (tolerancja +6 %) → bilans pokazuje jego podstawę c.
    await page
      .getByTestId('mvd-wyn-tabela')
      .first()
      .getByText(nazwaElementu('siec_zlota_scena_migawka', WIERSZ_NN.target_id), { exact: true })
      .first()
      .click();
    const bilans = page.getByTestId('mvd-zwarcia-bilans');
    await expect(bilans).toContainText('Podstawa współczynnika c');
    await expect(bilans).toContainText(WIERSZ_NN.c_zrodlo!);
    await rozplywIPodzialPunktuNn(page);
    await bilans.scrollIntoViewIfNeeded();
  } else if (scena === 'tolerancja_nn_kreator') {
    await page.getByRole('button', { name: /Uziemienie i punkt neutralny/ }).click();
    await expect(page.getByTestId('mvd-kreator-stacja-uziemienie')).toBeVisible({ timeout: 15000 });
    const tolerancja = page.getByTestId('mvd-kreator-stacja-tolerancja-nn');
    await expect(tolerancja).toBeVisible();
    await tolerancja.selectOption('PLUS_10');
    await page.getByTestId('mvd-kreator-stacja-uklad-nn').selectOption('TN-S');
    await tolerancja.scrollIntoViewIfNeeded();
  } else if (scena === 'ekran_zwarc_wartosc_robocza') {
    await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible();
    const zalozenia = page.getByTestId('mvd-wyn-zalozenia');
    await expect(zalozenia).toContainText('Tolerancja napięcia sieci nN');
    await expect(zalozenia.getByTestId('mvd-wyn-zalozenie-znacznik')).toHaveText('wartość robocza');
    await expect(zalozenia.getByRole('button', { name: 'Zmień wartość' })).toBeVisible();
    // Punkt nN biegu na wartości roboczej → bilans pokazuje podstawę c „(wartość robocza)".
    await page
      .getByTestId('mvd-wyn-tabela')
      .first()
      .getByText(nazwaElementu('siec_zlota_scena_migawka', WIERSZ_NN_ROBOCZY.target_id), { exact: true })
      .first()
      .click();
    const bilans = page.getByTestId('mvd-zwarcia-bilans');
    await expect(bilans).toContainText(WIERSZ_NN_ROBOCZY.c_zrodlo!);
    await rozplywIPodzialPunktuNn(page);
    await zalozenia.scrollIntoViewIfNeeded();
  } else {
    // „Zmień wartość" otwiera formularz z kluczem `lv_voltage_tolerance` — pole wartości
    // jest listą tolerancji (słownik kontraktu), nie wolnym tekstem.
    await expect(page.locator('input[value="lv_voltage_tolerance"]').first()).toBeVisible();
    const lista = page.locator('select').filter({ has: page.locator('option[value="PLUS_6"]') }).first();
    await expect(lista).toBeVisible();
    await lista.selectOption('PLUS_6');
  }
}

test.describe('wspolczynnik-c:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const scena of SCENY) {
    for (const theme of THEMES) {
      test(`${scena} — ${theme.plik}`, async ({ page }) => {
        const bledy: string[] = [];
        const szum = (t: string): boolean =>
          /favicon|Download the React DevTools|Failed to load resource/i.test(t);
        page.on('console', (m) => {
          if (m.type() === 'error' && !szum(m.text())) bledy.push(m.text());
        });
        page.on('pageerror', (e) => bledy.push(`PAGEERROR: ${e.message}`));

        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(`${HARNESS_URL}?creator=${CREATOR[scena]}&theme=${theme.klucz}`, {
          waitUntil: 'domcontentloaded',
          timeout: 40000,
        });
        const root = page.locator('[data-testid="creator-harness-root"]').first();
        await expect(root).toBeVisible({ timeout: 15000 });
        await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

        await prowadzScene(page, scena);

        await page.waitForTimeout(400);
        if (bledy.length > 0) console.log(`[${scena}/${theme.plik}] errors:\n${bledy.join('\n')}`);
        expect(bledy, `brak błędów konsoli dla ${scena}/${theme.plik}`).toEqual([]);

        const wyjscie = path.join(OUTPUT_DIR, `po_${scena}_${theme.plik}.png`);
        await bramkaTresciMatematycznej(page);
        await root.screenshot({ path: wyjscie });
        expect(fs.existsSync(wyjscie)).toBe(true);
      });
    }
  }
});
