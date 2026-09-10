/**
 * Nawigacja warsztatu „Wyniki i dowody" po karcie B-02 / W3-E (2026-09-10):
 * OBSZAR → ANALIZA zamiast ~30 równorzędnych zakładek. Zakładka jest w DOM tylko
 * w obrębie AKTYWNEGO obszaru, więc bezpośredni klik `mvd-wyniki-zakladka-<id>`
 * z innego obszaru trafiał w pustkę. Jedna droga dla wszystkich speców: przycisk
 * obszaru niesie `data-zakladki` (identyfikatory zakładek obszaru z JEDNEGO źródła
 * prawdy `ui2/spaces/wyniki/obszary.ts`) — spec nie kopiuje mapy obszarów.
 */
import { expect, type Page } from '@playwright/test';

/** Otwiera zakładkę warsztatu Wyników REALNYMI klikami: obszar, potem zakładka. */
export async function otworzZakladkeWynikow(page: Page, zakladka: string): Promise<void> {
  const obszar = page.locator(`[data-testid^="mvd-wyniki-obszar-"][data-zakladki~="${zakladka}"]`);
  await expect(obszar, `zakładka „${zakladka}" nie należy do żadnego widocznego obszaru`).toHaveCount(1, {
    timeout: 20000,
  });
  if ((await obszar.getAttribute('aria-selected')) !== 'true') await obszar.click();
  const przycisk = page.getByTestId(`mvd-wyniki-zakladka-${zakladka}`);
  await expect(przycisk).toBeVisible({ timeout: 20000 });
  await przycisk.click();
  await expect(przycisk).toHaveAttribute('aria-selected', 'true');
}
