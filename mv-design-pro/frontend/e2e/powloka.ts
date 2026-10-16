/*
 * Pomocniki e2e powłoki (karta K1 POWLOKA).
 *
 * Motyw i „Szczegóły audytowe" nie są już osobnymi przyciskami paska tytułowego —
 * żyją w menu „Widok" paska projektu. Pomocniki wykonują REALNĄ ścieżkę
 * użytkownika: natywny klik w „Widok", potem natywny klik w pozycję menu
 * (menu zamyka się po wyborze).
 */

import { expect, type Page } from '@playwright/test';

/** Przełącza motyw ekranu: menu „Widok" → „Motyw ekranu". */
export async function przelaczMotyw(page: Page): Promise<void> {
  await page.getByTestId('mvd-view-menu').click();
  await page.getByTestId('mvd-theme-toggle').click();
  await expect(page.getByRole('menu')).toHaveCount(0);
}

/** Włącza „Szczegóły audytowe" (jeśli wyłączone): menu „Widok" → pozycja przełącznika. */
export async function wlaczSzczegolyAudytowe(page: Page): Promise<void> {
  await page.getByTestId('mvd-view-menu').click();
  const pozycja = page.getByTestId('mvd-szczegoly-audytowe');
  if ((await pozycja.getAttribute('aria-checked')) === 'true') {
    await page.keyboard.press('Escape');
    return;
  }
  await pozycja.click();
  await page.getByTestId('mvd-view-menu').click();
  await expect(page.getByTestId('mvd-szczegoly-audytowe')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
}
