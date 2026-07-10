/**
 * SLD V3 F1 — wyrocznie biblioteki symboli (SLD_CAD_SPEC_V3 §2/§3/§11).
 *
 * grid_probe (statyczny): bbox wielokrotnością GRID, porty NA siatce i NA
 * krawędzi bboxa. Stany łączników wyrażone GEOMETRIĄ (różne d/fill), nie
 * kolorem. Rejestr glifów kompletny względem definicji.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { GRID, isOnGrid } from '../../core/grid';
import { LABEL_TYPOGRAPHY, labelLineHeight, measureLabelWidth } from '../../core/text';
import { SYMBOL_DEFS, makeBusbarDef, type SymbolId } from '../defs';
import { SYMBOL_GLYPHS, SYMBOL_IDS } from '../glyphs';

const ids = Object.keys(SYMBOL_DEFS) as SymbolId[];

describe('V3 symbols — grid_probe (spec §11.2)', () => {
  it.each(ids)('%s: bbox wielokrotnością GRID', (id) => {
    const d = SYMBOL_DEFS[id];
    expect(d.width % GRID, `width ${d.width}`).toBe(0);
    expect(d.height % GRID, `height ${d.height}`).toBe(0);
  });

  it.each(ids)('%s: porty na siatce i na krawędzi bboxa, nazwy unikalne', (id) => {
    const d = SYMBOL_DEFS[id];
    const names = new Set<string>();
    for (const p of d.ports) {
      expect(isOnGrid(p.x), `${id}.${p.name}.x=${p.x}`).toBe(true);
      expect(isOnGrid(p.y), `${id}.${p.name}.y=${p.y}`).toBe(true);
      const onEdge = p.x === 0 || p.x === d.width || p.y === 0 || p.y === d.height;
      expect(onEdge, `${id}.${p.name} musi leżeć na krawędzi bboxa`).toBe(true);
      expect(names.has(p.name)).toBe(false);
      names.add(p.name);
    }
    expect(d.ports.length).toBeGreaterThan(0);
    expect(d.labelPl.length).toBeGreaterThan(2);
  });

  it('szyna: fabryka wymusza długość na siatce', () => {
    expect(() => makeBusbarDef(160)).not.toThrow();
    expect(() => makeBusbarDef(161)).toThrow();
    expect(() => makeBusbarDef(GRID)).toThrow();
    const bus = makeBusbarDef(160);
    expect(bus.ports.map((p) => p.name)).toEqual(['left', 'right']);
    expect(bus.ports[1].x).toBe(160);
  });
});

describe('V3 symbols — rejestr glifów i stany', () => {
  it('każda definicja ma glif i odwrotnie', () => {
    expect(new Set(SYMBOL_IDS)).toEqual(new Set(ids));
    for (const id of ids) expect(typeof SYMBOL_GLYPHS[id]).toBe('function');
  });

  it.each(ids)('%s: glif renderuje data-symbol-canon', (id) => {
    const Glyph = SYMBOL_GLYPHS[id];
    const { container } = render(<svg><Glyph x={0} y={0} /></svg>);
    expect(container.querySelector(`[data-symbol-canon="${id}"]`)).toBeTruthy();
  });

  it('wyłącznik: stan zamknięty/otwarty różni się GEOMETRIĄ (wypełnienie)', () => {
    const Glyph = SYMBOL_GLYPHS.breaker;
    const closed = render(<svg><Glyph x={0} y={0} state="closed" /></svg>);
    const open = render(<svg><Glyph x={0} y={0} state="open" /></svg>);
    const fillOf = (c: HTMLElement) => c.querySelector('rect')?.getAttribute('fill');
    expect(fillOf(closed.container)).not.toBe('none');
    expect(fillOf(open.container)).toBe('none');
  });

  it('odłącznik: nóż otwarty odchylony (inna geometria linii)', () => {
    const Glyph = SYMBOL_GLYPHS.disconnector;
    const closed = render(<svg><Glyph x={0} y={0} state="closed" /></svg>);
    const open = render(<svg><Glyph x={0} y={0} state="open" /></svg>);
    const blade = (c: HTMLElement) => c.querySelectorAll('line')[1];
    expect(blade(closed.container)?.getAttribute('x2')).not.toBe(
      blade(open.container)?.getAttribute('x2'),
    );
  });

  it('punkt NO: jawna przerwa toru (dwa odcinki + okrąg)', () => {
    const Glyph = SYMBOL_GLYPHS.noPoint;
    const { container } = render(<svg><Glyph x={0} y={0} /></svg>);
    expect(container.querySelectorAll('line').length).toBe(2);
    expect(container.querySelector('circle')).toBeTruthy();
  });

  it('stacja (widok zbiorczy, F6b): kontur kwadratu, NIE węzeł kropkowy — odróżnialna od `junction`', () => {
    const Glyph = SYMBOL_GLYPHS.stationCollapsed;
    const { container } = render(<svg><Glyph x={0} y={0} /></svg>);
    const rect = container.querySelector('rect');
    expect(rect).toBeTruthy();
    expect(rect?.getAttribute('fill')).toBe('none');
    expect(rect?.getAttribute('width')).toBe('16');
    expect(rect?.getAttribute('height')).toBe('16');
    expect(container.querySelector('circle')).toBeFalsy();
  });
});

describe('V3 typografia — deterministyczny pomiar (spec §2, pryncypium determinizmu)', () => {
  it('tylko 4 klasy, rozmiary zgodne ze spec', () => {
    expect(Object.keys(LABEL_TYPOGRAPHY)).toEqual(['t1', 't2', 't3', 't4']);
    expect(LABEL_TYPOGRAPHY.t2.fontSize).toBe(11);
  });

  it('pomiar rośnie z długością i jest deterministyczny', () => {
    const a = measureLabelWidth('YAKXS 3×120/16 · 90 m', 't2');
    expect(a).toBe(measureLabelWidth('YAKXS 3×120/16 · 90 m', 't2'));
    expect(a).toBeGreaterThan(measureLabelWidth('15 kV', 't2'));
    expect(labelLineHeight('t2')).toBe(17);
  });
});
