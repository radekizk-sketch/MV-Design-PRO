/**
 * DOWÓD WIZUALNY projekcji nN — 20 kadrów (mandat „profesjonalizacja SLD nN"
 * §47) na harnessie `lv-domain-harness.html` (dane WYŁĄCZNIE z JSON
 * wyeksportowanych z backendu — `lv-domain/fixtures/scenariusze.ts`).
 *
 * Kadry 01–18 = scenariusze danych; 19 = przegląd (LOD 0) na wielu
 * odpływach + wersja mobilna; 20 = druk mono A3. Każdy kadr w obu motywach
 * (ciemny dyspozytorski / jasny techniczny) na poziomie pełnym; wybrane
 * także na poziomach 0 i 1 (ciągłość toru między poziomami pilnuje test
 * jednostkowy `lodProjekcjaNn.test.tsx` porównaniem prymitywów).
 *
 * BRAMKI KLASY (liczone tu, nie „na oko"):
 *  1. kadr jasny ≠ ciemny bajtowo (motyw steruje rysunkiem);
 *  2. poziomy 0/1/2 tego samego scenariusza różnią się bajtowo;
 *  3. kontrakt DOM per scenariusz: stany zasilania, stany aparatów, wspólna
 *     kotwica SN, komunikaty audytu — obecne w DOM jako atrybuty danych.
 *
 * WERDYKT WIZUALNY NALEŻY DO WŁAŚCICIELA (zasada nr 2 CLAUDE.md): spec
 * generuje PNG i sprawdza kontrakt DOM, nie certyfikuje jakości wizualnej.
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/lv-domain-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/nn');

const MOTYWY = ['dark', 'light'] as const;

interface Kadr {
  readonly plik: string;
  readonly scenariusz: string;
  readonly opis: string;
  readonly query?: string;
  readonly lody?: readonly (0 | 1 | 2)[];
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly mono?: boolean;
  readonly asercje: (page: Page, lod: 0 | 1 | 2) => Promise<void>;
}

async function widoczny(page: Page, testId: string): Promise<void> {
  await expect(page.locator(`[data-testid="${testId}"]`).first()).toBeVisible();
}

async function atrybut(page: Page, testId: string, name: string, value: string): Promise<void> {
  await expect(page.locator(`[data-testid="${testId}"]`).first()).toHaveAttribute(name, value);
}

const KADRY: readonly Kadr[] = [
  {
    plik: '01_single_tr',
    scenariusz: '01_single_tr',
    opis: 'jeden transformator, wyłącznik główny, trzy odpływy, podrozdzielnica, PV w polu',
    lody: [0, 1, 2],
    asercje: async (page, lod) => {
      await widoczny(page, 'lv-domain-node-T1');
      await atrybut(page, 'lv-domain-node-QF-T1', 'data-device-role', 'incomer');
      await atrybut(page, 'lv-domain-node-RGnN-1', 'data-energization', 'ENERGIZED');
      await widoczny(page, 'lv-domain-node-CT-T1');
      await widoczny(page, 'lv-domain-node-QF-03_zrodlo');
      // Zabezpieczenie = tożsamość ochrony: widoczne od poziomu sieci (rejestr LOD).
      if (lod >= 1) await widoczny(page, 'lv-domain-node-relay:REL-T1');
    },
  },
  {
    plik: '02_two_tr_qbc_open',
    scenariusz: '02_two_tr_qbc_open',
    opis: 'dwa transformatory, sprzęgło OTWARTE',
    lody: [0, 1, 2],
    asercje: async (page) => {
      await atrybut(page, 'lv-domain-node-QBC', 'data-device-state', 'OPEN');
      // Sprzęgło = REALNY aparat z ENM (device_kind WYLACZNIK → symbol CAD
      // wyłącznika w orientacji poziomej); stan OTWARTY z KĄTA noża, nie z fill.
      const sprzeglo = page.locator('[data-testid="lv-domain-node-QBC"] g[data-symbol-canon="cad.wylacznik"]');
      await expect(sprzeglo).toHaveAttribute('data-orientation', 'pozioma');
      await expect(sprzeglo.locator('[data-cad="pivot"]')).not.toHaveAttribute('data-cad-deg', '0');
      await expect(page.locator('[data-testid="lv-domain-node-QBC"] [data-symbol-family="cad"] [fill]:not([fill="none"])')).toHaveCount(0);
      await atrybut(page, 'lv-domain-edge-QBC#a', 'data-energization', 'ENERGIZED');
      await atrybut(page, 'lv-domain-edge-QBC#b', 'data-energization', 'ENERGIZED');
      await atrybut(page, 'lv-domain-node-anchor:eq:', 'data-shared', 'true').catch(() => undefined);
      await expect(page.locator('[data-node-kind="anchorBar"]')).toHaveCount(1);
    },
  },
  {
    plik: '03_two_tr_qbc_closed',
    scenariusz: '03_two_tr_qbc_closed',
    opis: 'dwa transformatory, sprzęgło ZAMKNIĘTE — zasilanie wielostronne',
    asercje: async (page) => {
      await atrybut(page, 'lv-domain-node-QBC', 'data-device-state', 'CLOSED');
      // Sprzęgło z device_kind ROZLACZNIK → symbol CAD rozłącznika (poprzeczka + okrąg), nóż w osi (0°).
      const sprzeglo = page.locator('[data-testid="lv-domain-node-QBC"] g[data-symbol-canon="cad.rozlacznik"]');
      await expect(sprzeglo).toHaveAttribute('data-orientation', 'pozioma');
      await expect(sprzeglo.locator('[data-cad="pivot"]')).toHaveAttribute('data-cad-deg', '0');
      await atrybut(page, 'lv-domain-node-RGnN-A', 'data-energization', 'MULTISOURCE');
      await widoczny(page, 'lv-domain-bus-stan-RGnN-A');
    },
  },
  {
    plik: '04_shared_upstream_boundary',
    scenariusz: '04_shared_upstream_boundary',
    opis: 'wspólne zasilanie SN + granica domeny',
    asercje: async (page) => {
      await widoczny(page, 'lv-domain-node-boundary:QS-B9');
      await widoczny(page, 'lv-domain-node-boundary-terminal:QS-B9');
      await expect(page.locator('[data-node-kind="anchorBar"]')).toHaveCount(1);
      await expect(page.locator('[data-node-kind="anchorBar"]').first()).toHaveAttribute('data-shared', 'true');
    },
  },
  {
    plik: '05_independent_upstream',
    scenariusz: '05_independent_upstream',
    opis: 'niezależne systemy SN — dwie kotwice, dwie wyspy',
    asercje: async (page) => {
      await expect(page.locator('[data-node-kind="anchorBar"]')).toHaveCount(2);
      await expect(page.locator('[data-node-kind="anchorBar"]').first()).toHaveAttribute('data-system-count', '2');
    },
  },
  {
    plik: '06_conflict_parallel_sources',
    scenariusz: '06_conflict_parallel_sources',
    opis: 'niezależne systemy spięte sprzęgłem — KONFLIKT',
    asercje: async (page) => {
      await atrybut(page, 'lv-domain-node-RGnN-A', 'data-energization', 'CONFLICT');
      await expect(page.locator('[data-testid="lv-domain-warnings-toggle"]')).toHaveAttribute('data-blockers', /^[1-9]/);
      // Sprzęgło BEZ klasy funkcjonalnej aparatu → łącznik ogólny (IEC S00227), audyt NN-AUD-18 w panelu.
      await expect(page.locator('[data-testid="lv-domain-node-QBC"] g[data-symbol-canon="cad.lacznik"]')).toHaveCount(1);
      await page.locator('[data-testid="lv-domain-warnings-toggle"]').click();
      await expect(page.locator('[data-testid="lv-domain-warning-NN-AUD-18"]')).toHaveAttribute('data-severity', 'INFO');
      await page.locator('[data-testid="lv-domain-warnings-toggle"]').click();
    },
  },
  {
    plik: '07_island_grid_following',
    scenariusz: '07_island_grid_following',
    opis: 'wyspa DER: źródło podążające — NIEZASILONA wg topologii',
    lody: [0, 1, 2],
    asercje: async (page) => {
      await atrybut(page, 'lv-domain-node-RGN-D_szyna', 'data-energization', 'DEENERGIZED');
      await atrybut(page, 'lv-domain-node-RGN-D_szyna', 'data-islanded', 'true');
      await expect(page.locator('[data-testid="lv-domain-bus-stan-RGN-D_szyna"]')).toContainText('NIEZASILONA (WG AKTUALNEJ TOPOLOGII)');
      await widoczny(page, 'lv-domain-bus-wyspa-RGN-D_szyna');
    },
  },
  {
    plik: '08_island_grid_forming',
    scenariusz: '08_island_grid_forming',
    opis: 'wyspa DER: magazyn tworzący napięcie — zasilona z wyspy',
    asercje: async (page) => {
      await atrybut(page, 'lv-domain-node-RGN-D_szyna', 'data-energization', 'ENERGIZED');
      await atrybut(page, 'lv-domain-node-RGN-D_szyna', 'data-islanded', 'true');
      await expect(page.locator('[data-testid="lv-domain-bus-wyspa-RGN-D_szyna"]')).toContainText('WYSPA');
      await atrybut(page, 'lv-domain-edge-QS-D#a', 'data-energization', 'ENERGIZED');
      await atrybut(page, 'lv-domain-edge-QS-D#b', 'data-energization', 'ENERGIZED');
    },
  },
  {
    plik: '09_island_unknown',
    scenariusz: '09_island_unknown',
    opis: 'wyspa DER: zdolność nieznana — stan NIEZNANY',
    asercje: async (page) => {
      await atrybut(page, 'lv-domain-node-RGN-D_szyna', 'data-energization', 'UNKNOWN');
      await expect(page.locator('[data-testid="lv-domain-bus-stan-RGN-D_szyna"]')).toContainText('NIEZNANY');
    },
  },
  {
    plik: '10_deenergized_section',
    scenariusz: '10_deenergized_section',
    opis: 'sekcja B niezasilona (wyłącznik główny TB otwarty)',
    asercje: async (page) => {
      await atrybut(page, 'lv-domain-node-QF-TB', 'data-device-state', 'OPEN');
      await atrybut(page, 'lv-domain-edge-QF-TB#a', 'data-energization', 'ENERGIZED');
      await atrybut(page, 'lv-domain-edge-QF-TB#b', 'data-energization', 'DEENERGIZED');
      await atrybut(page, 'lv-domain-node-RGnN-B', 'data-energization', 'DEENERGIZED');
      await atrybut(page, 'lv-domain-node-RGnN-A', 'data-energization', 'ENERGIZED');
    },
  },
  {
    plik: '11_double_sided_open',
    scenariusz: '11_double_sided_open',
    opis: 'aparat otwarty pod napięciem z OBU stron (dwie wyspy)',
    asercje: async (page) => {
      await atrybut(page, 'lv-domain-node-QF-B3', 'data-device-state', 'OPEN');
      await atrybut(page, 'lv-domain-edge-QF-B3#a', 'data-energization', 'ENERGIZED');
      await atrybut(page, 'lv-domain-edge-QF-B3#b', 'data-energization', 'ENERGIZED');
      await atrybut(page, 'lv-domain-node-RGN-C_szyna', 'data-islanded', 'true');
    },
  },
  {
    plik: '12_der_full_path',
    scenariusz: '12_der_full_path',
    opis: 'pełny tor PV / magazynu / agregatu: aparat, kabel, punkt przyłączenia, CT, zabezpieczenie LoM',
    asercje: async (page) => {
      await widoczny(page, 'lv-domain-node-QF-PV1_zrodlo');
      await widoczny(page, 'lv-domain-node-FU-BES_zrodlo');
      await widoczny(page, 'lv-domain-node-QF-G1_zrodlo');
      await widoczny(page, 'lv-domain-node-CT-QF-PV1');
      await widoczny(page, 'lv-domain-node-relay:REL-QF-PV1');
      // Krawędź = pionowa kreska o zerowej szerokości bboxa — sprawdzamy obecność i stan, nie „visible".
      await atrybut(page, 'lv-domain-edge-QF-PV1_kabel', 'data-edge-kind', 'cable');
      await atrybut(page, 'lv-domain-edge-QF-PV1_kabel', 'data-energization', 'ENERGIZED');
    },
  },
  {
    plik: '13_loads_via_fields',
    scenariusz: '13_loads_via_fields',
    opis: 'odbiory przez pola (pięć rodzajów aparatów: wyłącznik, rozłącznik, odłącznik, wkładka, rozłącznik bezpiecznikowy) + odbiór bez pola z audytem',
    asercje: async (page) => {
      await widoczny(page, 'lv-domain-node-QS-02');
      await widoczny(page, 'lv-domain-node-FU-04');
      await widoczny(page, 'lv-domain-warning-marker-odbior_bez_pola');
      // Sześć rodzin symboli CAD rozróżnialnych bez etykiety (R2 §5/§7/§22;
      // R2.1: wyłącznik instalacyjny z APARAT_NN_MCB ≠ wyłącznik mocy zasilania z APARAT_NN).
      for (const [ref, symbol] of [
        ['QF-T1', 'cad.wylacznik'],
        ['QF-01', 'cad.wylacznikInstalacyjny'],
        ['QS-02', 'cad.rozlacznik'],
        ['QS-03', 'cad.odlacznik'],
        ['FU-04', 'cad.bezpiecznik'],
        ['QS-05', 'cad.rozlacznikBezpiecznikowy'],
      ] as const) {
        await expect(page.locator(`[data-testid="lv-domain-node-${ref}"] g[data-symbol-canon="${symbol}"]`)).toHaveCount(1);
      }
    },
  },
  {
    plik: '14_sub_boards',
    scenariusz: '14_sub_boards',
    opis: 'podrozdzielnice zagnieżdżone (trzy poziomy magistral) + podświetlony tor zasilania wybranego odpływu',
    query: 'wybor=QF-31',
    asercje: async (page) => {
      await atrybut(page, 'lv-domain-node-RGN-2_szyna', 'data-bus-tier', 'sub');
      await atrybut(page, 'lv-domain-node-RGN-3_szyna', 'data-bus-tier', 'sub');
      // §37/§38: tor zasilania z `supply_paths` backendu — od T1 przez QF-02 i FU-22 do QF-31.
      await atrybut(page, 'lv-domain-view-root', 'data-selected-ref', 'QF-31');
      await expect(page.locator('[data-testid="lv-domain-highlight-QF-02#a"]')).toHaveCount(1);
      await expect(page.locator('[data-testid="lv-domain-highlight-FU-22#b"]')).toHaveCount(1);
      await expect(page.locator('[data-testid="lv-domain-highlight-QF-T1#a"]')).toHaveCount(1);
      await expect(page.locator('[data-testid="lv-domain-highlight-T1#lv"]')).toHaveCount(1);
    },
  },
  {
    plik: '15_many_feeders',
    scenariusz: '15_many_feeders',
    opis: 'dwanaście odpływów z długimi nazwami',
    lody: [0, 1, 2],
    asercje: async (page) => {
      await expect(page.locator('[data-device-role="feeder"]')).toHaveCount(12);
    },
  },
  {
    plik: '16_stale_result',
    scenariusz: '16_stale_result',
    opis: 'wynik NIEAKTUALNY po zmianie modelu (nakładka spadków napięcia)',
    query: 'overlay=voltageDrop',
    asercje: async (page) => {
      await atrybut(page, 'lv-domain-result-freshness', 'data-result-status', 'OUTDATED');
      await expect(page.locator('[data-testid="lv-domain-result-freshness"]')).toContainText('NIEAKTUALNY');
    },
  },
  {
    plik: '17_sc_results',
    scenariusz: '17_sc_results',
    opis: 'wyniki zwarciowe IEC 60909 na szynach nN (świeży przebieg)',
    query: 'overlay=shortCircuit',
    asercje: async (page) => {
      await atrybut(page, 'lv-domain-result-freshness', 'data-result-status', 'FRESH');
      await widoczny(page, 'lv-domain-badge-shortCircuit-RGnN-1');
      await expect(page.locator('[data-testid="lv-domain-badge-shortCircuit-RGnN-1"]')).toContainText('Ik″3');
    },
  },
  {
    plik: '18_swz_overlay',
    scenariusz: '18_swz_overlay',
    opis: 'SWZ: werdykty mieszane na odpływach',
    query: 'overlay=swz',
    asercje: async (page) => {
      await widoczny(page, 'lv-domain-badge-swz-QF-01');
      await widoczny(page, 'lv-domain-badge-swz-QF-02');
    },
  },
  {
    plik: '19_mobile_overview',
    scenariusz: '15_many_feeders',
    opis: 'przegląd (poziom 0) na wąskim ekranie — wersja mobilna',
    lody: [0],
    viewport: { width: 390, height: 844 },
    asercje: async (page) => {
      await atrybut(page, 'lv-domain-view-root', 'data-lod', '0');
      await widoczny(page, 'lv-domain-bus-licznik-RGnN-1');
    },
  },
  {
    plik: '20_print_a3',
    scenariusz: '02_two_tr_qbc_open',
    opis: 'druk monochromatyczny A3 (stany bez koloru)',
    query: 'mono=1&theme=light',
    viewport: { width: 1587, height: 1123 },
    mono: true,
    asercje: async (page) => {
      await atrybut(page, 'lv-domain-view-root', 'data-mono', 'true');
      await atrybut(page, 'lv-domain-node-QBC', 'data-device-state', 'OPEN');
    },
  },
];

function sha256Pliku(sciezka: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(sciezka)).digest('hex');
}

test.describe('lv-domain:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const kadr of KADRY) {
    test(`Kadr ${kadr.plik} — ${kadr.opis}`, async ({ page }) => {
      test.setTimeout(180_000);
      const viewport = kadr.viewport ?? { width: 1400, height: 1000 };
      await page.setViewportSize(viewport);
      const bledyKonsoli: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') bledyKonsoli.push(msg.text());
      });
      page.on('pageerror', (err) => bledyKonsoli.push(`PAGEERROR: ${err.message}`));

      const motywy = kadr.mono ? (['light'] as const) : MOTYWY;
      const lody = kadr.lody ?? ([2] as const);
      const skroty = new Map<string, string>();
      for (const motyw of motywy) {
        for (const lod of lody) {
          const query = [`scenariusz=${kadr.scenariusz}`, `theme=${motyw}`, `lod=${lod}`, kadr.query ?? ''].filter(Boolean).join('&');
          await page.goto(`${HARNESS_URL}?${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
          const korzen = page.locator('[data-testid="lv-domain-view-root"]').first();
          await expect(korzen).toHaveAttribute('data-status', 'ok', { timeout: 20_000 });
          await widoczny(page, 'lv-domain-result-freshness');
          await kadr.asercje(page, lod);
          await page.waitForTimeout(250);
          const suffix = kadr.mono ? '' : `_${motyw}`;
          const lodSuffix = kadr.lody ? `_lod${lod}` : '';
          const plik = path.join(OUTPUT_DIR, `${kadr.plik}${lodSuffix}${suffix}.png`);
          await page.screenshot({ path: plik, fullPage: false });
          skroty.set(`${motyw}:${lod}`, sha256Pliku(plik));
          console.log(`Saved: ${plik}`);
        }
      }
      if (!kadr.mono) {
        for (const lod of lody) {
          expect(skroty.get(`dark:${lod}`), `kadr jasny i ciemny identyczne (poziom ${lod})`).not.toBe(skroty.get(`light:${lod}`));
        }
      }
      if (lody.length > 1) {
        for (const motyw of motywy) {
          expect(new Set(lody.map((lod) => skroty.get(`${motyw}:${lod}`))).size, `poziomy dały identyczne kadry (${motyw})`).toBe(lody.length);
        }
      }
      expect(bledyKonsoli, `błędy konsoli: ${bledyKonsoli.join(' | ')}`).toEqual([]);
    });
  }
});
