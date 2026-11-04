/**
 * Karta KATALOG-PRZEJECIE-PR (rozszerzenie decyzji 1) — konfigurator GPZ jest JEDYNYM edytorem
 * GPZ: każda kontrolka jest operacją modelu na REALNYM backendzie, a skutek widać w modelu,
 * w wyniku zwarcia i na schemacie.
 *
 * Ścieżki użytkownika natywnie (kliki i klawiatura Playwrighta, bez zdarzeń syntetycznych),
 * po jednej dla każdej z czterech pozycji menu SLD prowadzących do konfiguratora
 * (`sldActionExecutor.ts`: open-source, add-section, show-sc-source, show-sc-data):
 *  1. „Pokaż dane zwarciowe źródła" → karta „Sieć zasilająca" → S″k 110 kV 3000 → 1000 MVA:
 *     źródło ma `sk3_mva` = `sk3_hv_mva` = 1000 (rekord równoważnika też), Ik″ szyny SN maleje;
 *  2. „Edytuj główny punkt zasilania" → „Identyfikacja" → nazwa GPZ: stacja w modelu ma nową
 *     nazwę, nagłówek konfiguratora ją pokazuje;
 *  3. „Dodaj sekcję rozdzielni SN" → karta „Sekcje SN" → zmiana nazwy sekcji
 *     (`update_gpz_section`): model i etykieta sekcji na schemacie; formularz nowej sekcji
 *     uczciwie mówi, że każda szyna SN stacji ma już sekcję (operacja dodania sekcji przyjmuje
 *     wyłącznie istniejącą, wolną szynę stacji);
 *  4. „Pokaż dane zwarciowe sekcji" (menu szyny sekcji) → karta „Sieć zasilająca" tego GPZ;
 *  5. karta „Pola SN": „Dodaj pole" z rolą baterii kondensatorów i zespołu uziemiającego → kreator
 *     pola (`add_sn_bay`) z podstawioną sekcją i rolą → pole w modelu i na schemacie; „Dodaj baterię
 *     kondensatorów" → kreator baterii na zacisku pola → bateria w modelu; „Dodaj zespół
 *     uziemiający" → kreator zespołu przypięty do pola; „Konfiguruj" → karta pola E-11.
 */
import { test, expect, type Page } from '@playwright/test';

import { enm, ikNaSzynie, otworzSchemat, siecGpz } from './gpzKonfigurator';

async function menuZrodla(page: Page, zrodloRef: string, pozycja: string): Promise<void> {
  await page.getByRole('button', { name: 'Dopasuj widok' }).click();
  // Hit-rect warstwy trafień (`data-hit-klasa="zrodlo"`) niesie ref źródła GPZ; `force` pomija
  // wyłącznie sprawdzenie przodków DOM Playwrighta (nadrzędna warstwa trafień), nie współrzędne.
  const zrodlo = page.locator(`[data-hit-klasa="zrodlo"][data-hit-owner-ref="${zrodloRef}"]`).first();
  await expect(zrodlo).toBeAttached({ timeout: 30000 });
  await zrodlo.click({ button: 'right', force: true });
  await page.getByTestId(`sld-menu-${pozycja}`).click();
  await expect(page.getByTestId('gpz-configurator-surface')).toBeVisible({ timeout: 20000 });
}

test('GPZ: S″k sieci 110 kV z konfiguratora zmienia źródło w modelu i Ik″ szyny SN', async ({ page, request }) => {
  test.setTimeout(300000);
  const seed = await siecGpz(request);
  const ikPrzed = await ikNaSzynie(request, seed.caseId, seed.szynaSnRef);

  await otworzSchemat(page, seed);
  await menuZrodla(page, seed.zrodloRef, 'show-sc-source');
  await expect(page.getByTestId('gpz-card-content-hv-side')).toBeVisible();
  const sk = page.getByTestId('gpz-supply-sk3_hv_mva');
  await expect(sk).toHaveValue('3000');
  await sk.fill('1000');
  await sk.press('Enter');

  await expect
    .poll(async () => (await enm(request, seed.caseId)).sources?.find((s) => s.ref_id === seed.zrodloRef)?.sk3_mva, {
      timeout: 20000,
    })
    .toBe(1000);
  const zrodlo = (await enm(request, seed.caseId)).sources!.find((s) => s.ref_id === seed.zrodloRef)!;
  expect(zrodlo.sk3_hv_mva).toBe(1000);
  expect(zrodlo.materialized_params?.sk3_mva).toBe(1000);
  await expect(page.getByTestId('gpz-supply-sk3_hv_mva')).toHaveValue('1000');

  const ikPo = await ikNaSzynie(request, seed.caseId, seed.szynaSnRef);
  // Z_Q na 15 kV: 1,1·15²/3000 = 0,083 Ω → 1,1·15²/1000 = 0,248 Ω przy Z_T = 0,99 Ω (25 MVA,
  // u_k 11 %): Ik″ maleje o ok. 13 %; próg 5 % odporny na kabel i odbiór.
  expect(ikPo / ikPrzed).toBeLessThan(0.95);

  // R/X = 0 nie jest siecią zasilającą — jedna reguła z kreatorem i siatką, bez operacji.
  const rx = page.getByTestId('gpz-supply-rx_ratio');
  await rx.fill('0');
  await rx.press('Enter');
  await expect(page.getByTestId('gpz-card-error-hv-side')).toContainText('Stosunek R/X musi być liczbą dodatnią.');
  expect((await enm(request, seed.caseId)).sources!.find((s) => s.ref_id === seed.zrodloRef)!.rx_ratio).toBe(0.1);
});

test('GPZ: nazwa z karty „Identyfikacja" jest nazwą stacji w modelu', async ({ page, request }) => {
  test.setTimeout(240000);
  const seed = await siecGpz(request);
  await otworzSchemat(page, seed);
  await menuZrodla(page, seed.zrodloRef, 'open-source');
  await expect(page.getByTestId('gpz-card-content-identification')).toBeVisible();
  const nazwa = page.getByTestId('gpz-name-input');
  await nazwa.fill('GPZ Wschód');
  await nazwa.press('Enter');
  await expect
    .poll(async () => (await enm(request, seed.caseId)).substations?.find((s) => s.ref_id === seed.stacjaRef)?.name, {
      timeout: 20000,
    })
    .toBe('GPZ Wschód');
  await expect(page.getByTestId('gpz-configurator-surface').locator('h2')).toHaveText('GPZ Wschód');
});

test('GPZ: sekcje SN z menu „Dodaj sekcję" — edycja sekcji w modelu i na schemacie', async ({ page, request }) => {
  test.setTimeout(240000);
  const seed = await siecGpz(request, 2);
  const model = await enm(request, seed.caseId);
  const sekcje = model.substations!.find((s) => s.ref_id === seed.stacjaRef)!.gpz_sections!;
  expect(sekcje).toHaveLength(2);
  const druga = sekcje[1];

  await otworzSchemat(page, seed);
  await menuZrodla(page, seed.zrodloRef, 'add-section');
  await expect(page.getByTestId('gpz-card-content-sections')).toBeVisible();
  await expect(page.getByTestId(`gpz-section-row-lv-${druga.section_id}`)).toBeVisible();

  // Nowa sekcja: każda szyna SN stacji ma już sekcję — formularz mówi to wprost.
  await page.getByTestId('gpz-sections-editor-add-lv').click();
  await expect(page.getByTestId('gpz-sections-editor-no-free-bus')).toBeVisible();
  await page.getByTestId('gpz-sections-editor-cancel').click();

  await page.getByTestId(`gpz-section-edit-lv-${druga.section_id}`).click();
  await page.getByTestId('gpz-sections-editor-input-name').fill('Sekcja rezerwowa');
  await page.getByTestId('gpz-sections-editor-submit').click();
  await expect
    .poll(
      async () =>
        (await enm(request, seed.caseId)).substations
          ?.find((s) => s.ref_id === seed.stacjaRef)
          ?.gpz_sections?.find((s) => s.section_id === druga.section_id)?.name,
      { timeout: 20000 },
    )
    .toBe('Sekcja rezerwowa');
  await expect(page.getByTestId(`gpz-section-row-lv-${druga.section_id}`)).toContainText('Sekcja rezerwowa');
  await expect(page.getByTestId('sld-canvas-v3').getByText('Sekcja rezerwowa').first()).toBeAttached({ timeout: 20000 });
});

test('GPZ: „Pokaż dane zwarciowe sekcji" z szyny sekcji otwiera sieć zasilającą tego GPZ', async ({ page, request }) => {
  test.setTimeout(240000);
  const seed = await siecGpz(request);
  await otworzSchemat(page, seed);
  await page.getByRole('button', { name: 'Dopasuj widok' }).click();
  // Szyna sekcji GPZ: obszar trafienia klasy „szyna" z refem rysunkowym `${sectionId}#bus-primary`
  // (`buildScene.ts`). Środek szyny przykrywa obszar zejścia transformatora (klasa „tor"), więc
  // punkt kliku wybiera sonda `elementFromPoint` wzdłuż szyny — tam, gdzie celem jest SZYNA
  // (wzorzec `wyspy-menu-sld.spec.ts`); klik natywny, bez `force`.
  const szyna = page.locator('[data-hit-klasa="szyna"][data-hit-role="obrys"][data-hit-owner-ref$="#bus-primary"]').first();
  await expect(szyna).toBeAttached({ timeout: 30000 });
  const punkt = await szyna.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const wlasnyRef = el.getAttribute('data-hit-owner-ref');
    const yBase = Math.round(rect.y + rect.height / 2);
    for (const frac of [0.5, 0.3, 0.7, 0.15, 0.85, 0.4, 0.6, 0.05, 0.95, 0.1, 0.9]) {
      for (const dy of [0, -1, 1, -2, 2]) {
        const x = Math.round(rect.x + rect.width * frac);
        const top = document.elementFromPoint(x, yBase + dy);
        if (top?.getAttribute('data-hit-klasa') === 'szyna' && top.getAttribute('data-hit-owner-ref') === wlasnyRef) {
          return { x, y: yBase + dy };
        }
      }
    }
    return null;
  });
  expect(punkt, 'brak punktu szyny sekcji, w którym szyna jest celem trafienia').not.toBeNull();
  await page.mouse.click(punkt!.x, punkt!.y, { button: 'right' });
  await page.getByTestId('sld-menu-show-sc-data').click();
  await expect(page.getByTestId('gpz-card-content-hv-side')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('gpz-supply-sk3_hv_mva')).toHaveValue('3000');
});

async function dodajPoleZKarty(page: Page, szynaRef: string, rola: string, nazwa: string): Promise<void> {
  await page.getByTestId('gpz-card-tab-bays').click();
  await page.getByTestId(`tabela-pol-sn-rola-${szynaRef}`).selectOption(rola);
  await page.getByTestId(`tabela-pol-sn-dodaj-${szynaRef}`).click();
  await expect(page.getByTestId('mvd-kreator-pole')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-kreator-pole-rola')).toHaveValue(rola);
  await expect(page.getByTestId('mvd-kreator-pole-brak')).toHaveCount(0);
  await page.getByTestId('mvd-kreator-pole-nazwa').fill(nazwa);
  const katalog = page.getByTestId('mvd-kreator-pole-katalog');
  await expect(katalog.locator('option').nth(1)).toBeAttached({ timeout: 20000 });
  await katalog.selectOption({ index: 1 });
  await page.getByTestId('mvd-kreator-pole-zapisz').click();
  await expect(page.getByTestId('mvd-kreator-pole')).toHaveCount(0, { timeout: 20000 });
}

test('GPZ: karta „Pola SN" — pola BKR i ZU z konfiguratora, bateria na zacisku pola, karta pola', async ({ page, request }) => {
  test.setTimeout(300000);
  const seed = await siecGpz(request);
  await otworzSchemat(page, seed);
  await menuZrodla(page, seed.zrodloRef, 'open-source');

  await dodajPoleZKarty(page, seed.szynaSnRef, 'BKR', 'Pole BK 1');
  await expect
    .poll(async () => (await enm(request, seed.caseId)).bays?.some((b) => b.name === 'Pole BK 1'), { timeout: 20000 })
    .toBe(true);
  const poleBkr = (await enm(request, seed.caseId)).bays!.find((b) => b.name === 'Pole BK 1')!;
  expect(poleBkr.bay_role).toBe('BKR');
  expect(poleBkr.bus_ref).toBe(seed.szynaSnRef);
  expect(poleBkr.substation_ref).toBe(seed.stacjaRef);
  await expect(page.getByTestId('sld-canvas-v3').getByText('Pole BK 1').first()).toBeAttached({ timeout: 20000 });

  // Konfigurator po zapisie kreatora: wiersz pola w karcie „Pola SN".
  await expect(page.getByTestId('gpz-configurator-surface')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('gpz-card-tab-bays').click();
  await expect(page.getByTestId(`tabela-pol-sn-wiersz-${poleBkr.ref_id}`)).toContainText('Pole baterii kondensatorów');

  // Bateria kondensatorów na zacisku pola — istniejący kreator, szyna podstawiona.
  await page.getByTestId(`tabela-pol-sn-dodaj-obiekt-${poleBkr.ref_id}`).click();
  await expect(page.getByTestId('mvd-kreator-kompensator')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-kreator-kompensator-brak-szyny')).toHaveCount(0);
  const typBaterii = page.getByTestId('mvd-kreator-kompensator-katalog');
  await expect(typBaterii.locator('option').nth(1)).toBeAttached({ timeout: 20000 });
  await typBaterii.selectOption({ index: 1 });
  await page.getByTestId('mvd-kreator-kompensator-zapisz').click();
  await expect
    .poll(async () => (await enm(request, seed.caseId)).shunt_capacitors?.some((s) => s.bus_ref === poleBkr.terminal_bus_ref), {
      timeout: 20000,
    })
    .toBe(true);

  await expect(page.getByTestId('gpz-configurator-surface')).toBeVisible({ timeout: 20000 });
  await dodajPoleZKarty(page, seed.szynaSnRef, 'ZU', 'Pole ZU 1');
  await expect
    .poll(async () => (await enm(request, seed.caseId)).bays?.find((b) => b.name === 'Pole ZU 1')?.bay_role, { timeout: 20000 })
    .toBe('ZU');
  const poleZu = (await enm(request, seed.caseId)).bays!.find((b) => b.name === 'Pole ZU 1')!;
  await expect(page.getByTestId('sld-canvas-v3').getByText('Pole ZU 1').first()).toBeAttached({ timeout: 20000 });
  await expect(page.getByTestId('gpz-configurator-surface')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('gpz-card-tab-bays').click();
  await page.getByTestId(`tabela-pol-sn-dodaj-obiekt-${poleZu.ref_id}`).click();
  await expect(page.getByTestId('mvd-kreator-zu')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-kreator-zu-brak-miejsca')).toHaveCount(0);
  await page.getByTestId('mvd-kreator-zu-anuluj').click();
  await expect(page.getByTestId('mvd-kreator-zu')).toHaveCount(0, { timeout: 20000 });

  // „Konfiguruj" → karta pola E-11 tego pola.
  await expect(page.getByTestId('gpz-configurator-surface')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('gpz-card-tab-bays').click();
  await page.getByTestId(`tabela-pol-sn-konfiguruj-${poleBkr.ref_id}`).click();
  await expect(page.getByTestId('bay-configurator-surface')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('bay-configurator-surface').locator('h2')).toHaveText('Pole BK 1');
});
