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
 * Kadr pola = suma obrysów elementów kanwy, których `data-testid` zawiera ref pola, ref
 * transformatora albo ref gałęzi sprzęgła (refy czytane z fikstury, nie zgadywane), oraz tła
 * pola `sld-v3-gpz-panel-⟨ref⟩`. Spec sprawdza wyłącznie, że kadr ma narysowane elementy,
 * i zapisuje PNG. Werdykt wizualny NALEŻY DO WŁAŚCICIELA (zasada nr 2, B-02).
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

/** Refy kadru: pole wg szablonu, transformator z jego polem TR, sprzęgło z jego polem. */
function refyPolaSzablonu(m: ModelFikstury, szablon: string): readonly string[] {
  return m.bays.filter((b) => (b.bay_template_ref ?? '').includes(szablon) && b.bay_role !== 'TR').map((b) => b.ref_id);
}

function refyTransformatora(m: ModelFikstury, indeks: number): readonly string[] {
  const tr = m.transformers.filter((t) => t.ref_id.includes('/wn_sn'))[indeks];
  if (!tr) return [];
  const pola = m.bays.filter((b) => (b.equipment_refs ?? []).includes(tr.ref_id)).map((b) => b.ref_id);
  return [tr.ref_id, ...pola];
}

function refySprzegla(m: ModelFikstury): readonly string[] {
  const galezie = m.branches.filter((g) => g.type === 'bus_coupler').map((g) => g.ref_id);
  const pola = m.bays
    .filter((b) => b.bay_role === 'COUPLER' || (b.equipment_refs ?? []).some((r) => galezie.includes(r)))
    .map((b) => b.ref_id);
  return [...galezie, ...pola];
}

/** Refy kadru sekcji GPZ: sekcja, jej pola (z polem TR) i transformator przypięty polem TR sekcji. */
function refySekcjiGpz(m: ModelFikstury, indeks: number): readonly string[] {
  const gpzStacja = m.substations.find((s) => s.station_type === 'gpz');
  const sekcja = gpzStacja?.gpz_sections?.[indeks];
  if (!sekcja) return [];
  const pola = (m.bays as readonly (ModelFikstury['bays'][number] & { readonly gpz_section_id?: string | null })[]).filter(
    (b) => b.gpz_section_id === sekcja.section_id,
  );
  const transformatory = m.transformers
    .filter((t) => pola.some((b) => b.bay_role === 'TR' && (b.equipment_refs ?? []).includes(t.ref_id)))
    .map((t) => t.ref_id);
  return [sekcja.section_id, ...pola.map((b) => b.ref_id), ...transformatory];
}

function refyStacji(m: ModelFikstury, typ: string): readonly string[] {
  const stacja = m.substations.find((s) => s.station_type === typ);
  return stacja ? [stacja.ref_id.replace(/\/station$/, '/')] : [];
}

async function otworzHarness(page: Page, fikstura: string, theme: 'dark' | 'light'): Promise<string[]> {
  await page.setViewportSize({ width: 1800, height: 1100 });
  const bledy: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') bledy.push(msg.text());
  });
  page.on('pageerror', (err) => bledy.push(`PAGEERROR: ${err.message}`));
  await page.goto(`${HARNESS_URL}?fixture=${fikstura}&lod=2&theme=${theme}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await expect(page.locator('[data-testid="sld-harness-root"]').first()).toHaveAttribute('data-status', 'ready', {
    timeout: 20_000,
  });
  await expect(page.locator('[data-testid="sld-canvas-v3"]').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(900);
  return bledy;
}

/** Ramka ekranowa elementów kanwy, których `data-testid` zawiera któryś z refów. */
async function ramka(page: Page, refy: readonly string[]): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate((lista) => {
    const kanwa = document.querySelector('[data-testid="sld-canvas-v3"]');
    const elementy = [...(kanwa?.querySelectorAll('[data-testid]') ?? [])].filter((el) => {
      const id = el.getAttribute('data-testid') ?? '';
      if (id.startsWith('sld-v3-gpz-tabela') || id.startsWith('sld-v3-tabela')) return false;
      return lista.some((ref) => id.includes(ref));
    });
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
  }, [...refy]);
}

const gpz = model(GPZ);
const stacje = model(STACJE);
const KADRY: readonly { readonly plik: string; readonly fikstura: string; readonly refy: readonly string[] }[] = [
  { plik: 'pole-tr1-z7', fikstura: GPZ, refy: refyTransformatora(gpz, 0) },
  { plik: 'pole-tr2-z7', fikstura: GPZ, refy: refyTransformatora(gpz, 1) },
  { plik: 'sprzeglo-z12', fikstura: GPZ, refy: refySprzegla(gpz) },
  { plik: 'pole-zu-z13', fikstura: GPZ, refy: refyPolaSzablonu(gpz, '_enea_z13') },
  { plik: 'pole-bkr-z16', fikstura: GPZ, refy: refyPolaSzablonu(gpz, '_enea_z16') },
  { plik: 'pole-pomiaru-z17', fikstura: GPZ, refy: refyPolaSzablonu(gpz, '_enea_z17') },
  { plik: 'pole-liniowe-z10', fikstura: GPZ, refy: gpz.bays.filter((b) => b.bay_role === 'OUT').slice(0, 1).map((b) => b.ref_id) },
  { plik: 'stacja-a', fikstura: STACJE, refy: refyStacji(stacje, 'terminal') },
  { plik: 'stacja-b', fikstura: STACJE, refy: refyStacji(stacje, 'inline') },
  { plik: 'stacja-c', fikstura: STACJE, refy: refyStacji(stacje, 'branch') },
  { plik: 'stacja-d', fikstura: STACJE, refy: refyStacji(stacje, 'sectional') },
];

test.describe('rozdzielnica-sn-korekta:screenshot — rozdzielnica SN GPZ i stacji SN/nN', () => {
  test.use({ deviceScaleFactor: 2 });

  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const theme of ['dark', 'light'] as const) {
    const motyw = theme === 'dark' ? 'ciemny' : 'jasny';
    // Decyzja architekta D3g: kadr oględzin rozdzielnicy w skali, w której nazwy pól, sekcji
    // i aparatów są narysowane — bez komunikatu „Ukryto N opisów". Cała rozdzielnica dwusekcyjna
    // nie mieści się w tej skali w oknie, więc kadr dzielimy na sekcje (przybliżenie natywnym
    // kółkiem nad środkiem kadru sekcji, aż plan etykiet niczego nie ukrywa).
    for (const indeks of [0, 1]) {
      test(`rozdzielnica GPZ — sekcja ${indeks + 1} — motyw ${theme}`, async ({ page }) => {
        const refy = refySekcjiGpz(gpz, indeks);
        expect(refy.length, `sekcja ${indeks + 1} bez refów w fiksturze ${GPZ}`).toBeGreaterThan(1);
        const bledy = await otworzHarness(page, GPZ, theme);
        expect(bledy, bledy.join('\n')).toEqual([]);
        const etykiety = page.locator('[data-hidden-unreadable]').first();
        for (let i = 0; i < 40; i += 1) {
          const ukryte = Number((await etykiety.getAttribute('data-hidden-unreadable')) ?? '0');
          if (ukryte === 0 && (await page.getByTestId('sld-v3-hidden-labels-hint').count()) === 0) break;
          const r = await ramka(page, refy);
          if (!r) break;
          await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
          await page.mouse.wheel(0, -120);
          await page.waitForTimeout(150);
        }
        await page.waitForTimeout(400);
        expect(Number((await etykiety.getAttribute('data-hidden-unreadable')) ?? '0')).toBe(0);
        await expect(page.getByTestId('sld-v3-hidden-labels-hint')).toHaveCount(0);
        // D3e: w tej skali żadna nazwa nie jest skracana planem etykiet (znak „…").
        const skrocone = await page.evaluate(() =>
          [...document.querySelectorAll('[data-testid="sld-canvas-v3"] text')]
            .map((t) => t.textContent ?? '')
            .filter((t) => t.includes('…')),
        );
        expect(skrocone).toEqual([]);
        const r = await ramka(page, refy);
        expect(r, `sekcja ${indeks + 1} bez elementów na rysunku`).not.toBeNull();
        const widok = page.viewportSize()!;
        const margines = 40;
        const x = Math.max(0, r!.x - margines);
        const y = Math.max(0, r!.y - margines);
        const plik = path.join(OUTPUT_DIR, `rozdzielnica-gpz-sekcja-${indeks + 1}-${motyw}.png`);
        await page.screenshot({
          path: plik,
          clip: {
            x,
            y,
            width: Math.min(widok.width - x, r!.width + 2 * margines),
            height: Math.min(widok.height - y, r!.height + 2 * margines),
          },
        });
        expect(fs.existsSync(plik)).toBe(true);
      });
    }

    for (const kadr of KADRY) {
      test(`${kadr.plik} — motyw ${theme}`, async ({ page }) => {
        expect(kadr.refy.length, `kadr ${kadr.plik} bez refów w fiksturze ${kadr.fikstura}`).toBeGreaterThan(0);
        const bledy = await otworzHarness(page, kadr.fikstura, theme);
        expect(bledy, bledy.join('\n')).toEqual([]);
        const r = await ramka(page, kadr.refy);
        expect(r, `kadr ${kadr.plik} bez elementów na rysunku`).not.toBeNull();
        const margines = 40;
        const plik = path.join(OUTPUT_DIR, `${kadr.plik}-${motyw}.png`);
        await page.screenshot({
          path: plik,
          clip: {
            x: Math.max(0, r!.x - margines),
            y: Math.max(0, r!.y - margines),
            width: r!.width + 2 * margines,
            height: r!.height + 2 * margines,
          },
        });
        expect(fs.existsSync(plik)).toBe(true);
      });
    }
  }
});
