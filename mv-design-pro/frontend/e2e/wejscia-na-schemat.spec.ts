/**
 * Karta SLD-SKALA-I-NAWIGACJA, część W — wejście na schemat z trzech ekranów i powrót
 * „Wróć do" na REALNYM backendzie, ścieżką NATYWNĄ (kliki, wpisywanie i klawisze
 * Playwrighta w żywej aplikacji, bez zdarzeń syntetycznych i bez wymuszania stanu sklepów).
 *
 * Co spec dowodzi (kryteria ukończenia karty, pkt 3–5):
 *  1. Wyniki zwarć: wybrany punkt zwarcia INNY niż pierwszy → „Pokaż na schemacie" → przestrzeń
 *     „Schemat", „Wróć do: Wyniki — Zwarcia" w pasku narzędzi → klik → ta sama zakładka
 *     i TEN SAM wybrany wiersz (nie pierwszy, jak przy ponownym montażu bez powrotu).
 *  2. Gotowość: fraza filtra wpisana NAZWĄ stacji → „Pokaż na schemacie" problemu →
 *     „Wróć do: Gotowość" → filtr z tą samą frazą i ten sam problem na liście.
 *  3. Drzewo topologii (Model sieci, zakładka „Właściwości", tryb drzewa
 *     „administracyjny", węzły rozwinięte ręcznie): klik stacji zaznacza ją bez skoku,
 *     inspektor daje „Pokaż na schemacie" → „Wróć do: Model sieci — Właściwości" →
 *     ta sama zakładka, ten sam tryb drzewa, węzeł zaznaczony i widoczny bez ponownego
 *     rozwijania.
 *  4. JEDEN CEL, JEDNA IDENTYFIKACJA (karta INSPEKTOR-I-NAWIGACJA pkt 6): po każdym wejściu,
 *     także po oknie obserwacji, karta inspektora niesie ref celu (`data-element-ref`), a jej
 *     stacja nadrzędna (`data-stacja-nazwa`, z rekordów modelu) jest stacją okruszków kadru.
 *     Wcześniejsza wersja specu sprawdzała tylko przestrzeń i powrót — przeszła mimo
 *     inspektora pokazującego obiekt poprzedniego wejścia (test maskujący, Zero-Debt pkt 5).
 *  5. Pułapka z `pulapka-nawigacji-po-biegu.spec.ts` nie wraca: na schemacie nic nie
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

/**
 * Zgodność celu po wejściu (po oknie obserwacji — późne przywrócenie selekcji z adresu
 * też jest łapane): ref karty inspektora = ref celu, stacja nadrzędna karty = stacja
 * okruszków kadru schematu.
 */
async function zgodnyCel(page: Page, ref: string): Promise<void> {
  await page.waitForTimeout(OBSERWACJA_MS);
  const karta = page.getByTestId('inspektor-karta');
  await expect(karta).toHaveAttribute('data-element-ref', ref, { timeout: 20000 });
  const stacja = await karta.getAttribute('data-stacja-nazwa');
  expect(stacja, `stacja nadrzędna celu ${ref}`).toBeTruthy();
  await expect(page.getByTestId('sld-v3-sciezka-1')).toHaveText(stacja!);
}

/**
 * Cel widoczny i wyróżniony na kadrze (oględziny architekta 2026-11-12, zrzut
 * `wejscie-z-wynikow-zwarc-jasny`: cały schemat wyblakły, cel nie do znalezienia). Po wejściu:
 *  - obrys zaznaczenia celu (`data-zaznaczenie-ref` = ref celu, barwa zaznaczenia) istnieje,
 *    a jego środek leży w środkowej części kadru (60 % szerokości i wysokości obszaru kanwy);
 *  - rysunek celu (`data-owner-ref` = ref celu) jest NARYSOWANY i nie leży pod kurtyną kadru
 *    (`data-kadr="poza"` — przygaszenie kontekstu dotyczy otoczenia, nigdy celu).
 * Nie opiera się na komunikacie o ukrytych opisach (karta skali go usuwa).
 */
async function celWKadrze(page: Page, ref: string): Promise<void> {
  const kanwa = await page.getByTestId('sld-canvas-v3').boundingBox();
  const obrys = page.locator(`[data-testid="sld-v3-zaznaczenie"] [data-zaznaczenie-ref="${ref}"]`).first();
  // Miękkie asercje: test melduje WSZYSTKIE wejścia z celem poza kadrem, nie tylko pierwsze.
  await expect.soft(obrys, `obrys zaznaczenia celu ${ref}`).toHaveCount(1, { timeout: 20000 });
  const pudlo = (await obrys.count()) > 0 ? await obrys.boundingBox() : null;
  if (pudlo) {
    const sx = pudlo.x + pudlo.width / 2;
    const sy = pudlo.y + pudlo.height / 2;
    expect.soft(sx, `środek celu ${ref} w poziomie kadru`).toBeGreaterThan(kanwa!.x + 0.2 * kanwa!.width);
    expect.soft(sx, `środek celu ${ref} w poziomie kadru`).toBeLessThan(kanwa!.x + 0.8 * kanwa!.width);
    expect.soft(sy, `środek celu ${ref} w pionie kadru`).toBeGreaterThan(kanwa!.y + 0.2 * kanwa!.height);
    expect.soft(sy, `środek celu ${ref} w pionie kadru`).toBeLessThan(kanwa!.y + 0.8 * kanwa!.height);
  }
  const rysunek = page.getByTestId('sld-canvas-v3').locator(`[data-owner-ref="${ref}"]`);
  expect.soft(await rysunek.count(), `rysunek celu ${ref}`).toBeGreaterThan(0);
  expect.soft(
    await page.getByTestId('sld-canvas-v3').locator(`[data-kadr="poza"] [data-owner-ref="${ref}"]`).count(),
    `cel ${ref} pod kurtyną kadru`,
  ).toBe(0);
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
    // Punkt NIE pierwszy (stan różny od domyślnego) i obecny na schemacie: punkt zwarcia
    // na szynie pomocniczej (zacisk odgałęzienia, nienarysowany) nie ma akcji — uczciwie.
    const pokazZwarcie = page.getByTestId('mvd-zwarcia-pokaz-sld');
    let indeksPunktu = -1;
    for (let i = 1; i < (await wiersze.count()) && indeksPunktu < 0; i += 1) {
      await wiersze.nth(i).click();
      await expect(wiersze.nth(i)).toHaveAttribute('aria-selected', 'true');
      if ((await pokazZwarcie.count()) > 0) indeksPunktu = i;
    }
    expect(indeksPunktu, 'punkt zwarcia (nie pierwszy) obecny na schemacie').toBeGreaterThan(0);
    const tekstPunktu = await wiersze.nth(indeksPunktu).textContent();
    await expect(pokazZwarcie).toHaveText('Pokaż na schemacie');
    expect((await pokazZwarcie.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    const refPunktu = (await pokazZwarcie.getAttribute('data-element-ref'))!;
    await pokazZwarcie.click();
    await naSchemacie(page);
    await zgodnyCel(page, refPunktu);
    await celWKadrze(page, refPunktu);
    await zrzut(page, 'z-wynikow-zwarc', motyw.klucz);
    await wrocDo(page, 'Wyniki — Zwarcia');
    await expect(page.getByTestId('mvd-wyniki-zakladka-zwarcia')).toHaveAttribute('aria-selected', 'true');
    const wierszePo = page.getByTestId('mvd-zwarcia-ekran').getByTestId('mvd-wyn-tabela').first().getByTestId('mvd-wyn-wiersz');
    await expect(wierszePo.nth(indeksPunktu)).toHaveAttribute('aria-selected', 'true', { timeout: 30000 });
    await expect(wierszePo.nth(indeksPunktu)).toHaveText(tekstPunktu ?? '');
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
    await zgodnyCel(page, idProblemu!.replace('mvd-problem-W043-', ''));
    await celWKadrze(page, idProblemu!.replace('mvd-problem-W043-', ''));
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
    const refWezla = (await page
      .getByTestId('mvd-inspektor-pokaz-na-schemacie')
      .getByRole('button', { name: 'Pokaż na schemacie' })
      .getAttribute('data-element-ref'))!;
    await pokazZInspektora.focus();
    await page.keyboard.press('Enter');
    await naSchemacie(page);
    await zgodnyCel(page, refWezla);
    await celWKadrze(page, refWezla);
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
