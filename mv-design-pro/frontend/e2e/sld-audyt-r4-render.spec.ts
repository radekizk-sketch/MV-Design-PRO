/**
 * AUDYT SLD — runda R4: pomiar NA RENDERZE (nie na modelu sceny).
 *
 * DLACZEGO TA RUNDA POWSTAŁA. Runda R3 została wycofana (V12K-214), bo mierzyła
 * `buildSceneV3` i wnioskowała o rysunku. Kolor, paleta, ramka i tabelka żyją w
 * warstwie renderu (`SldCanvasV3.tsx`, `sheet/Frame.tsx`, `export/exportPalette.ts`),
 * więc brak pola w scenie NIE dowodzi braku na rysunku. Ta runda czyta to, co
 * faktycznie trafiło do DOM.
 *
 * METODA (lekcja z wycofania R3): wypisujemy PEŁNE INWENTARZE — histogram
 * wszystkich użytych kolorów obrysu, wszystkich atrybutów `data-*`, wszystkich
 * `data-testid` — zamiast pytać „czy istnieje X" zgadywaną nazwą. Pytanie
 * potwierdzające uprzedzenie dało trzy fałszywe zarzuty w R3.
 *
 * Ten spec NIE jest bramką — jest przyrządem pomiarowym. Nie stawia asercji na
 * treści rysunku (poza brakiem błędów konsoli), tylko RAPORTUJE stan do logu.
 */
import { test, expect, type Page } from '@playwright/test';

const HARNESS_URL = 'http://127.0.0.1:5173/screenshot-harness.html';
const POZIOMY = [0, 1, 2] as const;

async function otworz(page: Page, lod: number): Promise<void> {
  // `networkidle` jest zawodne przy dev-serverze Vite (HMR trzyma otwarte
  // połączenie, a pierwszy wejściowy test płaci koszt kompilacji na żądanie) —
  // czekamy na DOM, a gotowość kanwy potwierdza selektor `data-lod-override`.
  await page.goto(`${HARNESS_URL}?lod=${lod}&theme=dark`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForSelector('[data-lod-override]', { timeout: 30_000 });
  await expect(page.locator('[data-lod-override]').first()).toHaveAttribute(
    'data-lod-override',
    String(lod),
  );
  await page.waitForTimeout(600);
}

test.describe('AUDYT R4 — inwentarz renderu SLD', () => {
  for (const lod of POZIOMY) {
    test(`L${lod}: pełny inwentarz DOM`, async ({ page }) => {
      const bledy: string[] = [];
      page.on('console', (m) => m.type() === 'error' && bledy.push(m.text()));
      await otworz(page, lod);

      const raport = await page.evaluate(() => {
        const svg = document.querySelector('svg');
        if (!svg) return { blad: 'brak SVG w DOM' };
        const wszystkie = [...svg.querySelectorAll('*')];

        // 1. HISTOGRAM KOLORÓW OBRYSU — czy rysunek w ogóle różnicuje kolory?
        const kolory = new Map<string, number>();
        for (const el of wszystkie) {
          const cs = getComputedStyle(el as Element);
          const s = cs.stroke;
          if (!s || s === 'none') continue;
          kolory.set(s, (kolory.get(s) ?? 0) + 1);
        }

        // 2. WSZYSTKIE ATRYBUTY data-* obecne w drzewie (nazwy, nie wartości)
        const atrybuty = new Map<string, number>();
        for (const el of wszystkie) {
          for (const a of (el as Element).getAttributeNames()) {
            if (a.startsWith('data-')) atrybuty.set(a, (atrybuty.get(a) ?? 0) + 1);
          }
        }

        // 3. WSZYSTKIE data-testid (pełna lista unikatów) — pokaże, czy jest
        //    tabelka rysunkowa, legenda, pasek LOD itd. bez zgadywania nazwy.
        // Pomijamy identyfikatory instancji (zawierają 'stn/'/'#') — interesuje
        // nas inwentarz RODZAJÓW bloków arkusza (tabelka, legenda, pasek LOD).
        const testid = new Set<string>();
        for (const el of document.querySelectorAll('[data-testid]')) {
          const v = el.getAttribute('data-testid') ?? '';
          if (!v.includes('stn/') && !v.includes('#')) testid.add(v);
        }

        // 4. Rozkład wartości atrybutów, które mogą nieść napięcie/stan/NOP —
        //    nazwy bierzemy Z DRZEWA (pkt 2), nie z domysłu.
        const interesujace = [...atrybuty.keys()].filter((a) =>
          /volt|napiec|kv|band|state|stan|nop|open|energ/i.test(a),
        );
        const wartosci: Record<string, string[]> = {};
        for (const a of interesujace) {
          const zbior = new Set<string>();
          for (const el of svg.querySelectorAll(`[${a}]`)) {
            zbior.add(el.getAttribute(a) ?? '');
          }
          wartosci[a] = [...zbior].slice(0, 12);
        }

        return {
          elementowSvg: wszystkie.length,
          kolory: [...kolory.entries()].sort((a, b) => b[1] - a[1]),
          atrybuty: [...atrybuty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30),
          testid: [...testid].sort(),
          wartosci,
        };
      });

      const fs = await import('node:fs');
      // NIE do `test-results/` — Playwright czyści ten katalog na starcie każdego
      // przebiegu, więc raport z L1 ginął, gdy dobiegał L2.
      const katalog = 'audyt-r4';
      fs.mkdirSync(katalog, { recursive: true });
      fs.writeFileSync(`${katalog}/audyt_r4_L${lod}.json`, JSON.stringify(raport, null, 1));
      console.log(`L${lod}: elementów SVG=${(raport as { elementowSvg?: number }).elementowSvg} → ${katalog}/audyt_r4_L${lod}.json`);
      expect(bledy, `błędy konsoli L${lod}: ${bledy.join(' | ')}`).toEqual([]);
    });
  }
});
