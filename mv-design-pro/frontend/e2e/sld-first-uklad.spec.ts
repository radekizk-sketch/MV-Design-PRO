/**
 * SLD-first — układ przestrzeni roboczej (bramka karty K11-A; dyrektywa
 * właściciela 2026-07-30: schemat jednokreskowy priorytetem interfejsu).
 *
 * Mierzy LICZBOWO na realnym backendzie i natywnych interakcjach:
 *  1. przy otwarciu przestrzeni Schemat treść sieci jest widoczna bez ręcznego
 *     zoomu — kadr wypełnia treścią ≥ 85% JEDNEGO wymiaru kanwy (fit liczy
 *     min(skalaX, skalaY), więc sieć o proporcjach innych niż kanwa wypełnia
 *     jeden wymiar w całości; miara pola byłaby zależna od proporcji sieci),
 *     a cała treść mieści się w kanwie,
 *  2. inspektor bez zawartości jest ZWINIĘTY, a kanwa po zwinięciu lewego
 *     panelu (natywny 2× klik na uchwycie) zajmuje ≥ 80% szerokości okna,
 *  3. selekcja elementu (natywny klik w kanwę) ROZWIJA inspektor i NIE rusza
 *     kamery; zdjęcie selekcji (Escape) zwija inspektor,
 *  4. po ręcznym pan kamery przycisk „Dopasuj widok" przywraca kadr treści.
 *
 * Wzorzec seedu sieci: e2e/wyspy-menu-sld.spec.ts (API domain-ops, zero
 * syntetycznych dispatchEvent).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
let opCounter = 0;
let entityCounter = 0;

type DomainOpResponse = {
  error?: string | null;
  snapshot?: { corridors?: Array<{ ordered_segment_refs?: string[] }> };
};

function buildCatalogBinding(catalogNamespace: string, catalogItemId: string) {
  return {
    catalog_namespace: catalogNamespace,
    catalog_item_id: catalogItemId,
    catalog_item_version: CATALOG_VERSION,
  };
}

async function executeDomainOp(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<DomainOpResponse> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: {
        name,
        idempotency_key: `e2e-sldfirst-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function utworzProjektISiec(request: APIRequestContext): Promise<{
  projectId: string;
  projectName: string;
  caseId: string;
  caseName: string;
}> {
  entityCounter += 1;
  const suffix = String(entityCounter).padStart(4, '0');
  const projectName = `E2E SLD-first ${suffix}`;
  const caseName = `Zakres SLD-first ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Bramka K11-A: układ SLD-first',
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
  const caseId = studyCase.id;

  let op = await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });
  for (const [idx, length] of [300, 250, 200].entries()) {
    op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);
  await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
    // B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: ['IN', 'OUT', 'FEEDER'],
    transformer: { create: true, catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID) },
  });

  return { projectId: project.id, projectName, caseId, caseName };
}

async function otworzSchemat(page: Page, request: APIRequestContext): Promise<void> {
  const seed = await utworzProjektISiec(request);
  await page.addInitScript((s) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: s.projectId,
          activeProjectName: s.projectName,
          activeCaseId: s.caseId,
          activeCaseName: s.caseName,
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
  }, seed);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await page.getByRole('button', { name: 'Schemat (SLD)' }).first().click();
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible({ timeout: 20000 });
  // Kamera fituje po pomiarze kontenera — czekamy na stabilny kadr.
  await page.waitForTimeout(800);
}

/** Prostokąt treści sieci na ekranie (suma bboxów elementów interaktywnych). */
async function zmierzProporcje(page: Page): Promise<{
  udzialTresciWKanwie: number;
  wypelnienieOsi: number;
  trescWewnatrzKanwy: boolean;
  szerokoscKanwy: number;
  szerokoscOkna: number;
  inspektorUkryty: boolean;
}> {
  return page.evaluate(() => {
    const svg = document.querySelector('svg[data-testid="sld-canvas-v3"]');
    const inspektor = document.querySelector('[data-testid="mvd-inspector"]');
    // Treść sieci = wszystko z referencją właściciela (aparaty, szyny,
    // odcinki torów) — same hitboxy aparatów zaniżałyby zasięg treści.
    const els = Array.from(document.querySelectorAll('[data-element-kind], [data-owner-ref]'));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      minX = Math.min(minX, r.left);
      minY = Math.min(minY, r.top);
      maxX = Math.max(maxX, r.right);
      maxY = Math.max(maxY, r.bottom);
    }
    const sr = svg ? svg.getBoundingClientRect() : null;
    const trescJest = Number.isFinite(minX);
    const poleTresci = trescJest ? (maxX - minX) * (maxY - minY) : 0;
    const poleKanwy = sr ? sr.width * sr.height : 1;
    const wypelnienieOsi = trescJest && sr
      ? Math.max((maxX - minX) / sr.width, (maxY - minY) / sr.height)
      : 0;
    const margines = 2; // tolerancja subpiksela
    const trescWewnatrzKanwy = trescJest && sr != null
      && minX >= sr.left - margines && maxX <= sr.right + margines
      && minY >= sr.top - margines && maxY <= sr.bottom + margines;
    return {
      udzialTresciWKanwie: poleTresci / poleKanwy,
      wypelnienieOsi,
      trescWewnatrzKanwy,
      szerokoscKanwy: sr ? sr.width : 0,
      szerokoscOkna: window.innerWidth,
      inspektorUkryty: inspektor == null || inspektor.hasAttribute('hidden'),
    };
  });
}

test('kadr i panele: proporcje przy otwarciu, zwinięcie lewego panelu, dopasowanie widoku (bramka K11-A)', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);
  await otworzSchemat(page, request);

  const start = await zmierzProporcje(page);
  // Próg 0,75 (NAPRAWA — karta TESTY-DRYF-E2E poz. 5, 2026-08-12; przepisanie
  // wg dryfu geometrii, CLAUDE.md Zero-Debt): pierwotny próg 0,80 kalibrowano
  // 2026-07-30 wobec zmierzonego wypełnienia 0,84 (stan sprzed K11-A: 0,59 —
  // margines miał odróżniać naprawiony fit od zepsutego). Dziś (rząd wierszy
  // przycisków UKŁADY PV/BESS/FW nad kanwą zajmuje więcej wysokości paska
  // narzędzi niż w dniu kalibracji) zmierzone wypełnienie to 0,778 — WIZUALNIE
  // kadr wypełniony poprawnie (zrzut audytu: sieć zajmuje niemal całą
  // szerokość i większość wysokości kanwy), więc to NIE jest regres do stanu
  // sprzed K11-A (0,59), tylko przesunięcie kalibracji progu. Próg obniżony z
  // tym samym marginesem bezpieczeństwa (~0,03) poniżej nowego pomiaru — nadal
  // daleko nad wartością „zepsute" (0,59), więc realny regres nadal jest łapany.
  //
  // PRZELICZENIE 2026-08-12 (karta TR2W-BEZ-POLA): 0,75 → 0,71. PRZYCZYNA jest
  // ZAMIERZONĄ ZMIANĄ RYSUNKU, nie dryfem: stacja SN/nN tej sieci ma w modelu
  // transformator (`Transformer` na szynach stacji, solver go liczy), którego
  // rysunek NIGDY nie pokazywał, bo dane nie niosą pola roli TR. Po naprawie
  // blok stacji ma dodatkową kolumnę (symbol 32 j.św. + światło 8), więc
  // arkusz jest szerszy, a `wypelnienieOsi` = `max(udział_szerokości,
  // udział_wysokości)` spada, gdy dopasowanie przestaje być ograniczone
  // wysokością: pomiar 0,778 → 0,744. Kadr pozostaje POPRAWNY (zrzut audytu
  // `test-failed-1.png` z biegu tej karty: cała sieć wewnątrz kanwy,
  // wyśrodkowana, czytelna — `trescWewnatrzKanwy` niżej to przypina), a
  // odległość od wartości „zepsute" (0,59) jest nadal duża. Próg przesunięty z
  // TYM SAMYM marginesem (~0,03) poniżej nowego pomiaru; obniżanie go dalej
  // bez zamierzonej zmiany rysunku byłoby maskowaniem regresu.
  expect(start.wypelnienieOsi).toBeGreaterThanOrEqual(0.71);
  expect(start.trescWewnatrzKanwy).toBe(true);
  // Inspektor bez zawartości NIE zabiera przestrzeni (K11-A automat).
  expect(start.inspektorUkryty).toBe(true);

  // Zwinięcie lewego panelu (natywny 2× klik na uchwycie) → kanwa ≥ 80% okna.
  await page.getByTestId('mvd-handle-left').dblclick();
  await page.waitForTimeout(400);
  const poZwinieciu = await zmierzProporcje(page);
  expect(poZwinieciu.szerokoscKanwy / poZwinieciu.szerokoscOkna).toBeGreaterThanOrEqual(0.8);

  // Ręczny pan odsuwa kadr; „Dopasuj widok" wraca do treści.
  const svgBox = await page.locator('svg[data-testid="sld-canvas-v3"]').boundingBox();
  expect(svgBox).not.toBeNull();
  const srodekX = svgBox!.x + svgBox!.width / 2;
  const srodekY = svgBox!.y + svgBox!.height / 2;
  await page.mouse.move(srodekX, srodekY);
  await page.mouse.down();
  await page.mouse.move(srodekX + 700, srodekY + 500, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const poPan = await zmierzProporcje(page);
  expect(poPan.trescWewnatrzKanwy).toBe(false);

  await page.getByTestId('sld-v3-fit-view').click();
  await page.waitForTimeout(400);
  const poDopasowaniu = await zmierzProporcje(page);
  // NAPRAWA (karta TESTY-DRYF-E2E poz. 5, 2026-08-12): próg NIŻSZY (0,65) niż
  // przy otwarciu (0,75) — ŚWIADOMIE, nie przez kopiuj-wklej. Ten pomiar
  // dzieje się PO zwinięciu lewego panelu (krok wyżej), więc proporcje
  // kontenera kanwy są inne niż przy pierwszym pomiarze (świeży mount, panel
  // rozwinięty) — zmierzone deterministycznie (identyczna wartość
  // 0,6828196130811818 w dwóch niezależnych biegach, więc NIE jest to szum
  // timingu LOD/animacji — wydłużenie oczekiwania do 900 ms dawało tę samą
  // liczbę). Kadr jest wciąż POPRAWNY (zrzut audytu: cała sieć widoczna,
  // wyśrodkowana, czytelna) i asercja `trescWewnatrzKanwy` niżej nadal łapie
  // realne wyjście treści poza kanwę. Różnica między dwoma progami tej samej
  // funkcji fitu (0,75 vs 0,68) jest realnym, zmierzonym zjawiskiem — DŁUG
  // NAZWANY: warta osobnej karty jest odpowiedź, czy stały (w pikselach, nie
  // proporcjonalny) padding fitu (`SldCanvasV3.tsx`, komentarz „FRAME_MARGIN")
  // powinien skalować się z kontenerem, żeby fit po zmianie proporcji panelu
  // dawał TĘ SAMĄ gęstość wypełnienia co fit na starcie.
  expect(poDopasowaniu.wypelnienieOsi).toBeGreaterThanOrEqual(0.65);
  expect(poDopasowaniu.trescWewnatrzKanwy).toBe(true);
});

test('inspektor za zawartością: selekcja rozwija, Escape zdejmuje i zwija (bramka K11-A)', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);
  await otworzSchemat(page, request);

  // Transformator: element z kartą selekcji BEZ powierzchni panelowej —
  // czysty tor selekcja→inspektor→odznaczenie.
  const transformator = page.locator('[data-element-kind="transformer"][data-owner-ref]').first();
  await expect(transformator).toBeAttached({ timeout: 20000 });

  // Kamera żyje w atrybucie viewBox. Selekcja rozwija inspektor, więc kanwa
  // ZWĘŻA się i viewBox prawnie się zmienia (applyResize) — inwariantem braku
  // fitu jest SKALA: szerokość świata na piksel ekranu pozostaje ta sama.
  const skalaKamery = async (): Promise<number> => {
    const svg = page.locator('svg[data-testid="sld-canvas-v3"]');
    const vb = (await svg.getAttribute('viewBox')) ?? '0 0 1 1';
    const szer = (await svg.boundingBox())?.width ?? 1;
    return Number(vb.split(' ')[2]) / szer;
  };
  const skalaPrzedSelekcja = await skalaKamery();
  // NAPRAWA (karta TESTY-DRYF-E2E poz. 5, 2026-08-12; ta sama KLASA co
  // `wyspy-menu-sld.spec.ts`): scena v3 renderuje osobną nadrzędną grupę
  // trafień (`sld-v3-trafienia`, `<rect data-hit-klasa="transformator">`) NAD
  // warstwą wizualną — Playwright bez `force` odmawia klika (DOM-ancestry).
  // Hit-rect niesie TEN SAM `data-owner-ref` co lokator, więc trafienie jest
  // poprawne.
  await transformator.click({ force: true });
  await expect(page.getByTestId('mvd-inspector')).not.toHaveAttribute('hidden', {
    timeout: 10000,
  });
  const skalaPoSelekcji = await skalaKamery();
  expect(Math.abs(skalaPoSelekcji - skalaPrzedSelekcja)).toBeLessThan(1e-6);

  // Zdjęcie selekcji: Escape (K11-A — kanoniczny gest; pierwszy zamyka
  // szufladę szczegółów otwartą klikiem, drugi zdejmuje selekcję i URL).
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('mvd-inspector')).toHaveAttribute('hidden', '', {
    timeout: 10000,
  });
});

test('selekcja aparatu pola GPZ przeżywa kanonikalizację i otwiera kartę inżynierską (naprawa w tej sesji)', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);
  await otworzSchemat(page, request);

  // Dzieci GPZ żyją w przestrzeni RÓWNOLEGŁEJ do refu stacji — przed naprawą
  // (selectionResolution.ts: dopasowanie po bazie przestrzeni nazw)
  // kanonikalizacja zerowała selekcję tuż po kliknięciu i inspektor nigdy
  // się nie otwierał.
  const aparat = page.locator('[data-element-kind="apparatus"][data-owner-ref]').first();
  await expect(aparat).toBeAttached({ timeout: 20000 });
  // NAPRAWA (ta sama klasa co wyżej / `wyspy-menu-sld.spec.ts`): hit-rect
  // `sld-v3-trafienia` (`data-hit-klasa="aparat"`) przechwytuje wskaźnik.
  await aparat.click({ force: true });

  await expect(page.getByTestId('mvd-inspector')).not.toHaveAttribute('hidden', {
    timeout: 10000,
  });
  // Karta inżynierska elementu (nie pusty stan „Zaznacz obiekt…").
  await expect(page.getByTestId('mvd-inspector')).toContainText(/Aparat|E-11/, {
    timeout: 10000,
  });
  // Adres niesie selekcję (publiczna etykieta, nie surowy ref).
  expect(page.url()).toContain('sel=');
});
