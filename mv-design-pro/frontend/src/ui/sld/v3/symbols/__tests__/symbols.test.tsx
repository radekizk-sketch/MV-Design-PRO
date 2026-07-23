/**
 * SLD V3 F1 — wyrocznie biblioteki symboli (SLD_CAD_SPEC_V3 §2/§3/§11).
 *
 * grid_probe (statyczny): bbox wielokrotnością GRID, porty NA siatce i NA
 * krawędzi bboxa. Stany łączników wyrażone GEOMETRIĄ (różne d/fill), nie
 * kolorem. Rejestr glifów kompletny względem definicji.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';

import { GRID, isOnGrid } from '../../core/grid';
import { LABEL_TYPOGRAPHY, labelLineHeight, measureLabelWidth } from '../../core/text';
import { SYMBOL_DEFS, makeBusbarDef, type SymbolId } from '../defs';
import { SYMBOL_GLYPHS, SYMBOL_IDS, V3_STROKE_APPARATUS } from '../glyphs';
import {
  MINI_RMU,
  DER_MARKER_SHAPE,
  type StationDerGlyphKind,
  miniRmuPathContinuityGaps,
  miniRmuMarkerSpacingGaps,
  miniRmuMarkerPrimitiveZones,
  transformerInteriorHeightRatio,
} from '../miniRmuGrammar';

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

  it('stacja (widok zbiorczy, GS-1): mini-RMU — enklozura + kreska szyny, NIE kropka; odróżnialna od `junction`', () => {
    // GS-1 (V12K-137, GAP §10.4): intencja „odróżnialna od węzła kropkowego"
    // ZACHOWANA, ale nośnik to teraz SYLWETKA mini-RMU (obrys + szyna), a nie
    // brak okręgu (bazowa sylwetka bez markerów NIE ma okręgu — TR/DER dodają
    // okręgi warunkowo, patrz testy niżej).
    const Glyph = SYMBOL_GLYPHS.stationCollapsed;
    const { container } = render(<svg><Glyph x={0} y={0} /></svg>);
    const silhouette = container.querySelector('[data-station-silhouette="mini-rmu"]');
    expect(silhouette).toBeTruthy();
    const rect = container.querySelector('rect');
    expect(rect?.getAttribute('fill')).toBe('none');
    // Wewnętrzna kreska szyny SN (grubsza) — cecha wspólna gramatyki L0→L2.
    expect(container.querySelector('[data-station-bus="true"]')).toBeTruthy();
    // Sylwetka BAZOWA (bez flag) nie niesie markerów typu/TR/DER/NO ani okręgu.
    expect(container.querySelector('circle')).toBeFalsy();
    expect(container.querySelector('[data-station-transformer]')).toBeFalsy();
    expect(container.querySelector('[data-station-der]')).toBeFalsy();
  });

  it('stacja mini-RMU: markery typu/TR/DER/NO rysowane z danych (GS-1)', () => {
    const Glyph = SYMBOL_GLYPHS.stationCollapsed;
    const { container } = render(
      <svg>
        <Glyph x={0} y={0} stationSectioned stationHasTransformer stationDer="pv" stationNoOpen />
      </svg>,
    );
    expect(container.querySelector('[data-station-sectioned="true"]')).toBeTruthy();
    expect(container.querySelector('[data-station-transformer="true"]')).toBeTruthy();
    expect(container.querySelector('[data-station-der="pv"]')).toBeTruthy();
    expect(container.querySelector('[data-station-no="true"]')).toBeTruthy();
    // TR = dwa okręgi (dwuuzwojeniowy) — obecne TYLKO gdy transformator.
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(2);
  });

  it('stacja mini-RMU: rodzaj DER koduje kształt (PV≠BESS≠FW) (GS-1)', () => {
    const Glyph = SYMBOL_GLYPHS.stationCollapsed;
    const shapeTag = (der: 'pv' | 'bess' | 'wind') => {
      const { container } = render(<svg><Glyph x={0} y={0} stationDer={der} /></svg>);
      const g = container.querySelector('[data-station-der]');
      // ostatni element markera to kształt rodzaju (po stub-linii).
      return g?.lastElementChild?.tagName.toLowerCase();
    };
    expect(shapeTag('pv')).toBe('path');
    expect(shapeTag('bess')).toBe('rect');
    expect(shapeTag('wind')).toBe('circle');
  });
});

/**
 * SCHEMAT-10 GS-2 (V12K-137) — odbiór mini-RMU względem 19 reguł
 * `GRAMATYKA_MINI_RMU_2026-07.md`. Bramkuje reguły, których GS-1 nie egzekwował
 * automatycznie: 2–4 (ciągłość toru przez glif), 5–7/10/12 (kotwice/odstępy/
 * proporcje TR), 11 (grubości wspólne), 13 (renderer = stałe globalne), 15–16
 * (pełna macierz kombinacji), 17 (czytelność min. rozmiaru).
 */
describe('GS-2 — gramatyka mini-RMU: renderer = stałe globalne (reguła 13)', () => {
  it('renderer NIE ma literałów lokalnych: rysowane współrzędne == MINI_RMU', () => {
    const Glyph = SYMBOL_GLYPHS.stationCollapsed;
    const { container } = render(
      <svg><Glyph x={0} y={0} stationSectioned stationHasTransformer stationDer="pv" stationNoOpen /></svg>,
    );
    // Enklozura.
    const rect = container.querySelector('rect');
    expect(Number(rect?.getAttribute('x'))).toBe(MINI_RMU.enclosure.x);
    expect(Number(rect?.getAttribute('y'))).toBe(MINI_RMU.enclosure.y);
    expect(Number(rect?.getAttribute('width'))).toBe(MINI_RMU.enclosure.width);
    expect(Number(rect?.getAttribute('height'))).toBe(MINI_RMU.enclosure.height);
    // Szyna SN — na wylot 0..48 przez środek.
    const bus = container.querySelector('[data-station-bus="true"]');
    expect(Number(bus?.getAttribute('x1'))).toBe(MINI_RMU.bus.x1);
    expect(Number(bus?.getAttribute('x2'))).toBe(MINI_RMU.bus.x2);
    expect(Number(bus?.getAttribute('y1'))).toBe(MINI_RMU.bus.y);
    expect(Number(bus?.getAttribute('y2'))).toBe(MINI_RMU.bus.y);
  });
});

describe('GS-2 — tor mocy przez glif (reguły 2–4)', () => {
  it('sonda ciągłości toru: szyna na wylot port W↔E, przez obie ściany enklozury', () => {
    expect(miniRmuPathContinuityGaps()).toHaveLength(0);
    // Bbox 48×48, szyna od 0 do 48 na osi środka = współliniowa z portami W/E.
    expect(MINI_RMU.bus.x1).toBe(0);
    expect(MINI_RMU.bus.x2).toBe(MINI_RMU.bbox.width);
    expect(MINI_RMU.bus.y).toBe(MINI_RMU.bbox.height / 2);
  });
  it('enklozura nie maskuje toru: bez wypełnienia; szyna rysowana PONAD obrysem', () => {
    const Glyph = SYMBOL_GLYPHS.stationCollapsed;
    const { container } = render(<svg><Glyph x={0} y={0} /></svg>);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('none');
    // Kolejność DOM: enklozura przed szyną (szyna widoczna na wylot).
    const kids = Array.from(container.querySelector('[data-station-silhouette]')?.children ?? []);
    const rectIdx = kids.findIndex((k) => k.tagName.toLowerCase() === 'rect');
    const busIdx = kids.findIndex((k) => k.getAttribute('data-station-bus') === 'true');
    expect(rectIdx).toBeGreaterThanOrEqual(0);
    expect(busIdx).toBeGreaterThan(rectIdx);
  });
});

describe('GS-2 — kotwice, odstępy, proporcje (reguły 5–7, 10, 11, 12)', () => {
  it('sonda odstępów markerów: wewnątrz enklozury, rozłączne, kanał routingu czysty', () => {
    expect(miniRmuMarkerSpacingGaps()).toHaveLength(0);
  });
  it('kotwice STAŁE względem obrysu (reguła 6): pozycje niezależne od danych', () => {
    // Marker DER tej samej cechy ma identyczną kotwicę niezależnie od pozostałych.
    const Glyph = SYMBOL_GLYPHS.stationCollapsed;
    const derXof = (extra: Record<string, unknown>) => {
      const { container } = render(<svg><Glyph x={0} y={0} stationDer="pv" {...extra} /></svg>);
      return container.querySelector('[data-station-der] line')?.getAttribute('x1');
    };
    expect(derXof({})).toBe(String(MINI_RMU.markers.der.x));
    expect(derXof({ stationHasTransformer: true, stationNoOpen: true, stationSectioned: true })).toBe(String(MINI_RMU.markers.der.x));
  });
  it('transformator UZUPEŁNIAJĄCY (reguła 12): ≤0,5 wysokości wnętrza', () => {
    expect(transformerInteriorHeightRatio()).toBeLessThanOrEqual(0.5);
  });
  it('grubości wspólne (reguła 11): szyna > aparat(obrys) > marker', () => {
    expect(MINI_RMU.stroke.bus).toBeGreaterThan(V3_STROKE_APPARATUS);
    expect(V3_STROKE_APPARATUS).toBeGreaterThan(MINI_RMU.stroke.marker);
    // Obrys renderowany kreską aparatu (ta sama co L1/L2).
    const Glyph = SYMBOL_GLYPHS.stationCollapsed;
    const { container } = render(<svg><Glyph x={0} y={0} /></svg>);
    expect(Number(container.querySelector('rect')?.getAttribute('stroke-width'))).toBe(V3_STROKE_APPARATUS);
    expect(Number(container.querySelector('[data-station-bus]')?.getAttribute('stroke-width'))).toBe(MINI_RMU.stroke.bus);
  });
});

describe('GS-2 — pełna macierz kombinacji cech (reguły 15–16)', () => {
  const SECTIONED = [false, true];
  const TR = [false, true];
  const DER: readonly (StationDerGlyphKind | null)[] = [null, 'pv', 'bess', 'wind', 'generator'];
  const NO = [false, true];

  interface Combo {
    readonly sectioned: boolean;
    readonly hasTransformer: boolean;
    readonly der: StationDerGlyphKind | null;
    readonly noOpen: boolean;
  }
  const combos: Combo[] = [];
  for (const sectioned of SECTIONED)
    for (const hasTransformer of TR)
      for (const der of DER)
        for (const noOpen of NO)
          combos.push({ sectioned, hasTransformer, der, noOpen });

  it('40 kombinacji (typ×TR×DER×NO)', () => {
    expect(combos.length).toBe(2 * 2 * 5 * 2);
  });

  const Glyph = SYMBOL_GLYPHS.stationCollapsed;
  /** Sygnatura ODCZYTANA z DOM (nie z wejścia) — dowód, że render odróżnia cechy. */
  function renderedSignature(c: Combo): string {
    const { container } = render(
      <svg>
        <Glyph
          x={0}
          y={0}
          stationSectioned={c.sectioned}
          stationHasTransformer={c.hasTransformer}
          stationDer={c.der}
          stationNoOpen={c.noOpen}
        />
      </svg>,
    );
    const root = container.querySelector('[data-station-silhouette]');
    // Bazowa sylwetka ZAWSZE: enklozura (fill none) + szyna.
    expect(root?.querySelector('rect')?.getAttribute('fill')).toBe('none');
    expect(root?.querySelector('[data-station-bus="true"]')).toBeTruthy();
    const derNode = root?.querySelector('[data-station-der]');
    const derShape = derNode?.lastElementChild?.tagName.toLowerCase() ?? '';
    return [
      root?.querySelector('[data-station-sectioned="true"]') ? 'S' : '-',
      root?.querySelector('[data-station-transformer="true"]') ? 'T' : '-',
      derNode?.getAttribute('data-station-der') ?? '-',
      derShape || '-',
      root?.querySelector('[data-station-no="true"]') ? 'N' : '-',
    ].join('|');
  }

  it('każda kombinacja renderuje markery ZGODNIE z cechami (obecność 1:1)', () => {
    const shapeTag: Record<string, string> = { triangle: 'path', square: 'rect', circle: 'circle' };
    for (const c of combos) {
      const sig = renderedSignature(c);
      const parts = sig.split('|');
      expect(parts[0]).toBe(c.sectioned ? 'S' : '-');
      expect(parts[1]).toBe(c.hasTransformer ? 'T' : '-');
      expect(parts[2]).toBe(c.der ?? '-');
      expect(parts[4]).toBe(c.noOpen ? 'N' : '-');
      if (c.der) expect(parts[3]).toBe(shapeTag[DER_MARKER_SHAPE[c.der]]);
    }
  });

  it('iniekcja: 40 różnych cech ⇒ 40 różnych sygnatur DOM (unikalność)', () => {
    const sigs = new Set(combos.map(renderedSignature));
    expect(sigs.size).toBe(combos.length);
  });

  it('reguła 15 (determinizm/kolejność): identyczne cechy ⇒ bajt-identyczny glif', () => {
    for (const c of [combos[0], combos[17], combos[39]]) {
      const once = renderToStaticMarkup(
        <Glyph x={0} y={0} stationSectioned={c.sectioned} stationHasTransformer={c.hasTransformer} stationDer={c.der} stationNoOpen={c.noOpen} />,
      );
      const twice = renderToStaticMarkup(
        <Glyph x={0} y={0} stationSectioned={c.sectioned} stationHasTransformer={c.hasTransformer} stationDer={c.der} stationNoOpen={c.noOpen} />,
      );
      expect(once).toBe(twice);
    }
  });
});

describe('GS-2 — czytelność przy minimalnym rozmiarze (reguła 17)', () => {
  // Miara px z GS-1 (`defs.ts`): fit sieci referencyjnej skala 0,1203.
  const FIT_SCALE = 0.1203;
  it('sylwetka rozpoznawalna na kadrze całości (≥ próg, ≠ kropka)', () => {
    const glyphScreenPx = MINI_RMU.bbox.width * FIT_SCALE;
    // 48px × 0,1203 = 5,78px (kropka węzła 16px = 1,93px). Próg czytelności bloku.
    expect(glyphScreenPx).toBeGreaterThan(4);
    expect(glyphScreenPx).toBeGreaterThan(16 * FIT_SCALE * 2); // wyraźnie > kropka
  });
  it('markery mają minimalną strefę rozłączną (rozpoznawalne od 1. kroku zoomu)', () => {
    // W rozmiarze projektowym (48px) każdy marker (strefa CAŁEJ cechy, sekcyjna =
    // para ticków) ma najmniejszy wymiar ≥ 4× kreski markera — i ≥ minGap od
    // sąsiadów/obrysu (sonda odstępów zielona wyżej).
    const byFeature = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();
    for (const z of miniRmuMarkerPrimitiveZones()) {
      const feat = z.feature.split('-')[0];
      const b = byFeature.get(feat) ?? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      b.minX = Math.min(b.minX, z.x);
      b.minY = Math.min(b.minY, z.y);
      b.maxX = Math.max(b.maxX, z.x + z.width);
      b.maxY = Math.max(b.maxY, z.y + z.height);
      byFeature.set(feat, b);
    }
    const minExtent = Math.min(
      ...[...byFeature.values()].map((b) => Math.min(b.maxX - b.minX, b.maxY - b.minY)),
    );
    expect(minExtent).toBeGreaterThanOrEqual(4 * MINI_RMU.stroke.marker);
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
