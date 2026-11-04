/**
 * Karta KATALOG-PRZEJECIE-PR (rozszerzenie decyzji 1) — zrzuty pięciu kart konfiguratora GPZ
 * w obu motywach na REALNYM backendzie (materiał oceny wizualnej właściciela, bramka B-02 —
 * spec NIE wystawia werdyktu wizualnego).
 *
 * Kadry: „Identyfikacja", „Sieć zasilająca" (dawniej „Strona 110 kV"), „Transformator 110/SN", „Sekcje SN", „Pola SN"
 * (dawniej „Bilans pól SN"; zrzuty „przed" tej karty: `gpz-bays-<motyw>-przed.png`) — konfigurator
 * otwarty ścieżką użytkownika (prawy klik w źródło GPZ → „Edytuj główny punkt zasilania"),
 * kliknięcie zakładki natywne. Pomiar przed/po (kontrakt prezentacji §10):
 * wysokość treści karty w px trafia do adnotacji testu (`wysokosc-<karta>-<motyw>`).
 *
 * Sufiks plików: `GPZ_ZRZUTY_ETAP` (`przed` — stan sprzed przebudowy ekranu, `po` — domyślnie).
 * Zrzuty: `docs/audit/visual/gpz_konfigurator/` (przez `katalogZrzutow` — bez
 * `ZRZUTY_DO_DOKUMENTACJI=1` trafiają do `test-results/zrzuty-dokumentacji/…`).
 */
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { katalogZrzutow } from './katalogZrzutow';
import { otworzKonfiguratorGpz, otworzSchemat, siecGpz } from './gpzKonfigurator';

const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'audit', 'visual', 'gpz_konfigurator'));
const ETAP = process.env.GPZ_ZRZUTY_ETAP === 'przed' ? 'przed' : 'po';
const KARTY = ['identification', 'hv-side', 'transformer', 'sections', 'bays'] as const;
const MOTYWY = [
  { klucz: 'ciemny', theme: 'dark_scada' as const },
  { klucz: 'jasny', theme: 'light_technical' as const },
] as const;

for (const motyw of MOTYWY) {
  test(`konfigurator GPZ — pięć kart (${motyw.klucz})`, async ({ page, request }) => {
    test.setTimeout(240000);
    mkdirSync(KATALOG, { recursive: true });
    const seed = await siecGpz(request, 2);
    await otworzSchemat(page, seed, motyw.theme);
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe(motyw.theme);
    await otworzKonfiguratorGpz(page, seed.zrodloRef);
    const powierzchnia = page.getByTestId('gpz-configurator-surface');
    for (const karta of KARTY) {
      await page.getByTestId(`gpz-card-tab-${karta}`).click();
      const tresc = page.getByTestId(`gpz-card-content-${karta}`);
      await expect(tresc).toBeVisible();
      if (karta === 'transformer') {
        await expect(page.getByTestId(`gpz-transformer-plate-${seed.transformatorRef}`)).toContainText('25 MVA');
      }
      const wysokosc = await tresc.evaluate((el) => Math.round(el.getBoundingClientRect().height));
      test.info().annotations.push({ type: `wysokosc-${karta}-${motyw.klucz}`, description: `${wysokosc} px` });
      await powierzchnia.screenshot({ path: resolve(KATALOG, `gpz-${karta}-${motyw.klucz}-${ETAP}.png`) });
    }
  });
}
