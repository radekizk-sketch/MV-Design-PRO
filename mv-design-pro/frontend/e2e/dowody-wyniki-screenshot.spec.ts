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

/**
 * Pomiary edytora zgodności powykonawczej — Z FIXTURY REALNEGO biegu
 * (`odbior_zgodnosc_scena_wynik.json`, karta HARNESS-RESZTA). NAPRAWA
 * HARNESS-RESZTA-2: spec wpisywał własny zestaw (`BUS-1`, `LINE-2`, …) i klikał
 * wiersz `BUS-1`, którego wynik backendu nie zawiera — zrzut pokazywałby
 * pomiary bez związku z tabelą wyników, a klik kończył się timeoutem. Teraz
 * edytor dostaje DOKŁADNIE te pomiary, które opisuje odpowiedź.
 * Odczyt `readFileSync`, nie `import … .json`: moduł specu jest ESM Node'a.
 */
const ODBIOR_SCENA_WYNIK = JSON.parse(
  fs.readFileSync(
    path.resolve(
      _dirname,
      '../src/harness-fixtures/generated/odbior_zgodnosc_scena_wynik.json',
    ),
    'utf-8',
  ),
) as {
  wiersze: {
    element_ref: string;
    wielkosc: string;
    wartosc_pomiar: number;
    zacisk: 'od' | 'do' | null;
    werdykt: string;
    slad_pl: string[];
  }[];
  tolerancje: Record<string, number>;
};
const POMIARY_ODBIORU = ODBIOR_SCENA_WYNIK.wiersze.map((wiersz) => ({
  element: wiersz.element_ref,
  wielkosc: wiersz.wielkosc,
  // Edytor przyjmuje liczbę w zapisie PL (przecinek dziesiętny).
  wartosc: String(wiersz.wartosc_pomiar).replace('.', ','),
  // Miejsce pomiaru mocy gałęzi (decyzja O-51) — z rekordu fixtury; `null` = protokół
  // bez zacisku (wiersz „brak miejsca pomiaru").
  zacisk: wiersz.zacisk,
}));
/** Wiersz z naruszeniem — na nim scena otwiera wywód (to on niesie werdykt). */
const ODBIOR_WIERSZ_NARUSZENIA = ODBIOR_SCENA_WYNIK.wiersze.find(
  (wiersz) => wiersz.werdykt === 'poza tolerancją',
)!;

/**
 * Węzeł i moduł sceny analiz OZE („sila-sieci", „migotanie") — Z FIXTUR REALNEGO
 * biegu (`sila_sieci_scena_wynik.json`, `migotanie_scena_wynik.json`). Karta AB-H0
 * (§0 pkt 2): przypisanie typu odmawia karty falownika 0,8 kV na szynie 0,4 kV sieci
 * złotej (`converter.voltage_mismatch`, jak tor tworzenia), więc scena buduje własną
 * sieć operacjami domenowymi (GPZ → kabel 500 m → stacja 15/0,8 kV 2,5 MVA → falownik
 * PV z karty) i referencje szyny/modułu nadaje domena — spec je CYTUJE zamiast wpisywać.
 */
const SILA_SIECI_SCENA_WYNIK = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/sila_sieci_scena_wynik.json'),
    'utf-8',
  ),
) as { entries: { bus_ref: string }[] };
const WEZEL_SILY_SIECI = SILA_SIECI_SCENA_WYNIK.entries[0].bus_ref;
const MIGOTANIE_SCENA_WYNIK = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/migotanie_scena_wynik.json'),
    'utf-8',
  ),
) as { buses: { bus_ref: string; modules: { gen_ref: string }[] }[] };
const WEZEL_MIGOTANIA = MIGOTANIE_SCENA_WYNIK.buses[0].bus_ref;
const MODUL_MIGOTANIA = MIGOTANIE_SCENA_WYNIK.buses[0].modules[0].gen_ref;

/**
 * Pomiary telemetryczne estymacji WLS — Z FIXTURY REALNEGO biegu
 * (`estymacja_scena_wynik.json`, karta HARNESS-RESZTA). NAPRAWA
 * HARNESS-RESZTA-2: spec wpisywał własny zestaw na węzłach `BUS-1`/`BUS-2`,
 * których lista węzłów z backendu (sieć złota, referencje z modelu) nie
 * zawiera — `selectOption` kończył się timeoutem. Teraz edytor dostaje
 * DOKŁADNIE te pomiary, które opisuje odpowiedź estymatora.
 */
const ESTYMACJA_SCENA_WYNIK = JSON.parse(
  fs.readFileSync(
    path.resolve(_dirname, '../src/harness-fixtures/generated/estymacja_scena_wynik.json'),
    'utf-8',
  ),
) as {
  measurements: {
    meas_type: string;
    bus_ref: string;
    bus_j_ref: string | null;
    value: number;
    sigma: number;
  }[];
  bad_data: {
    chi_square_threshold: number;
    lnr_measurement: { bus_ref: string } | null;
  };
  white_box: { objective_j: number }[];
};
const POMIARY_ESTYMACJI = ESTYMACJA_SCENA_WYNIK.measurements.map((pomiar) => ({
  typ: pomiar.meas_type,
  wezel: pomiar.bus_ref,
  wartosc: String(pomiar.value).replace('.', ','),
  sigma: String(pomiar.sigma).replace('.', ','),
  wezelJ: pomiar.bus_j_ref,
}));
/** Format ekranu estymacji: cztery cyfry znaczące, przecinek PL (`fmtDokladny`). */
const liczbaDokladnaPl = (wartosc: number): string =>
  String(Number.parseFloat(wartosc.toPrecision(4))).replace('.', ',');

/**
 * Werdykt SSCI — z REALNEGO biegu backendu (`akademickie_scena_biegi.json`,
 * karta HARNESS-RESZTA). NAPRAWA HARNESS-RESZTA-2: spec cytował max|L| = „1,42"
 * z atrapy sprzed konwersji; realna sieć złota z kartą przekształtnika daje
 * max|L| = 126,4445 i ten sam werdykt „niestabilny".
 */
const SSCI_WERDYKT = (
  JSON.parse(
    fs.readFileSync(
      path.resolve(_dirname, '../src/harness-fixtures/generated/akademickie_scena_biegi.json'),
      'utf-8',
    ),
  ) as { biegi: { ssci_impedance: { stabilnosc: { verdict: { max_minor_loop_gain: number } } } } }
).biegi.ssci_impedance.stabilnosc.verdict;

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
    // systemowy (WSCR) i węzłowy (szyna pola źródłowego nN 0,8 kV stacji sceny
    // analiz OZE — tam stoi falownik po promocji pola do realnego aparatu; jedyny
    // węzeł z modułem OZE katalogowym — HARNESS-RESZTA-kontynuacja: dawny słaby
    // węzeł 'SZ-FW1' z ręcznie pisanego mocka nie odpowiadał żadnemu
    // realnemu węzłowi po konwersji sceny na realny bieg backendu; SCR
    // realnej farmy PV [0,215 MVA z karty] przy Sk″ = 37,97 MVA za transformatorem
    // 2,5 MVA daje werdykt „mocna", nie „słaba" — intencja bez zmian: DWA otwarte
    // wywody, na realnych liczbach).
    const sekcja = page.getByTestId('mvd-oze-pulpit-sila');
    await expect(page.getByTestId('mvd-oze-sila-wynik')).toBeVisible();
    await expect(page.getByTestId('mvd-oze-sila-wscr')).toContainText('176,61');
    await page.getByTestId('mvd-oze-sila-wscr-slad-otworz').click();
    await expect(sekcja).toContainText('licznik Σ(S_sc·S_n) = 8.1638 MVA²');
    await page.getByTestId(`mvd-oze-sila-slad-otworz-${WEZEL_SILY_SIECI}`).click();
    await expect(sekcja).toContainText('SCR = 37.9713 MVA / 0.215 MVA');
    await expect(page.getByTestId(`mvd-oze-sila-werdykt-${WEZEL_SILY_SIECI}`)).toContainText(
      'mocna',
    );
  } else if (scena === 'odbior-zgodnosc') {
    // Pomiary z obiektu w edytorze wierszy + jawne tolerancje → raport →
    // wybór wiersza → otwarty ślad slad_pl (kroki tekstowe).
    for (let i = 0; i < POMIARY_ODBIORU.length; i += 1) {
      const p = POMIARY_ODBIORU[i];
      if (i > 0) await page.getByTestId('mvd-odbior-dodaj').click();
      await page.getByTestId(`mvd-odbior-element-${i}`).fill(p.element);
      await page.getByTestId(`mvd-odbior-wielkosc-${i}`).selectOption(p.wielkosc);
      await page.getByTestId(`mvd-odbior-wartosc-${i}`).fill(p.wartosc);
      if (p.zacisk) {
        // Etykiety zacisków z backendu, bez zaznaczenia domyślnego — klik natywny.
        const zacisk = page.getByTestId(`mvd-odbior-zacisk-${i}-${p.zacisk}`);
        await expect(zacisk).not.toBeChecked();
        await zacisk.click();
      }
    }
    await page.getByTestId('mvd-odbior-tol-napiecie').fill('5');
    await page.getByTestId('mvd-odbior-tol-moc').fill('10');
    await page.getByTestId('mvd-odbior-oblicz').click();
    await expect(page.getByTestId('mvd-odbior-wynik')).toBeVisible();
    await expect(page.getByTestId('mvd-odbior-podsumowanie')).toBeVisible();
    await expect(page.getByTestId('mvd-wyn-tabela')).toContainText('poza tolerancją');
    await expect(page.getByTestId('mvd-wyn-tabela')).toContainText('brak miejsca pomiaru');
    // Ta sama gałąź ma dwa wiersze (P na zacisku, Q bez zacisku) — wiersz naruszenia
    // wskazuje jego werdykt, nie sam identyfikator elementu.
    await page
      .getByTestId('mvd-wyn-tabela')
      .getByTestId('mvd-wyn-wiersz')
      .filter({ hasText: ODBIOR_WIERSZ_NARUSZENIA.werdykt })
      .getByText(ODBIOR_WIERSZ_NARUSZENIA.element_ref, { exact: true })
      .click();
    await expect(page.getByTestId('mvd-odbior-szczegol')).toBeVisible();
    await page.getByTestId('mvd-odbior-slad-otworz').click();
    // Ślad porównania CYTOWANY z odpowiedzi backendu: pierwszy krok (wartość
    // modelu) i werdykt — obie linie liczy `build_zgodnosc_powykonawcza_view`.
    await expect(page.getByTestId('mvd-odbior-slad')).toContainText(
      ODBIOR_WIERSZ_NARUSZENIA.slad_pl[0],
    );
    await expect(page.getByTestId('mvd-odbior-slad')).toContainText(
      ODBIOR_WIERSZ_NARUSZENIA.slad_pl[ODBIOR_WIERSZ_NARUSZENIA.slad_pl.length - 1],
    );
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
    // Próg testu chi-kwadrat, podejrzany pomiar i pierwsza iteracja śladu —
    // CYTOWANE z odpowiedzi estymatora (żadnej liczby wpisanej w specu).
    await expect(page.getByTestId('mvd-est-bad')).toContainText(
      liczbaDokladnaPl(ESTYMACJA_SCENA_WYNIK.bad_data.chi_square_threshold),
    );
    await expect(page.getByTestId('mvd-est-podejrzany')).toContainText(
      ESTYMACJA_SCENA_WYNIK.bad_data.lnr_measurement!.bus_ref,
    );
    await page.getByTestId('mvd-est-slad-otworz').click();
    await expect(page.getByTestId('mvd-est-slad')).toBeVisible();
    await expect(page.getByTestId('mvd-est-slad')).toContainText(
      liczbaDokladnaPl(ESTYMACJA_SCENA_WYNIK.white_box[0].objective_j),
    );
  } else if (scena === 'ssci') {
    // Jawny bieg SSCI (utworzenie przebiegu + werdykt) → otwarty ślad.
    await page.getByTestId('mvd-ssci-uruchom').click();
    await expect(page.getByTestId('mvd-ssci-wynik')).toBeVisible();
    await expect(page.getByTestId('mvd-ssci-chip-werdykt')).toContainText('niestabiln');
    await expect(page.getByTestId('mvd-ssci-metryki')).toBeVisible();
    await page.getByTestId('mvd-ssci-slad-otworz').click();
    await expect(page.getByTestId('mvd-ssci-slad')).toContainText('max|L|');
    // Wzmocnienie pętli mniejszej CYTOWANE z werdyktu backendu (format śladu:
    // liczba z kropką dziesiętną, jak w podstawieniu solvera).
    await expect(page.getByTestId('mvd-ssci-slad')).toContainText(
      String(SSCI_WERDYKT.max_minor_loop_gain),
    );
  } else if (scena === 'migotanie') {
    // Wiersz węzła (moduły OZE) → otwarty ślad Pst/Plt/d z wzorami
    // renderowanymi KaTeX (math-rendered). HARNESS-RESZTA-kontynuacja: dawny
    // węzeł 'SZ-PV2'/moduł 'gen-pv-2' bez współczynnika i werdykt
    // „przekroczenie" z ręcznie pisanego mocka nie odpowiadały żadnemu
    // realnemu węzłowi po konwersji sceny na realny bieg backendu — jedyny
    // węzeł sceny analiz OZE z modułem OZE katalogowym to szyna pola źródłowego
    // nN 0,8 kV stacji z falownikiem PV karty (`WEZEL_MIGOTANIA`/`MODUL_MIGOTANIA`),
    // MA współczynnik emisji [flicker_c=0,3] (wliczony do sumowania, nie
    // pominięty) i mieści się w granicach planowania (Pst=0,0017 ≪ 0,9);
    // intencja bez zmian: wiersz węzła → szczegół modułu → otwarty ślad z
    // formułą KaTeX, teraz na realnych liczbach (jeden moduł, nie dwa).
    await expect(page.getByTestId('mvd-jakosc-migotanie')).toBeVisible();
    await expect(page.getByTestId('mvd-wyn-tabela')).toContainText(
      'w granicach planowania',
    );
    await page.getByTestId('mvd-wyn-tabela').getByText(WEZEL_MIGOTANIA).click();
    const szczegol = page.getByTestId('mvd-jakosc-migotanie-szczegol');
    await expect(szczegol).toContainText(MODUL_MIGOTANIA);
    await expect(szczegol).toContainText('Wliczony do sumowania');
    await page.getByTestId('mvd-jakosc-mig-slad-otworz').click();
    const slad = page.getByTestId('mvd-jakosc-mig-slad');
    const wzor = slad.locator('[data-testid="math-rendered"]').first();
    await expect(wzor).toBeVisible();
    expect(await wzor.getAttribute('data-latex')).toContain('P_{st');
    await expect(slad).toContainText('P_st = (0.001699^3)^(1/3)');
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
