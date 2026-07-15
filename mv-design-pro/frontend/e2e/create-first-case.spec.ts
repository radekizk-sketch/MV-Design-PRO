import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

interface ConsoleGuards {
  errors: string[];
  pageErrors: string[];
  warningCounts: Map<string, number>;
}

function installConsoleGuards(page: Page): ConsoleGuards {
  const guards: ConsoleGuards = {
    errors: [],
    pageErrors: [],
    warningCounts: new Map<string, number>(),
  };

  page.on('pageerror', (error) => {
    guards.pageErrors.push(error.message);
  });

  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text();
    if (msg.type() === 'error') {
      guards.errors.push(text);
      return;
    }
    if (msg.type() === 'warning') {
      guards.warningCounts.set(text, (guards.warningCounts.get(text) ?? 0) + 1);
    }
  });

  return guards;
}

async function mockCaseCreationApi(page: Page): Promise<void> {
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
          id: 'proj-001',
          name: 'Projekt 1',
          description: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
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
                id: 'proj-001',
                name: 'Projekt 1',
                description: null,
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
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
          id: 'case-001',
          project_id: 'proj-001',
          name: 'Wariant 1',
          description: '',
          case_type: 'ShortCircuitCase',
          is_active: true,
          result_status: 'NONE',
          created_at: '2026-01-01T00:00:01Z',
          updated_at: '2026-01-01T00:00:01Z',
          config: {},
        }),
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/study-cases/project/proj-001') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          caseCreated
            ? [{
                id: 'case-001',
                name: 'Wariant 1',
                description: '',
                case_type: 'ShortCircuitCase',
                is_active: true,
                result_status: 'NONE',
                updated_at: '2026-01-01T00:00:01Z',
              }]
            : [],
        ),
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/study-cases/project/proj-001/active') {
      await route.fulfill({
        status: projectCreated && caseCreated ? 200 : 204,
        contentType: 'application/json',
        body: projectCreated && caseCreated
          ? JSON.stringify({
              id: 'case-001',
              project_id: 'proj-001',
              name: 'Wariant 1',
              description: '',
              case_type: 'ShortCircuitCase',
              is_active: true,
              result_status: 'NONE',
              created_at: '2026-01-01T00:00:01Z',
              updated_at: '2026-01-01T00:00:01Z',
              config: {},
            })
          : '',
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });
}

test('utworzenie pierwszego projektu przechodzi deterministycznie do E-01 bez freeze', async ({ page }) => {
  const guards = installConsoleGuards(page);
  await mockCaseCreationApi(page);

  await page.addInitScript(() => {
    localStorage.clear();
  });

  await page.goto('/#dashboard', { waitUntil: 'commit' });

  await expect(page.getByTestId('project-dashboard-surface')).toBeVisible();
  await page.getByTestId('dashboard-new-project').click();

  await expect(page.getByRole('dialog', { name: 'Metadane projektu' })).toBeVisible();
  await page.getByTestId('project-metadata-name').fill('Projekt 1');
  await page.getByTestId('project-metadata-save').click();

  await expect(page.getByTestId('sld-workspace-container')).toBeVisible();
  await expect(page.locator('[data-testid="active-case-bar"]')).toContainText('Projekt 1');
  await expect(page.locator('[data-testid="active-case-bar"]')).toContainText('do obliczenia');
  await expect(page.getByTestId('sld-empty-state')).toBeVisible();

  const uniqueWarnCount = guards.warningCounts.size;
  expect(guards.pageErrors, `Bledy pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
  expect(guards.errors, `Bledy console.error: ${guards.errors.join('\n')}`).toEqual([]);
  expect(uniqueWarnCount, 'Liczba unikalnych ostrzezen przekroczyla budzet 5').toBeLessThanOrEqual(5);
});
