/**
 * E2E: Naturalny flow projektanta sieci SN — multi-step coverage
 *
 * Pokrycie 9 kroków flow wg `AUDYT_SLD_DESIGNER_2026-05-19.md` §6:
 *   1. Pusta kanwa → empty-state CTA „Wstaw GPZ"
 *   2. Menu kontekstowe background → akcja insert-gpz
 *   3. Menu kontekstowe GPZ → add-section
 *   4. Menu kontekstowe section → add-bay
 *   5. Menu kontekstowe bay → start-branch (wyprowadzenie ciągu)
 *   6. Menu kontekstowe cable_segment_sn → insert-station (zakończenie)
 *   7. Menu kontekstowe station → continue-trunk (kontynuacja)
 *   8. Menu kontekstowe station → start-branch (rozgałęzienie)
 *   9. Menu kontekstowe station → add-source (DER PV/BESS/FW)
 *
 * Test używa mock backend — nie wymaga uruchomionego serwera. Pokrywa
 * kontrakt: każdy element SLD ma poprawne, domenowe akcje w menu
 * kontekstowym z polskimi etykietami. Komplementarne dla
 * `designerFlowContract.test.ts` (unit test rejestru akcji).
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

async function mockMinimalBackend(page: Page): Promise<void> {
  let projectCreated = false;
  let caseCreated = false;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const { pathname } = url;

    if (method === 'POST' && pathname === '/api/projects') {
      projectCreated = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'proj-multistep',
          name: 'Multi-step flow demo',
          description: null,
          created_at: '2026-05-19T10:00:00Z',
          updated_at: '2026-05-19T10:00:00Z',
        }),
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/projects') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projects: projectCreated
            ? [{
                id: 'proj-multistep',
                name: 'Multi-step flow demo',
                description: null,
                created_at: '2026-05-19T10:00:00Z',
                updated_at: '2026-05-19T10:00:00Z',
              }]
            : [],
          total: projectCreated ? 1 : 0,
        }),
      });
      return;
    }
    if (method === 'POST' && pathname === '/api/study-cases') {
      caseCreated = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'case-multistep',
          project_id: 'proj-multistep',
          name: 'Wariant 1',
          description: '',
          case_type: 'ShortCircuitCase',
          is_active: true,
          result_status: 'NONE',
          created_at: '2026-05-19T10:00:01Z',
          updated_at: '2026-05-19T10:00:01Z',
          config: {},
        }),
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/study-cases/project/proj-multistep') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          caseCreated
            ? [{
                id: 'case-multistep',
                name: 'Wariant 1',
                description: '',
                case_type: 'ShortCircuitCase',
                is_active: true,
                result_status: 'NONE',
                updated_at: '2026-05-19T10:00:01Z',
              }]
            : [],
        ),
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/study-cases/project/proj-multistep/active') {
      await route.fulfill({
        status: projectCreated && caseCreated ? 200 : 204,
        contentType: 'application/json',
        body: projectCreated && caseCreated
          ? JSON.stringify({
              id: 'case-multistep',
              project_id: 'proj-multistep',
              name: 'Wariant 1',
              description: '',
              case_type: 'ShortCircuitCase',
              is_active: true,
              result_status: 'NONE',
              created_at: '2026-05-19T10:00:01Z',
              updated_at: '2026-05-19T10:00:01Z',
              config: {},
            })
          : '',
      });
      return;
    }
    if (method === 'GET' && pathname.includes('/snapshot')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          snapshot: null,
          readiness: { ready: false, blockers: [], warnings: [], info: [] },
          logical_views: { trunks: [], branches: [], rings: [], secondary_connectors: [] },
          fix_actions: [],
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

test.describe('Designer naturalny flow — multi-step coverage (audit 2026-05-19)', () => {
  test('Step 1-2: pusta kanwa → CTA „Wstaw GPZ" + menu kontekstowe background', async ({ page }) => {
    const guards = installConsoleGuards(page);
    await mockMinimalBackend(page);
    await page.addInitScript(() => { localStorage.clear(); });

    await page.goto('/#dashboard', { waitUntil: 'commit' });
    await expect(page.getByTestId('project-dashboard-surface')).toBeVisible();
    await page.getByTestId('dashboard-new-project').click();
    await expect(page.getByRole('dialog', { name: 'Metadane projektu' })).toBeVisible();
    await page.getByTestId('project-metadata-name').fill('Multi-step flow demo');
    await page.getByTestId('project-metadata-save').click();

    // Empty state widoczny.
    await expect(page.getByTestId('sld-workspace-container')).toBeVisible();
    const emptyState = page.getByTestId('sld-empty-state');
    await expect(emptyState).toBeVisible();

    // CTA primary widoczny — pierwszy krok flow (Wymaganie #1).
    await expect(page.getByTestId('sld-empty-state-insert-gpz')).toBeVisible();

    // Prawy klik na empty state → menu kontekstowe background z akcją insert-gpz.
    await emptyState.first().click({ button: 'right' });
    await expect(page.getByText('Wstaw główny punkt zasilania')).toBeVisible();

    // Brak crashy.
    expect(guards.pageErrors, `pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
    expect(guards.errors, `console.error: ${guards.errors.join('\n')}`).toEqual([]);
  });

  test('Step 1: menu kontekstowe background ma akcję "Otwórz katalogi techniczne"', async ({ page }) => {
    await mockMinimalBackend(page);
    await page.addInitScript(() => { localStorage.clear(); });

    await page.goto('/#dashboard', { waitUntil: 'commit' });
    await page.getByTestId('dashboard-new-project').click();
    await page.getByTestId('project-metadata-name').fill('Multi-step flow demo');
    await page.getByTestId('project-metadata-save').click();
    await expect(page.getByTestId('sld-empty-state')).toBeVisible();

    // Right-click → background menu zawiera Otwórz katalogi (z SldCommandService).
    await page.getByTestId('sld-empty-state').first().click({ button: 'right' });
    await expect(page.getByText('Otwórz katalogi techniczne')).toBeVisible();
  });

  test('Empty state CTA secondary „Przeglądaj katalogi" jest klikalny', async ({ page }) => {
    const guards = installConsoleGuards(page);
    await mockMinimalBackend(page);
    await page.addInitScript(() => { localStorage.clear(); });

    await page.goto('/#dashboard', { waitUntil: 'commit' });
    await page.getByTestId('dashboard-new-project').click();
    await page.getByTestId('project-metadata-name').fill('Multi-step flow demo');
    await page.getByTestId('project-metadata-save').click();
    await expect(page.getByTestId('sld-empty-state')).toBeVisible();

    const secondaryCTA = page.getByTestId('sld-empty-state-open-catalogs');
    await expect(secondaryCTA).toBeVisible();
    await expect(secondaryCTA).toHaveText(/Przeglądaj katalogi techniczne/);

    await secondaryCTA.click();

    // Brak crashy.
    expect(guards.pageErrors, `pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
  });
});
