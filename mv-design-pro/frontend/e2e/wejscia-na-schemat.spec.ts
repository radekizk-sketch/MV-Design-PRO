/**
 * Karta SLD-SKALA-I-NAWIGACJA, część W — wejście na schemat z trzech ekranów i powrót
 * „Wróć do" na REALNYM backendzie, ścieżką NATYWNĄ (kliki, wpisywanie i klawisze
 * Playwrighta w żywej aplikacji, bez zdarzeń syntetycznych i bez wymuszania stanu sklepów).
 *
 * Co spec dowodzi (kryteria ukończenia karty, pkt 3–5):
 *  1. Wyniki zwarć: wybrany DRUGI punkt zwarcia → „Pokaż na schemacie" → przestrzeń
 *     „Schemat", „Wróć do: Wyniki — Zwarcia" w pasku narzędzi → klik → ta sama zakładka
 *     i TEN SAM wybrany wiersz (nie pierwszy, jak przy ponownym montażu bez powrotu).
 *  2. Gotowość: fraza filtra wpisana NAZWĄ stacji → „Pokaż na schemacie" problemu →
 *     „Wróć do: Gotowość" → filtr z tą samą frazą i ten sam problem na liście.
 *  3. Drzewo topologii (Model sieci, zakładka „Właściwości", tryb drzewa
 *     „administracyjny", węzły rozwinięte ręcznie): klik stacji zaznacza ją bez skoku,
 *     inspektor daje „Pokaż na schemacie" → „Wróć do: Model sieci — Właściwości" →
 *     ta sama zakładka, ten sam tryb drzewa, węzeł zaznaczony i widoczny bez ponownego
 *     rozwijania.
 *  4. Pułapka z `pulapka-nawigacji-po-biegu.spec.ts` nie wraca: na schemacie nic nie
 *     wraca samo (2,5 s obserwacji przed klikiem „Wróć do"), a po powrocie nic nie
 *     przenosi samo na schemat.
 *
 * Zrzuty 1440×900 w obu motywach (materiał oceny właściciela, bramka B-02; spec NIE ocenia
 * wyglądu). Katalog: `docs/uiux/zrzuty/wejscia-na-schemat` przez `katalogZrzutow`.
 */
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { wykonajBiegDoKonca } from './biegi';
import { katalogZrzutow } from './katalogZrzutow';
import { BACKEND_BASE, otworzAplikacje, siecKadrow, ustawMotyw } from './siecKadrowStacji';

const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'wejscia-na-schemat'));
const OKNO = { width: 1440, height: 900 } as const;
/** Okno obserwacji samoczynnej nawigacji (objaw W-3 audytu: powrót po ~2,3 s). */
const OBSERWACJA_MS = 2500;

async function biegZwarciowy(request: APIRequestContext, caseId: string): Promise<string> {
  const utworz = await request.post(`${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`, {
    data: { analysis_type: 'SC_3F' },
    timeout: 60000,
  });
  expect(utworz.ok(), await utworz.text()).toBeTruthy();
  const runId = ((await utworz.json()) as { id: string }).id;
  await wykonajBiegDoKonca(request, BACKEND_BASE, runId);
  return runId;
}

const przestrzen = (page: Page, nazwa: RegExp): Locator => page.getByRole('button', { name: nazwa }).first();

async function naSchemacie(page: Page): Promise<void> {
  await expect(przestrzen(page, /^Schemat \(SLD\) \d$/)).toHaveAttribute('aria-current', 'page', { timeout: 20000 });
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 30000 });
}

/** „Wróć do: <ekran>" po obserwacji, że schemat nie odchodzi sam (pułapka W-3). */
async function wrocDo(page: Page, etykieta: string): Promise<void> {
  const powrot = page.getByTestId('mvd-schemat-powrot');
  await expect(powrot).toHaveText(`← Wróć do: ${etykieta}`);
  await page.waitForTimeout(OBSERWACJA_MS);
  await expect(przestrzen(page, /^Schemat \(SLD\) \d$/)).toHaveAttribute('aria-current', 'page');
  // Cel wskaźnika ≥ 24 px (WCAG 2.2 kryterium 2.5.8).
  const pudlo = await powrot.boundingBox();
  expect(pudlo!.height).toBeGreaterThanOrEqual(24);
  await powrot.click();
  await expect(powrot).toHaveCount(0);
}

/** Po powrocie nic nie przenosi samo na schemat. */
async function zostajePo(page: Page, nazwa: RegExp): Promise<void> {
  await page.waitForTimeout(OBSERWACJA_MS);
  await expect(przestrzen(page, nazwa)).toHaveAttribute('aria-current', 'page');
}

async function zrzut(page: Page, nazwa: string, motyw: string): Promise<void> {
  await page.screenshot({ path: resolve(KATALOG, `wejscie-${nazwa}-${motyw}.png`) });
}

/** Rozwija drzewo, aż węzeł o tekście `cel` będzie widoczny (kliki strzałek rozwinięcia). */
async function odslonWezel(page: Page, cel: string): Promise<Locator> {
  const drzewo = page.getByTestId('mvd-tree');
  const wiersz = drzewo.locator('[role="treeitem"]').filter({ hasText: cel }).first();
  for (let i = 0; i < 40 && (await wiersz.count()) === 0; i += 1) {
    const zwiniety = drzewo.locator('[role="treeitem"][aria-expanded="false"]').first();
    if ((await zwiniety.count()) === 0) break;
    const id = (await zwiniety.getAttribute('data-testid'))!.replace('mvd-tree-row-', '');
    await page.getByTestId(`mvd-tree-chevron-${id}`).click();
  }
  await expect(wiersz).toBeVisible({ timeout: 10000 });
  return wiersz;
}

test('wejście na schemat z trzech ekranów i „Wróć do" w tym samym stanie (oba motywy)', async ({ page, request }) => {
  test.setTimeout(900000);
  mkdirSync(KATALOG, { recursive: true });
  const seed = await siecKadrow(request);
  await biegZwarciowy(request, seed.caseId);
  await otworzAplikacje(page, seed, OKNO);

  for (const motyw of [
    { klucz: 'ciemny', theme: 'dark_scada' as const },
    { klucz: 'jasny', theme: 'light_technical' as const },
  ]) {
    await ustawMotyw(page, motyw.theme);

    // (1) Wyniki zwarć → schemat → „Wróć do" → ta sama zakładka i ten sam punkt.
    await przestrzen(page, /^Wyniki i dowody \d$/).click();
    await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 30000 });
    const obszarZwarc = page.locator('[data-testid^="mvd-wyniki-obszar-"][data-zakladki~="zwarcia"]').first();
    await obszarZwarc.click();
    const zakladkaZwarc = page.getByTestId('mvd-wyniki-zakladka-zwarcia');
    await zakladkaZwarc.click();
    await expect(zakladkaZwarc).toHaveAttribute('aria-selected', 'true');
    const ekranZwarc = page.getByTestId('mvd-zwarcia-ekran');
    await expect(ekranZwarc).toBeVisible({ timeout: 60000 });
    const wiersze = ekranZwarc.getByTestId('mvd-wyn-tabela').first().getByTestId('mvd-wyn-wiersz');
    await expect.poll(() => wiersze.count(), { timeout: 30000 }).toBeGreaterThanOrEqual(2);
    await wiersze.nth(1).click();
    await expect(wiersze.nth(1)).toHaveAttribute('aria-selected', 'true');
    const tekstPunktu = await wiersze.nth(1).textContent();
    const pokazZwarcie = page.getByTestId('mvd-zwarcia-pokaz-sld');
    await expect(pokazZwarcie).toHaveText('Pokaż na schemacie');
    expect((await pokazZwarcie.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    await pokazZwarcie.click();
    await naSchemacie(page);
    await zrzut(page, 'z-wynikow-zwarc', motyw.klucz);
    await wrocDo(page, 'Wyniki — Zwarcia');
    await expect(page.getByTestId('mvd-wyniki-zakladka-zwarcia')).toHaveAttribute('aria-selected', 'true');
    const wierszePo = page.getByTestId('mvd-zwarcia-ekran').getByTestId('mvd-wyn-tabela').first().getByTestId('mvd-wyn-wiersz');
    await expect(wierszePo.nth(1)).toHaveAttribute('aria-selected', 'true', { timeout: 30000 });
    await expect(wierszePo.nth(1)).toHaveText(tekstPunktu ?? '');
    await zostajePo(page, /^Wyniki i dowody \d$/);
    await zrzut(page, 'powrot-do-wynikow-zwarc', motyw.klucz);

    // (2) Gotowość: filtr frazą (nazwa stacji) → problem → schemat → „Wróć do" → ten sam filtr.
    await przestrzen(page, /^Gotowość \d$/).click();
    await expect(page.getByTestId('mvd-gotowosc-panel')).toBeVisible({ timeout: 30000 });
    const fraza = page.getByRole('textbox', { name: 'Szukaj wg elementu' });
    await fraza.fill('');
    await fraza.pressSequentially('odgałęzienia');
    const problem = page.locator('[data-testid^="mvd-problem-W043-"]').first();
    await expect(problem).toBeVisible({ timeout: 30000 });
    const idProblemu = await problem.getAttribute('data-testid');
    await problem.locator('.mvd-problem-select').click();
    await naSchemacie(page);
    await zrzut(page, 'z-gotowosci', motyw.klucz);
    await wrocDo(page, 'Gotowość');
    await expect(page.getByTestId('mvd-gotowosc-panel')).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('textbox', { name: 'Szukaj wg elementu' })).toHaveValue('odgałęzienia');
    await expect(page.getByTestId(idProblemu!)).toBeVisible();
    await zostajePo(page, /^Gotowość \d$/);
    await page.getByRole('textbox', { name: 'Szukaj wg elementu' }).fill('');

    // (3) Drzewo topologii: zakładka „Właściwości", tryb „administracyjny", węzły rozwinięte
    // ręcznie → klik stacji (zaznaczenie bez skoku) → inspektor „Pokaż na schemacie".
    await przestrzen(page, /^Model sieci \d$/).click();
    const zakladkaWlasciwosci = page.getByTestId('mvd-model-zakladka-wlasciwosci');
    await zakladkaWlasciwosci.click();
    await expect(zakladkaWlasciwosci).toHaveAttribute('aria-selected', 'true');
    const trybAdministracyjny = page.getByTestId('mvd-tree-mode-administracyjny');
    await trybAdministracyjny.click();
    await expect(trybAdministracyjny).toHaveAttribute('aria-pressed', 'true');
    const wezel = await odslonWezel(page, 'Stacja Sekcyjna');
    const idWezla = await wezel.getAttribute('data-testid');
    await wezel.click();
    await expect(page.getByTestId(idWezla!)).toHaveAttribute('aria-selected', 'true');
    // Przeglądanie z innej przestrzeni niczego nie przenosi.
    await expect(przestrzen(page, /^Model sieci \d$/)).toHaveAttribute('aria-current', 'page');
    const pokazZInspektora = page.getByTestId('mvd-inspektor-pokaz-na-schemacie').getByRole('button', {
      name: 'Pokaż na schemacie',
    });
    await expect(pokazZInspektora).toBeVisible({ timeout: 20000 });
    await zrzut(page, 'drzewo-zaznaczenie', motyw.klucz);
    // Klawiatura: fokus na akcji i Enter (akcja jest natywnym przyciskiem).
    await pokazZInspektora.focus();
    await page.keyboard.press('Enter');
    await naSchemacie(page);
    await zrzut(page, 'z-drzewa', motyw.klucz);
    await wrocDo(page, 'Model sieci — Właściwości');
    await expect(page.getByTestId('mvd-model-zakladka-wlasciwosci')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('mvd-tree-mode-administracyjny')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(idWezla!)).toBeVisible();
    await expect(page.getByTestId(idWezla!)).toHaveAttribute('aria-selected', 'true');
    await zostajePo(page, /^Model sieci \d$/);
    await zrzut(page, 'powrot-do-drzewa', motyw.klucz);
    // Stan wyjściowy dla drugiego motywu: zakładka domyślna i tryb drzewa domyślny.
    await page.getByTestId('mvd-tree-mode-zasilania').click();
    await page.getByTestId('mvd-model-zakladka-schemat').click();
  }
});
