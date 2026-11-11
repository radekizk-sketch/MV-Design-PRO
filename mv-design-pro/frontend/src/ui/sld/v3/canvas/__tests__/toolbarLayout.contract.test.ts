// @vitest-environment node
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
  etykietyGrup,
  isToolbarGroupExpanded,
  layoutCanvasToolbar,
  STAN_ETYKIET_NAJSZERSZY,
  szacunekSzerokosciGrup,
  szerokoscPrzyciskuDoku,
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

/**
 * SLD-CZYTELNOSC-STACJI (ocena właściciela 0/10, 2026-11-11): szerokości grup z ETYKIET
 * (krój interfejsu) i z POMIARU DOM, nie z literałów. Dawne minima (np. 492 px doku widoku
 * „policzone” bez „Widok: roboczy”) były mniejsze od realnego rzędu, więc przyciski zawijały
 * etykiety na dwa wiersze ucinane przez `h-7`, a „Narzędzia” wypadało za kanwę.
 */
describe('pas narzędzi kanwy — szerokości z etykiet i z pomiaru', () => {
  it('minimum każdej grupy = szacunek z etykiet w najszerszym stanie (licznik legendy dwucyfrowy, „Widok: roboczy”)', () => {
    const szacunek = szacunekSzerokosciGrup(STAN_ETYKIET_NAJSZERSZY);
    for (const g of CANVAS_TOOLBAR_GROUPS) {
      expect(g.minWidth, g.id).toBe(szacunek[g.id]);
      // Każda etykieta rzędu mieści się w szacunku grupy (szacunek nie zaniża żadnego przycisku).
      const etykiety = etykietyGrup(STAN_ETYKIET_NAJSZERSZY)[g.id];
      const suma = etykiety.reduce((s, e) => s + szerokoscPrzyciskuDoku(e), 0);
      expect(g.minWidth, g.id).toBeGreaterThanOrEqual(suma);
    }
  });

  it('licznik legendy i tryb widoku zmieniają szacunek dodatków widoku (etykieta zmienna wchodzi do szerokości)', () => {
    const krotki = szacunekSzerokosciGrup({ licznikLegendy: 8, trybWidoku: 'arkusz' });
    const dlugi = szacunekSzerokosciGrup({ licznikLegendy: 18, trybWidoku: 'roboczy' });
    expect(dlugi.widokDodatki).toBeGreaterThan(krotki.widokDodatki);
  });

  it('pomiar DOM zastępuje szacunek: grupa zmierzona szerzej zwija się wcześniej, węższa — później', () => {
    const szerokosc = 900;
    const bezPomiaru = layoutCanvasToolbar(szerokosc);
    const szerzej = layoutCanvasToolbar(szerokosc, { widok: 2000 });
    expect(isToolbarGroupExpanded(szerzej, 'widok')).toBe(false);
    const wezej = layoutCanvasToolbar(szerokosc, { uklady: 10, eksport: 10, widokDodatki: 10 });
    expect(wezej.collapsed.length).toBeLessThanOrEqual(bezPomiaru.collapsed.length);
    // Pomiar zerowy/niewiarygodny (jsdom, grupa jeszcze nienarysowana) nie zastępuje szacunku.
    expect(JSON.stringify(layoutCanvasToolbar(szerokosc, { widok: 0, drzewo: Number.NaN }))).toBe(
      JSON.stringify(bezPomiaru),
    );
  });

  it('przy kanwie 795 px (okno 1440×900 z otwartym inspektorem) polecenia kadru zostają w pasie, dodatki idą do menu', () => {
    const uklad = layoutCanvasToolbar(795);
    expect(isToolbarGroupExpanded(uklad, 'drzewo')).toBe(true);
    expect(isToolbarGroupExpanded(uklad, 'widok')).toBe(true);
    expect(uklad.collapsed).toContain('widokDodatki');
    const ostatni = uklad.menuSlot ?? uklad.slots[uklad.slots.length - 1];
    expect(ostatni.x + ostatni.width + TOOLBAR_EDGE_PX).toBeLessThanOrEqual(795);
  });
});
