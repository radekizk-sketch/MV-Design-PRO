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

test('konfiguracja pierwszego wariantu pracy jest deterministyczna i bez freeze', async ({ page }) => {
  const guards = installConsoleGuards(page);
  await mockCaseCreationApi(page);

  await page.addInitScript(() => {
    localStorage.clear();
  });

  await page.goto('/', { waitUntil: 'commit' });

  const createButton = page.getByTestId('sld-empty-overlay-create-case');
  await expect(createButton).toBeVisible();
  await createButton.click();

  await expect(page.getByTestId('first-variant-quickstart')).toBeVisible();
  await page.getByTestId('first-variant-project-name').fill('Projekt 1');
  await page.getByTestId('first-variant-name').fill('Wariant 1');
  await page.getByTestId('first-variant-submit').click();

  await expect(page.locator('[data-testid="active-case-bar"]')).toContainText('Biezacy zestaw:');
  await expect(page.locator('[data-testid="active-case-bar"]')).toContainText('Wariant 1');
  await expect(createButton).toHaveCount(0);

  const uniqueWarnCount = guards.warningCounts.size;
  expect(guards.pageErrors, `Bledy pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
  expect(guards.errors, `Bledy console.error: ${guards.errors.join('\n')}`).toEqual([]);
  expect(uniqueWarnCount, 'Liczba unikalnych ostrzezen przekroczyla budzet 5').toBeLessThanOrEqual(5);
});
