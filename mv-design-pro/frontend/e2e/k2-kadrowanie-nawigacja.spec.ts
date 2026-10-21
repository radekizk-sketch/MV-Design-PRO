/**
 * KARTA K2 KADROWANIE-NAWIGACJA — kadrowanie zakresu pracy na REALNYM backendzie, ścieżką
 * NATYWNĄ (kliki i klawisze Playwrighta w żywej aplikacji, bez zdarzeń syntetycznych).
 *
 * Co spec dowodzi (kryteria ukończenia karty):
 *  1. dwuklik stacji (cztery drogi budowy: przelotowa, sekcyjna, końcowa, odgałęźna) — stacja
 *     CAŁA w widocznej części kanwy (pod paskiem narzędzi i mini-ścieżką, na lewo od portalu
 *     nN, gdy jest otwarty; klik obiektu otwiera prawy inspektor POZA kanwą), jej większy wymiar ≥ 50 % mniejszego
 *     wymiaru widocznej kanwy, żaden sąsiad nie jest ucięty; mini-ścieżka „Sieć › stacja";
 *     poprzednia/następna stacja w porządku rysunku;
 *  2. pole z drzewa („Pola GPZ") + „Dopasuj widok" — kadr pola, ścieżka kończy się polem;
 *  3. „Wstecz" i Alt+← przywracają DOKŁADNIE poprzedni kadr (viewBox);
 *  4. klik problemu w przestrzeni „Gotowość" i w zakładce „Problemy" panelu dolnego —
 *     przejście na schemat, zaznaczenie i kadr elementu;
 *  5. tor zasilania z menu „Dopasuj do…" — odpowiedź backendu `…/enm/topologia/tor`, kadr sumy
 *     dróg, liczby dróg i podstawa w komunikacie (bez wyróżnienia na kanwie — karta K4).
 *
 * Zrzuty 1440×900 w obu motywach (materiał oceny właściciela, bramka B-02; spec NIE ocenia
 * wyglądu): sieć, magistrala, cztery stacje, pole, tor, problem z gotowości i tor z gotowości.
 * Katalog: `docs/uiux/zrzuty/k2-kadrowanie` przez `katalogZrzutow` (bez jawnego odświeżania
 * dokumentacji bieg pisze do `test-results/zrzuty-dokumentacji/…`).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { katalogZrzutow } from './katalogZrzutow';
import { otworzAplikacje, polaStacjiEnm, siecKadrow, STACJE, ustawMotyw, type Enm } from './siecKadrowStacji';

const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'k2-kadrowanie'));
const SZEROKOSC = 1440;
const WYSOKOSC = 900;

type Prostokat = { left: number; top: number; right: number; bottom: number };
type StanSasiada = 'poza' | 'caly' | 'uciety';
interface PomiarKadru {
  readonly kanwa: Prostokat;
  readonly obszar: Prostokat;
  readonly stacja: Prostokat | null;
  readonly sasiedzi: Readonly<Record<string, StanSasiada>>;
  readonly prostokaty: Readonly<Record<string, Prostokat | null>>;
  readonly wnikajace: readonly string[];
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
 * Pomiar kadru w przeglądarce: prostokąty ekranowe obrysów trafień (`data-hit-role="obrys"`)
 * przypisanych do stacji, prostokąt kanwy i obszar widoczny (kanwa pod paskiem narzędzi
 * i mini-ścieżką). Sąsiad: „poza" (rozłączny z obszarem), „cały" (w obszarze) albo „ucięty".
 */
async function zmierzKadr(page: Page, enm: Enm, stacjaRef: string): Promise<PomiarKadru> {
  return page.evaluate(
    ({ stacje, cel }) => {
      const svg = document.querySelector('svg[data-testid="sld-canvas-v3"]')!.getBoundingClientRect();
      const kanwa = { left: svg.left, top: svg.top, right: svg.right, bottom: svg.bottom };
      let gora = svg.top;
      for (const id of ['sld-v3-fit-view', 'sld-v3-sciezka-kadru']) {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (el) gora = Math.max(gora, el.getBoundingClientRect().bottom);
      }
      // Panel leżący NAD kanwą przy prawej krawędzi (portal nN) zasłania jej pas — obszar
      // widoczny kończy się na jego lewej krawędzi. Klik obiektu otwiera prawy inspektor,
      // który leży OBOK kanwy (zwęża ją), a nie nad nią.
      let prawa = svg.right;
      for (const id of ['lv-domain-portal-drawer']) {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (el) prawa = Math.min(prawa, el.getBoundingClientRect().left);
      }
      const obszar = { ...kanwa, top: gora, right: prawa };
      const prostokaty: Record<string, { left: number; top: number; right: number; bottom: number } | null> = {};
      // Diagnostyka: obrysy SĄSIADÓW wchodzące w obszar (komunikat porażki pokazuje, co ucina).
      const wnikajace: string[] = [];
      for (const ref of Object.keys(stacje)) prostokaty[ref] = null;
      for (const el of Array.from(document.querySelectorAll('[data-hit-role="obrys"][data-hit-owner-ref]'))) {
        const baza = (el.getAttribute('data-hit-owner-ref') ?? '').split('#')[0];
        const wlasciciel = Object.keys(stacje).find(
          (ref) => stacje[ref].refy.includes(baza) || baza.startsWith(stacje[ref].przedrostek),
        );
        if (!wlasciciel) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (wlasciciel !== cel && r.right > obszar.left && r.left < obszar.right && r.bottom > obszar.top && r.top < obszar.bottom) {
          wnikajace.push(`${el.getAttribute('data-hit-owner-ref')} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
        }
        const p = prostokaty[wlasciciel];
        prostokaty[wlasciciel] = p
          ? { left: Math.min(p.left, r.left), top: Math.min(p.top, r.top), right: Math.max(p.right, r.right), bottom: Math.max(p.bottom, r.bottom) }
          : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }
      const sasiedzi: Record<string, 'poza' | 'caly' | 'uciety'> = {};
      for (const [ref, p] of Object.entries(prostokaty)) {
        if (ref === cel || !p) continue;
        const rozlaczny = p.right <= obszar.left || p.left >= obszar.right || p.bottom <= obszar.top || p.top >= obszar.bottom;
        const wewnatrz = p.left >= obszar.left && p.right <= obszar.right && p.top >= obszar.top && p.bottom <= obszar.bottom;
        sasiedzi[ref] = rozlaczny ? 'poza' : wewnatrz ? 'caly' : 'uciety';
      }
      return { kanwa, obszar, stacja: prostokaty[cel], sasiedzi, prostokaty, wnikajace };
    },
    { stacje: refyStacji(enm), cel: stacjaRef },
  );
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

    // (2) Dwuklik stacji — cztery drogi budowy. Pomiar: stacja cała w obszarze widocznym,
    // dominuje kanwę, żaden sąsiad nie jest ucięty.
    for (const stacja of STACJE) {
      const ref = refStacji.get(stacja.nazwa)!;
      expect(ref, `stacja ${stacja.nazwa} w modelu`).toBeTruthy();
      await wrocDoSieci(page);
      await dwuklikStacji(page, ref);
      await expect(page.getByTestId('sld-v3-sciezka-1')).toHaveText(stacja.nazwa, { timeout: 10000 });
      await expect(page.getByTestId('sld-canvas-v3')).not.toHaveAttribute('data-scene-lod', '0');
      await kadrUstalony(page);
      const pomiar = await zmierzKadr(page, seed.enm, ref);
      console.log(`K2 pomiar ${stacja.plik} ${motyw.klucz}: ${JSON.stringify(pomiar)}`);
      const s = pomiar.stacja!;
      expect(s, `${stacja.nazwa}: obrysy stacji na kanwie`).not.toBeNull();
      expect(s.left, `${stacja.nazwa}: lewa krawędź w kadrze`).toBeGreaterThanOrEqual(pomiar.obszar.left - 0.5);
      expect(s.right, `${stacja.nazwa}: prawa krawędź w kadrze`).toBeLessThanOrEqual(pomiar.obszar.right + 0.5);
      expect(s.top, `${stacja.nazwa}: górna krawędź pod paskiem narzędzi i ścieżką`).toBeGreaterThanOrEqual(pomiar.obszar.top - 0.5);
      expect(s.bottom, `${stacja.nazwa}: dolna krawędź w kadrze`).toBeLessThanOrEqual(pomiar.obszar.bottom + 0.5);
      // „Kanwa" = jej część WIDOCZNA (bez pasa pod portalem nN i pod paskiem narzędzi).
      const mniejszyWymiarKanwy = Math.min(pomiar.obszar.right - pomiar.obszar.left, pomiar.obszar.bottom - pomiar.obszar.top);
      expect(Math.max(s.right - s.left, s.bottom - s.top), `${stacja.nazwa}: ≥ 50 % mniejszego wymiaru widocznej kanwy`).toBeGreaterThanOrEqual(
        0.5 * mniejszyWymiarKanwy,
      );
      const uciete = Object.entries(pomiar.sasiedzi).filter(([, stan]) => stan === 'uciety');
      expect(uciete, `${stacja.nazwa}: żaden sąsiad nie jest ucięty (wnikają: ${pomiar.wnikajace.join("; ")})`).toEqual([]);
      await zrzut(page, `stacja-${stacja.plik}`, motyw.klucz);
    }

    // (3) Poprzednia/następna stacja — porządek rysunku (licznik i nazwa w ścieżce).
    await wrocDoSieci(page);
    // Kadr sieci w BIEŻĄCYM układzie okna: po pierwszym zaznaczeniu powłoka otwiera
    // inspektor po prawej i kanwa jest węższa niż przy starcie (inny kadr sieci).
    const kadrSieciZInspektorem = await viewBox(page);
    await dwuklikStacji(page, refStacji.get('Stacja Przelotowa')!);
    await expect(page.getByTestId('sld-v3-sciezka-1')).toHaveText('Stacja Przelotowa');
    const licznik = (await page.getByTestId('sld-v3-stacja-licznik').textContent()) ?? '';
    const [numer, wszystkie] = licznik.split('/').map(Number);
    expect(wszystkie).toBe(5);
    await page.getByTestId('sld-v3-stacja-nastepna').click();
    await expect(page.getByTestId('sld-v3-stacja-licznik')).toHaveText(`${numer + 1}/${wszystkie}`);
    await expect(page.getByTestId('sld-v3-sciezka-1')).not.toHaveText('Stacja Przelotowa');
    await page.getByTestId('sld-v3-stacja-poprzednia').click();
    await expect(page.getByTestId('sld-v3-sciezka-1')).toHaveText('Stacja Przelotowa');
    // Poziom „Sieć" mini-ścieżki wraca do kadru sieci.
    await page.getByTestId('sld-v3-sciezka-0').click();
    await expect(page.getByTestId('sld-v3-sciezka-kadru')).toHaveCount(0);
    await kadrUstalony(page);
    expect(await viewBox(page)).toBe(kadrSieciZInspektorem);

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
    const pomiarProblemu = await zmierzKadr(page, seed.enm, odgalezna);
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
    const pomiarDolny = await zmierzKadr(page, seed.enm, refStacji.get('Stacja Przelotowa')!);
    expect(pomiarDolny.stacja!.top).toBeGreaterThanOrEqual(pomiarDolny.obszar.top - 0.5);
    expect(pomiarDolny.stacja!.bottom).toBeLessThanOrEqual(pomiarDolny.obszar.bottom + 0.5);
  });
}
