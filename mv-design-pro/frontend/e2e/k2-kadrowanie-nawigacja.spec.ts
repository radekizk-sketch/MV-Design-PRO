/**
 * KARTY K2 KADROWANIE-NAWIGACJA i K2b KADR-I-WIDOK-ROBOCZY — kadrowanie zakresu pracy na
 * REALNYM backendzie, ścieżką NATYWNĄ (kliki, dwukliki i klawisze Playwrighta w żywej
 * aplikacji, bez zdarzeń syntetycznych).
 *
 * Co spec dowodzi (kryteria ukończenia kart):
 *  1. K2b §0.1–0.2 — dwuklik każdej z czterech stacji (przelotowa, sekcyjna, końcowa,
 *     odgałęźna): (a) stacja CAŁA w widocznej części kanwy (pod paskiem narzędzi
 *     i mini-ścieżką); (b) kanwa nie ukrywa żadnego opisu celu
 *     (`data-ukryte-opisy-celu="0"`); (c) zbiór stacji WIDOCZNYCH (rysunek w obszarze,
 *     NIEprzyciemniony kurtyną kadru) = {cel}; (d) viewBox i zbiór widocznych `ownerRef`
 *     różnią się dla KAŻDEJ pary stacji (wada Z-02: dawniej dwa kadry identyczne co do
 *     piksela);
 *  2. poprzednia/następna stacja w porządku rysunku zmienia obraz (viewBox i zrzut);
 *  3. K2b §0.3 — zaznaczony odcinek → dwuklik stacji → następna ×2 → „Sieć": viewBox
 *     i zaznaczenie (parametr `sel` adresu) jak przed dwuklikiem; przegląd stacji to
 *     jeden wpis powrotu;
 *  4. pole z drzewa („Pola GPZ") + „Dopasuj widok" — kadr pola; „Wstecz" i Alt+←
 *     przywracają DOKŁADNIE poprzedni kadr (viewBox);
 *  5. tor zasilania z menu „Dopasuj do…" — odpowiedź backendu `…/enm/topologia/tor`;
 *  6. klik problemu w przestrzeni „Gotowość" i w zakładce „Problemy" panelu dolnego —
 *     przejście na schemat, zaznaczenie i kadr elementu;
 *  7. K2b §0.4 — widok roboczy całej sieci: brak ramy arkusza w DOM, punkt normalnie
 *     otwarty ma symbol, odcinek napowietrzny jest przerywany (odcinek napowietrzny i NOP
 *     dokłada SPEC operacjami domenowymi — wspólny seed `siecKadrowStacji.ts` bez zmian);
 *     tryb arkusza z paska kanwy i z menu „Widok": rama obecna, tryb utrwalony po
 *     przeładowaniu.
 *
 * Zrzuty 1440×900 w obu motywach (materiał oceny właściciela, bramka B-02; spec NIE ocenia
 * wyglądu): sieć, magistrala, cztery stacje, następna stacja, pole, tor, problem z
 * gotowości, tor z gotowości, widok roboczy i arkusz. Katalog: `docs/uiux/zrzuty/k2-kadrowanie`
 * przez `katalogZrzutow` (bez jawnego odświeżania dokumentacji bieg pisze do
 * `test-results/zrzuty-dokumentacji/…`).
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { katalogZrzutow } from './katalogZrzutow';
import { BACKEND_BASE, otworzAplikacje, polaStacjiEnm, siecKadrow, STACJE, ustawMotyw, type Enm } from './siecKadrowStacji';

const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'k2-kadrowanie'));
const SZEROKOSC = 1440;
const WYSOKOSC = 900;

type Prostokat = { left: number; top: number; right: number; bottom: number };
interface PomiarKadru {
  readonly kanwa: Prostokat;
  readonly obszar: Prostokat;
  readonly stacja: Prostokat | null;
  /** Stacje, których rysunek (odcinek, symbol, etykieta) leży w obszarze i NIE jest
   *  przyciemniony kurtyną kadru (`data-kadr="poza"`). */
  readonly widoczneStacje: readonly string[];
  /** `ownerRef` rysunku w obszarze, nieprzyciemnionego (posortowane). */
  readonly widoczneOwnerRef: readonly string[];
  readonly ukryteOpisyCelu: string | null;
}
/**
 * Refy rysunku każdej stacji — z PÓL REKORDÓW modelu zwróconego przez backend (szyny,
 * transformatory, pola i ich aparaty) oraz przedrostka identyfikatora stacji (obiekty
 * budowane razem ze stacją). Wyrocznia niezależna od frontu: nie importuje `zakresKadru`.
 */
function refyStacji(enm: Enm): Record<string, { readonly refy: readonly string[]; readonly przedrostek: string }> {
  const wynik: Record<string, { refy: string[]; przedrostek: string }> = {};
  for (const s of enm.substations ?? []) {
    const rekord = s as { ref_id: string; bus_refs?: string[]; transformer_refs?: string[] };
    const pola = polaStacjiEnm(enm, s.ref_id) as Array<{ ref_id: string; equipment_refs?: string[] }>;
    wynik[s.ref_id] = {
      refy: [
        s.ref_id,
        ...(rekord.bus_refs ?? []),
        ...(rekord.transformer_refs ?? []),
        ...pola.flatMap((p) => [p.ref_id, ...(p.equipment_refs ?? [])]),
      ],
      przedrostek: s.ref_id.slice(0, s.ref_id.lastIndexOf('/') + 1),
    };
  }
  return wynik;
}

/**
 * Pomiar kadru w przeglądarce: prostokąt stacji z obrysów trafień
 * (`data-hit-role="obrys"`), obszar widoczny (kanwa pod paskiem narzędzi i mini-ścieżką)
 * oraz zbiór stacji i `ownerRef` WIDOCZNYCH: element rysunku warstw odcinków, symboli
 * i etykiet z `data-owner-ref`, o niezerowym prostokącie przecinającym obszar, bez
 * przodka `data-kadr="poza"`.
 */
async function zmierzKadr(page: Page, enm: Enm, stacjaRef: string): Promise<PomiarKadru> {
  return page.evaluate(
    ({ stacje, cel }) => {
      const root = document.querySelector('svg[data-testid="sld-canvas-v3"]')!;
      const svg = root.getBoundingClientRect();
      const kanwa = { left: svg.left, top: svg.top, right: svg.right, bottom: svg.bottom };
      let gora = svg.top;
      for (const id of ['sld-v3-fit-view', 'sld-v3-sciezka-kadru']) {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (el) gora = Math.max(gora, el.getBoundingClientRect().bottom);
      }
      let prawa = svg.right;
      for (const id of ['lv-domain-portal-drawer']) {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (el) prawa = Math.min(prawa, el.getBoundingClientRect().left);
      }
      const obszar = { ...kanwa, top: gora, right: prawa };
      const wlascicielStacji = (ownerRef: string): string | undefined => {
        const baza = ownerRef.split('#')[0];
        return Object.keys(stacje).find((ref) => stacje[ref].refy.includes(baza) || baza.startsWith(stacje[ref].przedrostek));
      };
      const przecina = (r: DOMRect) =>
        r.width + r.height > 0 && r.right > obszar.left && r.left < obszar.right && r.bottom > obszar.top && r.top < obszar.bottom;
      let stacja: { left: number; top: number; right: number; bottom: number } | null = null;
      for (const el of Array.from(document.querySelectorAll('[data-hit-role="obrys"][data-hit-owner-ref]'))) {
        if (wlascicielStacji(el.getAttribute('data-hit-owner-ref') ?? '') !== cel) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        stacja = stacja
          ? { left: Math.min(stacja.left, r.left), top: Math.min(stacja.top, r.top), right: Math.max(stacja.right, r.right), bottom: Math.max(stacja.bottom, r.bottom) }
          : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }
      const widoczneStacje = new Set<string>();
      const widoczneOwnerRef = new Set<string>();
      const warstwy = ['sld-v3-segments', 'sld-v3-symbols', 'sld-v3-labels'];
      for (const w of warstwy) {
        for (const el of Array.from(root.querySelectorAll(`[data-testid="${w}"] [data-owner-ref]`))) {
          if (el.closest('[data-kadr="poza"]')) continue;
          if (!przecina(el.getBoundingClientRect())) continue;
          const owner = el.getAttribute('data-owner-ref') ?? '';
          widoczneOwnerRef.add(owner);
          const st = wlascicielStacji(owner);
          if (st) widoczneStacje.add(st);
        }
      }
      return {
        kanwa,
        obszar,
        stacja,
        widoczneStacje: [...widoczneStacje].sort(),
        widoczneOwnerRef: [...widoczneOwnerRef].sort(),
        ukryteOpisyCelu: root.getAttribute('data-ukryte-opisy-celu'),
      };
    },
    { stacje: refyStacji(enm), cel: stacjaRef },
  );
}

/** Parametr zaznaczenia adresu (`sel`, routing hash — `ui/navigation/urlState.ts`). */
function zaznaczenieZAdresu(url: string): string | null {
  const hash = new URL(url).hash;
  const q = hash.indexOf('?');
  return q < 0 ? null : new URLSearchParams(hash.slice(q + 1)).get('sel');
}

let licznikOperacji = 0;
/** Operacja domenowa na REALNYM backendzie (te same reguły co w seedzie). */
async function operacja(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<Enm & { corridors?: Array<{ ref_id: string; no_point_ref?: string | null }> }> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: { name, idempotency_key: `k2b-${caseId}-${String(++licznikOperacji).padStart(4, '0')}`, payload },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { error?: string | null; snapshot?: Enm };
  expect(body.error ?? null).toBeNull();
  return body.snapshot ?? {};
}

const viewBox = (page: Page) => page.locator('svg[data-testid="sld-canvas-v3"]').getAttribute('viewBox');

/** Kadr ustalony: dwa kolejne odczyty viewBox w odstępie 300 ms są równe (kamera nie animuje). */
async function kadrUstalony(page: Page): Promise<string | null> {
  let poprzedni = await viewBox(page);
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(300);
    const biezacy = await viewBox(page);
    if (biezacy === poprzedni) return biezacy;
    poprzedni = biezacy;
  }
  return poprzedni;
}

async function etykietySciezki(page: Page): Promise<string[]> {
  return page.getByTestId('sld-v3-sciezka-kadru').locator('[data-testid^="sld-v3-sciezka-"]').allTextContents();
}

async function wrocDoSieci(page: Page): Promise<void> {
  await page.keyboard.press('Shift+F');
  await expect(page.getByTestId('sld-v3-sciezka-kadru')).toHaveCount(0);
  await kadrUstalony(page);
}

async function dwuklikStacji(page: Page, ref: string): Promise<void> {
  const uchwyt = page.locator(`[data-hit-role="obrys"][data-hit-owner-ref^="${ref}#name-row"]`).first();
  await expect(uchwyt).toHaveCount(1, { timeout: 30000 });
  await uchwyt.dblclick();
}

async function zrzut(page: Page, nazwa: string, motyw: string): Promise<void> {
  await page.screenshot({ path: resolve(KATALOG, `k2-${nazwa}-${motyw}.png`) });
}

for (const motyw of [
  { klucz: 'ciemny', theme: 'dark_scada' as const },
  { klucz: 'jasny', theme: 'light_technical' as const },
]) {
  test(`K2 — kadrowanie zakresu pracy i nawigacja sieć → stacja → pole (${motyw.klucz})`, async ({ page, request }) => {
    test.setTimeout(900000);
    mkdirSync(KATALOG, { recursive: true });
    const seed = await siecKadrow(request);
    const refStacji = new Map((seed.enm.substations ?? []).map((s) => [String(s.name), s.ref_id] as const));
    // K2b §0.4: odcinek NAPOWIETRZNY (odgałęzienie z wolnego pola odgałęźnego stacji
    // przelotowej) i punkt normalnie otwarty na nim — operacjami domenowymi tego speku,
    // wspólny seed zostaje bez zmian.
    const wolnePole = polaStacjiEnm(seed.enm, refStacji.get('Stacja Przelotowa'))
      .filter((f) => f.bay_role === 'FEEDER')
      .map((f) => f.ref_id)[0];
    expect(wolnePole, 'wolne pole odgałęźne stacji przelotowej').toBeTruthy();
    let enm = await operacja(request, seed.caseId, 'start_branch_segment_sn', {
      from_ref: `${wolnePole}.BRANCH`,
      segment: {
        rodzaj: 'LINIA_NAPOWIETRZNA',
        dlugosc_m: 300,
        catalog_binding: { catalog_namespace: 'LINIA_SN', catalog_item_id: 'line-base-al-st-70', catalog_item_version: '2024.1' },
        name: 'Linia napowietrzna 1',
      },
    });
    const napowietrzna = (enm.branches ?? []).find((b) => b.name === 'Linia napowietrzna 1');
    expect(napowietrzna?.type, 'odcinek napowietrzny w modelu').toBe('line_overhead');
    enm = await operacja(request, seed.caseId, 'set_normal_open_point', { segment_ref: napowietrzna!.ref_id });
    expect(
      (enm as { corridors?: Array<{ no_point_ref?: string | null }> }).corridors?.some((c) => c.no_point_ref === napowietrzna!.ref_id),
      'NOP zapisany w korytarzu',
    ).toBe(true);
    await otworzAplikacje(page, seed);
    await page.setViewportSize({ width: SZEROKOSC, height: WYSOKOSC });
    await ustawMotyw(page, motyw.theme);
    await page.getByRole('button', { name: /^Schemat \(SLD\)/ }).first().click();
    await expect(page.getByTestId('sld-canvas-v3')).toBeVisible();

    // (0) Sieć — Shift+F: kadr całej sieci, bez mini-ścieżki.
    await wrocDoSieci(page);
    const kadrSieci = await viewBox(page);
    await zrzut(page, 'siec', motyw.klucz);

    // (1) Magistrala z menu „Dopasuj do…".
    await page.getByTestId('sld-v3-dopasuj-do-toggle').click();
    await page.getByTestId('sld-v3-dopasuj-do-magistrala').click();
    await expect.poll(() => etykietySciezki(page)).toEqual(['Sieć', 'Magistrala']);
    await kadrUstalony(page);
    expect(await viewBox(page), 'kadr magistrali różni się od kadru sieci').not.toBe(kadrSieci);
    await zrzut(page, 'magistrala', motyw.klucz);

    // (2) K2b §0.1–0.2 — dwuklik stacji, cztery drogi budowy. Kryteria (a) kompletność,
    // (b) zero ukrytych opisów celu, (c) widoczne stacje = {cel}, (d) rozróżnialność par.
    const kadry: Array<{ readonly nazwa: string; readonly viewBox: string | null; readonly ownerRef: string }> = [];
    for (const stacja of STACJE) {
      const ref = refStacji.get(stacja.nazwa)!;
      expect(ref, `stacja ${stacja.nazwa} w modelu`).toBeTruthy();
      await wrocDoSieci(page);
      await dwuklikStacji(page, ref);
      await expect(page.getByTestId('sld-v3-sciezka-1')).toHaveText(stacja.nazwa, { timeout: 10000 });
      await expect(page.getByTestId('sld-canvas-v3')).not.toHaveAttribute('data-scene-lod', '0');
      const vb = await kadrUstalony(page);
      const pomiar = await zmierzKadr(page, enm, ref);
      console.log(`K2b pomiar ${stacja.plik} ${motyw.klucz}: ${JSON.stringify({ ...pomiar, widoczneOwnerRef: pomiar.widoczneOwnerRef.length })}`);
      const s = pomiar.stacja!;
      expect(s, `${stacja.nazwa}: obrysy stacji na kanwie`).not.toBeNull();
      expect(s.left, `${stacja.nazwa}: (a) lewa krawędź w kadrze`).toBeGreaterThanOrEqual(pomiar.obszar.left - 0.5);
      expect(s.right, `${stacja.nazwa}: (a) prawa krawędź w kadrze`).toBeLessThanOrEqual(pomiar.obszar.right + 0.5);
      expect(s.top, `${stacja.nazwa}: (a) górna krawędź pod paskiem narzędzi i ścieżką`).toBeGreaterThanOrEqual(pomiar.obszar.top - 0.5);
      expect(s.bottom, `${stacja.nazwa}: (a) dolna krawędź w kadrze`).toBeLessThanOrEqual(pomiar.obszar.bottom + 0.5);
      expect(pomiar.ukryteOpisyCelu, `${stacja.nazwa}: (b) ukryte opisy celu`).toBe('0');
      expect(pomiar.widoczneStacje, `${stacja.nazwa}: (c) widoczne stacje = {cel}`).toEqual([ref]);
      // (b) komunikat ukrytych opisów (jeśli jest) mówi wyłącznie o opisach SPOZA celu.
      const hint = page.getByTestId('sld-v3-hidden-labels-hint');
      if ((await hint.count()) > 0 && Number(await hint.getAttribute('data-hidden-count')) > 0) {
        await expect(hint, `${stacja.nazwa}: komunikat o opisach poza celem`).toHaveText(/poza celem kadru — opisy celu widoczne w całości$/);
        expect(await hint.getAttribute('data-opisy-celu')).toBeNull();
      }
      kadry.push({ nazwa: stacja.nazwa, viewBox: vb, ownerRef: pomiar.widoczneOwnerRef.join('|') });
      await zrzut(page, `stacja-${stacja.plik}`, motyw.klucz);
    }
    for (let i = 0; i < kadry.length; i += 1) {
      for (let j = i + 1; j < kadry.length; j += 1) {
        expect(kadry[i].viewBox, `(d) viewBox ${kadry[i].nazwa} ≠ ${kadry[j].nazwa}`).not.toBe(kadry[j].viewBox);
        expect(kadry[i].ownerRef, `(d) widoczne ownerRef ${kadry[i].nazwa} ≠ ${kadry[j].nazwa}`).not.toBe(kadry[j].ownerRef);
      }
    }

    // (3) Poprzednia/następna stacja zmienia obraz; K2b §0.3: zaznaczony odcinek →
    // dwuklik stacji → następna ×2 → „Sieć" przywraca kadr sieci i zaznaczenie odcinka.
    await wrocDoSieci(page);
    const odcinek2 = (enm.branches ?? []).find((b) => b.name === 'Odcinek 2')!;
    expect(odcinek2, 'Odcinek 2 magistrali').toBeTruthy();
    const obrysOdcinka = page.locator(`[data-hit-role="obrys"][data-hit-klasa="tor"][data-hit-owner-ref^="${odcinek2.ref_id}"]`).first();
    await expect(obrysOdcinka).toHaveCount(1, { timeout: 30000 });
    // Klik NATYWNY w punkt LEŻĄCY na trasie odcinka (trasa łamana: środek jej prostokąta
    // nie leży na kresce) — pierwszy punkt trasy, w którym obszar trafienia jest na wierzchu.
    const punkt = await obrysOdcinka.evaluate((el) => {
      const sciezka = el as SVGPathElement;
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
    await page.mouse.click(punkt!.x, punkt!.y);
    await expect.poll(() => zaznaczenieZAdresu(page.url()), { timeout: 10000 }).toBe(odcinek2.ref_id);
    const zaznaczeniePrzed = zaznaczenieZAdresu(page.url());
    // Kadr sieci w BIEŻĄCYM układzie okna (zaznaczenie otwiera inspektor po prawej).
    const kadrSieciZInspektorem = await kadrUstalony(page);
    await dwuklikStacji(page, refStacji.get('Stacja Przelotowa')!);
    await expect(page.getByTestId('sld-v3-sciezka-1')).toHaveText('Stacja Przelotowa');
    const licznik = (await page.getByTestId('sld-v3-stacja-licznik').textContent()) ?? '';
    const [numer, wszystkie] = licznik.split('/').map(Number);
    expect(wszystkie).toBe(5);
    expect(numer + 2, 'dwie następne stacje w porządku rysunku').toBeLessThanOrEqual(wszystkie);
    let kadrPoprzedni = await kadrUstalony(page);
    let obrazPoprzedni = await page.locator('svg[data-testid="sld-canvas-v3"]').screenshot();
    for (const krok of [1, 2]) {
      await page.getByTestId('sld-v3-stacja-nastepna').click();
      await expect(page.getByTestId('sld-v3-stacja-licznik')).toHaveText(`${numer + krok}/${wszystkie}`);
      const kadr = await kadrUstalony(page);
      const obraz = await page.locator('svg[data-testid="sld-canvas-v3"]').screenshot();
      expect(kadr, `następna stacja (krok ${krok}) zmienia viewBox`).not.toBe(kadrPoprzedni);
      expect(obraz.equals(obrazPoprzedni), `następna stacja (krok ${krok}) zmienia obraz`).toBe(false);
      kadrPoprzedni = kadr;
      obrazPoprzedni = obraz;
    }
    await zrzut(page, 'stacja-nastepna', motyw.klucz);
    await page.getByTestId('sld-v3-stacja-poprzednia').click();
    await expect(page.getByTestId('sld-v3-stacja-licznik')).toHaveText(`${numer + 1}/${wszystkie}`);
    await page.getByTestId('sld-v3-stacja-nastepna').click();
    // Poziom „Sieć" mini-ścieżki: kadr i zaznaczenie sprzed dwukliku.
    await page.getByTestId('sld-v3-sciezka-0').click();
    await expect(page.getByTestId('sld-v3-sciezka-kadru')).toHaveCount(0);
    expect(await kadrUstalony(page), '„Sieć": viewBox sprzed dwukliku').toBe(kadrSieciZInspektorem);
    expect(zaznaczenieZAdresu(page.url()), '„Sieć": zaznaczenie sprzed dwukliku').toBe(zaznaczeniePrzed);

    // (4) Pole z drzewa („Pola GPZ") + „Dopasuj widok"; potem „Wstecz" i Alt+←.
    const gpz = (seed.enm.substations ?? []).find((s) => s.station_type === 'gpz')!;
    const poleGpz = polaStacjiEnm(seed.enm, gpz.ref_id)[0]!;
    const wiersz = page.getByTestId('project-tree').getByTestId(`model-tree-row-${poleGpz.ref_id}`);
    await expect(wiersz).toBeVisible({ timeout: 30000 });
    await wiersz.click();
    await kadrUstalony(page);
    const kadrPrzedPolem = await viewBox(page);
    await page.getByTestId('sld-v3-fit-view').click();
    await expect.poll(async () => (await etykietySciezki(page))[0]).toBe('Sieć');
    const sciezkaPola = await etykietySciezki(page);
    expect(sciezkaPola).toContain(gpz.name);
    expect(sciezkaPola[sciezkaPola.length - 1]).toMatch(/^Pole liniowe GPZ/);
    await kadrUstalony(page);
    const kadrPola = await viewBox(page);
    expect(kadrPola).not.toBe(kadrPrzedPolem);
    await zrzut(page, 'pole', motyw.klucz);
    await page.getByTestId('sld-v3-poprzedni-widok').click();
    await kadrUstalony(page);
    expect(await viewBox(page)).toBe(kadrPrzedPolem);
    await page.getByTestId('sld-v3-fit-view').click();
    await kadrUstalony(page);
    expect(await viewBox(page)).toBe(kadrPola);
    await page.keyboard.press('Alt+ArrowLeft');
    await kadrUstalony(page);
    expect(await viewBox(page)).toBe(kadrPrzedPolem);

    // (5) Tor zasilania stacji odgałęźnej — menu „Dopasuj do…" → odpowiedź backendu.
    await wrocDoSieci(page);
    const odgalezna = refStacji.get('Stacja Odgałęźna')!;
    await dwuklikStacji(page, odgalezna);
    await expect(page.getByTestId('sld-v3-sciezka-1')).toHaveText('Stacja Odgałęźna');
    const odpowiedzToru = page.waitForResponse((r) => r.url().includes('/enm/topologia/tor?') && r.request().method() === 'GET');
    await page.getByTestId('sld-v3-dopasuj-do-toggle').click();
    await page.getByTestId('sld-v3-dopasuj-do-tor').click();
    expect((await odpowiedzToru).ok()).toBeTruthy();
    await expect(page.getByTestId('sld-v3-komunikat-kadru-tekst')).toContainText(
      /^Tor zasilania elementu Stacja Odgałęźna: dróg \d+ \(pewnych \d+, warunkowych \d+\)/,
    );
    await expect(page.getByTestId('sld-v3-komunikat-kadru-tekst')).toContainText('Podstawa:');
    await expect.poll(() => etykietySciezki(page)).toEqual(['Sieć', 'Tor zasilania: Stacja Odgałęźna']);
    await kadrUstalony(page);
    await zrzut(page, 'tor', motyw.klucz);
    await page.getByTestId('sld-v3-komunikat-kadru-zamknij').click();

    // (6) Problem z przestrzeni „Gotowość" → schemat, zaznaczenie, kadr elementu.
    await wrocDoSieci(page);
    await page.getByRole('button', { name: /^Gotowość \d$/ }).click();
    await expect(page.getByTestId('mvd-gotowosc-panel')).toBeVisible({ timeout: 30000 });
    const problem = page.getByTestId(`mvd-problem-W043-${odgalezna}`);
    await expect(problem).toBeVisible({ timeout: 30000 });
    await problem.locator('.mvd-problem-select').click();
    await expect(page.getByRole('button', { name: /^Schemat \(SLD\) \d$/ })).toHaveAttribute('aria-current', 'page', {
      timeout: 20000,
    });
    await expect.poll(() => etykietySciezki(page), { timeout: 20000 }).toEqual(['Sieć', 'Stacja Odgałęźna']);
    await kadrUstalony(page);
    const pomiarProblemu = await zmierzKadr(page, enm, odgalezna);
    expect(pomiarProblemu.stacja!.left).toBeGreaterThanOrEqual(pomiarProblemu.obszar.left - 0.5);
    expect(pomiarProblemu.stacja!.right).toBeLessThanOrEqual(pomiarProblemu.obszar.right + 0.5);
    await zrzut(page, 'problem-z-gotowosci', motyw.klucz);
    // Tor zasilania elementu wskazanego z gotowości (element jest zaznaczony).
    await page.getByTestId('sld-v3-dopasuj-do-toggle').click();
    await page.getByTestId('sld-v3-dopasuj-do-tor').click();
    await expect.poll(() => etykietySciezki(page), { timeout: 20000 }).toEqual(['Sieć', 'Tor zasilania: Stacja Odgałęźna']);
    await kadrUstalony(page);
    await zrzut(page, 'tor-z-gotowosci', motyw.klucz);
    await page.getByTestId('sld-v3-komunikat-kadru-zamknij').click();

    // (7) Zakładka „Problemy" panelu dolnego: klik problemu stacji przelotowej → kadr stacji.
    await wrocDoSieci(page);
    await page.getByTestId('mvd-view-menu').click();
    await page.getByTestId('mvd-toggle-bottom').click();
    await page.getByTestId('mvd-bottom-tab-problemy').click();
    const wierszProblemu = page.getByTestId(/^mvd-problem-\d+$/).filter({ hasText: '„Stacja Przelotowa”' }).first();
    await expect(wierszProblemu).toBeVisible({ timeout: 30000 });
    await wierszProblemu.click();
    await expect.poll(() => etykietySciezki(page), { timeout: 20000 }).toEqual(['Sieć', 'Stacja Przelotowa']);
    await kadrUstalony(page);
    const pomiarDolny = await zmierzKadr(page, enm, refStacji.get('Stacja Przelotowa')!);
    expect(pomiarDolny.stacja!.top).toBeGreaterThanOrEqual(pomiarDolny.obszar.top - 0.5);
    expect(pomiarDolny.stacja!.bottom).toBeLessThanOrEqual(pomiarDolny.obszar.bottom + 0.5);

    // (8) K2b §0.4 — widok roboczy całej sieci (domyślny na ekranie): brak ramy arkusza,
    // NOP ma symbol, odcinek napowietrzny jest przerywany.
    await wrocDoSieci(page);
    const kanwaSvg = page.locator('svg[data-testid="sld-canvas-v3"]');
    await expect(kanwaSvg).toHaveAttribute('data-tryb-widoku', 'roboczy');
    await expect(page.getByTestId('sld-v3-tryb-widoku')).toHaveAttribute('data-tryb', 'roboczy');
    await expect(page.locator('[data-testid="sld-sheet-border"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="sld-sheet-zone-markers"]')).toHaveCount(0);
    const nop = page.locator(`[data-testid="sld-v3-symbols"] [data-testid="sld-v3-nop-${napowietrzna!.ref_id}"]`);
    await expect(nop, 'symbol punktu normalnie otwartego').toHaveCount(1);
    await expect(nop).toBeVisible();
    const wzoryKreski = await page.evaluate((ref) => {
      const wynik: string[] = [];
      for (const el of Array.from(document.querySelectorAll(`[data-testid="sld-v3-segments"] [data-owner-ref^="${ref}"]`))) {
        const kreski = [el, ...Array.from(el.querySelectorAll('*'))].map((n) => n.getAttribute('stroke-dasharray')).filter(Boolean);
        wynik.push(...(kreski as string[]));
      }
      return wynik;
    }, napowietrzna!.ref_id);
    expect(wzoryKreski.length, 'odcinek napowietrzny narysowany').toBeGreaterThan(0);
    expect(new Set(wzoryKreski), 'odcinek napowietrzny przerywany').toEqual(new Set(['6 3 1 3']));
    const wzoryKabla = await page.evaluate((ref) => {
      const el = document.querySelector(`[data-testid="sld-v3-segments"] [data-owner-ref^="${ref}"]`);
      return el ? [el, ...Array.from(el.querySelectorAll('*'))].map((n) => n.getAttribute('stroke-dasharray')).filter(Boolean) : null;
    }, odcinek2.ref_id);
    expect(wzoryKabla, 'kabel narysowany kreską ciągłą').toEqual([]);
    await zrzut(page, 'widok-roboczy', motyw.klucz);

    // Tryb arkusza z paska kanwy: rama, pola odniesienia; utrwalony po przeładowaniu.
    await page.getByTestId('sld-v3-tryb-widoku').click();
    await expect(kanwaSvg).toHaveAttribute('data-tryb-widoku', 'arkusz');
    await expect(page.locator('[data-testid="sld-sheet-border"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="sld-sheet-zone-markers"]')).toHaveCount(1);
    await kadrUstalony(page);
    await zrzut(page, 'widok-arkusz', motyw.klucz);
    await page.reload({ waitUntil: 'commit' });
    await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
    await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toHaveAttribute('data-tryb-widoku', 'arkusz', { timeout: 60000 });
    await expect(page.locator('[data-testid="sld-sheet-border"]')).toHaveCount(1);
    // Ten sam stan z menu „Widok" powłoki: powrót do widoku roboczego.
    await page.getByTestId('mvd-view-menu').click();
    await page.getByTestId('mvd-tryb-widoku-schematu').click();
    await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toHaveAttribute('data-tryb-widoku', 'roboczy');
    await expect(page.locator('[data-testid="sld-sheet-border"]')).toHaveCount(0);
  });
}
