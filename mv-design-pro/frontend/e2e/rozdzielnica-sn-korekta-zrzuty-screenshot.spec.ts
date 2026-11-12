/**
 * ROZDZIELNICA SN — zrzuty przed/po korekty schematów pól (karta UX-04/ROZDZIELNICA-SN-KOREKTA,
 * werdykt właściciela 0/10 z 2026-11-11).
 *
 * Kadry: rozdzielnica GPZ dwusekcyjna (`gpz110kvPolaSzablonow`) sekcjami w skali czytelnych
 * opisów (bez „Ukryto N opisów", decyzja architekta D3g), powiększenia pól TR1, TR2
 * (ENEA Z.7), sprzęgła (Z.12), zespołu uziemiającego (Z.13), baterii kondensatorów (Z.16),
 * pomiaru napięcia (Z.17) i jednego pola liniowego (regresja wzorca UX04) oraz stacje SN/nN
 * typu A, B, C, D (`stacjeTypowAbcd`) — OBA motywy. Fikstury powstają z generatora
 * `backend/tests/reference_networks/fikstury_enm_sld.py` (operacje domenowe).
 *
 * Kadr = polecenie „Dopasuj do…" (stacja / sekcja szyn / pole) wykonane przez harness
 * (`?kadr=<cel>:<ref>`, `zakresCelu` → kamera `'kadruj'` + kurtyna), refy czytane z fikstury.
 * Spec sprawdza: brak „Ukryto N opisów", brak skróconych nazw celu, cel w oknie w całości,
 * i zapisuje PNG wycięty do obrysu celu. Werdykt wizualny NALEŻY DO WŁAŚCICIELA (zasada nr 2, B-02).
 *
 * Etap zrzutów: `ETAP_ZRZUTOW=przed|po` (domyślnie `po`); do dokumentacji tylko z
 * `ZRZUTY_DO_DOKUMENTACJI=1` (`e2e/katalogZrzutow.ts`).
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';
import { katalogZrzutow } from './katalogZrzutow';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('screenshot-harness.html');
const ETAP = process.env.ETAP_ZRZUTOW === 'przed' ? 'przed' : 'po';
const OUTPUT_DIR = katalogZrzutow(path.resolve(_dirname, `../../docs/uiux/zrzuty/rozdzielnica-sn-korekta/${ETAP}`));
const FIKSTURY = path.resolve(_dirname, '../public/test-fixtures');
const GPZ = 'gpz110kvPolaSzablonow';
const STACJE = 'stacjeTypowAbcd';

interface ModelFikstury {
  readonly bays: readonly {
    readonly ref_id: string;
    readonly bay_role: string;
    readonly bay_template_ref?: string | null;
    readonly equipment_refs?: readonly string[];
  }[];
  readonly transformers: readonly { readonly ref_id: string; readonly name?: string | null }[];
  readonly branches: readonly { readonly ref_id: string; readonly type: string }[];
  readonly substations: readonly {
    readonly ref_id: string;
    readonly name?: string | null;
    readonly station_type: string;
    readonly gpz_sections?: readonly { readonly section_id: string; readonly bus_ref?: string | null }[];
  }[];
}

function model(fikstura: string): ModelFikstury {
  return (JSON.parse(fs.readFileSync(path.join(FIKSTURY, `${fikstura}.enm.json`), 'utf-8')) as { enm: ModelFikstury }).enm;
}

/** Pole wg szablonu (pierwsze poza polem TR). */
function polePoSzablonie(m: ModelFikstury, szablon: string): string | null {
  return m.bays.find((b) => (b.bay_template_ref ?? '').includes(szablon) && b.bay_role !== 'TR')?.ref_id ?? null;
}

/** Pole TR `indeks`-tego transformatora 110 kV/SN (wieża z transformatorem i stroną WN). */
function poleTr(m: ModelFikstury, indeks: number): string | null {
  const tr = m.transformers.filter((t) => t.ref_id.includes('/wn_sn'))[indeks];
  if (!tr) return null;
  return m.bays.find((b) => b.bay_role === 'TR' && (b.equipment_refs ?? []).includes(tr.ref_id))?.ref_id ?? null;
}

function poleSprzegla(m: ModelFikstury): string | null {
  const galezie = m.branches.filter((g) => g.type === 'bus_coupler').map((g) => g.ref_id);
  return (
    m.bays.find((b) => b.bay_role === 'COUPLER' || (b.equipment_refs ?? []).some((r) => galezie.includes(r)))?.ref_id ?? null
  );
}

function sekcjaGpz(m: ModelFikstury, indeks: number): string | null {
  return m.substations.find((s) => s.station_type === 'gpz')?.gpz_sections?.[indeks]?.section_id ?? null;
}

function stacja(m: ModelFikstury, typ: string): string | null {
  return m.substations.find((s) => s.station_type === typ)?.ref_id ?? null;
}

async function otworzHarness(
  page: Page,
  fikstura: string,
  theme: 'dark' | 'light',
  kadr: string,
  widok: Widok,
): Promise<string[]> {
  await page.setViewportSize(widok);
  const bledy: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') bledy.push(msg.text());
  });
  page.on('pageerror', (err) => bledy.push(`PAGEERROR: ${err.message}`));
  await page.goto(`${HARNESS_URL}?fixture=${fikstura}&lod=2&theme=${theme}&kadr=${encodeURIComponent(kadr)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await expect(page.locator('[data-testid="sld-harness-root"]').first()).toHaveAttribute('data-status', 'ready', {
    timeout: 20_000,
  });
  await expect(page.locator('[data-testid="sld-harness-root"]').first()).not.toHaveAttribute('data-kadr-cel', '');
  await expect(page.locator('[data-testid="sld-canvas-v3"]').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(900);
  return bledy;
}

/**
 * Ramka ekranowa CELU kadru: elementy rysunku (odcinki, symbole, etykiety z `data-owner-ref`
 * i tła pól GPZ) bez przodka `data-kadr="poza"` — ta sama relacja przynależności, z której
 * kamera liczy kadr i kurtyna przyciemnia resztę (`nalezyDoZakresu`).
 */
async function ramkaCelu(page: Page): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate(() => {
    const kanwa = document.querySelector('svg[data-testid="sld-canvas-v3"]');
    if (!kanwa) return null;
    const elementy = [
      ...kanwa.querySelectorAll('[data-testid="sld-v3-segments"] [data-owner-ref], [data-testid="sld-v3-symbols"] [data-owner-ref], [data-testid="sld-v3-labels"] [data-owner-ref]'),
      ...kanwa.querySelectorAll('[data-testid^="sld-v3-gpz-panel-"]'),
    ].filter((el) => !el.closest('[data-kadr="poza"]'));
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const el of elementy) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      x0 = Math.min(x0, r.left);
      y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right);
      y1 = Math.max(y1, r.bottom);
    }
    return Number.isFinite(x0) ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
  });
}

const gpz = model(GPZ);
const stacje = model(STACJE);
/**
 * Kadry odbiorcze: `kadr` = `<cel>:<ref>` (harness, `zakresCelu` — polecenie „Dopasuj do…").
 * Decyzja architekta D3g + kryterium K1: kadr sekcji obejmuje całą sekcję (wieża TR
 * z transformatorem i granicą WN, szyna, celki sekcji z celką sprzęgła), wyliczony z obrysu
 * elementów celu w scenie, bez obcinania i bez „Ukryto N opisów".
 */
interface Widok {
  readonly width: number;
  readonly height: number;
}
/** Okno kadru pola i stacji. */
const WIDOK_POLA: Widok = { width: 1800, height: 1100 };
/** Okno kadru sekcji: sekcja GPZ ma ok. 2800 j.św. szerokości — w oknie 1800 px skala kadru
 *  (≈ 0,64) jest poniżej progu czytelności opisów pól (pomiar 2026-11-12: „Ukryto 41 opisów”,
 *  nazwy pól skrócone „…”). Okno szerokie daje skalę ≥ 1, przy której plan etykiet rysuje
 *  komplet opisów — sekcja w całości i czytelna (K1, K3). Pomiar planu etykiet sekcji 1
 *  (2026-11-12, po D3d): na skalach 1,05–1,2 plan ukrywa szósty wiersz kodów dwóch bloków
 *  (81R, 50BF) i rysuje parę zacisków P1/P2 pól liniowych pismem 9–9,6 px (< podłoga 13 px);
 *  od skali 1,3 komplet opisów celu jest narysowany ≥ podłoga — okno 4000 × 2240 daje tę skalę. */
const WIDOK_SEKCJI: Widok = { width: 4000, height: 2240 };

interface Kadr {
  readonly plik: string;
  readonly fikstura: string;
  readonly kadr: string | null;
}

const SEKCJE: readonly Kadr[] = [
  { plik: 'rozdzielnica-gpz-sekcja-1', fikstura: GPZ, kadr: `sekcja:${sekcjaGpz(gpz, 0)}` },
  { plik: 'rozdzielnica-gpz-sekcja-2', fikstura: GPZ, kadr: `sekcja:${sekcjaGpz(gpz, 1)}` },
];

/** Pole ZU fikstury wariantu (Z.13–Z.15, K4: dławik, dławik z rezystorem, rezystor). */
function poleZu(fikstura: string): string {
  return `pole:${model(fikstura).bays.find((b) => b.bay_role === 'ZU')?.ref_id ?? null}`;
}

const KADRY: readonly Kadr[] = [
  { plik: 'pole-tr1-z7', fikstura: GPZ, kadr: `pole:${poleTr(gpz, 0)}` },
  { plik: 'pole-tr2-z7', fikstura: GPZ, kadr: `pole:${poleTr(gpz, 1)}` },
  { plik: 'sprzeglo-z12', fikstura: GPZ, kadr: `pole:${poleSprzegla(gpz)}` },
  { plik: 'pole-zu-z13', fikstura: GPZ, kadr: `pole:${polePoSzablonie(gpz, '_enea_z13')}` },
  { plik: 'pole-zu-z14', fikstura: 'gpz110kvPoleZuZ14', kadr: poleZu('gpz110kvPoleZuZ14') },
  { plik: 'pole-zu-z15', fikstura: 'gpz110kvPoleZuZ15', kadr: poleZu('gpz110kvPoleZuZ15') },
  { plik: 'pole-bkr-z16', fikstura: GPZ, kadr: `pole:${polePoSzablonie(gpz, '_enea_z16')}` },
  { plik: 'pole-pomiaru-z17', fikstura: GPZ, kadr: `pole:${polePoSzablonie(gpz, '_enea_z17')}` },
  { plik: 'pole-liniowe-z10', fikstura: GPZ, kadr: `pole:${gpz.bays.find((b) => b.bay_role === 'OUT')?.ref_id ?? null}` },
  { plik: 'stacja-a', fikstura: STACJE, kadr: `stacja:${stacja(stacje, 'terminal')}` },
  { plik: 'stacja-b', fikstura: STACJE, kadr: `stacja:${stacja(stacje, 'inline')}` },
  { plik: 'stacja-c', fikstura: STACJE, kadr: `stacja:${stacja(stacje, 'branch')}` },
  { plik: 'stacja-d', fikstura: STACJE, kadr: `stacja:${stacja(stacje, 'sectional')}` },
];

async function zrzutKadru(page: Page, k: Kadr, theme: 'dark' | 'light', widok: Widok): Promise<void> {
  const motyw = theme === 'dark' ? 'ciemny' : 'jasny';
  expect(k.kadr && !k.kadr.endsWith(':null'), `kadr ${k.plik} bez refu w fiksturze ${k.fikstura}`).toBe(true);
  const bledy = await otworzHarness(page, k.fikstura, theme, k.kadr!, widok);
  expect(bledy, bledy.join('\n')).toEqual([]);
  // D3g: kadr odbiorczy bez komunikatu „Ukryto N opisów" i bez skróconych nazw („…").
  await expect(page.getByTestId('sld-v3-hidden-labels-hint')).toHaveCount(0);
  const skrocone = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="sld-canvas-v3"] text')]
      .filter((t) => !t.closest('[data-kadr="poza"]'))
      .map((t) => t.textContent ?? '')
      .filter((t) => t.includes('…')),
  );
  expect(skrocone).toEqual([]);
  const r = await ramkaCelu(page);
  expect(r, `kadr ${k.plik} bez elementów celu na rysunku`).not.toBeNull();
  // K1: cel kadru mieści się w oknie w całości (bez obcinania krawędzią).
  expect(r!.x, `${k.plik}: lewa krawędź celu`).toBeGreaterThanOrEqual(0);
  expect(r!.y, `${k.plik}: górna krawędź celu`).toBeGreaterThanOrEqual(0);
  expect(r!.x + r!.width, `${k.plik}: prawa krawędź celu`).toBeLessThanOrEqual(widok.width);
  expect(r!.y + r!.height, `${k.plik}: dolna krawędź celu`).toBeLessThanOrEqual(widok.height);
  const margines = 24;
  const x = Math.max(0, r!.x - margines);
  const y = Math.max(0, r!.y - margines);
  const plik = path.join(OUTPUT_DIR, `${k.plik}-${motyw}.png`);
  await page.screenshot({
    path: plik,
    clip: {
      x,
      y,
      width: Math.min(widok.width, r!.x + r!.width + margines) - x,
      height: Math.min(widok.height, r!.y + r!.height + margines) - y,
    },
  });
  expect(fs.existsSync(plik)).toBe(true);
}

test.describe('rozdzielnica-sn-korekta:screenshot — sekcje GPZ (okno szerokie)', () => {
  test.use({ deviceScaleFactor: 1 });

  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of ['dark', 'light'] as const) {
    for (const k of SEKCJE) {
      test(`${k.plik} — motyw ${theme}`, async ({ page }) => {
        await zrzutKadru(page, k, theme, WIDOK_SEKCJI);
      });
    }
  }
});

test.describe('rozdzielnica-sn-korekta:screenshot — pola GPZ i stacje SN/nN', () => {
  test.use({ deviceScaleFactor: 2 });

  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of ['dark', 'light'] as const) {
    for (const k of KADRY) {
      test(`${k.plik} — motyw ${theme}`, async ({ page }) => {
        await zrzutKadru(page, k, theme, WIDOK_POLA);
      });
    }
  }
});
