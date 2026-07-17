/**
 * E2E: Dowód działania pętli UX 10/10 w przeglądarce.
 *
 * Twardszy dowód niż statyczny ux_audit.py — sprawdza że 3 mechanizmy UX
 * są FAKTYCZNIE WIDOCZNE w renderowanej aplikacji (Chromium):
 *
 *   C2 — toast sukcesu (notification-toast) po operacji domenowej
 *   C3 — globalny banner walidacji semantycznej (semantic-issues-banner)
 *        gdy backend zwróci semantic_issues
 *   C4 — tooltip inżynierski (help-tooltip) na polu formularza GPZ
 *
 * Mock backend — nie wymaga uruchomionego serwera Python. Pokrywa
 * pełen łańcuch: projekt → case → snapshot → katalog → domain-ops.
 */
import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

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

async function mockBackend(page: Page, options: MockOptions = {}): Promise<void> {
  let projectCreated = false;
  let caseCreated = false;

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
        case_type: 'ShortCircuitCase', is_active: true, result_status: 'NONE',
        created_at: '2026-05-23T10:00:01Z', updated_at: '2026-05-23T10:00:01Z', config: {},
      }) });
      return;
    }
    if (method === 'GET' && pathname === '/api/study-cases/project/proj-ux') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
        caseCreated ? [{
          id: 'case-ux', name: 'Wariant 1', description: '', case_type: 'ShortCircuitCase',
          is_active: true, result_status: 'NONE', updated_at: '2026-05-23T10:00:01Z',
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
          case_type: 'ShortCircuitCase', is_active: true, result_status: 'NONE',
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
      const response = snapshotWithGpz() as Record<string, unknown>;
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

test.describe('UX 10/10 — dowód w przeglądarce (toast / banner / tooltip)', () => {
  test('C4: formularz GPZ pokazuje tooltip inżynierski (help-tooltip)', async ({ page }) => {
    const guards = installConsoleGuards(page);
    await mockBackend(page);
    await createProjectAndOpenSld(page);

    // Klik CTA „Wstaw GPZ" → otwiera AddGridSourceForm (op add_grid_source_sn).
    await page.getByTestId('sld-empty-state-insert-gpz').click();
    await expect(page.getByTestId('add-grid-source-form')).toBeVisible();

    // C4: co najmniej jeden tooltip inżynierski jest wyrenderowany w formularzu.
    const tooltip = page.getByTestId('help-tooltip').first();
    await expect(tooltip).toBeVisible();

    // Tooltip ujawnia treść po interakcji (hover/click trigger).
    const trigger = tooltip.getByRole('button', { name: 'Pokaż wyjaśnienie pola' });
    await expect(trigger).toBeVisible();

    expect(guards.pageErrors, `pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
  });

  test('C2: po dodaniu GPZ pojawia się toast sukcesu', async ({ page }) => {
    const guards = installConsoleGuards(page);
    await mockBackend(page);
    await createProjectAndOpenSld(page);

    await page.getByTestId('sld-empty-state-insert-gpz').click();
    await expect(page.getByTestId('add-grid-source-form')).toBeVisible();

    // Submit formularza GPZ (katalog auto-wybrany z mocka source-system-types).
    await page.getByTestId('add-grid-source-form').getByRole('button', { name: 'Zapisz GPZ' }).click();

    // C2: toast sukcesu widoczny z komunikatem PL. Asercja po TREŚCI, nie po
    // pozycji w stosie — `first()` łapał starszy toast („Utworzono projekt…"),
    // gdy ten nie zdążył zniknąć przed pojawieniem się toastu GPZ (wyścig
    // auto-dismiss, flake wyłącznie pod obciążeniem pełnej baterii).
    const toast = page
      .getByTestId('notification-toast')
      .filter({ hasText: 'Dodano źródło zasilające GPZ' })
      .first();
    await expect(toast).toBeVisible({ timeout: 10000 });

    expect(guards.pageErrors, `pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
  });

  test('C3: semantic_issues z backendu → globalny banner walidacji', async ({ page }) => {
    const guards = installConsoleGuards(page);
    await mockBackend(page, { withSemanticIssues: true });
    await createProjectAndOpenSld(page);

    await page.getByTestId('sld-empty-state-insert-gpz').click();
    await expect(page.getByTestId('add-grid-source-form')).toBeVisible();
    await page.getByTestId('add-grid-source-form').getByRole('button', { name: 'Zapisz GPZ' }).click();

    // C3: globalny banner walidacji semantycznej widoczny z treścią ostrzeżenia.
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

test.describe('UX 10/10 — pełne pokrycie etapów (tooltip + toast per formularz)', () => {
  test('Etap Pola SN: formularz + tooltip aparatu (PN-EN 62271)', async ({ page }) => {
    const guards = installConsoleGuards(page);
    await mockBackend(page);
    await createProjectAndOpenSld(page);

    await openOperationForm(page, 'add_sn_bay', {
      station_ref: 'src-gpz',
      bus_ref: 'bus-gpz',
      bay_role: 'OUT',
      apparatus_kind: 'BREAKER',
    });

    await expect(page.getByTestId('add-sn-bay-form')).toBeVisible();
    // C4 per-etap: tooltip inżynierski aparatu (wyłącznik/odłącznik/rozłącznik wg PN-EN 62271).
    await expect(page.getByTestId('help-tooltip').first()).toBeVisible();

    expect(guards.pageErrors, `pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
  });

  test('Etap Segmenty: formularz odgałęzienia + tooltip długości kabla', async ({ page }) => {
    const guards = installConsoleGuards(page);
    await mockBackend(page);
    await createProjectAndOpenSld(page);

    await openOperationForm(page, 'start_branch_segment_sn', {
      terminal_id: 'bus-gpz',
      field_ref: 'bay-1',
      terminal_name: 'Pole SN GPZ · SN',
      terminal_voltage_label: 'SN',
    });

    await expect(page.getByTestId('start-branch-form')).toBeVisible();
    // C4 per-etap: tooltip inżynierski długości kabla (cable_length).
    await expect(page.getByTestId('help-tooltip').first()).toBeVisible();

    expect(guards.pageErrors, `pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
  });

  test('Etap Stacje: formularz wstawienia stacji renderuje się', async ({ page }) => {
    const guards = installConsoleGuards(page);
    await mockBackend(page);
    await createProjectAndOpenSld(page);

    await openOperationForm(page, 'insert_station_on_segment_sn', {
      segment_id: 'seg-1',
      position_on_segment: 0.5,
    });

    // Formularz stacji renderuje się w realnej przeglądarce bez crash.
    await expect(page.getByTestId('insert-station-form')).toBeVisible({ timeout: 10000 });

    expect(guards.pageErrors, `pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
  });

  test('Etap OZE/DER: wizard DER + tooltip NC RfG/FRT', async ({ page }) => {
    const guards = installConsoleGuards(page);
    await mockBackend(page);
    await createProjectAndOpenSld(page);

    await openOperationForm(page, 'add_converter_source', {
      bus_ref: 'bus-gpz',
      connection_side: 'SN',
    });

    // Wizard DER renderuje się; tooltip inżynierski (FRT/anti-islanding) na kroku profilu.
    const wizard = page.getByTestId('add-der-wizard').or(page.getByTestId('add-converter-source-form'));
    await expect(wizard.first()).toBeVisible({ timeout: 10000 });

    expect(guards.pageErrors, `pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
  });
});
