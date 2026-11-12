/**
 * SKALA, GĘSTOŚĆ INFORMACJI I NAWIGACJA — zrzuty przed/po i pomiary (karta SLD-SKALA-I-NAWIGACJA).
 *
 * Materiał oceny właściciela (werdykt wizualny B-02 należy WYŁĄCZNIE do właściciela): dwie sieci
 * — sieć wzorcowa (`sldSubstrate52s`, 53 stacje) i GPZ dwusekcyjny z 40 stacjami
 * (`gpzDwusekcyjny40`, generator `backend/tests/reference_networks/fikstury_enm_sld.py`) — w
 * sześciu kadrach (cała sieć, skala pośrednia, stacja przelotowa, stacja odgałęźna, GPZ z polami
 * 1.1 i 1.2, pole), w obu motywach i dwóch rozdzielczościach (1440×900, 1280×720).
 *
 * Kadr powstaje WYŁĄCZNIE gestem kamery (kółko myszy nad środkiem obiektu, aż obiekt zajmie
 * zadany ułamek wysokości ekranu) — ta sama droga przed i po zmianie, więc zrzuty są
 * porównywalne niezależnie od tego, czy kanwa podmienia świat przy progach skali (stan „przed”),
 * czy ma jedną geometrię (stan „po”). Obiekt namierzany jest po `data-owner-ref` (sonda DOM).
 *
 * Pomiary (`pomiary-<etap>.json`): skala kamery (szerokość kanwy / szerokość `viewBox`), liczba
 * napisów narysowanych i ukrytych (atrybuty warstwy etykiet), liczba węzłów DOM kanwy,
 * najmniejsza grubość przewodu toru w pikselach ekranu i czasy klatek skryptowanego przesunięcia
 * (odstępy `requestAnimationFrame` podczas 30 kroków przeciągnięcia).
 *
 * Etap zrzutu z `SKALA_ETAP` (`przed` | `po`, domyślnie `po`). Zapis do dokumentacji wyłącznie
 * z `ZRZUTY_DO_DOKUMENTACJI=1` (`e2e/katalogZrzutow.ts`).
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';
import { katalogZrzutow } from './katalogZrzutow';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('screenshot-harness.html');
const ETAP = process.env.SKALA_ETAP === 'przed' ? 'przed' : 'po';
const OUTPUT_DIR = katalogZrzutow(
  path.resolve(_dirname, '../../docs/uiux/zrzuty/sld-skala-i-nawigacja', ETAP),
);
const FIKSTURY = path.resolve(_dirname, '../public/test-fixtures');

interface Pole {
  readonly ref_id: string;
  readonly bay_role: string;
  readonly substation_ref?: string | null;
}
interface Stacja {
  readonly ref_id: string;
  readonly station_type?: string | null;
  readonly name?: string;
}

function model(fikstura: string): { substations: Stacja[]; bays: Pole[] } {
  const dane = JSON.parse(fs.readFileSync(path.join(FIKSTURY, `${fikstura}.enm.json`), 'utf-8')) as {
    enm: { substations: Stacja[]; bays: Pole[] };
  };
  return dane.enm;
}

/** Prefiks identyfikatorów obiektu (`stn/<ziarno>/`, `gpz/<ziarno>/`) albo ref pola. */
function prefiksStacji(ref: string): string {
  return ref.replace(/(station|substation)$/, '');
}

interface Kadr {
  readonly nazwa: string;
  /** Prefiks `data-owner-ref` obiektu kadru; `null` = kadr całej sieci. */
  readonly prefiks: string | null;
  /** Docelowy ułamek wysokości ekranu zajmowany przez obiekt. */
  readonly ulamek: number;
}

function kadry(fikstura: string): Kadr[] {
  const enm = model(fikstura);
  // Rodzaj stacji z modelu (`station_type`: `inline` = przelotowa, `branch` = odgałęźna)
  // — nie z ról pól: pole odejściowe (`FEEDER`) ma każda stacja sieci referencyjnej.
  const przelotowa = enm.substations.find((s) => s.station_type === 'inline');
  const odgalezna = enm.substations.find((s) => s.station_type === 'branch');
  const gpz = enm.substations.find((s) => s.station_type === 'gpz');
  const poleGpz = enm.bays.find((b) => b.substation_ref === gpz?.ref_id && b.bay_role === 'FEEDER');
  expect(przelotowa && gpz && poleGpz, `${fikstura}: brak obiektu kadru`).toBeTruthy();
  // Sieć GPZ dwusekcyjna nie ma stacji odgałęźnej — kadr pomijany jawnie, nie podstawiany.
  const kadrOdgaleznej: Kadr[] = odgalezna
    ? [{ nazwa: 'stacja-odgalezna', prefiks: prefiksStacji(odgalezna.ref_id), ulamek: 0.55 }]
    : [];
  return [
    { nazwa: 'cala-siec', prefiks: null, ulamek: 0 },
    { nazwa: 'skala-posrednia', prefiks: null, ulamek: 0 },
    { nazwa: 'stacja-przelotowa', prefiks: prefiksStacji(przelotowa!.ref_id), ulamek: 0.55 },
    ...kadrOdgaleznej,
    { nazwa: 'gpz-pola-1-1-1-2', prefiks: prefiksStacji(gpz!.ref_id), ulamek: 0.7 },
    { nazwa: 'pole', prefiks: poleGpz!.ref_id, ulamek: 0.75 },
  ];
}

async function otworz(page: Page, fikstura: string, theme: 'dark' | 'light'): Promise<string[]> {
  const bledy: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') bledy.push(msg.text());
  });
  page.on('pageerror', (err) => bledy.push(`PAGEERROR: ${err.message}`));
  await page.goto(`${HARNESS_URL}?fixture=${fikstura}&theme=${theme}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator('[data-testid="sld-harness-root"]').first()).toHaveAttribute('data-status', 'ready', {
    timeout: 120_000,
  });
  await expect(page.locator('[data-testid="sld-canvas-v3"]').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(600);
  return bledy;
}

type Ramka = { x: number; y: number; width: number; height: number };

async function ramkaObiektu(page: Page, prefiks: string): Promise<Ramka | null> {
  return page.evaluate((p) => {
    const kanwa = document.querySelector('[data-testid="sld-canvas-v3"] [data-testid="sld-v3-rysunek"]');
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const el of kanwa?.querySelectorAll('[data-owner-ref]') ?? []) {
      if (!(el.getAttribute('data-owner-ref') ?? '').startsWith(p)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      x0 = Math.min(x0, r.left);
      y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right);
      y1 = Math.max(y1, r.bottom);
    }
    return Number.isFinite(x0) ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
  }, prefiks);
}

/** Kółko nad środkiem obiektu, aż zajmie `ulamek` wysokości ekranu (najwyżej 40 kroków). */
async function przyblizDo(page: Page, prefiks: string, ulamek: number, wysokosc: number): Promise<void> {
  for (let krok = 0; krok < 40; krok += 1) {
    const r = await ramkaObiektu(page, prefiks);
    expect(r, `obiekt ${prefiks} bez elementów na rysunku`).not.toBeNull();
    const cel = ulamek * wysokosc;
    if (r!.height >= cel * 0.85) break;
    await page.mouse.move(r!.x + r!.width / 2, r!.y + r!.height / 2);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(120);
  }
  // Wyśrodkowanie przeciągnięciem (gest kamery; lewy przycisk na tle).
  const r = await ramkaObiektu(page, prefiks);
  const vp = page.viewportSize()!;
  const dx = vp.width / 2 - (r!.x + r!.width / 2);
  const dy = vp.height / 2 - (r!.y + r!.height / 2);
  await page.mouse.move(vp.width / 2 - dx, vp.height / 2 - dy);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(vp.width / 2, vp.height / 2, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(300);
}

interface Pomiar {
  readonly skala: number;
  readonly napisyNarysowane: number;
  readonly napisyUkryte: number;
  readonly tozsamosciPorzucone: number;
  readonly wezlyDom: number;
  readonly najcienszyPrzewodPx: number | null;
  readonly klatkaSredniaMs: number;
  readonly klatkaP95Ms: number;
}

async function zmierz(page: Page): Promise<Pomiar> {
  const statyczne = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="sld-canvas-v3"]') as SVGSVGElement;
    const vb = svg.viewBox.baseVal;
    const skala = svg.clientWidth / vb.width;
    const etykiety = svg.querySelector('[data-testid="sld-v3-labels"]');
    let najciensza: number | null = null;
    for (const p of svg.querySelectorAll('[data-testid="sld-v3-segments"] path, [data-testid="sld-v3-segments"] line')) {
      const sw = Number.parseFloat(getComputedStyle(p).strokeWidth);
      if (!Number.isFinite(sw) || sw <= 0) continue;
      const ekranowa = p.getAttribute('vector-effect') === 'non-scaling-stroke' ? sw : sw * skala;
      najciensza = najciensza === null ? ekranowa : Math.min(najciensza, ekranowa);
    }
    return {
      skala,
      napisyNarysowane: svg.querySelectorAll('[data-testid="sld-v3-labels"] text').length,
      napisyUkryte: Number(etykiety?.getAttribute('data-hidden-unreadable') ?? 0),
      tozsamosciPorzucone: Number(etykiety?.getAttribute('data-dropped-identity') ?? 0),
      wezlyDom: svg.querySelectorAll('*').length,
      najcienszyPrzewodPx: najciensza,
    };
  });
  // Czasy klatek: odstępy rAF podczas skryptowanego przesunięcia (30 kroków).
  await page.evaluate(() => {
    const w = window as unknown as { __klatki: number[]; __stop: boolean };
    w.__klatki = [];
    w.__stop = false;
    const petla = (t: number) => {
      w.__klatki.push(t);
      if (!w.__stop) requestAnimationFrame(petla);
    };
    requestAnimationFrame(petla);
  });
  const vp = page.viewportSize()!;
  await page.mouse.move(vp.width / 2, vp.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(vp.width / 2 + 150, vp.height / 2 + 60, { steps: 30 });
  await page.mouse.up({ button: 'middle' });
  const klatki = await page.evaluate(() => {
    const w = window as unknown as { __klatki: number[]; __stop: boolean };
    w.__stop = true;
    const d: number[] = [];
    for (let i = 1; i < w.__klatki.length; i += 1) d.push(w.__klatki[i] - w.__klatki[i - 1]);
    return d;
  });
  const posortowane = [...klatki].sort((a, b) => a - b);
  const srednia = klatki.reduce((s, x) => s + x, 0) / Math.max(1, klatki.length);
  const p95 = posortowane[Math.min(posortowane.length - 1, Math.floor(0.95 * posortowane.length))] ?? 0;
  return { ...statyczne, klatkaSredniaMs: Number(srednia.toFixed(2)), klatkaP95Ms: Number(p95.toFixed(2)) };
}

const FIKSTURY_SIECI = ['sldSubstrate52s', 'gpzDwusekcyjny40'] as const;
const ROZDZIELCZOSCI = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
] as const;

test.describe(`sld-skala-i-nawigacja:screenshot — etap ${ETAP}`, () => {
  test.describe.configure({ mode: 'serial' });
  const pomiary: Record<string, Pomiar> = {};

  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });
  test.afterAll(() => {
    fs.writeFileSync(path.join(OUTPUT_DIR, `pomiary.json`), `${JSON.stringify({ etap: ETAP, pomiary }, null, 2)}\n`);
  });

  for (const fikstura of FIKSTURY_SIECI) {
    for (const vp of ROZDZIELCZOSCI) {
      for (const theme of ['dark', 'light'] as const) {
        test(`${fikstura} — ${vp.width}×${vp.height} — motyw ${theme}`, async ({ page }) => {
          test.setTimeout(600_000);
          await page.setViewportSize(vp);
          for (const kadr of kadry(fikstura)) {
            const bledy = await otworz(page, fikstura, theme);
            expect(bledy, bledy.join('\n')).toEqual([]);
            if (kadr.nazwa === 'skala-posrednia') {
              for (let i = 0; i < 6; i += 1) {
                await page.mouse.move(vp.width / 2, vp.height / 2);
                await page.mouse.wheel(0, -240);
                await page.waitForTimeout(120);
              }
            } else if (kadr.prefiks) {
              await przyblizDo(page, kadr.prefiks, kadr.ulamek, vp.height);
            }
            await page.waitForTimeout(400);
            const motyw = theme === 'dark' ? 'ciemny' : 'jasny';
            const plik = `${fikstura}-${kadr.nazwa}-${vp.width}x${vp.height}-${motyw}.png`;
            await page.screenshot({ path: path.join(OUTPUT_DIR, plik) });
            pomiary[plik] = await zmierz(page);
          }
        });
      }
    }
  }
});
