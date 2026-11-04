/**
 * SEKCJE SZYN GPZ W KARCIE TECHNICZNEJ (K6) — zwarta tabela sekcji z modelu i przejście do
 * JEDYNEGO edytora GPZ: konfiguratora GPZ (E-10) na karcie „Sekcje SN” (decyzja architekta
 * 2026-11-04: karta techniczna nie osadza edytora; konfigurator wpina edytor sekcji).
 *
 * Spec na REALNYM backendzie, ścieżką NATYWNĄ (klik myszy w obiekt GPZ na kanwie i w przycisk
 * inspektora — bez zdarzeń syntetycznych):
 *  1. karta stacji GPZ ma sekcję „Sekcje szyn” zaraz po identyfikacji: tabela SN z jednym
 *     wierszem na sekcję modelu w kolejności `order` (nazwa, szyna, Uₙ — zgodne z ENM z API),
 *     mieszcząca się w szerokości inspektora bez przewijania; strona 110 kV jawnie pusta;
 *     identyfikatory sekcji nie trafiają na ekran;
 *  2. „Konfiguruj GPZ” (jedno kliknięcie) otwiera konfigurator GPZ wprost na karcie „Sekcje SN”;
 *  3. pomiar standardu warsztatu (§10 kontraktu prezentacji): wysokość sekcji i liczba kliknięć
 *     do karty sekcji w konfiguratorze — zapis do pliku wyników biegu i na wyjście.
 *
 * Zrzuty karty GPZ z sekcjami w obu motywach (materiał oceny właściciela, bramka B-02 — spec nie
 * wystawia werdyktu wizualnego) przez `katalogZrzutow`: z `ZRZUTY_DO_DOKUMENTACJI=1` do
 * `docs/uiux/zrzuty/k6-inspektor/`, inaczej do `test-results/zrzuty-dokumentacji/`.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { katalogZrzutow } from './katalogZrzutow';
import { APARAT, BACKEND_BASE, ZRODLO, katalog, operacja, otworzAplikacje, ustawMotyw } from './siecKadrowStacji';

const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'k6-inspektor'));

interface SekcjaEnm {
  readonly section_id: string;
  readonly order: number;
  readonly name?: string | null;
  readonly bus_ref: string;
}
interface EnmGpz {
  readonly substations?: ReadonlyArray<{
    readonly ref_id: string;
    readonly name?: string;
    readonly station_type?: string | null;
    readonly bus_refs?: readonly string[];
    readonly gpz_sections?: readonly SekcjaEnm[] | null;
  }>;
  readonly buses?: ReadonlyArray<{ readonly ref_id: string; readonly name?: string; readonly voltage_kv: number }>;
  readonly bays?: ReadonlyArray<{ readonly ref_id: string; readonly substation_ref?: string | null; readonly gpz_section_id?: string | null }>;
}

async function enmPrzypadku(request: APIRequestContext, caseId: string): Promise<EnmGpz> {
  const odpowiedz = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(odpowiedz.ok()).toBeTruthy();
  return (await odpowiedz.json()) as EnmGpz;
}

function gpzZModelu(enm: EnmGpz) {
  const gpz = (enm.substations ?? []).find((s) => s.station_type === 'gpz');
  expect(gpz, 'GPZ w modelu').toBeTruthy();
  return gpz!;
}

/** GPZ z dwiema sekcjami SN (po jednym polu liniowym na sekcję). */
async function siecGpz(request: APIRequestContext) {
  const sufiks = Date.now().toString(36);
  const projectName = `Sekcje szyn GPZ ${sufiks}`;
  const caseName = `Sekcje GPZ ${sufiks}`;
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: 'Sekcje szyn GPZ w karcie technicznej', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
  });
  expect(projekt.ok()).toBeTruthy();
  const projectId = ((await projekt.json()) as { id: string }).id;
  const przypadek = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: projectId, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(przypadek.ok()).toBeTruthy();
  const caseId = ((await przypadek.json()) as { id: string }).id;
  await operacja(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    catalog_binding: katalog('ZRODLO_SN', ZRODLO),
    sections_count: 2,
    line_fields_per_section: 1,
    gpz_line_field_apparatus: { catalog_binding: katalog('APARAT_SN', APARAT) },
  });
  return { projectId, projectName, caseId, caseName };
}

/**
 * Natywny klik w GPZ na kanwie. Stację GPZ (nie jej szyny, pola czy źródło) niesie na rysunku blok
 * GPZ przeglądu (L0, `sld-v3-l0-gpz-<ref>`); sieć złożona z samego GPZ kadruje się na poziomie
 * szczegółu, więc — jak projektant — oddalamy widok kółkiem myszy, aż blok się pojawi, i klikamy
 * jego środek.
 */
async function kliknijGpz(page: Page, gpzRef: string): Promise<void> {
  const kanwa = page.getByTestId('sld-canvas-v3');
  await expect(kanwa).toBeVisible({ timeout: 30000 });
  const ramkaKanwy = (await kanwa.boundingBox())!;
  const blok = page.locator(`[data-testid="sld-v3-l0-gpz-${gpzRef}"]`);
  await page.mouse.move(ramkaKanwy.x + ramkaKanwy.width / 2, ramkaKanwy.y + ramkaKanwy.height / 2);
  for (let i = 0; i < 40 && (await blok.count()) === 0; i += 1) {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(120);
  }
  await expect(blok).toBeAttached();
  const ramka = await blok.boundingBox();
  expect(ramka, 'blok GPZ ma ramkę na ekranie').not.toBeNull();
  await page.mouse.click(ramka!.x + ramka!.width / 2, ramka!.y + ramka!.height / 2);
}

test('Sekcje szyn GPZ — tabela w karcie technicznej i „Konfiguruj GPZ” na karcie „Sekcje SN” (realny backend)', async ({ page, request }) => {
  test.setTimeout(180000);
  const seed = await siecGpz(request);
  const enm = await enmPrzypadku(request, seed.caseId);
  const gpz = gpzZModelu(enm);
  const sekcje = [...(gpz.gpz_sections ?? [])].sort((a, b) => a.order - b.order || a.section_id.localeCompare(b.section_id));
  expect(sekcje, 'ziarno: dwie sekcje SN').toHaveLength(2);

  await otworzAplikacje(page, seed, { width: 1600, height: 1000 }, 'dark_scada');
  await kliknijGpz(page, gpz.ref_id);
  await expect(page.getByTestId('mvd-inspector').getByTestId('inspektor-karta-sekcje_szyn')).toBeVisible({ timeout: 30000 });
  const inspektor = page.getByTestId('mvd-inspector');
  const karta = inspektor.getByTestId('inspektor-karta');
  await expect(karta).toHaveAttribute('data-rodzaj-karty', 'stacja');
  const sekcjaKarty = karta.getByTestId('inspektor-karta-sekcje_szyn');
  await expect(sekcjaKarty.getByRole('heading', { name: 'Sekcje szyn' })).toBeVisible();

  // 1. Tabela SN: jeden wiersz na sekcję modelu w kolejności `order`, nazwy szyn i Uₙ z ENM.
  const wiersze = sekcjaKarty.getByTestId('inspektor-karta-wiersz-sekcje_sn');
  await expect(wiersze).toHaveCount(sekcje.length);
  for (const [i, s] of sekcje.entries()) {
    const wiersz = wiersze.nth(i);
    if (s.name) await expect(wiersz.locator('td[data-kolumna="nazwa"]')).toHaveText(s.name);
    const szyna = (enm.buses ?? []).find((b) => b.ref_id === s.bus_ref);
    if (szyna?.name) await expect(wiersz.locator('td[data-kolumna="szyna"]')).toHaveText(szyna.name);
    await expect(wiersz.locator('td[data-kolumna="un"]')).toHaveText(`${szyna?.voltage_kv} kV`);
  }
  // Tabela mieści się w szerokości inspektora — kolumna Uₙ widoczna bez przewijania w poziomie.
  const przewijanie = sekcjaKarty.getByTestId('inspektor-karta-tabela-sekcje_sn-przewijanie');
  const szerokosci = await przewijanie.evaluate((el) => ({ widoczna: el.clientWidth, tresc: el.scrollWidth }));
  expect(szerokosci.tresc, 'tabela sekcji bez przewijania w poziomie').toBeLessThanOrEqual(szerokosci.widoczna);
  await expect(sekcjaKarty.getByTestId('inspektor-karta-tabela-sekcje_wn-pusta')).toHaveText('GPZ nie ma sekcji szyn 110 kV w modelu.');
  for (const s of sekcje) await expect(sekcjaKarty).not.toContainText(s.section_id);
  await expect(sekcjaKarty).not.toContainText(gpz.ref_id);

  const pomiar: Record<string, number> = {};
  pomiar.wysokosc_sekcji_px = Math.round((await sekcjaKarty.boundingBox())?.height ?? -1);

  // Zrzuty inspektora z kartą GPZ — oba motywy (przełącznik powłoki).
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  await sekcjaKarty.scrollIntoViewIfNeeded();
  for (const [motyw, plik] of [['dark_scada', 'gpz-sekcje-szyn-ciemny.png'], ['light_technical', 'gpz-sekcje-szyn-jasny.png']] as const) {
    await ustawMotyw(page, motyw);
    await page.waitForTimeout(300);
    await inspektor.screenshot({ path: resolve(KATALOG_ZRZUTOW, plik) });
  }
  await ustawMotyw(page, 'dark_scada');

  // 2. „Konfiguruj GPZ” — jedno kliknięcie do karty „Sekcje SN” konfiguratora GPZ.
  await sekcjaKarty.getByTestId('inspektor-karta-konfiguruj-gpz').click();
  pomiar.klikniecia_do_karty_sekcji_konfiguratora = 1;
  const konfigurator = page.getByTestId('gpz-configurator-surface');
  await expect(konfigurator).toBeVisible({ timeout: 30000 });
  await expect(konfigurator.getByTestId('gpz-card-content-sections')).toBeVisible();
  await expect(konfigurator.getByTestId('gpz-card-content-identification')).toHaveCount(0);

  const plikPomiaru = test.info().outputPath('pomiar-sekcje-szyn.json');
  writeFileSync(plikPomiaru, `${JSON.stringify(pomiar, null, 2)}\n`);
  console.log(`POMIAR_SEKCJE_SZYN ${JSON.stringify(pomiar)}`);
});
