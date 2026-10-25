import { test, expect } from '@playwright/test';

/** Odbiór tylko przy jawnym VITE_MV_GIS_R11=1.
 * W standardowym CI GIS jest domyślnie OFF (UX-09/P3/STOP).
 * Gdy włączony, spec nie symuluje MapLibre — wymaga prawdziwego WebGL.
 */
test.describe('GIS R11 — rzeczywisty MapLibre w głównej aplikacji', () => {
  test.skip(process.env.VITE_MV_GIS_R11 !== '1', 'Pilot GIS nie jest aktywowany.');

  test('przegląd danych syntetycznych działa na prawdziwym silniku WebGL', async ({ page }) => {
    await page.goto('/');
    const model = page.getByRole('navigation').getByRole('button', { name: /^Model sieci\b/ }).first();
    await expect(model).toBeVisible();
    await model.click();
    const tab = page.getByRole('tab', { name: 'Mapa GIS (pilotaż)' });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(page.getByTestId('mvd-gis-r11')).toBeVisible();
    await expect(page.getByText('MapLibre WebGL — gotowy')).toBeVisible({ timeout: 30_000 });
    const canvas = page.locator('.mvd-gis-r11-map canvas.maplibregl-canvas');
    await expect(canvas).toBeVisible();
    const gpu = await canvas.evaluate((node) =>
      Boolean((node as HTMLCanvasElement).getContext('webgl2') ||
              (node as HTMLCanvasElement).getContext('webgl')));
    expect(gpu, 'Mapa musi mieć prawdziwy kontekst WebGL, nie atrapę SVG').toBe(true);
    await page.getByRole('button', { name: 'Załaduj sieć demonstracyjną' }).click();
    await expect(page.getByRole('button', { name: 'Kabel SN 15 kV' })).toBeVisible();
    await page.getByRole('button', { name: 'Kabel SN 15 kV' }).click();
    await expect(page.getByText('brak potwierdzonego powiązania', { exact: false })).toBeVisible();
    await expect(page.getByText('Topologia: niepotwierdzona', { exact: false })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('gis-r11-real-webgl.png'), fullPage: true });
  });

  test('WMS nie może uruchomić ruchu sieciowego bez dokumentu i zgody', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: /^Model sieci\b/ }).first().click();
    await page.getByRole('tab', { name: 'Mapa GIS (pilotaż)' }).click();
    const button = page.getByRole('button', { name: 'Włącz warstwę WMS' });
    await expect(button).toBeDisabled();
    await expect(page.getByText('Tryb bez podkładu sieciowego — offline')).toBeVisible();
  });
});
