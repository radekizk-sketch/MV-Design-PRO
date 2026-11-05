/**
 * Karta EWALUATORY-ZIEMNOZWARCIOWE — zabezpieczenie ziemnozwarciowe kierunkowe 67N ustawione
 * NATYWNYMI klikami w edytorze nastaw i ocenione w biegu oceny zabezpieczeń (E-28).
 *
 * INTENCJA. Funkcje ziemnozwarciowe (51N, 67N, …) miały w systemie nastawy, ale nie miały
 * ewaluatora: ocena zabezpieczeń liczyła wyłącznie funkcje fazowe na prądach zwarć
 * międzyfazowych. Teraz prąd w miejscu zabezpieczenia (3I₀ pola, kąt względem 3U₀) liczy solver
 * doziemień SN z sieci zerowej modelu, wg sposobu pracy punktu neutralnego, a ocena czułości,
 * selektywności i czasu idzie do JEDNEJ tabeli z werdyktem wyjaśnialnym — na ekranie oceny
 * zabezpieczeń (E-28) i w szczegółach karty nastaw sterownika (E-27).
 *
 * DROGA (realny backend; przez API tylko szkielet sieci, jak w `porownanie-zwarc-delty.spec.ts`):
 * GPZ 15 kV kompensowany dławikiem z wymuszeniem AWSC 25 A, dwa pola liniowe w wykonaniu ENEA
 * Z.10 (przekładnik Ferrantiego), pole pomiaru napięcia szyn Z.17 (3U₀ z otwartego trójkąta)
 * powiązane z polami, uziom GPZ R_E = 2,5 Ω, r = 0,6 → paleta poleceń „Zabezpieczenia
 * i automatyka" → edytor nastaw sterownika pola 1 (67N: 2 A pierwotnie, DT 0,5 s, do linii,
 * kryterium cos φ — kąt 0°; I> (51) 300 A DT 0,8 s; pozostałe funkcje zestawu wyłączone) → „Oblicz" → E-28 „Oceń
 * zabezpieczenia" → wiersze 67N w tabeli ziemnozwarciowej → szczegóły karty nastaw.
 *
 * WYROCZNIA. To, CO WIDAĆ, = to, CO ZWRÓCIŁ backend (`GET /api/protection-runs/{id}/results`,
 * pole `ziemnozwarciowe`): każdy rekord 67N sterownika pola 1 ma wiersz o tym samym
 * kryterium i statusie maszynowym. Liczba fizyczna: wymuszenie AWSC 25 A to składowa czynna
 * prądu ziemnozwarciowego w polu linii doziemionej, o rząd wielkości powyżej progu 2 A —
 * czułość 67N z wymuszeniem MUSI być spełniona (rekord CZULOSC ze statusem SPELNIA).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import { katalogZrzutow } from './katalogZrzutow';
import { otworzZakladkeWynikow } from './nawigacjaWynikow';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const ZRODLO = 'src-gpz-15kv-250mva-rx010';
const APARAT = 'sw-cb-abb-vd4-17kv-630a';
const KABEL = 'cable-tfk-yakxs-3x120';
/** Aparat toru pola pomiaru napięcia (odłącznik/rozłącznik toru przekładników napięciowych) —
 *  kreator pola SN wymaga pozycji katalogu APARAT_SN także dla pola pomiarowego. */
const APARAT_POMIARU = 'sw-ls-ogolny-prozniowy-24kv-630a';
const WERSJA_KATALOGU = '2024.1';
const SZABLON_Z10 = 'bay_template_gpz_line_enea_z10_trojpolozeniowy';
const SZABLON_Z17 = 'bay_template_gpz_pomiar_napiecia_enea_z17';
const DLUGOSCI_POL_M = [5000, 10000];
const OUTPUT_DIR = katalogZrzutow(path.resolve(process.cwd(), '../docs/audit/visual/zabezpieczenia-ziemnozwarciowe'));

type Pole = {
  ref_id: string;
  tags?: string[];
  gpz_section_id?: string | null;
  primary_devices?: Array<{ kind: string; device_ref: string }>;
};
type Sterownik = { ref_id: string; bay_ref?: string | null; funkcje: Array<{ ref: string; kod: string }> };
type Migawka = {
  bays: Pole[];
  substations: Array<{ ref_id: string; gpz_sections?: Array<{ section_id: string; bus_ref: string }> }>;
  protection_assignments: Sterownik[];
};
type RekordZiemny = {
  urzadzenie_ref: string;
  kod: string | null;
  kryterium: string;
  status: string;
  zdanie_pl: string;
};
type WynikOceny = {
  ziemnozwarciowe: { oceny: RekordZiemny[]; odmowy: RekordZiemny[]; uziemienia: RekordZiemny[] } | null;
};

let licznikOperacji = 0;

function katalog(przestrzen: string, pozycja: string) {
  return { catalog_namespace: przestrzen, catalog_item_id: pozycja, catalog_item_version: WERSJA_KATALOGU };
}

async function operacja(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<Migawka> {
  const odpowiedz = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: {
        name,
        idempotency_key: `e2e-ziemne-${name}-${String(++licznikOperacji).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(odpowiedz.ok(), await odpowiedz.text()).toBeTruthy();
  const cialo = (await odpowiedz.json()) as { error?: string | null; snapshot: Migawka };
  expect(cialo.error ?? null).toBeNull();
  return cialo.snapshot;
}

async function otworzAplikacje(page: Page, request: APIRequestContext) {
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: 'E2E ocena ziemnozwarciowa 67N',
      description: 'Ocena funkcji ziemnozwarciowych z solvera doziemień SN',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projekt.ok()).toBeTruthy();
  const { id: projectId } = (await projekt.json()) as { id: string };
  const przypadek = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: projectId, name: 'Przypadek doziemienia', description: '', config: {}, set_active: true },
  });
  expect(przypadek.ok()).toBeTruthy();
  const { id: caseId } = (await przypadek.json()) as { id: string };
  await page.addInitScript(
    (dane) => {
      localStorage.setItem(
        'mv-design-app-state',
        JSON.stringify({
          state: {
            activeProjectId: dane.projectId,
            activeProjectName: 'E2E ocena ziemnozwarciowa 67N',
            activeCaseId: dane.caseId,
            activeCaseName: 'Przypadek doziemienia',
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
    },
    { projectId, caseId },
  );
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  return { projectId, caseId };
}

/**
 * Szkielet sieci operacjami domenowymi — ten sam kształt co scena backendu
 * `tests/reference_networks/scena_doziemienia.py` (sposób pracy KOMPENSOWANY_AWSC), z dwoma
 * polami liniowymi zamiast trzech i bez odejścia ST1. Zwraca pole 1 i jego sterownik.
 */
async function zbudujSiec(request: APIRequestContext, caseId: string) {
  let m = await operacja(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    catalog_binding: katalog('ZRODLO_SN', ZRODLO),
    sections_count: 1,
    line_fields_per_section: DLUGOSCI_POL_M.length,
    gpz_line_field_apparatus: { catalog_binding: katalog('APARAT_SN', APARAT) },
    grounding: { type: 'petersen_coil', r_ohm: 6.0, x_ohm: 80.0, awsc_prad_wymuszenia_a: 25.0 },
    zero_sequence: { enabled: true, r0_ohm: 18.0, x0_ohm: 240.0 },
  });
  const stacja = m.substations.find((s) => (s.gpz_sections ?? []).length > 0)!;
  const sekcja = stacja.gpz_sections![0];

  const przed = new Set(m.bays.map((b) => b.ref_id));
  m = await operacja(request, caseId, 'add_sn_bay', {
    bus_ref: sekcja.bus_ref,
    station_ref: stacja.ref_id,
    bay_role: 'MEASUREMENT',
    apparatus_kind: 'MEASUREMENT',
    funkcja_pomiaru: 'NAPIECIA_SZYN',
    catalog_binding: katalog('APARAT_SN', APARAT_POMIARU),
  });
  const polePomiaru = m.bays.find((b) => !przed.has(b.ref_id))!.ref_id;
  m = await operacja(request, caseId, 'set_bay_equipment', {
    bay_ref: polePomiaru,
    mode: 'szablon',
    bay_template_ref: SZABLON_Z17,
  });
  const vtU0 = m.bays
    .find((b) => b.ref_id === polePomiaru)!
    .primary_devices!.find((a) => a.kind === 'VT')!.device_ref;

  const polaLiniowe = m.bays
    .filter((b) => (b.tags ?? []).includes('gpz_line_field'))
    .map((b) => b.ref_id)
    .sort();
  expect(polaLiniowe).toHaveLength(DLUGOSCI_POL_M.length);
  for (const [i, pole] of polaLiniowe.entries()) {
    m = await operacja(request, caseId, 'set_bay_equipment', {
      bay_ref: pole,
      mode: 'szablon',
      bay_template_ref: SZABLON_Z10,
      zrodlo_u0_ref: vtU0,
    });
    m = await operacja(request, caseId, 'continue_trunk_segment_sn', {
      field_ref: pole,
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: DLUGOSCI_POL_M[i],
        name: `Kabel pola ${i + 1}`,
        catalog_binding: katalog('KABEL_SN', KABEL),
      },
    });
  }
  m = await operacja(request, caseId, 'update_element_parameters', {
    element_ref: stacja.ref_id,
    parameters: { uziom_rezystancja_ohm: 2.5, uziom_wspolczynnik_redukcji: 0.6 },
  });

  const gotowosc = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`);
  expect(gotowosc.ok()).toBeTruthy();
  const odczyt = (await gotowosc.json()) as { ready: boolean; issues?: unknown[] };
  expect(odczyt.ready, JSON.stringify(odczyt.issues ?? [])).toBe(true);

  const pole1 = polaLiniowe[0];
  const sterownik = m.protection_assignments.find((p) => p.bay_ref === pole1)!;
  expect(sterownik.funkcje.map((f) => f.kod)).toContain('67N');
  return { pole1, sterownik };
}

async function otworzZabezpieczeniaIAutomatyke(page: Page): Promise<void> {
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('mvd-cmdk-dialog')).toBeVisible();
  await page.getByTestId('mvd-cmdk-input').fill('Zabezpieczenia i automatyka');
  await page.getByTestId('mvd-cmdk-opcja-ekran:E-27').click();
  await expect(page.getByTestId('mvd-za-zabezpieczenia')).toBeVisible({ timeout: 20000 });
}

/** Edytor nastaw sterownika pola (wiersz tabeli E-27 = pole, rozwijany natywnym klikiem). */
async function edytorSterownika(page: Page, poleRef: string, sterownikRef: string): Promise<string> {
  const przelacz = page.getByTestId(`mvd-za-nastawy-${poleRef}`);
  await expect(przelacz).toBeVisible({ timeout: 20000 });
  if ((await przelacz.getAttribute('aria-expanded')) !== 'true') await przelacz.click();
  const prefiks = `mvd-za-edytor-${sterownikRef}`;
  await expect(page.getByTestId(prefiks)).toBeVisible({ timeout: 20000 });
  return prefiks;
}

async function otworzOceneZabezpieczen(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 20000 });
  await otworzZakladkeWynikow(page, 'koordynacja');
  await expect(page.getByTestId('mvd-ocena-zabezpieczen')).toBeVisible({ timeout: 20000 });
}

test('EWALUATORY-ZIEMNOZWARCIOWE: 67N z edytora nastaw → bieg → ocena ziemnozwarciowa na E-28 i E-27', async ({
  page,
  request,
}) => {
  test.setTimeout(420000);

  const { caseId } = await otworzAplikacje(page, request);
  const { pole1, sterownik } = await zbudujSiec(request, caseId);
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });

  // (1) Nastawy natywnymi klikami: 67N (przedmiot karty) i I> (51) — pole liniowe bez stopnia
  // nadprądowego jest nazwanym brakiem urządzenia (`zabezpieczenia.brak_stopni_nadpradowych`),
  // nie wartością domyślną. Pozostałe funkcje zestawu Z.10 wyłączone świadomie — włączony
  // stopień bez nastaw też byłby brakiem.
  await otworzZabezpieczeniaIAutomatyke(page);
  const prefiks = await edytorSterownika(page, pole1, sterownik.ref_id);
  const funkcja67n = sterownik.funkcje.find((f) => f.kod === '67N')!;
  const funkcja51 = sterownik.funkcje.find((f) => f.kod === '51')!;
  for (const f of sterownik.funkcje) {
    const wlaczona = page.getByTestId(`${prefiks}-${f.ref}-wlaczona`);
    const chcemy = f.ref === funkcja67n.ref || f.ref === funkcja51.ref;
    if ((await wlaczona.isChecked()) !== chcemy) await wlaczona.click();
    if (chcemy) await expect(wlaczona).toBeChecked();
    else await expect(wlaczona).not.toBeChecked();
  }
  const pole51 = (klucz: string) => page.getByTestId(`${prefiks}-${funkcja51.ref}-${klucz}`);
  await pole51('prog').fill('300');
  await pole51('jednostka_progu').selectOption('A_PIERWOTNY');
  await pole51('krzywa').selectOption('DT');
  await pole51('zwloka_s').fill('0.8');
  const pole67n = (klucz: string) => page.getByTestId(`${prefiks}-${funkcja67n.ref}-${klucz}`);
  await pole67n('prog').fill('2');
  await pole67n('jednostka_progu').selectOption('A_PIERWOTNY');
  await pole67n('krzywa').selectOption('DT');
  await pole67n('zwloka_s').fill('0.5');
  await pole67n('kierunek').selectOption('DO_LINII');
  await pole67n('kat_charakterystyczny_deg').fill('0');
  await page.getByTestId(`${prefiks}-zapisz`).click();
  await expect(page.getByTestId(`${prefiks}-gotowe`)).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId(`${prefiks}-blad`)).toHaveCount(0);

  // Nastawa żyje w MODELU (jedna prawda): po przeładowaniu wraca z serwera.
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await otworzZabezpieczeniaIAutomatyke(page);
  await edytorSterownika(page, pole1, sterownik.ref_id);
  await expect(pole67n('prog')).toHaveValue('2', { timeout: 20000 });
  await expect(pole67n('kat_charakterystyczny_deg')).toHaveValue('0');

  // (2) Bieg zwarciowy realnym klikiem „Oblicz".
  await page.getByRole('button', { name: 'Oblicz', exact: true }).click();
  await expect(
    page.getByTestId('notification-toast').filter({ hasText: 'Obliczenie zakończone' }).first(),
  ).toBeVisible({ timeout: 90000 });

  // (3) Ocena zabezpieczeń (E-28) — bieg `protection_sn` niesie ocenę ziemnozwarciową.
  await otworzOceneZabezpieczen(page);
  const uruchom = page.getByTestId('mvd-ocena-zabezpieczen-uruchom');
  await expect(uruchom).toBeEnabled({ timeout: 20000 });
  const utworzenie = page.waitForResponse(
    (r) => /\/api\/projects\/[^/]+\/protection-runs$/.test(r.url()) && r.request().method() === 'POST',
    { timeout: 60000 },
  );
  await uruchom.click();
  const odpowiedz = await utworzenie;
  expect(odpowiedz.ok(), await odpowiedz.text()).toBeTruthy();
  const { id: runId } = (await odpowiedz.json()) as { id: string };
  await expect(page.getByTestId('mvd-ocena-zabezpieczen-wynik')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('mvd-ocena-zabezpieczen-blad')).toHaveCount(0);

  const wynik = (await (await request.get(`${BACKEND_BASE}/api/protection-runs/${runId}/results`)).json()) as WynikOceny;
  expect(wynik.ziemnozwarciowe, 'bieg oceny musi nieść ocenę ziemnozwarciową').not.toBeNull();
  const rekordy67n = wynik.ziemnozwarciowe!.oceny.filter(
    (r) => r.urzadzenie_ref === sterownik.ref_id && r.kod === '67N',
  );
  expect(rekordy67n.length, 'ocena 67N pola 1 z solvera doziemień').toBeGreaterThan(0);
  // Wymuszenie AWSC 25 A ≫ próg 2 A: czułość 67N w polu linii doziemionej spełniona.
  expect(rekordy67n.filter((r) => r.kryterium === 'CZULOSC').map((r) => r.status)).toContain('SPELNIA');
  for (const r of rekordy67n) expect(r.zdanie_pl.trim().length).toBeGreaterThan(0);

  // TO, CO WIDAĆ, = TO, CO ZWRÓCIŁ BACKEND — wiersz na rekord, ten sam status maszynowy.
  const wiersze67n = page.locator(
    `[data-testid="mvd-ocena-zabezpieczen-ziemne-wiersz"][data-urzadzenie="${sterownik.ref_id}"][data-kod="67N"]`,
  );
  await expect(wiersze67n).toHaveCount(rekordy67n.length, { timeout: 20000 });
  const widoczne = await wiersze67n.evaluateAll((w) =>
    w.map((e) => `${e.getAttribute('data-kryterium')}|${e.getAttribute('data-status')}`),
  );
  expect(widoczne).toEqual(rekordy67n.map((r) => `${r.kryterium}|${r.status}`));
  // Uziemienie GPZ: prąd uziomowy z solvera, napięcie krokowe bez geometrii nieocenione.
  const uziemienia = wynik.ziemnozwarciowe!.uziemienia;
  expect(uziemienia.length).toBeGreaterThan(0);
  expect(uziemienia.filter((r) => r.kryterium === 'NAPIECIE_KROKOWE').map((r) => r.status)).toEqual(
    expect.arrayContaining(['NIE_OCENIONO']),
  );
  await expect(
    page.locator('[data-testid="mvd-ocena-zabezpieczen-ziemne-wiersz"][data-kryterium="NAPIECIE_KROKOWE"]').first(),
  ).toBeVisible();

  // (4) Karta nastaw sterownika (E-27) — szczegóły niosą ocenę ziemnozwarciową TEGO sterownika.
  const kadry: string[] = [];
  const kadruj = async (motyw: 'dark' | 'light') => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await otworzOceneZabezpieczen(page);
    await expect(page.getByTestId('mvd-ocena-zabezpieczen-ziemne')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('mvd-ocena-zabezpieczen-ziemne').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUTPUT_DIR, `ocena-ziemnozwarciowa-e28-${motyw}.png`) });
    await otworzZabezpieczeniaIAutomatyke(page);
    await edytorSterownika(page, pole1, sterownik.ref_id);
    const szczegoly = page.getByTestId(`${prefiks}-szczegoly`);
    if (!(await szczegoly.isVisible())) await page.getByTestId(`${prefiks}-szczegoly-przelacz`).click();
    const tabelaKarty = page.getByTestId(`${prefiks}-ziemne`);
    await expect(tabelaKarty).toBeVisible({ timeout: 20000 });
    await expect(
      tabelaKarty.locator(`[data-testid="${prefiks}-ziemne-tabela-wiersz"][data-kod="67N"]`),
    ).toHaveCount(rekordy67n.length);
    await expect(page.getByTestId(`${prefiks}-ziemne-nieaktualny`)).toHaveCount(0);
    await tabelaKarty.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUTPUT_DIR, `ocena-ziemnozwarciowa-karta-nastaw-${motyw}.png`) });
    kadry.push(`ocena-ziemnozwarciowa-e28-${motyw}.png`, `ocena-ziemnozwarciowa-karta-nastaw-${motyw}.png`);
  };
  await kadruj('dark');

  await page.evaluate(() => {
    localStorage.setItem('mvd-theme-mode', JSON.stringify({ state: { mode: 'light_technical' }, version: 0 }));
  });
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await kadruj('light');

  for (const plik of kadry) {
    expect(fs.existsSync(path.join(OUTPUT_DIR, plik)), `kadr ${plik}`).toBe(true);
  }
});
