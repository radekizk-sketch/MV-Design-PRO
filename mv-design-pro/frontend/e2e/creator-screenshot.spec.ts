/**
 * Zrzuty żywych kreatorów ui2 do oceny wizualnej (dyrektywa właściciela #8).
 *
 * Renderuje REALNE komponenty kreatorów (pole SN / źródło OZE / Arc Flash) z
 * zaszczepionym kontekstem i podmienionym `fetch`, w motywie jasnym i ciemnym.
 * Zrzut = jedyny dowód. Harness serwowany przez Vite: /creator-harness.html.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/creator-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/kreatory');

const CREATORS = ['pole', 'oze', 'arcflash'] as const;
const THEMES = ['light', 'dark'] as const;

test.describe('kreatory:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const creator of CREATORS) {
    for (const theme of THEMES) {
      test(`${creator} — ${theme}`, async ({ page }) => {
        const consoleErrors: string[] = [];
        const isNoise = (t: string): boolean =>
          /favicon|Download the React DevTools|Failed to load resource/i.test(t);
        page.on('console', (msg) => {
          if (msg.type() === 'error' && !isNoise(msg.text())) consoleErrors.push(msg.text());
        });
        page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

        await page.setViewportSize({ width: 1220, height: 900 });
        await page.goto(`${HARNESS_URL}?creator=${creator}&theme=${theme}`, {
          waitUntil: 'domcontentloaded',
          timeout: 40000,
        });

        const root = page.locator('[data-testid="creator-harness-root"]').first();
        await expect(root).toBeVisible({ timeout: 15000 });
        await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

        // Arc Flash: wypełnij parametry projektowe i przelicz → pokaż wyniki.
        if (creator === 'arcflash') {
          await page.getByTestId('mvd-jakosc-af-odleglosc').fill('455');
          await page.getByTestId('mvd-jakosc-af-odstep').fill('152');
          await page.getByTestId('mvd-jakosc-af-czas').fill('0.2');
          await page.getByTestId('mvd-jakosc-af-licz').click();
          await expect(page.getByTestId('mvd-jakosc-arcflash')).toBeVisible();
          await expect(page.getByTestId('mvd-wyn-tabela')).toBeVisible();
        }

        await page.waitForTimeout(400);
        if (consoleErrors.length > 0) console.log(`[${creator}/${theme}] errors:\n${consoleErrors.join('\n')}`);
        expect(consoleErrors, `no console/page errors for ${creator}/${theme}`).toEqual([]);

        const outPath = path.join(OUTPUT_DIR, `kreator_${creator}_${theme}.png`);
        await root.screenshot({ path: outPath });
        expect(fs.existsSync(outPath)).toBe(true);
      });
    }
  }

  // Wszystkie 4 ekrany konfiguracji kreatora OZE (technologia → falownik →
  // regulacja → podsumowanie), z wypełnionymi danymi, w obu motywach.
  for (const theme of THEMES) {
    test(`oze — 4 kroki konfiguracji (${theme})`, async ({ page }) => {
      const errs: string[] = [];
      const isNoise = (t: string): boolean =>
        /favicon|Download the React DevTools|Failed to load resource/i.test(t);
      page.on('console', (m) => {
        if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
      });
      page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));

      await page.setViewportSize({ width: 1220, height: 900 });
      await page.goto(`${HARNESS_URL}?creator=oze&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });
      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

      const shot = async (krok: number) => {
        await page.waitForTimeout(300);
        await root.screenshot({ path: path.join(OUTPUT_DIR, `kreator_oze_krok${krok}_${theme}.png`) });
      };

      // Krok 1 — technologia i przyłączenie.
      await page.getByTestId('mvd-kreator-oze-nazwa').fill('Farma PV Wschód');
      await shot(1);

      // Krok 2 — falownik i moc (wybór z katalogu + liczba → tabliczka).
      await page.getByTestId('mvd-kreator-oze-dalej').click();
      await expect(page.getByTestId('mvd-kreator-oze-konwerter')).toBeVisible();
      await page.getByTestId('mvd-kreator-oze-konwerter').selectOption('pv-1');
      await page.getByTestId('mvd-kreator-oze-liczba').fill('12');
      await shot(2);

      // Krok 3 — regulacja mocy biernej i czynnej (wartości rządzące + P(f)/LFSM).
      await page.getByTestId('mvd-kreator-oze-dalej').click();
      await expect(page.getByTestId('mvd-kreator-oze-tryb')).toBeVisible();
      await page.getByTestId('mvd-kreator-oze-tryb').selectOption('Q_OD_U');
      await page.getByTestId('mvd-kreator-oze-qu-slope').fill('4');
      await page.getByTestId('mvd-kreator-oze-qu-db-low').fill('0.95');
      await page.getByTestId('mvd-kreator-oze-qu-db-high').fill('1.05');
      await page.getByTestId('mvd-kreator-oze-qmin').fill('-3');
      await page.getByTestId('mvd-kreator-oze-qmax').fill('3');
      await page.getByTestId('mvd-kreator-oze-statyzm').fill('5');
      await expect(page.getByTestId('mvd-kreator-oze-deadband')).toBeVisible();
      await page.getByTestId('mvd-kreator-oze-deadband').fill('0.2');
      // Rozwiń panel teorii + charakterystyki NC RfG (G-OZE-B5), by zrzut pokazał wykresy.
      await page.getByTestId('mvd-kreator-oze-teoria').locator('summary').click();
      await shot(3);

      // Krok 4 — podsumowanie i zapis.
      await page.getByTestId('mvd-kreator-oze-dalej').click();
      await expect(page.getByTestId('mvd-kreator-oze-zapis')).toBeVisible();
      await shot(4);

      if (errs.length > 0) console.log(`[oze/${theme}] errors:\n${errs.join('\n')}`);
      expect(errs, `no console/page errors for oze kroki/${theme}`).toEqual([]);
    });
  }

  // Krok „Regulacja" kreatora transformatora z żywym wykresem charakterystyki AVR
  // (V12K-067): OLTC + AVR + napięcie zadane/pasmo → wykres zaczep↔napięcie.
  for (const theme of THEMES) {
    test(`transformator — regulacja AVR (${theme})`, async ({ page }) => {
      const errs: string[] = [];
      const isNoise = (t: string): boolean =>
        /favicon|Download the React DevTools|Failed to load resource/i.test(t);
      page.on('console', (m) => {
        if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
      });
      page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));

      await page.setViewportSize({ width: 1220, height: 900 });
      await page.goto(`${HARNESS_URL}?creator=transformator&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });
      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

      // Krok 1 (szyny) → krok 2 (regulacja).
      await page.getByTestId('mvd-kreator-transformator-dalej').click();
      await expect(page.getByTestId('mvd-kreator-transformator-regtyp')).toBeVisible();
      await page.getByTestId('mvd-kreator-transformator-regtyp').selectOption('OLTC');
      await page.getByTestId('mvd-kreator-transformator-control').selectOption('AUTO');
      await page.getByTestId('mvd-kreator-transformator-setpoint').fill('15.75');
      await page.getByTestId('mvd-kreator-transformator-deadband').fill('0.3');
      await page.getByTestId('mvd-kreator-transformator-teoria').locator('summary').click();
      await page.waitForTimeout(300);
      await root.screenshot({
        path: path.join(OUTPUT_DIR, `kreator_transformator_regulacja_${theme}.png`),
      });

      if (errs.length > 0) console.log(`[transformator/${theme}] errors:\n${errs.join('\n')}`);
      expect(errs, `no console/page errors for transformator/${theme}`).toEqual([]);
    });
  }

  // Wykresy teorii kompensatora (Q∝U²) i magistrali (profil napięcia) — krok 1, panel
  // teorii rozwinięty (V12K-068).
  for (const c of ['kompensator', 'magistrala'] as const) {
    for (const theme of THEMES) {
      test(`${c} — teoria z wykresem (${theme})`, async ({ page }) => {
        const errs: string[] = [];
        const isNoise = (t: string): boolean =>
          /favicon|Download the React DevTools|Failed to load resource/i.test(t);
        page.on('console', (m) => {
          if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
        });
        page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));

        await page.setViewportSize({ width: 1220, height: 900 });
        await page.goto(`${HARNESS_URL}?creator=${c}&theme=${theme}`, {
          waitUntil: 'domcontentloaded',
          timeout: 40000,
        });
        const root = page.locator('[data-testid="creator-harness-root"]').first();
        await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

        // Magistrala: wybierz kabel z katalogu (krok „typ", 1) → parametry normowe;
        // panel teorii jest na kroku „parametry" (2). Kompensator: teoria na „typ" (1).
        if (c === 'magistrala') {
          await page.getByTestId('mvd-kreator-magistrala-katalog').selectOption('kab-120');
          await page.getByTestId('mvd-kreator-magistrala-dalej').click();
          // Prąd roboczy > obciążalności → asystent doboru pokazuje ostrzeżenie (M3).
          await page.getByTestId('mvd-kreator-magistrala-prad').fill('300');
        }

        await page.getByTestId(`mvd-kreator-${c}-teoria`).locator('summary').click();
        await page.waitForTimeout(300);
        await root.screenshot({ path: path.join(OUTPUT_DIR, `kreator_${c}_teoria_${theme}.png`) });

        if (errs.length > 0) console.log(`[${c}/${theme}] errors:\n${errs.join('\n')}`);
        expect(errs, `no console/page errors for ${c}/${theme}`).toEqual([]);
      });
    }
  }

  // Ekran wyboru wiązań katalogowych wytwórcy (V12K-242) — ostatnie ogniwo łańcucha
  // F-K8. Zrzut jest dowodem, ale NIE jedynym: bramki przed nim sprawdzają, że ekran
  // pokazuje trzy stany naraz (nazwa z katalogu / nazwa z katalogu / polecenie wyboru)
  // i że picker realnie się otwiera. Zrzut ładnego, ale martwego ekranu byłby fałszem.
  //
  // JEDEN MOTYW, POMIAR ZAMIAST DOMYSŁU: powierzchnie `ui/**` stoją na palecie `scada`
  // (tailwind.config.js, „V12 dark SCADA-tech palette") — stałe wartości hex bez wariantu
  // jasnego i bez pośrednictwa zmiennych CSS. Motyw jasny (`--mvd-*`, tokens.css) obejmuje
  // warstwę ui2. Ten ekran jest więc ciemny NIEZALEŻNIE od `data-theme` i test to
  // SPRAWDZA (invariant poniżej) zamiast milcząco pomijać drugi motyw.
  test('wiazania OZE — wybór z katalogu + niezmienniczość motywu', async ({ page }) => {
    const errs: string[] = [];
    const isNoise = (t: string): boolean =>
      /favicon|Download the React DevTools|Failed to load resource/i.test(t);
    page.on('console', (m) => {
      if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
    });
    page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));

    const tloPanelu = async (theme: string): Promise<string> => {
      await page.goto(`${HARNESS_URL}?creator=wiazania&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });
      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });
      await page.getByTestId('der-card-tab-readiness').click();
      await expect(page.getByTestId('der-wiazania-editor')).toBeVisible();
      return page
        .getByTestId('pv-source-surface')
        .locator('.bg-scada-panel')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    };

    await page.setViewportSize({ width: 1220, height: 900 });
    const tloJasny = await tloPanelu('light');
    const tloCiemny = await tloPanelu('dark');
    expect(tloJasny, 'powierzchnie ui/** stoją na stałej palecie scada — motyw ich nie zmienia').toBe(
      tloCiemny,
    );

    // Nazwy z REALNEGO katalogu dla przypisanych wiązań, polecenie wyboru dla pustego.
    await expect(page.getByTestId('der-wiazanie-wartosc-protection_catalog_ref')).toHaveText(
      'ABB Relion REB670',
    );
    await expect(page.getByTestId('der-wiazanie-wartosc-ct_catalog_ref')).toHaveText(
      'CT 200/5 A kl. 5P10 10 VA',
    );
    await expect(page.getByTestId('der-wiazanie-wartosc-vt_catalog_ref')).toHaveText(
      'wybierz wariant katalogowy',
    );
    // Kontekst projektu i przypadku jest kompletny → ostrzeżenie o blokadzie zapisu
    // NIE może być widoczne (inaczej zrzut pokazywałby ekran w stanie zablokowanym).
    await expect(page.getByTestId('der-wiazania-brak-kontekstu')).toHaveCount(0);
    // Werdykt osi liczony na żywo z rekordu (V12K-243): przekładnika napięciowego brak,
    // więc oś zabezpieczeń NIE może pokazywać zakresu kompletnego.
    await expect(page.getByTestId('pv-source-surface')).toContainText('zakres do przeliczenia');

    await page.waitForTimeout(300);
    const root = page.locator('[data-testid="creator-harness-root"]').first();
    await root.screenshot({ path: path.join(OUTPUT_DIR, 'wiazania_oze.png') });

    // Picker otwiera się realnym klikiem i pokazuje typy z katalogu.
    await page.getByTestId('der-wiazanie-wybierz-vt_catalog_ref').click();
    await expect(page.getByText('VT 10/0,1 kV kl. 0.5')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'wiazania_oze_picker.png') });

    if (errs.length > 0) console.log(`[wiazania] errors:\n${errs.join('\n')}`);
    expect(errs, 'no console/page errors for wiazania').toEqual([]);
  });

  // Układ mobilny powierzchni wytwórcy (karta E21-5, audyt E-21 pkt P12).
  //
  // BRAMKA MIERZY UKŁAD, NIE TREŚĆ. Zrzut ładnego ekranu na telefonie nic nie dowodzi,
  // dopóki nie wiadomo, że (1) strona nie ucieka w bok, (2) w cel dotykowy da się
  // trafić palcem (44×44 px wg WCAG 2.5.5 / wytycznych platform) i (3) wiersze pól
  // faktycznie łamią się na telefonie, a na tablecie wracają do układu dwukolumnowego.
  // Wszystkie trzy sprawdzenia czytają REALNĄ geometrię wyrenderowanego ekranu
  // (`boundingBox`, `scrollWidth`), a nie klasy CSS — regresja układu ma być widoczna
  // niezależnie od tego, którą klasą ktoś ją wprowadzi.
  const WIDOKI_DOTYKOWE = [
    { wariant: 'mobile', width: 390, height: 844, ukladPionowy: true },
    { wariant: 'tablet', width: 768, height: 1024, ukladPionowy: false },
  ] as const;

  for (const widok of WIDOKI_DOTYKOWE) {
    test(`wiazania OZE — uklad dotykowy (${widok.wariant})`, async ({ page }) => {
      const errs: string[] = [];
      const isNoise = (t: string): boolean =>
        /favicon|Download the React DevTools|Failed to load resource/i.test(t);
      page.on('console', (m) => {
        if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
      });
      page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));

      await page.setViewportSize({ width: widok.width, height: widok.height });
      await page.goto(`${HARNESS_URL}?creator=wiazania&theme=dark`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });
      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

      // Zakładki kart są przewijane poziomo we WŁASNYM pasku — dostęp do karty
      // „Gotowość" nie może wymagać przewijania całej strony.
      await page.getByTestId('der-card-tab-readiness').click();
      await expect(page.getByTestId('der-wiazania-editor')).toBeVisible();

      // (1) Strona jako całość NIE przewija się poziomo.
      const poziom = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(
        poziom.scrollWidth,
        `strona przewija sie poziomo (${poziom.scrollWidth} > ${poziom.innerWidth}) w widoku ${widok.wariant}`,
      ).toBeLessThanOrEqual(poziom.innerWidth + 1);

      // (2) Próg dotykowy przycisku wyboru wiązania: 44 × 44 px.
      const przyciskWyboru = page.getByTestId('der-wiazanie-wybierz-vt_catalog_ref');
      const celDotykowy = await przyciskWyboru.boundingBox();
      expect(celDotykowy, 'przycisk wyboru wiazania musi byc widoczny').not.toBeNull();
      expect(
        celDotykowy!.height,
        `wysokosc celu dotykowego w widoku ${widok.wariant}`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        celDotykowy!.width,
        `szerokosc celu dotykowego w widoku ${widok.wariant}`,
      ).toBeGreaterThanOrEqual(44);

      // (3) Zakładka karty też jest celem dotykowym.
      const zakladka = await page.getByTestId('der-card-tab-readiness').boundingBox();
      expect(zakladka, 'zakladka karty musi byc widoczna').not.toBeNull();
      expect(
        zakladka!.height,
        `wysokosc zakladki karty w widoku ${widok.wariant}`,
      ).toBeGreaterThanOrEqual(44);

      // (3a) Pasek zakładek przewija się WE WŁASNYM zakresie. Samo sprawdzenie „strona
      // nie przewija się w bok" tego nie łapie: panel karty jest kontenerem
      // przewijanym, więc pasek bez własnego `overflow-x` po prostu przesuwa razem ze
      // sobą treść karty — dojście do ostatniej zakładki zjeżdża całym ekranem w bok,
      // a strona pozostaje „czysta". Mierzymy więc zachowanie: gdy zakładki są szersze
      // niż pasek, pasek MUSI dać się przewinąć sam.
      const pasekZakladek = page.getByTestId('pv-source-surface').locator('nav[role="tablist"]').first();
      const przewijaniePaska = await pasekZakladek.evaluate((el) => {
        const przed = el.scrollLeft;
        el.scrollLeft = el.scrollWidth;
        const poPrzewinieciu = el.scrollLeft;
        el.scrollLeft = przed;
        return { tresc: el.scrollWidth, okno: el.clientWidth, poPrzewinieciu };
      });
      if (przewijaniePaska.tresc > przewijaniePaska.okno) {
        expect(
          przewijaniePaska.poPrzewinieciu,
          'pasek zakladek musi przewijac sie sam (inaczej przewija sie cala karta)',
        ).toBeGreaterThan(0);
      }

      // (3b) Dojście do zakładki nie może wypchnąć treści karty poza lewą krawędź.
      const trescKarty = await page.getByTestId('der-card-content-readiness').boundingBox();
      expect(trescKarty, 'tresc karty musi byc widoczna').not.toBeNull();
      expect(
        trescKarty!.x,
        'tresc karty zostala przesunieta w bok przy dojsciu do zakladki',
      ).toBeGreaterThanOrEqual(-1);

      // (4) Wiersz pola: etykieta NAD wartością na telefonie, obok wartości na tablecie.
      const wiersz = page.locator('div:has(> dt:text-is("Stan konfiguracji"))').first();
      const etykieta = await wiersz.locator('dt').boundingBox();
      const wartosc = await wiersz.locator('dd').boundingBox();
      expect(etykieta, 'etykieta wiersza musi byc widoczna').not.toBeNull();
      expect(wartosc, 'wartosc wiersza musi byc widoczna').not.toBeNull();
      if (widok.ukladPionowy) {
        expect(
          wartosc!.y,
          'na telefonie wartosc stoi PONIZEJ etykiety (uklad jednokolumnowy)',
        ).toBeGreaterThanOrEqual(etykieta!.y + etykieta!.height - 1);
      } else {
        expect(
          wartosc!.x,
          'na tablecie wartosc stoi OBOK etykiety (uklad dwukolumnowy)',
        ).toBeGreaterThan(etykieta!.x + etykieta!.width - 1);
        expect(
          Math.abs(wartosc!.y - etykieta!.y),
          'na tablecie etykieta i wartosc sa w tym samym wierszu',
        ).toBeLessThanOrEqual(2);
      }

      await page.waitForTimeout(300);
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `wiazania_oze_${widok.wariant}.png`),
        fullPage: true,
      });

      if (errs.length > 0) console.log(`[wiazania/${widok.wariant}] errors:\n${errs.join('\n')}`);
      expect(errs, `no console/page errors for wiazania/${widok.wariant}`).toEqual([]);
    });
  }

  // Wykres teorii odbioru (trójkąt mocy) (V12K-069). GPZ (WykresSztywnosci) pokryty
  // testem jednostkowym; zrzut w harnessie wymaga pełniejszego zaszczepienia kontekstu
  // 7-krokowego kreatora GPZ (depth backlog standardu).
  for (const c of ['odbior'] as const) {
    for (const theme of THEMES) {
      test(`${c} — teoria z wykresem (${theme})`, async ({ page }) => {
        const errs: string[] = [];
        const isNoise = (t: string): boolean =>
          /favicon|Download the React DevTools|Failed to load resource/i.test(t);
        page.on('console', (m) => {
          if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
        });
        page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));

        await page.setViewportSize({ width: 1220, height: 900 });
        await page.goto(`${HARNESS_URL}?creator=${c}&theme=${theme}`, {
          waitUntil: 'domcontentloaded',
          timeout: 40000,
        });
        const root = page.locator('[data-testid="creator-harness-root"]').first();
        await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

        // GPZ: panel teorii jest na kroku „źródło i strona WN" (2); odbiór na „dane" (1).
        if (c === 'zrodlo') await page.getByTestId('mvd-kreator-zrodlo-dalej').click();

        await page.getByTestId(`mvd-kreator-${c}-teoria`).locator('summary').click();
        await page.waitForTimeout(300);
        await root.screenshot({ path: path.join(OUTPUT_DIR, `kreator_${c}_teoria_${theme}.png`) });

        if (errs.length > 0) console.log(`[${c}/${theme}] errors:\n${errs.join('\n')}`);
        expect(errs, `no console/page errors for ${c}/${theme}`).toEqual([]);
      });
    }
  }
});
