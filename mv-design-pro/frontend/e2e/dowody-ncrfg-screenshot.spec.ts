/**
 * Runda dowodowa — ekrany NC RfG na kontrakcie V2 (karta AB-1a Pakiet D2): macierz wymogów
 * z biegiem „co-jeśli" i kartą oceny komórki, certyfikat zgodności (widok i „czego brakuje"),
 * wniosek do OSD (widok i „czego brakuje"), pulpit instalacji OZE z oceną zatwierdzonego
 * modelu oraz formularz źródła PV z typem modułu z klasyfikacji backendu (`/modul`).
 *
 * Sceny harnessu (`?creator=X&theme=light|dark`): realne komponenty, modele scen zbudowane
 * operacjami domenowymi backendu, odpowiedzi certyfikatu/wniosku/zgodności przypadku policzone
 * BACKENDEM (`scripts/eksport_fixtur_harnessu.py`) razem z ciałami żądań, które ekrany MAJĄ
 * wysłać (inne żądanie → odmowa 409 atrapy, łapana bramką błędów). Bieg „co-jeśli" i katalog
 * idą do realnego backendu. Asercje czytają te same fixtury, które harness serwuje — zero liczb
 * i numerów dokumentów wpisanych w specu. Interakcje wyłącznie natywne (klik, wpis, wybór).
 *
 * Wyjście: `DOWODY_NCRFG_ZRZUTY_DIR` (bieg lokalny poza repo) albo
 * docs/audit/visual/dowody/ (oba motywy).
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';
import { zbierajNieudaneZadaniaApi } from './nieudaneZadaniaApi';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const OUTPUT_DIR =
  process.env.DOWODY_NCRFG_ZRZUTY_DIR ?? path.resolve(_dirname, '../../docs/audit/visual/dowody');
const THEMES = ['light', 'dark'] as const;

/** Odczyt fixtury generowanej (`readFileSync` — moduł specu jest ESM Node'a). */
function fixtura<T>(nazwa: string): T {
  return JSON.parse(
    fs.readFileSync(
      path.resolve(_dirname, `../src/harness-fixtures/generated/${nazwa}.json`),
      'utf-8',
    ),
  ) as T;
}

type ModelSceny = { generators: { ref_id: string; gen_type: string }[] };
type ModulZgodnosci = {
  der_ref: string;
  dowod_certyfikatu: { numer_dokumentu: string } | null;
  klasyfikacja: { modul: string | null };
};
type Zgodnosc = { operator_id: string; bieg: { modules: ModulZgodnosci[] } };
/** Brak wymagania modułu z odpowiedzi 422 (`BrakWymaganiaModulu`). */
type BrakW = { der_ref: string; der_name: string | null; rekord: { wymaganie_id: string } };

const MODEL_MACIERZ = fixtura<ModelSceny>('macierz_scena_migawka');
const MODUL_BESS = MODEL_MACIERZ.generators.find((g) => g.gen_type === 'bess')!.ref_id;
const MODUL_PV = MODEL_MACIERZ.generators.find((g) => g.gen_type === 'pv_inverter')!.ref_id;
const ZGODNOSC_MACIERZ = fixtura<Zgodnosc>('ncrfg_zgodnosc_przekrojowa_scena_macierz');
/** Odpowiedź `GET …/wejscia` sceny macierzy — wejścia mostu modelu z pochodzeniem pól. */
const WEJSCIA_MACIERZ = fixtura<{
  modules: ({ der_ref: string } & Record<string, unknown>)[];
  pola_z_modelu: Record<string, string[]>;
}>('ncrfg_wejscia_scena_macierz');
const DOWOD_PV = ZGODNOSC_MACIERZ.bieg.modules.find((m) => m.der_ref === MODUL_PV)!.dowod_certyfikatu!;
const CERT_BRAKI = fixtura<{ komunikat: string; braki: BrakW[] }>('certyfikat_scena_macierz_braki');
const MODEL_MAGAZYN = fixtura<ModelSceny>('magazyn_scena_migawka');
const MODUL_MAGAZYN = MODEL_MAGAZYN.generators[0].ref_id;
const CERT_WIDOK = fixtura<{
  tytul: string;
  moduly: { der_ref: string; wiersze: { etykieta_pl: string; tresc_pl: string }[] }[];
}>('certyfikat_scena_magazyn');
const WNIOSEK_ZADANIE = fixtura<{ bus_ref: string; pf_run_id: string; sc_run_id: string }>(
  'wniosek_scena_magazyn_zadanie',
);
const WNIOSEK_WIDOK = fixtura<{
  tytul: string;
  zwarcia_punkt_przylaczenia: { nazwa_wezla: string };
  zgodnosc_nc_rfg: { moduly: { der_ref: string }[] };
}>('wniosek_scena_magazyn');
const WNIOSEK_BRAKI_ZADANIE = fixtura<{ bus_ref: string }>('wniosek_scena_macierz_zadanie');
const WNIOSEK_BRAKI = fixtura<{ komunikat: string; braki_ncrfg: BrakW[] }>(
  'wniosek_scena_macierz_braki',
);

/** Zbiera błędy konsoli/strony i nieudane żądania API (twarda bramka: zero na scenie). */
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

async function otworzScene(page: Page, scena: string, theme: string): Promise<void> {
  await page.setViewportSize({ width: 1220, height: 1000 });
  await page.goto(`${HARNESS_URL}?creator=${scena}&theme=${theme}`, {
    waitUntil: 'domcontentloaded',
    timeout: 40000,
  });
  const root = page.locator('[data-testid="creator-harness-root"]').first();
  await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });
}

async function zrzut(page: Page, errs: string[], nazwa: string): Promise<void> {
  await page.waitForTimeout(300);
  expect(errs, `zero błędów konsoli i API (${nazwa})`).toEqual([]);
  const tresc = (await page.locator('[data-testid="creator-harness-root"]').textContent()) ?? '';
  expect(/Nie udało się/i.test(tresc), `${nazwa}: komunikat o niepowodzeniu na ekranie`).toBe(false);
  const out = path.join(OUTPUT_DIR, `${nazwa}.png`);
  await page.locator('[data-testid="creator-harness-root"]').screenshot({ path: out });
  expect(fs.existsSync(out)).toBe(true);
}

test.describe('dowody-ncrfg:screenshot', () => {
  // Budżet testu: zimna kompilacja sceny harnessu (pomiar w `playwright.config.ts`: do ~32 s
  // przy load average ~10) + bieg „co-jeśli" na realnym backendzie w scenie macierzy.
  test.describe.configure({ timeout: 180000 });

  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of THEMES) {
    test(`macierz — bieg „co-jeśli", karta oceny komórki T16 i ślad — ${theme}`, async ({ page }) => {
      const errs = zbierajBledy(page);
      await otworzScene(page, 'macierz', theme);

      // Zgodność przypadku (zatwierdzony model) — rekordy per moduł; dowód certyfikatu PV
      // wyprowadził serwer z tabliczki modelu (wykaz PTPiREE).
      await expect(page.getByTestId(`mvd-oze-zgodnosc-przekrojowa-modul-${MODUL_BESS}`)).toBeVisible();
      await expect(page.getByTestId(`mvd-oze-zgodnosc-przekrojowa-modul-${MODUL_PV}`)).toBeVisible();
      await expect(page.getByTestId('mvd-oze-zgodnosc-przekrojowa-blad')).toHaveCount(0);
      await expect(
        page.getByTestId(`mvd-oze-zgodnosc-przekrojowa-naglowek-${MODUL_PV}-dowod-numer`),
      ).toContainText(DOWOD_PV.numer_dokumentu);

      // Formularz wstępny modułu PV = wejście mostu modelu (`GET …/wejscia`): pola liczone przez
      // most z danych generatora (statyzm, martwa strefa, zakres Q, rampa) i zdolności Q(U)/FRT
      // mają wartość modelu i znacznik „z modelu"; pole bez danej w modelu (cos φ) jest puste.
      await page.getByTestId(`mvd-oze-modul-${MODUL_PV}`).click();
      const wejsciePv = WEJSCIA_MACIERZ.modules.find((m) => m.der_ref === MODUL_PV)!;
      const zModeluPv = new Set(WEJSCIA_MACIERZ.pola_z_modelu[MODUL_PV]);
      for (const pole of [
        'droop_percent',
        'dead_band_hz',
        'ramp_rate_pct_per_min',
        'q_range_pct_pn_min',
        'q_range_pct_pn_max',
      ]) {
        expect(zModeluPv.has(pole), `${pole} niesiony przez model sceny`).toBe(true);
        const pozycja = page.getByTestId(`mvd-oze-param-${pole}`);
        await expect(pozycja).toHaveValue(String(wejsciePv[pole]));
        await expect(
          page.locator('label.mvd-oze-field', { has: pozycja }).locator('.mvd-oze-pochodzenie'),
        ).toHaveText('z modelu');
      }
      for (const pole of ['has_qu_curve', 'has_lvrt_curve', 'has_hvrt_curve', 'has_pf_droop']) {
        expect([wejsciePv[pole], zModeluPv.has(pole)], pole).toEqual([true, true]);
        const pozycja = page.getByTestId(`mvd-oze-zdolnosc-${pole}`);
        await expect(pozycja).toBeChecked();
        await expect(
          page.locator('label.mvd-oze-toggle', { has: pozycja }).locator('.mvd-oze-pochodzenie'),
        ).toHaveText('z modelu');
      }
      expect(zModeluPv.has('cos_phi_min')).toBe(false);
      await expect(page.getByTestId('mvd-oze-param-cos_phi_min')).toHaveValue('');

      // Dana DEKLAROWANA w panelu modułu (bieg „co-jeśli"): czas odbudowy P modułu PV 1,8 s.
      const odbudowaP = page.getByTestId('mvd-oze-param-p_recovery_time_s');
      await odbudowaP.fill('1.8');
      await expect(odbudowaP).toHaveValue('1.8');

      const przeprowadz = page.getByTestId('mvd-oze-przeprowadz');
      await expect(przeprowadz).toBeEnabled();
      await przeprowadz.click();
      await expect(page.getByTestId('mvd-oze-komorka-wynik').first()).toBeVisible({ timeout: 20000 });
      for (const ref of [MODUL_BESS, MODUL_PV]) {
        await expect(page.getByTestId(`mvd-oze-modul-klasa-${ref}`)).toContainText('B');
      }

      // T16 × PV: deklaracja nie wykazuje zachowania dynamicznego → „Ocena niewykonana"
      // (etykieta z rekordu backendu), wartość zadeklarowana pokazana informacyjnie.
      const wierszT16 = page
        .getByTestId('mvd-oze-wiersz')
        .filter({ hasText: 'T16 · Odbudowa mocy czynnej po zakłóceniu' });
      const komorka = wierszT16.getByTestId('mvd-oze-komorka-wynik').nth(1);
      await expect(komorka).toContainText('Ocena niewykonana');
      await komorka.click();
      const szczegol = page.getByTestId('mvd-oze-szczegol-wynik');
      await expect(szczegol).toContainText('Odbudowa mocy czynnej po zakłóceniu');
      await expect(szczegol).toContainText('1,8 s wobec wymaganych ≤ 1 s');

      // OTWARTY ślad testu (Wzór → Dane → Podstawienie → Wynik → jednostki).
      await page.getByTestId('mvd-oze-slad-otworz').click();
      const kroki = page.getByTestId('mvd-oze-slad-kroki');
      await expect(kroki).toContainText('t_odb ≤ t_odb,wym');
      await expect(kroki).toContainText('s − s = s.');

      await zrzut(page, errs, `dowody_macierz_${theme}`);
    });

    test(`macierz — certyfikat: ekran „czego brakuje" (422) z kartą rekordu — ${theme}`, async ({ page }) => {
      const errs = zbierajBledy(page);
      await otworzScene(page, 'macierz', theme);
      const przycisk = page.getByTestId('mvd-oze-certyfikat-przycisk');
      await expect(przycisk).toBeEnabled({ timeout: 15000 });
      await przycisk.click();

      const braki = page.getByTestId('mvd-oze-cert-braki');
      await expect(braki).toBeVisible({ timeout: 15000 });
      await expect(braki).toContainText(CERT_BRAKI.komunikat);
      await expect(page.getByTestId('mvd-oze-cert-widok')).toHaveCount(0);
      const rekordy = page.getByTestId('mvd-oze-cert-braki-lista-rekordy').locator('li.mvd-ncrfg-wymaganie');
      await expect(rekordy).toHaveCount(CERT_BRAKI.braki.length);
      const { der_ref: derRef, der_name: derName, rekord } = CERT_BRAKI.braki[0];
      const modul = page.getByTestId(`mvd-oze-cert-braki-lista-modul-${derRef}`);
      await expect(modul).toContainText(derName ?? derRef);
      const pierwszy = rekord.wymaganie_id;
      await page.getByTestId(`mvd-oze-cert-braki-lista-rekordy-${derRef}-${pierwszy}-przelacz`).click();
      await expect(page.getByTestId(`mvd-werdykt-${pierwszy}`)).toBeVisible();

      await zrzut(page, errs, `dowody_ncrfg_certyfikat_braki_${theme}`);
    });

    test(`certyfikat — widok certyfikatu z zatwierdzonego modelu — ${theme}`, async ({ page }) => {
      const errs = zbierajBledy(page);
      await otworzScene(page, 'certyfikat', theme);
      await expect(
        page.getByTestId(`mvd-oze-zgodnosc-przekrojowa-modul-${MODUL_MAGAZYN}`),
      ).toBeVisible({ timeout: 15000 });
      const przycisk = page.getByTestId('mvd-oze-certyfikat-przycisk');
      await expect(przycisk).toBeEnabled({ timeout: 15000 });
      await przycisk.click();

      await expect(page.getByTestId('mvd-oze-cert-widok')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('mvd-oze-cert-braki')).toHaveCount(0);
      await expect(page.getByTestId('mvd-oze-cert-tytul-dokumentu')).toHaveText(CERT_WIDOK.tytul);
      const sekcja = CERT_WIDOK.moduly.find((m) => m.der_ref === MODUL_MAGAZYN)!;
      const wiersze = page.getByTestId(`mvd-oze-cert-modul-${MODUL_MAGAZYN}-wiersze`);
      for (const wiersz of sekcja.wiersze) await expect(wiersze).toContainText(wiersz.tresc_pl);
      await expect(page.getByTestId(`mvd-oze-cert-modul-${MODUL_MAGAZYN}-dowod`)).toHaveAttribute(
        'data-stan',
        'brak',
      );
      await expect(page.getByTestId('mvd-oze-cert-pobierz-docx')).toBeEnabled();

      await zrzut(page, errs, `dowody_ncrfg_certyfikat_${theme}`);
    });

    test(`wniosek — widok wniosku do OSD — ${theme}`, async ({ page }) => {
      const errs = zbierajBledy(page);
      await otworzScene(page, 'wniosek', theme);
      // Przebiegi PF i SC wybrane z rejestru sceny (te same UUID co w żądaniu fixtury).
      await expect(page.getByTestId('mvd-wniosek-pf')).toHaveValue(WNIOSEK_ZADANIE.pf_run_id);
      await expect(page.getByTestId('mvd-wniosek-sc')).toHaveValue(WNIOSEK_ZADANIE.sc_run_id);
      await page.getByTestId('mvd-wniosek-wezel').fill(WNIOSEK_ZADANIE.bus_ref);
      const generuj = page.getByTestId('mvd-wniosek-generuj');
      await expect(generuj).toBeEnabled({ timeout: 15000 });
      await generuj.click();

      await expect(page.getByTestId('mvd-wniosek-wynik')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('mvd-wniosek-braki')).toHaveCount(0);
      await expect(page.getByTestId('mvd-wniosek-wynik')).toContainText(WNIOSEK_WIDOK.tytul);
      await expect(page.getByTestId('mvd-wniosek-zwarcia')).toContainText(
        WNIOSEK_WIDOK.zwarcia_punkt_przylaczenia.nazwa_wezla,
      );
      for (const modul of WNIOSEK_WIDOK.zgodnosc_nc_rfg.moduly) {
        await expect(page.getByTestId(`mvd-wniosek-modul-${modul.der_ref}`)).toBeVisible();
      }

      await zrzut(page, errs, `dowody_ncrfg_wniosek_${theme}`);
    });

    test(`wniosek-braki — „czego brakuje do wniosku" — ${theme}`, async ({ page }) => {
      const errs = zbierajBledy(page);
      await otworzScene(page, 'wniosek-braki', theme);
      await page.getByTestId('mvd-wniosek-wezel').fill(WNIOSEK_BRAKI_ZADANIE.bus_ref);
      const generuj = page.getByTestId('mvd-wniosek-generuj');
      await expect(generuj).toBeEnabled({ timeout: 15000 });
      await generuj.click();

      const braki = page.getByTestId('mvd-wniosek-braki');
      await expect(braki).toBeVisible({ timeout: 15000 });
      await expect(braki).toContainText(WNIOSEK_BRAKI.komunikat);
      await expect(page.getByTestId('mvd-wniosek-wynik')).toHaveCount(0);
      await expect(
        page.getByTestId('mvd-wniosek-braki-lista-rekordy').locator('li.mvd-ncrfg-wymaganie'),
      ).toHaveCount(WNIOSEK_BRAKI.braki_ncrfg.length);

      await zrzut(page, errs, `dowody_ncrfg_wniosek_braki_${theme}`);
    });

    test(`formularz źródła PV — typ modułu NC RfG z klasyfikacji backendu — ${theme}`, async ({ page }) => {
      const errs = zbierajBledy(page);
      // Klasyfikacja idzie JEDNYM zapytaniem `/modul` z kluczami kontraktu (kW, kV) do backendu.
      const zadanieKlasyfikacji = page.waitForRequest(
        (żądanie) => new URL(żądanie.url()).pathname === '/api/ncrfg-tests/modul',
        { timeout: 30000 },
      );
      await otworzScene(page, 'wiazania', theme);
      const zadanie = await zadanieKlasyfikacji;
      expect([...new URL(zadanie.url()).searchParams.keys()].sort()).toEqual([
        'napiecie_kv',
        'p_max_kw',
      ]);
      const klasyfikacja = (await (await zadanie.response())!.json()) as {
        modul: string | null;
        powod_pl: string;
      };
      const wartosc = page
        .locator('dt', { hasText: /^Moduł NC RfG$/ })
        .locator('xpath=following-sibling::dd[1]');
      await expect(wartosc).toHaveText(
        klasyfikacja.modul !== null ? `moduł ${klasyfikacja.modul}` : klasyfikacja.powod_pl,
      );

      await zrzut(page, errs, `dowody_ncrfg_formularz_zrodla_${theme}`);
    });

    test(`kreator źródła OZE — dane modułu NC RfG w modelu (art. 4, data, nastawy, deklaracje) — ${theme}`, async ({ page }) => {
      // Karta AB-1a Pakiet D2 §0 pkt 8: KAŻDE pole danych modułu w formularzu źródła; brak
      // deklaracji = „nie zadeklarowano" (≠ „nie"); deklaracja bez źródła = nazwany błąd pola.
      const errs = zbierajBledy(page);
      await otworzScene(page, 'oze', theme);
      await page.getByTestId('mvd-kreator-oze-dalej').click();
      await expect(page.getByTestId('mvd-kreator-oze-konwerter')).toBeVisible();
      await page.getByTestId('mvd-kreator-oze-konwerter').selectOption('conv-pv-1mw-15kv');
      await page.getByTestId('mvd-kreator-krok-zgodnosc').click();
      const t = 'mvd-kreator-oze-zgodnosc-dane-modulu';
      const sekcja = page.getByTestId(t);
      await expect(sekcja).toBeVisible();
      await expect(page.getByTestId(`${t}-flaga-has_scada_communication`)).toHaveValue('nieustalone');
      await page.getByTestId(`${t}-modul_istniejacy`).selectOption('nie');
      await page.getByTestId(`${t}-data_umowy_przylaczeniowej`).fill('2025-05-12');
      await page.getByTestId(`${t}-flaga-has_scada_communication`).selectOption('tak');
      await expect(page.getByTestId(`${t}-zrodlo_deklaracji-blad`)).toBeVisible();
      await page.getByTestId(`${t}-flaga-has_disturbance_recorder`).selectOption('nie');
      await page.getByTestId(`${t}-liczba-ramp_rate_pct_per_min`).fill('10');
      await page.getByTestId(`${t}-zrodlo_deklaracji`).fill('karta katalogowa falownika');
      await expect(page.getByTestId(`${t}-zrodlo_deklaracji-blad`)).toHaveCount(0);
      await page.getByTestId(`${t}-nastawa-f_min_hz`).fill('47,5');
      await page.getByTestId(`${t}-nastawa-zrodlo_pl`).fill('karta nastaw zabezpieczeń');
      await sekcja.scrollIntoViewIfNeeded();

      await zrzut(page, errs, `dowody_ncrfg_dane_modulu_${theme}`);
    });

    test(`pulpit-oze — ocena zgodności zatwierdzonego modelu — ${theme}`, async ({ page }) => {
      const errs = zbierajBledy(page);
      await otworzScene(page, 'pulpit-oze', theme);
      const dowod = page.getByTestId(`mvd-oze-pulpit-poz-dowod-${MODUL_PV}`);
      await expect(dowod).toHaveAttribute('data-stan', 'dowod', { timeout: 15000 });
      await expect(dowod).toContainText(DOWOD_PV.numer_dokumentu);
      await expect(page.getByTestId(`mvd-oze-pulpit-poz-dowod-${MODUL_BESS}`)).toHaveAttribute(
        'data-stan',
        'brak',
      );
      await expect(page.getByTestId(`mvd-oze-pulpit-poz-klasa-${MODUL_PV}`)).toContainText('Typ modułu B');
      await page.getByTestId(`mvd-oze-pulpit-poz-${MODUL_PV}`).click();
      await expect(
        page.getByTestId(`mvd-oze-pulpit-zgodnosc-naglowek-${MODUL_PV}-dowod-numer`),
      ).toContainText(DOWOD_PV.numer_dokumentu);

      await zrzut(page, errs, `dowody_ncrfg_pulpit_${theme}`);
    });
  }
});
