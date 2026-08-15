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
/**
 * Kryterium karty: 15 stacji wyłącznie z kanwy. Ten spec dowodzi CYKLU na
 * żywej aplikacji — każde ogniwo łańcucha wykonane natywnym prawym klikiem na
 * rysunku, z realnym zapisem do modelu przez backend. POWTARZALNOŚĆ do 15
 * stacji mierzy sonda odbioru `scripts/sld_v3_acceptance.mjs`
 * (`menu_chain_probe`): na sieci referencyjnej 54 stacje i 115 odcinków mają
 * realne wejście budowy, przy progu karty 15. Rozdzielenie jest świadome —
 * pętla 15 kreatorów w e2e mierzyłaby czas kreatorów, nie dostępność operacji
 * z rysunku (dług `S9-5-DLUG-E2E-PETLA` w rejestrze).
 */

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
  // 90 s: pierwsze wejscie po zimnym starcie serwera deweloperskiego potrafi
  // trwac dluzej niz domyslne 30 s (kompilacja modulow na zadanie).
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  return { caseId };
}

/** Uchwyt trafienia (warstwa S9-4) pierwszego obiektu danej klasy na kanwie. */
function uchwytKlasy(page: Page, klasa: string) {
  return page.locator(`[data-hit-klasa="${klasa}"][data-hit-role="obrys"]`).first();
}

/** Natywny prawy klik w uchwyt obiektu kanwy; zwraca otwarte menu. */
/** Powrót na rysunek: kreator zajmuje warsztat, więc kanwa nie ma wtedy
 *  uchwytów trafienia. Wracamy realnym okruszkiem „Schemat" powłoki. */
async function wrocNaSchemat(page: Page): Promise<void> {
  const okruszek = page.getByRole('button', { name: 'Schemat', exact: true }).first();
  if (await okruszek.isVisible({ timeout: 3000 }).catch(() => false)) {
    await okruszek.click();
  }
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 30000 });
  // Po każdej operacji rysunek się przebudowuje, a nowy obiekt bywa poza
  // kadrem — dociskamy widok realnym przyciskiem „Dopasuj widok".
  const dopasuj = page.getByTestId('sld-v3-fit-view');
  if (await dopasuj.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dopasuj.click();
  }
}

/**
 * S9-10 (dług `S9-5-DLUG-E2E-CYKL`): WARSTWA TRAFIEŃ WRACA po powrocie na
 * schemat — dokładnie ta asercja, której brak blokował domknięcie cyklu.
 * Pomiar 2026-08-07 (żywa aplikacja, próbkowanie DOM co 1 s): po zapisie
 * KAŻDEGO kreatora warstwa jest z powrotem w t = 0 s (172/170/224 uchwytów),
 * więc opisany w rejestrze stan „`data-hit-klasa` = 0 przez 60 s" NIE
 * reprodukuje się na tej bazie (usunięty najpewniej wraz z odroczonym
 * przekierowaniem nawigacji — karta S9-3). Limit 60 s zostaje jako uczciwa
 * granica z pierwotnego pomiaru — regresja klasy „powrót na schemat po
 * operacji" zbije tę asercję.
 */
async function czekajNaWarstweTrafien(page: Page): Promise<void> {
  await expect
    .poll(async () => page.locator('[data-hit-klasa]').count(), { timeout: 60000 })
    .toBeGreaterThan(0);
}

/** Punkt NA geometrii uchwytu (środek długości ścieżki dla kresek, środek
 *  prostokąta dla pozostałych). Odcinek bywa ŁAMANY — środek jego prostokąta
 *  gabarytowego leży poza kreską i klik trafiłby w tło (pomiar S9-10). */
async function punktNaUchwycie(
  uchwyt: ReturnType<Page['locator']>,
): Promise<{ x: number; y: number }> {
  return uchwyt.evaluate((el) => {
    const geo = el as unknown as SVGGeometryElement;
    if (typeof geo.getTotalLength === 'function' && typeof geo.getPointAtLength === 'function') {
      const p = geo.getPointAtLength(geo.getTotalLength() / 2);
      const ctm = geo.getScreenCTM();
      if (ctm) {
        return { x: ctm.a * p.x + ctm.c * p.y + ctm.e, y: ctm.b * p.x + ctm.d * p.y + ctm.f };
      }
    }
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
}

async function prawyKlikWUchwyt(page: Page, uchwyt: ReturnType<Page['locator']>) {
  // Czekamy, aż uchwyt trafienia ma NIEZEROWY prostokąt na ekranie (sam byt
  // w DOM nie wystarcza: element poza `viewBox` jest nieklikalny).
  await expect
    .poll(async () => ((await uchwyt.boundingBox().catch(() => null))?.width ?? 0), { timeout: 60000 })
    .toBeGreaterThan(0);
  // Klik NATYWNY myszą w rzeczywistym punkcie ekranu zajmowanym przez uchwyt.
  // `locator.click` odrzuca cienkie kreski SVG jako „niewidoczne" (heurystyka
  // aktorowalności Playwrighta), a to jest właśnie ten kształt, który karta
  // S9-4 uczyniła klikalnym — więc celujemy myszą, nie omijamy ścieżki.
  const punkt = await punktNaUchwycie(uchwyt);
  await page.mouse.click(punkt.x, punkt.y, { button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible({ timeout: 15000 });
  return menu;
}

async function prawyKlikWObiekt(page: Page, klasa: string) {
  await wrocNaSchemat(page);
  await czekajNaWarstweTrafien(page);
  return prawyKlikWUchwyt(page, uchwytKlasy(page, klasa));
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

  /**
   * S9-10 — DŁUG `S9-5-DLUG-E2E-CYKL` DOMKNIĘTY (spłata, nie maskowanie):
   * `test.fixme` zdjęty po POMIARZE na żywej aplikacji (2026-08-07, baza
   * bf1884a1): po zapisie KAŻDEGO kreatora warstwa trafień wraca w t = 0 s
   * (próbkowanie DOM co 1 s; kolejno 172/170/224 uchwytów), więc blokada
   * „`data-hit-klasa` = 0 przez 60 s" z pierwotnego pomiaru (2026-08-06) już
   * nie występuje — przyczyna usunięta najpewniej kartą S9-3 (odroczone
   * przekierowanie nawigacji po biegu). Asercja `czekajNaWarstweTrafien`
   * przypina ten stan po KAŻDYM ogniwie (regresja klasy „powrót na schemat po
   * operacji" zbije ją wprost).
   *
   * DWIE LEKCJE POMIARU wpisane w metodę klikania (bez nich cykl NIE domyka
   * się z przyczyn POMIAROWYCH, nie produktowych):
   *  1. odcinek magistrali bywa ŁAMANY i pierwszy uchwyt klasy `tor` bywa
   *     PRZEWODEM POLA (kategoria aparat) — celujemy w uchwyt, którego
   *     `data-hit-owner-ref` jest gałęzią ISTNIEJĄCĄ w modelu, i klikamy w
   *     punkt NA geometrii ścieżki (`getPointAtLength`), nie w środek
   *     prostokąta gabarytowego;
   *  2. na poziomie pełnego szczegółu stacja jest ROZŁOŻONA na pola (klasa
   *     `stacja` nie występuje) — uchwytem całej stacji jest etykieta jej
   *     nazwy (`⟨stationRef⟩#name-row-…`), której temat menu to stacja
   *     (kotwica modelu po odcięciu sufiksu rysunkowego — S9-5).
   */
  test('pełny cykl budowy wyłącznie prawym klikiem: GPZ → ciąg → stacja na odcinku → ciąg dalej', async ({
    page,
    request,
  }) => {
    test.setTimeout(600_000);
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
    await wrocNaSchemat(page);
    await czekajNaWarstweTrafien(page);

    // ---- Ogniwo 2: ciąg główny z SYMBOLU GPZ na rysunku ---------------------
    const menuZrodla = await prawyKlikWObiekt(page, 'zrodlo');
    await expect(menuZrodla.getByTestId('sld-menu-continue-trunk')).toBeEnabled();
    await menuZrodla.getByTestId('sld-menu-continue-trunk').click();
    await zapiszMagistrale(page);
    await expect
      .poll(async () => (await pobierzEnm(request, caseId)).branches?.length ?? 0, { timeout: 60000 })
      .toBeGreaterThanOrEqual(1);
    await wrocNaSchemat(page);
    await czekajNaWarstweTrafien(page);

    // ---- Ogniwo 3: stacja na odcinku z menu ODCINKA ------------------------
    // Celujemy w TOR będący REALNĄ gałęzią modelu (lekcja pomiaru nr 1).
    const enmPoMagistrali = await pobierzEnm(request, caseId);
    const galazRef = (enmPoMagistrali.branches ?? []).find(
      (b) => b.type === 'cable' || b.type === 'line_overhead',
    )?.ref_id;
    expect(galazRef, 'model ma gałąź terenową po zapisie magistrali').toBeTruthy();
    await wrocNaSchemat(page);
    const uchwytOdcinka = page.locator(
      `[data-hit-klasa="tor"][data-hit-role="obrys"][data-hit-owner-ref="${galazRef}"]`,
    ).first();
    const menuOdcinka = await prawyKlikWUchwyt(page, uchwytOdcinka);
    await expect(menuOdcinka.getByTestId('sld-menu-insert-station')).toBeEnabled();
    await menuOdcinka.getByTestId('sld-menu-insert-station').click();
    await zapiszStacje(page, 1);
    await expect
      .poll(async () => (await pobierzEnm(request, caseId)).substations?.length ?? 0, { timeout: 120000 })
      .toBeGreaterThanOrEqual(2);
    await wrocNaSchemat(page);
    await czekajNaWarstweTrafien(page);

    // ---- Ogniwo 4: cykl domknięty — KOLEJNY odcinek ZE STACJI ---------------
    // Uchwytem stacji na pełnym szczególe jest etykieta jej nazwy (lekcja
    // pomiaru nr 2). Dostępność wejść budowy NA SKALĘ (54 stacje / 115
    // odcinków, próg 15) mierzy nadal sonda odbioru `menu_chain_probe` —
    // tutaj domykamy PĘTLĘ: stacja zapisana ogniwem 3 jest źródłem ogniwa 4.
    const enmPoStacji = await pobierzEnm(request, caseId);
    const stacjaRef = (enmPoStacji.substations ?? []).find(
      (s) => String(s.station_type ?? '').toLowerCase() !== 'gpz',
    )?.ref_id;
    expect(stacjaRef, 'model ma stację SN/nN po ogniwie 3').toBeTruthy();
    const galezieprzedOgniwem4 = (enmPoStacji.branches ?? []).length;
    const uchwytStacji = page.locator(
      `[data-hit-role="obrys"][data-hit-owner-ref^="${stacjaRef}#name-row"]`,
    ).first();
    const menuStacji = await prawyKlikWUchwyt(page, uchwytStacji);
    await expect(menuStacji.getByTestId('sld-menu-continue-trunk')).toBeEnabled();
    await menuStacji.getByTestId('sld-menu-continue-trunk').click();
    await zapiszMagistrale(page);
    await expect
      .poll(async () => (await pobierzEnm(request, caseId)).branches?.length ?? 0, { timeout: 60000 })
      .toBeGreaterThan(galezieprzedOgniwem4);
    await wrocNaSchemat(page);
    await czekajNaWarstweTrafien(page);

    // ---- Pomiar koncowy: model naprawde urosl ------------------------------
    const enm = await pobierzEnm(request, caseId);
    const stacjeSnNn = (enm.substations ?? []).filter(
      (s) => String(s.station_type ?? '').toLowerCase() !== 'gpz',
    );
    expect(stacjeSnNn.length).toBeGreaterThanOrEqual(1);
    expect((enm.branches ?? []).some((b) => b.type === 'cable' || b.type === 'line_overhead')).toBe(true);
  });
});

/**
 * Zapis kreatora ŹRÓDŁA. Kreator dobiera aparat pól liniowych GPZ z katalogu
 * pobieranego z backendu — dopóki katalog nie dojdzie, pole jest puste i zapis
 * (słusznie) odmawia. Czekamy więc na REALNĄ gotowość pola, zamiast klikać
 * w kółko: ślepe ponawianie zapisu maskowałoby defekt „kreator nigdy nie jest
 * gotowy".
 */
async function zapiszZrodlo(page: Page): Promise<void> {
  const kreator = page.getByTestId('mvd-kreator-zrodlo');
  await expect(kreator).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Sekcje i pola', exact: false }).first().click();
  const aparat = page.getByTestId('mvd-kreator-zrodlo-aparat-katalog');
  await expect(aparat).toBeVisible({ timeout: 60000 });
  await expect.poll(async () => (await aparat.inputValue()).trim(), { timeout: 60000 }).not.toBe('');
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
  // Typ odcinka z katalogu + długość — realne pola kreatora (bez nich backend
  // nie ma z czego policzyć odcinka, więc zapis słusznie odmawia).
  const katalog = page.getByTestId('mvd-kreator-magistrala-katalog');
  await expect(katalog).toBeVisible({ timeout: 30000 });
  await expect
    .poll(async () => katalog.locator('option').count(), { timeout: 60000 })
    .toBeGreaterThan(1);
  await katalog.selectOption({ index: 1 });
  // Długość jest na kroku „Parametry" — przechodzimy realnym przyciskiem kroku.
  await page.getByTestId('mvd-kreator-magistrala-dalej').click();
  const dlugosc = page.getByTestId('mvd-kreator-magistrala-dlugosc');
  await expect(dlugosc).toBeVisible({ timeout: 30000 });
  await dlugosc.fill('300');
  await expect(page.getByTestId('mvd-kreator-magistrala-zapisz')).toBeEnabled({ timeout: 30000 });
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
/**
 * WSKAZANIE ROZDZIELNICY SN — krok „Pola rozdzielnicy SN" kreatora stacji.
 *
 * AKTUALIZACJA KONTRAKTU OPERACJI (karta S3, 2026-08-14): pole SN jest
 * jednostką funkcjonalną KONKRETNEJ rodziny wyrobu, więc kreator NIE dobiera
 * już pól „z pakietu producenta" bez wskazanej rodziny — wcześniej rozdzielnica
 * mogła powstać z kart dwóch różnych serii naraz. Bez rodziny krok świadomie
 * nie komponuje pól, `czyRozdzielnicaKompletna` jest fałszem i zapis (słusznie)
 * odmawia. Ten helper przechodzi więc REALNĄ ścieżką projektanta: wskazuje
 * rodzinę, a dla rodzin o torze blokowym (RMU) także blok fabryczny, z którego
 * wynika sekwencja jednostek.
 *
 * Bez zaszywania referencji wyrobu: bierzemy PIERWSZĄ WYBIERALNĄ pozycję listy
 * (rodziny bez potwierdzonej karty katalogowej są widoczne, ale wyłączone),
 * więc kolejna transza katalogu nie łamie specu. Ta sama metoda co w
 * `e2e/kreator-stacji-max.spec.ts`.
 */
async function wskazRozdzielnice(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Pola rozdzielnicy SN', exact: false }).first().click();

  const producent = page.getByTestId('mvd-kreator-stacja-producent');
  await expect(producent.locator('option')).not.toHaveCount(1, { timeout: 30000 });

  const rodzina = page.getByTestId('mvd-kreator-stacja-rodzina');
  await expect(rodzina.locator('option')).not.toHaveCount(1, { timeout: 30000 });
  const rodzinaRef = await rodzina
    .locator('option:not([disabled]):not([value=""])')
    .first()
    .getAttribute('value');
  expect(rodzinaRef, 'katalog musi mieć rodzinę, na której wolno zbudować rozdzielnicę').toBeTruthy();
  await rodzina.selectOption(rodzinaRef!);
  await expect(rodzina).toHaveValue(rodzinaRef!);

  // TOR BLOKOWY (RMU): pola wynikają z bloku fabrycznego, nie ze złożenia
  // pojedynczych pól — bez bloku krok pozostaje niedomknięty. Tor modułowy nie
  // ma tego pola, więc gałąź jest warunkowa, a nie „na wszelki wypadek".
  const blok = page.getByTestId('mvd-kreator-stacja-blok');
  if (await blok.isVisible({ timeout: 5000 }).catch(() => false)) {
    await expect(blok.locator('option')).not.toHaveCount(1, { timeout: 30000 });
    const blokRef = await blok
      .locator('option:not([disabled]):not([value=""])')
      .first()
      .getAttribute('value');
    expect(blokRef, 'rodzina RMU musi mieć w katalogu blok fabryczny').toBeTruthy();
    await blok.selectOption(blokRef!);
    await expect(blok).toHaveValue(blokRef!);
  }

  // Dowód, że wskazanie realnie skomponowało rozdzielnicę: pierwszy wiersz pola.
  await expect(page.getByTestId('mvd-kreator-stacja-pole-wiersz-1')).toBeVisible({
    timeout: 30000,
  });
}

async function zapiszStacje(page: Page, numer: number): Promise<void> {
  const kreator = page.getByTestId('mvd-kreator-stacja');
  await expect(kreator).toBeVisible({ timeout: 30000 });

  const wybor = page.getByTestId('mvd-kreator-stacja-szablon-wybor');
  await expect(wybor).toBeVisible({ timeout: 30000 });
  // S9-10: lista szablonów ładuje się ASYNCHRONICZNIE po pokazaniu pola —
  // odczyt `.all()` zaraz po `toBeVisible` bywał wyścigiem (pomiar: 1 opcja
  // w chwili odczytu, komplet ułamek sekundy później). Czekamy na realny
  // stan zamiast liczyć na szczęśliwy timing.
  await expect
    .poll(async () => wybor.locator('option').count(), { timeout: 60000 })
    .toBeGreaterThan(1);
  await wybor.selectOption({ index: 1 });
  await page.getByTestId('mvd-kreator-stacja-szablon-zastosuj').click();
  await expect(page.getByTestId('mvd-kreator-stacja-szablon-zastosowany')).toBeVisible({
    timeout: 30000,
  });

  const nazwa = page.getByTestId('mvd-kreator-stacja-nazwa');
  if (await nazwa.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nazwa.fill(`Stacja z kanwy ${String(numer).padStart(2, '0')}`);
  }

  await wskazRozdzielnice(page);

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
