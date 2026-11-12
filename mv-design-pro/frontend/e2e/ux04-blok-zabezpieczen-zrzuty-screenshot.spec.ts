/**
 * KARTA JEDNA NOTACJA BLOKU ZABEZPIECZEŃ (decyzja właściciela 2026-11-05: „tak ma być ramka we
 * wszystkich tak samo”) — kadry pól z zabezpieczeniami na ŻYWEJ kanwie `SldCanvasV3` i REALNYM
 * backendzie (materiał oceny wizualnej właściciela, bramka B-02; spec NIE wystawia werdyktu
 * wizualnego).
 *
 * Sieć budowana operacjami domenowymi API: GPZ z dwoma polami liniowymi wzorca ENEA Z.10 — pole
 * Z POWIĄZANIAMI obwodów wtórnych (funkcje 50/51/51N/79, które powiązania szablonu zasilają z T1/T2
 * i które wyłączają Q0: linie pomiarowe i linia wyłączania) i pole BEZ POWIĄZAŃ (funkcje 27 i 81U
 * ze słownika funkcji EAZ, których żaden aparat pola w modelu nie zasila ani nie wyłącza — wzorzec
 * Z.10 ich nie rysuje: ramka bez linii pomiarowych
 * i bez linii wyłączania — UX04 §11.20; kody funkcji z `Bay.protection_codes`, aparat pola
 * z katalogu), magistrala, stacja SN/nN
 * z polami SN z kodami funkcji i źródło PV przyłączone po stronie SN dedykowanym polem
 * źródłowym (tor DER-SN z transformatorem blokowym). Kadr każdego pola: kółko kamery wokół
 * rysunku pola, aż kanwa rysuje poziom szczegółu pola (LOD2), a cały rysunek pola — z ramką bloku
 * i podpisami — leży w kanwie (asercja); zrzut = obwiednia tego rysunku z marginesem.
 *
 * Sprawdzenia (rysunek z DOM kanwy): w kadrze pola blok zabezpieczeń to ramka
 * (`data-przekaznik="ramka-bloku"`) bez okręgu przekaźnika; wiersze kodów wewnątrz ramki niosą
 * DOKŁADNIE kody pola z modelu (kolejność danych); na całej kanwie nie ma glifu okręgu
 * przekaźnika; żaden kod ramki nie jest zasłonięty (`zaslonieciaKodowRamki`, werdykt B-02
 * właściciela 2026-11-05 — kod „81O” zasłonięty na zrzucie Z.11.1; iniekcja kreski przez kod
 * w każdym kadrze dowodzi, że wyrocznia gryzie). Sprawdzenia notacji są miękkie (`expect.soft`) — zrzut stanu sprzed zmiany
 * (`przed/<kadr>-przed-v3.png`) powstaje tym samym spekiem.
 *
 * Zrzuty: `docs/uiux/zrzuty/ux04-pole-liniowe/blok-<pole>-<motyw>.png` (do drzewa repo wyłącznie
 * z `ZRZUTY_DO_DOKUMENTACJI=1`, inaczej `test-results/zrzuty-dokumentacji/…`).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

import { SKALA_CZYTANIA, skalaKamery } from './skalaKamery';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { katalogZrzutow } from './katalogZrzutow';
import { usunIniekcje, wstrzyknijKreskePrzezKod, zaslonieciaKodowRamki } from './kodyRamkiBloku';
import { przelaczMotyw } from './powloka';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'ux04-pole-liniowe'));
const KANWA = 'svg[data-testid="sld-canvas-v3"]';
const WERSJA_KATALOGU = '2024.1';
const APARAT = 'sw-cb-abb-vd4-17kv-630a';
const KABEL = 'cable-tfk-yakxs-3x120';
const KABEL_DER = 'cable-base-epr-al-1c-240';
const ZRODLO = 'src-gpz-15kv-250mva-rx010';
const TRAFO = 'tr-sn-nn-15-04-630kva-dyn11';
const TRAFO_BLOKOWY = 'tr-sn-nn-15-04-1000kva-dyn11';
const PV = 'conv-pv-nn-0p5mw-0p4kv';

// Kody funkcji pól (dane aktywów `Bay.protection_codes`) — liczby kodów z iloczynu karty:
// 4 (GPZ z powiązaniami), 2 (GPZ bez powiązań), 7 (pole stacji), 2 (pole źródła).
const KODY_GPZ = ['50', '51', '51N', '79'] as const;
// Wyłącznie kody słownika funkcji EAZ (`network_model/catalog/funkcje_eaz.py`) — kod spoza
// słownika jest odmową operacji (`params.invalid_value`), nie danymi pola.
const KODY_GPZ_BEZ_POWIAZAN = ['27', '81U'] as const;
const KODY_STACJI = ['50', '51', '51N', '67N', '50N', '59N', '79'] as const;
const KODY_ZRODLA = ['50', '51'] as const;

type Aparat = { device_ref: string; kind?: string };
type Pole = { ref_id: string; substation_ref?: string | null; bay_role?: string; primary_devices?: Aparat[] };
type Enm = {
  substations?: Array<{ ref_id: string; station_type?: string | null; bus_refs?: string[] }>;
  bays?: Pole[];
  buses?: Array<{ ref_id: string; name?: string; voltage_kv?: number }>;
  branches?: Array<{ ref_id: string; name?: string; type?: string }>;
};

const katalog = (namespace: string, itemId: string) => ({
  catalog_namespace: namespace,
  catalog_item_id: itemId,
  catalog_item_version: WERSJA_KATALOGU,
});

let licznik = 0;

async function operacja(request: APIRequestContext, caseId: string, name: string, payload: Record<string, unknown>): Promise<Enm> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: { name, idempotency_key: `blok-zabezpieczen-${caseId}-${String(++licznik).padStart(4, '0')}`, payload },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { error?: string | null; snapshot?: Enm };
  expect(body.error ?? null, name).toBeNull();
  return body.snapshot ?? {};
}

interface Siec {
  readonly projectId: string;
  readonly projectName: string;
  readonly caseId: string;
  readonly caseName: string;
  readonly poleGpz: Pole;
  readonly poleGpzBezPowiazan: Pole;
  readonly poleStacji: Pole;
  readonly poleZrodla: Pole;
}

async function zbudujSiec(request: APIRequestContext): Promise<Siec> {
  const suffix = Date.now().toString(36);
  const projectName = `Blok zabezpieczeń ${suffix}`;
  const caseName = `Pola z zabezpieczeniami ${suffix}`;
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: 'Jedna notacja bloku zabezpieczeń', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
  });
  expect(projekt.ok()).toBeTruthy();
  const projectId = ((await projekt.json()) as { id: string }).id;
  const przypadek = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: projectId, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(przypadek.ok()).toBeTruthy();
  const caseId = ((await przypadek.json()) as { id: string }).id;

  let enm = await operacja(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    catalog_binding: katalog('ZRODLO_SN', ZRODLO),
    sections_count: 1,
    line_fields_per_section: 2,
    gpz_line_field_apparatus: { catalog_binding: katalog('APARAT_SN', APARAT) },
  });
  const gpz = (enm.substations ?? []).find((s) => s.station_type === 'gpz');
  expect(gpz, 'GPZ w modelu').toBeTruthy();
  const polaGpz = (enm.bays ?? []).filter((b) => b.substation_ref === gpz!.ref_id && (b.bay_role === 'OUT' || b.bay_role === 'FEEDER'));
  expect(polaGpz.length, 'dwa pola liniowe GPZ').toBeGreaterThanOrEqual(2);
  const poleGpzRef = polaGpz[0].ref_id;
  const poleGpzBezPowiazanRef = polaGpz[1].ref_id;
  await operacja(request, caseId, 'update_element_parameters', { element_ref: poleGpzRef, parameters: { protection_codes: [...KODY_GPZ] } });
  await operacja(request, caseId, 'update_element_parameters', {
    element_ref: poleGpzBezPowiazanRef,
    parameters: { protection_codes: [...KODY_GPZ_BEZ_POWIAZAN] },
  });
  enm = await operacja(request, caseId, 'continue_trunk_segment_sn', {
    field_ref: poleGpzRef,
    segment: { rodzaj: 'KABEL', dlugosc_m: 800, catalog_binding: katalog('KABEL_SN', KABEL), name: 'Odcinek 1' },
  });
  const odcinek1 = (enm.branches ?? []).find((b) => b.type === 'cable' && b.name === 'Odcinek 1');
  expect(odcinek1, 'odcinek magistrali').toBeTruthy();
  enm = await operacja(request, caseId, 'insert_station_on_segment_sn', {
    nn_earthing: { lv_voltage_tolerance: 'PLUS_10' },
    field_apparatus_catalog_ref: APARAT,
    insert_at: { value: 0.5 },
    transformer: { create: true, catalog_binding: katalog('TRAFO_SN_NN', TRAFO) },
    segment_ref: odcinek1!.ref_id,
    station_type: 'B',
    station: { name: 'Stacja z zabezpieczeniami', sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: ['IN', 'OUT', 'FEEDER', 'FEEDER'],
  });
  const stacja = (enm.substations ?? []).find((s) => s.station_type !== 'gpz');
  expect(stacja, 'stacja SN/nN').toBeTruthy();
  const polaStacji = (enm.bays ?? []).filter((b) => b.substation_ref === stacja!.ref_id);
  const poleOdgalezne = polaStacji.find((b) => b.bay_role === 'FEEDER');
  expect(poleOdgalezne, 'pole odgałęźne stacji').toBeTruthy();
  await operacja(request, caseId, 'update_element_parameters', {
    element_ref: poleOdgalezne!.ref_id,
    parameters: { protection_codes: [...KODY_STACJI] },
  });
  // Źródło PV po stronie SN: dedykowane pole źródłowe SN stacji (tor DER-SN z transformatorem
  // blokowym i przekaźnikiem pola).
  const szynaSn = (enm.buses ?? []).find((b) => (stacja!.bus_refs ?? []).includes(b.ref_id) && (b.voltage_kv ?? 0) > 1.0);
  expect(szynaSn, 'szyna SN stacji').toBeTruthy();
  const przedZrodlem = new Set((enm.bays ?? []).map((b) => b.ref_id));
  enm = await operacja(request, caseId, 'add_converter_source', {
    source_technology: 'PV',
    connection_variant: 'block_transformer',
    station_ref: stacja!.ref_id,
    bus_nn_ref: szynaSn!.ref_id,
    source_name: 'PV SN',
    quantity: 1,
    power_setpoint_mw: 0.5,
    catalog_binding: katalog('ZRODLO_NN_PV', PV),
    der_topology: {
      connection_level: 'sn',
      inverter_output_voltage_kv: 0.4,
      has_manufacturer_lv_switchgear: true,
      lv_switchgear_variant: 'multi-feeder',
      has_block_transformer: true,
      block_transformer: {
        rated_power_mva: 1.0,
        primary_voltage_kv: 15.0,
        secondary_voltage_kv: 0.4,
        lv_voltage_tolerance: 'PLUS_6',
        catalog_binding: katalog('TRAFO_SN_NN', TRAFO_BLOKOWY),
      },
      mv_bus_ref: szynaSn!.ref_id,
      mv_field_configuration: {
        switching_device: 'CB',
        ct: true,
        vt: true,
        earthing_switch: true,
        surge_arrester: true,
        protection_relay: true,
        cable_head: true,
        cable_length_km: 0.05,
        apparatus_catalog_binding: katalog('APARAT_SN', APARAT),
        cable_catalog_ref: KABEL_DER,
        cable_catalog_binding: katalog('KABEL_SN', KABEL_DER),
      },
    },
  });
  const poleZrodlaRef = (enm.bays ?? []).find((b) => !przedZrodlem.has(b.ref_id) && b.substation_ref === stacja!.ref_id)?.ref_id;
  expect(poleZrodlaRef, 'pole źródłowe SN stacji').toBeTruthy();
  enm = await operacja(request, caseId, 'update_element_parameters', {
    element_ref: poleZrodlaRef,
    parameters: { protection_codes: [...KODY_ZRODLA] },
  });
  const pole = (ref: string | undefined) => (enm.bays ?? []).find((b) => b.ref_id === ref)!;
  return {
    projectId,
    projectName,
    caseId,
    caseName,
    poleGpz: pole(poleGpzRef),
    poleGpzBezPowiazan: pole(poleGpzBezPowiazanRef),
    poleStacji: pole(poleOdgalezne!.ref_id),
    poleZrodla: pole(poleZrodlaRef),
  };
}

async function otworzSchemat(page: Page, s: Siec): Promise<void> {
  await page.addInitScript((seed) => {
    if (localStorage.getItem('mv-design-app-state') !== null) return;
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
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, { projectId: s.projectId, projectName: s.projectName, caseId: s.caseId, caseName: s.caseName });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/#sld', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 60000 });
  await expect.poll(async () => page.locator('[data-hit-klasa]').count(), { timeout: 60000 }).toBeGreaterThan(0);
}

async function ustawMotyw(page: Page, docelowy: 'dark_scada' | 'light_technical'): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    if ((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === docelowy) return;
    await przelaczMotyw(page);
    await page.waitForTimeout(300);
  }
  await expect.poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(docelowy);
}

async function widokCalejSieci(page: Page): Promise<void> {
  await page.getByTestId('sld-v3-dopasuj-do-toggle').click();
  await page.getByTestId('sld-v3-dopasuj-do-siec').click();
  await expect(page.locator(`${KANWA} [data-kadr="poza"]`)).toHaveCount(0, { timeout: 15000 });
  await page.waitForTimeout(400);
}

/** Obwiednia ekranowa CAŁEGO rysunku pola na kanwie: symbole aparatów pola (`data-device-ref`)
 *  ∪ każdy element, którego właścicielem jest pole albo jego część (`data-owner-ref` = pole lub
 *  `pole#…` — ramka bloku z kodami, podpisy, tabliczki, linie wyłączania i pomiaru, nagłówek).
 *  Warstwa trafień pominięta. `null`, gdy pole nienarysowane. Pomiar 2026-11-05: obwiednia
 *  samych uchwytów aparatów (pole stacji = jeden aparat Q1) zatrzymywała kamerę z ramką bloku
 *  i połową podpisu poza kanwą — zrzut nie pokazywał tego, co miał pokazać. */
async function obwiedniaPola(page: Page, pole: Pole): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const refs = (pole.primary_devices ?? []).map((d) => d.device_ref);
  return page.evaluate(({ kanwa, r, bay }) => {
    const svg = document.querySelector(kanwa);
    if (!svg) return null;
    const nalezy = (el: Element) => {
      const ref = el.getAttribute('data-owner-ref') ?? '';
      return ref === bay || ref.startsWith(`${bay}#`) || r.includes(el.getAttribute('data-device-ref') ?? '');
    };
    const pudla = [...svg.querySelectorAll('[data-owner-ref], [data-device-ref]')]
      .filter((el) => nalezy(el) && !el.closest('[data-testid="sld-v3-trafienia"]'))
      .map((el) => el.getBoundingClientRect())
      .filter((b) => b.width > 0 && b.height > 0);
    if (pudla.length === 0) return null;
    const x0 = Math.min(...pudla.map((b) => b.left));
    const y0 = Math.min(...pudla.map((b) => b.top));
    const x1 = Math.max(...pudla.map((b) => b.right));
    const y1 = Math.max(...pudla.map((b) => b.bottom));
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }, { kanwa: KANWA, r: refs, bay: pole.ref_id });
}

/** Kółko kamery wokół pola (kursor na środku obwiedni rysunku pola, rysunek przeciągany do
 *  środka kanwy), aż kanwa rysuje LOD2, CAŁY rysunek pola (z ramką bloku i podpisami) leży
 *  w kanwie i zajmuje co najmniej 40 % jej wysokości albo 50 % szerokości. Rysunek większy niż
 *  kanwa — kółko w drugą stronę. */
async function przyblizDoPola(page: Page, pole: Pole, opis: string): Promise<void> {
  const kanwa = page.locator(KANWA);
  const wKadrze = (b: { x: number; y: number; width: number; height: number }, k: { x: number; y: number; width: number; height: number }) =>
    b.x >= k.x && b.y >= k.y && b.x + b.width <= k.x + k.width && b.y + b.height <= k.y + k.height;
  for (let i = 0; i < 80; i += 1) {
    const k = (await kanwa.boundingBox())!;
    const b = await obwiedniaPola(page, pole);
    const czytelny = (await skalaKamery(kanwa)) >= SKALA_CZYTANIA;
    if (czytelny && b && wKadrze(b, k) && (b.height >= 0.4 * k.height || b.width >= 0.5 * k.width)) break;
    const cx = b ? b.x + b.width / 2 : k.x + k.width / 2;
    const cy = b ? b.y + b.height / 2 : k.y + k.height / 2;
    const px = Math.min(Math.max(cx, k.x + 40), k.x + k.width - 40);
    const py = Math.min(Math.max(cy, k.y + 40), k.y + k.height - 40);
    const zaDuzy = b != null && (b.width > 0.95 * k.width || b.height > 0.95 * k.height);
    const odSrodka = b != null && Math.hypot(cx - (k.x + k.width / 2), cy - (k.y + k.height / 2)) > 24;
    if (b && !wKadrze(b, k) && !zaDuzy && odSrodka) {
      await page.mouse.move(px, py);
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2, { steps: 4 });
      await page.mouse.up({ button: 'middle' });
    } else {
      await page.mouse.move(px, py);
      await page.mouse.wheel(0, zaDuzy ? 120 : -240);
    }
    await page.waitForTimeout(200);
  }
  await expect.poll(() => skalaKamery(kanwa), { message: `${opis}: kadr pola w skali czytania` }).toBeGreaterThanOrEqual(SKALA_CZYTANIA);
  await page.waitForTimeout(500);
  const k = (await kanwa.boundingBox())!;
  const b = await obwiedniaPola(page, pole);
  expect(b != null && wKadrze(b, k), `${opis}: cały rysunek pola (ramka bloku, podpisy) w kanwie`).toBe(true);
}

/** Pomiar bloku zabezpieczeń pola z DOM kanwy: ramki, okręgi w grupie bloku, wiersze kodów. */
async function blokPola(page: Page, bayRef: string) {
  return page.evaluate(
    ({ kanwa, ref }) => {
      const svg = document.querySelector(kanwa)!;
      // Okrąg notacji bloku — z pominięciem znaku ostrzeżenia topologii („!" w okręgu w rogu
      // ramki, `data-topology-warning`): to odrębny znak stanu pola, nie notacja bloku; ta sama
      // reguła co wyrocznia sceny (a) `blokZabezpieczenNotacja.contract.test.tsx::naruszeniaGlifu`.
      const okregiBloku = (g: Element) =>
        [...g.querySelectorAll('circle, ellipse')].filter((e) => !e.closest('[data-topology-warning]')).length;
      const przekazniki = [...svg.querySelectorAll('[data-symbol-canon="protectionRelay"]')].filter(
        (g) => g.closest('[data-owner-ref]')?.getAttribute('data-owner-ref') === ref,
      );
      const wiersze = [...svg.querySelectorAll('g[data-owner-ref] > text')]
        .filter((t) => /#protection-codes-full(-\d+)?$/.test(t.parentElement!.getAttribute('data-owner-ref') ?? ''))
        .filter((t) => (t.parentElement!.getAttribute('data-owner-ref') ?? '').startsWith(`${ref}#`))
        .map((t) => (t.textContent ?? '').trim());
      return {
        przekazniki: przekazniki.length,
        ramki: przekazniki.filter((g) => g.querySelector('[data-przekaznik="ramka-bloku"]')).length,
        okregi: przekazniki.reduce((n, g) => n + okregiBloku(g), 0),
        wiersze,
        okregiNaKanwie: [...svg.querySelectorAll('[data-symbol-canon="protectionRelay"]')].reduce((n, g) => n + okregiBloku(g), 0),
      };
    },
    { kanwa: KANWA, ref: bayRef },
  );
}

/** Kolumna oznaczeń pola na ekranie (wzorzec właściciela 2026-11-05: „Opisy pól po lewej dzięki
 *  temu pole robi się czytelniejsze i węższe”): oznaczenia aparatów pola — GPZ
 *  `#etykieta-aparatu-`, pole stacji i źródła `#apparatus-id-` (tekst poziomy) — i tabliczki
 *  przekładników. Zwraca rozrzut lewych krawędzi oznaczeń [px] i opisy, których prawa krawędź
 *  wychodzi poza lewą krawędź symboli aparatów pola (opis przy torze albo po jego prawej). */
async function kolumnaOznaczenPola(page: Page, pole: Pole) {
  return page.evaluate(
    ({ kanwa, ref, refy }) => {
      const teksty = (wzor: RegExp) =>
        [...document.querySelectorAll(`${kanwa} g[data-owner-ref^="${ref}#"] > text`)]
          .filter((t) => wzor.test(t.parentElement!.getAttribute('data-owner-ref') ?? '') && !t.hasAttribute('transform'))
          .map((t) => ({ tekst: t.textContent ?? '', r: t.getBoundingClientRect() }));
      const oznaczenia = teksty(/#(etykieta-aparatu-|apparatus-id-)/);
      const tabliczki = teksty(/#(ct|vt|cbct)-rating-/);
      const symbole = [...document.querySelectorAll(`${kanwa} g[data-device-ref]`)]
        .filter((g) => refy.includes(g.getAttribute('data-device-ref') ?? ''))
        .map((g) => g.getBoundingClientRect())
        .filter((r) => r.width > 0);
      const lewaSymboli = symbole.length > 0 ? Math.min(...symbole.map((r) => r.x)) : Number.POSITIVE_INFINITY;
      const lewe = oznaczenia.map((o) => o.r.x);
      return {
        liczba: oznaczenia.length,
        rozrzut: lewe.length > 0 ? Math.max(...lewe) - Math.min(...lewe) : 0,
        poPrawej: [...oznaczenia, ...tabliczki].filter((o) => o.r.x + o.r.width > lewaSymboli + 1).map((o) => o.tekst),
      };
    },
    { kanwa: KANWA, ref: pole.ref_id, refy: (pole.primary_devices ?? []).map((d) => d.device_ref) },
  );
}

/** Kadr zrzutu: obwiednia całego rysunku pola (`obwiedniaPola`) z marginesem, przycięta do kanwy. */
async function kadr(page: Page, pole: Pole): Promise<{ x: number; y: number; width: number; height: number }> {
  const k = (await page.locator(KANWA).boundingBox())!;
  const b = (await obwiedniaPola(page, pole))!;
  const x = Math.max(k.x, b.x - 32);
  const y = Math.max(k.y, b.y - 32);
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(Math.min(k.x + k.width, b.x + b.width + 32) - x),
    height: Math.round(Math.min(k.y + k.height, b.y + b.height + 32) - y),
  };
}

test('Blok zabezpieczeń — jedna notacja: pole stacji SN, pole GPZ z powiązaniami i bez, pole źródła OZE (oba motywy)', async ({ page, request }) => {
  test.setTimeout(600000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const siec = await zbudujSiec(request);
  await otworzSchemat(page, siec);
  // `powiazania`: czy model wiąże funkcje pola z aparatami (linie pomiarowe i linia wyłączania
  // na kanwie); `null` — kadr nie przypina linii (pole stacji i źródła: wg powiązań ich rekordów).
  const kadry: readonly { readonly nazwa: string; readonly pole: Pole; readonly kody: readonly string[]; readonly powiazania: boolean | null }[] = [
    { nazwa: 'blok-pole-stacji-sn', pole: siec.poleStacji, kody: KODY_STACJI, powiazania: null },
    { nazwa: 'blok-pole-gpz-z-powiazaniami', pole: siec.poleGpz, kody: KODY_GPZ, powiazania: true },
    { nazwa: 'blok-pole-gpz-bez-powiazan', pole: siec.poleGpzBezPowiazan, kody: KODY_GPZ_BEZ_POWIAZAN, powiazania: false },
    { nazwa: 'blok-pole-zrodla-oze', pole: siec.poleZrodla, kody: KODY_ZRODLA, powiazania: null },
  ];
  for (const motyw of [
    { klucz: 'ciemny', theme: 'dark_scada' as const },
    { klucz: 'jasny', theme: 'light_technical' as const },
  ]) {
    await ustawMotyw(page, motyw.theme);
    for (const { nazwa, pole, kody, powiazania } of kadry) {
      const opis = `${nazwa} (${motyw.klucz})`;
      await widokCalejSieci(page);
      await przyblizDoPola(page, pole, opis);
      await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `${nazwa}-${motyw.klucz}.png`), clip: await kadr(page, pole) });
      const blok = await blokPola(page, pole.ref_id);
      expect.soft(blok.przekazniki, `${opis}: jeden blok zabezpieczeń pola`).toBe(1);
      expect.soft(blok.ramki, `${opis}: blok to ramka`).toBe(1);
      expect.soft(blok.okregi, `${opis}: bez okręgu przekaźnika`).toBe(0);
      expect.soft(blok.okregiNaKanwie, `${opis}: brak okręgu przekaźnika na całej kanwie`).toBe(0);
      expect.soft([...blok.wiersze].sort(), `${opis}: kody z modelu w ramce`).toEqual([...kody].sort());
      expect.soft(await zaslonieciaKodowRamki(page, KANWA), `${opis}: kody ramki niezasłonięte`).toEqual([]);
      const kolumna = await kolumnaOznaczenPola(page, pole);
      expect.soft(kolumna.liczba, `${opis}: oznaczenia aparatów pola na kanwie`).toBeGreaterThan(0);
      expect.soft(kolumna.rozrzut, `${opis}: oznaczenia w jednej kolumnie (wspólna lewa krawędź)`).toBeLessThanOrEqual(1);
      expect.soft(kolumna.poPrawej, `${opis}: żaden opis aparatu przy torze ani po jego prawej`).toEqual([]);
      if (powiazania !== null) {
        const linie = await page.evaluate(
          ({ kanwa, ref }) => ({
            pomiar: document.querySelectorAll(`${kanwa} [data-owner-ref^="${ref}#measurement-link"]`).length,
            wylaczanie: document.querySelectorAll(`${kanwa} [data-owner-ref="${ref}#trip-line"]`).length,
          }),
          { kanwa: KANWA, ref: pole.ref_id },
        );
        if (powiazania) {
          expect.soft(linie.pomiar, `${opis}: linie pomiarowe z powiązań modelu`).toBeGreaterThan(0);
          expect.soft(linie.wylaczanie, `${opis}: linia wyłączania z powiązań modelu`).toBeGreaterThan(0);
        } else {
          expect.soft(linie, `${opis}: bez powiązań — bez linii pomiarowych i bez linii wyłączania`).toEqual({ pomiar: 0, wylaczanie: 0 });
        }
      }
      // Iniekcja: kreska przez kod ramki — wyrocznia musi ją zgłosić.
      expect.soft(await wstrzyknijKreskePrzezKod(page, KANWA), `${opis}: kod ramki do iniekcji`).toBe(true);
      expect.soft((await zaslonieciaKodowRamki(page, KANWA)).length, `${opis}: iniekcja kreski przez kod gryzie`).toBeGreaterThan(0);
      await usunIniekcje(page, KANWA);
    }
  }
});
