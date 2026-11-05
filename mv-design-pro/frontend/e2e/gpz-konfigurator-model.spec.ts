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
 *     mówi, że każda szyna SN stacji ma już sekcję, i proponuje nową szynę (`create_bus`);
 *  4. „Pokaż dane zwarciowe sekcji" (menu szyny sekcji) → karta „Sieć zasilająca" tego GPZ;
 *  5. karta „Pola SN": „Dodaj pole" z rolą baterii kondensatorów i zespołu uziemiającego → kreator
 *     pola (`add_sn_bay`) z podstawioną sekcją i rolą → pole w modelu i na schemacie; „Dodaj baterię
 *     kondensatorów" → kreator baterii na zacisku pola → bateria w modelu; „Dodaj zespół
 *     uziemiający" → kreator zespołu przypięty do pola; „Konfiguruj" → karta pola E-11;
 *  6. nowa sekcja z NOWĄ szyną (`add_gpz_section` z `create_bus`) i sprzęgło między sekcją 2
 *     a nową sekcją z „Dodaj pole" (rola „Sprzęgło", sekcja po drugiej stronie, stan normalny
 *     otwarty): gałąź `bus_coupler` w modelu, oznaczenie sprzęgła na schemacie, opis w tabeli;
 *  7. oznaczenie stacji z karty „Identyfikacja" i napięcie Un strony WN z karty „Sieć
 *     zasilająca" (`update_gpz_hv_voltage`): niezgodne z transformatorem 110/SN → odmowa
 *     z wyjaśnieniem, model bez zmian, a karta proponuje typ o tym napięciu (tu: brak w katalogu).
 *  8. wiersz pola w karcie „Pola SN": odejście (odcinek i cel ciągu), aparat i zabezpieczenie
 *     z modelu; brak („Brak sterownika") otwiera kartę pola E-11 z fokusem, a jej akcja —
 *     kreator zabezpieczenia przypięty do pola.
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

test('GPZ: nowa sekcja z nową szyną i sprzęgło do niej z „Dodaj pole" — model, schemat, tabela', async ({ page, request }) => {
  test.setTimeout(300000);
  const seed = await siecGpz(request, 2);
  const druga = (await enm(request, seed.caseId)).substations!.find((s) => s.ref_id === seed.stacjaRef)!.gpz_sections![1];

  await otworzSchemat(page, seed);
  await menuZrodla(page, seed.zrodloRef, 'add-section');
  await page.getByTestId('gpz-sections-editor-add-lv').click();
  await expect(page.getByTestId('gpz-sections-editor-no-free-bus')).toContainText('nowa sekcja dostaje nową szynę');
  await page.getByTestId('gpz-sections-editor-input-name').fill('Sekcja 3');
  await page.getByTestId('gpz-sections-editor-select-bus').selectOption({ label: 'Nowa szyna sekcji' });
  await page.getByTestId('gpz-sections-editor-submit').click();
  await expect
    .poll(async () => (await enm(request, seed.caseId)).substations?.find((s) => s.ref_id === seed.stacjaRef)?.gpz_sections?.length, {
      timeout: 20000,
    })
    .toBe(3);
  const model = await enm(request, seed.caseId);
  const stacja = model.substations!.find((s) => s.ref_id === seed.stacjaRef)!;
  const trzecia = stacja.gpz_sections!.find((s) => s.name === 'Sekcja 3')!;
  expect(stacja.bus_refs).toContain(trzecia.bus_ref);
  expect(model.buses!.find((b) => b.ref_id === trzecia.bus_ref)?.voltage_kv).toBe(15);

  // Sprzęgło z sekcji 2: kreator dostaje sekcję sąsiednią (nową) jako drugą stronę.
  await page.getByTestId('gpz-card-tab-bays').click();
  await page.getByTestId(`tabela-pol-sn-rola-${druga.bus_ref}`).selectOption('COUPLER');
  await page.getByTestId(`tabela-pol-sn-dodaj-${druga.bus_ref}`).click();
  await expect(page.getByTestId('mvd-kreator-pole')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-kreator-pole-sprzeglo-sekcja')).toHaveValue(trzecia.bus_ref);
  await page.getByTestId('mvd-kreator-pole-sprzeglo-stan').selectOption('open');
  await page.getByTestId('mvd-kreator-pole-nazwa').fill('Sprzęgło S2-S3');
  const katalog = page.getByTestId('mvd-kreator-pole-katalog');
  await expect(katalog.locator('option').nth(1)).toBeAttached({ timeout: 20000 });
  await katalog.selectOption({ index: 1 });
  await page.getByTestId('mvd-kreator-pole-zapisz').click();
  await expect(page.getByTestId('mvd-kreator-pole')).toHaveCount(0, { timeout: 20000 });

  const sprzeglo = async () =>
    (await enm(request, seed.caseId)).branches?.find(
      (g) =>
        g.type === 'bus_coupler' &&
        [g.from_bus_ref, g.to_bus_ref].sort().join('|') === [druga.bus_ref, trzecia.bus_ref].sort().join('|'),
    );
  await expect.poll(async () => (await sprzeglo())?.normal_state, { timeout: 20000 }).toBe('open');
  expect((await sprzeglo())?.status).toBe('open');
  const pole = (await enm(request, seed.caseId)).bays!.find((b) => b.name === 'Sprzęgło S2-S3')!;
  expect(pole.bay_role).toBe('COUPLER');
  // Oznaczenie sprzęgła na schemacie między sekcją 2 a 3 (kanwa skraca długie etykiety
  // wielokropkiem w środku — „Sprzęg…S2-S3”; pełna nazwa jest w drzewie układu).
  await expect(page.getByTestId('sld-canvas-v3').getByText(/^Sprzęg.*S2-S3$/).first()).toBeAttached({ timeout: 20000 });

  await expect(page.getByTestId('gpz-configurator-surface')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('gpz-card-tab-bays').click();
  // Jedno zdanie sprzęgła z modelu w wierszu pola i w nagłówku sekcji po drugiej stronie
  // (bez podwójnego „Sprzęgło: Sprzęgło …”).
  await expect(page.getByTestId(`tabela-pol-sn-sprzeglo-${pole.ref_id}`)).toHaveText('Sprzęgło z sekcją 3 · normalnie otwarte');
  await expect(
    page.locator(`[data-testid="tabela-pol-sn-sprzeglo-sekcji-${trzecia.bus_ref}"][data-sprzeglo-ref]`).filter({ hasText: 'z sekcją 2' }),
  ).toHaveText('Sprzęgło z sekcją 2 · normalnie otwarte');
});

test('GPZ: wiersz pola mówi odejście, aparat i zabezpieczenie z modelu; brak otwiera kartę pola z fokusem', async ({ page, request }) => {
  test.setTimeout(240000);
  const seed = await siecGpz(request, 2);
  const model = await enm(request, seed.caseId);
  const pola = model.bays!.filter((b) => b.substation_ref === seed.stacjaRef);
  const pole11 = pola.find((b) => b.name === 'Pole liniowe GPZ 1.1')!;
  const pole21 = pola.find((b) => b.name === 'Pole liniowe GPZ 2.1')!;

  await otworzSchemat(page, seed);
  await menuZrodla(page, seed.zrodloRef, 'open-source');
  await page.getByTestId('gpz-card-tab-bays').click();
  // Pole 1.1: kabel „Odcinek 1” z ziarna kończy się odbiorem (bez stacji); wyłącznik z katalogu.
  await expect(page.getByTestId(`tabela-pol-sn-odejscie-${pole11.ref_id}`)).toHaveText(
    'Odejście: kabel Odcinek 1 → koniec ciągu bez stacji',
  );
  await expect(page.getByTestId(`tabela-pol-sn-aparat-${pole11.ref_id}`)).toContainText('Aparat: ');
  await expect(page.getByTestId(`tabela-pol-sn-aparat-${pole11.ref_id}`)).not.toContainText('nieprzypisany');
  await expect(page.getByTestId(`tabela-pol-sn-aparat-${pole11.ref_id}`)).toHaveAttribute('data-brak', 'false');
  await expect(page.getByTestId(`tabela-pol-sn-wiersz-${pole11.ref_id}`)).not.toContainText('Brak danych');
  // Pole 2.1 bez odcinka; żadne pole nie ma sterownika — braki nazwane z akcją.
  await expect(page.getByTestId(`tabela-pol-sn-napraw-odejscie-${pole21.ref_id}`)).toHaveText(
    'Bez odejścia · wyprowadź odcinek z pola',
  );
  await page.getByTestId(`tabela-pol-sn-napraw-zabezpieczenie-${pole21.ref_id}`).click();
  await expect(page.getByTestId('bay-configurator-surface')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('bay-configurator-surface').locator('h2')).toHaveText('Pole liniowe GPZ 2.1');
  await expect(page.getByTestId(`karta-pola-zabezpieczenie-${pole21.ref_id}`)).toHaveAttribute('data-wyroznione', 'true');
  // Akcja naprawcza karty pola: kreator zabezpieczenia przypięty do pola.
  await page.getByTestId(`karta-pola-napraw-zabezpieczenie-${pole21.ref_id}`).click();
  await expect(page.getByTestId('mvd-kreator-przekaznik-anuluj')).toBeVisible({ timeout: 20000 });
});

test('GPZ: oznaczenie stacji i Un strony WN — zapis, odmowa z wyjaśnieniem, model bez zmian', async ({ page, request }) => {
  test.setTimeout(240000);
  const seed = await siecGpz(request);
  await otworzSchemat(page, seed);
  await menuZrodla(page, seed.zrodloRef, 'open-source');
  const oznaczenie = page.getByTestId('gpz-designation');
  await oznaczenie.fill('GPZ-15/1');
  await oznaczenie.press('Enter');
  await expect
    .poll(async () => (await enm(request, seed.caseId)).substations?.find((s) => s.ref_id === seed.stacjaRef)?.designation, {
      timeout: 20000,
    })
    .toBe('GPZ-15/1');

  await page.getByTestId('gpz-card-tab-hv-side').click();
  const un = page.getByTestId('gpz-supply-un');
  await expect(un).toHaveValue('110');
  await un.fill('115');
  await un.press('Enter');
  await expect(page.getByTestId('gpz-card-error-hv-side')).toContainText('115 kV');
  await expect(page.getByTestId('gpz-card-error-hv-side')).toContainText('napięcie górne');
  await expect(page.getByTestId('gpz-supply-un-typ-brak')).toContainText('115/15 kV');
  await expect(un).toHaveValue('110');
  const model = await enm(request, seed.caseId);
  const szynyWn = model.buses!.filter((b) => (b.voltage_kv ?? 0) > 60);
  expect(szynyWn.length).toBeGreaterThan(0);
  expect(szynyWn.every((b) => b.voltage_kv === 110)).toBe(true);
});
