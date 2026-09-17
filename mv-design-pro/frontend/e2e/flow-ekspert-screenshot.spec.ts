/**
 * Zrzuty żywych ekranów programu FLOW EKSPERT+ (karta K5, dyrektywa #8).
 *
 * Sceny (creator-harness, realne komponenty + zaszczepione store'y):
 * - pulpit    — Pulpit projektu z kaflem „Warunki przyłączenia" (K2: warunki OSD
 *               z nagłówka modelu + werdykt „przekracza limit OSD"). HARNESS-RESZTA-2
 *               (2026-09-17): liczby kafla pochodzą z fixtury `pulpit_scena_migawka.json`
 *               (model sieci złotej z `set_connection_conditions` w nagłówku), a spec
 *               CYTUJE je zamiast powtarzać — limit OSD i suma mocy znamionowej
 *               generatorów liczone z fixtury, nie wpisane w asercji,
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

/**
 * Fixtura sceny „pulpit" — TEN SAM plik, który harness wstrzykuje do
 * `useSnapshotStore`. Odczyt przez `readFileSync`, nie `import … .json`: moduł
 * specu jest ESM Node'a, gdzie import JSON wymaga atrybutu `with { type: 'json' }`.
 */
const PULPIT_SCENA_MIGAWKA = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/pulpit_scena_migawka.json'),
    'utf-8',
  ),
) as {
  header: { connection_conditions: { moc_przylaczeniowa_mw: number } };
  generators: { p_mw: number }[];
};

/** Format kafla: liczba PL z dwoma miejscami (ten sam co `fmtLiczbaPL`). */
const liczbaPl = (wartosc: number): string =>
  wartosc.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PULPIT_LIMIT_OSD_MW = PULPIT_SCENA_MIGAWKA.header.connection_conditions.moc_przylaczeniowa_mw;
const PULPIT_GENERACJA_MW = PULPIT_SCENA_MIGAWKA.generators.reduce((suma, g) => suma + g.p_mw, 0);

/**
 * Scena „porownanie" (tryb rozpływu) — lista przebiegów i wynik porównania A/B
 * pochodzą z REALNYCH biegów backendu (karta HARNESS-RESZTA: `porownanie_scena_
 * biegi_pf.json` / `porownanie_scena_wynik_pf.json`). NAPRAWA HARNESS-RESZTA-2:
 * spec wciąż wybierał ręczne `run-a`/`run-b` i szukał szyn `SZ-ST7`/`SZ-ST3` z
 * atrapy sprzed konwersji — po niej żaden z tych bytów nie istniał, więc
 * `selectOption` kończył się timeoutem. Teraz identyfikatory i szyny są CYTOWANE
 * z fixtur: szyna z niezerową różnicą napięcia musi być widoczna, a szyna bez
 * różnic MUSI zniknąć po włączeniu filtru „tylko różnice".
 */
const POROWNANIE_BIEGI_PF = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/porownanie_scena_biegi_pf.json'),
    'utf-8',
  ),
) as { runs: { id: string }[] };
const POROWNANIE_WYNIK_PF = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/porownanie_scena_wynik_pf.json'),
    'utf-8',
  ),
) as {
  run_a_id: string;
  run_b_id: string;
  bus_diffs: { bus_id: string; delta_v_pu: number; delta_angle_deg: number }[];
};
const POROWNANIE_SZYNA_ZE_ZMIANA = POROWNANIE_WYNIK_PF.bus_diffs.find(
  (szyna) => szyna.delta_v_pu !== 0 || szyna.delta_angle_deg !== 0,
)!.bus_id;
const POROWNANIE_SZYNA_BEZ_ZMIAN = POROWNANIE_WYNIK_PF.bus_diffs.find(
  (szyna) => szyna.delta_v_pu === 0 && szyna.delta_angle_deg === 0,
)!.bus_id;

/**
 * Tryb „Zabezpieczenia" ekranu porównań — REALNE biegi `protection_sn` na dwóch
 * wariantach modelu (HARNESS-RESZTA-2). Scena harnessu serwuje listę biegów,
 * wynik porównania i ślad z tych fixtur, więc spec wybiera parę po ich
 * identyfikatorach i sprawdza, że ekran pokazuje wiersz oraz problem z rankingu
 * policzone przez backend.
 */
const POROWNANIE_BIEGI_ZAB = JSON.parse(
  fs.readFileSync(
    path.resolve(
      _dirname,
      '../src/harness-fixtures/generated/porownanie_scena_biegi_zabezpieczen.json',
    ),
    'utf-8',
  ),
) as { runs: { id: string }[] };
const POROWNANIE_WYNIK_ZAB = JSON.parse(
  fs.readFileSync(
    path.resolve(
      _dirname,
      '../src/harness-fixtures/generated/porownanie_scena_wynik_zabezpieczen.json',
    ),
    'utf-8',
  ),
) as {
  run_a_id: string;
  run_b_id: string;
  rows: { protected_element_ref: string; state_change: string }[];
  ranking: { issue_code: string; element_ref: string }[];
};

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
          // Werdykt „przekracza limit OSD" MUSI wynikać z danych modelu: suma mocy
          // znamionowej generatorów fixtury przekracza limit z nagłówka. Gdyby
          // fixtura przestała to spełniać, asercja sumy/limitu pęknie PRZED
          // asercją werdyktu i powie, co naprawdę się zmieniło.
          expect(PULPIT_GENERACJA_MW).toBeGreaterThan(PULPIT_LIMIT_OSD_MW);
          await expect(page.getByTestId('pulpit-osd-limit')).toContainText(
            liczbaPl(PULPIT_LIMIT_OSD_MW),
          );
          await expect(page.getByTestId('pulpit-przylaczenie-generacja')).toContainText(
            liczbaPl(PULPIT_GENERACJA_MW),
          );
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
          await page
            .getByTestId('mvd-por-select-a')
            .selectOption(POROWNANIE_WYNIK_PF.run_a_id);
          await page
            .getByTestId('mvd-por-select-b')
            .selectOption(POROWNANIE_WYNIK_PF.run_b_id);
          // Oba przebiegi pary MUSZĄ być na liście z backendu (inaczej wybór
          // powyżej „przechodzi" tylko dlatego, że ekran nic nie wie).
          const identyfikatoryBiegow = POROWNANIE_BIEGI_PF.runs.map((bieg) => bieg.id);
          expect(identyfikatoryBiegow).toContain(POROWNANIE_WYNIK_PF.run_a_id);
          expect(identyfikatoryBiegow).toContain(POROWNANIE_WYNIK_PF.run_b_id);
          await page.getByTestId('mvd-por-przycisk').click();
          await expect(page.getByTestId('mvd-por-wynik')).toBeVisible();
          await expect(page.getByTestId('mvd-por-wynik')).toContainText(
            POROWNANIE_SZYNA_ZE_ZMIANA,
          );

          // KD-1 (L-12 + L-14): kolumny mocy biernej z payloadu backendu oraz
          // filtr "tylko roznice". Zrzut do oceny wlasciciela pokazuje OBIE
          // zdolnosci naraz (filtr wlaczony ukrywa szyne BEZ roznic — w tej
          // sieci szyne bilansowa GPZ, u = 1,0 pu w obu wariantach).
          await expect(page.getByTestId('mvd-por-wynik')).toContainText('Moc bierna A');
          await expect(page.getByTestId('mvd-por-wynik')).toContainText(
            POROWNANIE_SZYNA_BEZ_ZMIAN,
          );
          await page.getByTestId('mvd-por-filtr-roznice').check();
          await expect(page.getByTestId('mvd-por-wynik')).not.toContainText(
            POROWNANIE_SZYNA_BEZ_ZMIAN,
          );
          await page.waitForTimeout(200);
          const qPath = path.join(OUTPUT_DIR, `porownanie-q-${theme}.png`);
          await root.screenshot({ path: qPath });
          expect(fs.existsSync(qPath)).toBe(true);
          await page.getByTestId('mvd-por-filtr-roznice').uncheck();

          // Tryb „Zabezpieczenia": para biegow `protection_sn` (warianty modelu
          // rozniace sie dlugoscia magistrali) -> wiersz stanu i problem z
          // rankingu policzone przez `ProtectionComparisonService`.
          const identyfikatoryZab = POROWNANIE_BIEGI_ZAB.runs.map((bieg) => bieg.id);
          expect(identyfikatoryZab).toContain(POROWNANIE_WYNIK_ZAB.run_a_id);
          expect(identyfikatoryZab).toContain(POROWNANIE_WYNIK_ZAB.run_b_id);
          await page.getByTestId('mvd-por-tryb-zabezpieczenia').click();
          await expect(page.getByTestId('mvd-porzab-ekran')).toBeVisible();
          await page
            .getByTestId('mvd-porzab-select-a')
            .selectOption(POROWNANIE_WYNIK_ZAB.run_a_id);
          await page
            .getByTestId('mvd-porzab-select-b')
            .selectOption(POROWNANIE_WYNIK_ZAB.run_b_id);
          await page.getByTestId('mvd-porzab-przycisk').click();
          const wynikZab = page.getByTestId('mvd-porzab-wynik');
          await expect(wynikZab).toBeVisible();
          await expect(wynikZab).toContainText(
            POROWNANIE_WYNIK_ZAB.rows[0].protected_element_ref,
          );
          await page.getByTestId('mvd-porzab-tab-ranking').click();
          await expect(wynikZab).toContainText(
            POROWNANIE_WYNIK_ZAB.ranking[0].element_ref,
          );
          const zrzutZab = path.join(OUTPUT_DIR, `porownanie-zabezpieczenia-${theme}.png`);
          await root.screenshot({ path: zrzutZab });
          expect(fs.existsSync(zrzutZab)).toBe(true);

          // Powrot do stanu bazowego sceny — zrzut zbiorczy bez zmian.
          await page.getByTestId('mvd-por-tryb-rozplyw').click();
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
