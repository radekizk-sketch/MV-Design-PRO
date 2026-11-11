/**
 * Karta EKRANY-EAZ-ZIEMNOZWARCIOWE (kontynuacja karty EWALUATORY-ZIEMNOZWARCIOWE) — zabezpieczenie
 * ziemnozwarciowe kierunkowe 67N na ścieżce projektanta, wyłącznie NATYWNYMI klikami.
 *
 * INTENCJA (zachowana z karty EWALUATORY): ocena 67N liczona z solvera doziemień SN (3I₀ pola,
 * kąt względem 3U₀) idzie do JEDNEJ tabeli z werdyktem wyjaśnialnym na E-28 i w karcie nastaw
 * E-27. Tabela ma dziś wiersz na FUNKCJĘ (rodzina kierunkowa: kolumny nastaw, wielkości z wyniku,
 * zapas, stan), a rekordy kryteriów są w szczegółach wiersza — dawny wzorzec „wiersz na rekord”
 * został zastąpiony, więc wyrocznia porównuje wiersz funkcji ze stanem wiersza backendu.
 *
 * DROGA A — uzupełnienie nastawy z komórki → przeliczenie → wartość w tabeli. Sterownik pola 1 ma
 * włączone I> (51) z nastawami i 67N BEZ nastaw. „Oblicz” → E-28 „Oceń zabezpieczenia” → wiersz
 * 67N ma w komórce nastawy „Uzupełnij” → klik otwiera kartę nastaw E-27 TEGO sterownika z kursorem
 * w nastawie 67N → wpis (2 A pierwotnie, DT 0,5 s, do linii, cos φ) → zapis w modelu → „Oblicz”
 * i „Oceń” ponownie → komórka I₀> niesie próg z wyniku backendu, „Uzupełnij” znika.
 *
 * DROGA B — wartość projektanta: „Źródła wymagań” → k_c = 2 → „Zapisz” → PATCH przypadku (tylko
 * `wymagania_eaz`) i NOWY bieg oceny → wymaganie k_c wiersza 67N ma w wyniku backendu i w
 * szczegółach wiersza stan „wartość projektanta”; tabela źródeł bez zmian.
 *
 * WYROCZNIA: to, co widać, = to, co zwrócił backend (`GET /api/protection-runs/{id}/results`,
 * pole `ziemnozwarciowe.wiersze`). Liczba fizyczna: wymuszenie AWSC 25 A ≫ próg 2 A — rekord
 * czułości 67N pola linii doziemionej SPELNIA. Kadry 1440×900 i 1280×720 w obu motywach: E-28,
 * szczegóły wiersza 67N z wykresem wskazowym, karta nastaw (`docs/uiux/zrzuty/ekrany-eaz/`).
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import { katalogZrzutow } from './katalogZrzutow';
import {
  BACKEND_BASE,
  Klikacz,
  edytorSterownika,
  otworzAplikacje,
  otworzOceneZabezpieczen,
  otworzZabezpieczeniaIAutomatyke,
  uruchomOcene,
  ustaw67n,
  ustawNastawy,
  zbudujSiec,
} from './scenaDoziemieniaE2e';

const OUTPUT_DIR = katalogZrzutow(path.resolve(process.cwd(), '../docs/uiux/zrzuty/ekrany-eaz'));
const TABELA = 'mvd-ocena-zabezpieczen-ziemne';
const OKNA = [
  { szer: 1440, wys: 900 },
  { szer: 1280, wys: 720 },
] as const;

type Komorka = { wartosc: number | null; tekst: string | null };
type Wymaganie = { symbol: string; wartosc: number; stan: string; stan_pl: string };
type Wiersz = {
  urzadzenie_ref: string;
  funkcja_ref: string;
  kod: string;
  stan: string;
  braki: unknown[];
  wartosci: Record<string, Komorka | undefined>;
  wymagania: Record<string, Wymaganie>;
};
type Rekord = { urzadzenie_ref: string; kod: string | null; kryterium: string; status: string; zdanie_pl: string };
type Wynik = {
  ziemnozwarciowe: { wiersze: Wiersz[]; oceny: Rekord[]; zrodla_wymagan: unknown[] };
};

async function wynikBiegu(page: Page, runId: string): Promise<Wynik> {
  const odp = await page.request.get(`${BACKEND_BASE}/api/protection-runs/${runId}/results`);
  expect(odp.ok()).toBeTruthy();
  return (await odp.json()) as Wynik;
}

function dane67n(wynik: Wynik, sterownikRef: string): Wiersz {
  const w = wynik.ziemnozwarciowe.wiersze.filter((x) => x.urzadzenie_ref === sterownikRef && x.kod === '67N');
  expect(w, 'jeden wiersz 67N sterownika pola 1 w wyniku').toHaveLength(1);
  return w[0];
}

async function obliczZwarcie(page: Page, k: Klikacz): Promise<void> {
  await k.klik(page.getByRole('button', { name: 'Oblicz', exact: true }));
  await expect(
    page.getByTestId('notification-toast').filter({ hasText: 'Obliczenie zakończone' }).first(),
  ).toBeVisible({ timeout: 90000 });
}

test('EKRANY-EAZ: 67N — „Uzupełnij” z komórki → przeliczenie → wartość; wartość projektanta → nowy bieg', async ({
  page,
  request,
}) => {
  test.setTimeout(600000);
  const k = new Klikacz();

  const { caseId } = await otworzAplikacje(page, request);
  const { pole1, sterownik } = await zbudujSiec(request, caseId);
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });

  // (A1) 51 z nastawami, 67N włączone bez nastaw → bieg → ocena.
  await otworzZabezpieczeniaIAutomatyke(page, k);
  const prefiks = await edytorSterownika(page, pole1, sterownik.ref_id, k);
  const { ref67n } = await ustawNastawy(page, k, prefiks, sterownik, { pusta67n: true });
  await obliczZwarcie(page, k);
  await otworzOceneZabezpieczen(page, k);
  const runBez = await uruchomOcene(page, k);
  const daneBez = dane67n(await wynikBiegu(page, runBez), sterownik.ref_id);
  expect(daneBez.braki.length, '67N bez nastaw — wiersz z nazwanymi brakami').toBeGreaterThan(0);
  const wiersz = page.locator(`[data-testid="${TABELA}-wiersz"][data-urzadzenie="${sterownik.ref_id}"][data-kod="67N"]`);
  await expect(wiersz).toHaveCount(1, { timeout: 20000 });
  await expect(wiersz).toHaveAttribute('data-status', daneBez.stan);
  await expect(wiersz).toHaveAttribute('data-funkcja', ref67n);

  // (A2) „Uzupełnij” z komórki nastawy → karta nastaw tego sterownika, kursor w nastawie 67N.
  const uzupelnij = wiersz.getByTestId(`${TABELA}-uzupelnij`).first();
  await expect(uzupelnij).toBeVisible();
  await k.klik(uzupelnij);
  await expect(page.getByTestId(prefiks)).toBeVisible({ timeout: 20000 });
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? ''), { timeout: 10000 })
    .toMatch(new RegExp(`^${prefiks}-${ref67n}-`));
  await ustaw67n(page, prefiks, ref67n);
  await k.klik(page.getByTestId(`${prefiks}-zapisz`));
  await expect(page.getByTestId(`${prefiks}-gotowe`)).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId(`${prefiks}-blad`)).toHaveCount(0);

  // (A3) Przeliczenie: bieg zwarciowy i ocena od nowa — wartość w komórce z wyniku backendu.
  await obliczZwarcie(page, k);
  await otworzOceneZabezpieczen(page, k);
  const runPo = await uruchomOcene(page, k);
  expect(runPo).not.toBe(runBez);
  const wynikPo = await wynikBiegu(page, runPo);
  const danePo = dane67n(wynikPo, sterownik.ref_id);
  expect(danePo.braki).toEqual([]);
  expect(danePo.wartosci.prog?.wartosc).toBe(2);
  await expect(wiersz).toHaveAttribute('data-status', danePo.stan, { timeout: 20000 });
  await expect(wiersz.getByTestId(`${TABELA}-uzupelnij`)).toHaveCount(0);
  await expect(wiersz.getByTestId(`${TABELA}-prog`)).toHaveText(/^2(,0+)?$/);
  // Wymuszenie AWSC 25 A ≫ próg 2 A: czułość 67N w polu linii doziemionej spełniona.
  const czulosc = wynikPo.ziemnozwarciowe.oceny.filter(
    (r) => r.urzadzenie_ref === sterownik.ref_id && r.kod === '67N' && r.kryterium === 'CZULOSC',
  );
  expect(czulosc.map((r) => r.status)).toContain('SPELNIA');
  for (const r of czulosc) expect(r.zdanie_pl.trim().length).toBeGreaterThan(0);
  expect(danePo.wymagania.k_c, 'k_c wymagane w wierszu 67N').toBeDefined();
  expect(danePo.wymagania.k_c.stan).not.toBe('WARTOSC_PROJEKTANTA');

  // (B) Wartość projektanta k_c = 2 w przypadku → nowy bieg oceny.
  const tabela = page.getByTestId(TABELA);
  await k.klik(page.getByTestId(`${TABELA}-zrodla`).locator('summary'));
  const edytor = page.getByTestId(`${TABELA}-wymagania-projektanta`);
  await expect(edytor).toBeVisible();
  await edytor.getByTestId(`${TABELA}-wymaganie-k_c`).fill('2');
  const patch = page.waitForResponse(
    (r) => r.url().endsWith(`/api/study-cases/${caseId}`) && r.request().method() === 'PATCH',
  );
  const nowyBieg = page.waitForResponse(
    (r) => /\/api\/projects\/[^/]+\/protection-runs$/.test(r.url()) && r.request().method() === 'POST',
    { timeout: 60000 },
  );
  await k.klik(edytor.getByTestId(`${TABELA}-wymagania-projektanta-zapisz`));
  const odpPatch = await patch;
  expect(odpPatch.ok(), await odpPatch.text()).toBeTruthy();
  expect(JSON.parse(odpPatch.request().postData() ?? '{}')).toEqual({ config: { wymagania_eaz: { k_c: 2 } } });
  const odpBiegu = await nowyBieg;
  expect(odpBiegu.ok(), await odpBiegu.text()).toBeTruthy();
  const { id: runProj } = (await odpBiegu.json()) as { id: string };
  expect(runProj).not.toBe(runPo);
  await expect(page.getByTestId('mvd-ocena-zabezpieczen')).toHaveAttribute('data-run-id', runProj, { timeout: 60000 });
  const wynikProj = await wynikBiegu(page, runProj);
  const daneProj = dane67n(wynikProj, sterownik.ref_id);
  expect(daneProj.wymagania.k_c).toMatchObject({ wartosc: 2, stan: 'WARTOSC_PROJEKTANTA' });
  expect(wynikProj.ziemnozwarciowe.zrodla_wymagan).toEqual(wynikPo.ziemnozwarciowe.zrodla_wymagan);
  await k.klik(wiersz.getByTestId(`${TABELA}-szczegoly-przelacz`));
  const pozycjaKc = tabela.getByTestId(`${TABELA}-wymagania`).locator('li[data-klucz="k_c"]');
  await expect(pozycjaKc).toHaveAttribute('data-stan', 'WARTOSC_PROJEKTANTA');
  await expect(pozycjaKc).toContainText(daneProj.wymagania.k_c.stan_pl);
  await expect(page.getByTestId(`${TABELA}-wykres`)).toBeVisible();

  // Kadry: E-28 (tabela), szczegóły 67N z wykresem wskazowym, karta nastaw — 2 okna × 2 motywy.
  const kadry: string[] = [];
  const kadruj = async (motyw: 'dark' | 'light') => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    for (const { szer, wys } of OKNA) {
      const okno = `${szer}x${wys}`;
      await page.setViewportSize({ width: szer, height: wys });
      await otworzOceneZabezpieczen(page);
      await expect(wiersz).toHaveCount(1, { timeout: 20000 });
      const przelacz = wiersz.getByTestId(`${TABELA}-szczegoly-przelacz`);
      if ((await przelacz.getAttribute('aria-expanded')) === 'true') await przelacz.click();
      await tabela.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const plikE28 = `e28-ziemne-${okno}-${motyw}.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, plikE28) });
      await przelacz.click();
      const wykres = page.getByTestId(`${TABELA}-wykres`);
      await expect(wykres).toBeVisible();
      await wykres.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const plikSzcz = `e28-szczegoly-67n-wykres-${okno}-${motyw}.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, plikSzcz) });
      await otworzZabezpieczeniaIAutomatyke(page);
      await edytorSterownika(page, pole1, sterownik.ref_id);
      const szczegoly = page.getByTestId(`${prefiks}-szczegoly`);
      if (!(await szczegoly.isVisible())) await page.getByTestId(`${prefiks}-szczegoly-przelacz`).click();
      const karta = page.getByTestId(`${prefiks}-ziemne`);
      await expect(karta).toBeVisible({ timeout: 20000 });
      await expect(page.getByTestId(`${prefiks}-ziemne-nieaktualny`)).toHaveCount(0);
      await karta.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const plikKarta = `karta-nastaw-${okno}-${motyw}.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, plikKarta) });
      kadry.push(plikE28, plikSzcz, plikKarta);
    }
  };
  await kadruj('dark');
  await page.evaluate(() => {
    localStorage.setItem('mvd-theme-mode', JSON.stringify({ state: { mode: 'light_technical' }, version: 0 }));
  });
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await kadruj('light');
  for (const plik of kadry) expect(fs.existsSync(path.join(OUTPUT_DIR, plik)), `kadr ${plik}`).toBe(true);
});
