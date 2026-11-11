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
  tabelePrzyciete,
  uruchomOcene,
  ustawNastawy,
  widocznoscSkrajnychKolumn,
  zbudujSiec,
  type WidocznoscKolumn,
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
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(300);
  const e28w1280 = await pomiarPierwszegoPlanu(tabela);

  // Widoczność skrajnych kolumn KAŻDEJ tabeli oceny (rodziny, uziemienia, źródła wymagań
  // rozwinięte) w obu oknach — względem okna i każdego kontenera obcinającego. Na kodzie
  // sprzed karty tabel rodzin nie było (spec mierzy oba stany): asercja, gdy ekran je ma.
  const zRodzinami = (await tabela.locator('[data-rodzina]').count()) > 0;
  const zrodla = page.getByTestId('mvd-ocena-zabezpieczen-ziemne-zrodla');
  if ((await zrodla.count()) > 0) await zrodla.locator('summary').click();
  const kolumnyE28: Record<string, WidocznoscKolumn[]> = {};
  for (const [szer, wys] of [
    [1440, 900],
    [1280, 720],
  ] as const) {
    await page.setViewportSize({ width: szer, height: wys });
    await page.waitForTimeout(300);
    const w = await widocznoscSkrajnychKolumn(tabela);
    kolumnyE28[`${szer}x${wys}`] = w;
    if (zRodzinami) expect(tabelePrzyciete(w), `E-28 ${szer}×${wys}`).toEqual([]);
  }
  if ((await zrodla.count()) > 0) await zrodla.locator('summary').click();
  await page.setViewportSize({ width: 1440, height: 900 });

  await otworzZabezpieczeniaIAutomatyke(page);
  await edytorSterownika(page, pole1, sterownik.ref_id);
  const szczegoly = page.getByTestId(`${prefiks}-szczegoly`);
  if (!(await szczegoly.isVisible())) await page.getByTestId(`${prefiks}-szczegoly-przelacz`).click();
  const karta = page.getByTestId(`${prefiks}-ziemne`);
  await expect(karta).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(300);
  const kartaNastaw = await pomiarPierwszegoPlanu(karta);
  const kolumnyKarty: Record<string, WidocznoscKolumn[]> = {};
  for (const [szer, wys] of [
    [1440, 900],
    [1280, 720],
  ] as const) {
    await page.setViewportSize({ width: szer, height: wys });
    await page.waitForTimeout(300);
    const w = await widocznoscSkrajnychKolumn(karta);
    kolumnyKarty[`${szer}x${wys}`] = w;
    if (zRodzinami) expect(tabelePrzyciete(w), `karta nastaw ${szer}×${wys}`).toEqual([]);
  }

  const wynik = {
    e28_tabela_zwarc_doziemnych: e28,
    e28_tabela_zwarc_doziemnych_1280x720: e28w1280,
    karta_nastaw_ocena: kartaNastaw,
    skrajne_kolumny_e28: kolumnyE28,
    skrajne_kolumny_karty_nastaw: kolumnyKarty,
    klikniecia_do_nastawy: doNastawy.liczba,
    klikniecia_do_wyniku: doWyniku.liczba,
    okno: '1440x900',
  };
  fs.mkdirSync(path.dirname(PLIK), { recursive: true });
  fs.writeFileSync(PLIK, `${JSON.stringify(wynik, null, 2)}\n`);
});
