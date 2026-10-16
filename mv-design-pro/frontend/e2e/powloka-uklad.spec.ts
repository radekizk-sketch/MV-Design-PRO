/**
 * Układ powłoki na realnym renderze (karta K1 POWLOKA, kontrakt UIUX przemysłowy UI-01/UI-02, §8).
 *
 * jsdom nie liczy układu, więc geometrię trzech pasów mierzy przeglądarka. Iloczyn cech:
 * motyw {ciemny, jasny} × szerokość okna {1366×768, 1440×900, 1600×900, 1920×1080} ×
 * inspektor {zwinięty, otwarty}. Na KAŻDEJ kombinacji:
 *
 *  - trzy pasy istnieją (projekt, narzędzia, stan) i nie zachodzą na siebie;
 *  - żadne dwa widoczne elementy jednego pasa nie nachodzą na siebie (dawna kolizja
 *    `.mvd-menu` przykrywała nazwę projektu przyciskiem „Widok");
 *  - nazwa projektu jest w całości w oknie i niczym nieprzykryta (punkt w jej środku
 *    trafia w nią samą — `elementFromPoint`);
 *  - od 1440 px etykiety pasów są pełne (bez obcięcia wielokropkiem);
 *  - lewy panel 220–260 px, inspektor ≥ 340 px (domyślnie 360), kanwa/warsztat ma szerokość;
 *  - typografia pasów: ≥ 13 px, bez wersalików i rozstrzelenia liter;
 *  - otwarte menu „Widok" nie przykrywa nazwy projektu.
 *
 * Zrzuty każdej kombinacji idą do katalogu biegu (`katalogZrzutow`) — do oceny właściciela
 * (B-02); ten spec NIE wystawia werdyktu wizualnego.
 */
import path from 'node:path';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { katalogZrzutow, KORZEN_REPO } from './katalogZrzutow';
import { przelaczMotyw } from './powloka';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const KATALOG = katalogZrzutow(path.join(KORZEN_REPO, 'mv-design-pro/docs/uiux/zrzuty/k1-powloka'));

const OKNA = [
  { szerokosc: 1366, wysokosc: 768 },
  { szerokosc: 1440, wysokosc: 900 },
  { szerokosc: 1600, wysokosc: 900 },
  { szerokosc: 1920, wysokosc: 1080 },
] as const;
const MOTYWY = ['dark_scada', 'light_technical'] as const;
const INSPEKTOR = [false, true] as const;

const PASY = ['active-case-bar', 'mvd-pasek-narzedzi', 'mvd-statusbar'] as const;

interface Prostokat {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function utworzProjekt(request: APIRequestContext): Promise<{
  projectId: string;
  projectName: string;
  caseId: string;
  caseName: string;
}> {
  const sufiks = String(Date.now() % 100000);
  const projectName = `Sieć SN 15 kV — GPZ Lipowa, magistrala ${sufiks}`;
  const caseName = 'Zwarcia maksymalne';
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Pomiar układu powłoki (spec powloka-uklad)',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projekt.ok()).toBeTruthy();
  const { id: projectId } = (await projekt.json()) as { id: string };
  const przypadek = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: projectId, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(przypadek.ok()).toBeTruthy();
  const { id: caseId } = (await przypadek.json()) as { id: string };
  return { projectId, projectName, caseId, caseName };
}

async function otworzPowloke(
  page: Page,
  seed: Awaited<ReturnType<typeof utworzProjekt>>,
): Promise<void> {
  await page.addInitScript((s) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: s.projectId,
          activeProjectName: s.projectName,
          activeCaseId: s.caseId,
          activeCaseName: s.caseName,
          activeCaseKind: 'ShortCircuitCase',
          activeCaseResultStatus: 'NONE',
          activeSnapshotId: null,
          activeMode: 'MODEL_EDIT',
          activeRunId: null,
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, seed);
  await page.goto('/#sld', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60_000 });
  await expect(page.getByTestId('mvd-projekt-nazwa')).toContainText(seed.projectName, { timeout: 30_000 });
}

function nachodza(a: Prostokat, b: Prostokat): boolean {
  // Styk krawędzią (1 px tolerancji zaokrągleń) nie jest nachodzeniem.
  return a.x + a.w > b.x + 1 && b.x + b.w > a.x + 1 && a.y + a.h > b.y + 1 && b.y + b.h > a.y + 1;
}

/** Widoczne elementy-dzieci pasa (pierwszy poziom; menu rozwijane mierzone osobno). */
async function elementyPasa(page: Page, testId: string): Promise<Array<{ opis: string } & Prostokat>> {
  return page.evaluate((id) => {
    const pas = document.querySelector(`[data-testid="${id}"]`);
    if (!pas) return [];
    const wynik: Array<{ opis: string; x: number; y: number; w: number; h: number }> = [];
    for (const dziecko of Array.from(pas.children)) {
      const r = dziecko.getBoundingClientRect();
      const styl = getComputedStyle(dziecko);
      if (r.width === 0 || r.height === 0 || styl.visibility === 'hidden') continue;
      if (dziecko.classList.contains('mvd-grow')) continue;
      if (dziecko.classList.contains('mvd-sr-only')) continue;
      const opis = dziecko.getAttribute('data-testid') ?? `${dziecko.tagName.toLowerCase()}.${dziecko.className}`;
      wynik.push({ opis, x: r.x, y: r.y, w: r.width, h: r.height });
    }
    return wynik;
  }, testId);
}

async function prostokat(page: Page, testId: string): Promise<Prostokat> {
  const box = await page.getByTestId(testId).boundingBox();
  expect(box, `brak elementu ${testId}`).not.toBeNull();
  return { x: box!.x, y: box!.y, w: box!.width, h: box!.height };
}

test.describe('Układ powłoki: motyw × szerokość × inspektor', () => {
  let seed: Awaited<ReturnType<typeof utworzProjekt>>;

  test.beforeAll(async ({ request }) => {
    seed = await utworzProjekt(request);
  });

  for (const okno of OKNA) {
    for (const motyw of MOTYWY) {
      for (const inspektorOtwarty of INSPEKTOR) {
        const nazwa = `${okno.szerokosc}×${okno.wysokosc} · ${motyw} · inspektor ${inspektorOtwarty ? 'otwarty' : 'zwinięty'}`;
        test(nazwa, async ({ page }) => {
          test.setTimeout(120_000);
          await page.setViewportSize({ width: okno.szerokosc, height: okno.wysokosc });
          await otworzPowloke(page, seed);

          if (motyw === 'light_technical') await przelaczMotyw(page);
          await expect(page.locator('html')).toHaveAttribute('data-theme', motyw);

          const inspektor = page.getByTestId('mvd-inspector');
          if (inspektorOtwarty !== !(await inspektor.getAttribute('hidden') !== null)) {
            await page.keyboard.press('Control+i');
          }
          if (inspektorOtwarty) await expect(inspektor).not.toHaveAttribute('hidden', '');
          else await expect(inspektor).toHaveAttribute('hidden', '');

          // (1) Trzy pasy, w kolejności pionowej, bez nachodzenia na siebie.
          const pasy = await Promise.all(PASY.map((id) => prostokat(page, id)));
          expect(pasy[0].y + pasy[0].h).toBeLessThanOrEqual(pasy[1].y + 1);
          expect(pasy[2].y).toBeGreaterThan(pasy[1].y + pasy[1].h);
          expect(pasy[2].y + pasy[2].h).toBeLessThanOrEqual(okno.wysokosc + 1);
          for (const pas of pasy) expect(pas.x + pas.w).toBeLessThanOrEqual(okno.szerokosc + 1);

          // (2) Żadne dwa elementy jednego pasa nie nachodzą na siebie.
          for (const id of PASY) {
            const elementy = await elementyPasa(page, id);
            expect(elementy.length, `pas ${id} ma elementy`).toBeGreaterThan(0);
            for (let i = 0; i < elementy.length; i += 1) {
              for (let j = i + 1; j < elementy.length; j += 1) {
                expect(
                  nachodza(elementy[i], elementy[j]),
                  `${id}: „${elementy[i].opis}" nachodzi na „${elementy[j].opis}"`,
                ).toBe(false);
              }
              expect(elementy[i].x + elementy[i].w, `${id}: ${elementy[i].opis} poza oknem`).toBeLessThanOrEqual(
                okno.szerokosc + 1,
              );
            }
          }

          // (3) Nazwa projektu w oknie i nieprzykryta.
          const nazwaProjektu = await prostokat(page, 'mvd-projekt-nazwa');
          expect(nazwaProjektu.x).toBeGreaterThanOrEqual(0);
          expect(nazwaProjektu.x + nazwaProjektu.w).toBeLessThanOrEqual(okno.szerokosc);
          const trafiona = await page.evaluate(
            ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid="mvd-projekt-nazwa"]') !== null,
            [nazwaProjektu.x + nazwaProjektu.w / 2, nazwaProjektu.y + nazwaProjektu.h / 2] as const,
          );
          expect(trafiona, 'środek nazwy projektu trafia w nazwę (nic jej nie przykrywa)').toBe(true);

          // (4) Od 1440 px pełne etykiety (bez obcięcia) w pasach.
          if (okno.szerokosc >= 1440) {
            const obciete = await page.evaluate((ids) => {
              const wynik: string[] = [];
              for (const id of ids) {
                const pas = document.querySelector(`[data-testid="${id}"]`);
                for (const el of Array.from(pas?.querySelectorAll<HTMLElement>('button, span, a') ?? [])) {
                  if (el.offsetParent === null) continue;
                  // Tekst wyłącznie dla czytników ekranu (.mvd-sr-only) jest celowo przycięty do 1 px —
                  // nie jest etykietą widoczną, więc nie podlega temu sprawdzeniu.
                  if (el.closest('.mvd-sr-only')) continue;
                  if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') {
                    wynik.push(`${id}: ${el.getAttribute('data-testid') ?? el.textContent?.trim()}`);
                  }
                }
              }
              return wynik;
            }, [...PASY]);
            expect(obciete, 'etykiety obcięte przy pełnej szerokości').toEqual([]);
          }

          // (5) Szerokości paneli w granicach kontraktu; obszar roboczy ma miejsce.
          const nawigacja = page.locator('nav.mvd-nav');
          if (await nawigacja.count()) {
            const box = await nawigacja.boundingBox();
            expect(box!.width).toBeGreaterThanOrEqual(219);
            expect(box!.width).toBeLessThanOrEqual(261);
          }
          if (inspektorOtwarty) {
            const box = await inspektor.boundingBox();
            expect(box!.width).toBeGreaterThanOrEqual(339);
            expect(box!.width).toBeLessThanOrEqual(561);
          }
          const centrum = await page.locator('main').first().boundingBox();
          expect(centrum!.width).toBeGreaterThan(okno.szerokosc * 0.4);

          // (6) Typografia pasów: ≥ 13 px, bez wersalików i rozstrzelenia.
          const typografia = await page.evaluate((ids) => {
            const bledy: string[] = [];
            for (const id of ids) {
              const pas = document.querySelector(`[data-testid="${id}"]`);
              for (const el of Array.from(pas?.querySelectorAll<HTMLElement>('*') ?? [])) {
                if (el.offsetParent === null || !el.textContent?.trim()) continue;
                if (el.closest('.mvd-sr-only')) continue;
                const styl = getComputedStyle(el);
                if (parseFloat(styl.fontSize) < 13) bledy.push(`${id}: ${styl.fontSize} „${el.textContent.trim()}"`);
                if (styl.textTransform === 'uppercase') bledy.push(`${id}: wersaliki „${el.textContent.trim()}"`);
                if (styl.letterSpacing !== 'normal' && parseFloat(styl.letterSpacing) > 0) {
                  bledy.push(`${id}: rozstrzelenie ${styl.letterSpacing}`);
                }
              }
            }
            return bledy;
          }, [...PASY]);
          expect(typografia).toEqual([]);

          await page.screenshot({
            path: path.join(KATALOG, `powloka-${okno.szerokosc}-${motyw}-${inspektorOtwarty ? 'inspektor' : 'bez-inspektora'}.png`),
          });

          // (7) Otwarte menu „Widok" nie przykrywa nazwy projektu.
          await page.getByTestId('mvd-view-menu').click();
          const menu = page.getByRole('menu', { name: 'Widok' });
          await expect(menu).toBeVisible();
          const boxMenu = await menu.boundingBox();
          expect(
            nachodza({ x: boxMenu!.x, y: boxMenu!.y, w: boxMenu!.width, h: boxMenu!.height }, nazwaProjektu),
            'menu „Widok" przykrywa nazwę projektu',
          ).toBe(false);
          expect(boxMenu!.x + boxMenu!.width).toBeLessThanOrEqual(okno.szerokosc + 1);
          await page.keyboard.press('Escape');
          await expect(menu).toHaveCount(0);
        });
      }
    }
  }
});
