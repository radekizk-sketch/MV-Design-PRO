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
 *     {id}/enm`, nie z literału UI) ma na rysunku podpis tożsamości W PEŁNYM
 *     brzmieniu, bez wielokropka (karta SLD-SKALA-I-NAWIGACJA, R4: tożsamość nie
 *     jest skracana ani porzucana); na ekranie nie ma licznika „Ukryto N opisów";
 *     niewidoczne są wyłącznie dane, których pismo jest nieczytelne przy tej skali
 *     (kanał audytu `data-dane-nieczytelne`);
 *  5. przybliżenie kółkiem ⇒ dane szczegółowe wracają (dane nieczytelne maleją).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { czekajNaStabilnaGeometrie } from './stabilnaGeometria';
import { SELEKTOR_UCHWYTU_GPZ, oddalDoSkali, przyblizDoSkali, srodekRamki } from './skalaKamery';

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
      // Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: tolerancja sieci nN (wiersz nN tabeli 1 IEC 60909-0).
      nn_earthing: { lv_voltage_tolerance: 'PLUS_10' },
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
      // Jedna scena (karta SLD-SKALA-I-NAWIGACJA, R1): pasmo nazw niesie zawsze pełną nazwę,
      // nie kod poziomu przeglądowego.
      return [nazwa];
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
 * Czy podpis na rysunku jest PEŁNĄ nazwą z modelu (karta SLD-SKALA-I-NAWIGACJA, R4: tożsamości
 * nie skraca się). Jedno dopuszczalne odstępstwo, kanoniczne: podpis ZŁOŻONY przez kompozycję
 * (nagłówek bloku GPZ to „⟨nazwa⟩ · ⟨UHV/ULV⟩ kV"), więc nazwa modelu może być PREFIKSEM
 * podpisu, po którym stoi spacja. Wielokropek w podpisie tożsamości jest defektem.
 */
function pelnaNazwa(podpis: string, oczekiwany: string): boolean {
  if (podpis.includes('…')) return false;
  return podpis === oczekiwany || podpis.startsWith(`${oczekiwany} `);
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

  // (1) Zejście na przegląd kółkiem — natywnie, jak projektant (dolna granica skali =
  // dopasowanie całej sieci, R2; jedna scena — karta SLD-SKALA-I-NAWIGACJA R1).
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await oddalDoSkali(page, canvas, { x: canvasBox!.x + canvasBox!.width / 2, y: canvasBox!.y + canvasBox!.height / 2 });

  // (2) KLIK NATYWNY w napis GPZ ⇒ selekcja; przybliżenie kółkiem nad GPZ do skali
  // czytania (dawniej klik rozwijał zwinięty blok GPZ widoku L0).
  const uchwytGpz = page.locator(SELEKTOR_UCHWYTU_GPZ).first();
  await expect(uchwytGpz).toHaveCount(1);
  // Spoczynek kadru przed pomiarem punktu kliku (klasa G karty FIX-E2E-PELNE).
  await czekajNaStabilnaGeometrie(uchwytGpz);
  const srodekGpz = await srodekRamki(uchwytGpz);
  await page.mouse.click(srodekGpz.x, srodekGpz.y);
  await page.waitForTimeout(1000);
  await przyblizDoSkali(page, canvas, srodekGpz);
  await expect(symbole.locator('[data-symbol-canon="transformer2W"]').first()).toBeVisible();
  // Zdjęcie selekcji realną ścieżką (K11-A): jeden Escape zdejmuje selekcję
  // (UI-02b: klik nie otwiera już panelu szczegółów nad kanwą). Selekcja musi
  // zniknąć — od karty K2 „Dopasuj widok" kadruje zakres pracy (zaznaczenie),
  // więc niezdjęta selekcja zmieniałaby kadr, który ten spec mierzy.
  await page.keyboard.press('Escape');
  // Dowód zdjęcia selekcji: adres bez parametru zaznaczenia (`sel`). Panel
  // prawy NIE jest tu sygnałem — stacja ma własną powierzchnię konfiguratora,
  // która zostaje otwarta po odznaczeniu (inaczej niż karta selekcji transformatora).
  await expect(page).not.toHaveURL(/[?&]sel=/, { timeout: 10000 });
  await page.waitForTimeout(500);

  /** Sprawdza JEDEN kadr: tożsamość każdej stacji z modelu jest na rysunku w pełnym
   *  brzmieniu, licznika ukrytych opisów nie ma, a niewidoczne są tylko dane. */
  async function zmierzKadr(nazwaKadru: string): Promise<number> {
    const podpisyTozsamosci = etykiety.locator('g[data-label-role="tozsamosc"]');
    const liczbaTozsamosci = await podpisyTozsamosci.count();
    expect(liczbaTozsamosci, `${nazwaKadru}: rysunek bez podpisow tozsamosci = defekt KD-11`).toBeGreaterThan(0);

    const teksty = (await podpisyTozsamosci.locator('text').allTextContents()).map((t) => t.trim());
    expect(teksty.filter((t) => t.includes('…')), `${nazwaKadru}: tozsamosc skrocona wielokropkiem`).toEqual([]);
    for (const warianty of tozsamosciStacji) {
      expect(
        teksty.some((t) => warianty.some((w) => pelnaNazwa(t, w))),
        `${nazwaKadru}: brak pelnego podpisu tozsamosci stacji „${warianty[0]}" (podpisy: ${teksty.join(' | ')})`,
      ).toBe(true);
    }

    // Niewidoczne są WYŁĄCZNIE dane szczegółowe, a na ekranie nie ma licznika.
    const nieczytelne = Number(await etykiety.getAttribute('data-dane-nieczytelne'));
    expect(nieczytelne, `${nazwaKadru}: kadr ma nie pokazywac nieczytelnych danych`).toBeGreaterThan(0);
    await expect(page.getByTestId('sld-v3-hidden-labels-hint')).toHaveCount(0);
    await expect(canvas).not.toContainText('Ukryto');
    return nieczytelne;
  }

  // (3) KADR ROZWINIĘCIA — dokładnie ten ze zrzutu odbioru KD-8, na którym
  // rysunek nie niósł ANI JEDNEGO podpisu (dawny licznik „Ukryto 35 opisów").
  await zmierzKadr('kadr rozwiniecia GPZ');

  // (4) „DOPASUJ WIDOK" — kadr z rozstrzygnięcia karty.
  await page.getByRole('button', { name: 'Dopasuj widok' }).click();
  await page.waitForTimeout(800);
  const ukryte = await zmierzKadr('kadr „Dopasuj widok"');

  // (6) PRZYBLIŻENIE kółkiem ⇒ dane szczegółowe wracają (dane nieczytelne maleją).
  await page.mouse.move(canvasBox!.x + canvasBox!.width / 2, canvasBox!.y + canvasBox!.height / 2);
  for (let krok = 0; krok < 8; krok++) {
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(400);
  const ukryteBlizej = Number(await etykiety.getAttribute('data-dane-nieczytelne'));
  expect(ukryteBlizej, 'po przyblizeniu opisy szczegolowe musza wracac').toBeLessThan(ukryte);
  // …a tożsamość nadal jest (nie znika przy zbliżeniu — rysowana naturalnie).
  expect(await etykiety.locator('g[data-label-role="tozsamosc"]').count()).toBeGreaterThan(0);
});
