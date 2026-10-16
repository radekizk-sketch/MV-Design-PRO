/**
 * E2E real-backend — transformator stacji SN/nN NA RYSUNKU także bez pola
 * roli TR (karta TR2W-BEZ-POLA; `docs/v12xx/REJESTR_KONFLIKTOW.md`, wiersz
 * BUGI-PRODUKTU-E2E).
 *
 * SKĄD DZIŚ BIERZE SIĘ TEN STAN („klasa B"). Od kanonu toru pola operacje
 * domenowe go nie wytwarzają: `insert_station_on_segment_sn` z transformatorem
 * sama dokłada pole roli TR (zacisk pola = strona górna transformatora), a
 * `add_transformer_sn_nn` na szynie z polami odmawia (`tor.field_missing`).
 * Transformator przyłączony wprost do szyny SN, bez pola TR, żyje WYŁĄCZNIE w
 * modelach zapisanych przed tą regułą — magazyn nie dokłada pola przy wczytaniu,
 * a rysunek (marker braku pola) i bramka gotowości (W041) nadal je obsługują.
 * Taki model trafia do aplikacji jedną realną drogą: importem archiwum projektu.
 *
 * FIKSTURA `fixtures/projekt-tr-bez-pola.mvdp.zip` powstaje narzędziem repo
 * `backend/tests/reference_networks/archiwum_tr_bez_pola.py`: te same operacje
 * domenowe co dawniej ten spec (`sn_fields: ['IN','OUT','FEEDER']`), zapadka
 * „operacje dokładają pole TR", przekształcenie do zapisu sprzed reguły toru
 * (bez rekordu pola TR, jego zacisku i wyłącznika; transformator na szynie SN
 * stacji) i pakowanie jedynym pakującym produktu (eksport archiwum z odciskami
 * integralności). Świeżość pilnuje
 * `backend/tests/application/project_archive/test_archiwum_tr_bez_pola.py`.
 *
 * Łańcuch ŻYWY: import archiwum → realny backend → realny adapter → realna
 * kanwa v3 → DOM. Bramki:
 *  (a) kanwa niesie symbol transformatora stacji, kluczowany REALNYM refem
 *      ENM (klik ma w co trafić),
 *  (b) transformator jest oznaczony jako stan NIEKOMPLETNY — marker przy
 *      stronie WN + zdanie w podpowiedzi („Brak skonfigurowanego pola
 *      transformatorowego SN"),
 *  (c) ZERO fabrykacji: przy transformatorze nie pojawia się aparatura pola,
 *      której dane nie niosą,
 *  (d) legenda „na żądanie" objaśnia transformator — bo jest on FAKTYCZNIE
 *      narysowany (treść legendy liczona ze sceny, nie ze słownika).
 *
 * Uruchomienie (WYŁĄCZNIE tak — patrz CLAUDE.md/karta):
 *   cd mv-design-pro/frontend && node ./scripts/playwright-run.mjs \
 *     e2e/tr2w-bez-pola.spec.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const ARCHIWUM = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'projekt-tr-bez-pola.mvdp.zip',
);
const TEKST_BRAKU_POLA = 'Brak skonfigurowanego pola transformatorowego SN';
let entityCounter = 0;

function nazwaProjektu(): string {
  entityCounter += 1;
  return `E2E TR bez pola ${Date.now().toString(36)}-${String(entityCounter).padStart(4, '0')}`;
}

type Kontekst = { projectId: string; caseId: string };

type Migawka = {
  transformers?: Array<{ ref_id?: string; hv_bus_ref?: string }>;
  substations?: Array<{ ref_id: string; bus_refs?: string[]; transformer_refs?: string[] }>;
  // Karta W5-B: pola stacji to rekordy `bays`.
  bays?: Array<{ ref_id: string; substation_ref?: string | null; bay_role?: string }>;
};

/** Aktywny przypadek zaimportowanego projektu — ten sam odczyt co ekran archiwum. */
async function aktywnyPrzypadek(request: APIRequestContext, projectId: string): Promise<string> {
  const odpowiedz = await request.get(`${BACKEND_BASE}/api/study-cases/project/${projectId}/active`);
  expect(odpowiedz.ok(), 'aktywny przypadek zaimportowanego projektu').toBeTruthy();
  return ((await odpowiedz.json()) as { id: string }).id;
}

/**
 * Import archiwum przez KOŃCÓWKĘ importu (`POST /api/projects/import`, multipart,
 * weryfikacja integralności domyślna) — dla testu bramki gotowości, który nie
 * otwiera strony: to ta sama końcówka, którą woła ekran archiwum (testy kanwy i
 * legendy importują przez ekran, `importujPrzezEkranArchiwum`).
 */
async function importujPrzezApi(request: APIRequestContext): Promise<Kontekst> {
  const odpowiedz = await request.post(`${BACKEND_BASE}/api/projects/import`, {
    multipart: {
      file: {
        name: 'projekt-tr-bez-pola.mvdp.zip',
        mimeType: 'application/zip',
        buffer: fs.readFileSync(ARCHIWUM),
      },
      new_name: nazwaProjektu(),
    },
    timeout: 30000,
  });
  expect(odpowiedz.ok()).toBeTruthy();
  const wynik = (await odpowiedz.json()) as { status: string; project_id: string | null; errors: string[] };
  expect(wynik.errors).toEqual([]);
  expect(wynik.status).toBe('SUCCESS');
  const projectId = wynik.project_id!;
  return { projectId, caseId: await aktywnyPrzypadek(request, projectId) };
}

/**
 * Import archiwum DROGĄ UŻYTKOWNIKA: ekran „Nowy / otwórz projekt" → „Archiwum
 * projektu (ZIP)" → wybór pliku → nazwa → „Importuj" → raport → „Otwórz
 * zaimportowany projekt" (ustawia aktywny projekt i przypadek w kontekście
 * aplikacji — natywne kliki, bez wstrzykiwania stanu), potem schemat.
 */
async function importujPrzezEkranArchiwum(page: Page): Promise<Kontekst> {
  // Rozmiar viewportu WPŁYWA na dobór poziomu szczegółu (ta sama, jedna
  // przyczyna co w `legenda-na-zadanie.spec.ts`): przy 1280×720 mała sieć
  // referencyjna mieści się w kadrze na poziomie „Przegląd sieci" (stacja jako
  // symbol ZBIORCZY — zero aparatury pola i zero transformatora W KAŻDYM
  // wariancie danych). 1600×900 daje pełny szczegół bloku stacji.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await page.getByTestId('mvd-projekty-droga-archiwum').click();
  await expect(page.getByTestId('mvd-archiwum-projektu')).toBeVisible({ timeout: 15000 });

  await page.getByTestId('mvd-arch-plik').setInputFiles(ARCHIWUM);
  await page.getByTestId('mvd-arch-nazwa').fill(nazwaProjektu());
  const [odpowiedzImportu] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/api/projects/import') && r.request().method() === 'POST',
      { timeout: 30000 },
    ),
    page.getByTestId('mvd-arch-import').click(),
  ]);
  expect(odpowiedzImportu.status()).toBe(200);
  const wynik = (await odpowiedzImportu.json()) as { status: string; project_id: string | null };
  expect(wynik.status).toBe('SUCCESS');
  const projectId = wynik.project_id!;
  await expect(page.getByTestId('mvd-arch-raport')).toHaveAttribute('data-wariant', 'ok');

  await page.getByTestId('mvd-arch-otworz').click();
  await expect(page.getByTestId('mvd-archiwum-projektu')).toHaveCount(0);
  const caseId = await aktywnyPrzypadek(page.request, projectId);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const surowy = localStorage.getItem('mv-design-app-state');
        if (!surowy) return null;
        const stan = (
          JSON.parse(surowy) as { state?: { activeProjectId?: string | null; activeCaseId?: string | null } }
        ).state;
        return stan?.activeProjectId && stan?.activeCaseId ? `${stan.activeProjectId}|${stan.activeCaseId}` : null;
      }),
    )
    .toBe(`${projectId}|${caseId}`);

  await page.goto('/#sld', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 30000 });
  return { projectId, caseId };
}

/**
 * ZAPADKA NA FIKSTURĘ (po imporcie, na modelu, który czyta cała aplikacja):
 * stacja MA transformator i NIE MA pola roli TR. Bez niej spec mógłby przejść
 * na archiwum, które wcale nie niesie klasy B (np. po regeneracji bez
 * przekształcenia albo gdyby wczytanie modelu zaczęło dokładać pole TR).
 *
 * Zwraca ref transformatora Z MODELU — asercje kanwy sprawdzają, że rysunek
 * kluczuje symbol TYM refem, a nie identyfikatorem wymyślonym przez renderer.
 */
async function zapadkaKlasyB(request: APIRequestContext, caseId: string): Promise<{ transformerRef: string }> {
  const odpowiedz = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(odpowiedz.ok(), 'model zaimportowanego projektu').toBeTruthy();
  const enm = (await odpowiedz.json()) as Migawka;

  const station = (enm.substations ?? []).find((s) => s.ref_id.includes('/station'));
  expect(station, 'stacja SN/nN w modelu').toBeTruthy();
  const role = (enm.bays ?? [])
    .filter((f) => f.substation_ref === station!.ref_id)
    .map((f) => String(f.bay_role ?? '').toUpperCase());
  expect(role.length, 'stacja ma pola SN').toBeGreaterThan(0);
  expect(role, 'pola stacji NIE mogą zawierać roli TR — inaczej spec nie ćwiczy klasy B').not.toContain('TR');

  // Transformator STACJI, nie GPZ: sieć ma DWA transformatory (GPZ WN/SN +
  // stacyjny SN/nN), więc wybór idzie po `Substation.transformer_refs` tej
  // stacji, a nie po dopasowaniu podciągu do refu.
  const stacyjneRefy = new Set(station!.transformer_refs ?? []);
  expect(stacyjneRefy.size, 'stacja deklaruje transformator').toBeGreaterThan(0);
  const transformator = (enm.transformers ?? []).find((t) => stacyjneRefy.has(String(t.ref_id ?? '')));
  expect(transformator?.ref_id, 'transformator stacji w modelu').toBeTruthy();
  // Strona WN wprost na szynie SN stacji (kształt zapisu sprzed reguły toru) —
  // kotwica topologiczna kolumny na rysunku.
  expect(station!.bus_refs ?? [], 'strona WN transformatora na szynie stacji').toContain(
    transformator!.hv_bus_ref,
  );

  return { transformerRef: transformator!.ref_id! };
}

test.describe('Transformator SN/nN na rysunku BEZ pola roli TR', () => {
  test.setTimeout(120000);

  test('bramka gotowosci widzi ten sam brak co rysunek i zamyka droge do dokumentacji wykonawczej', async ({
    request,
  }) => {
    // KOMPLETNOSC-POLA-TR: ta sama siec (klasa B — CELOWO bez pola TR) przechodzi
    // przez DRUGI konsument predykatu: bramke gotowosci inzynierskiej. Reszta
    // tego specu dowodzi, ze RYSUNEK pokazuje brak; ten test dowodzi, ze
    // GOTOWOSC go zglasza — parytet marker<->ostrzezenie na ZYWYM backendzie,
    // nie tylko w tablicy decyzyjnej testow jednostkowych.
    const { caseId } = await importujPrzezApi(request);
    const { transformerRef } = await zapadkaKlasyB(request, caseId);

    const odpowiedz = await request.get(
      `${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`,
    );
    expect(odpowiedz.ok(), 'endpoint gotowosci inzynierskiej').toBeTruthy();
    const dane = (await odpowiedz.json()) as {
      ready?: boolean;
      issues?: Array<{
        code?: string;
        severity?: string;
        element_refs?: string[];
        canonical_code?: string;
        canonical_level?: string;
        message_pl?: string;
      }>;
    };

    const zgloszenie = (dane.issues ?? []).find((i) => i.code === 'W041');
    expect(zgloszenie, 'ostrzezenie o braku pola transformatorowego').toBeTruthy();
    expect(zgloszenie!.canonical_code).toBe('transformer.bay_missing');
    expect(zgloszenie!.canonical_level).toBe('WARNING');
    expect(zgloszenie!.element_refs).toContain(transformerRef);
    expect(zgloszenie!.message_pl).toContain('pola transformatorowego');

    // NIE blokuje obliczen: poziom IMPORTANT, nie BLOCKER — model pozostaje
    // policzalny (karta: „NIE blokuje pracy koncepcyjnej, NIE blokuje obliczen").
    expect(zgloszenie!.severity).toBe('IMPORTANT');
    const blokery = (dane.issues ?? []).filter((i) => i.severity === 'BLOCKER');
    expect(blokery.map((i) => i.code)).not.toContain('W041');
  });

  test('(a)(b)(c) symbol widoczny, kluczowany realnym refem, oznaczony jako stan niekompletny, bez fabrykowanej aparatury', async ({
    page,
    request,
  }) => {
    const { caseId } = await importujPrzezEkranArchiwum(page);
    const { transformerRef } = await zapadkaKlasyB(request, caseId);

    const canvas = page.getByTestId('sld-canvas-v3');

    // (a) Symbol transformatora stacji NA KANWIE, kluczowany REALNYM refem
    // z migawki ENM (nie identyfikatorem wymyślonym przez renderer).
    const transformator = canvas.locator(`g[data-owner-ref="${transformerRef}"]`);
    await expect(transformator).toHaveCount(1, { timeout: 30000 });
    await expect(transformator).toHaveAttribute('data-element-kind', 'transformer');

    // (b) Stan NIEKOMPLETNY jawny: znacznik audytu + marker rysunkowy w grupie
    // symbolu + pełne zdanie w bloku stacji.
    await expect(transformator).toHaveAttribute('data-transformer-field-gap', 'true');
    await expect(transformator.locator('g[data-field-gap-warning="true"]')).toHaveCount(1);

    // Pełne ZDANIE stanu żyje w PODPOWIEDZI obiektu (natywny `<title>` SVG na
    // kształcie trafienia — tym, który odbiera wskazanie kursorem), a NIE jako
    // etykieta rysunku: pomiar pokazał, że wiersz pasma nazw z tym zdaniem
    // (239 j.św.) dyktował szerokość kolumny każdej stacji bez pola TR i
    // zdejmował skalę „Dopasuj widok" poniżej progów bramek KD-11/K11-A.
    // Sprawdzamy więc, że podpowiedź ISTNIEJE w wyrenderowanym drzewie i wisi
    // na kształcie trafienia TEGO transformatora (nie na grupie rysunkowej,
    // gdzie byłaby kontrolką-widmem — warstwa trafień leży nad rysunkiem).
    const uchwyt = canvas.locator(`[data-hit-owner-ref="${transformerRef}"]`);
    await expect(uchwyt.first()).toBeAttached();
    await expect(uchwyt.locator('title', { hasText: TEKST_BRAKU_POLA }).first()).toBeAttached();

    // …a marker NIE znika przy zmianie poziomu szczegółu (§0.C.8: transformator
    // bez pola żyje na TYCH SAMYCH poziomach co transformator z polem).
    // Ta sama mechanika kadrowania co `kd11-zrzuty-screenshot.spec.ts`.
    const symbolBox = await transformator.boundingBox();
    const kadr = (await canvas.boundingBox())!;
    const kursor = symbolBox
      ? { x: symbolBox.x + symbolBox.width / 2, y: symbolBox.y + symbolBox.height / 2 }
      : { x: kadr.x + kadr.width / 2, y: kadr.y + kadr.height / 2 };
    await page.mouse.move(kursor.x, kursor.y);
    let poziom = await canvas.getAttribute('data-scene-lod');
    for (let krok = 0; krok < 12 && poziom !== '2'; krok++) {
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(150);
      poziom = await canvas.getAttribute('data-scene-lod');
    }
    await expect(canvas).toHaveAttribute('data-scene-lod', '2');
    await expect(canvas.locator('g[data-field-gap-warning="true"]')).toHaveCount(1);
    // Podpowiedź żyje także na pełnym szczególe (kontrakt niezależny od kadru).
    await expect(
      canvas.locator(`[data-hit-owner-ref="${transformerRef}"] title`).first(),
    ).toHaveText(TEKST_BRAKU_POLA);
    // ZERO tekstu adnotacji na samym rysunku — to jest rozstrzygnięcie karty
    // (treść w podpowiedzi, sygnał na rysunku), więc jest przypięte, nie
    // pozostawione przypadkowi.
    const napisy = await canvas.locator('text').allTextContents();
    expect(napisy.some((t) => t.includes('skonfigurowanego pola'))).toBe(false);

    // (c) ZERO fabrykacji: pod refem transformatora nie ma ŻADNEGO innego
    // obiektu rysunku — żadnego wyłącznika, rozłącznika, bezpiecznika, CT, VT,
    // uziemnika ani zabezpieczenia, których dane nie niosą.
    const podRefem = await canvas
      .locator(`g[data-owner-ref="${transformerRef}"]`)
      .evaluateAll((nodes) =>
        nodes.flatMap((n) =>
          Array.from(n.querySelectorAll('g[data-symbol-canon]')).map((g) =>
            g.getAttribute('data-symbol-canon'),
          ),
        ),
      );
    expect(podRefem).toEqual(['transformer2W']);
  });

  test('(d) legenda „na żądanie" objaśnia transformator — bo jest FAKTYCZNIE narysowany', async ({
    page,
    request,
  }) => {
    const { caseId } = await importujPrzezEkranArchiwum(page);
    await zapadkaKlasyB(request, caseId);

    // Klik NATYWNY (Zero-Debt pkt 5: test interakcji zaczyna od ścieżki
    // natywnej, nie od syntetycznego zdarzenia).
    await page.getByTestId('sld-v3-legend-toggle').click();

    const panel = page.getByTestId('sld-v3-legend-panel');
    await expect(panel).toBeVisible();
    // Treść legendy liczona z FAKTYCZNIE narysowanej sceny — wpis
    // transformatora może się pojawić WYŁĄCZNIE wtedy, gdy symbol jest na
    // rysunku. To ta sama asercja, która przed tą kartą była nieosiągalna dla
    // sieci bez pola TR.
    await expect(panel.getByTestId('sld-v3-legend-panel-item-transformer2W')).toBeVisible();
    // Negatyw (zero fabrykacji): sieć nie ma źródła DER — wpis nie ma prawa się
    // pojawić, więc legenda naprawdę filtruje po scenie, a nie pokazuje słownika.
    await expect(panel.getByTestId('sld-v3-legend-panel-item-derPv')).toHaveCount(0);
  });
});
