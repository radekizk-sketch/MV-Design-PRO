/**
 * SEKCJE SZYN GPZ W KARCIE TECHNICZNEJ (K6) — zwarta tabela sekcji z modelu i przejście do
 * JEDYNEGO edytora GPZ: konfiguratora GPZ (E-10) na karcie „Sekcje SN” (decyzja architekta
 * 2026-11-04: karta techniczna nie osadza edytora; konfigurator wpina edytor sekcji).
 *
 * Spec na REALNYM backendzie, ścieżką NATYWNĄ (klik myszy w obiekt GPZ na kanwie i w przycisk
 * inspektora — bez zdarzeń syntetycznych):
 *  0. karta GPZ mówi każdą informację raz, bez sekcji i wierszy bez treści (decyzja architekta
 *     2026-11-04): kolejność toru energii — identyfikacja (bez „Podstawy rodzaju”), „Zasilanie”
 *     (sieć zasilająca z modelu: Sₖ″ i R/X w stanie maksymalnym i minimalnym, kreska, gdy modelu
 *     brak wartości), „Sekcje szyn”, „Rozdzielnia SN” (bez listy sekcji, tabela pól Pole · Rola
 *     · Stan bez przewijania w poziomie, bez pustej kolumny „Nr”), „Przyłączenia” (odcinek
 *     wyprowadzony z pola GPZ — z nazwą tego pola, liczba wierszy równa ENM); bez
 *     „Transformator: brak” i bez „Strona nN”; bez ogólnikowego „Źródło danych”; podpis tabeli
 *     tylko w sekcji z dwiema tabelami („Sekcje szyn”: SN i 110 kV);
 *  0a. karta pola GPZ z drzewa projektu: tabela aparatów Aparat · Uᵣ · Iᵣ · Iₖ bez przewijania
 *     w poziomie przy 420 px i przy najwęższym inspektorze; klik w wiersz otwiera kartę aparatu
 *     z typem katalogowym;
 *  1. karta stacji GPZ ma sekcję „Sekcje szyn”: tabela SN z jednym
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
import { APARAT, BACKEND_BASE, ZRODLO, katalog, odcinek, operacja, otworzAplikacje, polaStacjiEnm, ustawMotyw } from './siecKadrowStacji';

const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'k6-inspektor'));

interface SekcjaEnm {
  readonly section_id: string;
  readonly order: number;
  readonly name?: string | null;
  readonly bus_ref: string;
}
interface ZrodloEnm {
  readonly ref_id: string;
  readonly name?: string | null;
  readonly substation_ref?: string | null;
  readonly sk3_mva?: number | null;
  readonly sk3_min_mva?: number | null;
  readonly rx_ratio_min?: number | null;
}
interface EnmGpz {
  readonly sources?: readonly ZrodloEnm[];
  readonly substations?: ReadonlyArray<{
    readonly ref_id: string;
    readonly name?: string;
    readonly station_type?: string | null;
    readonly bus_refs?: readonly string[];
    readonly gpz_sections?: readonly SekcjaEnm[] | null;
  }>;
  readonly buses?: ReadonlyArray<{ readonly ref_id: string; readonly name?: string; readonly voltage_kv: number }>;
  readonly bays?: ReadonlyArray<{
    readonly ref_id: string;
    readonly substation_ref?: string | null;
    readonly gpz_section_id?: string | null;
    readonly bay_number?: string | null;
    readonly name?: string | null;
    readonly terminal_bus_ref?: string | null;
  }>;
  readonly branches?: ReadonlyArray<{ readonly ref_id: string; readonly type?: string; readonly from_bus_ref?: string; readonly to_bus_ref?: string }>;
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

/** GPZ z dwiema sekcjami SN (po jednym polu liniowym na sekcję) i odcinkiem kablowym
 *  wyprowadzonym z pierwszego pola liniowego GPZ (ciąg główny z pola — `field_ref`). */
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
  const enm = await operacja(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    catalog_binding: katalog('ZRODLO_SN', ZRODLO),
    sections_count: 2,
    line_fields_per_section: 1,
    gpz_line_field_apparatus: { catalog_binding: katalog('APARAT_SN', APARAT) },
  });
  const gpz = (enm.substations ?? []).find((s) => s.station_type === 'gpz');
  const poleGpz = polaStacjiEnm(enm, gpz?.ref_id)[0]?.ref_id;
  expect(poleGpz, 'ziarno: pole liniowe GPZ').toBeTruthy();
  await operacja(request, caseId, 'continue_trunk_segment_sn', { field_ref: poleGpz, segment: odcinek(500, 'Odcinek z pola GPZ') });
  return { projectId, projectName, caseId, caseName, poleGpz: poleGpz! };
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

  // 0. Każda informacja raz: kolejność sekcji toru energii, bez sekcji i wierszy bez treści.
  const idSekcji = await karta.locator('section.mvd-kt-sekcja').evaluateAll((sekcje) =>
    sekcje.map((s) => (s.getAttribute('data-testid') ?? '').replace('inspektor-karta-', '')),
  );
  expect(idSekcji).toEqual(['identyfikacja', 'zasilanie', 'sekcje_szyn', 'rozdzielnica_sn', 'przylaczenia']);
  await expect(karta.getByTestId('inspektor-karta-wartosc-podstawa_rodzaju')).toHaveCount(0);
  await expect(karta).not.toContainText('nie dotyczy');
  await expect(karta).not.toContainText('Źródło danych');
  await expect(karta).not.toContainText('nie ma transformatora');
  const zrodlaGpz = (enm.sources ?? []).filter((z) => z.substation_ref === gpz.ref_id);
  expect(zrodlaGpz, 'ziarno: sieć zasilająca GPZ').toHaveLength(1);
  const wierszZasilania = karta.getByTestId('inspektor-karta-wiersz-zasilanie');
  await expect(wierszZasilania).toHaveCount(1);
  // Stan maksymalny i minimalny sieci (wejścia zwarć maks. i min.): liczby bez jednostek
  // (jednostka w nagłówku); wartość, której model nie niesie — kreska.
  await expect(wierszZasilania.locator('td[data-kolumna="sk_max"]')).toHaveText(String(zrodlaGpz[0].sk3_mva));
  for (const [kolumna, wartosc] of [['sk_min', zrodlaGpz[0].sk3_min_mva], ['rx_min', zrodlaGpz[0].rx_ratio_min]] as const) {
    const komorka = wierszZasilania.locator(`td[data-kolumna="${kolumna}"]`);
    if (wartosc == null) await expect(komorka).toHaveText('—');
    else await expect(komorka).toHaveText(/^\d/);
  }
  const naglowkiZasilania = await karta.getByTestId('inspektor-karta-tabela-zasilanie').locator('thead th').allTextContents();
  expect(naglowkiZasilania).toEqual(['Sieć', 'Sₖ″ maks. [MVA]', 'R/X maks.', 'Sₖ″ min. [MVA]', 'R/X min.']);
  // Podpis tabeli tylko w sekcji z dwiema tabelami — inaczej powtarzałby tytuł sekcji.
  for (const klucz of ['zasilanie', 'pola_sn', 'przylaczenia']) {
    await expect(karta.getByTestId(`inspektor-karta-tabela-${klucz}-podpis`), `bez podpisu: ${klucz}`).toHaveCount(0);
  }
  // „Sekcje szyn” ma dwie tabele (SN i 110 kV): tabela SN z podpisem; pusta tabela 110 kV mówi
  // swój brak komunikatem, który ją nazywa („…sekcji szyn 110 kV…”, krok 1 niżej).
  await expect(karta.getByTestId('inspektor-karta-tabela-sekcje_sn-podpis')).toHaveCount(1);
  const rozdzielnia = karta.getByTestId('inspektor-karta-rozdzielnica_sn');
  await expect(rozdzielnia.getByRole('heading', { name: 'Rozdzielnia SN' })).toBeVisible();
  await expect(rozdzielnia.getByTestId('inspektor-karta-wartosc-sekcje_sn')).toHaveCount(0);
  const tabelaPol = rozdzielnia.getByTestId('inspektor-karta-tabela-pola_sn');
  const polaGpz = (enm.bays ?? []).filter((b) => b.substation_ref === gpz.ref_id);
  await expect(tabelaPol.getByTestId('inspektor-karta-wiersz-pola_sn')).toHaveCount(polaGpz.length);
  const naglowkiPol = await tabelaPol.locator('thead th').allTextContents();
  const zNumerem = polaGpz.some((b) => (b.bay_number ?? '').trim() !== '');
  expect(naglowkiPol, 'kolumny tabeli pól; „Nr” tylko, gdy pole ma numer w modelu').toEqual(zNumerem ? ['Pole', 'Nr', 'Rola', 'Stan'] : ['Pole', 'Rola', 'Stan']);
  for (const komorka of await tabelaPol.locator('td[data-kolumna="rola"]').all()) await expect(komorka).toHaveAttribute('data-brak', 'false');

  // Przyłączenia: odcinki z jednym końcem w GPZ — na szynach GPZ albo na zaciskach jego pól SN
  // (reguła szyn stacji z backendu); odcinek wyprowadzony z pola niesie nazwę tego pola.
  const szynyGpz = new Set([...(gpz.bus_refs ?? []), ...polaGpz.map((b) => b.terminal_bus_ref).filter((r): r is string => Boolean(r))]);
  const odcinkiGpz = (enm.branches ?? []).filter(
    (g) => (g.type === 'cable' || g.type === 'line_overhead') && szynyGpz.has(g.from_bus_ref ?? '') !== szynyGpz.has(g.to_bus_ref ?? ''),
  );
  expect(odcinkiGpz.length, 'ziarno: odcinek z pola GPZ').toBeGreaterThanOrEqual(1);
  const przylaczenia = karta.getByTestId('inspektor-karta-tabela-przylaczenia');
  await expect(przylaczenia.getByTestId('inspektor-karta-wiersz-przylaczenia')).toHaveCount(odcinkiGpz.length);
  const poleOdcinka = polaGpz.find((b) => b.ref_id === seed.poleGpz)!;
  const odcinekZPola = odcinkiGpz.find((g) => [g.from_bus_ref, g.to_bus_ref].includes(poleOdcinka.terminal_bus_ref ?? undefined));
  expect(odcinekZPola, 'odcinek na zacisku pola GPZ').toBeTruthy();
  const komorkaPola = przylaczenia.locator(`tr[data-klucz="${odcinekZPola!.ref_id}"] td[data-kolumna="pole"]`);
  await expect(komorkaPola).toHaveAttribute('data-brak', 'false');
  if (poleOdcinka.name) await expect(komorkaPola).toHaveText(poleOdcinka.name);
  const szerokoscPol = await rozdzielnia
    .getByTestId('inspektor-karta-tabela-pola_sn-przewijanie')
    .evaluate((el) => ({ widoczna: el.clientWidth, tresc: el.scrollWidth }));
  expect(szerokoscPol.tresc, 'tabela pól bez przewijania w poziomie').toBeLessThanOrEqual(szerokoscPol.widoczna);

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
  pomiar.wysokosc_karty_px = Math.round((await karta.boundingBox())?.height ?? -1);
  pomiar.liczba_sekcji_karty = idSekcji.length;
  pomiar.kolumny_tabeli_pol = naglowkiPol.length;
  pomiar.wiersze_przylaczen = odcinkiGpz.length;

  // Zrzuty inspektora z kartą GPZ — oba motywy (przełącznik powłoki).
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  await sekcjaKarty.scrollIntoViewIfNeeded();
  for (const [motyw, plik] of [['dark_scada', 'gpz-sekcje-szyn-ciemny.png'], ['light_technical', 'gpz-sekcje-szyn-jasny.png']] as const) {
    await ustawMotyw(page, motyw);
    await page.waitForTimeout(300);
    await inspektor.screenshot({ path: resolve(KATALOG_ZRZUTOW, plik) });
  }
  await ustawMotyw(page, 'dark_scada');

  // 0a. Karta pola GPZ (wskazanie z drzewa projektu) — tabela aparatów w szerokości inspektora.
  const wierszDrzewa = page.getByTestId('project-tree').getByTestId(`model-tree-row-${seed.poleGpz}`);
  await expect(wierszDrzewa).toBeVisible({ timeout: 30000 });
  await wierszDrzewa.click();
  await expect(karta).toHaveAttribute('data-rodzaj-karty', 'pole', { timeout: 30000 });
  const tabelaAparatow = karta.getByTestId('inspektor-karta-tabela-aparaty');
  await expect(tabelaAparatow.getByTestId('inspektor-karta-wiersz-aparaty').first()).toBeVisible();
  expect(await tabelaAparatow.locator('thead th').allTextContents()).toEqual(['Aparat', 'Uᵣ [kV]', 'Iᵣ [A]', 'Iₖ [kA]']);
  await expect(karta.getByTestId('inspektor-karta-tabela-aparaty-podpis')).toHaveCount(0);
  const uchwyt = page.getByTestId('mvd-handle-right');
  await uchwyt.focus();
  const szerokoscInspektora = async () => Math.round((await inspektor.boundingBox())!.width);
  // Szerokość 420 px (strzałka w lewo poszerza do granicy) i najwęższy inspektor (strzałka
  // w prawo do granicy) — w obu tabela aparatów bez przewijania, liczby w jednej linii.
  for (const [klawisz, nazwa] of [['ArrowLeft', 'szeroki'], ['ArrowRight', 'waski']] as const) {
    for (let i = 0; i < 20; i += 1) {
      const przed = await szerokoscInspektora();
      await page.keyboard.press(klawisz);
      if ((await szerokoscInspektora()) === przed) break;
    }
    const szer = await szerokoscInspektora();
    if (nazwa === 'szeroki') expect(szer).toBe(420);
    pomiar[`szerokosc_inspektora_${nazwa}_px`] = szer;
    const obszar = karta.getByTestId('inspektor-karta-tabela-aparaty-przewijanie');
    const wymiary = await obszar.evaluate((el) => ({ widoczna: el.clientWidth, tresc: el.scrollWidth }));
    expect(wymiary.tresc, `tabela aparatów bez przewijania w poziomie (${szer} px)`).toBeLessThanOrEqual(wymiary.widoczna);
    const liczbyWJednejLinii = await tabelaAparatow.locator('td.mvd-kt-liczba').evaluateAll((komorki) =>
      komorki.every((td) => {
        const tekst = td.querySelector('span');
        if (!tekst) return true;
        const linie = tekst.getClientRects().length;
        return linie <= 1;
      }),
    );
    expect(liczbyWJednejLinii, `liczby znamionowe w jednej linii (${szer} px)`).toBe(true);
    pomiar[`wysokosc_tabeli_aparatow_${nazwa}_px`] = Math.round((await tabelaAparatow.boundingBox())?.height ?? -1);
  }
  for (const [motyw, plik] of [['dark_scada', 'gpz-pole-aparaty-ciemny.png'], ['light_technical', 'gpz-pole-aparaty-jasny.png']] as const) {
    await ustawMotyw(page, motyw);
    await page.waitForTimeout(300);
    await inspektor.screenshot({ path: resolve(KATALOG_ZRZUTOW, plik) });
  }
  await ustawMotyw(page, 'dark_scada');
  // Klik w wiersz wyłącznika → karta aparatu z typem katalogowym (szczegóły na żądanie).
  const przyciskAparatu = tabelaAparatow.getByTestId('inspektor-karta-otworz-aparaty').filter({ hasText: 'Wyłącznik' }).first();
  await przyciskAparatu.click();
  pomiar.klikniecia_do_karty_aparatu = 1;
  await expect(karta).toHaveAttribute('data-rodzaj-karty', 'aparat');
  await expect(karta.getByTestId('inspektor-karta-wartosc-typ')).toHaveAttribute('data-brak', 'false');

  // Powrót do karty GPZ tą samą drogą (wiersz GPZ w drzewie projektu).
  await page.getByTestId('project-tree').getByTestId(`model-tree-row-${gpz.ref_id}`).click();
  await expect(karta).toHaveAttribute('data-rodzaj-karty', 'stacja', { timeout: 30000 });

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
