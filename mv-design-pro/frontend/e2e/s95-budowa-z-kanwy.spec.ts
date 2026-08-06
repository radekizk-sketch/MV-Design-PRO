/**
 * KARTA S9-5 — KRYTERIUM ODBIORU: budowa sieci 15 stacji WYŁĄCZNIE z kanwy.
 *
 * Audyt `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`: P-7 („prawy klik nie ujawnia
 * żadnego menu operacji schematu") oraz B-4 („operacji, które faktycznie budują
 * sieć SN — wstaw stację na odcinku, przedłuż magistralę, rozpocznij
 * odgałęzienie — nie ma ani na pasie narzędzi, ani w menu kontekstowym;
 * wykonalne są wyłącznie przez API/kreatory poza schematem").
 *
 * ---------------------------------------------------------------------------
 * METODA POMIARU (uczciwość: co jest z kanwy, a co z API)
 * ---------------------------------------------------------------------------
 *  - projekt i przypadek obliczeniowy: API (to nie jest budowa sieci, tylko
 *    założenie miejsca pracy — dokładnie jak w pozostałych specach e2e);
 *  - KAŻDA operacja BUDOWY SIECI: wyłącznie z kanwy — natywny prawy klik
 *    (`click({ button: 'right' })`, pełna sekwencja pointer/mouse przeglądarki)
 *    w obiekt rysunku → pozycja menu → kreator operacji domenowej → zapis.
 *    Zero `__mvdpOpenOperationForm`, zero `dispatchEvent`, zero wywołań API
 *    budujących topologię (Zero-Debt pkt 5: obejście realnej ścieżki
 *    użytkownika zamaskowałoby dokładnie ten defekt, który karta naprawia).
 *
 * Sprawdzenie końcowe idzie PRZEZ API (`GET /api/cases/{id}/enm`) — model musi
 * naprawdę urosnąć, nie tylko rysunek.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
/** Kryterium karty. */
const DOCELOWA_LICZBA_STACJI = 15;

type Snapshot = {
  substations?: Array<{ ref_id: string; station_type?: string | null }>;
  branches?: Array<{ ref_id: string; type?: string }>;
  corridors?: Array<{ ordered_segment_refs?: string[] }>;
};

async function pobierzEnm(request: APIRequestContext, caseId: string): Promise<Snapshot> {
  const response = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Snapshot;
}

async function zalozMiejscePracy(request: APIRequestContext) {
  const suffix = `${Date.now().toString(36)}`;
  const projectName = `Budowa z kanwy ${suffix}`;
  const caseName = `Przypadek budowy ${suffix}`;
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Kryterium S9-5: budowa sieci wyłącznie z kanwy',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };
  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: project.id, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };
  return { projectId: project.id, projectName, caseId: studyCase.id, caseName };
}

async function otworzAplikacje(page: Page, request: APIRequestContext): Promise<{ caseId: string }> {
  const { projectId, projectName, caseId, caseName } = await zalozMiejscePracy(request);
  await page.addInitScript((seed) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: seed.projectId,
          activeProjectName: seed.projectName,
          activeCaseId: seed.caseId,
          activeCaseName: seed.caseName,
          activeCaseKind: 'ShortCircuitCase',
          activeCaseResultStatus: 'NONE',
          activeSnapshotId: null,
          activeMode: 'MODEL_EDIT',
          activeRunId: null,
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, { projectId, projectName, caseId, caseName });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  return { caseId };
}

/** Uchwyt trafienia (warstwa S9-4) pierwszego obiektu danej klasy na kanwie. */
function uchwytKlasy(page: Page, klasa: string) {
  return page.locator(`[data-hit-klasa="${klasa}"][data-hit-role="obrys"]`).first();
}

/** Natywny prawy klik w uchwyt obiektu kanwy; zwraca otwarte menu. */
async function prawyKlikWObiekt(page: Page, klasa: string) {
  const uchwyt = uchwytKlasy(page, klasa);
  await expect(uchwyt).toBeVisible({ timeout: 20000 });
  await uchwyt.click({ button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible({ timeout: 10000 });
  return menu;
}

test.describe('S9-5 — operacje budowy ciągu SN dostępne wyłącznie z kanwy', () => {
  test('menu tła i menu GPZ prowadzą do REALNYCH kreatorów operacji domenowych', async ({
    page,
    request,
  }) => {
    test.setTimeout(240000);
    await otworzAplikacje(page, request);

    // (1) Sieć pusta: prawy klik w TŁO arkusza → „Wstaw główny punkt zasilania".
    const kanwa = page.getByTestId('sld-canvas-v3');
    await expect(kanwa).toBeVisible({ timeout: 30000 });
    await kanwa.click({ button: 'right', position: { x: 40, y: 40 } });
    const menuTla = page.getByRole('menu');
    await expect(menuTla).toBeVisible({ timeout: 10000 });
    await expect(menuTla.getByTestId('sld-menu-insert-gpz')).toBeVisible();

    // Pozycja otwiera REALNY kreator źródła zasilania (add_grid_source_sn),
    // a nie komunikat „etap roadmapy".
    await menuTla.getByTestId('sld-menu-insert-gpz').click();
    await expect(page.getByTestId('mvd-kreator-zrodlo')).toBeVisible({ timeout: 20000 });
  });

  test(`kryterium odbioru: ${DOCELOWA_LICZBA_STACJI} stacji zbudowanych wyłącznie prawym klikiem na rysunku`, async ({
    page,
    request,
  }) => {
    test.setTimeout(1_800_000);
    const { caseId } = await otworzAplikacje(page, request);

    // ---- Ogniwo 1: źródło GPZ z menu TŁA -----------------------------------
    const kanwa = page.getByTestId('sld-canvas-v3');
    await expect(kanwa).toBeVisible({ timeout: 30000 });
    await kanwa.click({ button: 'right', position: { x: 40, y: 40 } });
    await page.getByRole('menu').getByTestId('sld-menu-insert-gpz').click();
    await zapiszZrodlo(page);
    await expect
      .poll(async () => (await pobierzEnm(request, caseId)).substations?.length ?? 0, { timeout: 60000 })
      .toBeGreaterThanOrEqual(1);

    // ---- Ogniwo 2: ciąg główny z SYMBOLU GPZ na rysunku ---------------------
    const menuZrodla = await prawyKlikWObiekt(page, 'zrodlo');
    await expect(menuZrodla.getByTestId('sld-menu-continue-trunk')).toBeEnabled();
    await menuZrodla.getByTestId('sld-menu-continue-trunk').click();
    await zapiszMagistrale(page);
    await expect
      .poll(async () => (await pobierzEnm(request, caseId)).branches?.length ?? 0, { timeout: 60000 })
      .toBeGreaterThanOrEqual(1);

    // ---- Ogniwo 3 (×15): stacja na odcinku z menu ODCINKA ------------------
    for (let i = 0; i < DOCELOWA_LICZBA_STACJI; i += 1) {
      const menuOdcinka = await prawyKlikWObiekt(page, 'tor');
      await expect(menuOdcinka.getByTestId('sld-menu-insert-station')).toBeEnabled();
      await menuOdcinka.getByTestId('sld-menu-insert-station').click();
      await zapiszStacje(page, i + 1);
      await expect
        .poll(async () => (await pobierzEnm(request, caseId)).substations?.length ?? 0, { timeout: 90000 })
        .toBeGreaterThanOrEqual(i + 2);
    }

    // ---- Pomiar końcowy: model naprawdę urósł ------------------------------
    const enm = await pobierzEnm(request, caseId);
    const stacjeSnNn = (enm.substations ?? []).filter(
      (s) => String(s.station_type ?? '').toLowerCase() !== 'gpz',
    );
    expect(stacjeSnNn.length).toBeGreaterThanOrEqual(DOCELOWA_LICZBA_STACJI);
  });
});

/** Zapis kreatora ŹRÓDŁA — jeden przycisk główny ramy kreatora. */
async function zapiszZrodlo(page: Page): Promise<void> {
  const kreator = page.getByTestId('mvd-kreator-zrodlo');
  await expect(kreator).toBeVisible({ timeout: 20000 });
  await page.getByTestId('mvd-kreator-zrodlo-zapisz').click();
  await expect(kreator).toBeHidden({ timeout: 60000 });
}

/**
 * Zapis kreatora MAGISTRALI. Kreator pracuje w trybie „budowniczego": po
 * pierwszym zapisie zostaje otwarty z przyciskiem „Zakończ budowę" — kończymy
 * go jawnie, żeby wrócić na kanwę (to realna ścieżka użytkownika, nie skrót).
 */
async function zapiszMagistrale(page: Page): Promise<void> {
  const kreator = page.getByTestId('mvd-kreator-magistrala');
  await expect(kreator).toBeVisible({ timeout: 20000 });
  await page.getByTestId('mvd-kreator-magistrala-zapisz').click();
  const zakoncz = page.getByTestId('mvd-kreator-magistrala-zakoncz');
  if (await zakoncz.isVisible({ timeout: 15000 }).catch(() => false)) {
    await zakoncz.click();
  }
  await expect(kreator).toBeHidden({ timeout: 60000 });
}

/**
 * Zapis kreatora STACJI ścieżką „szablon → zapis rekomendowany". Szablon jest
 * realną biblioteką aparatury (`station-templates`), a „zapis rekomendowany" —
 * realnym przyciskiem ostatniego kroku. Karta S9-5 mierzy WEJŚCIE z kanwy, nie
 * zawartość kreatora (tę pilnuje karta K9-B).
 */
async function zapiszStacje(page: Page, numer: number): Promise<void> {
  const kreator = page.getByTestId('mvd-kreator-stacja');
  await expect(kreator).toBeVisible({ timeout: 30000 });

  const wybor = page.getByTestId('mvd-kreator-stacja-szablon-wybor');
  await expect(wybor).toBeVisible({ timeout: 30000 });
  const opcje = await wybor.locator('option').all();
  expect(opcje.length).toBeGreaterThan(1);
  await wybor.selectOption({ index: 1 });
  await page.getByTestId('mvd-kreator-stacja-szablon-zastosuj').click();
  await expect(page.getByTestId('mvd-kreator-stacja-szablon-zastosowany')).toBeVisible({
    timeout: 30000,
  });

  const nazwa = page.getByTestId('mvd-kreator-stacja-nazwa');
  if (await nazwa.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nazwa.fill(`Stacja z kanwy ${String(numer).padStart(2, '0')}`);
  }

  // Przejście do ostatniego kroku realnym przyciskiem „Dalej".
  const dalej = page.getByTestId('mvd-kreator-stacja-dalej');
  for (let i = 0; i < 12; i += 1) {
    if (!(await dalej.isVisible({ timeout: 2000 }).catch(() => false))) break;
    await dalej.click();
  }

  const szybka = page.getByTestId('mvd-kreator-stacja-szybka-zapisz');
  const zwykla = page.getByTestId('mvd-kreator-stacja-zapisz');
  if (await szybka.isEnabled({ timeout: 10000 }).catch(() => false)) {
    await szybka.click();
  } else {
    await expect(zwykla).toBeEnabled({ timeout: 20000 });
    await zwykla.click();
  }
  await expect(kreator).toBeHidden({ timeout: 90000 });
}
