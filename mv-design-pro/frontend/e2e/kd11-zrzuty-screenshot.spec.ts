/**
 * Zrzuty ŻYWEJ aplikacji dla karty KD-11 (bramka 6, dyrektywa właściciela #8):
 *  - `kd11-tozsamosc-rozwiniecie-{dark,light}.png` — kadr rozwiniętego GPZ,
 *    DOKŁADNIE ten sam co zrzuty odbioru KD-8 (`kd8-motyw-gpz-*`), na których
 *    rysunek nie niósł ani jednego podpisu (dawny licznik „Ukryto 35 opisów") — porównanie 1:1,
 *  - `kd11-tozsamosc-dopasowany-{dark,light}.png` — kadr „Dopasuj widok" z
 *    WIDOCZNYMI podpisami tożsamości,
 *  - `kd11-tozsamosc-blisko-{dark,light}.png` — kadr przybliżony (skala komfortu
 *    czytania), na którym wracają DANE SZCZEGÓŁOWE (parametry, adnotacje).
 *
 * Scena REALNA: projekt + przypadek + GPZ + magistrala z trzema stacjami,
 * zbudowane operacjami domenowymi backendu; wskazanie GPZ KLIKIEM NATYWNYM w jego
 * napis i przybliżenie kółkiem (ta sama droga danych i ta sama ścieżka użytkownika co spec
 * `kd8-zrzuty-screenshot.spec.ts`, żeby kadry były porównywalne 1:1).
 *
 * Spec ASERTUJE dowód przed zapisem: na kadrze dopasowanym są podpisy
 * tożsamości i zero porzuconych tożsamości, a na kadrze przybliżonym licznik
 * ukrytych opisów jest mniejszy — zrzut bez tej własności byłby dowodem
 * defektu, nie naprawy.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bramkaTresciMatematycznej } from './trescMatematyczna';

import { katalogZrzutow } from './katalogZrzutow';
import { czekajNaStabilnaGeometrie } from './stabilnaGeometria';
import { SELEKTOR_UCHWYTU_GPZ, SKALA_KOMFORTU_CZYTANIA, oddalDoSkali, przyblizDoSkali, srodekRamki } from './skalaKamery';
const _dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = katalogZrzutow(path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert'));

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const FIELD_APPARATUS_ID = 'sw-cb-abb-vd4-17kv-630a';
const CATALOG_VERSION = '2024.1';

const THEMES = [
  { id: 'light', mode: 'light_technical', jasny: true },
  { id: 'dark', mode: 'dark_scada', jasny: false },
] as const;

let opCounter = 0;
let entityCounter = 0;

type DomainOpResponse = {
  error?: string | null;
  snapshot?: { corridors?: Array<{ ordered_segment_refs?: string[] }> };
};

interface Scena {
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
      operation: { name, idempotency_key: `e2e-kd11-zrzut-${name}-${String(++opCounter).padStart(4, '0')}`, payload },
    },
    timeout: 30000,
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function zbudujScene(request: APIRequestContext): Promise<Scena> {
  entityCounter += 1;
  const suffix = String(entityCounter).padStart(4, '0');
  const projectName = `Zrzut KD-11 tozsamosc ${suffix}`;
  const caseName = `Przeglad sieci ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Zrzuty KD-11: tozsamosc elementow na rysunku',
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

async function otworzSchemat(page: Page, scena: Scena, motyw: string): Promise<void> {
  await page.addInitScript(
    (dane) => {
      localStorage.setItem(
        'mv-design-app-state',
        JSON.stringify({
          state: {
            activeProjectId: dane.projectId,
            activeProjectName: dane.projectName,
            activeCaseId: dane.caseId,
            activeCaseName: dane.caseName,
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
      localStorage.setItem('mvd-theme-mode', JSON.stringify({ state: { mode: dane.motyw }, version: 0 }));
    },
    { ...scena, motyw },
  );
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await page.getByRole('button', { name: 'Schemat (SLD)' }).first().click();
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1000);
}

/** Jasność względna (WCAG) tła kanwy — dowód, że wariant „light" jest jasny. */
async function jasnoscKanwy(page: Page): Promise<number> {
  const kolor = await page.evaluate(
    () => getComputedStyle(document.querySelector('svg[data-testid="sld-canvas-v3"]')!).backgroundColor,
  );
  const nums = kolor.match(/\d+(\.\d+)?/g) ?? [];
  const [r, g, b] = nums
    .slice(0, 3)
    .map((n) => Number(n) / 255)
    .map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test.describe('kd11:zrzuty', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const { id, mode, jasny } of THEMES) {
    test(`motyw ${id}: kadr dopasowany z tozsamoscia i kadr przyblizony ze szczegolami`, async ({ page, request }) => {
      test.setTimeout(300000);
      const scena = await zbudujScene(request);
      await otworzSchemat(page, scena, mode);

      const canvas = page.locator('svg[data-testid="sld-canvas-v3"]');
      const symbole = page.locator('[data-testid="sld-v3-symbols"]');
      const etykiety = page.locator('[data-testid="sld-v3-labels"]');

      const jasnosc = await jasnoscKanwy(page);
      if (jasny) expect(jasnosc, `kanwa motywu ${id} nie jest jasna`).toBeGreaterThan(0.5);
      else expect(jasnosc, `kanwa motywu ${id} nie jest ciemna`).toBeLessThan(0.2);

      // (1) Zejście na przegląd kółkiem — natywnie, jak projektant (dolna granica skali =
      // dopasowanie całej sieci, R2; jedna scena — karta SLD-SKALA-I-NAWIGACJA R1).
      const canvasBox = await canvas.boundingBox();
      expect(canvasBox).not.toBeNull();
      const srodek = { x: canvasBox!.x + canvasBox!.width / 2, y: canvasBox!.y + canvasBox!.height / 2 };
      await oddalDoSkali(page, canvas, srodek);

      // (2) KLIK NATYWNY w napis GPZ ⇒ selekcja; przybliżenie kółkiem nad GPZ do skali
      // czytania (dawniej: klik rozwijał zwinięty blok GPZ widoku L0); selekcja zdjęta.
      const uchwytGpz = page.locator(SELEKTOR_UCHWYTU_GPZ).first();
      await expect(uchwytGpz).toHaveCount(1);
      // Spoczynek kadru przed pomiarem punktu kliku (klasa G karty FIX-E2E-PELNE).
      await czekajNaStabilnaGeometrie(uchwytGpz);
      const srodekGpz = await srodekRamki(uchwytGpz);
      await page.mouse.click(srodekGpz.x, srodekGpz.y);
      await page.waitForTimeout(1200);
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
      await page.waitForTimeout(800);

      // (3) KADR ROZWINIĘCIA — DOKŁADNIE ten sam kadr, co zrzuty odbioru KD-8
      // (`kd8-motyw-gpz-{dark,light}.png`), na których rysunek nie niósł ani
      // jednego podpisu. Porównywalny 1:1.
      const tozsamosciRozwiniecie = await etykiety.locator('g[data-label-role="tozsamosc"]').count();
      expect(tozsamosciRozwiniecie, 'kadr rozwiniecia bez podpisow tozsamosci').toBeGreaterThan(0);
      // Karta SLD-SKALA-I-NAWIGACJA (R4): tożsamość nie jest skracana ani porzucana.
      expect(await etykiety.locator('g[data-label-role="tozsamosc"] text').allTextContents()).not.toContainEqual(expect.stringContaining('…'));
      await bramkaTresciMatematycznej(page);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `kd11-tozsamosc-rozwiniecie-${id}.png`) });

      // (4) KADR „DOPASUJ WIDOK" — dowód przed zapisem: są podpisy tożsamości.
      await page.getByRole('button', { name: 'Dopasuj widok' }).click();
      await page.waitForTimeout(1000);
      const tozsamosci = await etykiety.locator('g[data-label-role="tozsamosc"]').count();
      expect(tozsamosci, 'kadr dopasowany bez podpisow tozsamosci').toBeGreaterThan(0);
      expect(await etykiety.locator('g[data-label-role="tozsamosc"] text').allTextContents()).not.toContainEqual(expect.stringContaining('…'));
      await expect(page.getByTestId('sld-v3-hidden-labels-hint')).toHaveCount(0);
      const ukryteDopasowany = Number(await etykiety.getAttribute('data-dane-nieczytelne'));
      await bramkaTresciMatematycznej(page);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `kd11-tozsamosc-dopasowany-${id}.png`) });

      // (5) KADR PRZYBLIŻONY — kółkiem NAD transformatorem GPZ do skali komfortu czytania;
      // wtedy dane szczegółowe (parametry, adnotacje) są czytelne.
      const kotwica = symbole.locator('[data-symbol-canon="transformer2W"]').first();
      const kursor = (await kotwica.count()) > 0 ? await srodekRamki(kotwica) : srodek;
      await przyblizDoSkali(page, canvas, kursor, SKALA_KOMFORTU_CZYTANIA);
      await page.waitForTimeout(800);
      const ukryteBlisko = Number(await etykiety.getAttribute('data-dane-nieczytelne'));
      expect(ukryteBlisko, 'po przyblizeniu opisy szczegolowe musza wracac').toBeLessThan(ukryteDopasowany);
      expect(await etykiety.locator('g[data-label-role="dane"]').count()).toBeGreaterThan(0);
      expect(await etykiety.locator('g[data-label-role="tozsamosc"]').count()).toBeGreaterThan(0);
      await bramkaTresciMatematycznej(page);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `kd11-tozsamosc-blisko-${id}.png`) });
    });
  }
});
