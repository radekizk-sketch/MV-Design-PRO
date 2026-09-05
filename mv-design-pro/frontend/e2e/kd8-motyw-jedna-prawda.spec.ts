/**
 * KD-8 poz. 1, bramka 1 — JEDNA PRAWDA MOTYWU na ŻYWEJ aplikacji.
 *
 * Ocena właściciela (2/10 ekranu jasnego) brzmiała: „przy »Motyw: jasny«
 * ciemne pozostają kanwa SLD, nawigacja przestrzeni, pasek metryk i karta
 * konfiguratora stacji". Ten spec mierzy dokładnie to — i mierzy REALNE
 * kolory wyliczone przez przeglądarkę (`getComputedStyle` na węzłach sceny i
 * powłoki), nie obecność klas CSS: klasa może istnieć i nic nie robić.
 *
 * Scena jest REALNA (projekt + przypadek + GPZ + magistrala ze stacją przez
 * operacje domenowe backendu — ta sama droga danych co specy KD-5/KD-7),
 * przełączenie motywu idzie NATYWNYM klikiem w przełącznik powłoki.
 *
 * Trzecia asercja: eksport SVG wychodzi w palecie DOKUMENTOWEJ przy OBU
 * motywach ekranu — arkusz do dokumentacji nie może zależeć od tego, na czym
 * pracował projektant.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const FIELD_APPARATUS_ID = 'sw-cb-abb-vd4-17kv-630a';
const CATALOG_VERSION = '2024.1';

/** Paleta dokumentowa arkusza (`ui/sld/v3/export/exportPalette.ts`). */
const DOKUMENT_SN = '#0F7A3D';
const DOKUMENT_TLO = '#FFFFFF';
/**
 * Zieleń ODCINKA SN motywu ciemnego i jasnego, NAPRAWIONA (karta
 * BUGI-PRODUKTU-E2E). Sieć tej sceny jest w CAŁOŚCI zasilona (źródło →
 * odcinki → stacja, same zamknięte łączniki, zero NOP) — `SupplyPathHighlight`
 * (`SupplyPathHighlighter.ts`, BFS topologiczny od źródła przez zamknięte
 * łączniki, ZAWSZE liczony gdy jest snapshot, niezależnie od biegu solvera)
 * oznacza więc KAŻDY odcinek SN jako energizowany. `strokeForEnergization`
 * (`SldCanvasV3.tsx`) ma WYŻSZY priorytet niż barwa bazowa napięcia
 * (precedencja udokumentowana w `theme/colorTokens.ts`: „1. stan źródła DER,
 * 2. nakładka wynikowa (energizacja/…), … 4. napięcie — baza, gdy nic wyżej
 * nie ustawia koloru") — barwa „SN" czysta (`VOLTAGE_COLOR.sn`, dawne stałe
 * tu) jest więc TYLKO fallbackiem dla elementów BEZ nakładki i nigdy nie
 * trafia na ekran w tej scenie. Realnie renderowana (i poprawnie zależna od
 * motywu — `palette.highlight.energized`) barwa to podświetlenie
 * energizacji: `HIGHLIGHT_COLOR.energized` (ciemny, `colorTokens.ts`) i
 * `LIGHT_TECHNICAL_SLD_PALETTE.highlight.energized` (jasny, `theme/
 * palette.ts`).
 */
const EKRAN_SN_CIEMNY = '#2ECC71';
const EKRAN_SN_JASNY = '#1E7A46';

let opCounter = 0;
let entityCounter = 0;

interface Scena {
  projectId: string;
  projectName: string;
  caseId: string;
  caseName: string;
}

type DomainOpResponse = {
  error?: string | null;
  snapshot?: { corridors?: Array<{ ordered_segment_refs?: string[] }> };
};

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
      operation: { name, idempotency_key: `e2e-kd8-motyw-${name}-${String(++opCounter).padStart(4, '0')}`, payload },
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
  const projectName = `Motyw jedna prawda ${suffix}`;
  const caseName = `Przeglad motywu ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'KD-8: motyw steruje paleta kazdej powierzchni',
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
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });
  let op: DomainOpResponse = {};
  for (const [idx, length] of [300, 250].entries()) {
    op = await domainOp(request, caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: catalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);
  await domainOp(request, caseId, 'insert_station_on_segment_sn', {
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

  return { projectId: project.id, projectName, caseId, caseName };
}

async function otworzSchemat(page: Page, scena: Scena): Promise<void> {
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
            activeRunId: null,
            activeAnalysisType: 'SHORT_CIRCUIT',
            caseManagerOpen: false,
            issuePanelOpen: false,
          },
          version: 1,
        }),
      );
      // Start ZAWSZE od motywu dyspozytorskiego — spec ma przełączyć go klikiem.
      localStorage.setItem('mvd-theme-mode', JSON.stringify({ state: { mode: 'dark_scada' }, version: 0 }));
    },
    scena,
  );
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await page.getByRole('button', { name: 'Schemat (SLD)' }).first().click();
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(800);
}

/** Jasność względna (WCAG) koloru zwróconego przez `getComputedStyle`. */
function luminancja(rgbString: string): number {
  const nums = rgbString.match(/\d+(\.\d+)?/g);
  if (!nums || nums.length < 3) throw new Error(`Nie kolor: „${rgbString}"`);
  const [r, g, b] = nums.slice(0, 3)
    .map((n) => Number(n) / 255)
    .map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Realne tła powierzchni wskazanych w ocenie właściciela. */
async function tlaPowierzchni(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const odczyt = (el: Element | null): string =>
      el === null ? 'BRAK' : getComputedStyle(el).backgroundColor;
    return {
      // Kanwa niesie tło stylem inline (paleta rysunku), nie klasą.
      kanwa: odczyt(document.querySelector('svg[data-testid="sld-canvas-v3"]')),
      nawigacja: odczyt(document.querySelector('nav.mvd-nav') ?? document.querySelector('nav.mvd-rail')),
      pasekMetryk: odczyt(document.querySelector('[data-testid="workflow-context-strip"]')),
      panelSchematu: odczyt(document.querySelector('[data-testid="schemat-context-panel"]')),
      powloka: odczyt(document.querySelector('[data-ui-theme]')),
    };
  });
}

/**
 * Kolor kreski REALNEGO odcinka toru SN na scenie (próbka rysunku).
 *
 * SELEKTOR NAPRAWIONY (karta BUGI-PRODUKTU-E2E): dawny `[data-testid="sld-v3-
 * segments"] g path` zakładał odcinek zagnieżdżony w DODATKOWYM `<g>` z DWOMA
 * ścieżkami (kolorowa + niewidzialny hitbox `stroke="transparent"`) — kształt
 * sprzed karty S9-4. Od S9-4 `SceneSegmentNode` (`SldCanvasV3.tsx`) rysuje
 * odcinek jako POJEDYNCZY `<path>`, DZIECKO WPROST `<g data-testid="sld-v3-
 * segments">` (bez pośredniego `<g>`), a uchwyt kliku żyje w OSOBNEJ warstwie
 * `sld-v3-trafienia` (rysunek jest bierny). Kombinator potomka `g path`
 * wymagał WĘZŁA POŚREDNIEGO `<g>`, którego już nie ma — selektor NIGDY nie
 * trafiał (0 elementów w KAŻDYM motywie, nie tylko po przełączeniu), funkcja
 * zawsze zwracała `BRAK` niezależnie od koloru rzeczywiście narysowanego przez
 * `stroke={stroke}` w `SceneSegmentNode`. Dowód pomiarowy w DOM: `document.
 * querySelectorAll('[data-testid="sld-v3-segments"] path')` (bez pośredniego
 * `g`) trafia w każdy odcinek jego prawdziwym `testId`
 * (`segmentTestId`/`sld-v3-segment-N`).
 */
async function kreskaOdcinkaSn(page: Page): Promise<string> {
  return page.evaluate(() => {
    const kandydaci = Array.from(
      document.querySelectorAll('[data-testid="sld-v3-segments"] path'),
    );
    for (const el of kandydaci) {
      const stroke = el.getAttribute('stroke');
      if (stroke && stroke !== 'transparent' && stroke !== 'none') return stroke;
    }
    return 'BRAK';
  });
}

/** Treść pliku SVG zwróconego przez tor eksportu (Blob przechwycony w stronie). */
async function eksportujSvg(page: Page): Promise<string> {
  await page.evaluate(() => {
    const w = window as unknown as { __kd8Blob?: string };
    w.__kd8Blob = undefined;
    const oryginal = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      if (obj instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
          w.__kd8Blob = String(reader.result);
        };
        reader.readAsText(obj);
      }
      return oryginal(obj);
    };
  });
  // KD-8 poz. 2: przy tej szerokości kanwy grupa „Eksport" bywa ZWINIĘTA do
  // menu „Narzędzia" — sięgamy po nią tą samą drogą co użytkownik.
  if (await page.getByTestId('sld-v3-export-svg').count() === 0) {
    await page.getByTestId('sld-v3-toolbar-menu-toggle').click();
    await expect(page.getByTestId('sld-v3-toolbar-menu')).toBeVisible();
  }
  await page.getByTestId('sld-v3-export-svg').click();
  await page.waitForFunction(() => (window as unknown as { __kd8Blob?: string }).__kd8Blob !== undefined, undefined, {
    timeout: 15000,
  });
  return page.evaluate(() => (window as unknown as { __kd8Blob?: string }).__kd8Blob ?? '');
}

test.describe('kd8:motyw', () => {
  test('przełączenie motywu obejmuje KAŻDĄ powierzchnię, eksport zostaje dokumentowy', async ({ page, request }) => {
    test.setTimeout(300000);
    const scena = await zbudujScene(request);
    await otworzSchemat(page, scena);

    // (1) Stan wyjściowy — dyspozytorski: wszystkie powierzchnie CIEMNE.
    const ciemne = await tlaPowierzchni(page);
    for (const [nazwa, kolor] of Object.entries(ciemne)) {
      expect(kolor, `${nazwa} przed przełączeniem`).not.toBe('BRAK');
      expect(luminancja(kolor), `${nazwa} (ciemny) = ${kolor}`).toBeLessThan(0.2);
    }
    expect(await kreskaOdcinkaSn(page)).toBe(EKRAN_SN_CIEMNY);

    // (2) Eksport z motywu CIEMNEGO — paleta dokumentowa.
    const svgZCiemnego = await eksportujSvg(page);
    expect(svgZCiemnego).toContain(DOKUMENT_SN);
    expect(svgZCiemnego).toContain(DOKUMENT_TLO);
    expect(svgZCiemnego).not.toContain(EKRAN_SN_CIEMNY);

    // (3) NATYWNY klik w przełącznik motywu ⇒ jasny (techniczny).
    await page.getByTestId('mvd-theme-toggle').click();
    await page.waitForTimeout(600);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light_technical');

    const jasne = await tlaPowierzchni(page);
    for (const [nazwa, kolor] of Object.entries(jasne)) {
      expect(kolor, `${nazwa} po przełączeniu`).not.toBe('BRAK');
      expect(luminancja(kolor), `${nazwa} (jasny) = ${kolor}`).toBeGreaterThan(0.5);
    }
    // Rysunek: zieleń SN ŚCIEMNIONA pod biel arkusza (semantyka klasy napięcia
    // zachowana — nadal zieleń, inny walor).
    expect(await kreskaOdcinkaSn(page)).toBe(EKRAN_SN_JASNY);

    // (4) Eksport z motywu JASNEGO — TA SAMA paleta dokumentowa.
    const svgZJasnego = await eksportujSvg(page);
    expect(svgZJasnego).toContain(DOKUMENT_SN);
    expect(svgZJasnego).toContain(DOKUMENT_TLO);

    // (5) Powrót klikiem ⇒ ciemny; powierzchnie znowu ciemne (brak dryfu).
    await page.getByTestId('mvd-theme-toggle').click();
    await page.waitForTimeout(600);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark_scada');
    const znowuCiemne = await tlaPowierzchni(page);
    for (const [nazwa, kolor] of Object.entries(znowuCiemne)) {
      expect(luminancja(kolor), `${nazwa} (powrót) = ${kolor}`).toBeLessThan(0.2);
    }
    expect(await kreskaOdcinkaSn(page)).toBe(EKRAN_SN_CIEMNY);
  });
});
