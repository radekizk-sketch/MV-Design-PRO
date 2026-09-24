/**
 * Karta Z-1 — dowody wizualne „pokaż i udowodnij" dla 4 nowych ekranów
 * wynikowych E-29..E-32. Zrzut powstaje TYLKO gdy twarde asercje treści
 * przejdą (to jest „udowodnij"); wywód/ślad renderowany OTWARTY tam, gdzie
 * ekran go ma. Sceny harnessu na REALNYCH komponentach produkcyjnych
 * (ui2/wyniki/**) z podmienionym `fetch` (kształty 1:1 z kontraktami backendu,
 * te same fixture'y co w testach jednostkowych modułów):
 *  - e29-skladowe    — bilans Zk + składowe Z1/Z2/Z0 (ślad WHITE BOX, KaTeX)
 *                      + uziemienie punktu neutralnego + werdykt raportowalności,
 *  - e30-zbieznosc   — werdykt zbieżności (liczba iteracji) + bilans przebiegu
 *                      + tabela pętli OLTC + ślad iteracji OTWARTY,
 *  - e31-stan-fazowy — tabela napięć/prądów per faza + asymetrie z werdyktem
 *                      (PRZEKROCZENIE z flagi solvera),
 *  - e32-stabilnosc  — rekord oceny NIE_OCENIONO (uczciwość natychmiastowa
 *                      2026-09-23: kąty wpisane przez użytkownika, dawny werdykt
 *                      STABILNY był porównaniem wpisanych liczb z progami) + echo
 *                      scenariusza + ślad OTWARTY bez narracji zdarzeń.
 * Wyjście: docs/audit/visual/flow-ekspert/e29..e32-<scena>-<motyw>.png (oba motywy).
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert');
const THEMES = ['light', 'dark'] as const;

interface Scena {
  readonly creator: string;
  readonly plik: string;
}

const SCENY: readonly Scena[] = [
  { creator: 'wyniki-skladowe', plik: 'e29-skladowe' },
  { creator: 'wyniki-zbieznosc', plik: 'e30-zbieznosc' },
  { creator: 'wyniki-stan-fazowy', plik: 'e31-stan-fazowy' },
  { creator: 'wyniki-stabilnosc', plik: 'e32-stabilnosc' },
];

const FIXTURY_DIR = path.resolve(_dirname, '../src/harness-fixtures/generated');

/** Fikstura sceny harnessu — DOKLADNIE ten plik, ktorym karmi sie ekran. */
function fixtura(nazwa: string): any {
  return JSON.parse(fs.readFileSync(path.join(FIXTURY_DIR, `${nazwa}.json`), 'utf-8'));
}

/**
 * Liczba tak, jak pokazuje ja ekran: pl-PL, 4 miejsca po przecinku, BEZ
 * separatora tysiecy (pomiar na renderze: `10162,6016`, nie `10 162,6016`).
 */
function pl4(wartosc: number): string {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
    useGrouping: false,
  }).format(Math.abs(wartosc));
}

/**
 * OCZEKIWANIA POCHODZA Z FIKSTURY, NIE Z LITERALOW (poprawka 2026-09-18).
 *
 * Wczesniej ten spec pilnowal liczb wpisanych recznie (`0,1000 + j 0,4000`,
 * `0,1234`, `uuid-tr-1`, `8,700e-7`). Karta HARNESS-RESZTA-2 podmienila sceny
 * E-29/E-30 na wyniki REALNEGO biegu backendu — literaly przestaly opisywac
 * cokolwiek i spec zapalil sie na CI (4 przypadki, run 455), mimo ze ekran
 * pokazywal poprawne liczby. Wniosek nie brzmi „podmien literaly na nowe":
 * kazdy nastepny bieg generatora znow by je uniewaznil. Oczekiwanie czytamy
 * wiec z TEJ SAMEJ fikstury, ktora scena podaje ekranowi — spec sprawdza
 * PRZEPLYW (backend -> fikstura -> ekran), a nie zapamietana liczbe.
 */
/** Prowadzi scenę do stanu „wywód OTWARTY" i weryfikuje treść PRZED zrzutem. */
async function prowadzScene(page: Page, creator: string): Promise<void> {
  if (creator === 'wyniki-skladowe') {
    // Bilans + składowe Z1/Z2/Z0 ze śladu WHITE BOX (krok „Zk", KaTeX) +
    // uziemienie punktu neutralnego — sekcja składowych renderuje wywód domyślnie.
    await expect(page.getByTestId('mvd-skladowe-tabela')).toBeVisible();
    await expect(page.getByTestId('mvd-skladowe-raport-status')).toContainText('raportowalny');
    const wierszSkladowych = fixtura('skladowe_scena_wynik').rows[0];
    const z1 = wierszSkladowych.z1_ohm;
    const z0 = wierszSkladowych.z0_ohm;
    // Czesc rzeczywista i modul czesci urojonej sprawdzamy OSOBNO: znak ekran
    // sklada typograficznie (U+2212), a test ma pilnowac LICZB z biegu, nie
    // glifu. Z0 sceny ma czesc rzeczywista rzedu 1e-13 — numeryczne zero obok
    // czlonu urojonego −10162,6 — i ekran pokazuje ja po zaokragleniu.
    const z1Ekran = page.getByTestId('mvd-skladowe-z1');
    await expect(z1Ekran).toContainText(pl4(z1.re));
    await expect(z1Ekran).toContainText(pl4(z1.im));
    const z0Ekran = page.getByTestId('mvd-skladowe-z0');
    await expect(z0Ekran).toContainText(pl4(z0.re));
    await expect(z0Ekran).toContainText(pl4(z0.im));
    // KaTeX faktycznie wyrenderowany w DOM (nie surowy LaTeX / fallback).
    const wzor = page.getByTestId('mvd-skladowe-wzor').locator('[data-testid="math-rendered"]').first();
    expect(await wzor.getAttribute('data-latex')).toContain('Z_k');
    await expect(page.locator('.katex').first()).toBeVisible();
    // Wywód DYPLOMOWY, nie zdegenerowany: podstawienie zawiera pełną sumę
    // składowych ORAZ wynik z jednostką, a |Zk| podstawienia == |Zk| wiersza
    // bilansu (spójność liczb między sekcjami tego samego ekranu).
    const podstawienie = page
      .getByTestId('mvd-skladowe-podstawienie')
      .locator('[data-testid="math-rendered"]')
      .first();
    const latexPodstawienia = (await podstawienie.getAttribute('data-latex')) ?? '';
    // Podstawienie pokazuje DOKLADNIE to, co policzyl solver: bierzemy je ze
    // sladu WHITE BOX tej samej sceny i porownujemy tekst do tekstu. Zaden
    // literal nie moze tu zyc — inaczej spec pilnowalby wlasnej pamieci
    // zamiast przeplywu backend -> fikstura -> ekran.
    const podstawieniaZeSladu: string[] = (fixtura('skladowe_scena_slad').white_box_trace ?? [])
      .map((krok: { substitution_latex?: string }) => krok.substitution_latex)
      .filter((tekst: unknown): tekst is string => typeof tekst === 'string' && tekst.length > 0);
    expect(
      podstawieniaZeSladu.length,
      'slad sceny musi niesc co najmniej jedno podstawienie',
    ).toBeGreaterThan(0);
    // Ekran pokazuje DOKLADNIE jedno z podstawien ze sladu — nie wlasny napis.
    expect(
      podstawieniaZeSladu,
      `podstawienie z ekranu (${latexPodstawienia}) nie pochodzi ze sladu sceny`,
    ).toContain(latexPodstawienia);
    // Wywod nie moze byc zdegenerowany: suma skladowych (co najmniej dwa czlony).
    expect(latexPodstawienia.split('+').length).toBeGreaterThanOrEqual(2);
    // Spojnosc miedzy sekcjami: modul Zk wiersza bilansu pokazany na ekranie.
    await expect(page.getByTestId('mvd-skladowe-tabela')).toContainText(
      pl4(wierszSkladowych.zk_ohm).slice(0, 5),
    );
    // W5-A: wpisy punktu neutralnego pochodza z ELEMENTOW MIGAWKI (zrodlo albo
    // uzwojenie transformatora), nigdy z szyny (`Bus.grounding` skasowane) i
    // nigdy z napisu wymyslonego przez ekran. Sprawdzamy wiec, ze kazdy wpis
    // nazywa element, ktory w migawce sceny ISTNIEJE — zamiast pilnowac nazwy
    // zapamietanej z dawnej, recznie pisanej fikstury („Zasilanie GPZ", ktorego
    // w realnej migawce nie ma; ta scena uziemia stron DN transformatora).
    const migawka = fixtura('skladowe_scena_migawka').snapshot;
    const nazwyElementow: string[] = [
      ...(migawka.sources ?? []),
      ...(migawka.transformers ?? []),
    ]
      .map((element: { name?: string }) => element.name)
      .filter((nazwa: unknown): nazwa is string => typeof nazwa === 'string' && nazwa.length > 0);
    expect(nazwyElementow.length, 'migawka sceny musi niesc nazwane elementy').toBeGreaterThan(0);
    const uziemienie = page.getByTestId('mvd-skladowe-uziemienie-siec');
    await expect(uziemienie).toBeVisible();
    const trescUziemienia = (await uziemienie.textContent()) ?? '';
    expect(
      nazwyElementow.some((nazwa) => trescUziemienia.includes(nazwa)),
      `lista uziemien (${trescUziemienia}) nie nazywa zadnego elementu migawki`,
    ).toBe(true);
  } else if (creator === 'wyniki-zbieznosc') {
    // Werdykt zbieżności (liczba iteracji) + bilans + pętla OLTC → ślad iteracji
    // OTWARTY (natywny klik przełącznika).
    const werdykt = page.getByTestId('mvd-zbieznosc-werdykt');
    await expect(werdykt).toBeVisible();
    await expect(werdykt).toHaveAttribute('data-werdykt', 'zbiezny');
    const wynikZbieznosci = fixtura('zbieznosc_scena_wynik');
    const sladZbieznosci = fixtura('zbieznosc_scena_slad');
    await expect(werdykt).toContainText(String(wynikZbieznosci.iterations_count));
    // Bilans przebiegu: straty czynne i bierne oraz skrajne napiecia — wszystkie
    // cztery liczby z podsumowania biegu, nie z pamieci testu.
    const bilans = page.getByTestId('mvd-zbieznosc-bilans');
    await expect(bilans).toContainText(pl4(wynikZbieznosci.summary.total_losses_p_mw));
    await expect(bilans).toContainText(pl4(wynikZbieznosci.summary.total_losses_q_mvar));
    await expect(bilans).toContainText(pl4(wynikZbieznosci.summary.min_v_pu));
    await expect(bilans).toContainText(pl4(wynikZbieznosci.summary.max_v_pu));
    // Petla OLTC: wiersz regulatora z biegu (identyfikator galezi ze sladu).
    const regulator = sladZbieznosci.oltc_control.regulators[0];
    expect(regulator, 'scena musi niesc co najmniej jeden regulator OLTC').toBeTruthy();
    await expect(page.getByTestId('mvd-zbieznosc-oltc-tabela')).toContainText(
      String(regulator.branch_id).slice(0, 8),
    );
    await page.getByTestId('mvd-zbieznosc-slad-przelacznik').click();
    const sladTabela = page.getByTestId('mvd-zbieznosc-slad-tabela');
    await expect(sladTabela).toBeVisible();
    // Spojnosc: liczba wierszy sladu iteracji == liczba iteracji z werdyktu,
    // a OSTATNIA norma niezbilansowania jest ponizej tolerancji biegu — to jest
    // dowod zbieznosci, wiec bierzemy obie liczby ze sladu, nie z pamieci.
    const iteracje = sladZbieznosci.iterations as { norm_mismatch: number }[];
    await expect(sladTabela.locator('tbody tr')).toHaveCount(iteracje.length);
    expect(iteracje.length).toBe(wynikZbieznosci.iterations_count);
    const ostatniaNorma = iteracje[iteracje.length - 1].norm_mismatch;
    expect(
      ostatniaNorma,
      `ostatnia norma ${ostatniaNorma} nie jest ponizej tolerancji ${sladZbieznosci.tolerance}`,
    ).toBeLessThan(sladZbieznosci.tolerance);
    await expect(sladTabela).toContainText(
      ostatniaNorma.toExponential(3).replace('.', ','),
    );
  } else if (creator === 'wyniki-stan-fazowy') {
    // Tabela faz A/B/C (napięcia/prądy) + asymetrie z werdyktem z flagi solvera
    // (prądowa PRZEKROCZENIE); werdykty renderowane domyślnie.
    const tabela = page.getByTestId('mvd-fazowy-tabela-faz');
    await expect(tabela).toBeVisible();
    // Liczby z REALNEGO biegu backendu (phase_state_sn, scena stan-fazowy,
    // karta HARNESS-RESZTA) — ua_kv=8,646754…, ib_a=78,0 (prąd fazy B z opcji
    // scenariusza), current_unbalance_percent=29,39 (alert solvera).
    await expect(tabela).toContainText('8,647');
    await expect(tabela).toContainText('78,0');
    const asymetrie = page.getByTestId('mvd-fazowy-asymetrie');
    await expect(asymetrie).toContainText('29,39');
    await expect(asymetrie).toContainText('PRZEKROCZENIE');
  } else {
    // wyniki-stabilnosc (zmiana kanonu 2026-09-23): rekord oceny NIE_OCENIONO z
    // REALNEGO biegu backendu (scena stabilnosc) zamiast werdyktu STABILNY, echo
    // scenariusza wpisanego przez użytkownika, ślad OTWARTY natywnym klikiem — bez
    // narracji zdarzeń zabezpieczeń (efekt topologii zadeklarowany w opcjach).
    const wiersz = fixtura('stabilnosc_scena_wyniki').rows[0];
    const ocena = page.getByTestId('mvd-stabilnosc-ocena');
    await expect(ocena).toHaveAttribute('data-status', 'NIE_OCENIONO');
    await expect(ocena).toContainText(wiersz.ocena.wyjasnienie.zdanie_pl);
    await expect(page.getByTestId('mvd-stabilnosc-echo')).toBeVisible();
    await expect(page.getByTestId('mvd-stabilnosc')).not.toContainText('STABILNY');
    await page.getByTestId('mvd-stabilnosc-slad-btn').click();
    await expect(page.getByTestId('mvd-stabilnosc-topologia')).toBeVisible();
    await expect(page.getByTestId('mvd-stabilnosc-zdarzenia')).toHaveCount(0);
  }
}

test.describe('dowody-flow-ekspert:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const scena of SCENY) {
    for (const theme of THEMES) {
      test(`${scena.plik} — ${theme}`, async ({ page }) => {
        const errs: string[] = [];
        const isNoise = (t: string): boolean =>
          /favicon|Download the React DevTools|Failed to load resource/i.test(t);
        page.on('console', (m) => {
          if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
        });
        page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${HARNESS_URL}?creator=${scena.creator}&theme=${theme}`, {
          waitUntil: 'domcontentloaded',
          timeout: 40000,
        });
        const root = page.locator('[data-testid="creator-harness-root"]').first();
        await expect(root).toBeVisible({ timeout: 15000 });
        await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

        await prowadzScene(page, scena.creator);

        await page.waitForTimeout(400);
        if (errs.length > 0) console.log(`[${scena.plik}/${theme}] errors:\n${errs.join('\n')}`);
        expect(errs, `no console/page errors for ${scena.plik}/${theme}`).toEqual([]);

        const outPath = path.join(OUTPUT_DIR, `${scena.plik}-${theme}.png`);
        await root.screenshot({ path: outPath });
        expect(fs.existsSync(outPath)).toBe(true);
      });
    }
  }
});
