/**
 * Runda dowodowa — ekrany OZE (karta V-A, dyrektywa właściciela: „pokaż wszystkie
 * ekrany z pełnymi dowodami akademickimi i udowodnij").
 *
 * Sceny harnessu (`?creator=X&theme=light|dark`, realne komponenty + zaszczepione
 * store'y + podmieniony fetch o kształcie 1:1 z backendem):
 *  - lom     — „Praca wyspowa": checki per porównanie + OTWARTY wywód okna
 *              normatywnego 81R (KaTeX; NC RfG Art. 13 / PTPiREE),
 *  - frt     — „Walidacja modelu falownika": trajektorie z OTWARTYM wywodem
 *              marginesu (T-C) ORAZ sekwencja zapadów z OTWARTYM śladem kontekstu
 *              siły sieci SCR (T-B),
 *  - oltc    — „Badania regulacji OLTC": sweep pozycji zaczepów + OTWARTY ślad
 *              wywodu przekładni t(n) (kształt z power_flow_oltc_studies.py).
 * Scena „macierz" (NC RfG) i dokumenty NC RfG: `dowody-ncrfg-screenshot.spec.ts`
 * (karta AB-1a Pakiet D2 — kontrakt V2).
 * Wyjście: docs/audit/visual/dowody/dowody_*.png (oba motywy, ślad OTWARTY).
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';
import { zbierajNieudaneZadaniaApi } from './nieudaneZadaniaApi';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/dowody');
const THEMES = ['light', 'dark'] as const;

/**
 * HARNESS-RESZTA-2 (2026-09-17): moduł wytwórczy sceny „frt" pochodzi Z MODELU
 * (`oze_scena_migawka.json` — GPZ + farma PV 1 MW zbudowane operacjami
 * domenowymi), więc spec CYTUJE jego referencję zamiast wpisywać własną.
 * Odczyt `readFileSync`, nie `import … .json`: moduł specu jest ESM Node'a,
 * gdzie import JSON wymaga atrybutu `with { type: 'json' }`.
 */
const OZE_SCENA_MIGAWKA = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/oze_scena_migawka.json'),
    'utf-8',
  ),
) as { generators: { ref_id: string }[] };
const MODUL_DER_SCENY_FRT = OZE_SCENA_MIGAWKA.generators[0].ref_id;

/**
 * Sceny „lom", „frt" i „oltc" karmione są REALNYMI widokami backendu (karty
 * HARNESS-RESZTA / HARNESS-RESZTA-2). NAPRAWA: asercje wciąż cytowały liczby z
 * atrap sprzed konwersji („Pole BESS B", „liczba punktow trajektorii: 10",
 * „15.303 kV") — wartości, których realny backend nigdy nie zwrócił. Teraz spec
 * czyta je z tych samych fixtur, które harness serwuje, więc rozjazd kontraktu
 * albo modelu psuje test z nazwanym powodem, a nie fałszywą liczbą.
 */
const LOM_SCENA_WYNIK = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/lom_scena_wynik.json'),
    'utf-8',
  ),
) as {
  fields: {
    bay_ref: string;
    bay_name: string;
    status: string;
    checks: { function_ansi: string | null; severity: string; value: number | null }[];
  }[];
};
/** Pole z oceną 81R — jedyne, które ma nastawy funkcji LoM w modelu sceny. */
const LOM_POLE_Z_OCENA = LOM_SCENA_WYNIK.fields.find((pole) =>
  pole.checks.some((check) => check.function_ansi === '81R' && check.value !== null),
)!;
const LOM_NASTAWA_81R = LOM_POLE_Z_OCENA.checks.find(
  (check) => check.function_ansi === '81R',
)!;

const FRT_SCENA_TRAJEKTORIE = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/frt_scena_trajektorie.json'),
    'utf-8',
  ),
) as { scenariusze: { liczba_punktow_trajektorii: number; werdykt_pl: string }[] };
const FRT_SCENARIUSZ = FRT_SCENA_TRAJEKTORIE.scenariusze[0];
const FRT_SCENA_SEKWENCJA = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/frt_scena_sekwencja.json'),
    'utf-8',
  ),
) as {
  werdykt_sekwencji_pl: string;
  kontekst_sily_sieci: {
    bus_ref: string;
    scr: number;
    verdict: string;
    white_box: { substitution_pl: string; result_pl: string; symbol: string }[];
  };
};
const FRT_KONTEKST_SILY = FRT_SCENA_SEKWENCJA.kontekst_sily_sieci;
const FRT_KROK_SCR = FRT_KONTEKST_SILY.white_box.find((krok) => krok.symbol === 'SCR')!;
/** Bieg zwarciowy kontekstu siły sieci — ten sam, który zasiewa scena „frt". */
const SILA_SIECI_SCENA_WYNIK = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/sila_sieci_scena_wynik.json'),
    'utf-8',
  ),
) as { context: { run_id: string } };
/** Format ekranu FRT: liczba PL z trzema miejscami (`fmtPuFrt`). */
const liczbaFrtPl = (wartosc: number): string =>
  wartosc.toLocaleString('pl-PL', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const OLTC_SCENA_WYNIK = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/oltc_scena_wynik.json'),
    'utf-8',
  ),
) as {
  global_results: {
    oltc_sweep: { points: { position: number; tap_ratio: number; controlled_bus_kv: number }[] };
  };
};
/** Punkt przemiatania, na którym spec sprawdza przekładnię i napięcie szyny. */
const OLTC_PUNKT = OLTC_SCENA_WYNIK.global_results.oltc_sweep.points.find(
  (punkt) => punkt.position === -2,
)!;

/** Zbiera błędy konsoli/strony (twarda bramka: zero błędów na scenie). */
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

test.describe('dowody-oze:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of THEMES) {
    test(`lom — wywód checka 81R otwarty — ${theme}`, async ({ page }) => {
      const errs = zbierajBledy(page);
      await otworzScene(page, 'lom', theme);

      // Tabela pól z werdyktami backendu (statusy PL, zero oceny w UI).
      const tabela = page.getByTestId('mvd-wyn-tabela');
      await expect(tabela).toContainText(LOM_POLE_Z_OCENA.bay_name);
      await expect(tabela).toContainText('Ostrzeżenie');

      // Natywny klik wiersza pola → szczegół z porównaniami i normą.
      await page
        .getByTestId('mvd-wyn-wiersz')
        .filter({ hasText: LOM_POLE_Z_OCENA.bay_name })
        .click();
      const szczegol = page.getByTestId('mvd-lom-szczegol');
      await expect(szczegol).toContainText('Szybkość zmian częstotliwości (df/dt)');
      await expect(szczegol).toContainText('df/dt ≥ 2.0 Hz/s'); // okno normatywne
      await expect(szczegol).toContainText('Rozporządzenie Komisji (UE) 2016/631'); // norma

      // OTWARTY wywód checka 81R: KaTeX wyrenderowany + werdykt w krokach.
      await page.getByTestId('mvd-lom-check-slad-0-btn').click();
      const slad = page.getByTestId('mvd-lom-check-slad-0');
      await expect(slad.locator('[data-testid="math-rendered"]').first()).toBeVisible();
      await expect(slad).toContainText(
        `Dane: nastawa = ${LOM_NASTAWA_81R.value!.toFixed(4)}`,
      );
      await expect(slad).toContainText(`Werdykt: ${LOM_NASTAWA_81R.severity}`);

      await page.waitForTimeout(300);
      expect(errs, `zero błędów konsoli (lom/${theme})`).toEqual([]);
      const out = path.join(OUTPUT_DIR, `dowody_lom_${theme}.png`);
      await page.locator('[data-testid="creator-harness-root"]').screenshot({ path: out });
      expect(fs.existsSync(out)).toBe(true);
    });

    test(`frt — wywód marginesu (T-C) i ślad siły sieci (T-B) otwarte — ${theme}`, async ({
      page,
    }) => {
      const errs = zbierajBledy(page);
      await otworzScene(page, 'frt', theme);

      // Jawny bieg trajektorii: dobór modułu/operatora → „Uruchom test FRT".
      await page.getByTestId('mvd-frt-modul').selectOption(MODUL_DER_SCENY_FRT);
      await page.getByTestId('mvd-frt-operator').selectOption('pse');
      await page.getByTestId('mvd-frt-oblicz').click();

      const werdykt = page.getByTestId('mvd-frt-werdykt');
      await expect(werdykt).toContainText('Model odzwierciedla wymagania profilu operatora');
      await expect(page.getByTestId('mvd-frt-wynik')).toContainText('w obwiedni');

      // T-C: OTWARTY wywód marginesu scenariusza (m_U — KaTeX wyrenderowany).
      await page.getByTestId('mvd-frt-slad-0-btn').click();
      const sladWywodu = page.getByTestId('mvd-frt-slad-0');
      await expect(sladWywodu.locator('[data-testid="math-rendered"]').first()).toBeVisible();
      await expect(sladWywodu).toContainText(
        `liczba punktow trajektorii: ${FRT_SCENARIUSZ.liczba_punktow_trajektorii}`,
      );
      await expect(sladWywodu).toContainText(`Werdykt: ${FRT_SCENARIUSZ.werdykt_pl}`);

      await page.waitForTimeout(300);
      const outTraj = path.join(OUTPUT_DIR, `dowody_frt_trajektorie_${theme}.png`);
      await page.getByTestId('mvd-frt-wynik').screenshot({ path: outTraj });
      expect(fs.existsSync(outTraj)).toBe(true);

      // T-B: sekwencja zapadów z kontekstem siły sieci — dwa zapady jak w
      // odpowiedzi (0,05/0,15 s + 0,02/0,5 s), przebieg zwarciowy + węzeł.
      await page.getByTestId('mvd-frt-sekw-dodaj').click();
      await page.getByTestId('mvd-frt-sekw-glebokosc-1').fill('0.02');
      await page.getByTestId('mvd-frt-sekw-czas-1').fill('0.5');
      await page
        .getByTestId('mvd-frt-sekw-run')
        .selectOption(SILA_SIECI_SCENA_WYNIK.context.run_id);
      await page.getByTestId('mvd-frt-sekw-bus').fill(FRT_KONTEKST_SILY.bus_ref);
      await page.getByTestId('mvd-frt-sekw-oblicz').click();

      await expect(page.getByTestId('mvd-frt-sekw-werdykt')).toContainText(
        FRT_SCENA_SEKWENCJA.werdykt_sekwencji_pl,
      );
      const kontekst = page.getByTestId('mvd-frt-sekw-kontekst');
      // Werdykt siły sieci i SCR — WPROST z odpowiedzi backendu (na sieci sceny
      // analiz OZE moduł PV 0,215 MVA przy Sk″ 37,97 MVA daje sieć MOCNĄ; dawna
      // asercja cytowała „sieć słaba"/„2,250" z atrapy sprzed konwersji sceny).
      await expect(kontekst).toContainText(FRT_KONTEKST_SILY.verdict);
      await expect(kontekst).toContainText(liczbaFrtPl(FRT_KONTEKST_SILY.scr));

      // OTWARTY ślad pełnej jawności kontekstu siły sieci. INTENCJA (K10):
      // wzór SCR renderowany KaTeX-em (element złożony, nie surowe ASCII),
      // a podstawienie i wynik liczbowy pozostają tekstem — to one dowodzą,
      // że wartości płyną z backendu.
      await page.getByTestId('mvd-frt-sekw-slad-otworz').click();
      const sladKontekstu = page.getByTestId('mvd-frt-sekw-slad');
      await expect(sladKontekstu.locator('.katex').first()).toBeVisible();
      await expect(sladKontekstu).toContainText(FRT_KROK_SCR.substitution_pl);
      await expect(sladKontekstu).toContainText(FRT_KROK_SCR.result_pl);

      await page.waitForTimeout(300);
      expect(errs, `zero błędów konsoli (frt/${theme})`).toEqual([]);
      const outSekw = path.join(OUTPUT_DIR, `dowody_frt_sekwencja_${theme}.png`);
      await page.getByTestId('mvd-frt-sekwencja').screenshot({ path: outSekw });
      expect(fs.existsSync(outSekw)).toBe(true);
    });

    test(`oltc — sweep z otwartym wywodem przekładni — ${theme}`, async ({ page }) => {
      const errs = zbierajBledy(page);
      await otworzScene(page, 'oltc', theme);

      // Jawny bieg badania sweep (domyślny rodzaj) na aktywnym przypadku.
      await page.getByTestId('mvd-oltc-uruchom').click();
      const wynik = page.getByTestId('mvd-oltc-wynik-sweep');
      await expect(wynik).toBeVisible();
      // Przekładnia i napięcie szyny regulowanej dla pozycji zaczepu z fixtury
      // (format tabeli: 4 miejsca dla przekładni, 3 dla kV).
      await expect(wynik).toContainText(OLTC_PUNKT.tap_ratio.toFixed(4));
      await expect(wynik).toContainText(`${OLTC_PUNKT.controlled_bus_kv.toFixed(3)} kV`);

      // OTWARTY ślad wywodu sweep: t(n) = 1 + (n - n0)·du/100 (KaTeX) + dane.
      await page.getByTestId('mvd-oltc-sweep-slad-btn').click();
      const slad = page.getByTestId('mvd-oltc-sweep-slad');
      await expect(slad.locator('[data-testid="math-rendered"]').first()).toBeVisible();
      await expect(slad).toContainText('Dane: krok zaczepu du = 1.2500 %, pozycja neutralna n0 = 0.');
      await expect(slad).toContainText('Kryterium odczytu');

      await page.waitForTimeout(300);
      expect(errs, `zero błędów konsoli (oltc/${theme})`).toEqual([]);
      const out = path.join(OUTPUT_DIR, `dowody_oltc_sweep_${theme}.png`);
      await page.locator('[data-testid="creator-harness-root"]').screenshot({ path: out });
      expect(fs.existsSync(out)).toBe(true);
    });
  }
});
