/**
 * Zrzut KAŻDEJ sceny harnessu — bramka pokrycia ekranów (V12K-259).
 *
 * DLACZEGO POWSTAŁ. Harness renderował 43 sceny żywych komponentów, a spec zrzutów
 * kadrował 9 z nich. Pozostałe 34 były utrzymywane i nigdy nieoglądane — zdolność bez
 * konsumenta, ten sam wzorzec co reguła gotowości bez wywołania (V12K-251). Pierwsze
 * uruchomienie tej bramki znalazło scenę `zrodlo` w stanie TWARDEGO CRASHU (biały ekran,
 * `Cannot read properties of undefined (reading 'length')`) — defekt niewidoczny latami,
 * bo nikt tego ekranu nie renderował w CI.
 *
 * CO SPRAWDZA (poza samym kadrem):
 *  1. korzeń harnessu osiąga `data-status=ready` — scena w ogóle się składa,
 *  2. ZERO błędów konsoli i ZERO wyjątków renderu — biały ekran nie przejdzie,
 *  3. treść nie zawiera komunikatu o nieudanym pobraniu — scena bez atrapy końcówki
 *     pokazywałaby błąd, a zrzut do oceny wyglądałby równie porządnie.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/creator-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/sceny');

/** Sceny kadrowane przez `creator-screenshot.spec.ts` — tam mają własne interakcje. */
const JUZ_KADROWANE = new Set([
  'pole', 'oze', 'arcflash', 'magistrala', 'kompensator', 'transformator', 'odbior', 'wiazania',
]);

const SCENY = [
  'cieplna', 'dokumentacja', 'edycja-parametrow', 'estymacja', 'frt', 'kompensacja',
  'kompensacja-wynik', 'lom', 'macierz', 'migotanie', 'odbior-zgodnosc', 'odgalezienie',
  'oltc', 'pole-nn', 'pomiar', 'porownanie', 'przekaznik', 'przypisanie-katalogu', 'pulpit',
  'rozplyw', 'sila-sieci', 'slup-odgalezny', 'ssci', 'swiezosc', 'uwaga', 'walidacja',
  'wyniki-skladowe', 'wyniki-stabilnosc', 'wyniki-stan-fazowy', 'wyniki-zbieznosc', 'zksn',
  'zrodlo', 'zrodlo-dyspozycyjne', 'zwarcia', 'zwarcia-rozplyw',
].filter((s) => !JUZ_KADROWANE.has(s));

const THEMES = ['light', 'dark'] as const;

test.describe('sceny:screenshot', () => {
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
        await expect(root, `scena ${scena} nie doszła do stanu gotowego`).toHaveAttribute(
          'data-status',
          'ready',
          { timeout: 15000 },
        );

        // Treść musi być POKAZANA, nie obiecana: pusty korzeń to scena, która się
        // złożyła i nic nie wyrenderowała.
        const tresc = ((await root.textContent()) ?? '').replace(/\s+/g, ' ').trim();
        expect(tresc.length, `scena ${scena} wyrenderowała pustą treść`).toBeGreaterThan(80);
        // WZORZEC SZEROKI CELOWO (V12K-260): pierwsza wersja lapala tylko „Nie udalo sie
        // POBRAC", a scena odbioru pokazywala „Nie udalo sie WYZNACZYC podgladu pradu" —
        // ten sam defekt, inne slowo, bramka niema. Kazda odmiana „nie udalo sie" na
        // ekranie do oceny znaczy brakujaca atrape albo realna awarie.
        expect(
          /Nie udało się/i.test(tresc),
          `scena ${scena} pokazuje komunikat o niepowodzeniu — brakuje atrapy końcówki`,
        ).toBe(false);

        await page.waitForTimeout(250);
        await root.screenshot({ path: path.join(OUTPUT_DIR, `scena_${scena}_${theme}.png`) });

        if (errs.length > 0) console.log(`[${scena}/${theme}] errors:\n${errs.join('\n')}`);
        expect(errs, `błędy renderu w scenie ${scena}/${theme}`).toEqual([]);
      });
    }
  }
});

/**
 * Koordynacja zabezpieczeń (E-28) — kadr Z POLICZONYM WYNIKIEM (V12K-262).
 *
 * Osobny test, bo ten ekran nie pokazuje niczego bez przejścia ŚCIEŻKI: dwa
 * zabezpieczenia z szablonu → uruchomienie analizy → krzywe TCC i werdykty par.
 * Klik jest NATYWNY (`page.click`), nie wymuszeniem stanu store — inaczej zrzut
 * dowodziłby działania atrapy, a nie ekranu (precedens: martwy lewy klik w SLD,
 * latami niewidoczny, bo wszystkie specy klikały syntetycznie).
 */
test.describe('koordynacja:screenshot', () => {
  for (const theme of THEMES) {
    test(`koordynacja z wynikiem — ${theme}`, async ({ page }) => {
      const errs: string[] = [];
      const isNoise = (t: string): boolean =>
        /favicon|Download the React DevTools|Failed to load resource/i.test(t);
      page.on('console', (m) => {
        if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
      });
      page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));

      await page.setViewportSize({ width: 1220, height: 1400 });
      await page.goto(`${HARNESS_URL}?creator=koordynacja&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });

      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });
      // Bieg zwarciowy jest zasiany, więc ekran MUSI wpuścić do strony koordynacji,
      // a nie zatrzymać się na uczciwym stanie zerowym.
      await expect(page.getByTestId('protection-coordination-page')).toBeVisible();

      // Dwa zabezpieczenia z szablonu — realną drogą projektanta: szablon,
      // WSKAZANIE ELEMENTU MODELU z listy (V12K-262: lokalizacji nie da się już
      // dostać „za darmo", bo ekran jej nie wymyśla), zapis konfiguracji.
      const elementy = ['gpz/sekcja_a/bus_sn', 'stacja_s02/bus_sn'];
      for (const element of elementy) {
        await page.getByTitle('Zastosuj szablon').click();
        // Klik ZAWĘŻONY do okna szablonów: po dodaniu pierwszego zabezpieczenia ta sama
        // nazwa jest też na liście urządzeń POD nakładką, a `.first()` trafiał w nią
        // i modal przechwytywał zdarzenie.
        await page.locator('div.fixed.inset-0').getByText('Przekaznik 50/51 (typowy)').click();
        await expect(page.getByTestId('protection-settings-editor')).toBeVisible();
        await page.getByTestId('device-location-select').selectOption(element);
        await page.getByRole('button', { name: 'Zapisz konfigurację' }).click();
      }

      // Bramka lokalizacji jest zdjęta, prądy z obu biegów (c = 1,10 i c = 0,95)
      // związały się z elementami — dopiero teraz analiza ma na czym liczyć.
      await expect(page.getByTestId('coordination-missing-currents')).toHaveCount(0);
      const uruchom = page.getByTestId('run-analysis-button');
      await expect(uruchom).toBeEnabled();
      await uruchom.click();

      // Werdykt pary z NARUSZENIEM musi dojechać na ekran wraz z widoczną akcją
      // naprawczą (V12K-261) — to jest dowód, że łańcuch domknął się do końca.
      await page.getByTestId('tab-selectivity').click();
      await expect(page.getByTestId('selectivity-table')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('selectivity-fix-dev-nadrzedne')).toBeVisible();

      // Krzywe czasowo-prądowe: sedno tego ekranu i jedyny wykres log-log w systemie.
      await page.getByTestId('tab-tcc').click();
      await expect(page.locator('svg').first()).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(400);

      await root.screenshot({ path: path.join(OUTPUT_DIR, `scena_koordynacja_${theme}.png`) });

      if (errs.length > 0) console.log(`[koordynacja/${theme}] errors:\n${errs.join('\n')}`);
      expect(errs, `błędy renderu w scenie koordynacji/${theme}`).toEqual([]);
    });
  }
});
