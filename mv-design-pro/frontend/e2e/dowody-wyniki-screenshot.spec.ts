/**
 * Runda dowodowa V-B — zrzuty ŻYWYCH ekranów wyników z OTWARTYM wywodem
 * (dyrektywa właściciela: „pokaż wszystkie ekrany z pełnymi dowodami
 * akademickimi i udowodnij"). Sceny harnessu kreatorów (realne komponenty,
 * fetch podmieniony na kształty 1:1 z kontraktami backendu), interakcje
 * prowadzone NATYWNIE jak przez użytkownika (wybory, wpisy, kliknięcia):
 *  - kompensacja-wynik — wybór węzła → „Oblicz" → kandydaci + ślad doboru,
 *  - sila-sieci        — SCR/WSCR z otwartym wywodem white_box (węzeł + WSCR),
 *  - odbior-zgodnosc   — pomiary w edytorze → raport → wiersz → ślad slad_pl,
 *  - estymacja         — 6 pomiarów → estymacja WLS → ślad iteracji white_box,
 *  - ssci              — jawny bieg → werdykt Nyquista → ślad white_box,
 *  - migotanie         — wiersz węzła → ślad Pst/Plt/d (wzory KaTeX),
 *  - arcflash          — parametry → przelicz → wiersz szyny → ślad IEEE 1584.
 * Wyjście: docs/audit/visual/dowody/dowod_<scena>_<motyw>.png (oba motywy).
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/dowody');
const THEMES = ['light', 'dark'] as const;

/** Sceny rundy dowodowej (scena „odbior-zgodnosc" = ekran „Zgodność
 * powykonawcza"; nazwa `odbior` pozostaje zajęta przez kreator odbioru nN). */
const SCENY = [
  'kompensacja-wynik',
  'sila-sieci',
  'odbior-zgodnosc',
  'estymacja',
  'ssci',
  'migotanie',
  'arcflash',
] as const;

type Scena = (typeof SCENY)[number];

/** Wiersz pomiaru edytora zgodności powykonawczej (element / wielkość / wartość). */
const POMIARY_ODBIORU = [
  { element: 'BUS-1', wielkosc: 'U', wartosc: '15,3' },
  { element: 'LINE-2', wielkosc: 'P', wartosc: '4,5' },
  { element: 'NIEZNANY-3', wielkosc: 'U', wartosc: '10' },
  { element: 'TRAFO-4', wielkosc: 'Q', wartosc: '1,2' },
] as const;

/** Pomiary telemetryczne estymacji WLS (6 szt. → m=6 > n=5 stanów, dof=1). */
const POMIARY_ESTYMACJI = [
  { typ: 'V_MAGNITUDE', wezel: 'BUS-1', wartosc: '1,05', sigma: '0,004', wezelJ: null },
  { typ: 'V_MAGNITUDE', wezel: 'BUS-2', wartosc: '0,99', sigma: '0,004', wezelJ: null },
  { typ: 'P_INJECTION', wezel: 'BUS-2', wartosc: '-0,35', sigma: '0,008', wezelJ: null },
  { typ: 'Q_INJECTION', wezel: 'BUS-2', wartosc: '-0,12', sigma: '0,008', wezelJ: null },
  { typ: 'P_FLOW', wezel: 'BUS-1', wartosc: '0,36', sigma: '0,008', wezelJ: 'BUS-2' },
  { typ: 'Q_FLOW', wezel: 'BUS-1', wartosc: '0,13', sigma: '0,008', wezelJ: 'BUS-2' },
] as const;

/** Prowadzi scenę do stanu „wywód OTWARTY" — realne kliki, zero syntetyki. */
async function prowadzScene(page: Page, scena: Scena): Promise<void> {
  if (scena === 'kompensacja-wynik') {
    // Wybór węzła → jawny bieg „Oblicz" → kandydaci + werdykt → otwarty ślad.
    // `bus_sn_b`: WYŁĄCZNIE ten węzeł sieci złotej daje realny dobór kandydata
    // katalogowego (fixtura `kompensacja_scena_wynik.json`, `bus_ref=bus_sn_b`)
    // — `bus_sn_main`/`bus_sn_c` dają uczciwe „żaden kandydat nie spełnia"
    // (regresja znaleziona i naprawiona HARNESS-RESZTA-kontynuacja: stary
    // literał `'SZ-ST7'` z ręcznie pisanego mocka nie istniał już w zasiewie
    // po konwersji sceny na realny bieg backendu).
    await page.getByTestId('mvd-komp-wezel').selectOption('bus_sn_b');
    await page.getByTestId('mvd-komp-oblicz').click();
    await expect(page.getByTestId('mvd-komp-wynik')).toBeVisible();
    const tabela = page.getByTestId('mvd-wyn-tabela');
    // Nazwa z realnego katalogu MV (`KOMP_SN_0V6_15KV`,
    // `network_model/catalog/mv_shunt_capacitor_catalog.py`) — nie ręcznie
    // wymyślona etykieta.
    await expect(tabela).toContainText('Bateria kondensatorow SN 0,6 Mvar 15 kV');
    await expect(page.getByTestId('mvd-komp-dobor-nazwa')).toContainText('0,6 Mvar');
    await page.getByTestId('mvd-komp-slad-otworz').click();
    const slad = page.getByTestId('mvd-komp-slad');
    await expect(slad).toContainText('PODSTAWA DOBORU');
    // K10: wzory śladu renderowane KaTeX-em (dawna asercja na ASCII
    // „Q_netto = Q_load − Q_cap_eff" — intencja bez zmian: ślad pokazuje
    // wzór na Q_netto, teraz jako LaTeX). Dowód renderu: elementy .katex.
    expect(await slad.locator('.katex').count()).toBeGreaterThanOrEqual(3);
    // Zero kodów produkcji i anglicyzmów w treści dla inżyniera (bramka K10).
    const tekstSladu = (await slad.textContent()) ?? '';
    for (const zakazany of ['V12K', 'WHITE BOX', 'PowerFlowResult', 'FROZEN', 'branch_results', 'snapshot', 'hash']) {
      expect(tekstSladu, `ślad doboru zawiera zakazany token: ${zakazany}`).not.toContain(zakazany);
    }
  } else if (scena === 'sila-sieci') {
    // Wynik SCR/WSCR z zasianego przebiegu zwarciowego → otwarte OBA wywody:
    // systemowy (WSCR) i węzłowy (bus_nn, jedyny węzeł z modułem OZE
    // katalogowym w sieci złotej — HARNESS-RESZTA-kontynuacja: dawny słaby
    // węzeł 'SZ-FW1' z ręcznie pisanego mocka nie odpowiadał żadnemu
    // realnemu węzłowi po konwersji sceny na realny bieg backendu; SCR
    // realnej farmy PV [0,215 MVA] w tym węźle daje werdykt „mocna", nie
    // „słaba" — intencja bez zmian: DWA otwarte wywody, teraz na realnych
    // liczbach).
    const sekcja = page.getByTestId('mvd-oze-pulpit-sila');
    await expect(page.getByTestId('mvd-oze-sila-wynik')).toBeVisible();
    await expect(page.getByTestId('mvd-oze-sila-wscr')).toContainText('67,97');
    await page.getByTestId('mvd-oze-sila-wscr-slad-otworz').click();
    await expect(sekcja).toContainText('licznik Σ(S_sc·S_n) = 3.1419 MVA²');
    await page.getByTestId('mvd-oze-sila-slad-otworz-bus_nn').click();
    await expect(sekcja).toContainText('SCR = 14.6134 MVA / 0.215 MVA');
    await expect(page.getByTestId('mvd-oze-sila-werdykt-bus_nn')).toContainText('mocna');
  } else if (scena === 'odbior-zgodnosc') {
    // Pomiary z obiektu w edytorze wierszy + jawne tolerancje → raport →
    // wybór wiersza → otwarty ślad slad_pl (kroki tekstowe).
    for (let i = 0; i < POMIARY_ODBIORU.length; i += 1) {
      const p = POMIARY_ODBIORU[i];
      if (i > 0) await page.getByTestId('mvd-odbior-dodaj').click();
      await page.getByTestId(`mvd-odbior-element-${i}`).fill(p.element);
      await page.getByTestId(`mvd-odbior-wielkosc-${i}`).selectOption(p.wielkosc);
      await page.getByTestId(`mvd-odbior-wartosc-${i}`).fill(p.wartosc);
    }
    await page.getByTestId('mvd-odbior-tol-napiecie').fill('5');
    await page.getByTestId('mvd-odbior-tol-moc').fill('10');
    await page.getByTestId('mvd-odbior-oblicz').click();
    await expect(page.getByTestId('mvd-odbior-wynik')).toBeVisible();
    await expect(page.getByTestId('mvd-odbior-podsumowanie')).toBeVisible();
    await expect(page.getByTestId('mvd-wyn-tabela')).toContainText('poza tolerancją');
    await page.getByTestId('mvd-wyn-tabela').getByText('BUS-1').click();
    await expect(page.getByTestId('mvd-odbior-szczegol')).toBeVisible();
    await page.getByTestId('mvd-odbior-slad-otworz').click();
    await expect(page.getByTestId('mvd-odbior-slad')).toContainText(
      'Model U = u_pu × U_n = 1.010000 × 15.000000 = 15.150000 kV',
    );
    await expect(page.getByTestId('mvd-odbior-slad')).toContainText('Werdykt: w tolerancji');
  } else if (scena === 'estymacja') {
    // Wymagane wejścia (mapa węzeł→indeks) → 6 pomiarów w edytorze →
    // „Estymuj" → detekcja złych danych → otwarty ślad iteracji WLS.
    await expect(page.getByTestId('mvd-est-wymagania')).toBeVisible();
    for (let i = 0; i < POMIARY_ESTYMACJI.length; i += 1) {
      const p = POMIARY_ESTYMACJI[i];
      if (i > 0) await page.getByTestId('mvd-est-dodaj').click();
      await page.getByTestId(`mvd-est-typ-${i}`).selectOption(p.typ);
      await page.getByTestId(`mvd-est-wezel-${i}`).selectOption(p.wezel);
      await page.getByTestId(`mvd-est-wartosc-${i}`).fill(p.wartosc);
      await page.getByTestId(`mvd-est-sigma-${i}`).fill(p.sigma);
      if (p.wezelJ) await page.getByTestId(`mvd-est-wezelj-${i}`).selectOption(p.wezelJ);
    }
    await page.getByTestId('mvd-est-estymuj').click();
    await expect(page.getByTestId('mvd-est-wynik')).toBeVisible();
    await expect(page.getByTestId('mvd-est-bad')).toContainText('6,635');
    await expect(page.getByTestId('mvd-est-podejrzany')).toContainText('BUS-1');
    await page.getByTestId('mvd-est-slad-otworz').click();
    await expect(page.getByTestId('mvd-est-slad')).toBeVisible();
    await expect(page.getByTestId('mvd-est-slad')).toContainText('27,8');
  } else if (scena === 'ssci') {
    // Jawny bieg SSCI (utworzenie przebiegu + werdykt) → otwarty ślad.
    await page.getByTestId('mvd-ssci-uruchom').click();
    await expect(page.getByTestId('mvd-ssci-wynik')).toBeVisible();
    await expect(page.getByTestId('mvd-ssci-chip-werdykt')).toContainText('niestabiln');
    await expect(page.getByTestId('mvd-ssci-metryki')).toBeVisible();
    await page.getByTestId('mvd-ssci-slad-otworz').click();
    await expect(page.getByTestId('mvd-ssci-slad')).toContainText('max|L|');
    await expect(page.getByTestId('mvd-ssci-slad')).toContainText('1,42');
  } else if (scena === 'migotanie') {
    // Wiersz węzła (moduły OZE) → otwarty ślad Pst/Plt/d z wzorami
    // renderowanymi KaTeX (math-rendered). HARNESS-RESZTA-kontynuacja: dawny
    // węzeł 'SZ-PV2'/moduł 'gen-pv-2' bez współczynnika i werdykt
    // „przekroczenie" z ręcznie pisanego mocka nie odpowiadały żadnemu
    // realnemu węzłowi po konwersji sceny na realny bieg backendu — jedyny
    // węzeł sieci złotej z modułem OZE katalogowym to `bus_nn`/`gen_pv`,
    // MA współczynnik emisji [flicker_c=0,3] (wliczony do sumowania, nie
    // pominięty) i mieści się w granicach planowania (Pst=0,0044 ≪ 0,9);
    // intencja bez zmian: wiersz węzła → szczegół modułu → otwarty ślad z
    // formułą KaTeX, teraz na realnych liczbach (jeden moduł, nie dwa).
    await expect(page.getByTestId('mvd-jakosc-migotanie')).toBeVisible();
    await expect(page.getByTestId('mvd-wyn-tabela')).toContainText(
      'w granicach planowania',
    );
    await page.getByTestId('mvd-wyn-tabela').getByText('bus_nn').click();
    const szczegol = page.getByTestId('mvd-jakosc-migotanie-szczegol');
    await expect(szczegol).toContainText('gen_pv');
    await expect(szczegol).toContainText('Wliczony do sumowania');
    await page.getByTestId('mvd-jakosc-mig-slad-otworz').click();
    const slad = page.getByTestId('mvd-jakosc-mig-slad');
    const wzor = slad.locator('[data-testid="math-rendered"]').first();
    await expect(wzor).toBeVisible();
    expect(await wzor.getAttribute('data-latex')).toContain('P_{st');
    await expect(slad).toContainText('P_st = (0.004414^3)^(1/3)');
  } else {
    // arcflash: parametry projektowe → „Przelicz" (POST) → wiersz szyny →
    // otwarty ślad IEEE 1584-2018 (I_arc, CF, E, AFB, ŚOI) w KaTeX.
    await page.getByTestId('mvd-jakosc-af-odleglosc').fill('455');
    await page.getByTestId('mvd-jakosc-af-odstep').fill('152');
    await page.getByTestId('mvd-jakosc-af-czas').fill('0.2');
    await page.getByTestId('mvd-jakosc-af-licz').click();
    await expect(page.getByTestId('mvd-jakosc-arcflash')).toBeVisible();
    // Kolumna „punkt" niesie surowy `bus_ref` (kontrakt IEEE 1584 buildera nie
    // niesie nazwy PL szyny — jak `branch_id` w tabeli gałęzi rozpływu, K3/C1
    // dowodRef) — HARNESS-RESZTA-kontynuacja: dawny literal 'Szyna SN-1' z
    // recznie pisanego mocka nie odpowiadal zadnej realnej szynie po konwersji
    // sceny na realny bieg backendu (`arcflash_scena_wynik.json`, pierwsza
    // szyna zlotej sieci, `element-id` ustabilizowany `_fiksuj_niedeterminizm_
    // sceny_zwarcia`).
    await page
      .getByTestId('mvd-wyn-tabela')
      .getByText('63203cbc-ac91-5100-a0ee-a275d24514ff')
      .click();
    await expect(page.getByTestId('mvd-jakosc-af-szczegol')).toBeVisible();
    await page.getByTestId('mvd-jakosc-af-slad-otworz').click();
    const slad = page.getByTestId('mvd-jakosc-af-slad');
    const wzor = slad.locator('[data-testid="math-rendered"]').first();
    await expect(wzor).toBeVisible();
    expect(await wzor.getAttribute('data-latex')).toContain('I_{arc');
    await expect(slad).toContainText('I_arc = 8.5156 kA');
    await expect(slad).toContainText('E = 32.1686 J/cm² = 7.6885 cal/cm²');
    await expect(slad).toContainText('AFB = 1487.7103 mm');
  }
}

test.describe('dowody-wyniki:screenshot', () => {
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

        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(`${HARNESS_URL}?creator=${scena}&theme=${theme}`, {
          waitUntil: 'domcontentloaded',
          timeout: 40000,
        });
        const root = page.locator('[data-testid="creator-harness-root"]').first();
        await expect(root).toBeVisible({ timeout: 15000 });
        await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

        await prowadzScene(page, scena);

        await page.waitForTimeout(400);
        if (errs.length > 0) console.log(`[${scena}/${theme}] errors:\n${errs.join('\n')}`);
        expect(errs, `no console/page errors for ${scena}/${theme}`).toEqual([]);

        const outPath = path.join(OUTPUT_DIR, `dowod_${scena}_${theme}.png`);
        await root.screenshot({ path: outPath });
        expect(fs.existsSync(outPath)).toBe(true);
      });
    }
  }
});
