/**
 * E2E Playwright: Kreator Stacji KOMPLETNY v2, 17-krokowy flow.
 *
 * Wymaganie celu: naturalny flow projektanta sieci end-to-end:
 * 1. Otwórz kreator z trasy #kreator-stacji-v2.
 * 2. Sidebar pokazuje 17 kroków w 7 grupach.
 * 3. Klik "Dalej" przesuwa do kolejnych kroków.
 * 4. Klik na element w sidebarze wykonuje bezpośredni skok.
 * 5. Sidebar oznacza ukończone kroki.
 * 6. Footer pokazuje "Krok N / 17".
 * 7. Ostatni krok pokazuje przycisk "Zakończ kreator".
 *
 * Test używa Playwright bez backendu. Mockowane API sprawdza logikę UI,
 * rendering i interakcje bez wpływu warstwy obliczeniowej.
 */
import { test, expect, type Page } from '@playwright/test';

async function mockMinimalBackend(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });
}

async function openStationWizard(page: Page): Promise<void> {
  await page.goto('/#kreator-stacji-v2', { waitUntil: 'commit' });
  await expect(page.getByTestId('station-wizard-surface')).toBeVisible();
}

test.describe('Station Wizard v2, 17-krokowy flow E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockMinimalBackend(page);
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('mvdp.onboarding.completed', '1');
    });
  });

  test('otwarcie #kreator-stacji-v2 renderuje workspace, sidebar i footer', async ({ page }) => {
    await openStationWizard(page);
    await expect(page.getByTestId('station-wizard-workspace')).toBeVisible();
    await expect(page.getByTestId('station-wizard-sidebar')).toBeVisible();
    await expect(page.getByTestId('station-wizard-step-content')).toBeVisible();
    await expect(page.getByTestId('station-wizard-footer')).toBeVisible();
    await expect(page.getByTestId('onboarding-tour')).toHaveCount(0);
  });

  test('sidebar pokazuje 17 kroków w 7 grupach', async ({ page }) => {
    await openStationWizard(page);

    const stepIds = [
      'cable', 'switchgear', 'bays', 'apparatus', 'ct', 'vt', 'meters',
      'trafo', 'earthing', 'nn', 'sources', 'pq', 'protection', 'ncrfg',
      'infra', 'network', 'readiness',
    ];
    for (const id of stepIds) {
      await expect(page.getByTestId(`station-wizard-step-${id}`)).toBeVisible();
    }

    const groups = ['SN', 'Pomiary', 'Stacja', 'OZE', 'Ochrona', 'Infrastr.', 'Obliczenia'];
    for (const group of groups) {
      await expect(page.getByTestId(`station-wizard-group-${group}`)).toBeVisible();
    }
  });

  test('domyślnie aktywny krok 1 (cable) pokazuje przyłączenie SN', async ({ page }) => {
    await openStationWizard(page);
    const workspace = page.getByTestId('station-wizard-workspace');
    await expect(workspace).toHaveAttribute('data-active-step', 'cable');

    const stepContent = page.getByTestId('station-wizard-step-content');
    await expect(stepContent).toHaveAttribute('data-active-step', 'cable');
    await expect(stepContent.getByText('Kabel referencyjny SN')).toBeVisible();
  });

  test('klik "Dalej" przesuwa do rozdzielnicy SN', async ({ page }) => {
    await openStationWizard(page);
    await page.getByTestId('station-wizard-next').click();

    await expect(page.getByTestId('station-wizard-workspace'))
      .toHaveAttribute('data-active-step', 'switchgear');
    await expect(page.getByText('Wybór rozdzielnicy producenta')).toBeVisible();
  });

  test('klik bezpośrednio na krok w sidebarze nawiguje do gotowości', async ({ page }) => {
    await openStationWizard(page);
    await page.getByTestId('station-wizard-step-readiness').click();

    await expect(page.getByTestId('station-wizard-workspace'))
      .toHaveAttribute('data-active-step', 'readiness');
    await expect(page.getByTestId('readiness-matrix-grid')).toBeVisible();
  });

  test('karty producentów są widoczne w kroku rozdzielnicy SN', async ({ page }) => {
    await openStationWizard(page);
    await page.getByTestId('station-wizard-step-switchgear').click();

    await expect(page.getByTestId('vendor-card-abb_safe_plus')).toBeVisible();
    await expect(page.getByTestId('vendor-card-schneider_rm6')).toBeVisible();
    await expect(page.getByTestId('vendor-card-siemens_8djh')).toBeVisible();
    await expect(page.getByTestId('vendor-card-eaton_xiria')).toBeVisible();
    await expect(page.getByTestId('vendor-card-zpue_rotoblok')).toBeVisible();
  });

  test('macierz blokad pól SN pokazuje odniesienie PN-EN 62271-200', async ({ page }) => {
    await openStationWizard(page);
    await page.getByTestId('station-wizard-step-bays').click();

    await expect(page.getByTestId('interlock-matrix-table')).toBeVisible();
    await expect(page.getByText(/PN-EN 62271-200/).first()).toBeVisible();
  });

  test('footer pokazuje krok, liczbę 17 i ukończenie', async ({ page }) => {
    await openStationWizard(page);
    const footer = page.getByTestId('station-wizard-footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('Krok');
    await expect(footer).toContainText('17');
    await expect(footer).toContainText('Ukończone');
  });

  test('klik next 16 razy przesuwa do finalnego kroku gotowości', async ({ page }) => {
    await openStationWizard(page);
    for (let i = 0; i < 16; i += 1) {
      await page.getByTestId('station-wizard-next').click();
    }
    await expect(page.getByTestId('station-wizard-workspace'))
      .toHaveAttribute('data-active-step', 'readiness');
    await expect(page.getByTestId('station-wizard-next')).toContainText('Zakończ');
  });

  test('przycisk anulowania wraca do schematu SLD', async ({ page }) => {
    await openStationWizard(page);
    await page.getByTestId('station-wizard-cancel').click();
    await expect(page).toHaveURL(/#sld($|-view)|#$|\/$/);
  });

  test('trasa kreatora pozostaje dostępna jako punkt wejścia z pustego SLD', async ({ page }) => {
    await page.goto('/#dashboard', { waitUntil: 'commit' });
    await openStationWizard(page);
  });
});
