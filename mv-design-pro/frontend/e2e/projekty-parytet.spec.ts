/**
 * PARYTET ZARZĄDZANIA PROJEKTAMI w ui2 (bramka karty KD-1, luki L-2…L-5
 * inwentarza parytetu mostów).
 *
 * INTENCJA: cztery zdolności, które miał wyłącznie most `#dashboard`, mają
 * działać w przestrzeni „Projekt" powłoki ui2 — na REALNYCH wywołaniach API:
 * - L-3 utworzenie projektu z DOWOLNĄ nazwą i opisem (POST /api/projects),
 * - L-4 odświeżenie listy projektów (GET /api/projects),
 * - L-5 zmiana projektu przy OTWARTYM projekcie (z potwierdzeniem),
 * - L-2 usunięcie projektu z potwierdzeniem (DELETE /api/projects/{id}).
 *
 * Asercje idą przeciwko SERWEROWI (lista projektów z API), nie tylko przeciwko
 * ekranowi — usunięty projekt ma zniknąć z backendu, a nie tylko z tabeli.
 * Wszystkie interakcje to kliki natywne w żywej aplikacji.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';

type Projekt = { id: string; name: string };

async function listaProjektow(request: APIRequestContext): Promise<Projekt[]> {
  const response = await request.get(`${BACKEND_BASE}/api/projects`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { projects: Projekt[] };
  return body.projects;
}

async function utworzProjekt(request: APIRequestContext, nazwa: string): Promise<Projekt> {
  const response = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: nazwa,
      description: 'Bramka KD-1: parytet zarządzania projektami',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Projekt;
}

/** Powłoka BEZ otwartego projektu — przestrzeń „Projekt" prowadzi ekranem W-102. */
async function otworzPowlokeBezProjektu(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.removeItem('mv-design-app-state');
  });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await page.getByRole('button', { name: /^Projekt \d$/ }).click();
}

/**
 * Wiersz listy projektow po nazwie. Czekamy najpierw na KONIEC ladowania listy —
 * inaczej klik trafia w wezel, ktory React zaraz podmienia (re-render po
 * odswiezeniu), a zaznaczenie przepada.
 */
function wierszProjektu(page: Page, nazwa: string) {
  return page.getByRole('row', { name: new RegExp(nazwa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
}

async function poczekajNaListe(page: Page): Promise<void> {
  await expect(page.getByText('Wczytywanie listy projektów…')).toHaveCount(0, { timeout: 20000 });
}

/** Zaznacza wiersz (1x klik) i potwierdza, ze zaznaczenie odblokowalo akcje listy. */
async function zaznaczProjekt(page: Page, nazwa: string): Promise<void> {
  await poczekajNaListe(page);
  await wierszProjektu(page, nazwa).click();
  await expect(page.getByTestId('mvd-projekty-usun')).toBeEnabled();
}

test('L-3 + L-4 + L-5 + L-2: własna nazwa, odświeżenie, zmiana projektu i usunięcie z potwierdzeniem', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);

  const znacznik = `KD1-${Date.now()}`;
  const nazwaNowego = `Projekt ${znacznik} wlasna nazwa`;
  const nazwaDrugiego = `Projekt ${znacznik} drugi`;
  const nazwaDoUsuniecia = `Projekt ${znacznik} do kasacji`;

  await otworzPowlokeBezProjektu(page);
  await expect(page.getByRole('heading', { name: 'Nowy projekt / otwórz projekt' })).toBeVisible();

  // --- L-3: nowy projekt z dowolną nazwą i opisem ---------------------------
  await page.getByTestId('mvd-projekty-wlasna-nazwa').click();
  await page.getByTestId('mvd-nowy-projekt-nazwa').fill(nazwaNowego);
  await page.getByTestId('mvd-nowy-projekt-opis').fill('Zlecenie e2e KD-1');
  await page.getByTestId('mvd-nowy-projekt-utworz').click();

  // Projekt istnieje NA SERWERZE dokładnie pod podaną nazwą (zero fabrykacji).
  await expect
    .poll(async () => (await listaProjektow(request)).some((p) => p.name === nazwaNowego), {
      timeout: 30000,
    })
    .toBe(true);
  // Powłoka przeszła do kontekstu nowego projektu (pasek przypadku go zna).
  await expect(page.getByTestId('active-case-bar')).toContainText(nazwaNowego, { timeout: 30000 });

  // --- L-5: „Otwórz projekt" działa TAKŻE przy otwartym projekcie -----------
  const drugi = await utworzProjekt(request, nazwaDrugiego);

  // Przy OTWARTYM projekcie wejściem jest klikalny chip nazwy projektu.
  await page.getByTestId('mvd-casebar-project').click();
  await expect(page.getByRole('heading', { name: 'Nowy projekt / otwórz projekt' })).toBeVisible();

  // --- L-4: odświeżenie listy pokazuje projekt utworzony poza ekranem -------
  await page.getByTestId('mvd-projekty-odswiez').click();
  await poczekajNaListe(page);
  await expect(wierszProjektu(page, nazwaDrugiego)).toBeVisible({ timeout: 20000 });

  // Zmiana projektu wymaga POTWIERDZENIA (zmiana kontekstu pracy).
  await wierszProjektu(page, nazwaDrugiego).dblclick();
  await expect(page.getByTestId('mvd-projekty-zmiana-dialog')).toBeVisible();
  await page.getByTestId('mvd-projekty-zmiana-dialog-potwierdz').click();
  await expect(page.getByTestId('active-case-bar')).toContainText(nazwaDrugiego, { timeout: 30000 });

  // --- L-2: usunięcie projektu z potwierdzeniem ------------------------------
  // Kontrakt backendu (`DELETE /api/projects/{id}`): projekt Z ZALEZNOSCIAMI
  // (warianty/przypadki/obliczenia) daje 409 Conflict. Sprawdzamy OBIE sciezki —
  // UI ma pokazac uczciwy komunikat serwera, a nie udawac usuniecie.
  await page.getByTestId('mvd-casebar-project').click();
  await page.getByTestId('mvd-projekty-odswiez').click();

  // (a) projekt z wariantem bazowym (utworzony w tym tescie przez ekran) —
  //     serwer odmawia, projekt ZOSTAJE, uzytkownik widzi powod.
  await zaznaczProjekt(page, nazwaNowego);
  await page.getByTestId('mvd-projekty-usun').click();
  await expect(page.getByTestId('mvd-projekty-usun-dialog')).toBeVisible();
  await page.getByTestId('mvd-projekty-usun-dialog-potwierdz').click();
  await expect(
    page.getByTestId('notification-toast').filter({ hasText: 'zależne obiekty' }).first(),
  ).toBeVisible({ timeout: 30000 });
  expect((await listaProjektow(request)).some((p) => p.name === nazwaNowego)).toBe(true);

  // (b) projekt BEZ zaleznosci (zalozony przez API, bez przypadkow) — usuwa sie.
  const doKasacji = await utworzProjekt(request, nazwaDoUsuniecia);
  await page.getByTestId('mvd-projekty-odswiez').click();
  await zaznaczProjekt(page, nazwaDoUsuniecia);
  await page.getByTestId('mvd-projekty-usun').click();

  // Samo żądanie NIE usuwa — dopiero potwierdzenie (operacja nieodwracalna).
  await expect(page.getByTestId('mvd-projekty-usun-dialog')).toBeVisible();
  expect((await listaProjektow(request)).some((p) => p.id === doKasacji.id)).toBe(true);

  await page.getByTestId('mvd-projekty-usun-dialog-potwierdz').click();

  // ASERCJA PRZEZ API: projekt zniknął z backendu, a aktywny (drugi) został.
  await expect
    .poll(async () => (await listaProjektow(request)).some((p) => p.id === doKasacji.id), {
      timeout: 30000,
    })
    .toBe(false);
  expect((await listaProjektow(request)).some((p) => p.id === drugi.id)).toBe(true);
  await poczekajNaListe(page);
  await expect(wierszProjektu(page, nazwaDoUsuniecia)).toHaveCount(0, { timeout: 20000 });
});
