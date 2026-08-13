/**
 * KD-11 — TOŻSAMOŚĆ ELEMENTÓW NA RYSUNKU (bramka 5 karty).
 *
 * Regresja użytkowa z odbioru KD-8: po podniesieniu progu czytelności opisów
 * rysunek rozwiniętego GPZ przy kadrze „Dopasuj widok" nie niósł ŻADNEGO
 * podpisu („Ukryto 35 opisów"). Ten spec mierzy naprawę na ŻYWEJ aplikacji i
 * REALNYM backendzie, wyłącznie ścieżką użytkownika (kliki natywne):
 *
 *  1. sieć budowana operacjami domenowymi backendu (GPZ 15 kV + magistrala
 *     kablowa z trzema stacjami SN/nN) — ta sama droga danych, co specy KD-5/KD-8;
 *  2. blok GPZ rozwijany KLIKIEM w blok na przeglądzie;
 *  3. kadr ustawiany przyciskiem „Dopasuj widok";
 *  4. asercja: KAŻDA nazwa stacji Z MODELU (odczytana z API `GET /api/cases/
 *     {id}/enm`, nie z literału UI) ma na rysunku podpis tożsamości — pełny albo
 *     skrócony z wielokropkiem wg kanonicznej reguły skracania; zero podpisów
 *     tożsamości porzuconych; wskaźnik „Ukryto N opisów" dotyczy WYŁĄCZNIE
 *     danych szczegółowych;
 *  5. przybliżenie kółkiem ⇒ dane szczegółowe wracają (licznik ukrytych maleje).
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

interface Seed {
  projectId: string;
  projectName: string;
  caseId: string;
  caseName: string;
}

function catalogBinding(namespace: string, itemId: string) {
  return { catalog_namespace: namespace, catalog_item_id: itemId, catalog_item_version: CATALOG_VERSION };
}

async function domainOp(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<DomainOpResponse> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: { name, idempotency_key: `e2e-kd11-${name}-${String(++opCounter).padStart(4, '0')}`, payload },
    },
    timeout: 30000,
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function zbudujSiec(request: APIRequestContext): Promise<Seed> {
  entityCounter += 1;
  const suffix = String(entityCounter).padStart(4, '0');
  const projectName = `E2E KD-11 tozsamosc ${suffix}`;
  const caseName = `Przeglad sieci ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Bramka KD-11: tozsamosc elementow na rysunku',
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

  await domainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: catalogBinding('ZRODLO_SN', SOURCE_ID),
  });
  let op: DomainOpResponse = {};
  for (const [idx, length] of [400, 350, 300, 250].entries()) {
    op = await domainOp(request, caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: catalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  for (let i = 0; i < 3; i++) {
    const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
    expect(segmentRefs.length).toBeGreaterThan(0);
    op = await domainOp(request, caseId, 'insert_station_on_segment_sn', {
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
      transformer: { create: true, catalog_binding: catalogBinding('TRAFO_SN_NN', TRAFO_ID) },
    });
  }
  return { projectId: project.id, projectName, caseId, caseName };
}

/**
 * TOŻSAMOŚCI STACJI Z MODELU (nie z literałów UI) — źródło prawdy asercji.
 * Dla każdej stacji zwracamy warianty, którymi rysunek wolno ją podpisać:
 * pełną nazwę (poziomy szczegółu) oraz KOD wyprowadzony z tej nazwy tą samą
 * regułą, co adapter (`stationCodeFromName`: „S" + 2–3 cyfry występujące w
 * nazwie) — na poziomie przeglądowym pasmo nazw niesie kod, nie pełną nazwę.
 * Oba warianty pochodzą z DANYCH modelu, nie z tekstu wpisanego w test.
 */
async function tozsamosciStacjiZModelu(
  request: APIRequestContext,
  caseId: string,
): Promise<readonly (readonly string[])[]> {
  const response = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`, { timeout: 30000 });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    enm?: { substations?: Array<{ name?: string | null }> };
    substations?: Array<{ name?: string | null }>;
  };
  const substations = body.enm?.substations ?? body.substations ?? [];
  const warianty = substations
    .map((s) => (s.name ?? '').trim())
    .filter((n) => n.length > 0)
    .map((nazwa) => {
      const kod = nazwa.match(/\bS\d{2,3}\b/i)?.[0].toUpperCase();
      return kod ? [nazwa, kod] : [nazwa];
    });
  expect(warianty.length, 'model musi nieść nazwane stacje').toBeGreaterThan(0);
  return warianty;
}

async function otworzSchemat(page: Page, seed: Seed): Promise<void> {
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
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await page.getByRole('button', { name: 'Schemat (SLD)' }).first().click();
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(800);
}

/**
 * Czy podpis na rysunku ODNOSI SIĘ do nazwy z modelu. Dwa dopuszczalne
 * odstępstwa, oba kanoniczne:
 *  - podpis SKRÓCONY z wielokropkiem (reguła skracania KD-11), więc porównujemy
 *    rdzeń bez wielokropka;
 *  - podpis ZŁOŻONY przez kompozycję (nagłówek bloku GPZ to „⟨nazwa⟩ ·
 *    ⟨UHV/ULV⟩ kV"), więc nazwa modelu może być PREFIKSEM podpisu.
 * Rdzeń krótszy niż 2 znaki nie jest dowodem tożsamości.
 */
function odpowiadaTekstowi(podpis: string, oczekiwany: string): boolean {
  const rdzen = podpis.endsWith('…') ? podpis.slice(0, -1) : podpis;
  if (rdzen.length < 2) return false;
  return rdzen.startsWith(oczekiwany) || oczekiwany.startsWith(rdzen);
}

test('po „Dopasuj widok" rysunek z rozwinietym GPZ niesie podpisy tozsamosci (bramka KD-11)', async ({
  page,
  request,
}) => {
  test.setTimeout(300000);
  const seed = await zbudujSiec(request);
  const tozsamosciStacji = await tozsamosciStacjiZModelu(request, seed.caseId);
  await otworzSchemat(page, seed);

  const canvas = page.locator('svg[data-testid="sld-canvas-v3"]');
  const symbole = page.locator('[data-testid="sld-v3-symbols"]');
  const etykiety = page.locator('[data-testid="sld-v3-labels"]');

  // (1) Zejście na przegląd kółkiem — natywnie, jak projektant.
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await page.mouse.move(canvasBox!.x + canvasBox!.width / 2, canvasBox!.y + canvasBox!.height / 2);
  let poziom = await canvas.getAttribute('data-scene-lod');
  for (let krok = 0; krok < 16 && poziom !== '0'; krok++) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(150);
    poziom = await canvas.getAttribute('data-scene-lod');
  }
  await expect(canvas).toHaveAttribute('data-scene-lod', '0');

  // (2) KLIK NATYWNY w blok GPZ ⇒ rozwinięcie układu.
  const wezelBloku = symbole.locator('g[data-element-kind="station"]', {
    has: page.locator('[data-symbol-canon="gpzCollapsed"]'),
  });
  await expect(wezelBloku).toHaveCount(1);
  const box = await wezelBloku.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(1000);
  await expect(canvas).not.toHaveAttribute('data-scene-lod', '0');
  await expect(symbole.locator('[data-symbol-canon="transformer2W"]').first()).toBeVisible();
  await page.keyboard.press('Escape'); // zdejmij selekcję (panele nie zasłaniają kadru)
  await page.waitForTimeout(500);

  /** Sprawdza JEDEN kadr: tożsamość każdej stacji z modelu jest na rysunku,
   *  nic z tożsamości nie zostało porzucone, a ukryte są tylko dane. */
  async function zmierzKadr(nazwaKadru: string): Promise<number> {
    const podpisyTozsamosci = etykiety.locator('g[data-label-role="tozsamosc"]');
    const liczbaTozsamosci = await podpisyTozsamosci.count();
    expect(liczbaTozsamosci, `${nazwaKadru}: rysunek bez podpisow tozsamosci = defekt KD-11`).toBeGreaterThan(0);
    await expect(etykiety).toHaveAttribute('data-dropped-identity', '0');

    const teksty = (await podpisyTozsamosci.locator('text').allTextContents()).map((t) => t.trim());
    for (const warianty of tozsamosciStacji) {
      expect(
        teksty.some((t) => warianty.some((w) => odpowiadaTekstowi(t, w))),
        `${nazwaKadru}: brak podpisu tozsamosci stacji „${warianty[0]}" (podpisy: ${teksty.join(' | ')})`,
      ).toBe(true);
    }
    // Kadr ma być CZYTELNY, nie ograniczony do kikutów: co najmniej jedna
    // tożsamość stacji jest na rysunku w PEŁNEJ postaci (bez skrócenia).
    expect(
      tozsamosciStacji.some((warianty) => warianty.some((w) => teksty.includes(w))),
      `${nazwaKadru}: zadna tozsamosc stacji nie zmiescila sie w calosci (podpisy: ${teksty.join(' | ')})`,
    ).toBe(true);

    // Ukryte są WYŁĄCZNIE dane szczegółowe — i to one stoją we wskaźniku.
    const ukryte = Number(await etykiety.getAttribute('data-hidden-unreadable'));
    expect(ukryte, `${nazwaKadru}: kadr ma ukrywać opisy szczegółowe`).toBeGreaterThan(0);
    await expect(page.getByTestId('sld-v3-hidden-labels-hint')).toContainText('Ukryto');
    return ukryte;
  }

  // (3) KADR ROZWINIĘCIA — dokładnie ten ze zrzutu odbioru KD-8, na którym
  // rysunek nie niósł ANI JEDNEGO podpisu („Ukryto 35 opisów").
  await zmierzKadr('kadr rozwiniecia GPZ');

  // (4) „DOPASUJ WIDOK" — kadr z rozstrzygnięcia karty.
  await page.getByRole('button', { name: 'Dopasuj widok' }).click();
  await page.waitForTimeout(800);
  const ukryte = await zmierzKadr('kadr „Dopasuj widok"');

  // (6) PRZYBLIŻENIE kółkiem ⇒ dane szczegółowe wracają (licznik maleje).
  await page.mouse.move(canvasBox!.x + canvasBox!.width / 2, canvasBox!.y + canvasBox!.height / 2);
  for (let krok = 0; krok < 8; krok++) {
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(400);
  const ukryteBlizej = Number(await etykiety.getAttribute('data-hidden-unreadable'));
  expect(ukryteBlizej, 'po przyblizeniu opisy szczegolowe musza wracac').toBeLessThan(ukryte);
  // …a tożsamość nadal jest (nie znika przy zbliżeniu — rysowana naturalnie).
  expect(await etykiety.locator('g[data-label-role="tozsamosc"]').count()).toBeGreaterThan(0);
});
