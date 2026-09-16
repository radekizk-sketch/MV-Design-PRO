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
  // Limit asercji z konfiguracji (45 s, z pomiaru zimnej kompilacji grafu ekranów
  // wyników 31,7 s — playwright.config.ts); własny limit 20 s tego pomocnika był
  // drugą, niezależną kopią progu i dawał flaky na runnerze CI (run 444, 2026-09-16:
  // zakładka „jakosc" niewidoczna w 20 s, zielona w ponowieniu).
  await expect(obszar, `zakładka „${zakladka}" nie należy do żadnego widocznego obszaru`).toHaveCount(1);
  if ((await obszar.getAttribute('aria-selected')) !== 'true') await obszar.click();
  const przycisk = page.getByTestId(`mvd-wyniki-zakladka-${zakladka}`);
  await expect(przycisk).toBeVisible();
  await przycisk.click();
  await expect(przycisk).toHaveAttribute('aria-selected', 'true');
}
