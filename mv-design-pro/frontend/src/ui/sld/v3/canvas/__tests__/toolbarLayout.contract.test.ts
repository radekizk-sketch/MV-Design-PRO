/**
 * KD-8 poz. 2, bramka 2 — KONTRAKT ROZŁĄCZNOŚCI GRUP PASA NARZĘDZI.
 *
 * Defekt z oceny właściciela: chip „↓ SVG" nachodził na „+ BESS", a trzy rzędy
 * pływających kontrolek zachodziły na siebie przy węższej kanwie. Ten test
 * mierzy WPROST to, czego wtedy zabrakło: przy KAŻDEJ szerokości prostokąty
 * grup są rozłączne i mieszczą się w kanwie, a przy ciasnocie grupy ZWIJAJĄ
 * się do menu, zamiast nachodzić.
 *
 * Test jest na czystej funkcji, bo to ona podejmuje decyzję; że rozwinięte
 * grupy fizycznie nie nachodzą, gwarantuje dodatkowo układ (jeden rząd flex) —
 * co mierzy spec e2e `kd8-pasek-narzedzi.spec.ts` na ŻYWEJ przeglądarce.
 */
import { describe, expect, it } from 'vitest';

import {
  CANVAS_TOOLBAR_GROUPS,
  TOOLBAR_EDGE_PX,
  TOOLBAR_FULL_WIDTH_PX,
  TOOLBAR_GAP_PX,
  isToolbarGroupExpanded,
  layoutCanvasToolbar,
  type CanvasToolbarLayout,
} from '../toolbarLayout';

function prostokaty(layout: CanvasToolbarLayout): readonly { x: number; width: number; id: string }[] {
  const out: { x: number; width: number; id: string }[] = layout.slots.map((s) => ({ x: s.x, width: s.width, id: s.id }));
  if (layout.menuSlot) out.push({ x: layout.menuSlot.x, width: layout.menuSlot.width, id: 'menu' });
  return out;
}

const SZEROKOSCI: readonly number[] = [
  320, 480, 640, 800, 960, 1020, 1152, 1280, 1366, 1440, 1600, 1680, 1920, 2048, 2560, 3840,
];

describe('pas narzędzi kanwy — rozłączność przy każdej szerokości', () => {
  for (const width of SZEROKOSCI) {
    it(`${width} px: prostokąty grup są parami rozłączne`, () => {
      const rects = prostokaty(layoutCanvasToolbar(width));
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          const rozlaczne = a.x + a.width <= b.x || b.x + b.width <= a.x;
          expect(rozlaczne, `${a.id} (${a.x}..${a.x + a.width}) × ${b.id} (${b.x}..${b.x + b.width})`).toBe(true);
        }
      }
    });

    it(`${width} px: odstęp między sąsiadami == kontrakt (${TOOLBAR_GAP_PX} px)`, () => {
      const rects = prostokaty(layoutCanvasToolbar(width));
      for (let i = 1; i < rects.length; i++) {
        expect(rects[i].x - (rects[i - 1].x + rects[i - 1].width)).toBe(TOOLBAR_GAP_PX);
      }
    });
  }

  it('pas zaczyna się na marginesie kanwy', () => {
    for (const width of SZEROKOSCI) {
      const layout = layoutCanvasToolbar(width);
      const pierwszy = prostokaty(layout)[0];
      expect(pierwszy.x).toBe(TOOLBAR_EDGE_PX);
    }
  });

  it('przy szerokości pełnej NIC się nie zwija', () => {
    const layout = layoutCanvasToolbar(TOOLBAR_FULL_WIDTH_PX);
    expect(layout.collapsed).toEqual([]);
    expect(layout.menuSlot).toBeNull();
    expect(layout.slots.map((s) => s.id)).toEqual(CANVAS_TOOLBAR_GROUPS.map((g) => g.id));
    const ostatni = layout.slots[layout.slots.length - 1];
    expect(ostatni.x + ostatni.width + TOOLBAR_EDGE_PX).toBeLessThanOrEqual(TOOLBAR_FULL_WIDTH_PX);
  });

  it('zwężanie ZWIJA grupy (nigdy nie nakłada), w kolejności rangi', () => {
    const kolejnosc: string[] = [];
    for (let width = TOOLBAR_FULL_WIDTH_PX; width >= 200; width -= 4) {
      for (const id of layoutCanvasToolbar(width).collapsed) {
        if (!kolejnosc.includes(id)) kolejnosc.push(id);
      }
    }
    const wgRangi = [...CANVAS_TOOLBAR_GROUPS].sort((a, b) => a.rank - b.rank).map((g) => g.id);
    expect(kolejnosc).toEqual(wgRangi.slice(0, kolejnosc.length));
  });

  it('grupa o najwyższej randze zostaje rozwinięta także przy 1280 px', () => {
    const najwyzsza = [...CANVAS_TOOLBAR_GROUPS].sort((a, b) => b.rank - a.rank)[0];
    expect(isToolbarGroupExpanded(layoutCanvasToolbar(1280), najwyzsza.id)).toBe(true);
  });

  // Kontrakt z komentarza minimów (`toolbarLayout.ts`): dok widoku (Dopasuj widok, Wstecz, Cały
  // arkusz, Legenda, Nawigator, powiększenie oknem) NIE zwija się na kanwie 800 px. Pomiar
  // 2026-11-12: dopisanie do doku przycisku „⬚ Okno” i wskaźnika skali (616 px) zwijało go do
  // menu „Narzędzia” i przełączniki legendy i nawigatora znikały z pasa (workspacePanels ×7).
  it('dok widoku i drzewo układu zostają rozwinięte na kanwie 800 px', () => {
    for (const width of [800, 960, 1020]) {
      const layout = layoutCanvasToolbar(width);
      expect(isToolbarGroupExpanded(layout, 'widok'), `${width} px`).toBe(true);
      expect(isToolbarGroupExpanded(layout, 'drzewo'), `${width} px`).toBe(true);
    }
  });

  it('każda grupa jest ZAWSZE osiągalna: rozwinięta albo w menu', () => {
    for (const width of SZEROKOSCI) {
      const layout = layoutCanvasToolbar(width);
      for (const grupa of CANVAS_TOOLBAR_GROUPS) {
        const rozwinieta = isToolbarGroupExpanded(layout, grupa.id);
        const wMenu = layout.collapsed.includes(grupa.id);
        expect(rozwinieta !== wMenu, `${grupa.id} przy ${width} px`).toBe(true);
      }
    }
  });

  it('układ jest DETERMINISTYCZNY (ta sama szerokość ⇒ ten sam wynik)', () => {
    for (const width of SZEROKOSCI) {
      expect(JSON.stringify(layoutCanvasToolbar(width))).toBe(JSON.stringify(layoutCanvasToolbar(width)));
    }
  });

  it('szerokość niewiarygodna (0/NaN) nie wywraca układu', () => {
    for (const width of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const layout = layoutCanvasToolbar(width);
      expect(Array.isArray(layout.slots)).toBe(true);
      const rects = prostokaty(layout);
      for (let i = 1; i < rects.length; i++) {
        expect(rects[i].x).toBeGreaterThanOrEqual(rects[i - 1].x + rects[i - 1].width);
      }
    }
  });
});

// Uwaga koordynatora 2026-11-11 (zrzut wejścia z wyników zwarć): etykiety przycisków pasa
// kanwy łamały się w dwa wiersze („Drzewo / układu”, „Dopasuj / widok”). Tekst przycisku nie
// może się łamać (zasada właściciela, ta sama co dla stanowiska EAZ), a klasa przycisku pasa
// ma JEDNO źródło — kopia klasy w module kanwy wróciłaby bez tej reguły.
describe('przyciski pasa kanwy — tekst w jednym wierszu, jedna klasa', () => {
  it('klasa przycisku doku zakazuje łamania tekstu', async () => {
    const { KLASA_PRZYCISKU_DOKU } = await import('../KontekstKadru');
    expect(KLASA_PRZYCISKU_DOKU.split(/\s+/)).toContain('whitespace-nowrap');
    // Etykiety przycisków pismem interfejsu, nie o stałej szerokości (czytelność słów).
    expect(KLASA_PRZYCISKU_DOKU.split(/\s+/)).toContain('font-sans-eng');
    expect(KLASA_PRZYCISKU_DOKU.split(/\s+/)).not.toContain('font-mono-eng');
  });

  it('moduł kanwy nie niesie własnej kopii klasy przycisku (jedno źródło)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));
    const zrodlo = readFileSync(resolve(here, '../SldCanvasV3Workspace.tsx'), 'utf8');
    expect(zrodlo.match(/className="h-7 rounded border/g) ?? []).toEqual([]);
  });
});
