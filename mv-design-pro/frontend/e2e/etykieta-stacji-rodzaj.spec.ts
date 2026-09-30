/**
 * Karta ETYKIETA-STACJI-PRZELOTOWEJ — rodzaj stacji z JEDNEJ reguły na ŻYWEJ aplikacji
 * i REALNYM backendzie, wyłącznie ścieżką użytkownika (kliki natywne).
 *
 * Sieć (`etykietaStacjiSiec.ts`): trzy stacje zadeklarowane jako przelotowe — z polem ODG
 * („Stacja Klonowa"), w środku magistrali („Stacja Lipowa"), na końcu z wiszącą połową odcinka
 * („Stacja Brzozowa"). Sprawdzane:
 *  1. walidator backendu (`GET /enm/validate`): ostrzeżenie W043 dokładnie przy stacjach
 *     z deklaracją niezgodną z topologią, z nazwą stacji, oboma rodzajami i przyczyną — bez
 *     identyfikatorów maszynowych i kodów rodzaju w tekście;
 *  2. drzewo panelu „Schemat": rodzaj każdej stacji z topologii (nie z deklaracji);
 *  3. rysunek: podpis rodzaju przy stacji z polem ODG to „stacja odgałęźna" (jedyny taki);
 *  4. lista gotowości: ostrzeżenie widać z nazwą stacji (nie identyfikatorem), „Napraw…" otwiera
 *     kreator edycji z deklaracją ustawioną na rodzaj z topologii, zapis zdejmuje ostrzeżenie,
 *     a drzewo nadal pokazuje ten sam rodzaj (zmienia się deklaracja, nie rysunek).
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { BACKEND_BASE, STACJE, stanAplikacji, zbudujSiecEtykietyStacji, type SiecEtykietyStacji } from './etykietaStacjiSiec';

type Problem = { code: string; message_pl: string; element_refs: string[]; suggested_fix?: string | null };

async function problemyW043(request: APIRequestContext, caseId: string): Promise<Problem[]> {
  const odpowiedz = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm/validate`, { timeout: 30000 });
  expect(odpowiedz.ok()).toBeTruthy();
  const tresc = (await odpowiedz.json()) as { issues: Problem[] };
  return tresc.issues.filter((p) => p.code === 'W043');
}

async function otworzSchemat(page: Page, siec: SiecEtykietyStacji): Promise<void> {
  await page.addInitScript((wpisy) => {
    for (const [klucz, wartosc] of Object.entries(wpisy)) localStorage.setItem(klucz, wartosc);
  }, stanAplikacji(siec, 'light'));
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await page.getByRole('button', { name: 'Schemat (SLD)' }).first().click();
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible({ timeout: 30000 });
}

test('rodzaj stacji: walidator, drzewo, rysunek i naprawa deklaracji z jednej reguły', async ({ page, request }) => {
  test.setTimeout(300000);
  const siec = await zbudujSiecEtykietyStacji(request, 'asercje');
  const ref = (nazwa: string): string => siec.stacje[nazwa];

  // (1) Walidator backendu — W043 wyłącznie przy niezgodnych deklaracjach.
  const w043 = await problemyW043(request, siec.caseId);
  expect(w043.map((p) => p.element_refs[0]).sort()).toEqual(
    [ref(STACJE.odgalezna), ref(STACJE.koncowa)].sort(),
  );
  const klonowa = w043.find((p) => p.element_refs[0] === ref(STACJE.odgalezna))!;
  expect(klonowa.message_pl).toContain('Stacja „Stacja Klonowa”');
  expect(klonowa.message_pl).toContain('zadeklarowana jako przelotowa');
  expect(klonowa.message_pl).toContain('z topologii wynika stacja odgałęźna');
  expect(klonowa.message_pl).toContain('3 pola liniowe');
  const brzozowa = w043.find((p) => p.element_refs[0] === ref(STACJE.koncowa))!;
  expect(brzozowa.message_pl).toContain('z topologii wynika stacja końcowa');
  for (const problem of w043) {
    expect(problem.message_pl).not.toMatch(/stn\/|station_type|\binline\b|\bbranch\b|\bterminal\b/);
  }

  // (2) Drzewo panelu „Schemat".
  await otworzSchemat(page, siec);
  const drzewo = page.getByTestId('project-tree');
  const oczekiwane: Record<string, string> = {
    [STACJE.odgalezna]: 'stacja odgałęźna',
    [STACJE.przelotowa]: 'stacja przelotowa',
    [STACJE.koncowa]: 'stacja końcowa',
  };
  for (const [nazwa, rodzaj] of Object.entries(oczekiwane)) {
    await expect(drzewo.getByTestId(`model-tree-row-${ref(nazwa)}`)).toContainText(rodzaj);
  }

  // (3) Rysunek — przybliżenie kółkiem nad pierwszą stacją magistrali, aż podpis rodzaju
  // stanie na rysunku; podpis pochodzi z tej samej reguły co drzewo.
  await page.getByRole('button', { name: 'Dopasuj widok' }).click();
  await page.waitForTimeout(600);
  const etykiety = page.locator(`[data-testid="sld-v3-labels"] g[data-owner-ref^="${ref(STACJE.odgalezna)}"]`);
  const kotwica = (await etykiety.count()) > 0
    ? etykiety.first()
    : page.locator('[data-testid="sld-v3-labels"] text', { hasText: /^S01$/ }).first();
  const box = await kotwica.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  let podpisy: string[] = [];
  for (let krok = 0; krok < 24; krok++) {
    podpisy = (await etykiety.locator('text').allTextContents()).map((t) => t.trim()).filter((t) => t.startsWith('stacja '));
    if (podpisy.length > 0) break;
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(200);
  }
  expect(podpisy).toEqual(['stacja odgałęźna']);

  // (4) Gotowość: ostrzeżenie z nazwą stacji i naprawa deklaracji natywnymi klikami.
  await page.getByRole('button', { name: /Gotowość/ }).first().click();
  const wiersz = page.getByTestId(`mvd-problem-W043-${ref(STACJE.odgalezna)}`);
  await expect(wiersz).toBeVisible({ timeout: 30000 });
  await expect(wiersz).toContainText('zadeklarowana jako przelotowa');
  await expect(wiersz).toContainText('Stacja Klonowa');
  await expect(wiersz).not.toContainText('stn/');
  await wiersz.getByRole('button', { name: /Napraw/ }).click();
  await expect(page.getByTestId('mvd-kreator-edycja')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('mvd-kreator-edycja-klucz-0')).toHaveValue('station_type');
  await expect(page.getByTestId('mvd-kreator-edycja-wartosc-0')).toHaveValue('branch');
  await page.getByTestId('mvd-kreator-edycja-zapisz').click();
  await expect(page.getByTestId('mvd-kreator-edycja')).toHaveCount(0, { timeout: 30000 });

  await expect.poll(async () => (await problemyW043(request, siec.caseId)).map((p) => p.element_refs[0]), {
    timeout: 30000,
  }).toEqual([ref(STACJE.koncowa)]);
  await page.getByRole('button', { name: 'Schemat (SLD)' }).first().click();
  await expect(page.getByTestId('project-tree').getByTestId(`model-tree-row-${ref(STACJE.odgalezna)}`)).toContainText(
    'stacja odgałęźna',
  );
});
