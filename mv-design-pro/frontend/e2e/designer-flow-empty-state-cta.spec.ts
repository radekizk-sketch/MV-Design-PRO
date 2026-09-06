/**
 * E2E: Designer empty-state CTA → naturalny flow projektanta sieci.
 *
 * Cel: weryfikacja, że po stworzeniu pierwszego projektu operator widzi
 * JAWNY przycisk „Wstaw Główny Punkt Zasilający" jako pierwszy krok flow
 * (wymaganie #1 z `docs/audit/AUDYT_SLD_DESIGNER_2026-05-19.md`).
 *
 * Test używa mock backend (page.route) — nie wymaga uruchomionego serwera.
 * Pokrycie scenariusza:
 *   1. Dashboard → utworzenie projektu „Demo flow projektanta"
 *   2. Workspace pokazuje empty state z 2 CTA:
 *      - primary: „Wstaw Główny Punkt Zasilający"
 *      - secondary: „Przeglądaj katalogi techniczne"
 *   3. Klik primary → URL/state przechodzi do formularza/operacji
 *      `add_grid_source_sn` (audit 2026-05-19 §7.2 pakiet A)
 *   4. Brak błędów konsoli (console.error / pageerror)
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

async function mockDesignerBackend(page: Page): Promise<void> {
  let projectCreated = false;
  let caseCreated = false;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const { pathname } = url;

    // Projekty
    if (method === 'POST' && pathname === '/api/projects') {
      projectCreated = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'proj-demo-flow',
          name: 'Demo flow projektanta',
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
                id: 'proj-demo-flow',
                name: 'Demo flow projektanta',
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

    // Cases
    if (method === 'POST' && pathname === '/api/study-cases') {
      caseCreated = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'case-demo-flow',
          project_id: 'proj-demo-flow',
          name: 'Wariant 1',
          description: '',
          case_type: 'ShortCircuitCase',
          is_active: true,
          result_status: 'NONE', results_valid: false, result_status_reason: 'brak-wyniku', result_status_reason_pl: 'Brak zapisanego wyniku dla tego przebiegu — nie ma czego nałożyć na schemat.', rewizja_biegu: null, rewizja_biezaca: 1, zmiany_od_biegu: [],
          created_at: '2026-05-19T10:00:01Z',
          updated_at: '2026-05-19T10:00:01Z',
          config: {},
        }),
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/study-cases/project/proj-demo-flow') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          caseCreated
            ? [{
                id: 'case-demo-flow',
                name: 'Wariant 1',
                description: '',
                case_type: 'ShortCircuitCase',
                is_active: true,
                result_status: 'NONE', results_valid: false, result_status_reason: 'brak-wyniku', result_status_reason_pl: 'Brak zapisanego wyniku dla tego przebiegu — nie ma czego nałożyć na schemat.', rewizja_biegu: null, rewizja_biezaca: 1, zmiany_od_biegu: [],
                updated_at: '2026-05-19T10:00:01Z',
              }]
            : [],
        ),
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/study-cases/project/proj-demo-flow/active') {
      await route.fulfill({
        status: projectCreated && caseCreated ? 200 : 204,
        contentType: 'application/json',
        body: projectCreated && caseCreated
          ? JSON.stringify({
              id: 'case-demo-flow',
              project_id: 'proj-demo-flow',
              name: 'Wariant 1',
              description: '',
              case_type: 'ShortCircuitCase',
              is_active: true,
              result_status: 'NONE', results_valid: false, result_status_reason: 'brak-wyniku', result_status_reason_pl: 'Brak zapisanego wyniku dla tego przebiegu — nie ma czego nałożyć na schemat.', rewizja_biegu: null, rewizja_biezaca: 1, zmiany_od_biegu: [],
              created_at: '2026-05-19T10:00:01Z',
              updated_at: '2026-05-19T10:00:01Z',
              config: {},
            })
          : '',
      });
      return;
    }

    // ENM snapshot — pusty
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

    // Naprawa (dryf kontraktu mocka, audyt E2E-MOCK-BEZ-CI): shell woła
    // refresh_snapshot NATYCHMIAST po zamontowaniu case'a (store.ts:
    // refreshFromBackend na mount) — bez tego handlera trafiał w default
    // '{}' bez kształtu DomainOpResponseV1, `hasModel` nigdy nie stawał się
    // `true`, a kanwa SLD/`sld-empty-state` utykały w „Ładowanie układu sieci".
    if (method === 'POST' && pathname === '/api/cases/case-demo-flow/enm/domain-ops') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(pustaOdpowiedzDomainOps('case-demo-flow')),
      });
      return;
    }

    // Default — pusty obiekt
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

test.describe('Designer flow — empty-state CTA (audit 2026-05-19 wymaganie #1)', () => {
  test('po utworzeniu projektu operator widzi jawny CTA „Wstaw GPZ" jako 1. krok', async ({ page }) => {
    const guards = installConsoleGuards(page);
    await mockDesignerBackend(page);

    await page.addInitScript(() => {
      localStorage.clear();
    });

    await page.goto('/#dashboard', { waitUntil: 'commit' });

    // Dashboard widoczny.
    await expect(page.getByTestId('project-dashboard-surface')).toBeVisible();
    await page.getByTestId('dashboard-new-project').click();

    // Modal metadanych.
    await expect(page.getByRole('dialog', { name: 'Metadane projektu' })).toBeVisible();
    await page.getByTestId('project-metadata-name').fill('Demo flow projektanta');
    await page.getByTestId('project-metadata-save').click();

    // Workspace SLD i empty state.
    await expect(page.getByTestId('sld-canvas-v3-workspace')).toBeVisible();
    await expect(page.getByTestId('sld-empty-state')).toBeVisible();

    // KLUCZOWE: 2 nowe CTA są jawnie widoczne i etykietowane po polsku.
    const ctaPrimary = page.getByTestId('sld-empty-state-insert-gpz');
    const ctaSecondary = page.getByTestId('sld-empty-state-open-catalogs');
    await expect(ctaPrimary).toBeVisible();
    await expect(ctaPrimary).toHaveText(/Wstaw Główny Punkt Zasilający/);
    await expect(ctaSecondary).toBeVisible();
    await expect(ctaSecondary).toHaveText(/Przeglądaj katalogi techniczne/);

    // Klik primary CTA → operacja `add_grid_source_sn` zostaje propagowana.
    // INTENCJA BEZ ZMIAN (audit 2026-05-19 §7.2 pakiet A): CTA prowadzi do
    // formularza tej operacji. Bieżący flow (karta K1/B, 2026-07-29): zamiast
    // dawnego `add-grid-source-form` otwiera się pełnoekranowy kreator ui2
    // `KreatorZrodloZasilania` (operationFormRegistry → mvd-kreator-zrodlo),
    // który ZASTĘPUJE widok kanwy — empty state nie jest już widoczny.
    // Test nadal sprawdza brak crash + brak błędów konsoli (determinizm flow).
    await ctaPrimary.click();
    await expect(page.getByTestId('mvd-kreator-zrodlo')).toBeVisible();

    // Brak błędów konsoli i nieobsłużonych wyjątków.
    expect(guards.pageErrors, `pageerror: ${guards.pageErrors.join('\n')}`).toEqual([]);
    expect(guards.errors, `console.error: ${guards.errors.join('\n')}`).toEqual([]);
  });
});
