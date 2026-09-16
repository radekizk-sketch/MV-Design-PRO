/**
 * Zrzuty żywych ekranów programu FLOW EKSPERT+ (karta K5, dyrektywa #8).
 *
 * Sceny (creator-harness, realne komponenty + zaszczepione store'y):
 * - pulpit    — Pulpit projektu z kaflem „Warunki przyłączenia" (K2: warunki OSD
 *               z nagłówka + werdykt „przekracza limit OSD": generacja 6,2 > 5,0 MW),
 * - uwaga     — rejestr „Co wymaga uwagi" (A1) z akcjami z rejestru akcji (K1),
 * - swiezosc  — pasek aktywnego przypadku ze znacznikiem „wyniki nieaktualne" (K4).
 * Oba motywy. Zrzut = jedyny dowód (strona oceny właściciela).
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert');

const SCENY = [
  'pulpit',
  'uwaga',
  'swiezosc',
  'walidacja',
  'kompensacja',
  'rozplyw',
  'zwarcia',
  'porownanie',
] as const;
const THEMES = ['light', 'dark'] as const;

test.describe('flow-ekspert:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const scena of SCENY) {
    for (const theme of THEMES) {
      test(`${scena} — ${theme}`, async ({ page }) => {
        const errs: string[] = [];
        const isNoise = (t: string): boolean =>
          /favicon|Download the React DevTools|Failed to load resource/i.test(t);
        page.on('console', (m) => {
          if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
        });
        page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));

        await page.setViewportSize({ width: 1220, height: 900 });
        await page.goto(`${HARNESS_URL}?creator=${scena}&theme=${theme}`, {
          waitUntil: 'domcontentloaded',
          timeout: 40000,
        });
        const root = page.locator('[data-testid="creator-harness-root"]').first();
        await expect(root).toBeVisible({ timeout: 15000 });
        await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

        // Twarde dowody sceny (nie pusty ekran):
        if (scena === 'pulpit') {
          await expect(page.getByTestId('pulpit-osd-limit')).toBeVisible();
          await expect(page.getByTestId('pulpit-osd-werdykt')).toContainText('przekracza');
        } else if (scena === 'uwaga') {
          // HARNESS-RESZTA-kontynuacja: scena „rozplyw"/„uwaga" karmiona REALNYM
          // biegiem PF na sieci złotej z obciążeniem ×8 (`rozplyw_scena_wynik.json`)
          // — `kryteria_napiecia` NIE jest już puste (dawny stan „brak podstaw do
          // oceny" z CI run 444 był właściwy dla WCZEŚNIEJSZEGO, ręcznie pisanego
          // zasiewu bez tego pola). Rejestr przekroczeń pokazuje realną listę z
          // energy-validation buildera (m.in. odchylenie napięcia „Szyna nN"
          // FAIL 25,17 % i obciążenie transformatora FAIL 702,1 % — ta sama sieć
          // co scena „rozplyw").
          await expect(page.getByTestId('mvd-cwu-podsumowanie')).toBeVisible();
          await expect(page.getByTestId('mvd-cwu-lista')).toBeVisible();
          expect(await page.getByTestId('mvd-cwu-pozycja').count()).toBeGreaterThan(0);
        } else if (scena === 'swiezosc') {
          await expect(page.getByTestId('mvd-casebar')).toBeVisible();
          await expect(page.getByTestId('mvd-casebar-results')).toContainText('nieaktualne');
        } else if (scena === 'walidacja') {
          // R2-A: wybor pozycji z wywodem (klik wiersza tabeli po etykiecie
          // rodzaju kontroli) -> rozwiniety slad WHITE BOX. `.first()`
          // (HARNESS-RESZTA-kontynuacja): realna sieć ×8 obciążenia ma
          // „Odchylenie napięcia" na WSZYSTKICH 5 szynach (nie jednej jak dawny
          // mock) — pierwszy wiersz (Szyna nN) ma werdykt PRZEKROCZENIE (25,17 %,
          // realnie najniższe napięcie sieci — szyna nN za przeciążonym
          // transformatorem 15/0.4).
          await expect(page.getByTestId('mvd-jakosc-walidacja')).toBeVisible();
          await page.getByRole('row').filter({ hasText: 'Odchylenie napięcia' }).first().click();
          await page.getByTestId('mvd-jakosc-wal-slad-otworz').click();
          await expect(page.getByTestId('mvd-jakosc-wal-slad')).toContainText('Werdykt: PRZEKROCZENIE');
        } else if (scena === 'rozplyw') {
          // R3-A: podzakladka Galezie -> kolumna "Obciazenie [%]" z werdyktem
          // backendu (HARNESS-RESZTA-kontynuacja: scena "rozplyw" karmiona
          // realnym biegiem PF na sieci zlotej z obciazeniem ×8 —
          // `walidacja_scena_wynik.json`, TRANSFORMER_LOADING 702,1 % FAIL na
          // galezi 158eec95…; dawny recznie wpisany werdykt "TR-1 FAIL 104 %,
          // L-14 WARNING 90 %" nie odpowiadal zadnej realnej galezi).
          await page.getByTestId('mvd-rozplyw-podzakladka-galezie').click();
          await expect(page.getByTestId('mvd-wyn-th-obciazenie')).toBeVisible();
          await expect(page.getByTestId('mvd-wyn-tabela')).toContainText('702,1');
          await expect(page.getByTestId('mvd-wyn-tabela')).toContainText('Poza zakresem');
        } else if (scena === 'zwarcia') {
          // R3-B: sekcja wkladow dla domyslnego punktu z realnego dostawcy
          // (endpoint SC3F contributions, podmieniony fetch).
          // Scena karmiona fixturą REALNEGO biegu backendu (HARNESS-ZWARCIA, złota sieć
          // CGMES): jedyna maszyna wirująca to „Generator synchroniczny" (gen_sync);
          // punkt domyślny Szyna SN: Z_k = 1,0640 Ω, κ = 1,861 (fixtura
          // harness-fixtures/generated/zwarcia_wyniki_scena_zwarcia.json, parytet w CI).
          await expect(page.getByTestId('mvd-zwarcia-wklady')).toContainText('Generator synchroniczny');
          // ZWARCIA-PRO F1: panel „Bilans IEC 60909" + kolumny impedancyjne (ekspert).
          await expect(page.getByTestId('mvd-zwarcia-bilans')).toContainText('1,0640 Ω');
          await expect(page.getByTestId('mvd-zwarcia-bilans')).toContainText('1,861');
          await expect(page.getByTestId('mvd-wyn-th-kappa')).toBeVisible();
          // F2: rozwiniecie wkladu maszyny (klik wiersza tabeli wkladow -> mu/q/Ib).
          await page
            .getByTestId('mvd-zwarcia-wklady')
            .getByTestId('mvd-wyn-tabela')
            .getByText('Generator synchroniczny')
            .click();
          await expect(page.getByTestId('mvd-zwarcia-wklad-szczegol')).toContainText('0,705');
          // F3: wywod SEKCYJNY na zadanie — akordeon z norma; klik sekcji wkladu
          // -> kroki KaTeX; checklista walidacji IEC.
          await page.getByTestId('mvd-zwarcia-wklady-slad-btn').click();
          await page.getByTestId('mvd-zwarcia-wklady-slad-sekcja-btn-1').click();
          await expect(
            page
              .getByTestId('mvd-zwarcia-wklady-slad-sekcja-kroki-1')
              .locator('[data-testid="math-rendered"]')
              .first(),
          ).toBeVisible();
          await page.getByTestId('mvd-zwarcia-wklady-slad-walidacja-btn').click();
          await expect(page.getByTestId('mvd-zwarcia-wklady-slad-walidacja')).toContainText(
            'IEC 60909-0:2016',
          );
        } else if (scena === 'porownanie') {
          // R3-C: wybor pary A/B + jawne "Porownaj przebiegi" -> wynik z tabela
          // szyn (kolumny A i B z dowodami wlasciwego przebiegu).
          await page.getByTestId('mvd-por-select-a').selectOption('run-a');
          await page.getByTestId('mvd-por-select-b').selectOption('run-b');
          await page.getByTestId('mvd-por-przycisk').click();
          await expect(page.getByTestId('mvd-por-wynik')).toBeVisible();
          await expect(page.getByTestId('mvd-por-wynik')).toContainText('SZ-ST7');

          // KD-1 (L-12 + L-14): kolumny mocy biernej z payloadu backendu oraz
          // filtr "tylko roznice". Zrzut do oceny wlasciciela pokazuje OBIE
          // zdolnosci naraz (filtr wlaczony ukrywa szyne bez roznic SZ-ST3).
          await expect(page.getByTestId('mvd-por-wynik')).toContainText('Moc bierna A');
          await expect(page.getByTestId('mvd-por-wynik')).toContainText('SZ-ST3');
          await page.getByTestId('mvd-por-filtr-roznice').check();
          await expect(page.getByTestId('mvd-por-wynik')).not.toContainText('SZ-ST3');
          await page.waitForTimeout(200);
          const qPath = path.join(OUTPUT_DIR, `porownanie-q-${theme}.png`);
          await root.screenshot({ path: qPath });
          expect(fs.existsSync(qPath)).toBe(true);
          // Powrot do stanu bazowego sceny — zrzut zbiorczy bez zmian.
          await page.getByTestId('mvd-por-filtr-roznice').uncheck();
        } else {
          // R2-B: pre-selekcja wezla z deep-linku widoczna w polu wyboru
          // (HARNESS-RESZTA-kontynuacja: bus_sn_b, realny wezel zasiewu sceny
          // "kompensacja" po konwersji na fixture realnego biegu backendu).
          await expect(page.getByTestId('mvd-komp-wezel')).toHaveValue('bus_sn_b');
        }

        await page.waitForTimeout(400);
        if (errs.length > 0) console.log(`[${scena}/${theme}] errors:\n${errs.join('\n')}`);
        expect(errs, `no console/page errors for ${scena}/${theme}`).toEqual([]);

        const outPath = path.join(OUTPUT_DIR, `flow_${scena}_${theme}.png`);
        await root.screenshot({ path: outPath });
        expect(fs.existsSync(outPath)).toBe(true);
      });
    }
  }
});
