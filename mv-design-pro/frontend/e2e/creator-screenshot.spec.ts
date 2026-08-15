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

  // Wszystkie ekrany konfiguracji kreatora OZE, z wypełnionymi danymi, w obu
  // motywach. INTENCJA: dokumentacyjny zrzut KAŻDEGO kroku toru pracy. K9-A
  // przebudowała kreator do pełnego toru (technologia → falownik → aparatura
  // pola → zgodność przyłączeniowa → regulacja → podsumowanie) — spec idzie
  // po obecnym kanonie kroków.
  for (const theme of THEMES) {
    test(`oze — kroki konfiguracji, pełny tor (${theme})`, async ({ page }) => {
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

      // Krok 3 — aparatura pola (K9-A): CT/VT/zabezpieczenie z katalogu.
      await page.getByTestId('mvd-kreator-oze-dalej').click();
      await expect(page.getByTestId('mvd-kreator-oze-aparatura')).toBeVisible();
      const ctWybor = page.getByTestId('mvd-kreator-oze-aparatura-ct');
      await expect(ctWybor.locator('option').nth(1)).toBeAttached({ timeout: 15000 });
      await ctWybor.selectOption('ct_200_5_5p10_10va_abb');
      await page.getByTestId('mvd-kreator-oze-aparatura-vt').selectOption('vt-1');
      await page.getByTestId('mvd-kreator-oze-aparatura-zabezpieczenie').selectOption('rel-1');
      await shot(3);

      // Krok 4 — zgodność przyłączeniowa (K9-A): profile NC RfG/LVRT/HVRT/PF.
      // NASTAWA P(f) NIE JEST PROFILEM OPERATORA (karta K-Q, oczyszczenie danych
      // bez proweniencji): pozycja `pf_pse_b` została z katalogu USUNIĘTA, bo
      // rozporządzenie (UE) 2016/631 art. 13 ust. 2 podaje statyzm jako
      // nastawialny w przedziale 2–12%, a nie jako wartość „dla PSE". Katalog
      // niesie dziś warianty statyzmu (`pf_droop_*`) wspólne dla operatorów —
      // kadr idzie po statyzmie 5%, czyli po tej samej wartości, którą krok 5
      // wpisuje w polu „statyzm".
      await page.getByTestId('mvd-kreator-oze-dalej').click();
      await expect(page.getByTestId('mvd-kreator-oze-zgodnosc')).toBeVisible();
      await page.getByTestId('mvd-kreator-oze-zgodnosc-profil').selectOption('ncrfg_pse');
      await page.getByTestId('mvd-kreator-oze-zgodnosc-lvrt').selectOption('lvrt_pse_b');
      await page.getByTestId('mvd-kreator-oze-zgodnosc-hvrt').selectOption('hvrt_pse_b');
      await page.getByTestId('mvd-kreator-oze-zgodnosc-pf').selectOption('pf_droop_5');
      await shot(4);

      // Krok 5 — regulacja mocy biernej i czynnej (wartości rządzące + P(f)/LFSM
      // + tryb pracy źródła z K9-A).
      await page.getByTestId('mvd-kreator-oze-dalej').click();
      await expect(page.getByTestId('mvd-kreator-oze-tryb')).toBeVisible();
      await page.getByTestId('mvd-kreator-oze-tryb-pracy').selectOption('praca_sieciowa');
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
      await shot(5);

      // Krok 6 — podsumowanie i zapis.
      await page.getByTestId('mvd-kreator-oze-dalej').click();
      await expect(page.getByTestId('mvd-kreator-oze-zapis')).toBeVisible();
      await shot(6);

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
      await page.getByTestId('mvd-kreator-transformator-control').selectOption('AUTOMATIC');
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
  // JEDEN MOTYW, POMIAR ZAMIAST DOMYSŁU (kanon zaktualizowany, karta BUGI-PRODUKTU-E2E,
  // konflikt V12D-036/V12K-243 vs KD-8 zapisany w docs/v12xx/REJESTR_KONFLIKTOW.md):
  // do KD-8 (poz. 1, 2026-07-31) powierzchnie `ui/**` stały na palecie `scada` jako
  // STAŁYCH wartościach hex niezależnych od motywu (V12K-243, 2026-07-27) — ten test
  // wtedy sprawdzał niezmienniczość tła. KD-8 poz. 1 zamieniło CAŁĄ paletę `scada`
  // (tailwind.config.js) na zmienne CSS `--scada-*` sterowane `[data-theme]`
  // (src/index.css) właśnie po to, żeby powierzchnie `ui/**` — łącznie z kanwą SLD,
  // paskiem metryk i kartą konfiguratora stacji (kd8-motyw-jedna-prawda.spec.ts) —
  // PRZESTAŁY być ciemne niezależnie od motywu (ocena właściciela 2/10 ekranu jasnego).
  // Panel wiązań OZE korzysta z TEJ SAMEJ klasy `bg-scada-panel` co 47 innych plików
  // `ui/**` (m.in. `StationConfiguratorSurface.tsx`, naprawiony wprost przez KD-8) —
  // stałość tła byłaby więc dziś JEDYNĄ niespójnością z resztą powłoki, nie dowodem
  // poprawności. Test mierzy więc SPÓJNOŚĆ z tokenem motywu (intencja zachowana:
  // złapać REGRESJĘ tła, tylko względem aktualnego źródła prawdy, nie względem
  // zamrożonego literału sprzed KD-8).
  test('wiazania OZE — wybór z katalogu + spójność z motywem powłoki', async ({ page }) => {
    const errs: string[] = [];
    const isNoise = (t: string): boolean =>
      /favicon|Download the React DevTools|Failed to load resource/i.test(t);
    page.on('console', (m) => {
      if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
    });
    page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));

    const tloPanelu = async (theme: string): Promise<{ panel: string; token: string }> => {
      await page.goto(`${HARNESS_URL}?creator=wiazania&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      });
      const root = page.locator('[data-testid="creator-harness-root"]').first();
      await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });
      await page.getByTestId('der-card-tab-readiness').click();
      await expect(page.getByTestId('der-wiazania-editor')).toBeVisible();
      const panel = await page
        .getByTestId('pv-source-surface')
        .locator('.bg-scada-panel')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      // Token ŹRÓDŁOWY (nie literał zamrożony w teście) — `--scada-panel` z `:root`
      // (src/index.css), DOKŁADNIE to, co Tailwind wstrzykuje do `bg-scada-panel`.
      const token = await page.evaluate(() => {
        const raw = getComputedStyle(document.documentElement).getPropertyValue('--scada-panel').trim();
        const [r, g, b] = raw.split(/\s+/).map(Number);
        return `rgb(${r}, ${g}, ${b})`;
      });
      return { panel, token };
    };

    await page.setViewportSize({ width: 1220, height: 900 });
    const jasny = await tloPanelu('light');
    const ciemny = await tloPanelu('dark');
    expect(
      jasny.panel,
      'panel wiazan OZE musi isc za tokenem --scada-panel w motywie jasnym (KD-8 poz. 1)',
    ).toBe(jasny.token);
    expect(
      ciemny.panel,
      'panel wiazan OZE musi isc za tokenem --scada-panel w motywie ciemnym (KD-8 poz. 1)',
    ).toBe(ciemny.token);
    // Straznik sensownosci: gdyby token przestal roznic sie miedzy motywami, powyzsze
    // dwie asercje przeszlyby fikcyjnie (panel zgodny sam ze soba, ale caly system
    // wrocilby do stalej ciemnej palety sprzed KD-8) — test musialby to zlapac gdzie
    // indziej. Ta asercja mierzy wprost, ze motyw FAKTYCZNIE zmienia token.
    expect(
      jasny.token,
      'token --scada-panel musi faktycznie roznic sie miedzy motywami (inaczej test nic nie mierzy)',
    ).not.toBe(ciemny.token);

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
    // więc oś zabezpieczeń NIE może pokazywać kompletu danych — a POWÓD musi być nazwany.
    // (Ta asercja szukała wcześniej frazy „zakres do przeliczenia" z wierszy gotowości,
    // które macierz analiz zastąpiła w E21-2; sprawdzała więc tekst, którego już nie ma.)
    await expect(page.getByTestId('macierz-status-protection')).toContainText('dane niepełne');
    await expect(page.getByTestId('macierz-braki-protection')).toContainText(
      'Brak przekładników',
    );

    // DOBOR ZAMIAST NAZWY KATALOGOWEJ (E21-4, V12K-255). Ekran musi pokazac RACHUNEK:
    // wartosc wymagana przez tor obok wartosci dostepnej w typie — i uczciwie nazwac
    // brak danej. Sam wpis „CT 200/5 A kl. 5P10" nie jest dowodem doboru.
    await expect(page.getByTestId('kryterium-rachunek-ct.przekladnia')).toContainText(
      'wymagane: 308.0 A',
    );
    await expect(page.getByTestId('kryterium-rachunek-ct.przekladnia')).toContainText(
      'dostępne: 200.0 A',
    );
    await expect(page.getByTestId('kryterium-werdykt-ct.wytrzymalosc_cieplna')).toHaveText(
      'brak danej',
    );
    // Zdanie podsumowujace NIE MOZE oglosic potwierdzenia przy niekompletnych danych.
    await expect(page.getByTestId('dobor-przekladnik-pradowy-podsumowanie')).toContainText(
      'niepotwierdzony',
    );

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

        // Odbiór ma panel teorii juz na kroku „dane" (1) — bez przejscia dalej.
        // ZDJETE 2026-08-08 (karta TYPY-POZA-BRAMKA): stal tu warunek
        // `if (c === 'zrodlo') …` na petli zawezonej do `['odbior'] as const`,
        // czyli galaz NIGDY nieosiagalna. TypeScript melduje to jako TS2367
        // („porownanie bez czesci wspolnej") — blad zyl poza bramka, bo `e2e/`
        // nie bylo w `include`.

        await page.getByTestId(`mvd-kreator-${c}-teoria`).locator('summary').click();
        await page.waitForTimeout(300);

        // Ekran do oceny nie moze pokazywac niepowodzenia (V12K-260): scena odbioru
        // pokazywala baner „Nie udalo sie wyznaczyc podgladu pradu" i pod nim polecenie
        // podania mocy i cosfi, ktore byly podane. Zrzut wygladalby porzadnie mimo bledu.
        const tresc = ((await root.textContent()) ?? '').replace(/\s+/g, ' ');
        expect(
          /Nie udało się/i.test(tresc),
          `scena ${c}/${theme} pokazuje komunikat o niepowodzeniu`,
        ).toBe(false);

        await root.screenshot({ path: path.join(OUTPUT_DIR, `kreator_${c}_teoria_${theme}.png`) });

        if (errs.length > 0) console.log(`[${c}/${theme}] errors:\n${errs.join('\n')}`);
        expect(errs, `no console/page errors for ${c}/${theme}`).toEqual([]);
      });
    }
  }
});
