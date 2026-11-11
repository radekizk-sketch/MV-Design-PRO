/**
 * Pomiar przed/po karty EKRANY-EAZ-ZIEMNOZWARCIOWE (kryterium ukończenia): scenariusz e2e 67N
 * — nastawy 51 i 67N natywnymi klikami (E-27), „Oblicz”, ocena zabezpieczeń (E-28). Mierzone:
 * wysokość tabeli zwarć doziemnych E-28 i karty nastaw w px (pełna, z przewinięciem), liczba słów
 * pierwszego planu (`innerText`: bez zwiniętych szczegółów), kliknięcia do zapisanej nastawy
 * i do widocznego wyniku. Spec działa na kodzie przed kartą i po niej (te same identyfikatory
 * ekranu) — wynik do pliku JSON (`POMIAR_EAZ_PLIK`), porównanie w dokumentacji zrzutów.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import {
  Klikacz,
  edytorSterownika,
  otworzAplikacje,
  otworzOceneZabezpieczen,
  otworzZabezpieczeniaIAutomatyke,
  pomiarPierwszegoPlanu,
  uruchomOcene,
  ustawNastawy,
  zbudujSiec,
} from './scenaDoziemieniaE2e';

const PLIK = process.env.POMIAR_EAZ_PLIK ?? path.resolve('test-results/pomiar-eaz.json');

test('pomiar przed/po: E-28 i karta nastaw w scenariuszu 67N', async ({ page, request }) => {
  test.setTimeout(420000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const { caseId } = await otworzAplikacje(page, request);
  const { pole1, sterownik } = await zbudujSiec(request, caseId);
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });

  const doNastawy = new Klikacz();
  await otworzZabezpieczeniaIAutomatyke(page, doNastawy);
  const prefiks = await edytorSterownika(page, pole1, sterownik.ref_id, doNastawy);
  await ustawNastawy(page, doNastawy, prefiks, sterownik, { pusta67n: false });

  const doWyniku = new Klikacz();
  await doWyniku.klik(page.getByRole('button', { name: 'Oblicz', exact: true }));
  await expect(
    page.getByTestId('notification-toast').filter({ hasText: 'Obliczenie zakończone' }).first(),
  ).toBeVisible({ timeout: 90000 });
  await otworzOceneZabezpieczen(page, doWyniku);
  await uruchomOcene(page, doWyniku);
  const tabela = page.getByTestId('mvd-ocena-zabezpieczen-ziemne');
  await expect(tabela).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(300);
  const e28 = await pomiarPierwszegoPlanu(tabela);
  // Po karcie: przy 1440×900 żadna tabela oceny nie wychodzi poza panel (bez zawijania
  // nagłówków rodzina 67N miała 1280 px, bez zawijania odwołania tabela źródeł 1620 px — w panelu
  // 1096 px). Na kodzie sprzed karty tabela rodziny nie istniała, a spec mierzy oba stany —
  // asercja tylko, gdy ekran ma tabele rodzin.
  if ((await tabela.locator('[data-rodzina]').count()) > 0) expect(e28.tabele_szersze_niz_panel).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(300);
  const e28w1280 = await pomiarPierwszegoPlanu(tabela);
  await page.setViewportSize({ width: 1440, height: 900 });

  await otworzZabezpieczeniaIAutomatyke(page);
  await edytorSterownika(page, pole1, sterownik.ref_id);
  const szczegoly = page.getByTestId(`${prefiks}-szczegoly`);
  if (!(await szczegoly.isVisible())) await page.getByTestId(`${prefiks}-szczegoly-przelacz`).click();
  const karta = page.getByTestId(`${prefiks}-ziemne`);
  await expect(karta).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(300);
  const kartaNastaw = await pomiarPierwszegoPlanu(karta);

  const wynik = {
    e28_tabela_zwarc_doziemnych: e28,
    e28_tabela_zwarc_doziemnych_1280x720: e28w1280,
    karta_nastaw_ocena: kartaNastaw,
    klikniecia_do_nastawy: doNastawy.liczba,
    klikniecia_do_wyniku: doWyniku.liczba,
    okno: '1440x900',
  };
  fs.mkdirSync(path.dirname(PLIK), { recursive: true });
  fs.writeFileSync(PLIK, `${JSON.stringify(wynik, null, 2)}\n`);
});
