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
 * Karta pola E-11 otwarta brakiem z wiersza „Pola SN” (ścieżka użytkownika, kliki natywne):
 * `gpz-karta-pola-zabezpieczenie-<motyw>` — „Brak sterownika · dodaj zabezpieczenie” z Pola GPZ 1.1
 * (sekcja „Powiązania pola”, wyróżniona pozycja zabezpieczenia), `gpz-karta-pola-odejscie-<motyw>` —
 * „Bez odejścia · wyprowadź odcinek z pola” z Pola GPZ 2.1, `gpz-karta-pola-kreator-zabezpieczenia-
 * <motyw>` — kreator zabezpieczenia otwarty akcją karty pola. Karta dłuższa niż ekran: kadr
 * całego panelu (wyższe okno i zdjęte przewijanie wewnętrzne panelu).
 *
 * KARTA-POLA-KD6 (standard warsztatu KD6, kontrakt prezentacji §10): pomiar karty pola —
 * wysokość, liczba wierszy i liczba słów na pierwszym planie (adnotacje `karta-pola-<motyw>`);
 * stan ruchowy bez telemetrii jednym wierszem; bez identyfikatora technicznego, „po migracji”
 * i miniatury schematu na pierwszym planie. Kreator otwarty akcją karty ma pole i wyłącznik
 * wybrane, stopka nazywa brak typu katalogowego; zapis natywnym klikiem wiąże przekaźnik z polem
 * (`Bay.protection_ref` z realnego backendu).
 *
 * Sufiks plików: `GPZ_ZRZUTY_ETAP` (`przed` — stan sprzed przebudowy ekranu, `po` — domyślnie).
 * Zrzuty: `docs/audit/visual/gpz_konfigurator/` (przez `katalogZrzutow` — bez
 * `ZRZUTY_DO_DOKUMENTACJI=1` trafiają do `test-results/zrzuty-dokumentacji/…`).
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { katalogZrzutow } from './katalogZrzutow';
import { enm, otworzKonfiguratorGpz, otworzSchemat, siecGpz } from './gpzKonfigurator';

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

/** Pomiar karty pola (KD6): wysokość treści, wiersze danych i słowa na pierwszym planie. */
async function pomiarKartyPola(page: Page): Promise<string> {
  return page.getByTestId('bay-card-sections').evaluate((el) => {
    const widoczne = (e: Element) => (e as HTMLElement).getClientRects().length > 0;
    const wiersze = Array.from(
      el.querySelectorAll(
        'div[data-testid^="engineering-field-"], [data-testid^="engineering-braki-"], .mvd-kt-wiersz, tbody tr, [data-testid="karta-pola-powiazania"] li, [data-testid="karta-pola-powiazania"] button',
      ),
    ).filter(widoczne).length;
    const slowa = ((el as HTMLElement).innerText.match(/\S+/gu) ?? []).length;
    return `${Math.round(el.scrollHeight)} px · ${wiersze} wierszy · ${slowa} słów`;
  });
}

/** Panel karty pola w całości: wyższe okno i zdjęte przewijanie wewnętrzne sekcji karty. */
async function zrzutCalejKartyPola(page: Page, plik: string): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 2600 });
  const karta = page.getByTestId('bay-configurator-surface');
  await karta.evaluate((el) => {
    for (const w of [el, ...Array.from(el.querySelectorAll<HTMLElement>('[data-testid="bay-card-sections"]'))]) {
      (w as HTMLElement).style.overflow = 'visible';
      (w as HTMLElement).style.height = 'auto';
      (w as HTMLElement).style.maxHeight = 'none';
    }
  });
  await karta.screenshot({ path: resolve(KATALOG, plik) });
  await page.setViewportSize({ width: 1600, height: 1000 });
}

for (const motyw of MOTYWY) {
  test(`karta pola z braku w wierszu „Pola SN” i kreator zabezpieczenia (${motyw.klucz})`, async ({ page, request }) => {
    test.setTimeout(240000);
    mkdirSync(KATALOG, { recursive: true });
    const seed = await siecGpz(request, 2);
    const pola = (await enm(request, seed.caseId)).bays!.filter((b) => b.substation_ref === seed.stacjaRef);
    const pole11 = pola.find((b) => b.name === 'Pole liniowe GPZ 1.1')!;
    const pole21 = pola.find((b) => b.name === 'Pole liniowe GPZ 2.1')!;
    await otworzSchemat(page, seed, motyw.theme);
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe(motyw.theme);

    // (a) „Brak sterownika” z Pola GPZ 1.1 → karta pola z wyróżnionym zabezpieczeniem.
    await otworzKonfiguratorGpz(page, seed.zrodloRef);
    await page.getByTestId('gpz-card-tab-bays').click();
    await page.getByTestId(`tabela-pol-sn-napraw-zabezpieczenie-${pole11.ref_id}`).click();
    await expect(page.getByTestId('karta-pola-powiazania')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId(`karta-pola-zabezpieczenie-${pole11.ref_id}`)).toHaveAttribute('data-wyroznione', 'true');
    await expect(page.getByTestId(`karta-pola-odejscie-${pole11.ref_id}`)).toContainText('Odejście: kabel Odcinek 1');
    // KD6: co stoi w polu — tabela aparatów K6; stan ruchowy bez telemetrii jednym wierszem;
    // identyfikatory techniczne i miniatura schematu nie na pierwszym planie.
    const karta = page.getByTestId('bay-configurator-surface');
    await expect(karta.getByTestId('inspektor-karta-tabela-aparaty')).toContainText('Wyłącznik');
    await expect(karta.getByTestId('inspektor-karta-tabela-aparaty')).not.toContainText('Aparat Pole liniowe');
    await expect(karta.getByTestId('engineering-braki-stan_ruchowy_pola-brak_telemetrii')).toContainText('brak telemetrii (11 sygnałów)');
    for (const zbedne of [/Element #/u, /Po migracji/u, /Integralność modelu/u]) {
      await expect(page.getByTestId('bay-card-sections')).not.toContainText(zbedne);
    }
    await expect(karta.getByTestId('bay-svg-renderer')).toHaveCount(0);
    test.info().annotations.push({ type: `karta-pola-${motyw.klucz}`, description: await pomiarKartyPola(page) });
    await zrzutCalejKartyPola(page, `gpz-karta-pola-zabezpieczenie-${motyw.klucz}-${ETAP}.png`);

    // (c) akcja karty pola → kreator zabezpieczenia przypięty do pola: pole i wyłącznik wybrane,
    // stopka nazywa jedyny brak (typ katalogowy); zapis natywnym klikiem wiąże przekaźnik z polem.
    await page.getByTestId(`karta-pola-napraw-zabezpieczenie-${pole11.ref_id}`).click();
    const kreator = page.getByTestId('mvd-kreator-przekaznik');
    await expect(kreator).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('mvd-kreator-przekaznik-bay')).toHaveValue(pole11.ref_id, { timeout: 20000 });
    await expect(page.getByTestId('mvd-kreator-przekaznik-breaker')).not.toHaveValue('');
    await expect(page.getByTestId('mvd-kreator-walidacja')).toHaveText('Wybierz typ katalogowy przekaźnika, aby zapisać zabezpieczenie.');
    await kreator.screenshot({ path: resolve(KATALOG, `gpz-karta-pola-kreator-zabezpieczenia-${motyw.klucz}-${ETAP}.png`) });
    const katalogPrzekaznika = page.getByTestId('mvd-kreator-przekaznik-katalog');
    await expect(katalogPrzekaznika.locator('option:not([value=""])').first()).toBeAttached({ timeout: 20000 });
    const typ = await katalogPrzekaznika.locator('option:not([value=""])').first().getAttribute('value');
    await katalogPrzekaznika.selectOption(typ!);
    await page.getByTestId('mvd-kreator-przekaznik-zapisz').click();
    await expect(kreator).toHaveCount(0, { timeout: 20000 });
    await expect
      .poll(async () => ((await enm(request, seed.caseId)).bays ?? []).find((b) => b.ref_id === pole11.ref_id)?.protection_ref ?? null, {
        timeout: 20000,
      })
      .not.toBeNull();

    // (b) „Bez odejścia” z Pola GPZ 2.1 → karta pola z wyróżnionym odejściem. Karta pola zajmuje
    // obszar roboczy zamiast kanwy — powrót do schematu ścieżką użytkownika: okruszek „Schemat”.
    await page.getByRole('button', { name: 'Schemat', exact: true }).click();
    await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 60000 });
    await otworzKonfiguratorGpz(page, seed.zrodloRef);
    await page.getByTestId('gpz-card-tab-bays').click();
    await page.getByTestId(`tabela-pol-sn-napraw-odejscie-${pole21.ref_id}`).click();
    await expect(page.getByTestId('bay-configurator-surface').locator('h2')).toHaveText('Pole liniowe GPZ 2.1', { timeout: 20000 });
    await expect(page.getByTestId(`karta-pola-odejscie-${pole21.ref_id}`)).toHaveAttribute('data-wyroznione', 'true');
    await zrzutCalejKartyPola(page, `gpz-karta-pola-odejscie-${motyw.klucz}-${ETAP}.png`);
  });
}
