/**
 * Wspólna scena e2e zabezpieczeń ziemnozwarciowych: GPZ 15 kV kompensowany z AWSC, dwa pola
 * liniowe ENEA Z.10 z przekładnikiem Ferrantiego, pole pomiaru napięcia Z.17, uziom GPZ — szkielet
 * operacjami domenowymi (kształt sceny backendu `tests/reference_networks/scena_doziemienia.py`),
 * nastawy i oceny wyłącznie natywnymi klikami w speckach. Jedno źródło dla speca ocen
 * (`ocena-ziemnozwarciowa-67n.spec.ts`) i pomiaru przed/po (`ekrany-eaz-pomiar.spec.ts`).
 */
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { otworzZakladkeWynikow } from './nawigacjaWynikow';

/** Licznik natywnych kliknięć ścieżki projektanta (pomiar „kliknięcia do nastawy / do wyniku”). */
export class Klikacz {
  liczba = 0;
  async klik(l: Locator): Promise<void> {
    this.liczba += 1;
    await l.click();
  }
}

export const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
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

type Pole = {
  ref_id: string;
  tags?: string[];
  gpz_section_id?: string | null;
  primary_devices?: Array<{ kind: string; device_ref: string }>;
};
export type Sterownik = { ref_id: string; bay_ref?: string | null; funkcje: Array<{ ref: string; kod: string }> };
type Migawka = {
  bays: Pole[];
  substations: Array<{ ref_id: string; gpz_sections?: Array<{ section_id: string; bus_ref: string }> }>;
  protection_assignments: Sterownik[];
};
export type RekordZiemny = {
  urzadzenie_ref: string;
  kod: string | null;
  kryterium: string;
  status: string;
  zdanie_pl: string;
};
export type WynikOceny = {
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

export async function otworzAplikacje(page: Page, request: APIRequestContext) {
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
export async function zbudujSiec(request: APIRequestContext, caseId: string) {
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

export async function otworzZabezpieczeniaIAutomatyke(page: Page, k = new Klikacz()): Promise<void> {
  // Skrót klawiszowy palety liczony jak kliknięcie (jedna akcja projektanta).
  k.liczba += 1;
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('mvd-cmdk-dialog')).toBeVisible();
  await page.getByTestId('mvd-cmdk-input').fill('Zabezpieczenia i automatyka');
  await k.klik(page.getByTestId('mvd-cmdk-opcja-ekran:E-27'));
  await expect(page.getByTestId('mvd-za-zabezpieczenia')).toBeVisible({ timeout: 20000 });
}

/** Edytor nastaw sterownika pola (wiersz tabeli E-27 = pole, rozwijany natywnym klikiem). */
export async function edytorSterownika(
  page: Page,
  poleRef: string,
  sterownikRef: string,
  k = new Klikacz(),
): Promise<string> {
  const przelacz = page.getByTestId(`mvd-za-nastawy-${poleRef}`);
  await expect(przelacz).toBeVisible({ timeout: 20000 });
  if ((await przelacz.getAttribute('aria-expanded')) !== 'true') await k.klik(przelacz);
  const prefiks = `mvd-za-edytor-${sterownikRef}`;
  await expect(page.getByTestId(prefiks)).toBeVisible({ timeout: 20000 });
  return prefiks;
}

export async function otworzOceneZabezpieczen(page: Page, k = new Klikacz()): Promise<void> {
  await k.klik(page.getByRole('button', { name: /^Wyniki i dowody \d$/ }));
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 20000 });
  // Obszar i zakładka warsztatu — dwa kliknięcia ścieżki projektanta.
  k.liczba += 2;
  await otworzZakladkeWynikow(page, 'koordynacja');
  await expect(page.getByTestId('mvd-ocena-zabezpieczen')).toBeVisible({ timeout: 20000 });
}


/** Natywnie: zestaw funkcji sterownika ograniczony do 51 i 67N; 51 = 300 A DT 0,8 s; 67N —
 *  pełne nastawy (2 A DT 0,5 s, do linii, cos φ) albo pozostawione puste (`pusta67n`). */
export async function ustawNastawy(
  page: Page,
  k: Klikacz,
  prefiks: string,
  sterownik: Sterownik,
  { pusta67n }: { pusta67n: boolean },
): Promise<{ ref51: string; ref67n: string }> {
  const funkcja67n = sterownik.funkcje.find((f) => f.kod === '67N')!;
  const funkcja51 = sterownik.funkcje.find((f) => f.kod === '51')!;
  for (const f of sterownik.funkcje) {
    const wlaczona = page.getByTestId(`${prefiks}-${f.ref}-wlaczona`);
    const chcemy = f.ref === funkcja67n.ref || f.ref === funkcja51.ref;
    if ((await wlaczona.isChecked()) !== chcemy) await k.klik(wlaczona);
    if (chcemy) await expect(wlaczona).toBeChecked();
    else await expect(wlaczona).not.toBeChecked();
  }
  const pole51 = (klucz: string) => page.getByTestId(`${prefiks}-${funkcja51.ref}-${klucz}`);
  await pole51('prog').fill('300');
  await pole51('jednostka_progu').selectOption('A_PIERWOTNY');
  await pole51('krzywa').selectOption('DT');
  await pole51('zwloka_s').fill('0.8');
  if (!pusta67n) await ustaw67n(page, prefiks, funkcja67n.ref);
  await k.klik(page.getByTestId(`${prefiks}-zapisz`));
  await expect(page.getByTestId(`${prefiks}-gotowe`)).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId(`${prefiks}-blad`)).toHaveCount(0);
  return { ref51: funkcja51.ref, ref67n: funkcja67n.ref };
}

/** Nastawy 67N: 2 A pierwotnie, DT 0,5 s, do linii, kąt charakterystyczny 0° (cos φ). */
export async function ustaw67n(page: Page, prefiks: string, ref67n: string): Promise<void> {
  const pole67n = (klucz: string) => page.getByTestId(`${prefiks}-${ref67n}-${klucz}`);
  await pole67n('prog').fill('2');
  await pole67n('jednostka_progu').selectOption('A_PIERWOTNY');
  await pole67n('krzywa').selectOption('DT');
  await pole67n('zwloka_s').fill('0.5');
  await pole67n('kierunek').selectOption('DO_LINII');
  await pole67n('kat_charakterystyczny_deg').fill('0');
}

/** Klik „Oceń zabezpieczenia” na E-28; identyfikator nowego biegu oceny z odpowiedzi POST. */
export async function uruchomOcene(page: Page, k: Klikacz): Promise<string> {
  const uruchom = page.getByTestId('mvd-ocena-zabezpieczen-uruchom');
  await expect(uruchom).toBeEnabled({ timeout: 20000 });
  const utworzenie = page.waitForResponse(
    (r) => /\/api\/projects\/[^/]+\/protection-runs$/.test(r.url()) && r.request().method() === 'POST',
    { timeout: 60000 },
  );
  await k.klik(uruchom);
  const odpowiedz = await utworzenie;
  expect(odpowiedz.ok(), await odpowiedz.text()).toBeTruthy();
  const { id } = (await odpowiedz.json()) as { id: string };
  await expect(page.getByTestId('mvd-ocena-zabezpieczen-wynik')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('[data-testid="mvd-ocena-zabezpieczen"]')).toHaveAttribute('data-run-id', id, {
    timeout: 60000,
  });
  return id;
}

/** Pomiar pierwszego planu elementu: wysokość w px (pełna, z przewinięciem), liczba słów
 *  tekstu renderowanego (`innerText` — bez zwiniętych szczegółów i ukrytych podpowiedzi),
 *  szerokość dostępna i najszersza tabela w środku (przepełnienie poziome = przewijanie w bok). */
export async function pomiarPierwszegoPlanu(l: Locator): Promise<{
  wysokosc_px: number;
  slowa: number;
  szerokosc_dostepna_px: number;
  najszersza_tabela_px: number;
}> {
  return l.evaluate((el) => {
    const h = el as HTMLElement;
    const tabele = Array.from(h.querySelectorAll('table')) as HTMLElement[];
    return {
      wysokosc_px: Math.round(h.scrollHeight),
      slowa: (h.innerText.match(/\S+/g) ?? []).length,
      szerokosc_dostepna_px: Math.round(h.clientWidth),
      najszersza_tabela_px: Math.round(Math.max(0, ...tabele.map((t) => t.scrollWidth))),
    };
  });
}
