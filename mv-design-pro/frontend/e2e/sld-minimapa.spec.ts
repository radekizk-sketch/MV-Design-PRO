/**
 * MINIMAPA (nawigator kanwy) — bramka karty K11-B (dyrektywa właściciela z
 * oceny ekranu 2/10: „stały, mały podgląd CAŁEJ sieci z prostokątem bieżącego
 * kadru kamery; klik/przeciągnięcie w minimapie przenosi kadr").
 *
 * Mierzy LICZBOWO na REALNYM backendzie, wyłącznie klikami NATYWNYMI
 * (zero syntetycznych `dispatchEvent` — CLAUDE.md §5):
 *  1. nawigator jest ZWINIĘTY domyślnie i rozwija się z doku widoku,
 *  2. prostokąt kadru ODPOWIADA viewBox kamery liczbowo: zoom kamery o
 *     czynnik k zmniejsza prostokąt kadru o TEN SAM czynnik (tolerancja),
 *  3. KLIK w nawigatorze PRZENOSI kadr na wskazany punkt — środek prostokąta
 *     kadru ląduje w klikniętym punkcie, viewBox się przesuwa, a SKALA
 *     (szerokość/wysokość viewBox) pozostaje BEZ ZMIAN,
 *  4. PRZECIĄGNIĘCIE prostokąta kadru przesuwa kadr w sposób ciągły,
 *  5. zwinięcie chowa nawigator (dok zostaje).
 *
 * Sieć: 3 stacje SN/nN na magistrali (wymóg karty „sieć 3+ stacji") —
 * wzorzec seedu 1:1 z e2e/sld-first-uklad.spec.ts.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const FIELD_APPARATUS_ID = 'sw-cb-abb-vd4-17kv-630a';
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
        idempotency_key: `e2e-minimapa-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
    timeout: 30000,
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
  const projectName = `E2E Nawigator SLD ${suffix}`;
  const caseName = `Zakres nawigatora ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Bramka K11-B: nawigator kanwy',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
    timeout: 30000,
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };

  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: project.id, name: caseName, description: '', config: {}, set_active: true },
    timeout: 30000,
  });
  expect(caseResponse.ok()).toBeTruthy();
  const caseId = ((await caseResponse.json()) as { id: string }).id;

  await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });
  let op: DomainOpResponse = {};
  for (const [idx, length] of [400, 350, 300, 250].entries()) {
    op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }

  // TRZY stacje: każde wstawienie DZIELI odcinek, więc kolejne wstawienie
  // celuje w ostatni (wolny) kawałek magistrali odczytany z odpowiedzi.
  for (let i = 0; i < 3; i++) {
    const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
    expect(segmentRefs.length).toBeGreaterThan(0);
    op = await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
      // B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
      field_apparatus_catalog_ref: FIELD_APPARATUS_ID,
      segment_id: segmentRefs[segmentRefs.length - 1],
      station_type: 'B',
      insert_at: { value: 0.5 },
      station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
      // KOMPLETNOSC-POLA-TR (klasa A): stacja SN/nN Z transformatorem — pole roli
    // 'TR' dopisane, bo realna rozdzielnia realizuje odejscie do transformatora
    // polem transformatorowym. Kreator stacji tworzy je domyslnie, wiec fixture
    // bez niego opisywal siec, ktorej kreator by nie zbudowal.
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
      transformer: { create: true, catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID) },
    });
  }

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
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await page.getByRole('button', { name: 'Schemat (SLD)' }).first().click();
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible({ timeout: 30000 });
  // Kamera fituje po pomiarze kontenera — czekamy na stabilny kadr.
  await page.waitForTimeout(800);
}

interface Kadr {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Prostokąt kadru odczytany z nawigatora (piksele panelu, BEZ przycięcia). */
async function ramkaNawigatora(page: Page): Promise<Kadr> {
  const frame = page.getByTestId('sld-v3-minimap-frame');
  const [x, y, width, height] = await Promise.all([
    frame.getAttribute('data-frame-x'),
    frame.getAttribute('data-frame-y'),
    frame.getAttribute('data-frame-width'),
    frame.getAttribute('data-frame-height'),
  ]);
  return { x: Number(x), y: Number(y), width: Number(width), height: Number(height) };
}

/** viewBox kanwy jako prostokąt świata. */
async function viewBoxKamery(page: Page): Promise<Kadr> {
  const vb = (await page.locator('svg[data-testid="sld-canvas-v3"]').getAttribute('viewBox')) ?? '';
  const [x, y, width, height] = vb.trim().split(/\s+/).map(Number);
  return { x, y, width, height };
}

test('nawigator: rozwijanie z doku, prostokąt kadru zgodny z viewBox, klik przenosi kadr bez zmiany skali (bramka K11-B)', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);
  await otworzSchemat(page, request);

  // (1) Domyślnie ZWINIĘTY — schemat nie traci miejsca.
  await expect(page.getByTestId('sld-v3-minimap-panel')).toHaveCount(0);
  const przelacznik = page.getByTestId('sld-v3-minimap-toggle');
  await expect(przelacznik).toBeVisible();
  // Przełącznik żyje w doku widoku, obok legendy (jedno miejsce sterowania widokiem).
  await expect(page.getByTestId('sld-v3-view-dock').getByTestId('sld-v3-minimap-toggle')).toBeVisible();

  await przelacznik.click();
  await expect(page.getByTestId('sld-v3-minimap-panel')).toBeVisible();
  const panel = page.getByTestId('sld-v3-minimap-svg');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('sld-v3-minimap-frame')).toBeVisible();

  // (2) LICZBOWA zgodność prostokąta kadru z viewBox: zoom kamery czynnikiem k
  // musi zmniejszyć prostokąt kadru DOKŁADNIE tym samym czynnikiem (prostokąt
  // jest projekcją viewBox, nie osobnym stanem).
  //
  // Porównanie ma sens WYŁĄCZNIE w obrębie jednego świata LOD (świat wyższego
  // poziomu ma własny bbox, więc rzut na minimapę zmienia proporcję razem z
  // poziomem). Dlatego najpierw wjeżdżamy na poziom NAJWYŻSZY (L2) — nad nim
  // nie ma czego przełączyć, więc kolejny zoom-in poziomu nie ruszy i pomiar
  // jest uczciwy. Pętla przy okazji dowodzi, że drabina LOD działa na żywej
  // aplikacji (K11-B §0.2: reprezentacja przełącza się z zoomem).
  const canvas = page.locator('svg[data-testid="sld-canvas-v3"]');
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const srodekKanwy = {
    x: canvasBox!.x + canvasBox!.width / 2,
    y: canvasBox!.y + canvasBox!.height / 2,
  };
  await page.mouse.move(srodekKanwy.x, srodekKanwy.y);
  let poziom = await canvas.getAttribute('data-scene-lod');
  for (let krok = 0; krok < 12 && poziom !== '2'; krok++) {
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(150);
    poziom = await canvas.getAttribute('data-scene-lod');
  }
  expect(poziom).toBe('2');

  const ramkaPrzedZoom = await ramkaNawigatora(page);
  const vbPrzedZoom = await viewBoxKamery(page);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(400);
  const ramkaPoZoom = await ramkaNawigatora(page);
  const vbPoZoom = await viewBoxKamery(page);

  // Poziom szczegółu bez zmian (L2 to szczyt) ⇒ porównanie w jednym świecie.
  expect(await canvas.getAttribute('data-scene-lod')).toBe('2');
  // Zoom faktycznie zawęził kadr…
  expect(vbPoZoom.width).toBeLessThan(vbPrzedZoom.width);
  // …i prostokąt nawigatora zawęził się w TEJ SAMEJ proporcji (tolerancja 2%
  // pokrywa zaokrąglenia px).
  const stosunekViewBox = vbPoZoom.width / vbPrzedZoom.width;
  const stosunekRamki = ramkaPoZoom.width / ramkaPrzedZoom.width;
  expect(Math.abs(stosunekRamki - stosunekViewBox)).toBeLessThan(0.02);
  const stosunekViewBoxY = vbPoZoom.height / vbPrzedZoom.height;
  const stosunekRamkiY = ramkaPoZoom.height / ramkaPrzedZoom.height;
  expect(Math.abs(stosunekRamkiY - stosunekViewBoxY)).toBeLessThan(0.02);

  // (3) KLIK w nawigatorze (natywny) przenosi kadr na wskazany punkt.
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();
  const cel = {
    x: panelBox!.x + panelBox!.width * 0.78,
    y: panelBox!.y + panelBox!.height * 0.42,
  };
  const vbPrzedKlikiem = await viewBoxKamery(page);
  await page.mouse.click(cel.x, cel.y);
  await page.waitForTimeout(400);
  const vbPoKliku = await viewBoxKamery(page);
  const ramkaPoKliku = await ramkaNawigatora(page);

  // Kadr się PRZESUNĄŁ…
  expect(Math.abs(vbPoKliku.x - vbPrzedKlikiem.x)).toBeGreaterThan(1);
  // …a SKALA jest BEZ ZMIAN (nawigator nawiguje, nie zoomuje).
  expect(vbPoKliku.width).toBeCloseTo(vbPrzedKlikiem.width, 6);
  expect(vbPoKliku.height).toBeCloseTo(vbPrzedKlikiem.height, 6);

  // Środek prostokąta kadru ląduje DOKŁADNIE w klikniętym punkcie panelu —
  // to jest liczbowe powiązanie „prostokąt kadru ↔ viewBox ↔ wskazanie".
  const srodekRamkiX = panelBox!.x + ramkaPoKliku.x + ramkaPoKliku.width / 2;
  const srodekRamkiY = panelBox!.y + ramkaPoKliku.y + ramkaPoKliku.height / 2;
  expect(Math.abs(srodekRamkiX - cel.x)).toBeLessThan(2);
  expect(Math.abs(srodekRamkiY - cel.y)).toBeLessThan(2);

  // (4) PRZECIĄGNIĘCIE prostokąta kadru przesuwa kadr w sposób ciągły.
  const celPrzeciagniecia = {
    x: panelBox!.x + panelBox!.width * 0.22,
    y: panelBox!.y + panelBox!.height * 0.6,
  };
  await page.mouse.move(srodekRamkiX, srodekRamkiY);
  await page.mouse.down();
  await page.mouse.move(celPrzeciagniecia.x, celPrzeciagniecia.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const vbPoPrzeciagnieciu = await viewBoxKamery(page);
  const ramkaPoPrzeciagnieciu = await ramkaNawigatora(page);
  expect(vbPoPrzeciagnieciu.x).not.toBeCloseTo(vbPoKliku.x, 3);
  expect(vbPoPrzeciagnieciu.width).toBeCloseTo(vbPoKliku.width, 6);
  expect(
    Math.abs(panelBox!.x + ramkaPoPrzeciagnieciu.x + ramkaPoPrzeciagnieciu.width / 2 - celPrzeciagniecia.x),
  ).toBeLessThan(2);

  // (5) Zwinięcie chowa nawigator; dok i przełącznik zostają.
  await przelacznik.click();
  await expect(page.getByTestId('sld-v3-minimap-panel')).toHaveCount(0);
  await expect(page.getByTestId('sld-v3-minimap-toggle')).toBeVisible();
});

test('powłoka mieści się w oknie: doki dolne kanwy są OSIĄGALNE (naprawa długu zastanego, K11-B)', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);
  await otworzSchemat(page, request);

  // DLACZEGO TEN TEST ISTNIEJE (CLAUDE.md §5 „test maskujący defekt produktu"):
  // przy budowie nawigatora okazało się, że powłoka ROSŁA do wysokości treści
  // (brak definitywnej wysokości korzenia + element siatki `.mvd-center` bez
  // `min-height: 0`), a `body { overflow: hidden }` odbierał przewijanie.
  // Zmierzone przed naprawą (okno 1600×900): dokument 1124 px, kanwa SLD
  // ucięta o 179 px, doki „Dowody inżynierskie" i „Warstwy" w całości poniżej
  // krawędzi okna — funkcje istniały, ale były NIEKLIKALNE, i żaden test tego
  // nie widział. Ta asercja pilnuje, żeby regresja nie wróciła niezauważona.
  const pomiar = await page.evaluate(() => {
    const r = (sel: string) => {
      const el = document.querySelector(sel);
      return el ? el.getBoundingClientRect().bottom : null;
    };
    return {
      okno: window.innerHeight,
      dokument: document.documentElement.scrollHeight,
      kanwaDol: r('svg[data-testid="sld-canvas-v3"]'),
      dowodyDol: r('[data-testid="sld-v3-proof-packs-toggle"]'),
      warstwyDol: r('[data-testid="sld-v3-layer-panel-toggle"]'),
    };
  });
  // Dokument nie wystaje poza okno (przewinąć i tak się nie da).
  expect(pomiar.dokument).toBeLessThanOrEqual(pomiar.okno + 1);
  // Kanwa i OBA doki dolne w całości w oknie.
  expect(pomiar.kanwaDol).not.toBeNull();
  expect(pomiar.kanwaDol!).toBeLessThanOrEqual(pomiar.okno + 1);
  expect(pomiar.dowodyDol).not.toBeNull();
  expect(pomiar.dowodyDol!).toBeLessThanOrEqual(pomiar.okno);
  expect(pomiar.warstwyDol).not.toBeNull();
  expect(pomiar.warstwyDol!).toBeLessThanOrEqual(pomiar.okno);

  // Osiągalność DOWODZONA klikiem natywnym, nie samą geometrią.
  await page.getByTestId('sld-v3-proof-packs-toggle').click();
  await expect(page.getByTestId('sld-v3-proof-packs-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.getByTestId('sld-v3-layer-panel-toggle').click();
  await expect(page.getByTestId('sld-v3-layer-toggle-panel')).toBeVisible();
});
