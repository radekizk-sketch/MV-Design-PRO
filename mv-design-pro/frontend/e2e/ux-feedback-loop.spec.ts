/**
 * E2E: Dowód działania pętli UX 10/10 w przeglądarce.
 *
 * Twardszy dowód niż statyczny ux_audit.py — sprawdza że 3 mechanizmy UX
 * są FAKTYCZNIE WIDOCZNE w renderowanej aplikacji (Chromium):
 *
 *   C2 — toast sukcesu (notification-toast) po operacji domenowej
 *   C3 — globalny banner walidacji semantycznej (semantic-issues-banner)
 *        gdy backend zwróci semantic_issues
 *   C4 — inżynierska pomoc pola w kreatorze GPZ (dawny ukryty help-tooltip →
 *        dziś widoczna pomoc `.mvd-pole-pomoc`, FLOW §0.3)
 *
 * Mock backend — nie wymaga uruchomionego serwera Python. Pokrywa
 * pełen łańcuch: projekt → case → snapshot → katalog → domain-ops.
 */
import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';
import { pustaOdpowiedzDomainOps } from './fixtures/emptyDomainOpsResponse';

interface ConsoleGuards {
  errors: string[];
  pageErrors: string[];
}

function installConsoleGuards(page: Page): ConsoleGuards {
  const guards: ConsoleGuards = { errors: [], pageErrors: [] };
  page.on('pageerror', (e) => guards.pageErrors.push(e.message));
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') guards.errors.push(msg.text());
  });
  return guards;
}

const SOURCE_SYSTEM_TYPE = {
  id: 'src-sys-1',
  name: 'GPZ 110/15 kV typowy',
  manufacturer: 'Operator',
  voltage_rating_kv: 15,
  sk3_mva: 310,
  ik3_ka: 11.9,
  rx_ratio: 0.12,
  earthing_system: 'resistor_grounded',
  short_circuit_model: 'iec60909',
  operator_name: 'OSD',
  supply_role: 'primary',
  series: 'GPZ',
  catalog_number: 'GPZ-110-15-310',
  data_source: 'test',
};

const MV_APPARATUS_TYPE = {
  id: 'ap-sn-1',
  name: 'Wyłącznik SN 15 kV 630 A',
  manufacturer: 'Operator',
  device_kind: 'BREAKER',
  u_n_kv: 15,
  i_n_a: 630,
};

/**
 * Karta FAB-G: kreator GPZ wymaga jawnego transformatora 110/SN z katalogu
 * (`zrodloModel.ts`: `transformer_catalog_ref` — „Dobierz transformator
 * 110/SN z katalogu"), filtrowanego wg strony SN (`|voltage_lv_kv - sn_voltage_kv| <= 6`)
 * i strony WN (`voltage_hv_kv >= 60`) — patrz `filtrowaneTransformatory` w
 * `KreatorZrodloZasilania.tsx`. Ta sama pozycja co jedyna istniejąca fikstura
 * transformatora w repo (`ui2/kreatory/zrodlo/__tests__/KreatorZrodloZasilania.test.tsx`
 * — grep `frontend/e2e` na `transformer-types` nie znajduje ŻADNEGO innego
 * mocka; ten spec jest pierwszym e2e, który go potrzebuje) — jedna prawda
 * fikstury zamiast wymyślania nowych wartości.
 */
const TRANSFORMER_TYPE = {
  id: 'TR-110-15-25',
  name: 'TR 110/15 25 MVA',
  rated_power_mva: 25,
  voltage_hv_kv: 110,
  voltage_lv_kv: 15,
  uk_percent: 12.5,
  pk_kw: 120,
  i0_percent: 0.2,
  p0_kw: 25,
  vector_group: 'YNd11',
  tap_min: -9,
  tap_max: 9,
};

/** Snapshot z jednym węzłem GPZ (po udanej operacji) — minimalny ważny ENM. */
function snapshotWithGpz() {
  return {
    snapshot: {
      header: { revision: 1, hash_sha256: 'hash-gpz-1', name: 'case-ux' },
      buses: [{ id: 'bus-gpz', ref_id: 'bus-gpz', name: 'Szyna GPZ 15 kV' }],
      branches: [],
      transformers: [],
      sources: [{ id: 'src-gpz', ref_id: 'src-gpz', name: 'GPZ', source_kind: 'slack' }],
      loads: [],
      generators: [],
      substations: [],
      bays: [],
      junctions: [],
      corridors: [],
      measurements: [],
      protection_assignments: [],
      branch_points: [],
    },
    logical_views: { trunks: [], branches: [], secondary_connectors: [], terminals: [] },
    readiness: { ready: true, blockers: [], warnings: [], info: [] },
    fix_actions: [],
    materialized_params: null,
    layout: null,
    selection_hint: null,
    changes: { created_element_ids: ['src-gpz'], updated_element_ids: [], deleted_element_ids: [] },
    domain_events: [{ event_seq: 1, event_type: 'created', element_id: 'src-gpz' }],
  };
}

interface MockOptions {
  /** Gdy true, domain-ops zwraca semantic_issues (test bannera C3). */
  withSemanticIssues?: boolean;
}

/** Stan przechwycony przez mocka, czytany PO teście — dowód kontraktu
 *  (karta E2E-FIX): nie tylko "toast się pojawił", ale "ładunek faktycznie
 *  niósł to, czego wymaga backend (FAB-G)". */
interface MockState {
  lastAddGridSourcePayload: Record<string, unknown> | null;
}

async function mockBackend(page: Page, options: MockOptions = {}): Promise<MockState> {
  let projectCreated = false;
  let caseCreated = false;
  const state: MockState = { lastAddGridSourcePayload: null };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const { pathname } = url;

    // --- Projekty ---
    if (method === 'POST' && pathname === '/api/projects') {
      projectCreated = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        id: 'proj-ux', name: 'UX 10/10 demo', description: null,
        created_at: '2026-05-23T10:00:00Z', updated_at: '2026-05-23T10:00:00Z',
      }) });
      return;
    }
    if (method === 'GET' && pathname === '/api/projects') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        projects: projectCreated ? [{
          id: 'proj-ux', name: 'UX 10/10 demo', description: null,
          created_at: '2026-05-23T10:00:00Z', updated_at: '2026-05-23T10:00:00Z',
        }] : [],
        total: projectCreated ? 1 : 0,
      }) });
      return;
    }

    // --- Study cases ---
    if (method === 'POST' && pathname === '/api/study-cases') {
      caseCreated = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        id: 'case-ux', project_id: 'proj-ux', name: 'Wariant 1', description: '',
        case_type: 'ShortCircuitCase', is_active: true, result_status: 'NONE', results_valid: false, result_status_reason: 'brak-wyniku', result_status_reason_pl: 'Brak zapisanego wyniku dla tego przebiegu — nie ma czego nałożyć na schemat.', rewizja_biegu: null, rewizja_biezaca: 1, zmiany_od_biegu: [],
        created_at: '2026-05-23T10:00:01Z', updated_at: '2026-05-23T10:00:01Z', config: {},
      }) });
      return;
    }
    if (method === 'GET' && pathname === '/api/study-cases/project/proj-ux') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
        caseCreated ? [{
          id: 'case-ux', name: 'Wariant 1', description: '', case_type: 'ShortCircuitCase',
          is_active: true, result_status: 'NONE', results_valid: false, result_status_reason: 'brak-wyniku', result_status_reason_pl: 'Brak zapisanego wyniku dla tego przebiegu — nie ma czego nałożyć na schemat.', rewizja_biegu: null, rewizja_biezaca: 1, zmiany_od_biegu: [], updated_at: '2026-05-23T10:00:01Z',
        }] : [],
      ) });
      return;
    }
    if (method === 'GET' && pathname === '/api/study-cases/project/proj-ux/active') {
      await route.fulfill({
        status: projectCreated && caseCreated ? 200 : 204,
        contentType: 'application/json',
        body: projectCreated && caseCreated ? JSON.stringify({
          id: 'case-ux', project_id: 'proj-ux', name: 'Wariant 1', description: '',
          case_type: 'ShortCircuitCase', is_active: true, result_status: 'NONE', results_valid: false, result_status_reason: 'brak-wyniku', result_status_reason_pl: 'Brak zapisanego wyniku dla tego przebiegu — nie ma czego nałożyć na schemat.', rewizja_biegu: null, rewizja_biezaca: 1, zmiany_od_biegu: [],
          created_at: '2026-05-23T10:00:01Z', updated_at: '2026-05-23T10:00:01Z', config: {},
        }) : '',
      });
      return;
    }

    // --- Katalog (GridSourceEditor pobiera typy źródła + aparaturę) ---
    if (method === 'GET' && pathname === '/api/catalog/source-system-types') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([SOURCE_SYSTEM_TYPE]) });
      return;
    }
    if (method === 'GET' && pathname === '/api/catalog/mv-apparatus-types') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MV_APPARATUS_TYPE]) });
      return;
    }
    // Karta FAB-G: transformator 110/SN GPZ jest teraz WYMAGANY — bez tej
    // pozycji `filtrowaneTransformatory` w kreatorze zostaje pustą listą,
    // walidacja blokuje `zapisz`, i C2/C3 nigdy nie widzą toastu/bannera
    // (kreator w ogóle nie wysyła operacji domenowej).
    if (method === 'GET' && pathname === '/api/catalog/transformer-types') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([TRANSFORMER_TYPE]) });
      return;
    }
    // Katalog przełączników zaczepów (OLTC/DETC) — kreator go pobiera, ale
    // domyślny `oltc_regulation_type` to 'NONE' (walidacja OLTC pomijana
    // całkowicie w tym stanie, `zrodloModel.ts: walidujOltc`), więc pusta
    // lista nie blokuje zapisu — kreator po prostu nie proponuje regulacji.
    if (method === 'GET' && pathname === '/api/v1/catalog/audit2/tap-changers') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }

    // --- Snapshot (pusty na starcie) ---
    if (method === 'GET' && pathname.includes('/snapshot')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        snapshot: null,
        readiness: { ready: false, blockers: [], warnings: [], info: [] },
        logical_views: { trunks: [], branches: [], rings: [], secondary_connectors: [] },
        fix_actions: [],
      }) });
      return;
    }

    // --- Domain ops (operacja GPZ) ---
    if (method === 'POST' && pathname.includes('/enm/domain-ops')) {
      // Naprawa (dryf kontraktu mocka, audyt E2E-MOCK-BEZ-CI): shell woła
      // `refresh_snapshot` NATYCHMIAST po zamontowaniu case'a (store.ts:
      // refreshFromBackend na mount), ZANIM operator otworzy kreator GPZ.
      // Ten handler zwracał `snapshotWithGpz()` dla KAŻDEJ operacji —
      // bootstrap dostawał więc snapshot z gotowym GPZ, `sld-empty-state`
      // nigdy się nie montował (model od razu "niepusty"), a asercja
      // `createProjectAndOpenSld` wisiała do timeoutu. Realną operację GPZ
      // (`add_grid_source_sn`) rozpoznajemy z payloadu żądania.
      const body = request.postDataJSON() as {
        operation?: { name?: string; payload?: Record<string, unknown> };
      } | null;
      const opName = body?.operation?.name;
      const payload = body?.operation?.payload ?? {};
      if (opName === 'add_grid_source_sn') {
        state.lastAddGridSourcePayload = payload;
      }
      // Karta FAB-G: bez `transformer_catalog_ref` backend odrzuca operację
      // kodem `catalog.ref_required` (`enm/domain_operations.py:
      // _resolve_gpz_wn_sn_transformer_catalog_ref`) — mock ODTWARZA to
      // zachowanie zamiast je omijać, żeby ten test dowodził kontraktu: gdyby
      // kreator kiedyś przestał wysyłać ten atrybut, C2/C3 zgłoszą brak
      // toastu/bannera (błąd domenowy zamiast sukcesu), nie fałszywy zielony.
      const transformerRef =
        typeof payload.transformer_catalog_ref === 'string'
          ? payload.transformer_catalog_ref.trim()
          : '';
      if (opName === 'add_grid_source_sn' && !transformerRef) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Transformator WN/SN GPZ wymaga pozycji katalogowej: podaj transformer_catalog_ref.',
            error_code: 'catalog.ref_required',
            snapshot: null,
            logical_views: {},
            readiness: { ready: false, blockers: [], warnings: [] },
            fix_actions: [],
            changes: { created_element_ids: [], updated_element_ids: [], deleted_element_ids: [] },
            selection_hint: null,
            audit_trail: [],
            domain_events: [],
            materialized_params: { lines_sn: {}, transformers_sn_nn: {}, sources_sn: {} },
            layout: { layout_hash: '', layout_version: '1.0' },
            semantic_issues: [],
          }),
        });
        return;
      }
      const response = opName === 'add_grid_source_sn'
        ? (snapshotWithGpz() as Record<string, unknown>)
        : pustaOdpowiedzDomainOps('case-ux');
      if (options.withSemanticIssues) {
        response.semantic_issues = [
          {
            code: 'SOURCE_WITHOUT_FEEDER',
            message: 'Źródło GPZ nie ma jeszcze pola odpływowego — dodaj pole SN.',
            severity: 'WARNING',
            element_id: 'src-gpz',
            field: null,
            suggested_fix: 'Dodaj pole SN do GPZ',
          },
        ];
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  return state;
}

async function createProjectAndOpenSld(page: Page): Promise<void> {
  // Pomiń onboarding tour (overlay przechwytuje kliki) — ustaw flagę ukończenia.
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('mvdp.onboarding.completed', '1');
  });
  await page.goto('/#dashboard', { waitUntil: 'commit' });
  await expect(page.getByTestId('project-dashboard-surface')).toBeVisible();
  await page.getByTestId('dashboard-new-project').click();
  await expect(page.getByRole('dialog', { name: 'Metadane projektu' })).toBeVisible();
  await page.getByTestId('project-metadata-name').fill('UX 10/10 demo');
  await page.getByTestId('project-metadata-save').click();
  await expect(page.getByTestId('sld-canvas-v3-workspace')).toBeVisible();
  await expect(page.getByTestId('sld-empty-state')).toBeVisible();
}

/**
 * Przepisane na bieżący flow (karta K1/B, 2026-07-29): klik CTA „Wstaw GPZ"
 * otwiera dziś 7-krokowy kreator ui2 `KreatorZrodloZasilania`
 * (`operationFormRegistry`: add_grid_source_sn → mvd-kreator-zrodlo), a nie
 * dawny `add-grid-source-form`. Zapis wykonuje się przyciskiem
 * `mvd-kreator-zrodlo-zapisz` (katalog auto-wybrany z mocka source-system-types).
 */
async function openGpzCreator(page: Page): Promise<void> {
  await page.getByTestId('sld-empty-state-insert-gpz').click();
  await expect(page.getByTestId('mvd-kreator-zrodlo')).toBeVisible();
}

/**
 * Przejście na krok 2 („Źródło i strona WN") realnym klikiem „Dalej" i czekanie
 * na auto-wybór pozycji katalogowej (mock: src-sys-1) — dopiero wtedy walidacja
 * `zapisz` ma komplet danych (catalog_ref + Sk″ + R/X z katalogu).
 */
async function przejdzNaKrokZrodlaIZaczekajNaKatalog(page: Page): Promise<void> {
  await page.getByTestId('mvd-kreator-zrodlo-dalej').click();
  await expect(page.getByTestId('mvd-kreator-zrodlo-katalog-select')).toHaveValue('src-sys-1');
}

test.describe('UX 10/10 — dowód w przeglądarce (toast / banner / pomoc pola)', () => {
  test('C4: kreator GPZ pokazuje inżynierską pomoc pola (po co / z czego / co daje)', async ({ page }) => {
    const guards = installConsoleGuards(page);
    await mockBackend(page);
    await createProjectAndOpenSld(page);

    // INTENCJA BEZ ZMIAN (C4): pole formularza GPZ niesie inżynierskie
    // wyjaśnienie. Nośnik się zmienił: ukryty `help-tooltip` (przycisk „Pokaż
    // wyjaśnienie pola") został zastąpiony pomocą WIDOCZNĄ wprost pod polem
    // (FLOW §0.3, ui2/kreatory/rama/pola.tsx: „każde pole może nieść widoczną
    // pomoc … zamiast ukrytego tooltipa" — klasa .mvd-pole-pomoc).
    await openGpzCreator(page);

    const pomoc = page.locator('.mvd-pole-pomoc').first();
    await expect(pomoc).toBeVisible();
    // Konkretna treść inżynierska kroku 1 (strings.ts: napiecieSnPomoc) —
    // nie sama obecność kontenera.
    await expect(
      page.getByText('Napięcie nominalne szyn SN. Wpływa na dobór katalogu transformatorów i kabli.'),
    ).toBeVisible();

    expect(guards.pageErrors, `pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
  });

  test('C2: po dodaniu GPZ pojawia się toast sukcesu', async ({ page }) => {
    const guards = installConsoleGuards(page);
    const mock = await mockBackend(page);
    await createProjectAndOpenSld(page);

    await openGpzCreator(page);
    await przejdzNaKrokZrodlaIZaczekajNaKatalog(page);

    // Zapis kreatora (operacja domenowa add_grid_source_sn — mock domain-ops
    // zwraca snapshot z GPZ).
    await page.getByTestId('mvd-kreator-zrodlo-zapisz').click();

    // C2 (intencja bez zmian): toast sukcesu widoczny z komunikatem PL.
    // Asercja po TREŚCI, nie po pozycji w stosie — `first()` łapał starszy
    // toast („Utworzono projekt…"), gdy ten nie zdążył zniknąć przed
    // pojawieniem się toastu GPZ (wyścig auto-dismiss).
    const toast = page
      .getByTestId('notification-toast')
      .filter({ hasText: 'Dodano źródło zasilające GPZ' })
      .first();
    await expect(toast).toBeVisible({ timeout: 10000 });

    // Karta FAB-G (dowód kontraktu, nie tylko obecności toastu): ładunek
    // faktycznie wysłany do domain-ops niósł transformator 110/SN z katalogu
    // + parę hv_voltage_kv/transformer_sn_mva, którą `zbudujPayloadZrodla`
    // dokłada razem z nim (`zrodloModel.ts`).
    expect(
      mock.lastAddGridSourcePayload?.transformer_catalog_ref,
      'payload GPZ musi nieść transformer_catalog_ref (FAB-G)',
    ).toBe(TRANSFORMER_TYPE.id);
    expect(
      mock.lastAddGridSourcePayload?.hv_voltage_kv,
      'payload GPZ musi nieść hv_voltage_kv (FAB-G)',
    ).toBe(110);
    expect(
      mock.lastAddGridSourcePayload?.transformer_sn_mva,
      'payload GPZ musi nieść transformer_sn_mva (FAB-G)',
    ).toBe(TRANSFORMER_TYPE.rated_power_mva);

    expect(guards.pageErrors, `pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
  });

  test('C3: semantic_issues z backendu → globalny banner walidacji', async ({ page }) => {
    const guards = installConsoleGuards(page);
    await mockBackend(page, { withSemanticIssues: true });
    await createProjectAndOpenSld(page);

    await openGpzCreator(page);
    await przejdzNaKrokZrodlaIZaczekajNaKatalog(page);
    await page.getByTestId('mvd-kreator-zrodlo-zapisz').click();

    // C3 (intencja bez zmian): globalny banner walidacji semantycznej widoczny
    // z treścią ostrzeżenia (SemanticIssuesBanner w warsztacie, store:
    // lastSemanticIssues z odpowiedzi domain-ops).
    const banner = page.getByTestId('semantic-issues-banner');
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner).toContainText('pola odpływowego');

    expect(guards.pageErrors, `pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
  });
});

/**
 * Helper: otwiera formularz operacji domenowej przez DEV hook (omija kruchy
 * łańcuch context-menu). Sam hook jest DEV-only (stripowany z prod buildu).
 */
async function openOperationForm(
  page: Page,
  op: string,
  context: Record<string, unknown>,
): Promise<void> {
  await page.waitForFunction(() => Boolean((window as any).__mvdpOpenOperationForm), null, {
    timeout: 10000,
  });
  await page.evaluate(
    ({ op, context }) => {
      (window as any).__mvdpOpenOperationForm(op, context);
    },
    { op, context },
  );
}

/**
 * Przepisane na bieżący flow (karta K1/B, 2026-07-29): operacje domenowe
 * otwierają dziś kreatory ui2 (`operationFormRegistry`), a nie dawne formularze
 * `add-sn-bay-form` / `start-branch-form` / `insert-station-form` /
 * `add-der-wizard`. Intencja per test bez zmian: formularz etapu renderuje się
 * i niesie inżynierski feedback (dawny ukryty `help-tooltip` → dziś widoczna
 * pomoc pola `.mvd-pole-pomoc` albo panel teorii `PanelTeorii`, FLOW §0.3).
 */
test.describe('UX 10/10 — pełne pokrycie etapów (pomoc inżynierska per kreator)', () => {
  test('Etap Pola SN: kreator pola + teoria aparatu (PN-EN 62271)', async ({ page }) => {
    const guards = installConsoleGuards(page);
    await mockBackend(page);
    await createProjectAndOpenSld(page);

    await openOperationForm(page, 'add_sn_bay', {
      station_ref: 'src-gpz',
      bus_ref: 'bus-gpz',
      bay_role: 'OUT',
      apparatus_kind: 'BREAKER',
    });

    // add_sn_bay → KreatorPolaSn (ui2). Intencja „tooltip aparatu wg PN-EN
    // 62271": nośnikiem normy jest dziś PanelTeorii kroku pola — rozwijany
    // NATYWNYM klikiem w <summary> (details/summary, bez syntetycznych zdarzeń).
    await expect(page.getByTestId('mvd-kreator-pole')).toBeVisible();
    const teoria = page.getByTestId('mvd-kreator-pole-teoria');
    await expect(teoria).toBeVisible();
    await teoria.locator('summary').click();
    await expect(teoria).toContainText('PN-EN 62271');

    expect(guards.pageErrors, `pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
  });

  test('Etap Segmenty: kreator odgałęzienia + pomoc długości odcinka', async ({ page }) => {
    const guards = installConsoleGuards(page);
    await mockBackend(page);
    await createProjectAndOpenSld(page);

    await openOperationForm(page, 'start_branch_segment_sn', {
      terminal_id: 'bus-gpz',
      field_ref: 'bay-1',
      terminal_name: 'Pole SN GPZ · SN',
      terminal_voltage_label: 'SN',
    });

    // start_branch_segment_sn → KreatorOdgalezienia (ui2). Intencja „tooltip
    // długości kabla": pomoc pola długości jest dziś WIDOCZNA wprost pod polem
    // (strings.ts: dlugoscPomoc), nie ukryta za triggerem.
    await expect(page.getByTestId('mvd-kreator-odgalezienie')).toBeVisible();
    await expect(page.getByTestId('mvd-kreator-odgalezienie-dlugosc')).toBeVisible();
    await expect(
      page.getByText('Długość pierwszego odcinka [km] — wpływa na spadek napięcia i straty.'),
    ).toBeVisible();

    expect(guards.pageErrors, `pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
  });

  test('Etap Stacje: kreator wstawienia stacji renderuje się', async ({ page }) => {
    const guards = installConsoleGuards(page);
    await mockBackend(page);
    await createProjectAndOpenSld(page);

    await openOperationForm(page, 'insert_station_on_segment_sn', {
      segment_id: 'seg-1',
      position_on_segment: 0.5,
    });

    // insert_station_on_segment_sn → KreatorStacjiSnNn (ui2) — renderuje się
    // w realnej przeglądarce bez crash (intencja bez zmian).
    await expect(page.getByTestId('mvd-kreator-stacja')).toBeVisible({ timeout: 10000 });

    expect(guards.pageErrors, `pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
  });

  test('Etap OZE/DER: kreator źródła OZE renderuje się (technologia + FRT)', async ({ page }) => {
    const guards = installConsoleGuards(page);
    await mockBackend(page);
    await createProjectAndOpenSld(page);

    await openOperationForm(page, 'add_converter_source', {
      bus_ref: 'bus-gpz',
      connection_side: 'SN',
    });

    // add_converter_source → KreatorZrodlaOze (ui2). Intencja „wizard DER
    // renderuje się z feedbackiem inżynierskim": krok technologii widoczny
    // od razu (sekcja mvd-kreator-oze-tech).
    await expect(page.getByTestId('mvd-kreator-oze')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('mvd-kreator-oze-tech')).toBeVisible();

    expect(guards.pageErrors, `pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
  });
});
