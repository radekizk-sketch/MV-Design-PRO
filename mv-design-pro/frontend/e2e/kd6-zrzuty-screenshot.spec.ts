/**
 * Zrzuty ŻYWEJ aplikacji dla karty KD-6 (bramka 5, dyrektywa właściciela #8):
 *  - ogniwo z werdyktami wytrzymałości aparatury pochodzącymi z MODELU
 *    (żadnej ręcznej konfiguracji stacji — aparat z pozycji katalogu APARAT_SN),
 *    jako tabela pól z rozwiniętym porównaniem pierwszego pola (karta APARATURA-TABELA),
 *  - czas wyłączenia wyprowadzony z NASTAW zabezpieczeń pola i widok każdego pola
 *    rozwiniętego ze „Szczegółami obliczeń” (karta KD6-SZCZEGOLY), z pomiarem wysokości
 *    i liczb DOM do pliku wyników biegu.
 * Oba motywy. Zrzut = jedyny dowód wyglądu na stronie oceny.
 *
 * Scena jest REALNA: projekt + przypadek + sieć ze stacją, której pole liniowe
 * dostaje CT i przekaźnik z nastawami W TEJ SAMEJ operacji stacyjnej (B-3),
 * plus policzony bieg zwarciowy — żadnego harnessu i żadnych zaszczepionych
 * wyników.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { wykonajBiegDoKonca } from './biegi';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { otworzZakladkeWynikow } from './nawigacjaWynikow';
import { bramkaTresciMatematycznej } from './trescMatematyczna';

import { katalogZrzutow } from './katalogZrzutow';
import { transformatoryStacjiSnNn } from './transformatoryStacji';
const _dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = katalogZrzutow(path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert'));

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const APARAT_POLA_ID = 'sw-cb-abb-vd4-17kv-630a';
const CT_ID = 'ct_400_5_5p20_15va_abb';
const PRZEKAZNIK_ID = 'REF-OC-100';
const CATALOG_VERSION = '2024.1';

const THEMES = [
  { id: 'light', mode: 'light_technical' },
  { id: 'dark', mode: 'dark_scada' },
] as const;

let opCounter = 0;

type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    branches?: Array<{ ref_id: string; type?: string }>;
    transformers?: Array<{ ref_id: string; lv_bus_ref?: string }>;
    buses?: Array<{ ref_id: string; voltage_kv?: number }>;
    substations?: Array<{ ref_id: string; bus_refs?: string[] }>;
    protection_assignments?: Array<{ ref_id: string; catalog_ref?: string | null }>;
  };
};

interface Scena {
  projectId: string;
  projectName: string;
  caseId: string;
  caseName: string;
  runId: string;
  punktNazwa: string;
  polaZWerdyktem: string[];
}

function catalogBinding(namespace: string, itemId: string) {
  return {
    catalog_namespace: namespace,
    catalog_item_id: itemId,
    catalog_item_version: CATALOG_VERSION,
  };
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
      operation: {
        name,
        idempotency_key: `e2e-kd6-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function zbudujScene(request: APIRequestContext): Promise<Scena> {
  const znacznik = String(Date.now());
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: `Zrzuty KD-6 ${znacznik}`,
      description: 'Bramka KD-6: werdykty z modelu + rozbicie czasu wyłączenia',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string; name: string };

  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: {
      project_id: project.id,
      name: `Przypadek KD-6 ${znacznik}`,
      description: '',
      config: {},
      set_active: true,
    },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string; name: string };

  await domainOp(request, studyCase.id, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: catalogBinding('ZRODLO_SN', SOURCE_ID),
  });

  let op: DomainOpResponse = {};
  for (const [idx, length] of [300, 250].entries()) {
    op = await domainOp(request, studyCase.id, 'continue_trunk_segment_sn', {
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

  // Stacja z aparatem pola z katalogu APARAT_SN ORAZ z wyposażeniem pola
  // (CT + przekaźnik z NASTAWAMI) — czas wyłączenia ma się wziąć z nastaw.
  op = await domainOp(request, studyCase.id, 'insert_station_on_segment_sn', {
    // Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: tolerancja sieci nN (wiersz nN tabeli 1 IEC 60909-0).
    nn_earthing: { lv_voltage_tolerance: 'PLUS_10' },
    field_apparatus_catalog_ref: APARAT_POLA_ID,
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: [
      {
        field_role: 'LINIA_IN',
        equipment: {
          ct: {
            catalog_binding: catalogBinding('CT', CT_ID),
            ratio_primary_a: 400.0,
            ratio_secondary_a: 5.0,
          },
          // Sterownik pola z zestawem funkcji rodzaju (I> 51, I>> 50); nastawy zapisuje niżej
          // JEDYNY pisarz nastaw `update_protection_settings` (karta OCHRONA-JEDNO-ZRODLO).
          relay: {
            catalog_binding: catalogBinding('ZABEZPIECZENIE', PRZEKAZNIK_ID),
            relay_type: 'NADPRADOWY',
          },
        },
      },
      'OUT',
      // KOMPLETNOSC-POLA-TR (klasa A): stacja SN/nN Z transformatorem — pole roli
      // 'TR' dopisane, bo realna rozdzielnia realizuje odejscie do transformatora
      // polem transformatorowym. Kreator stacji tworzy je domyslnie, wiec fixture
      // bez niego opisywal siec, ktorej kreator by nie zbudowal.
      'TR',
    ],
    transformer: { create: true, catalog_binding: catalogBinding('TRAFO_SN_NN', TRAFO_ID) },
  });

  // Nastawy sterownika pola: I> 400 A po stronie pierwotnej przekładnika 400/5 A (jednostka
  // progu jest częścią nastawy), charakterystyka niezależna 0,3 s; I>> wyłączony.
  const sterownik = (op.snapshot?.protection_assignments ?? []).find((p) => p.catalog_ref === PRZEKAZNIK_ID);
  expect(sterownik, 'sterownik pola z przekaźnikiem z katalogu').toBeTruthy();
  op = await domainOp(request, studyCase.id, 'update_protection_settings', {
    protection_ref: sterownik!.ref_id,
    nastawy: { '51': { prog: 400.0, jednostka_progu: 'A_PIERWOTNY', krzywa: 'DT', zwloka_s: 0.3 } },
    wlaczone: { '50': false },
  });

  const stacja = (op.snapshot?.substations ?? []).find((s) => s.ref_id.includes('/station'));
  expect(stacja?.ref_id).toBeTruthy();
  const stationRef = stacja!.ref_id;
  const busRefy = stacja!.bus_refs ?? [];

  // Kategoria katalogu MUSI pasować do rodzaju gałęzi — KABEL_SN wyłącznie dla
  // odcinków liniowych (aparat pola zachowuje wiązanie APARAT_SN).
  for (const branch of (op.snapshot?.branches ?? []).filter(
    (b) => b.type === 'cable' || b.type === 'line_overhead',
  )) {
    await domainOp(request, studyCase.id, 'assign_catalog_to_element', {
      element_ref: branch.ref_id,
      catalog_binding: catalogBinding('KABEL_SN', CABLE_ID),
    });
  }
  // Pozycja TRAFO_SN_NN i dane 15/0,4 kV WYŁĄCZNIE dla transformatora stacji SN/nN — nie dla
  // transformatora GPZ 110/15 kV (jedna reguła: `transformatoryStacji.ts`, walidator E023).
  for (const transformer of transformatoryStacjiSnNn(op.snapshot)) {
    await domainOp(request, studyCase.id, 'assign_catalog_to_element', {
      element_ref: transformer.ref_id,
      catalog_binding: catalogBinding('TRAFO_SN_NN', TRAFO_ID),
    });
    await domainOp(request, studyCase.id, 'update_element_parameters', {
      element_ref: transformer.ref_id,
      parameters: {
        sn_mva: 0.63,
        uhv_kv: 15.0,
        ulv_kv: 0.4,
        uk_percent: 4.0,
        pk_kw: 6.5,
        vector_group: 'Dyn5',
        parameter_source: 'CATALOG',
      },
    });
  }

  const createRun = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${studyCase.id}/runs`,
    { data: { analysis_type: 'SC_3F' } },
  );
  expect(createRun.ok()).toBeTruthy();
  const run = (await createRun.json()) as { id: string };
  // Karta DYNAMIKA-W-TLE: `execute` zleca bieg w tle (202); gotowość = stan DONE
  // biegu (`biegi.ts`), nie 200 z `results/index` (ten jest 200 także w toku).
  await wykonajBiegDoKonca(request, BACKEND_BASE, run.id);

  const wynikResponse = await request.get(
    `${BACKEND_BASE}/api/analysis-runs/${run.id}/results/short-circuit`,
  );
  const wynik = (await wynikResponse.json()) as {
    rows: Array<{
      target_id: string;
      element_id?: string;
      target_name?: string | null;
      ikss_ka?: number | null;
      ip_ka: number | null;
      ith_ka: number | null;
    }>;
  };
  const punkt = wynik.rows.find(
    (r) => r.ip_ka !== null && busRefy.includes(r.element_id ?? r.target_id),
  );
  expect(punkt, 'Scena zrzutu wymaga punktu zwarcia na szynie stacji.').toBeTruthy();

  // Oznaczenia pól z odpowiedzi końcówki — zrzut ma pokazać TO, co widzi ekran.
  const widokResponse = await request.post(
    `${BACKEND_BASE}/api/cases/${studyCase.id}/enm/wytrzymalosc-aparatury`,
    {
      // Kontrakt karty WYTRZYMALOSC-PRAD-POLA: zapisany bieg, nie liczby stacji —
      // prąd każdego pola backend bierze z wiersza biegu w punkcie zabudowy pola.
      data: { station_ref: stationRef, short_circuit_run_id: run.id },
    },
  );
  expect(widokResponse.ok()).toBeTruthy();
  const widok = (await widokResponse.json()) as { pola: Array<{ pole: string }> };
  expect(widok.pola.length).toBeGreaterThan(0);

  return {
    projectId: project.id,
    projectName: project.name,
    caseId: studyCase.id,
    caseName: studyCase.name,
    runId: run.id,
    punktNazwa: punkt!.target_name ?? punkt!.target_id,
    polaZWerdyktem: widok.pola.map((p) => p.pole),
  };
}

async function otworz(page: Page, scena: Scena, motyw: string, hash: string): Promise<void> {
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
            activeCaseResultStatus: 'FRESH',
            activeSnapshotId: null,
            activeMode: 'MODEL_EDIT',
            activeAnalysisType: 'SHORT_CIRCUIT',
            caseManagerOpen: false,
            issuePanelOpen: false,
          },
          version: 1,
        }),
      );
      localStorage.setItem(
        'mvd-theme-mode',
        JSON.stringify({ state: { mode: dane.motyw }, version: 0 }),
      );
    },
    { ...scena, motyw },
  );
  await page.goto(hash, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
}

/** Rozwija każde pole i jego szczegóły natywnym klikiem; zwraca liczby z DOM i wysokości. */
async function zmierzSzczegolyPol(
  page: Page,
  pola: readonly string[],
): Promise<{ wysokoscSekcjiPx: number; pola: Record<string, { wysokoscPx: number; teksty: Record<string, string> }> }> {
  const wynik: Record<string, { wysokoscPx: number; teksty: Record<string, string> }> = {};
  for (const pole of pola) {
    const przelacz = page.getByTestId(`mvd-zwarcia-aparatura-rozwin-${pole}`);
    if ((await przelacz.getAttribute('aria-expanded')) !== 'true') await przelacz.click();
    const szczegolyPrzelacz = page.getByTestId(`mvd-zwarcia-aparatura-szczegoly-przelacz-${pole}`);
    if ((await szczegolyPrzelacz.getAttribute('aria-expanded')) !== 'true') {
      await szczegolyPrzelacz.click();
    }
    await expect(page.getByTestId(`mvd-zwarcia-aparatura-szczegoly-${pole}`)).toBeVisible();
    const wiersz = page.getByTestId(`mvd-zwarcia-aparatura-pole-${pole}`);
    const wysokoscPx = await wiersz.evaluate((tr) => {
      const rozwiniecie = tr.nextElementSibling as HTMLElement | null;
      return tr.getBoundingClientRect().height + (rozwiniecie?.getBoundingClientRect().height ?? 0);
    });
    const teksty = await page.evaluate((p) => {
      const zebrane: Record<string, string> = {};
      for (const el of document.querySelectorAll<HTMLElement>('[data-testid^="mvd-zwarcia-aparatura-"]')) {
        const id = el.dataset.testid ?? '';
        if (id.endsWith(`-${p}`) || id.includes(`-${p}-`)) zebrane[id] = (el.innerText ?? '').trim();
      }
      return zebrane;
    }, pole);
    wynik[pole] = { wysokoscPx, teksty };
  }
  const wspolne = page.getByTestId('mvd-zwarcia-aparatura-prady-wspolne');
  if ((await wspolne.count()) > 0) {
    wynik['(wspólne)'] = { wysokoscPx: 0, teksty: { 'prady-wspolne': (await wspolne.innerText()).trim() } };
  }
  const ramka = await page.getByTestId('mvd-zwarcia-aparatura').boundingBox();
  return { wysokoscSekcjiPx: Math.round(ramka?.height ?? 0), pola: wynik };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('kd6:zrzuty', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const { id, mode } of THEMES) {
    test(`ogniwo z modelu + rozbicie czasu wyłączenia — ${id}`, async ({ page, request }) => {
      test.setTimeout(240000);
      const scena = await zbudujScene(request);

      await page.setViewportSize({ width: 1360, height: 1040 });
      await otworz(page, scena, mode, `/#analysis?run=${scena.runId}`);
      await otworzZakladkeWynikow(page, 'zwarcia');
      await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 30000 });
      await page
        .getByRole('row', { name: new RegExp(escapeRegExp(scena.punktNazwa)) })
        .first()
        .click();

      const sekcja = page.getByTestId('mvd-zwarcia-aparatura');
      await sekcja.scrollIntoViewIfNeeded();
      await page.getByTestId('mvd-zwarcia-aparatura-sprawdz').click();

      const pierwszePole = scena.polaZWerdyktem[0];
      const wiersz = page.getByTestId(`mvd-zwarcia-aparatura-pole-${pierwszePole}`);
      await expect(wiersz).toBeVisible({ timeout: 30000 });
      // Werdykt MUSI pochodzić z modelu — inaczej zrzut dokumentowałby co innego.
      await expect(wiersz).toHaveAttribute('data-zrodlo', 'model');

      // Tabela pól (karta APARATURA-TABELA): jeden wiersz na pole, natywne rozwinięcie
      // pierwszego wiersza pokazuje porównanie trzech kryteriów (szczytowy, cieplny,
      // wyłączalny) z liczbami rekordów K tego pola.
      const tabela = page.getByTestId('mvd-zwarcia-aparatura-werdykty');
      for (const pole of scena.polaZWerdyktem) {
        await expect(tabela.getByTestId(`mvd-zwarcia-aparatura-pole-${pole}`)).toBeVisible();
      }
      const przelacz = page.getByTestId(`mvd-zwarcia-aparatura-rozwin-${pierwszePole}`);
      await przelacz.click();
      await expect(przelacz).toHaveAttribute('aria-expanded', 'true');
      const porownanie = page.getByTestId(`mvd-zwarcia-aparatura-porownanie-${pierwszePole}`);
      await expect(porownanie).toBeVisible();
      expect(await porownanie.locator('tbody > tr').count()).toBe(3);
      const ramkaSekcji = await sekcja.boundingBox();
      expect(ramkaSekcji?.height ?? 0, 'sekcja aparatury o rozsądnej wysokości').toBeLessThan(20000);

      // Sekcja żyje w przewijanym kontenerze ekranu wyników: zrzut elementu wyższego niż okno
      // malował tylko część w oknie (pomiar FIX-E2E-PELNE), więc okno podnosimy do wysokości
      // sekcji, żeby kontener nie przewijał i cała sekcja była namalowana.
      await page.setViewportSize({
        width: 1360,
        height: Math.ceil(ramkaSekcji?.height ?? 0) + 600,
      });
      await sekcja.scrollIntoViewIfNeeded();
      await bramkaTresciMatematycznej(page);
      await sekcja.screenshot({ path: path.join(OUTPUT_DIR, `kd6-ogniwo-model-${id}.png`) });

      // Czas wyłączenia pierwszego pola pod tabelą kryteriów (t_zab + t_wył = T_k) i jego
      // szczegóły obliczeń (dane wejściowe → wzory → podstawienia → wyniki pośrednie → wynik).
      await page.getByTestId(`mvd-zwarcia-aparatura-szczegoly-przelacz-${pierwszePole}`).click();
      const szczegoly = page.getByTestId(`mvd-zwarcia-aparatura-szczegoly-${pierwszePole}`);
      await expect(szczegoly).toBeVisible();
      const czas = page.getByTestId(`mvd-zwarcia-aparatura-czas-szczegoly-${pierwszePole}`);
      await expect(czas).toBeVisible();
      // Karta KD6 (realny backend): tekst szczegółów i podpowiedzi bez symbolu w notacji ASCII
      // z podkreśleniem (symbole wyłącznie przez MathRenderer), zdanie członu nastawczego nazywa
      // zabezpieczenie przez pole, bez dublowania słowa, a zapas nie używa litery m.
      const tekstySzczegolow = await szczegoly.evaluate((el) => {
        const kopia = el.cloneNode(true) as HTMLElement;
        kopia.querySelectorAll('[data-latex]').forEach((w) => w.remove());
        const tytuly = [...el.querySelectorAll('[title]')].map((w) => w.getAttribute('title') ?? '');
        const wzory = [...el.querySelectorAll('[data-latex]')].map((w) => w.getAttribute('data-latex') ?? '');
        return { tekst: kopia.textContent ?? '', tytuly, wzory };
      });
      const golyIndeks = /(?<![\p{L}\p{N}_\\])\p{L}_(?:\{[^}]*\}|[\p{L}\p{N}]+)/u;
      expect(tekstySzczegolow.tekst).not.toMatch(golyIndeks);
      for (const tytul of tekstySzczegolow.tytuly) expect(tytul).not.toMatch(golyIndeks);
      const opisCzasu = (await page.getByTestId(`mvd-zwarcia-aparatura-czas-opis-${pierwszePole}`).textContent()) ?? '';
      expect(opisCzasu).toContain('charakterystyka: czas niezależny (DT), zabezpieczenie pola „');
      expect(opisCzasu).not.toMatch(/zabezpieczeni[ae] Zabezpieczenie/);
      expect(tekstySzczegolow.wzory.filter((w) => /^m\s*=/.test(w))).toEqual([]);
      const ramkaSzczegolow = await szczegoly.boundingBox();
      await page.setViewportSize({
        width: 1360,
        height: Math.ceil((ramkaSekcji?.height ?? 0) + (ramkaSzczegolow?.height ?? 0)) + 600,
      });
      await czas.scrollIntoViewIfNeeded();
      await bramkaTresciMatematycznej(page);
      await czas.screenshot({ path: path.join(OUTPUT_DIR, `kd6-tclearing-${id}.png`) });

      // POMIAR (standard §10 kontraktu prezentacji: meldunek podaje pomiar przed/po): każde pole
      // rozwinięte natywnie, ze szczegółami obliczeń; liczby z DOM (prądy, Tk, zapasy, wartości
      // porównania) i wysokości do pliku wyników biegu — porównanie liczb przed/po zmianie UI.
      const pomiar = await zmierzSzczegolyPol(page, scena.polaZWerdyktem);
      fs.writeFileSync(test.info().outputPath(`kd6-pomiar-${id}.json`), JSON.stringify(pomiar, null, 2));

      // Zrzut widoku każdego pola rozwiniętego ze szczegółami obliczeń (karta KD6-SZCZEGOLY):
      // tabela kryteriów, czas wyłączenia, wyprowadzenie. Okno na całą sekcję (przewijany
      // kontener ekranu wyników maluje tylko część w oknie).
      await page.setViewportSize({ width: 1360, height: pomiar.wysokoscSekcjiPx + 600 });
      for (const [i, pole] of scena.polaZWerdyktem.entries()) {
        const widokPola = page.getByTestId(`mvd-zwarcia-aparatura-rozwiniecie-${pole}`);
        await widokPola.scrollIntoViewIfNeeded();
        await bramkaTresciMatematycznej(page);
        await widokPola.screenshot({
          path: path.join(OUTPUT_DIR, `kd6-szczegoly-pole${i + 1}-${id}.png`),
        });
      }
    });
  }
});
