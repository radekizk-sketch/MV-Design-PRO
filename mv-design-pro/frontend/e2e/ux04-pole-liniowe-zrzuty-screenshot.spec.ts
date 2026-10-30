/**
 * KARTA UX-04/POLE-LINIOWE-WZORZEC — pole liniowe SN GPZ wg ENEA Zeszyt 1 (Z.10, Z.11.1) na ŻYWEJ kanwie
 * `SldCanvasV3` i REALNYM backendzie (materiał oceny wizualnej właściciela, bramka B-02; spec
 * NIE wystawia werdyktu wizualnego).
 *
 * Ścieżka użytkownika (bez wywołań API budujących sieć): projekt i przypadek z API (miejsce
 * pracy, nie budowa sieci), potem WYŁĄCZNIE kanwa i okno pola — natywny prawy klik w tło →
 * „Wstaw GPZ" → kreator źródła z wartościami domyślnymi (2 sekcje × 2 pola liniowe, aparat
 * z katalogu); prawy klik w GPZ → ciąg główny (pole sekcji 1 zajęte kablem); prawy klik
 * w wyłącznik pola sekcji 2 → „Otwórz okno pola" → „Zmień wyposażenie" → szablon Z.10
 * z wyłącznikiem stałym i odłącznikiem szynowym (§13); prawy klik w wyłącznik wolnego pola
 * sekcji 1 → okno pola → szablon Z.11.1 (odgałęzienie przekładnika napięciowego od strony linii);
 * położenia aparatów pola z menu aparatu (prawy klik w aparat → „Zamknij / Otwórz / Uziem
 * łącznik"; łącznik bez gałęzi modelu → operacja `set_bay_apparatus_position`, wyłącznik →
 * `open_switch`), prawy klik w wyłącznik pola zajętego → „Otwórz łącznik".
 *
 * Sprawdzenia (model z backendu, rysunek z DOM kanwy):
 *  - każde pole liniowe GPZ niesie wzorzec Z.10 (Q1 trójpołożeniowy, Q0, T1, PF1, GK, T2) bez
 *    gazów fluorowanych (rodzina rozdzielnicy pola nie niesie SF₆), stan obiektu „projektowany"
 *    na polu, na aparatach i w atrybucie symbolu kanwy (`data-stan-obiektu`); pole po zmianie —
 *    wykonanie stałe z odłącznikiem (Q1 odłącznik, Q8 uziemnik — schemat oznaczeń DIN 40719-2,
 *    wartość robocza) albo Z.11.1 z odgałęzieniem (Q5, GK1, T3) na rysunku;
 *  - klik = ZAZNACZENIE (obrys zaznaczenia), bez żadnej operacji łączeniowej na backendzie;
 *  - KAFEL STANU łącznika (rozszerzenie 5, referencja HMI 2026-10-29): wypełniony prostokąt pod
 *    symbolem, czerwony `#C62828` = zamknięty (także zestyk uziemiający łącznika
 *    trójpołożeniowego w położeniu „uziemiony"), zielony `#2E7D32` = otwarty, szary `#6B7280`
 *    ze znakiem „?" = stan nieznany; kolory identyczne w obu motywach; aparat nie-łącznik bez
 *    kafla; oznaczenie aparatu przy symbolu (podpis stanu nie zastępuje koloru);
 *  - menu aparatu działa na TYM aparacie (odłącznik i uziemnik pola nie przełączają wyłącznika);
 *  - WYMIAR KAFLA (wymaganie właściciela 2026-10-29 pkt 1 i 7): w każdym kadrze pola (LOD2)
 *    `getBBox()` kafla każdego łącznika = 48 × 48 w świecie (jedna stała), a `boundingBox()`
 *    na ekranie: w = h i wszystkie kafle kadru równe w granicy 1 px — iloczyn rodzaj
 *    {wyłącznik, łącznik trójpołożeniowy, odłącznik, uziemnik} × stan {zamknięty, otwarty,
 *    uziemiony, nieznany} × motyw {ciemny, jasny}; pomiary do
 *    `test-results/ux04-pole-liniowe-pomiary-kafli.json`;
 *  - STOPIEŃ GLIFU (uwaga właściciela 2026-10-29 pkt 1): wysokość rysunku aparatu
 *    (`[data-qet="glif"]`) wzdłuż osi toru w przedziale `stopienSymboli.kafel` manifestu importu
 *    QET (0,55–0,70 boku kafla) — `getBBox()` w świecie i `boundingBox()` na ekranie, ten sam
 *    iloczyn rodzaj × stan × motyw;
 *  - symbol z rodzaju aparatu w modelu: Q0 z napędem silnikowym M (`naped`), łącznik
 *    trójpołożeniowy Q1 z napędem zasobnikowym ręcznym (Q5 odgałęzienia bez napędu), T3 z trzema
 *    uzwojeniami wtórnymi (`uzwojenia`), GK/GK1 i T2 jako elementy toru;
 *  - PRZEKŁADNIK T1 (decyzja architekta §11.7 pkt 6): zaciski P1 (strona szyny, nad
 *    pierścieniem) i P2 (pod pierścieniem) na lewo od symbolu, tabliczka „przekładnia · klasy"
 *    z rdzeni modelu;
 *  - SZEROKOŚĆ RAMKI BLOKU (pkt 7): szerokość każdego wiersza na ekranie = suma posuwów tabeli
 *    kroju (≤ 1 px), zapas tuszu do prawej krawędzi ramki w przedziale [margines, margines
 *    + 1 j.św.] — iloczyn {Z.10, Z.11.1} × {cyfry, wielkie litery} × motyw;
 *  - ZACZEP PODPISÓW (pkt 8): podpisy aparatów po lewej toru pola — wspólna prawa krawędź tuszu
 *    (≤ 1 px), pomiary do `test-results/ux04-pole-liniowe-pomiary-podpisow.json`;
 *  - BLOK PRZEKAŹNIKA (uwaga sesji głównej 2026-10-29 pkt 5): wiersze kodów i odniesienie
 *    źródła 3U₀ zaczynają się we wspólnej lewej krawędzi, a tusz każdego wiersza (metryki
 *    czcionki przeglądarki) leży wewnątrz ramki bloku — pomiary do
 *    `test-results/ux04-pole-liniowe-pomiary-bloku.json`;
 *  - karta pola: zrzut CAŁEJ oceny pola wg klasy (wszystkie sekcje, także obwody funkcji,
 *    napięcie zwrotne, napęd, sygnały), żaden zrzut nie jest bajtowo identyczny z innym.
 *
 * Zrzuty (kadr pola, przycięty do obszaru aparatów pola):
 * `docs/uiux/zrzuty/ux04-pole-liniowe/<kadr>-<motyw>.png` (do drzewa repo wyłącznie
 * z `ZRZUTY_DO_DOKUMENTACJI=1`, inaczej `test-results/zrzuty-dokumentacji/…`).
 */
import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import type { RdzenPrzekladnikaPradowego } from '../src/types/przekladniki';
import { tekstKlasRdzeni, tekstPrzekladniRdzeni } from '../src/ui/sld/v2/model/tabliczkaPrzekladnika';
import { ZACISKI_PRZEKLADNIKA_PRADOWEGO, ZNACZNIK_ZACISKU_PRZEKLADNIKA } from '../src/ui/sld/v3/compose/zaciskiPrzekladnika';
import { katalogZrzutow } from './katalogZrzutow';
import { przelaczMotyw } from './powloka';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'ux04-pole-liniowe'));
// Szablony z rejestru backendu (`bay_templates.BAY_TEMPLATES_GPZ_LINE`): Z.10 z łącznikiem
// trójpołożeniowym (domyślny pola GPZ) i Z.10 z wyłącznikiem stałym z odłącznikiem (§13, izolacja
// powietrzna).
const SZABLON_Z10 = 'bay_template_gpz_line_enea_z10_trojpolozeniowy';
const SZABLON_Z10_STALY = 'bay_template_gpz_line_enea_z10_staly_z_odlacznikiem';
const SZABLON_Z11_1 = 'bay_template_gpz_line_enea_z11_1_trojpolozeniowy';
// Konwencja kafla stanu — lustro `sld/v3/theme/colorTokens.ts::STATE_COLOR` (jedna tabela
// kanwy, eksportu, legendy i inspektora; testy jednostkowe pilnują lustra w kodzie).
const KAFEL = { zamkniety: '#C62828', otwarty: '#2E7D32', nieustalony: '#6B7280' } as const;
type StanKafla = keyof typeof KAFEL;
// Bok kafla stanu łącznika QET w jednostkach świata (skala LOD2) — lustro
// `sld/v3/cad/qet/qetPoleSn.ts::QET_BOK_KAFLA_STANU` (wymaganie właściciela 2026-10-29: kafel
// to kwadrat 48 × 48 z JEDNEJ stałej; stan zmienia kolor i styk, nigdy wymiar). Lustro w kodzie
// pilnuje `symbols/__tests__/kafelStanu.test.tsx`.
/** Kanwa schematu — aparat pola rysuje się też w karcie pola inspektora (`ui/field/SchematPolaSn.tsx`,
 *  ten sam glif z `data-device-ref`), więc asercje rysunku kanwy są zawężone do kanwy. */
const KANWA = 'svg[data-testid="sld-canvas-v3"]';
const BOK_KAFLA_SWIATA = 48;
// Tolerancja pomiaru na ekranie [px] — wymaganie: w = h i kafle równe w granicy 1 px.
const TOLERANCJA_EKRANU_PX = 1;
const POMIARY_KAFLI_PLIK = resolve(HERE, '..', 'test-results', 'ux04-pole-liniowe-pomiary-kafli.json');
const POMIARY_BLOKU_PLIK = resolve(HERE, '..', 'test-results', 'ux04-pole-liniowe-pomiary-bloku.json');
const POMIARY_SZEROKOSCI_PLIK = resolve(HERE, '..', 'test-results', 'ux04-pole-liniowe-pomiary-szerokosci.json');
// Stopień glifu łącznika (uwaga właściciela 2026-10-29 pkt 1: znak rodzaju aparatu zajmuje
// ok. 55–70 % boku kafla) — przedział z JEDNEGO źródła, manifestu importu symboli QET
// (`stopienSymboli.kafel`), tego samego, którym importer odrzuca symbol poza przedziałem.
const STOPIEN_GLIFU_KAFLA: readonly [number, number] = (
  JSON.parse(readFileSync(resolve(HERE, '..', '..', 'docs', 'sld', 'vendor', 'qet', 'import_manifest.json'), 'utf8')) as {
    stopienSymboli: { kafel: [number, number] };
  }
).stopienSymboli.kafel;

// Tabela posuwów znaków kroju schematu (`core/metrykiKroju.json`, generator
// `scripts/metryki_kroju_sld.py`) — wyrocznia szerokości wierszy bloku przekaźnika czytana
// z pliku (bez importu modułu pomiaru): decyzja architekta §11.7 pkt 7 — szerokość ramki
// z posuwów kroju, więc szerokość tekstu w przeglądarce = suma posuwów z tabeli.
const METRYKI_KROJU = JSON.parse(
  readFileSync(resolve(HERE, '..', 'src', 'ui', 'sld', 'v3', 'core', 'metrykiKroju.json'), 'utf8'),
) as {
  jednostkiEm: number;
  posuwSpozaTabeliEm: number;
  kroje: { sans: { znaki: string; posuwy: Record<'400' | '700', number[]> } };
};
function szerokoscZTabeliEm(tekst: string, fontWeight: number): number {
  const znaki = Array.from(METRYKI_KROJU.kroje.sans.znaki);
  const posuwy = METRYKI_KROJU.kroje.sans.posuwy[fontWeight > 500 ? '700' : '400'];
  let em = 0;
  for (const znak of tekst) {
    const i = znaki.indexOf(znak);
    em += i >= 0 ? posuwy[i] / METRYKI_KROJU.jednostkiEm : METRYKI_KROJU.posuwSpozaTabeliEm;
  }
  return em;
}
/** Klasa treści wiersza: przewaga cyfr albo wielkich liter (iloczyn pkt 7). */
function klasaTresci(tekst: string): 'cyfry' | 'wielkie litery' {
  const cyfry = (tekst.match(/[0-9]/g) ?? []).length;
  const wielkie = (tekst.match(/[A-ZĄĆĘŁŃÓŚŹŻ]/g) ?? []).length;
  return cyfry >= wielkie ? 'cyfry' : 'wielkie litery';
}

type Aparat = {
  device_ref: string;
  kind: string;
  designation?: string | null;
  stan_obiektu?: string | null;
  switch_state?: { actual_state: string } | null;
  naped?: string | null;
  uzwojenia?: unknown[] | null;
  ports?: Array<{ port_id: string; wezel?: string | null }> | null;
  rdzenie?: RdzenPrzekladnikaPradowego[] | null;
};
type Pole = {
  ref_id: string;
  tags?: string[];
  gpz_section_id?: string | null;
  bay_template_ref?: string | null;
  switchgear_family_ref?: string | null;
  stan_obiektu?: string | null;
  equipment_refs?: string[];
  primary_devices?: Aparat[];
};
type Snapshot = {
  substations?: Array<{ ref_id: string; station_type?: string | null }>;
  bays?: Pole[];
  branches?: Array<{ ref_id: string; type?: string; status?: string; from_bus_ref?: string; to_bus_ref?: string }>;
};

async function pobierzEnm(request: APIRequestContext, caseId: string): Promise<Snapshot> {
  const response = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Snapshot;
}

function polaLiniowe(enm: Snapshot): Pole[] {
  return (enm.bays ?? [])
    .filter((b) => (b.tags ?? []).includes('gpz_line_field'))
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id));
}

function sekcje(enm: Snapshot): string[] {
  return [...new Set(polaLiniowe(enm).map((p) => p.gpz_section_id ?? ''))].sort();
}

function aparat(pole: Pole, oznaczenie: string): Aparat {
  const wynik = (pole.primary_devices ?? []).find((d) => d.designation === oznaczenie);
  expect(wynik, `${pole.ref_id}: aparat ${oznaczenie}`).toBeTruthy();
  return wynik!;
}

/** Projekt i przypadek z API (miejsce pracy) — nazwa projektu nazywa WYKONANIE pola, które
 *  pokazują zrzuty tego projektu (nagłówek aplikacji jest na każdym zrzucie). */
async function otworzAplikacje(page: Page, request: APIRequestContext, wykonanie: string): Promise<{ caseId: string }> {
  const suffix = Date.now().toString(36);
  const projectName = `Pole liniowe ${wykonanie} ${suffix}`;
  const caseName = `Przypadek pola ${suffix}`;
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: `Pole liniowe SN GPZ wg ENEA ${wykonanie}`, mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
  });
  expect(projekt.ok()).toBeTruthy();
  const projectId = ((await projekt.json()) as { id: string }).id;
  const przypadek = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: projectId, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(przypadek.ok()).toBeTruthy();
  const caseId = ((await przypadek.json()) as { id: string }).id;
  await page.addInitScript((seed) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: seed.projectId,
          activeProjectName: seed.projectName,
          activeCaseId: seed.caseId,
          activeCaseName: seed.caseName,
          activeCaseKind: 'ShortCircuitCase',
          activeCaseResultStatus: 'NONE',
          activeSnapshotId: null,
          activeMode: 'MODEL_EDIT',
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, { projectId, projectName, caseId, caseName });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  return { caseId };
}

async function wrocNaSchemat(page: Page): Promise<void> {
  const okruszek = page.getByRole('button', { name: 'Schemat', exact: true }).first();
  if (await okruszek.isVisible({ timeout: 3000 }).catch(() => false)) await okruszek.click();
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => page.locator('[data-hit-klasa]').count(), { timeout: 60000 }).toBeGreaterThan(0);
  await widokCalejSieci(page);
}

/** „Dopasuj do… → Sieć" — kadr całej sieci BEZ kurtyny. Sam „Dopasuj widok" kadruje
 *  ZAKRES PRACY (zaznaczenie albo sieć, kontrakt K2): po kreatorze magistrali zaznaczony
 *  zostaje nowy odcinek, więc „Dopasuj widok" zakładał kurtynę na cały GPZ (pomiar
 *  2026-10-29: zrzuty GPZ przygaszone do krycia kurtyny, ścieżka „Sieć › Magistrala 01"). */
async function widokCalejSieci(page: Page): Promise<void> {
  await page.getByTestId('sld-v3-dopasuj-do-toggle').click();
  await page.getByTestId('sld-v3-dopasuj-do-siec').click();
  await expect(page.locator('svg[data-testid="sld-canvas-v3"] [data-kadr="poza"]')).toHaveCount(0, { timeout: 15000 });
}

/** Punkt na geometrii uchwytu trafienia (środek prostokąta albo połowa długości kreski). */
async function punktUchwytu(uchwyt: Locator): Promise<{ x: number; y: number }> {
  await expect.poll(async () => ((await uchwyt.boundingBox().catch(() => null))?.width ?? 0), { timeout: 60000 }).toBeGreaterThan(0);
  return uchwyt.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
}

/** Punkt NA trasie uchwytu trafienia odcinka, w którym uchwyt jest na wierzchu. Trasa kabla
 *  z pola GPZ jest łamana — środek jej prostokąta leży poza kreską (pomiar 2026-10-29: obrys
 *  813 × 44 px, klik w środek trafiał w tło kanwy). */
async function punktNaTrasie(uchwyt: Locator): Promise<{ x: number; y: number }> {
  await expect.poll(async () => ((await uchwyt.boundingBox().catch(() => null))?.width ?? 0), { timeout: 60000 }).toBeGreaterThan(0);
  const punkt = await uchwyt.evaluate((el) => {
    const sciezka = el as unknown as SVGGeometryElement;
    const dl = sciezka.getTotalLength();
    const m = sciezka.getScreenCTM()!;
    for (const u of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
      const p = sciezka.getPointAtLength(dl * u);
      const x = p.x * m.a + p.y * m.c + m.e;
      const y = p.x * m.b + p.y * m.d + m.f;
      if (document.elementFromPoint(x, y) === el) return { x, y };
    }
    return null;
  });
  expect(punkt, 'punkt trasy odcinka dostępny dla kliku').not.toBeNull();
  return punkt!;
}

/** Przybliżenie kółkiem, aż uchwyt trafienia aparatu pola ma ≥ 16 px i leży w kadrze kanwy
 *  (LOD z kamery). Kursor kółka celuje w aparat (przycięty do kanwy) — punkt pod kursorem
 *  zostaje w miejscu, więc aparat wchodzi do kadru, zamiast z niego uciekać. */
async function przyblizDoAparatu(page: Page, deviceRef: string): Promise<Locator> {
  const uchwyt = page.locator(`[data-hit-klasa="aparat"][data-hit-device-ref="${deviceRef}"]`).first();
  const kanwa = page.locator('svg[data-testid="sld-canvas-v3"]');
  for (let i = 0; i < 40; i += 1) {
    const k = (await kanwa.boundingBox())!;
    const box = (await uchwyt.count()) > 0 ? await uchwyt.boundingBox().catch(() => null) : null;
    const wKadrze = box != null && box.x >= k.x && box.y >= k.y && box.x + box.width <= k.x + k.width && box.y + box.height <= k.y + k.height;
    if (box && wKadrze && Math.min(box.width, box.height) >= 16) break;
    const cx = box ? box.x + box.width / 2 : k.x + k.width / 2;
    const cy = box ? box.y + box.height / 2 : k.y + k.height / 2;
    await page.mouse.move(Math.min(Math.max(cx, k.x + 40), k.x + k.width - 40), Math.min(Math.max(cy, k.y + 40), k.y + k.height - 40));
    await page.mouse.wheel(0, box && Math.min(box.width, box.height) >= 16 ? 0 : -240);
    if (box && !wKadrze) {
      // Aparat dość duży, ale poza kadrem — przesunięcie widoku przeciągnięciem tła w jego stronę.
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2, { steps: 4 });
      await page.mouse.up({ button: 'middle' });
    }
    await page.waitForTimeout(150);
  }
  await expect(uchwyt).toHaveCount(1, { timeout: 15000 });
  await czekajNaStabilnaGeometrie(uchwyt);
  return uchwyt;
}

/** Geometria stabilna = dwa kolejne odczyty prostokąta identyczne (kamera po animacji). */
async function czekajNaStabilnaGeometrie(cel: Locator): Promise<void> {
  let poprzedni = '';
  for (let i = 0; i < 40; i += 1) {
    const r = await cel.boundingBox();
    const biezacy = r ? `${Math.round(r.x)}:${Math.round(r.y)}:${Math.round(r.width)}:${Math.round(r.height)}` : '';
    if (biezacy !== '' && biezacy === poprzedni) return;
    poprzedni = biezacy;
    await cel.page().waitForTimeout(250);
  }
}

/** Punkt ekranu, w którym NAJWYŻSZYM elementem jest uchwyt tego aparatu (sonda
 *  `elementFromPoint` — klik nie trafi w nachodzący odcinek ani pasek narzędzi). */
async function punktAparatu(page: Page, deviceRef: string): Promise<{ x: number; y: number }> {
  const uchwyt = await przyblizDoAparatu(page, deviceRef);
  const punkt = await uchwyt.evaluate((el, ref) => {
    const r = el.getBoundingClientRect();
    for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
      for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const x = Math.round(r.x + r.width * fx);
        const y = Math.round(r.y + r.height * fy);
        const top = document.elementFromPoint(x, y);
        if (top?.getAttribute('data-hit-klasa') === 'aparat' && top.getAttribute('data-hit-device-ref') === ref) return { x, y };
      }
    }
    return null;
  }, deviceRef);
  expect(punkt, `brak punktu trafienia aparatu ${deviceRef}`).not.toBeNull();
  return punkt!;
}

/** Natywny klik w punkt policzony sondą, z WERYFIKACJĄ skutku — jedna reguła dla każdego
 *  kliku w punkt w tym specu (inwentarz: prawy klik w łącznik, prawy klik w obrys GPZ, lewy
 *  klik w wyłącznik w kroku 4 i w każdym zrzucie pola). Klik bez skutku = test czerwony
 *  z opisem, co leży pod punktem i gdzie jest cel — BEZ ponowienia.
 *
 *  Pomiar 2026-10-29 (dziennik akcji kamery w biegu e2e): kliki „w tło" brały się z defektu
 *  produktu — po prawym kliku i wyborze pozycji z menu kontekstowego wskaźnik zostawał
 *  w mapie przeciągania kanwy (`pointerup` trafiał w menu), więc ruch myszy do następnego
 *  punktu PRZESUWAŁ widok (`pan`) i cel uciekał spod kursora. Naprawa u źródła:
 *  `SldCanvasV3.tsx` `zwolnijWskaznik`, test `przeciaganieKanwy.test.tsx`. Ponowienie kliku
 *  maskowałoby regresję tej naprawy, dlatego go nie ma. */
async function klikZWeryfikacja(
  page: Page,
  opis: string,
  cel: Locator,
  punktCelu: () => Promise<{ x: number; y: number }>,
  przycisk: 'left' | 'right',
  skutek: () => Promise<boolean>,
): Promise<void> {
  const punkt = await punktCelu();
  await page.mouse.click(punkt.x, punkt.y, { button: przycisk });
  const trafiony = await expect
    .poll(skutek, { timeout: 5000 })
    .toBe(true)
    .then(() => true)
    .catch(() => false);
  if (trafiony) return;
  const podPunktem = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? `${el.tagName}[${el.getAttribute('data-hit-klasa') ?? el.closest('[data-testid]')?.getAttribute('data-testid') ?? ''}]` : 'brak';
  }, punkt);
  const pudlo = await cel.boundingBox().catch(() => null);
  throw new Error(
    `${opis}: natywny klik bez skutku; punkt ${punkt.x},${punkt.y}; teraz pod nim ${podPunktem}; ` +
      `cel ${pudlo ? `${Math.round(pudlo.x)},${Math.round(pudlo.y)} ${Math.round(pudlo.width)}×${Math.round(pudlo.height)}` : 'nieobecny'}`,
  );
}

/** Prawy klik w łącznik pola i jego menu (z pozycjami położenia łącznika). */
async function prawyKlikAparatu(page: Page, deviceRef: string): Promise<Locator> {
  const menu = page.getByRole('menu');
  const pozycjeLacznika = menu.locator(
    '[data-testid="sld-menu-open-switch"], [data-testid="sld-menu-close-switch"], [data-testid="sld-menu-earth-switch"]',
  );
  await klikZWeryfikacja(
    page,
    `prawy klik ${deviceRef}`,
    page.locator(`[data-hit-klasa="aparat"][data-hit-device-ref="${deviceRef}"]`).first(),
    () => punktAparatu(page, deviceRef),
    'right',
    async () => (await pozycjeLacznika.count()) > 0,
  );
  return menu;
}

/** Lewy klik w aparat = zaznaczenie (obrys zaznaczenia na kanwie). */
async function klikAparatu(page: Page, deviceRef: string): Promise<void> {
  const obrys = page.locator('[data-testid="sld-v3-zaznaczenie"] rect').first();
  await klikZWeryfikacja(
    page,
    `klik ${deviceRef}`,
    page.locator(`[data-hit-klasa="aparat"][data-hit-device-ref="${deviceRef}"]`).first(),
    () => punktAparatu(page, deviceRef),
    'left',
    async () => obrys.isVisible(),
  );
}

async function ustawMotyw(page: Page, docelowy: 'dark_scada' | 'light_technical'): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    if ((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === docelowy) return;
    await przelaczMotyw(page);
    await page.waitForTimeout(300);
  }
  await expect.poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(docelowy);
}

/** Kafel stanu symbolu aparatu na kanwie: stan i wypełnienie albo `null` (brak kafla). */
async function kafel(page: Page, deviceRef: string): Promise<{ stan: string; fill: string; znak: string | null } | null> {
  const g = page.locator(`${KANWA} g[data-device-ref="${deviceRef}"] [data-kafel-stanu]`);
  if ((await g.count()) === 0) return null;
  const tlo = g.first().locator('[data-kafel="tlo"]');
  const znak = g.first().locator('[data-kafel="znak"]');
  return {
    stan: (await g.first().getAttribute('data-kafel-stanu')) ?? '',
    fill: ((await tlo.getAttribute('fill')) ?? '').toUpperCase(),
    znak: (await znak.count()) > 0 ? await znak.textContent() : null,
  };
}

/** Pomiar kafla stanu jednego łącznika na żywej kanwie. */
type PomiarKafla = {
  kadr: string;
  motyw: string;
  lod: string | null;
  deviceRef: string;
  oznaczenie: string;
  symbol: string;
  stan: string;
  swiatW: number;
  swiatH: number;
  ekranW: number;
  ekranH: number;
  /** Wysokość rysunku aparatu (`[data-qet="glif"]`: styki i nóż, bez przewodów i osprzętu)
   *  wzdłuż osi toru — `getBBox()` w układzie symbolu i `boundingBox()` na ekranie. */
  glifSwiatH: number;
  glifEkranH: number;
};
const POMIARY_KAFLI: PomiarKafla[] = [];

/** Pomiar kafli WSZYSTKICH łączników pola w bieżącym kadrze: `getBBox()` prostokąta kafla
 *  (jednostki świata SVG, przed transformacją kamery) i `boundingBox()` Playwrighta (piksele
 *  ekranu po transformacji kamery). Asercje (wymaganie właściciela 2026-10-29 pkt 1 i 7): każdy
 *  kafel łącznika pola GPZ jest kafelkiem symbolu QET o boku `BOK_KAFLA_SWIATA` w świecie;
 *  na ekranie w = h i wszystkie kafle kadru równe w granicy 1 px — niezależnie od rodzaju
 *  aparatu, stanu i motywu; rysunek aparatu w kaflu ma stopień `STOPIEN_GLIFU_KAFLA`. Iniekcje:
 *  kafel wyłącznika innego rozmiaru czerwieni warunki wymiaru, glif pomniejszony do połowy —
 *  warunek stopnia. */
async function zmierzKafle(page: Page, kadr: string, pole: Pole): Promise<PomiarKafla[]> {
  const svg = page.locator('svg[data-testid="sld-canvas-v3"]');
  const motyw = (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) ?? '';
  const lod = await svg.getAttribute('data-scene-lod');
  const pomiary: PomiarKafla[] = [];
  for (const a of pole.primary_devices ?? []) {
    const grupa = svg.locator(`g[data-device-ref="${a.device_ref}"] [data-kafel-stanu]`);
    if ((await grupa.count()) === 0) continue;
    await expect(grupa, `${kadr}: jeden kafel aparatu ${a.designation}`).toHaveCount(1);
    const tlo = grupa.locator('[data-kafel="tlo"]');
    const swiat = await tlo.evaluate((el) => {
      const b = (el as SVGGraphicsElement).getBBox();
      return { w: b.width, h: b.height };
    });
    const ekran = (await tlo.boundingBox())!;
    const glif = svg.locator(`g[data-device-ref="${a.device_ref}"] [data-kafel-stanu] [data-qet="glif"]`);
    await expect(glif, `${kadr}: jeden rysunek aparatu ${a.designation}`).toHaveCount(1);
    const glifSwiatH = await glif.evaluate((el) => (el as SVGGraphicsElement).getBBox().height);
    const glifEkranH = (await glif.boundingBox())!.height;
    pomiary.push({
      kadr,
      motyw,
      lod,
      deviceRef: a.device_ref,
      oznaczenie: a.designation ?? '',
      symbol: (await grupa.getAttribute('data-kafel-symbol')) ?? '',
      stan: (await grupa.getAttribute('data-kafel-stanu')) ?? '',
      swiatW: swiat.w,
      swiatH: swiat.h,
      ekranW: ekran.width,
      ekranH: ekran.height,
      glifSwiatH,
      glifEkranH,
    });
  }
  expect(pomiary.length, `${kadr}: kafle łączników pola zmierzone`).toBeGreaterThan(0);
  const [wzor] = pomiary;
  for (const p of pomiary) {
    const opis = `${kadr} · ${p.motyw} · ${p.oznaczenie} (${p.symbol}, ${p.stan})`;
    expect(p.symbol.startsWith('qet'), `${opis}: łącznik pola GPZ rysowany symbolem QET`).toBe(true);
    expect(Math.abs(p.swiatW - BOK_KAFLA_SWIATA), `${opis}: szerokość kafla w świecie ${p.swiatW}`).toBeLessThanOrEqual(0.001);
    expect(Math.abs(p.swiatH - BOK_KAFLA_SWIATA), `${opis}: wysokość kafla w świecie ${p.swiatH}`).toBeLessThanOrEqual(0.001);
    expect(Math.abs(p.ekranW - p.ekranH), `${opis}: kafel kwadratowy na ekranie ${p.ekranW} × ${p.ekranH}`).toBeLessThanOrEqual(TOLERANCJA_EKRANU_PX);
    expect(Math.abs(p.ekranW - wzor.ekranW), `${opis}: szerokość jak kafel ${wzor.oznaczenie}`).toBeLessThanOrEqual(TOLERANCJA_EKRANU_PX);
    expect(Math.abs(p.ekranH - wzor.ekranH), `${opis}: wysokość jak kafel ${wzor.oznaczenie}`).toBeLessThanOrEqual(TOLERANCJA_EKRANU_PX);
    // Stopień glifu: dolny próg czytelności znaku rodzaju i górny — znak nie wypełnia kafla
    // (kolor stanu widoczny wokół). Świat (`getBBox`) i ekran (`boundingBox`, ten sam stosunek
    // po transformacji kamery, tolerancja 1 px na obu wymiarach).
    const stopien = p.glifSwiatH / p.swiatH;
    expect(stopien, `${opis}: stopień glifu ${stopien.toFixed(3)} boku kafla`).toBeGreaterThanOrEqual(STOPIEN_GLIFU_KAFLA[0]);
    expect(stopien, `${opis}: stopień glifu ${stopien.toFixed(3)} boku kafla`).toBeLessThanOrEqual(STOPIEN_GLIFU_KAFLA[1]);
    expect(p.glifEkranH, `${opis}: glif na ekranie ${p.glifEkranH} px`).toBeGreaterThanOrEqual(STOPIEN_GLIFU_KAFLA[0] * p.ekranH - TOLERANCJA_EKRANU_PX);
  }
  POMIARY_KAFLI.push(...pomiary);
  mkdirSync(dirname(POMIARY_KAFLI_PLIK), { recursive: true });
  writeFileSync(POMIARY_KAFLI_PLIK, `${JSON.stringify(POMIARY_KAFLI, null, 2)}\n`);
  return pomiary;
}

type PomiarBloku = {
  kadr: string;
  motyw: string;
  pole: string;
  /** Lewe krawędzie tuszu wierszy bloku [px ekranu] i ich rozrzut. */
  lewe: number[];
  rozrzutLewych: number;
  /** Ramka bloku [px ekranu] i zapas tuszu wierszy do jej krawędzi: lewy (od okręgu do
   *  wiersza — mierzony od ramki), prawy (najszerszy wiersz → prawa krawędź ramki). */
  ramka: { x: number; y: number; width: number; height: number };
  zapasPrawy: number;
  zapasDolny: number;
  /** Margines ramki [px ekranu] — odstęp lewej krawędzi ramki od okręgu przekaźnika (ramka =
   *  suma okręgu i wierszy poszerzona o jeden margines), i skala kamery [px ekranu / j.św.]. */
  margines: number;
  skala: number;
  wiersze: string[];
  /** Klasa treści każdego wiersza (`klasaTresci`) — pokrycie iloczynu pkt 7. */
  klasy: Array<'cyfry' | 'wielkie litery'>;
};
const POMIARY_BLOKU: PomiarBloku[] = [];

/** Pomiar bloku przekaźnika każdego pola w kadrze — metryki czcionki PRZEGLĄDARKI wobec
 *  prostokątów planu (szerokość wiersza = suma posuwów kroju z tabeli, `core/text.ts::
 *  measureTextWidth`; ramka bloku i tło pola liczone na kanwie z prostokątów NARYSOWANYCH
 *  wierszy planu, `canvas/obrysyWgPlanu.ts` — w kadrze pola podłoga opisów celu powiększa
 *  pismo ponad slot sceny). Asercje: wiersze kodów i odniesienia źródła 3U₀ zaczynają się
 *  w jednej lewej krawędzi (rozrzut ≤ 1 px), tusz każdego wiersza leży wewnątrz ramki bloku,
 *  szerokość tuszu = tabela posuwów (± 1 px) i zapas do prawej krawędzi ramki mieści się
 *  w [margines, margines + 1 j.św.]. Iniekcja: render z tekstem wyśrodkowanym w prostokącie
 *  (stan przed naprawą) — rozrzut lewych krawędzi; ramka sceny zamiast ramki planu — tusz
 *  poza ramką (pomiar 2026-10-30: 8,1 px w kadrze pola Z.11.1). */
async function zmierzBlokPrzekaznika(page: Page, kadr: string): Promise<PomiarBloku[]> {
  const motyw = (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) ?? '';
  const bloki = await page.evaluate((kanwa) => {
    const svg = document.querySelector(kanwa)!;
    const prost = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height });
    return [...svg.querySelectorAll('[data-przekaznik="ramka-bloku"]')].map((rama) => {
      const wlasciciel = rama.closest('[data-owner-ref]')?.getAttribute('data-owner-ref') ?? '';
      const okrag = rama.parentElement?.querySelector('circle');
      return {
        pole: wlasciciel,
        ramka: prost(rama.getBoundingClientRect()),
        ramkaSwiat: Number(rama.getAttribute('width')),
        okragLewa: okrag ? okrag.getBoundingClientRect().x : null,
        wiersze: [...svg.querySelectorAll('g[data-owner-ref] > text')]
          .filter((t) => {
            const ref = t.parentElement!.getAttribute('data-owner-ref') ?? '';
            return ref.startsWith(`${wlasciciel}#`) && /#(protection-codes-full|zrodlo-u0)(-\d+)?$/.test(ref);
          })
          .map((t) => ({
            tekst: t.textContent ?? '',
            r: prost(t.getBoundingClientRect()),
            fontSize: Number(t.getAttribute('font-size')),
            fontWeight: Number(t.getAttribute('font-weight')),
          })),
      };
    });
  }, KANWA);
  const pomiary: PomiarBloku[] = [];
  for (const b of bloki.filter((x) => x.wiersze.length > 0)) {
    const lewe = b.wiersze.map((w) => w.r.x);
    const rozrzutLewych = Math.max(...lewe) - Math.min(...lewe);
    const zapasPrawy = b.ramka.x + b.ramka.width - Math.max(...b.wiersze.map((w) => w.r.x + w.r.width));
    const zapasDolny = b.ramka.y + b.ramka.height - Math.max(...b.wiersze.map((w) => w.r.y + w.r.height));
    const opis = `${kadr} · ${motyw} · blok ${b.pole}`;
    expect(rozrzutLewych, `${opis}: wiersze od jednej lewej krawędzi (${lewe.map((x) => x.toFixed(1)).join(', ')})`).toBeLessThanOrEqual(TOLERANCJA_EKRANU_PX);
    for (const w of b.wiersze) {
      expect(w.r.x, `${opis}: „${w.tekst}" wewnątrz ramki (lewa)`).toBeGreaterThanOrEqual(b.ramka.x);
      expect(w.r.x + w.r.width, `${opis}: „${w.tekst}" wewnątrz ramki (prawa)`).toBeLessThanOrEqual(b.ramka.x + b.ramka.width);
      expect(w.r.y, `${opis}: „${w.tekst}" wewnątrz ramki (góra)`).toBeGreaterThanOrEqual(b.ramka.y);
      expect(w.r.y + w.r.height, `${opis}: „${w.tekst}" wewnątrz ramki (dół)`).toBeLessThanOrEqual(b.ramka.y + b.ramka.height);
    }
    // Decyzja architekta §11.7 pkt 7: szerokość wiersza na ekranie = suma posuwów kroju z tabeli
    // (`metrykiKroju.json`) × rozmiar pisma × skala kamery — w granicy 1 px, na każdym wierszu
    // (cyfry i wielkie litery), więc ramka liczona z tabeli ma zapas do tuszu w STAŁYM
    // przedziale: [margines, margines + 1 j.św.] (prostokąt wiersza = posuw zaokrąglony w górę do
    // pełnej jednostki świata, ramka = najszerszy prostokąt + margines). Dawny szacunek 0,62 em:
    // zapas 80,4–93,5 px w polach Z.10 i 18,4 px w Z.11.1 (pomiar 2026-10-29).
    const skala = b.ramka.width / b.ramkaSwiat;
    expect(b.okragLewa, `${opis}: okrąg przekaźnika w bloku`).not.toBeNull();
    const margines = b.okragLewa! - b.ramka.x;
    for (const w of b.wiersze) {
      const zTabeli = szerokoscZTabeliEm(w.tekst, w.fontWeight) * w.fontSize * skala;
      expect(Math.abs(w.r.width - zTabeli), `${opis}: „${w.tekst}" szerokość ${w.r.width.toFixed(2)} px = tabela posuwów ${zTabeli.toFixed(2)} px`).toBeLessThanOrEqual(TOLERANCJA_EKRANU_PX);
      zapiszPomiarSzerokosci({ kadr, motyw, rodzaj: 'wiersz bloku', tekst: w.tekst, klasa: klasaTresci(w.tekst), fontSize: w.fontSize, szerokoscPx: w.r.width, zTabeliPx: zTabeli });
    }
    expect(zapasPrawy, `${opis}: zapas tuszu do ramki ≥ margines (${margines.toFixed(2)} px)`).toBeGreaterThanOrEqual(margines - TOLERANCJA_EKRANU_PX);
    expect(zapasPrawy, `${opis}: zapas tuszu do ramki ≤ margines + 1 j.św. (${(margines + skala).toFixed(2)} px)`).toBeLessThanOrEqual(margines + skala + TOLERANCJA_EKRANU_PX);
    pomiary.push({
      kadr,
      motyw,
      pole: b.pole,
      lewe,
      rozrzutLewych,
      ramka: b.ramka,
      zapasPrawy,
      zapasDolny,
      margines,
      skala,
      wiersze: b.wiersze.map((w) => w.tekst),
      klasy: b.wiersze.map((w) => klasaTresci(w.tekst)),
    });
  }
  POMIARY_BLOKU.push(...pomiary);
  mkdirSync(dirname(POMIARY_BLOKU_PLIK), { recursive: true });
  writeFileSync(POMIARY_BLOKU_PLIK, `${JSON.stringify(POMIARY_BLOKU, null, 2)}\n`);
  return pomiary;
}

/** Zaciski strony pierwotnej i tabliczka przekładnika prądowego T1 na kanwie (decyzja architekta
 *  §11.7 pkt 6; PN-EN 61869-2): P1 po stronie szyny (nad pierścieniem), P2 po stronie odpływu
 *  (pod pierścieniem), oba na lewo od symbolu; tabliczka = przekładnia i klasy rdzeni z rekordu
 *  modelu (`BayPrimaryDevice.rdzenie`) w zapisie rysunku ENEA („200-400/5 A · 5P20") — wyrocznia
 *  z czystego formatowania tabliczki (`tabliczkaPrzekladnika.ts`), tekst z DOM. */
async function sprawdzPrzekladnikPradowy(page: Page, kadr: string, pole: Pole): Promise<void> {
  const t1 = aparat(pole, 'T1');
  expect(t1.rdzenie?.length ?? 0, `${kadr}: T1 z rdzeniami w modelu`).toBeGreaterThan(0);
  const ramkaT1 = (await page.locator(`${KANWA} g[data-device-ref="${t1.device_ref}"]`).first().boundingBox())!;
  const srodekT1 = ramkaT1.y + ramkaT1.height / 2;
  const [odSzyny, odOdplywu] = ZACISKI_PRZEKLADNIKA_PRADOWEGO.pierwotne;
  const zaciski: Record<string, { x: number; y: number; width: number; height: number }> = {};
  for (const oznaczenie of [odSzyny, odOdplywu]) {
    const tekst = page.locator(`${KANWA} g[data-owner-ref="${pole.ref_id}${ZNACZNIK_ZACISKU_PRZEKLADNIKA}${t1.device_ref}-${oznaczenie}"] > text`);
    await expect(tekst, `${kadr}: zacisk ${oznaczenie} przekładnika T1`).toHaveCount(1);
    await expect(tekst).toHaveText(oznaczenie);
    zaciski[oznaczenie] = (await tekst.boundingBox())!;
    // Na lewo od symbolu (tusz nie wchodzi na kafel aparatu).
    expect(zaciski[oznaczenie].x + zaciski[oznaczenie].width, `${kadr}: ${oznaczenie} na lewo od T1`).toBeLessThanOrEqual(ramkaT1.x + TOLERANCJA_EKRANU_PX);
  }
  const srodek = (r: { y: number; height: number }) => r.y + r.height / 2;
  expect(srodek(zaciski[odSzyny]), `${kadr}: ${odSzyny} nad pierścieniem T1 (strona szyny)`).toBeLessThan(srodekT1);
  expect(srodek(zaciski[odOdplywu]), `${kadr}: ${odOdplywu} pod pierścieniem T1 (strona odpływu)`).toBeGreaterThan(srodekT1);
  const tabliczka = page.locator(`${KANWA} g[data-owner-ref="${pole.ref_id}#ct-rating-${t1.device_ref}"] > text`);
  await expect(tabliczka, `${kadr}: tabliczka T1`).toHaveCount(1);
  await expect(tabliczka).toHaveText(`${tekstPrzekladniRdzeni(t1.rdzenie)} · ${tekstKlasRdzeni(t1.rdzenie)}`);
  // Decyzja architekta §11.7 pkt 7: tabliczka (przewaga cyfr) — szerokość tuszu w przeglądarce
  // = tabela posuwów kroju × pismo × skala kamery (macierz ekranowa tekstu), w granicy 1 px.
  const motyw = (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) ?? '';
  const t = await tabliczka.evaluate((el) => {
    const tekst = el as SVGTextElement;
    return {
      tekst: tekst.textContent ?? '',
      szerokosc: tekst.getBoundingClientRect().width,
      fontSize: Number(tekst.getAttribute('font-size')),
      fontWeight: Number(tekst.getAttribute('font-weight')),
      skala: tekst.getScreenCTM()!.a,
    };
  });
  const zTabeli = szerokoscZTabeliEm(t.tekst, t.fontWeight) * t.fontSize * t.skala;
  expect(Math.abs(t.szerokosc - zTabeli), `${kadr}: tabliczka T1 „${t.tekst}" szerokość ${t.szerokosc.toFixed(2)} px = tabela posuwów ${zTabeli.toFixed(2)} px`).toBeLessThanOrEqual(TOLERANCJA_EKRANU_PX);
  zapiszPomiarSzerokosci({ kadr, motyw, rodzaj: 'tabliczka T1', tekst: t.tekst, klasa: klasaTresci(t.tekst), fontSize: t.fontSize, szerokoscPx: t.szerokosc, zTabeliPx: zTabeli });
}

type PomiarSzerokosci = {
  kadr: string;
  motyw: string;
  rodzaj: 'wiersz bloku' | 'tabliczka T1';
  tekst: string;
  klasa: 'cyfry' | 'wielkie litery';
  /** Pismo [j.św.] z atrybutu węzła (po podłodze opisów celu kadru). */
  fontSize: number;
  szerokoscPx: number;
  zTabeliPx: number;
};
const POMIARY_SZEROKOSCI: PomiarSzerokosci[] = [];
function zapiszPomiarSzerokosci(p: PomiarSzerokosci): void {
  POMIARY_SZEROKOSCI.push(p);
  mkdirSync(dirname(POMIARY_SZEROKOSCI_PLIK), { recursive: true });
  writeFileSync(POMIARY_SZEROKOSCI_PLIK, `${JSON.stringify(POMIARY_SZEROKOSCI, null, 2)}\n`);
}

type PomiarPodpisow = {
  kadr: string;
  motyw: string;
  pole: string;
  /** Prawe krawędzie tuszu podpisów aparatów po lewej stronie toru [px ekranu] i ich rozrzut. */
  prawe: number[];
  rozrzut: number;
  podpisy: string[];
};
const POMIARY_PODPISOW: PomiarPodpisow[] = [];
const POMIARY_PODPISOW_PLIK = resolve(HERE, '..', 'test-results', 'ux04-pole-liniowe-pomiary-podpisow.json');

/** Wspólna krawędź tuszu podpisów pola (decyzja architekta §11.7 pkt 8): podpisy aparatów pola
 *  stojące po lewej stronie toru (`data-label-strona="left"`, tekst poziomy) kończą się w jednej
 *  prawej krawędzi tuszu — tolerancja 1 px ekranu, metryki czcionki PRZEGLĄDARKI (jednostkowy
 *  odpowiednik w świecie: `zaczepKrawedziEtykiet.test.tsx` (C)). */
async function zmierzPodpisyPola(page: Page, kadr: string, pole: Pole): Promise<void> {
  const motyw = (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) ?? '';
  const podpisy = await page.evaluate(
    ([kanwa, prefiks]) =>
      [...document.querySelectorAll(`${kanwa} g[data-owner-ref^="${prefiks}"][data-label-strona="left"] > text`)]
        .filter((t) => !t.hasAttribute('transform'))
        .map((t) => {
          const r = t.getBoundingClientRect();
          return { tekst: t.textContent ?? '', prawa: r.x + r.width, anchor: t.getAttribute('text-anchor') ?? '' };
        }),
    [KANWA, `${pole.ref_id}#etykieta-aparatu-`] as const,
  );
  expect(podpisy.length, `${kadr}: co najmniej dwa podpisy aparatów po lewej toru pola`).toBeGreaterThanOrEqual(2);
  for (const p of podpisy) expect(p.anchor, `${kadr}: „${p.tekst}" zaczepiony w prawej krawędzi`).toBe('end');
  const prawe = podpisy.map((p) => p.prawa);
  const rozrzut = Math.max(...prawe) - Math.min(...prawe);
  expect(rozrzut, `${kadr} · ${motyw}: wspólna prawa krawędź podpisów (${podpisy.map((p) => `${p.tekst}@${p.prawa.toFixed(1)}`).join(', ')})`).toBeLessThanOrEqual(TOLERANCJA_EKRANU_PX);
  POMIARY_PODPISOW.push({ kadr, motyw, pole: pole.ref_id, prawe, rozrzut, podpisy: podpisy.map((p) => p.tekst) });
  mkdirSync(dirname(POMIARY_PODPISOW_PLIK), { recursive: true });
  writeFileSync(POMIARY_PODPISOW_PLIK, `${JSON.stringify(POMIARY_PODPISOW, null, 2)}\n`);
}

/** Pokrycie iloczynu decyzji §11.7 pkt 7 w biegu jednego wykonania pola: teksty, których
 *  prostokąt liczy tabela posuwów kroju (wiersze bloku przekaźnika, tabliczka przekładnika T1),
 *  z przewagą {cyfr, wielkich liter} × motyw {ciemny, jasny} — każda komórka zmierzona
 *  (asercja szerokości ± 1 px w `zmierzBlokPrzekaznika` i `sprawdzPrzekladnikPradowy`), więc
 *  test nie jest pusty. Po usunięciu duplikatów funkcji EAZ u źródła blok pola Z.10 ma jeden
 *  wiersz poza okręgiem („51N · ZS · 50BF · 79 · SCO", przewaga wielkich liter) — komórkę cyfr
 *  pola Z.10 niesie tabliczka T1 („200-400/5 A · 5P20"), tekst z tego samego pisma t4. */
function oczekujPokryciaKlasSzerokosci(prefiksKadru: string): void {
  const komorki = new Set(POMIARY_SZEROKOSCI.filter((p) => p.kadr.startsWith(prefiksKadru)).map((p) => `${p.klasa}|${p.motyw}`));
  expect([...komorki].sort(), `${prefiksKadru}: iloczyn klasa treści × motyw`).toEqual([
    'cyfry|dark_scada',
    'cyfry|light_technical',
    'wielkie litery|dark_scada',
    'wielkie litery|light_technical',
  ]);
}

async function oczekujKafla(page: Page, deviceRef: string, stan: StanKafla, opis: string): Promise<void> {
  await expect.poll(async () => (await kafel(page, deviceRef))?.stan, { timeout: 30000, message: opis }).toBe(stan);
  expect(await kafel(page, deviceRef), opis).toEqual({ stan, fill: KAFEL[stan], znak: stan === 'nieustalony' ? '?' : null });
}

/** Położenie aparatu z menu aparatu (natywny prawy klik w uchwyt aparatu, klik pozycji). */
async function polozenieZMenu(
  page: Page,
  deviceRef: string,
  akcja: 'open-switch' | 'close-switch' | 'earth-switch',
): Promise<void> {
  await widokCalejSieci(page);
  const menu = await prawyKlikAparatu(page, deviceRef);
  const pozycja = menu.getByTestId(`sld-menu-${akcja}`);
  await expect(pozycja, `${deviceRef}: ${akcja} dostępne`).toBeEnabled();
  // Rewizja modelu po stronie aplikacji przed operacją — następny krok startuje dopiero, gdy
  // aplikacja ma nowy model (pozycja aktywna = operacja zmienia stan, więc rewizja rośnie).
  // Pomiar 2026-10-29: prawy klik w aparat w trakcie odświeżania sceny po poprzedniej
  // operacji trafiał w tło (menu „Schemat — kanwa robocza").
  const rewizja = page.getByTestId('mvd-status-model');
  const przed = await rewizja.innerText();
  await pozycja.click();
  await page.keyboard.press('Escape');
  await expect(rewizja, `${deviceRef}: ${akcja} — nowa rewizja modelu w aplikacji`).not.toHaveText(przed, { timeout: 30000 });
  await ruchBezPrzyciskuNiePrzesuwaWidoku(page, `${deviceRef}: po pozycji menu ${akcja}`);
}

/** Ruch myszy nad kanwą BEZ przycisku nie przesuwa widoku — natywna kontrola defektu
 *  „wskaźnik wciśnięty po menu kontekstowym" (`SldCanvasV3.tsx` `zwolnijWskaznik`). */
async function ruchBezPrzyciskuNiePrzesuwaWidoku(page: Page, opis: string): Promise<void> {
  const svg = page.locator('svg[data-testid="sld-canvas-v3"]');
  const k = (await svg.boundingBox())!;
  await czekajNaStabilnyWidok(page);
  const przed = await svg.getAttribute('viewBox');
  await page.mouse.move(k.x + k.width * 0.3, k.y + k.height * 0.4, { steps: 3 });
  await page.mouse.move(k.x + k.width * 0.7, k.y + k.height * 0.6, { steps: 3 });
  await page.waitForTimeout(200);
  expect(await svg.getAttribute('viewBox'), `${opis}: ruch myszy bez przycisku nie przesuwa widoku`).toBe(przed);
}

/** Widok kamery stabilny = dwa kolejne odczyty `viewBox` kanwy identyczne. */
async function czekajNaStabilnyWidok(page: Page): Promise<void> {
  const svg = page.locator('svg[data-testid="sld-canvas-v3"]');
  let poprzedni: string | null = null;
  for (let i = 0; i < 40; i += 1) {
    const biezacy = await svg.getAttribute('viewBox');
    if (biezacy !== null && biezacy === poprzedni) return;
    poprzedni = biezacy;
    await page.waitForTimeout(250);
  }
}

function polozenieAparatu(enm: Snapshot, deviceRef: string): string | null {
  for (const pole of enm.bays ?? []) {
    const a = (pole.primary_devices ?? []).find((d) => d.device_ref === deviceRef);
    if (a) return a.switch_state?.actual_state ?? null;
  }
  return null;
}

/** Kontenery prawego inspektora, które się przewijają (`overflow-y` auto/scroll i treść wyższa
 *  niż kadr kontenera), w kolejności dokumentu. */
async function przewijaneKonteneryInspektora(page: Page): Promise<string[]> {
  return page.getByTestId('mvd-inspector').evaluate((korzen) => {
    const przewijane: string[] = [];
    for (const el of [korzen, ...Array.from(korzen.querySelectorAll('*'))]) {
      if (!(el instanceof HTMLElement) || el.closest('svg')) continue;
      if (['INPUT', 'SELECT', 'TEXTAREA', 'OPTION'].includes(el.tagName)) continue;
      if (!['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) continue;
      if (el.scrollHeight > el.clientHeight + 1) {
        przewijane.push(el.dataset.testid ?? `${el.tagName.toLowerCase()}.${el.className}`);
      }
    }
    return przewijane;
  });
}

/** JEDNO przewijanie prawego inspektora przy oknie technicznym z selekcji pod panelem elementu
 *  (`ui2/legacy/LegacyInspektor.tsx`): przewija się wyłącznie treść inspektora, nie kontener
 *  ani ciało okna. Pomiar przed naprawą (2026-10-29, okno pola Z.10/Z.11.1): kontener
 *  `h-full overflow-y-auto` nadawał oknu wysokość kadru — trzy zagnieżdżone przewijania
 *  (kontener, ciało okna, sekcje karty pola), ostatni wiersz oceny pola ucięty pod ramką sekcji
 *  przy każdej wysokości okna przeglądarki. Klasa: okna E-10…E-15 (kolumny `h-full` z ciałem
 *  `flex-1 overflow-auto`) — e2e ćwiczy okno GPZ (E-10), odcinka (E-12) i pola (E-11).
 *  `trescPrzewijana`: treść wyższa niż kadr (wtedy przewijanie treści jest wymagane, inaczej
 *  sprawdzenie byłoby puste). */
async function jednoPrzewijanieInspektora(page: Page, opis: string, trescPrzewijana: boolean): Promise<void> {
  await expect(page.getByTestId('inspektor-panel-nad-oknem'), `${opis}: okno z selekcji pod panelem elementu`).toBeVisible();
  await expect
    .poll(async () => (await przewijaneKonteneryInspektora(page)).filter((id) => id !== 'mvd-inspector-tresc'), {
      timeout: 10000,
      message: `${opis}: przewija się wyłącznie treść inspektora`,
    })
    .toEqual([]);
  if (trescPrzewijana) {
    expect(await przewijaneKonteneryInspektora(page), `${opis}: treść inspektora przewijana`).toEqual(['mvd-inspector-tresc']);
  }
}

/** Teksty inspektora, które wychodzą poza swoje pudełko (`scrollWidth` > `clientWidth` przy
 *  `overflow-x: visible` — tekst przelany rysuje się na sąsiedniej treści). Pomiar przed naprawą
 *  (2026-10-29, inspektor 360 px): tabele oceny pola czterech i pięciu kolumn ze zdaniami —
 *  „Kryterium spełnione", „zabezpieczeniowych" wychodziły poza wąską kolumnę i nakładały się na
 *  tekst kolumny obok. Klasa defektu to KAŻDY tekst inspektora przy zaznaczonym polu (panel
 *  elementu i cała karta pola), nie tylko tabela oceny. Pomijane: elementy nierysowane, liniowe
 *  (`display: inline` — przelew mierzy ich blok), przycinające (`overflow` ≠ `visible` — nie
 *  nakładają się), pola formularza (przewijają tekst wewnątrz) i rysunek SVG. Meldowany jest
 *  najgłębszy przelany element (rodzic przelewa się przez dziecko). */
async function przelaneTeksty(kontener: Locator): Promise<string[]> {
  return kontener.evaluate((korzen) => {
    const przelane: HTMLElement[] = [];
    for (const el of Array.from(korzen.querySelectorAll('*'))) {
      if (!(el instanceof HTMLElement) || el.closest('svg')) continue;
      if (['INPUT', 'SELECT', 'TEXTAREA', 'OPTION'].includes(el.tagName)) continue;
      if (el.getClientRects().length === 0 || el.clientWidth === 0) continue;
      const styl = getComputedStyle(el);
      if (styl.display === 'inline' || styl.overflowX !== 'visible') continue;
      if (el.scrollWidth > el.clientWidth + 1) przelane.push(el);
    }
    return przelane
      .filter((el) => !przelane.some((inny) => inny !== el && el.contains(inny)))
      .map((el) => {
        const id = el.dataset.testid ? `[${el.dataset.testid}]` : '';
        const kolumna = el.dataset.etykieta ? `{${el.dataset.etykieta}}` : '';
        return `${el.tagName.toLowerCase()}${id}${kolumna} „${(el.textContent ?? '').trim().slice(0, 40)}": ${el.scrollWidth} > ${el.clientWidth} px`;
      });
  });
}

/** Odstęp oceny pola od krawędzi treści inspektora na czas zrzutu oceny (px). */
const MARGINES_OCENY = 8;

/** Zrzuty okna pola w obu motywach: schemat pola (`SchematPolaSn` — wycinek rysunku kanwy
 *  z tej samej migawki ENM) i ocena pola wg klasy (`OcenaPolaLiniowegoGpz`). Karta pola leży
 *  w inspektorze POD panelem elementu (jedno przewijanie, `LegacyInspektor`), więc zrzut
 *  całej strony pokazywał kanwę i panel elementu, a karty pola nie było w kadrze (pomiar
 *  2026-10-29: zrzuty `okno-pola-*` bez schematu pola i bez oceny). Zrzut elementu przewija
 *  inspektor do elementu — to, co projektant widzi po przewinięciu karty.
 *
 *  Czytelność inspektora w wąskim gospodarzu (iloczyn: motyw × szerokość inspektora
 *  {domyślna, tryb szeroki — natywny klik w przycisk nagłówka inspektora} × pole i szablon
 *  {Z.10 trójpołożeniowy, Z.10 stały z odłącznikiem, Z.11.1}): żaden tekst panelu elementu ani
 *  karty pola nie przelewa się poza swoje pudełko (`przelaneTeksty`).
 *
 *  Okno przeglądarki wysokie na czas zrzutów okna pola (monitor pionowy 1600 × 2400): zrzut
 *  elementu w przewijanym panelu ucina to, czego panel nie pokazuje. Schemat pola mieści się
 *  w kadrze inspektora i jest zrzutem elementu. Ocena pola jest wyższa niż kadr (pomiar
 *  2026-10-29 w inspektorze domyślnym: 12 773 px Z.10, 15 241 px Z.11.1 przy szerokości 273 px),
 *  więc na czas jej zrzutu okno rośnie, aż CAŁA ocena mieści się w treści inspektora (jedynym
 *  przewijaniu, `jednoPrzewijanieInspektora`) — zrzut elementu oceny obejmuje wszystkie jej
 *  sekcje. Po zrzutach okno wraca do 1600 × 1000. */
async function zrzutyOknaPola(page: Page, nazwa: string): Promise<void> {
  const okno = page.getByTestId('bay-configurator-surface');
  const szerokiInspektor = page.getByTestId('mvd-inspector-szeroki');
  const trescInspektora = page.getByTestId('mvd-inspector-tresc');
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await page.setViewportSize({ width: 1600, height: 2400 });
    await ustawMotyw(page, theme);
    await expect(okno).toBeVisible({ timeout: 30000 });
    const schemat = okno.getByTestId('schemat-pola-sn');
    await expect(schemat.getByTestId('bay-svg-renderer'), `${nazwa}: schemat pola narysowany`).toBeVisible({ timeout: 30000 });
    const ocena = okno.getByTestId('ocena-pola-liniowego');
    await expect(ocena, `${nazwa}: ocena pola wg klasy`).toBeVisible({ timeout: 30000 });
    for (const szeroki of [true, false]) {
      await szerokiInspektor.click();
      await expect(szerokiInspektor, `${nazwa}: tryb szeroki inspektora ${szeroki}`).toHaveAttribute('aria-pressed', String(szeroki));
      await expect
        .poll(() => przelaneTeksty(trescInspektora), { timeout: 10000, message: `${nazwa} · ${klucz} · inspektor ${szeroki ? 'szeroki' : 'domyślny'}: tekst inspektora w granicach swoich pudełek` })
        .toEqual([]);
      await jednoPrzewijanieInspektora(page, `${nazwa} · ${klucz} · inspektor ${szeroki ? 'szeroki' : 'domyślny'}`, true);
    }
    await page.waitForTimeout(400);
    await schemat.scrollIntoViewIfNeeded();
    await expect(schemat, `${nazwa}: schemat pola w kadrze okna`).toBeInViewport({ ratio: 1 });
    zapiszOdcisk(`${nazwa}-${klucz}`, await schemat.screenshot({ path: resolve(KATALOG_ZRZUTOW, `${nazwa}-${klucz}.png`) }));
    // CAŁA ocena pola (pomiar 2026-10-29: zrzut treści inspektora od początku oceny ucinał ją
    // na wysokości okna — obwody funkcji, napięcie zwrotne, napęd i sygnały, czyli sekcje
    // różniące Z.10 od Z.11.1, były poza kadrem, a zrzuty oceny obu wykonań wychodziły bajt
    // w bajt identyczne). Okno rośnie o niewidoczną część oceny, aż ocena mieści się w treści
    // inspektora (JEDYNYM przewijaniu — `jednoPrzewijanieInspektora`) i w oknie w całości.
    // Ocena stoi o `MARGINES_OCENY` px pod górną krawędzią treści i nad dolną: przewinięcie
    // do początku oceny daje całkowity `scrollTop`, a granice oceny leżą na ułamkach piksela
    // (pomiar 2026-10-29: ocena Z.10 stałego ucięta o 0,5 px u góry, ratio 0,99996).
    const ustawOcene = () =>
      page.evaluate(
        ([o, t, margines]) => {
          const eo = document.querySelector(`[data-testid="${o}"]`)!;
          const et = document.querySelector(`[data-testid="${t}"]`)!;
          eo.scrollIntoView({ block: 'start' });
          et.scrollTop -= margines;
          const ro = eo.getBoundingClientRect();
          const rt = et.getBoundingClientRect();
          return {
            gora: ro.top - Math.max(rt.top, 0),
            brak: Math.max(0, Math.ceil(ro.bottom + margines - Math.min(rt.bottom, window.innerHeight))),
          };
        },
        ['ocena-pola-liniowego', 'mvd-inspector-tresc', MARGINES_OCENY] as const,
      );
    for (let i = 0; i < 6; i += 1) {
      const { brak } = await ustawOcene();
      if (brak === 0) break;
      const vp = page.viewportSize()!;
      expect(vp.height + brak, `${nazwa}: wysokość okna dla całej oceny`).toBeLessThan(16000);
      await page.setViewportSize({ width: vp.width, height: vp.height + brak + 16 });
    }
    const polozenie = await ustawOcene();
    expect(polozenie.brak, `${nazwa}: dół oceny w treści inspektora`).toBe(0);
    expect(polozenie.gora, `${nazwa}: początek oceny w treści inspektora`).toBeGreaterThan(0);
    await expect(ocena, `${nazwa}: cała ocena w kadrze inspektora`).toBeInViewport({ ratio: 1 });
    await expect(ocena.getByTestId('ocena-pola-liniowego-obwody'), `${nazwa}: obwody funkcji w kadrze oceny`).toBeInViewport();
    zapiszOdcisk(`${nazwa}-ocena-${klucz}`, await ocena.screenshot({ path: resolve(KATALOG_ZRZUTOW, `${nazwa}-ocena-${klucz}.png`) }));
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
}

/** Odcisk zrzutu w rejestrze biegu — żaden zrzut nie może być bajtowo identyczny z innym
 *  (kanwa, schemat pola, ocena pola). */
function zapiszOdcisk(nazwa: string, bufor: Buffer): void {
  const odcisk = createHash('sha256').update(bufor).digest('hex');
  const dubel = [...ODCISKI_ZRZUTOW].find(([, h]) => h === odcisk)?.[0];
  expect(dubel, `${nazwa}: zrzut identyczny bajt w bajt z innym zrzutem`).toBeUndefined();
  ODCISKI_ZRZUTOW.set(nazwa, odcisk);
}

/** Zrzut POLA aparatu: natywny klik w aparat (zaznacza pole), „Dopasuj do… → Pole" — kamera
 *  kadruje całe pole na środku kanwy, sąsiedzi pod kurtyną. Aparat celu poza kurtyną i w
 *  środkowej części kanwy (każdy zrzut kadruje SWOJE pole — pomiar 2026-10-29: przybliżanie
 *  kółkiem zostawiało kamerę z poprzedniego zrzutu, dwa zrzuty były identyczne bajt w bajt). */
async function zrzut(
  page: Page,
  nazwa: string,
  deviceRef: string,
  pole: Pole,
  oznaczenia: readonly string[] = [],
): Promise<void> {
  const aparatyPola = (pole.primary_devices ?? []).map((d) => d.device_ref);
  await klikAparatu(page, deviceRef);
  await page.getByTestId('sld-v3-dopasuj-do-toggle').click();
  await page.getByTestId('sld-v3-dopasuj-do-pole').click();
  await expect(page.getByTestId('sld-v3-sciezka-kadru')).toBeVisible({ timeout: 15000 });
  const uchwyt = page.locator(`[data-hit-klasa="aparat"][data-hit-device-ref="${deviceRef}"]`).first();
  await czekajNaStabilnaGeometrie(uchwyt);
  // Kadr pola trwa do zrzutu: ścieżka kadru widoczna i aparat narysowany (LOD pola). Jawna
  // asercja zamiast milczącego limitu `boundingBox` — porzucony kadr (np. przeładowanie
  // strony) ma być nazwany w raporcie biegu.
  await expect(page.getByTestId('sld-v3-sciezka-kadru'), `${nazwa}: kadr pola aktywny`).toBeVisible();
  await expect(uchwyt, `${nazwa}: aparat narysowany na kadrze pola`).toHaveCount(1);
  await expect(page.locator(`[data-kadr="poza"] g[data-device-ref="${deviceRef}"]`)).toHaveCount(0);
  const k = (await page.locator('svg[data-testid="sld-canvas-v3"]').boundingBox())!;
  const box = (await uchwyt.boundingBox())!;
  const cx = box.x + box.width / 2;
  expect(cx, `${nazwa}: aparat w kadrze kanwy`).toBeGreaterThan(k.x);
  expect(cx, `${nazwa}: aparat w kadrze kanwy`).toBeLessThan(k.x + k.width);
  // Escape zdejmuje zaznaczenie, nie kadr (K2b §0.3) — zrzut bez ramki zaznaczenia.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // Oznaczenia aparatów stoją przy symbolach na poziomie szczegółu pola (kadr „Pole"); na
  // widoku przeglądowym stacji ich nie ma — stan niesie wtedy wyłącznie kafel.
  for (const ozn of oznaczenia) {
    await expect(page.locator('svg[data-testid="sld-canvas-v3"] text', { hasText: new RegExp(`^${ozn}$`) }).first(), `${nazwa}: oznaczenie ${ozn}`).toBeVisible();
  }
  // Kadr pola = poziom szczegółu pola (LOD2): tam obowiązuje bok kafla 48 × 48 w świecie.
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]'), `${nazwa}: kadr pola na LOD2`).toHaveAttribute('data-scene-lod', '2');
  await zmierzKafle(page, nazwa, pole);
  // Kadr pola niesie blok przekaźnika SWOJEGO pola (pole z funkcjami EAZ i powiązaniami).
  expect((await zmierzBlokPrzekaznika(page, nazwa)).length, `${nazwa}: blok przekaźnika w kadrze`).toBeGreaterThan(0);
  await sprawdzPrzekladnikPradowy(page, nazwa, pole);
  await zmierzPodpisyPola(page, nazwa, pole);
  zapiszOdcisk(nazwa, await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `${nazwa}.png`), clip: await kadrPola(page, aparatyPola) }));
  await widokCalejSieci(page);
}

/** Kadr zrzutu pola: obrys uchwytów WSZYSTKICH aparatów pola ∪ panel pola GPZ
 *  (`sld-v3-gpz-panel-*`, z podpisem pola i każdym tekstem, którego środek leży w panelu) ∪
 *  etykiety oznaczeń aparatów pola (także na lewo od panelu), z wąskim marginesem i przycięty do kanwy — zrzut
 *  pokazuje całe pole z podpisem, nie cały ekran aplikacji. Pomiar 2026-10-29: kadr ze stałym
 *  marginesem wokół samych aparatów ucinał podpis „Pole liniowe…" pola Z.11.1 (podpis stoi przy
 *  prawej krawędzi panelu, dalej niż margines od najbliższego aparatu) — dlatego podpis pola jest
 *  sprawdzany asercją w każdym kadrze, który ma panel. */
async function kadrPola(page: Page, aparatyPola: readonly string[]): Promise<{ x: number; y: number; width: number; height: number }> {
  const wynik = await page.evaluate(
    ({ refs }) => {
      const kanwa = document.querySelector('svg[data-testid="sld-canvas-v3"]');
      if (!kanwa) return null;
      const k = kanwa.getBoundingClientRect();
      const pudla = refs
        .map((ref) => document.querySelector(`[data-hit-klasa="aparat"][data-hit-device-ref="${ref}"]`))
        .filter((el): el is Element => el !== null)
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      if (pudla.length === 0) return null;
      let x0 = Math.min(...pudla.map((r) => r.left));
      let y0 = Math.min(...pudla.map((r) => r.top));
      let x1 = Math.max(...pudla.map((r) => r.right));
      let y1 = Math.max(...pudla.map((r) => r.bottom));
      const sx = (x0 + x1) / 2;
      const sy = (y0 + y1) / 2;
      const panel = [...kanwa.querySelectorAll('[data-testid^="sld-v3-gpz-panel-"]')]
        .map((el) => el.getBoundingClientRect())
        .find((r) => sx >= r.left && sx <= r.right && sy >= r.top && sy <= r.bottom);
      let podpis: { left: number; top: number; right: number; bottom: number; tekst: string } | null = null;
      const teksty = [...kanwa.querySelectorAll('text')]
        .map((el) => ({ r: el.getBoundingClientRect(), tekst: (el.textContent ?? '').trim() }))
        .filter(({ r }) => r.width > 0 && r.height > 0);
      if (panel) {
        x0 = Math.min(x0, panel.left);
        y0 = Math.min(y0, panel.top);
        x1 = Math.max(x1, panel.right);
        y1 = Math.max(y1, panel.bottom);
        for (const { r, tekst } of teksty) {
          const cx = (r.left + r.right) / 2;
          const cy = (r.top + r.bottom) / 2;
          if (cx < panel.left || cx > panel.right || cy < panel.top || cy > panel.bottom) continue;
          x0 = Math.min(x0, r.left);
          y0 = Math.min(y0, r.top);
          x1 = Math.max(x1, r.right);
          y1 = Math.max(y1, r.bottom);
          if (tekst.startsWith('Pole ') && (podpis === null || r.top < podpis.top)) {
            podpis = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, tekst };
          }
        }
      }
      // Oznaczenia aparatów pola stoją obok symbolu, także na lewo od panelu — etykiety
      // właściciela `<pole>#etykieta-aparatu-<device_ref>` (compose/gpz.ts).
      for (const el of kanwa.querySelectorAll('[data-owner-ref*="#etykieta-aparatu-"]')) {
        const wlasciciel = el.getAttribute('data-owner-ref') ?? '';
        if (!refs.some((ref) => wlasciciel.endsWith(`#etykieta-aparatu-${ref}`))) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        x0 = Math.min(x0, r.left);
        y0 = Math.min(y0, r.top);
        x1 = Math.max(x1, r.right);
        y1 = Math.max(y1, r.bottom);
      }
      const MARGINES = 16;
      const x = Math.max(k.left, x0 - MARGINES);
      const y = Math.max(k.top, y0 - MARGINES);
      const prawa = Math.min(k.right, x1 + MARGINES);
      const dol = Math.min(k.bottom, y1 + MARGINES);
      return { kadr: { x, y, width: prawa - x, height: dol - y }, maPanel: panel !== undefined, podpis };
    },
    { refs: [...aparatyPola] },
  );
  expect(wynik, 'kadr pola: uchwyty aparatów pola na kanwie').not.toBeNull();
  const { kadr, maPanel, podpis } = wynik!;
  if (maPanel) {
    expect(podpis, 'kadr pola: podpis pola w panelu pola').not.toBeNull();
    // Podpis cały w kadrze — chyba że wychodzi poza kanwę (wtedy kadr jest ucięty kanwą, a nie
    // marginesem; zbliżenie kamery).
    const kanwa = (await page.locator('svg[data-testid="sld-canvas-v3"]').boundingBox())!;
    if (podpis!.left >= kanwa.x && podpis!.right <= kanwa.x + kanwa.width) {
      expect(podpis!.left, `kadr pola: podpis „${podpis!.tekst}" w kadrze (lewa)`).toBeGreaterThanOrEqual(kadr.x);
      expect(podpis!.right, `kadr pola: podpis „${podpis!.tekst}" w kadrze (prawa)`).toBeLessThanOrEqual(kadr.x + kadr.width);
    }
  }
  return { x: Math.round(kadr.x), y: Math.round(kadr.y), width: Math.round(kadr.width), height: Math.round(kadr.height) };
}

/** Odciski zrzutów kanwy w biegu — każdy zrzut pola musi być inny (kontrola kadrowania). */
const ODCISKI_ZRZUTOW = new Map<string, string>();

/** GPZ z menu tła kanwy — kreator źródła z wartościami domyślnymi (2 sekcje × 2 pola liniowe Z.10,
 *  stan projektowany, rodzina bez gazów fluorowanych). */
async function wstawGpz(page: Page, request: APIRequestContext, caseId: string): Promise<{ sekcjaA: string; sekcjaB: string }> {
  const kanwa = page.getByTestId('sld-canvas-v3');
  await expect(kanwa).toBeVisible({ timeout: 30000 });
  await kanwa.click({ button: 'right', position: { x: 40, y: 40 } });
  await page.getByRole('menu').getByTestId('sld-menu-insert-gpz').click();
  const kreator = page.getByTestId('mvd-kreator-zrodlo');
  await expect(kreator).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Sekcje i pola', exact: false }).first().click();
  const aparatKatalog = page.getByTestId('mvd-kreator-zrodlo-aparat-katalog');
  await expect(aparatKatalog).toBeVisible({ timeout: 60000 });
  await expect.poll(async () => (await aparatKatalog.inputValue()).trim(), { timeout: 60000 }).not.toBe('');
  await page.getByTestId('mvd-kreator-zrodlo-zapisz').click();
  await expect(kreator).toBeHidden({ timeout: 60000 });
  await expect.poll(async () => polaLiniowe(await pobierzEnm(request, caseId)).length, { timeout: 60000 }).toBeGreaterThanOrEqual(4);

  const enm = await pobierzEnm(request, caseId);
  const [sekcjaA, sekcjaB] = sekcje(enm);
  expect(sekcjaB, 'dwie sekcje SN').toBeTruthy();
  const odpowiedzRodzin = await request.get(`${BACKEND_BASE}/api/catalog/switchgear-families`);
  expect(odpowiedzRodzin.ok()).toBeTruthy();
  const listaRodzin = (await odpowiedzRodzin.json()) as Array<{ switchgear_family_ref: string; gaz_fluorowany: boolean | null }>;
  for (const pole of polaLiniowe(enm)) {
    expect(pole.bay_template_ref, pole.ref_id).toBe(SZABLON_Z10);
    // Nowe pole: stan projektowany, rodzina bez gazów fluorowanych (dyrektywa 2026-10-28).
    expect(pole.stan_obiektu, pole.ref_id).toBe('PROJEKTOWANY');
    expect((pole.primary_devices ?? []).every((d) => d.stan_obiektu === 'PROJEKTOWANY'), pole.ref_id).toBe(true);
    const rodzina = listaRodzin.find((f) => f.switchgear_family_ref === pole.switchgear_family_ref);
    if (pole.switchgear_family_ref) expect(rodzina?.gaz_fluorowany, `${pole.ref_id}: ${pole.switchgear_family_ref}`).toBe(false);
    expect((pole.primary_devices ?? []).map((d) => `${d.designation}:${d.kind}`), pole.ref_id).toEqual([
      'Q1:THREE_POSITION_SWITCH',
      'Q0:CB',
      'T1:CT',
      'PF1:VOLTAGE_INDICATOR',
      'GK:CABLE_HEAD',
      'T2:CORE_BALANCE_CT',
    ]);
  }

  return { sekcjaA, sekcjaB };
}

test('UX-04 — pole liniowe Z.10 GPZ: budowa z kanwy, klik = zaznaczenie, ramki SCADA wg stanu (oba motywy)', async ({ page, request }) => {
  test.setTimeout(900_000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const { caseId } = await otworzAplikacje(page, request, 'Z.10');
  const operacjeLaczeniowe: string[] = [];
  page.on('request', (req) => {
    const tresc = req.postData() ?? '';
    if (req.url().includes('/enm/domain-ops') && /"name"\s*:\s*"(open_switch|close_switch)"/.test(tresc)) operacjeLaczeniowe.push(tresc);
  });

  // ---- 1. GPZ z menu tła — kreator źródła z wartościami domyślnymi --------------------------
  const { sekcjaA, sekcjaB } = await wstawGpz(page, request, caseId);
  let enm: Snapshot;

  // ---- 2. Ciąg główny z GPZ (prawy klik w symbol GPZ) — pole sekcji 1 zajęte kablem ---------
  await wrocNaSchemat(page);
  const uchwytGpz = page.locator('[data-hit-klasa="zrodlo"][data-hit-role="obrys"]').first();
  await klikZWeryfikacja(
    page,
    'prawy klik GPZ',
    uchwytGpz,
    () => punktUchwytu(uchwytGpz),
    'right',
    async () => (await page.getByRole('menu').getByTestId('sld-menu-continue-trunk').count()) > 0,
  );
  await page.getByRole('menu').getByTestId('sld-menu-continue-trunk').click();
  const magistrala = page.getByTestId('mvd-kreator-magistrala');
  await expect(magistrala).toBeVisible({ timeout: 20000 });
  const katalogKabla = page.getByTestId('mvd-kreator-magistrala-katalog');
  await expect.poll(async () => katalogKabla.locator('option').count(), { timeout: 60000 }).toBeGreaterThan(1);
  await katalogKabla.selectOption({ index: 1 });
  await page.getByTestId('mvd-kreator-magistrala-dalej').click();
  await page.getByTestId('mvd-kreator-magistrala-dlugosc').fill('400');
  await expect(magistrala).toHaveAttribute('data-status', 'gotowy', { timeout: 30000 });
  await page.getByTestId('mvd-kreator-magistrala-zapisz').click();
  const zakoncz = page.getByTestId('mvd-kreator-magistrala-zakoncz');
  if (await zakoncz.isVisible({ timeout: 15000 }).catch(() => false)) await zakoncz.click();
  await expect(magistrala).toBeHidden({ timeout: 60000 });
  await expect.poll(async () => ((await pobierzEnm(request, caseId)).branches ?? []).filter((b) => b.type === 'cable').length, { timeout: 60000 }).toBe(1);

  // ---- 2a. Jedno przewijanie inspektora — okna z selekcji GPZ (E-10) i odcinka (E-12) --------
  // Klasa okien pod panelem elementu (`LegacyInspektor`); okno pola (E-11) w `zrzutyOknaPola`.
  await wrocNaSchemat(page);
  await klikZWeryfikacja(page, 'klik GPZ', uchwytGpz, () => punktUchwytu(uchwytGpz), 'left', async () =>
    page.getByTestId('gpz-configurator-surface').isVisible(),
  );
  await jednoPrzewijanieInspektora(page, 'okno GPZ z selekcji', false);
  const odcinekRef = ((await pobierzEnm(request, caseId)).branches ?? []).find((b) => b.type === 'cable')!.ref_id;
  const uchwytOdcinka = page.locator(`[data-hit-klasa="tor"][data-hit-role="obrys"][data-hit-owner-ref="${odcinekRef}"]`).first();
  await klikZWeryfikacja(page, 'klik odcinka kablowego', uchwytOdcinka, () => punktNaTrasie(uchwytOdcinka), 'left', async () =>
    page.getByTestId('sn-segment-surface').isVisible(),
  );
  await jednoPrzewijanieInspektora(page, 'okno odcinka z selekcji', false);

  // ---- 3. Z.10 z wyłącznikiem stałym (§13) w polu sekcji 2 — okno pola → „Zmień wyposażenie" → szablon -----
  enm = await pobierzEnm(request, caseId);
  const poleStale = polaLiniowe(enm).find((p) => p.gpz_section_id === sekcjaB)!;
  await wrocNaSchemat(page);
  const menuStale = await prawyKlikAparatu(page, aparat(poleStale, 'Q0').device_ref);
  await menuStale.getByTestId('sld-menu-open-bay').click();
  await expect(page.getByTestId('bay-configurator-surface')).toBeVisible({ timeout: 30000 });
  // Karta pola i inspektor o TYM SAMYM obiekcie: po kreatorze magistrali zaznaczony był nowy
  // odcinek — akcja z menu wyłącznika zaznacza jego pole (pomiar 2026-10-29: inspektor
  // pokazywał odcinek kablowy obok karty pola).
  const kabelRef = (enm.branches ?? []).find((b) => b.type === 'cable')!.ref_id;
  await expect(page.getByTestId('inspektor-element-kanwy')).toHaveAttribute('data-element-id', poleStale.ref_id, { timeout: 15000 });
  await expect(page.getByTestId('inspektor-element-kanwy')).not.toHaveAttribute('data-element-id', kabelRef);
  await zrzutyOknaPola(page, 'okno-pola-z10-trojpolozeniowy');
  await page.getByTestId('wyposazenie-pola-edytuj').click();
  await page.getByTestId('wyposazenie-pola-tryb').selectOption('szablon');
  const szablon = page.getByTestId('wyposazenie-pola-szablon');
  await expect.poll(async () => szablon.locator(`option[value="${SZABLON_Z10_STALY}"]`).count(), { timeout: 30000 }).toBe(1);
  await szablon.selectOption(SZABLON_Z10_STALY);
  await page.getByTestId('wyposazenie-pola-zapisz').click();
  await expect
    .poll(async () => polaLiniowe(await pobierzEnm(request, caseId)).find((p) => p.ref_id === poleStale.ref_id)?.bay_template_ref, { timeout: 60000 })
    .toBe(SZABLON_Z10_STALY);
  await zrzutyOknaPola(page, 'okno-pola-z10-staly-z-odlacznikiem');

  enm = await pobierzEnm(request, caseId);
  const poleStalePo = polaLiniowe(enm).find((p) => p.ref_id === poleStale.ref_id)!;
  expect((poleStalePo.primary_devices ?? []).map((d) => `${d.designation}:${d.kind}`)).toEqual([
    'Q1:DS',
    'Q0:CB',
    'T1:CT',
    'PF1:VOLTAGE_INDICATOR',
    'Q8:ES',
    'GK:CABLE_HEAD',
    'T2:CORE_BALANCE_CT',
  ]);
  const kabel = (enm.branches ?? []).find((b) => b.type === 'cable')!;
  const galezPola = (pole: Pole) => (enm.branches ?? []).find((b) => b.ref_id === pole.equipment_refs?.[0]);
  const poleZajete = polaLiniowe(enm).find((p) => p.gpz_section_id === sekcjaA && galezPola(p)?.to_bus_ref === kabel.from_bus_ref)!;
  expect(poleZajete, 'pole sekcji 1 z kablem odejścia').toBeTruthy();
  const q1 = aparat(poleZajete, 'Q1');
  const q0 = aparat(poleZajete, 'Q0');
  expect(q1.switch_state?.actual_state).toBe('zamkniety');
  const aparatyStalego = (poleStalePo.primary_devices ?? []).map((d) => d.device_ref);

  // ---- 4. Klik = zaznaczenie (natywny lewy klik w wyłącznik), bez operacji łączeniowej -----
  await wrocNaSchemat(page);
  await klikAparatu(page, q0.device_ref);
  await expect(page.locator('[data-testid="sld-v3-zaznaczenie"] rect').first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
  expect(operacjeLaczeniowe, 'klik nie przełącza aparatu').toEqual([]);
  expect(galezPola(poleZajete)?.status).toBe('closed');
  expect(((await pobierzEnm(request, caseId)).branches ?? []).find((b) => b.ref_id === poleZajete.equipment_refs?.[0])?.status).toBe('closed');
  await page.keyboard.press('Escape');

  // ---- 5. Kafle wg stanu z modelu + zrzuty (oba motywy) — stan wyjściowy ------------------
  const dsStaly = aparat(poleStalePo, 'Q1');
  const esStaly = aparat(poleStalePo, 'Q8');
  const q0Staly = aparat(poleStalePo, 'Q0');
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await ustawMotyw(page, theme);
    await przyblizDoAparatu(page, q0.device_ref);
    await oczekujKafla(page, q1.device_ref, 'zamkniety', `${klucz}: Q1 trójpołożeniowy zamknięty`);
    await oczekujKafla(page, q0.device_ref, 'zamkniety', `${klucz}: Q0 zamknięty`);
    // Aparaty nie-łączniki bez kafla; symbol zawsze narysowany.
    for (const ozn of ['T1', 'PF1', 'GK', 'T2']) {
      const ref = aparat(poleZajete, ozn).device_ref;
      await expect(page.locator(`${KANWA} g[data-device-ref="${ref}"]`)).toHaveCount(1);
      expect(await kafel(page, ref), ozn).toBeNull();
    }
    // Rodzaj aparatu z modelu → symbol: Q0 z napędem silnikowym M (rekord `naped`), głowica
    // kablowa i przekładnik Ferrantiego jako elementy toru (wymaganie właściciela pkt 3–4).
    // Łącznik trójpołożeniowy Q1 z napędem zasobnikowym ręcznym (rysunek s.89 w 400 dpi; decyzja
    // architekta 2026-10-30: atrybut łącznika `naped`, nie osobny aparat).
    expect(q0.naped, 'Q0: napęd silnikowy w modelu').toBe('SILNIKOWY');
    expect(q1.naped, 'Q1: napęd zasobnikowy ręczny w modelu').toBe('ZASOBNIKOWY_RECZNY');
    for (const [ozn, symbol] of [['Q0', 'qetBreakerZNapedem'], ['Q1', 'qetThreePositionSwitchZNapedem'], ['GK', 'qetCableHead'], ['T2', 'qetCoreBalanceCt']] as const) {
      await expect(page.locator(`${KANWA} g[data-device-ref="${aparat(poleZajete, ozn).device_ref}"] [data-symbol-canon="${symbol}"]`), `${klucz}: ${ozn} → ${symbol}`).toHaveCount(1);
    }
    // Stan obiektu dyskretnie: atrybut symbolu (podpowiedź na kształcie trafienia).
    await expect(page.locator(`${KANWA} g[data-device-ref="${q0.device_ref}"]`)).toHaveAttribute('data-stan-obiektu', 'PROJEKTOWANY');
    await zrzut(page, `pole-z10-trojpolozeniowy-zamkniete-${klucz}`, q0.device_ref, poleZajete, ['Q1', 'Q0', 'T1']);
    // Wyłącznik stały: odłącznik i uziemnik bez rekordu położenia po zmianie szablonu — kafel
    // „stan nieznany" (szary ze znakiem „?"), nie brak kafla; oznaczenie przy symbolu.
    await przyblizDoAparatu(page, dsStaly.device_ref);
    await oczekujKafla(page, dsStaly.device_ref, 'nieustalony', `${klucz}: Q1 odłącznik bez rekordu położenia`);
    await oczekujKafla(page, esStaly.device_ref, 'nieustalony', `${klucz}: Q8 uziemnik bez rekordu położenia`);
    await oczekujKafla(page, q0Staly.device_ref, 'zamkniety', `${klucz}: Q0 pola stałego zamknięty`);
    await zrzut(page, `pole-z10-staly-stan-nieznany-${klucz}`, dsStaly.device_ref, poleStalePo, ['Q1', 'Q8']);
  }

  // ---- 6. Położenia z menu aparatu: Q1 zamknięty, Q8 otwarty (operacje na TYM aparacie) ----
  await polozenieZMenu(page, dsStaly.device_ref, 'close-switch');
  await expect.poll(async () => polozenieAparatu(await pobierzEnm(request, caseId), dsStaly.device_ref), { timeout: 30000 }).toBe('zamkniety');
  await polozenieZMenu(page, esStaly.device_ref, 'open-switch');
  await expect.poll(async () => polozenieAparatu(await pobierzEnm(request, caseId), esStaly.device_ref), { timeout: 30000 }).toBe('otwarty');
  // Menu odłącznika i uziemnika nie przełączyło wyłącznika pola (defekt sprzed rozszerzenia 5).
  expect(operacjeLaczeniowe, 'odłącznik i uziemnik nie przełączają wyłącznika').toEqual([]);
  expect(((await pobierzEnm(request, caseId)).branches ?? []).find((b) => b.ref_id === poleStalePo.equipment_refs?.[0])?.status).toBe('closed');
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await ustawMotyw(page, theme);
    await przyblizDoAparatu(page, esStaly.device_ref);
    await oczekujKafla(page, dsStaly.device_ref, 'zamkniety', `${klucz}: Q1 odłącznik zamknięty`);
    await oczekujKafla(page, q0Staly.device_ref, 'zamkniety', `${klucz}: Q0 zamknięty`);
    await oczekujKafla(page, esStaly.device_ref, 'otwarty', `${klucz}: Q8 uziemnik otwarty`);
    await zrzut(page, `pole-z10-wylacznik-zamkniety-uziemnik-otwarty-${klucz}`, q0Staly.device_ref, poleStalePo, ['Q1', 'Q0', 'Q8']);
  }

  // ---- 7. Zbliżenie: kamera kółkiem na wyłącznik pola (LOD szczegółu z kamery) ------------
  await ustawMotyw(page, 'dark_scada');
  await widokCalejSieci(page);
  const uchwytQ0 = await przyblizDoAparatu(page, q0Staly.device_ref);
  // Zbliżenie = poziom szczegółu pola (LOD2) i kafel wyraźnie większy niż w kadrze pola
  // (pomiar 2026-10-29: próg 40 px kończył zbliżenie na LOD1 — kafel 48 j.św. osiągał go przy
  // skali ok. 0,85, więc zrzut pokazywał okrąg przekaźnika bez kodów i bez linii powiązań).
  const svgZblizenia = page.locator(KANWA);
  for (let i = 0; i < 12; i += 1) {
    const box = (await uchwytQ0.boundingBox())!;
    if (Math.min(box.width, box.height) >= 3 * BOK_KAFLA_SWIATA && (await svgZblizenia.getAttribute('data-scene-lod')) === '2') break;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(200);
  }
  await czekajNaStabilnaGeometrie(uchwytQ0);
  await expect(svgZblizenia, 'zbliżenie: poziom szczegółu pola').toHaveAttribute('data-scene-lod', '2');
  const boxZblizenia = (await uchwytQ0.boundingBox())!;
  expect(Math.min(boxZblizenia.width, boxZblizenia.height), 'zbliżenie: uchwyt Q0 ≥ 3 × 48 px').toBeGreaterThanOrEqual(3 * BOK_KAFLA_SWIATA - TOLERANCJA_EKRANU_PX);
  await oczekujKafla(page, q0Staly.device_ref, 'zamkniety', 'zbliżenie: Q0 zamknięty');
  zapiszOdcisk('pole-z10-zblizenie-ciemny', await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, 'pole-z10-zblizenie-ciemny.png'), clip: await kadrPola(page, aparatyStalego) }));

  // ---- 8. „Otwórz łącznik" z menu wyłącznika → kafel zielony (oba motywy) -----------------
  await widokCalejSieci(page);
  const menuQ0 = await prawyKlikAparatu(page, q0.device_ref);
  await menuQ0.getByTestId('sld-menu-open-switch').click();
  await expect
    .poll(async () => ((await pobierzEnm(request, caseId)).branches ?? []).find((b) => b.ref_id === poleZajete.equipment_refs?.[0])?.status, { timeout: 30000 })
    .toBe('open');
  // Kontrola pozytywna detektora z kroku 4: jawna akcja menu wyłącznika DAJE dokładnie jedną
  // operację łączeniową — więc pusta lista po kliku i po menu odłącznika była pomiarem.
  expect(operacjeLaczeniowe).toHaveLength(1);
  await page.keyboard.press('Escape');
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await ustawMotyw(page, theme);
    await przyblizDoAparatu(page, q0.device_ref);
    await oczekujKafla(page, q0.device_ref, 'otwarty', `${klucz}: Q0 otwarty`);
    await oczekujKafla(page, q1.device_ref, 'zamkniety', `${klucz}: Q1 zamknięty`);
    await zrzut(page, `pole-z10-wylacznik-otwarty-${klucz}`, q0.device_ref, poleZajete, ['Q1', 'Q0', 'T1']);
  }

  // ---- 9. Q1 trójpołożeniowy: zamknięty → otwarty → uziemiony (przy otwartym Q0) -----------
  await polozenieZMenu(page, q1.device_ref, 'open-switch');
  await expect.poll(async () => polozenieAparatu(await pobierzEnm(request, caseId), q1.device_ref), { timeout: 30000 }).toBe('otwarty');
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await ustawMotyw(page, theme);
    await przyblizDoAparatu(page, q1.device_ref);
    await oczekujKafla(page, q1.device_ref, 'otwarty', `${klucz}: Q1 otwarty`);
    await oczekujKafla(page, q0.device_ref, 'otwarty', `${klucz}: Q0 otwarty`);
    await zrzut(page, `pole-z10-rozlaczone-${klucz}`, q1.device_ref, poleZajete, ['Q1', 'Q0', 'T1']);
  }
  await polozenieZMenu(page, q1.device_ref, 'earth-switch');
  await expect.poll(async () => polozenieAparatu(await pobierzEnm(request, caseId), q1.device_ref), { timeout: 30000 }).toBe('uziemiony');
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await ustawMotyw(page, theme);
    await przyblizDoAparatu(page, q1.device_ref);
    // Uziemiony: kolor odnosi się do toru głównego (decyzja właściciela 2026-10-30) — tor otwarty,
    // kafel zielony; nóż na zestyku uziemiającym, ziemia pod nim (UX04 §11.13).
    await oczekujKafla(page, q1.device_ref, 'otwarty', `${klucz}: Q1 uziemiony`);
    await expect(page.locator(`${KANWA} g[data-device-ref="${q1.device_ref}"] [data-qet-polozenie]`).first()).toHaveAttribute('data-qet-polozenie', 'earthed');
    await oczekujKafla(page, q0.device_ref, 'otwarty', `${klucz}: Q0 otwarty`);
    await zrzut(page, `pole-z10-wylacznik-otwarty-uziemiony-${klucz}`, q1.device_ref, poleZajete, ['Q1', 'Q0', 'T1']);
  }

  // ---- 10. Pole stałe odłączone i uziemione: Q0 otwarty → Q1 otwarty → Q8 zamknięty ----------
  // Iloczyn pomiaru kafli (§11.4): odłącznik OTWARTY i uziemnik ZAMKNIĘTY — glify innego kształtu
  // niż w krokach 5–6 (pomiar 2026-10-29: bieg mierzył odłącznik wyłącznie zamknięty i nieustalony,
  // uziemnik — otwarty i nieustalony). Kolejność z blokad (`enm/interlock_rules.py`): uziemnik
  // wyprowadzenia zamyka się przy potwierdzonym otwarciu łączników jego drogi do szyny.
  await polozenieZMenu(page, q0Staly.device_ref, 'open-switch');
  await polozenieZMenu(page, dsStaly.device_ref, 'open-switch');
  await expect.poll(async () => polozenieAparatu(await pobierzEnm(request, caseId), dsStaly.device_ref), { timeout: 30000 }).toBe('otwarty');
  await polozenieZMenu(page, esStaly.device_ref, 'close-switch');
  await expect.poll(async () => polozenieAparatu(await pobierzEnm(request, caseId), esStaly.device_ref), { timeout: 30000 }).toBe('zamkniety');
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await ustawMotyw(page, theme);
    await przyblizDoAparatu(page, esStaly.device_ref);
    await oczekujKafla(page, q0Staly.device_ref, 'otwarty', `${klucz}: Q0 pola stałego otwarty`);
    await oczekujKafla(page, dsStaly.device_ref, 'otwarty', `${klucz}: Q1 odłącznik otwarty`);
    await oczekujKafla(page, esStaly.device_ref, 'zamkniety', `${klucz}: Q8 uziemnik zamknięty`);
    await zrzut(page, `pole-z10-staly-odlaczony-uziemiony-${klucz}`, esStaly.device_ref, poleStalePo, ['Q1', 'Q0', 'Q8']);
  }
  oczekujPokryciaKlasSzerokosci('pole-z10-');
});

test('UX-04 — pole liniowe Z.11.1 GPZ: odgałęzienie przekładnika napięciowego od strony linii (oba motywy)', async ({ page, request }) => {
  test.setTimeout(900_000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const { caseId } = await otworzAplikacje(page, request, 'Z.11.1');

  // ---- 1. GPZ z menu tła — kreator źródła z wartościami domyślnymi --------------------------
  const { sekcjaA } = await wstawGpz(page, request, caseId);

  // ---- 2. Z.11.1 w pierwszym polu sekcji 1 — okno pola → „Zmień wyposażenie" → szablon ------
  let enm = await pobierzEnm(request, caseId);
  const poleZ11 = polaLiniowe(enm).find((p) => p.gpz_section_id === sekcjaA)!;
  expect(poleZ11, 'pole sekcji 1').toBeTruthy();
  await wrocNaSchemat(page);
  const menuZ11 = await prawyKlikAparatu(page, aparat(poleZ11, 'Q0').device_ref);
  await menuZ11.getByTestId('sld-menu-open-bay').click();
  await expect(page.getByTestId('bay-configurator-surface')).toBeVisible({ timeout: 30000 });
  // Karta pola i inspektor o TYM SAMYM obiekcie: akcja z menu aparatu zaznacza jego pole.
  await expect(page.getByTestId('inspektor-element-kanwy')).toHaveAttribute('data-element-id', poleZ11.ref_id, { timeout: 15000 });
  await page.getByTestId('wyposazenie-pola-edytuj').click();
  const szablon = page.getByTestId('wyposazenie-pola-szablon');
  await page.getByTestId('wyposazenie-pola-tryb').selectOption('szablon');
  await expect.poll(async () => szablon.locator(`option[value="${SZABLON_Z11_1}"]`).count(), { timeout: 30000 }).toBe(1);
  await szablon.selectOption(SZABLON_Z11_1);
  await page.getByTestId('wyposazenie-pola-zapisz').click();
  await expect
    .poll(async () => polaLiniowe(await pobierzEnm(request, caseId)).find((p) => p.ref_id === poleZ11.ref_id)?.bay_template_ref, { timeout: 60000 })
    .toBe(SZABLON_Z11_1);
  await expect(page.getByTestId('ocena-pola-liniowego')).toBeVisible({ timeout: 30000 });
  await zrzutyOknaPola(page, 'okno-pola-z11-1-trojpolozeniowy');

  enm = await pobierzEnm(request, caseId);
  const poleZ11Po = polaLiniowe(enm).find((p) => p.ref_id === poleZ11.ref_id)!;
  expect((poleZ11Po.primary_devices ?? []).map((d) => `${d.designation}:${d.kind}`)).toEqual([
    'PF0:VOLTAGE_INDICATOR',
    'Q1:THREE_POSITION_SWITCH',
    'Q0:CB',
    'Q5:THREE_POSITION_SWITCH',
    'GK1:CABLE_HEAD',
    'T3:VT',
    'T1:CT',
    'PF1:VOLTAGE_INDICATOR',
    'GK:CABLE_HEAD',
    'T2:CORE_BALANCE_CT',
  ]);


  const q0 = aparat(poleZ11Po, 'Q0');
  const q1 = aparat(poleZ11Po, 'Q1');
  const q5 = aparat(poleZ11Po, 'Q5');

  // ---- 2a. Stan wyjściowy po zmianie szablonu: kafel z rekordu położenia albo „?" bez rekordu ---
  await wrocNaSchemat(page);
  // Uziemiony = kafel otwarty: tor główny otwarty, nóż na zestyku uziemiającym (jedna tabela stanu
  // `glyphs.tsx::POLOZENIE_ZE_STANU`, UX04 §11.13).
  const stanKaflaZModelu = (polozenie: string | null): StanKafla =>
    polozenie === 'zamkniety' ? 'zamkniety' : polozenie === 'otwarty' || polozenie === 'uziemiony' ? 'otwarty' : 'nieustalony';
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await ustawMotyw(page, theme);
    await przyblizDoAparatu(page, q5.device_ref);
    // Q0 z napędem silnikowym M; przekładnik napięciowy T3 z TRZEMA uzwojeniami wtórnymi
    // z modelu (decyzja właściciela 2026-10-29 pkt 1); GK1, GK i T2 jako elementy toru.
    // Q1 z napędem zasobnikowym ręcznym, Q5 odgałęzienia bez napędu (rysunek s.91 w 400 dpi).
    for (const [ozn, symbol] of [
      ['Q0', 'qetBreakerZNapedem'],
      ['Q1', 'qetThreePositionSwitchZNapedem'],
      ['Q5', 'qetThreePositionSwitch'],
      ['T3', 'qetVoltageTransformer3'],
      ['GK1', 'qetCableHead'],
      ['GK', 'qetCableHead'],
      ['T2', 'qetCoreBalanceCt'],
    ] as const) {
      await expect(page.locator(`${KANWA} g[data-device-ref="${aparat(poleZ11Po, ozn).device_ref}"] [data-symbol-canon="${symbol}"]`), `${klucz}: ${ozn} → ${symbol}`).toHaveCount(1);
    }
    expect(aparat(poleZ11Po, 'T3').uzwojenia?.length, 'T3: trzy uzwojenia wtórne w modelu').toBe(3);
    expect(aparat(poleZ11Po, 'Q0').naped, 'Q0: napęd silnikowy w modelu').toBe('SILNIKOWY');
    expect(q1.naped, 'Q1: napęd zasobnikowy ręczny w modelu').toBe('ZASOBNIKOWY_RECZNY');
    expect(q5.naped ?? null, 'Q5: bez napędu w modelu').toBeNull();
    await oczekujKafla(page, q0.device_ref, 'zamkniety', `${klucz}: Q0 zamknięty (gałąź wyłącznika zamknięta)`);
    for (const a of [q1, q5]) {
      await oczekujKafla(page, a.device_ref, stanKaflaZModelu(polozenieAparatu(enm, a.device_ref)), `${klucz}: ${a.designation} wg rekordu położenia`);
    }
    await zrzut(page, `pole-z11-1-stan-wyjsciowy-${klucz}`, q0.device_ref, poleZ11Po, ['PF0', 'Q1', 'Q0', 'Q5', 'T3']);
  }

  // ---- 3. Położenia z menu aparatu: Q0 otwarty, Q1 uziemiony (przez otwarte), Q5 zamknięty ---
  await polozenieZMenu(page, q0.device_ref, 'open-switch');
  await expect
    .poll(async () => ((await pobierzEnm(request, caseId)).branches ?? []).find((b) => b.ref_id === poleZ11Po.equipment_refs?.[0])?.status, { timeout: 30000 })
    .toBe('open');
  if (polozenieAparatu(await pobierzEnm(request, caseId), q1.device_ref) === 'zamkniety') {
    // Łącznik trójpołożeniowy: zamknięty → uziemiony wyłącznie przez położenie otwarte.
    await polozenieZMenu(page, q1.device_ref, 'open-switch');
    await expect.poll(async () => polozenieAparatu(await pobierzEnm(request, caseId), q1.device_ref), { timeout: 30000 }).toBe('otwarty');
  }
  await polozenieZMenu(page, q1.device_ref, 'earth-switch');
  await expect.poll(async () => polozenieAparatu(await pobierzEnm(request, caseId), q1.device_ref), { timeout: 30000 }).toBe('uziemiony');
  await polozenieZMenu(page, q5.device_ref, 'close-switch');
  await expect.poll(async () => polozenieAparatu(await pobierzEnm(request, caseId), q5.device_ref), { timeout: 30000 }).toBe('zamkniety');
  enm = await pobierzEnm(request, caseId);

  // ---- 4. Rysunek pola na kanwie: PF0 przy szynie, kolumna Q5 → GK1 → T3 za wyłącznikiem, kafle -----
  for (const [klucz, theme] of [['ciemny', 'dark_scada'], ['jasny', 'light_technical']] as const) {
    await ustawMotyw(page, theme);
    await przyblizDoAparatu(page, q5.device_ref);
    for (const ozn of ['Q5', 'GK1', 'T3', 'PF0']) {
      await expect(page.locator(`${KANWA} g[data-device-ref="${aparat(poleZ11Po, ozn).device_ref}"]`), ozn).toHaveCount(1);
    }
    await oczekujKafla(page, q0.device_ref, 'otwarty', `${klucz}: Q0 otwarty`);
    // Uziemiony: kolor odnosi się do toru głównego (decyzja właściciela 2026-10-30) — tor otwarty,
    // kafel zielony; nóż na zestyku uziemiającym, ziemia pod nim (UX04 §11.13).
    await oczekujKafla(page, q1.device_ref, 'otwarty', `${klucz}: Q1 uziemiony`);
    await expect(page.locator(`${KANWA} g[data-device-ref="${q1.device_ref}"] [data-qet-polozenie]`).first()).toHaveAttribute('data-qet-polozenie', 'earthed');
    await oczekujKafla(page, q5.device_ref, 'zamkniety', `${klucz}: Q5 zamknięty`);
    await zrzut(page, `pole-z11-1-wylacznik-otwarty-uziemiony-${klucz}`, q5.device_ref, poleZ11Po, ['PF0', 'Q1', 'Q0', 'Q5', 'T3']);
  }
  oczekujPokryciaKlasSzerokosci('pole-z11-1-');
});
