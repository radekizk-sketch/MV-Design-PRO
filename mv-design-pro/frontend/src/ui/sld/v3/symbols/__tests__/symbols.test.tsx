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
  type MiniRmuFeatures,
  allMiniRmuFeatureCombinations,
  miniRmuFeatureContradictions,
  miniRmuPathContinuityGaps,
  miniRmuMarkerSpacingGaps,
  miniRmuMarkerPrimitiveZones,
  miniRmuSignature,
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

  it('reklozer: korpus wyłącznika + ŁUK SPZ — odróżnialny od wyłącznika i od pozostałych łączników', () => {
    // MINI-RMU-CAD. Reklozer JEST wyłącznikiem, więc korpus (prostokąt ze stanem
    // wyrażonym wypełnieniem) musi być ten sam; automatykę SPZ niesie ŁUK. Test
    // pilnuje OBU stron tej pary: gdyby łuk zniknął, reklozer stałby się
    // nieodróżnialny od wyłącznika (defekt sprzed karty).
    const { container } = render(<svg><SYMBOL_GLYPHS.recloser x={0} y={0} /></svg>);
    expect(container.querySelector('[data-recloser-arc="true"]')).toBeTruthy();
    expect(container.querySelector('rect')).toBeTruthy();
    const breaker = render(<svg><SYMBOL_GLYPHS.breaker x={0} y={0} /></svg>);
    expect(breaker.container.querySelector('[data-recloser-arc]')).toBeFalsy();
    // Stan wyrażony GEOMETRIĄ (wypełnienie korpusu), jak w wyłączniku.
    const fillOf = (state: 'closed' | 'open') =>
      render(<svg><SYMBOL_GLYPHS.recloser x={0} y={0} state={state} /></svg>)
        .container.querySelector('rect')?.getAttribute('fill');
    expect(fillOf('closed')).not.toBe('none');
    expect(fillOf('open')).toBe('none');
  });

  it('łączniki toru głównego: każdy rodzaj ma WŁASNY rysunek (znacznik rozróżnialności)', () => {
    // MINI-RMU-CAD, reguła KLASA §2: sprawdzamy CAŁĄ rodzinę łączników pola SN
    // (nie samą parę z karty) — pięć rodzajów `device_kind` katalogu APARAT_SN
    // ma dawać pięć różnych rysunków. Porównanie po statycznym markup: identyczny
    // markup dwóch symboli = na rysunku ta sama plamka.
    const laczniki = ['breaker', 'recloser', 'loadBreakSwitch', 'fuseSwitch', 'disconnector'] as const;
    const markup = laczniki.map((id) =>
      renderToStaticMarkup(<svg>{SYMBOL_GLYPHS[id]({ x: 0, y: 0, state: 'closed' })}</svg>)
        // `data-symbol-canon` odróżnia z definicji — usuwamy, żeby test mierzył RYSUNEK.
        .replace(/ data-symbol-canon="[^"]*"/, ''),
    );
    expect(new Set(markup).size).toBe(laczniki.length);
  });

  it('CALY rejestr glifow: kazdy rysuje sie inaczej niz kazdy inny (KLASA, nie lista przykladow)', () => {
    // Odbior SLD-GEN-POLA (2026-08-14): iniekcja nadzoru — glif `fuse` podmieniony
    // na kopie rysunku `disconnector` — przeszla 368 testow, bo pin rozroznialnosci
    // obejmowal tylko piec lacznikow z karty MINI-RMU. Nowe glify dochodza do
    // kanonu czesciej niz nowe listy do testow, wiec pin obejmuje CALY rejestr:
    // identyczny markup (po zdjeciu znacznika id) dwoch roznych glifow = na
    // rysunku ta sama plamka i inzynier nie odroznia aparatow.
    const idki = Object.keys(SYMBOL_GLYPHS) as (keyof typeof SYMBOL_GLYPHS)[];
    const markup = idki.map((id) =>
      renderToStaticMarkup(<svg>{SYMBOL_GLYPHS[id]({ x: 0, y: 0, state: 'closed' })}</svg>)
        .replace(/ data-symbol-canon="[^"]*"/, ''),
    );
    const duplikaty = idki.filter((_, i) => markup.indexOf(markup[i]) !== i);
    expect(duplikaty).toEqual([]);
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
    expect(container.querySelector('[data-station-der-sn]')).toBeFalsy();
    expect(container.querySelector('[data-station-der-nn]')).toBeFalsy();
  });

  it('stacja mini-RMU: markery typu/TR/DER/NO rysowane z danych (GS-1/GS-4)', () => {
    const Glyph = SYMBOL_GLYPHS.stationCollapsed;
    const { container } = render(
      <svg>
        <Glyph x={0} y={0} stationSectioned stationHasTransformer stationDerOnMv="pv" stationDerBehindTr="bess" stationNoOpen />
      </svg>,
    );
    expect(container.querySelector('[data-station-sectioned="true"]')).toBeTruthy();
    expect(container.querySelector('[data-station-transformer="true"]')).toBeTruthy();
    expect(container.querySelector('[data-station-der-sn="pv"]')).toBeTruthy();
    expect(container.querySelector('[data-station-der-nn="bess"]')).toBeTruthy();
    expect(container.querySelector('[data-station-no="true"]')).toBeTruthy();
    // TR = dwa okręgi (dwuuzwojeniowy) — obecne TYLKO gdy transformator.
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(2);
  });

  it('stacja mini-RMU: rodzaj DER koduje kształt (PV≠BESS≠FW) (GS-1)', () => {
    const Glyph = SYMBOL_GLYPHS.stationCollapsed;
    const shapeTag = (der: 'pv' | 'bess' | 'wind') => {
      const { container } = render(<svg><Glyph x={0} y={0} stationDerOnMv={der} /></svg>);
      const g = container.querySelector('[data-station-der-sn]');
      // ostatni element markera to kształt rodzaju (po stub-linii).
      return g?.lastElementChild?.tagName.toLowerCase();
    };
    expect(shapeTag('pv')).toBe('path');
    // BESS: prostokąt bateryjny 2:1 (grupa rect+kreska) — NIE kwadrat aparatu.
    expect(shapeTag('bess')).toBe('g');
    // FW: wirnik (grupa okrąg+3 ramiona) — rozróżnialny od generatora (okrąg+kropka).
    expect(shapeTag('wind')).toBe('g');
    // Rozróżnialność STRUKTURALNA wind vs generator (recenzja pkt 6):
    const kidsOf = (der: 'wind' | 'generator') => {
      const { container } = render(<svg><Glyph x={0} y={0} stationDerOnMv={der} /></svg>);
      return container.querySelector('[data-station-der-sn] g')?.children.length ?? 0;
    };
    expect(kidsOf('wind')).toBe(4);
    expect(kidsOf('generator')).toBe(2);
  });
});

/**
 * GS-4 (recenzja 2026-07-23, `GRAMATYKA_MINI_RMU_2026-07.md` §GS-4) — semantyka
 * DER względem transformatora: pozycja znaku źródła wynika z RZECZYWISTEGO
 * miejsca przyłączenia (SN = pole DER od szyny; nN = przy gałęzi pola TR,
 * PONIŻEJ uzwojeń, INNA kotwica). Mini-RMU nie może kłamać topologicznie.
 * 6 testów kanonicznych z kanonu + walidacja sprzeczności.
 */
describe('GS-4 — DER na SN vs DER za transformatorem (nN)', () => {
  const Glyph = SYMBOL_GLYPHS.stationCollapsed;
  const parts = (el: JSX.Element) => {
    const { container } = render(<svg>{el}</svg>);
    return {
      tr: container.querySelector('[data-station-transformer="true"]'),
      sn: container.querySelector('[data-station-der-sn]'),
      nn: container.querySelector('[data-station-der-nn]'),
      no: container.querySelector('[data-station-no="true"]'),
      container,
    };
  };

  it('1: TR bez DER — pole TR obecne, ZERO znaków źródła po obu stronach', () => {
    const p = parts(<Glyph x={0} y={0} stationHasTransformer />);
    expect(p.tr).toBeTruthy();
    expect(p.sn).toBeFalsy();
    expect(p.nn).toBeFalsy();
  });

  it('2: TR + DER za TR — znak WYŁĄCZNIE przy gałęzi TR, poniżej uzwojeń (nie od szyny SN)', () => {
    const p = parts(<Glyph x={0} y={0} stationHasTransformer stationDerBehindTr="pv" />);
    expect(p.nn?.getAttribute('data-station-der-nn')).toBe('pv');
    expect(p.sn).toBeFalsy();
    // Kotwica nN: oś pola TR, PONIŻEJ dolnego uzwojenia (strona nN, poza enklozurą).
    const stub = p.nn?.querySelector('line');
    expect(stub?.getAttribute('x1')).toBe(String(MINI_RMU.poleTr.x));
    expect(Number(stub?.getAttribute('y1'))).toBeGreaterThanOrEqual(MINI_RMU.poleTr.circle2Y + MINI_RMU.poleTr.circleR);
    expect(MINI_RMU.poleTr.derNn.markerCY - MINI_RMU.poleTr.derNn.markerHalf)
      .toBeGreaterThanOrEqual(MINI_RMU.enclosure.y + MINI_RMU.enclosure.height);
    // Znak nN żyje WEWNĄTRZ grupy pola TR (gałąź TR, nie osobne pole od szyny).
    expect(p.tr?.contains(p.nn)).toBe(true);
  });

  it('3: stacja bez TR + DER na SN — pole DER od szyny, ZERO strony nN', () => {
    const p = parts(<Glyph x={0} y={0} stationDerOnMv="wind" />);
    expect(p.sn?.getAttribute('data-station-der-sn')).toBe('wind');
    expect(p.tr).toBeFalsy();
    expect(p.nn).toBeFalsy();
    // Kotwica SN: pole DER od szyny (INNA kotwica niż nN).
    expect(p.sn?.querySelector('line')?.getAttribute('x1')).toBe(String(MINI_RMU.poleDer.x));
  });

  it('4: TR + DER za TR + NO — przerwa szyny NIE kasuje znaku nN', () => {
    const p = parts(<Glyph x={0} y={0} stationHasTransformer stationDerBehindTr="bess" stationNoOpen />);
    expect(p.nn?.getAttribute('data-station-der-nn')).toBe('bess');
    expect(p.no).toBeTruthy();
    expect(p.sn).toBeFalsy();
  });

  it('5: TR + DER na SN + NO — znak na SN, strona nN pusta', () => {
    const p = parts(<Glyph x={0} y={0} stationHasTransformer stationDerOnMv="pv" stationNoOpen />);
    expect(p.sn?.getAttribute('data-station-der-sn')).toBe('pv');
    expect(p.nn).toBeFalsy();
    expect(p.no).toBeTruthy();
  });

  it('6: TR + oba naraz — dwa znaki, dwie RÓŻNE kotwice (wariant 4 kanonu)', () => {
    const p = parts(<Glyph x={0} y={0} stationHasTransformer stationDerOnMv="pv" stationDerBehindTr="generator" />);
    expect(p.sn?.getAttribute('data-station-der-sn')).toBe('pv');
    expect(p.nn?.getAttribute('data-station-der-nn')).toBe('generator');
    // Różne kotwice: SN nad szyną (poleDer), nN pod transformatorem (poleTr.derNn).
    expect(MINI_RMU.poleDer.x).not.toBe(MINI_RMU.poleTr.x);
    expect(MINI_RMU.poleDer.markerCY).toBeLessThan(MINI_RMU.bus.y);
    expect(MINI_RMU.poleTr.derNn.markerCY).toBeGreaterThan(MINI_RMU.poleTr.circle2Y);
  });

  it('walidacja: DER za TR bez transformatora = sprzeczność (czerwona, nie cichy render)', () => {
    // Kontrakt cech: kombinacja NIEDOPUSZCZALNA, wykluczona z macierzy.
    const f: MiniRmuFeatures = { sectioned: false, lineTopology: 'przelotowa', transformer: false, derOnMv: null, derBehindTr: 'pv', noOpen: false };
    expect(miniRmuFeatureContradictions(f).length).toBeGreaterThan(0);
    expect(allMiniRmuFeatureCombinations().every((c) => miniRmuFeatureContradictions(c).length === 0)).toBe(true);
    // Glif NIE fabrykuje strony nN bez pola TR (blok nN żyje wewnątrz grupy TR);
    // sprzeczność modelu raportuje `buildScene` jawnym stopNote.
    const p = parts(<Glyph x={0} y={0} stationDerBehindTr="pv" />);
    expect(p.nn).toBeFalsy();
    expect(p.tr).toBeFalsy();
  });

  it('ten sam rodzaj = ten sam kształt po OBU stronach (różni się wyłącznie przyłącze)', () => {
    const p = parts(<Glyph x={0} y={0} stationHasTransformer stationDerOnMv="bess" stationDerBehindTr="bess" />);
    // BESS po obu stronach: grupa (rect 2:1 + kreska) — identyczna struktura.
    const snShape = p.sn?.lastElementChild;
    const nnShape = p.nn?.lastElementChild;
    expect(snShape?.tagName.toLowerCase()).toBe('g');
    expect(nnShape?.tagName.toLowerCase()).toBe('g');
    expect(snShape?.children.length).toBe(nnShape?.children.length);
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
      <svg><Glyph x={0} y={0} stationSectioned stationHasTransformer stationDerOnMv="pv" /></svg>,
    );
    // Enklozura.
    const rect = container.querySelector('rect');
    expect(Number(rect?.getAttribute('x'))).toBe(MINI_RMU.enclosure.x);
    expect(Number(rect?.getAttribute('y'))).toBe(MINI_RMU.enclosure.y);
    expect(Number(rect?.getAttribute('width'))).toBe(MINI_RMU.enclosure.width);
    expect(Number(rect?.getAttribute('height'))).toBe(MINI_RMU.enclosure.height);
    // Szyna SN — WEWNĄTRZ enklozury (K2), oś środka.
    const bus = container.querySelector('[data-station-bus="true"]');
    expect(Number(bus?.getAttribute('x1'))).toBe(MINI_RMU.bus.x1);
    expect(Number(bus?.getAttribute('x2'))).toBe(MINI_RMU.bus.x2);
    expect(Number(bus?.getAttribute('y1'))).toBe(MINI_RMU.bus.y);
    expect(Number(bus?.getAttribute('y2'))).toBe(MINI_RMU.bus.y);
  });
});

describe('GS-2 — tor mocy przez glif (reguły 2–4)', () => {
  it('sonda ciągłości toru: łańcuch pól W→głowica→aparat→szyna→aparat→głowica→E (K1/K2)', () => {
    expect(miniRmuPathContinuityGaps()).toHaveLength(0);
    // K2: szyna WEWNĄTRZ enklozury — nie wychodzi poza obudowę.
    expect(MINI_RMU.bus.x1).toBeGreaterThan(MINI_RMU.enclosure.x);
    expect(MINI_RMU.bus.x2).toBeLessThan(MINI_RMU.enclosure.x + MINI_RMU.enclosure.width);
    expect(MINI_RMU.bus.y).toBe(MINI_RMU.bbox.height / 2);
    // K1: kabel kończy się na głowicy (stub nie sięga szyny).
    expect(MINI_RMU.linia.stubL.x2).toBeLessThan(MINI_RMU.bus.x1);
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
      const { container } = render(<svg><Glyph x={0} y={0} stationDerOnMv="pv" {...extra} /></svg>);
      return container.querySelector('[data-station-der-sn] line')?.getAttribute('x1');
    };
    expect(derXof({})).toBe(String(MINI_RMU.poleDer.x));
    expect(derXof({ stationHasTransformer: true, stationNoOpen: true, stationSectioned: true })).toBe(String(MINI_RMU.poleDer.x));
  });
  it('transformator UZUPEŁNIAJĄCY (reguła 12): ≤0,5 wysokości wnętrza', () => {
    expect(transformerInteriorHeightRatio()).toBeLessThanOrEqual(0.5);
  });
  it('hierarchia wag (recenzja pkt 9): tor pól > szyna > TR/DER > obrys (najlżejszy)', () => {
    expect(MINI_RMU.stroke.path).toBeGreaterThan(MINI_RMU.stroke.bus);
    expect(MINI_RMU.stroke.bus).toBeGreaterThan(MINI_RMU.stroke.marker);
    expect(MINI_RMU.stroke.marker).toBeGreaterThan(MINI_RMU.stroke.outline);
    // Obrys WTÓRNY (K7): najlżejsza kreska.
    const Glyph = SYMBOL_GLYPHS.stationCollapsed;
    const { container } = render(<svg><Glyph x={0} y={0} /></svg>);
    expect(Number(container.querySelector('rect')?.getAttribute('stroke-width'))).toBe(MINI_RMU.stroke.outline);
    expect(Number(container.querySelector('[data-station-bus]')?.getAttribute('stroke-width'))).toBe(MINI_RMU.stroke.bus);
  });
});

describe('GS-2/GS-4/GS-5 — pełna macierz kombinacji cech (reguły 15–16 + strona DER + topologia pól)', () => {
  // Macierz Z GRAMATYKI (jedna prawda) — iloczyn typ×topologia×TR×DER(SN)×
  // DER(nN)×NO ograniczony do kombinacji LEGALNYCH (sprzeczności GS-4/GS-5
  // wykluczone z konstrukcji; dowód czerwoności w blokach wyżej/niżej).
  const combos = allMiniRmuFeatureCombinations();

  it('210 kombinacji legalnych (arytmetyka: 30 legalnych TR×DER × [sekcyjna:2NO·przelotowa + niesekcyjna:(2NO·przelotowa+2NO·odgałęźna+1NO·końcowa)])', () => {
    // 30 = legalne (TR, derOnMv, derBehindTr): TR=true 5×5=25, TR=false 5×1=5.
    // sectioned=false: przelotowa(2 NO) + odgałęźna(2 NO) + końcowa(1 NO — noOpen
    // przy końcowej sprzeczny) = 5 slotów ⇒ 150; sectioned=true: tylko
    // przelotowa (2 NO) ⇒ 60. Razem 210.
    expect(combos.length).toBe(30 * (5 + 2));
    expect(combos.every((c) => miniRmuFeatureContradictions(c).length === 0)).toBe(true);
    // Sygnatury cech unikalne już na poziomie gramatyki.
    expect(new Set(combos.map(miniRmuSignature)).size).toBe(combos.length);
  });

  const Glyph = SYMBOL_GLYPHS.stationCollapsed;
  /** Sygnatura ODCZYTANA z DOM (nie z wejścia) — dowód, że render odróżnia cechy. */
  function renderedSignature(c: MiniRmuFeatures): string {
    const { container } = render(
      <svg>
        <Glyph
          x={0}
          y={0}
          stationSectioned={c.sectioned}
          stationLineTopology={c.lineTopology}
          stationHasTransformer={c.transformer}
          stationDerOnMv={c.derOnMv}
          stationDerBehindTr={c.derBehindTr}
          stationNoOpen={c.noOpen}
        />
      </svg>,
    );
    const root = container.querySelector('[data-station-silhouette]');
    // Bazowa sylwetka ZAWSZE: enklozura (fill none) + szyna.
    expect(root?.querySelector('rect')?.getAttribute('fill')).toBe('none');
    expect(root?.querySelector('[data-station-bus="true"]')).toBeTruthy();
    const snNode = root?.querySelector('[data-station-der-sn]');
    const nnNode = root?.querySelector('[data-station-der-nn]');
    const snShape = snNode?.lastElementChild?.tagName.toLowerCase() ?? '';
    const nnShape = nnNode?.lastElementChild?.tagName.toLowerCase() ?? '';
    // GS-5: topologia pól z DOM — pole WY (out) + węzeł odgałęzienia.
    const fieldOut = root?.querySelector('[data-station-field-out="true"]') ? 'OUT' : '-';
    const branchNode = root?.querySelector('[data-station-branch-node="true"]') ? 'W' : '-';
    return [
      root?.querySelector('[data-station-sectioned="true"]') ? 'S' : '-',
      root?.getAttribute('data-station-line-topology') ?? '-',
      fieldOut,
      branchNode,
      root?.querySelector('[data-station-transformer="true"]') ? 'T' : '-',
      snNode ? `SN:${snNode.getAttribute('data-station-der-sn')}:${snShape}` : '-',
      nnNode ? `nN:${nnNode.getAttribute('data-station-der-nn')}:${nnShape}` : '-',
      root?.querySelector('[data-station-no="true"]') ? 'N' : '-',
    ].join('|');
  }

  it('każda kombinacja renderuje markery ZGODNIE z cechami (obecność 1:1, strona 1:1, topologia 1:1)', () => {
    const shapeTag: Record<string, string> = { diamond: 'path', battery: 'g', 'circle-spokes': 'g', 'circle-dot': 'g' };
    for (const c of combos) {
      const parts = renderedSignature(c).split('|');
      expect(parts[0]).toBe(c.sectioned ? 'S' : '-');
      expect(parts[1]).toBe(c.lineTopology);
      // GS-5: pole WY tylko gdy tor kontynuuje; węzeł odgałęzienia tylko dla
      // odgałęźnej BEZ przerwy NO (środek szyny w realnej przerwie).
      expect(parts[2]).toBe(c.lineTopology === 'końcowa' ? '-' : 'OUT');
      expect(parts[3]).toBe(c.lineTopology === 'odgałęźna' && !c.noOpen ? 'W' : '-');
      expect(parts[4]).toBe(c.transformer ? 'T' : '-');
      expect(parts[5]).toBe(c.derOnMv ? `SN:${c.derOnMv}:${shapeTag[DER_MARKER_SHAPE[c.derOnMv]]}` : '-');
      expect(parts[6]).toBe(c.derBehindTr ? `nN:${c.derBehindTr}:${shapeTag[DER_MARKER_SHAPE[c.derBehindTr]]}` : '-');
      expect(parts[7]).toBe(c.noOpen ? 'N' : '-');
    }
  });

  it('iniekcja: 210 różnych cech ⇒ 210 różnych sygnatur DOM (unikalność)', () => {
    const sigs = new Set(combos.map(renderedSignature));
    expect(sigs.size).toBe(combos.length);
  });

  it('reguła 15 (determinizm/kolejność): identyczne cechy ⇒ bajt-identyczny glif', () => {
    for (const c of [combos[0], combos[47], combos[combos.length - 1]]) {
      const el = (
        <Glyph x={0} y={0} stationSectioned={c.sectioned} stationLineTopology={c.lineTopology} stationHasTransformer={c.transformer} stationDerOnMv={c.derOnMv} stationDerBehindTr={c.derBehindTr} stationNoOpen={c.noOpen} />
      );
      expect(renderToStaticMarkup(el)).toBe(renderToStaticMarkup(el));
    }
  });
});

/**
 * GS-5 (uwaga właściciela 2026-07-23: „render zakłada, że większość stacji to
 * przelotowe, a w realnej sieci to końcowe z odgałęzień") — topologia pól
 * liniowych sylwetki z ROLI stacji w ciągu. Stacja końcowa NIE dostaje
 * fantomowego pola na wylot; odgałęźna niesie węzeł odgałęzienia na szynie.
 */
describe('GS-5 — pola liniowe sylwetki z topologii (końcowa/przelotowa/odgałęźna)', () => {
  const Glyph = SYMBOL_GLYPHS.stationCollapsed;
  const renderP = (el: JSX.Element) => render(<svg>{el}</svg>).container;

  it('końcowa: TYLKO pole WE — zero pola WY (aparat L2/głowica R/kabel R nie istnieją)', () => {
    const c = renderP(<Glyph x={0} y={0} stationLineTopology="końcowa" stationHasTransformer />);
    expect(c.querySelector('[data-station-line-topology="końcowa"]')).toBeTruthy();
    expect(c.querySelector('[data-station-field-out]')).toBeFalsy();
    expect(c.querySelector('[data-station-aparat="L2"]')).toBeFalsy();
    // Pole WE nietknięte + szyna kończy się w rozdzielnicy.
    expect(c.querySelector('[data-station-aparat="L1"]')).toBeTruthy();
    expect(c.querySelector('[data-station-bus="true"]')).toBeTruthy();
    // Żadna linia toru nie sięga prawej kotwicy E (x=48) — brak fantomu.
    const xs = Array.from(c.querySelectorAll('line')).map((l) => Number(l.getAttribute('x2')));
    expect(xs.includes(MINI_RMU.bbox.width)).toBe(false);
  });

  it('końcowa + TR + PV za TR: realny dead-end z PV za trafo (przypadek z sieci) renderuje się kompletnie', () => {
    const c = renderP(
      <Glyph x={0} y={0} stationLineTopology="końcowa" stationHasTransformer stationDerBehindTr="pv" />,
    );
    expect(c.querySelector('[data-station-field-out]')).toBeFalsy();
    expect(c.querySelector('[data-station-transformer="true"]')).toBeTruthy();
    expect(c.querySelector('[data-station-der-nn="pv"]')).toBeTruthy();
  });

  it('przelotowa (jawnie i jako default bez podsumowania): pole WY obecne — zachowanie dotychczasowe', () => {
    for (const el of [
      <Glyph key="a" x={0} y={0} stationLineTopology="przelotowa" />,
      <Glyph key="b" x={0} y={0} />,
    ]) {
      const c = renderP(el);
      expect(c.querySelector('[data-station-line-topology="przelotowa"]')).toBeTruthy();
      expect(c.querySelector('[data-station-field-out="true"]')).toBeTruthy();
      expect(c.querySelector('[data-station-aparat="L2"]')).toBeTruthy();
    }
  });

  it('odgałęźna: dwa pola + WĘZEŁ odgałęzienia NA szynie (kropka w przęśle szyny)', () => {
    const c = renderP(<Glyph x={0} y={0} stationLineTopology="odgałęźna" />);
    expect(c.querySelector('[data-station-field-out="true"]')).toBeTruthy();
    const node = c.querySelector('[data-station-branch-node="true"]');
    expect(node).toBeTruthy();
    const cx = Number(node?.getAttribute('cx'));
    expect(cx).toBeGreaterThan(MINI_RMU.bus.x1);
    expect(cx).toBeLessThan(MINI_RMU.bus.x2);
    expect(Number(node?.getAttribute('cy'))).toBe(MINI_RMU.bus.y);
  });

  it('odgałęźna + NO: węzeł NIE jest rysowany w realnej przerwie szyny (odgałęzienie niesie kabel sceny)', () => {
    const c = renderP(<Glyph x={0} y={0} stationLineTopology="odgałęźna" stationNoOpen />);
    expect(c.querySelector('[data-station-no="true"]')).toBeTruthy();
    expect(c.querySelector('[data-station-branch-node]')).toBeFalsy();
    expect(c.querySelector('[data-station-line-topology="odgałęźna"]')).toBeTruthy();
  });

  it('walidacja GS-5: sekcyjna wymusza dwustronność; NO przy końcowej sprzeczny (macierz bez tych kombinacji)', () => {
    expect(
      miniRmuFeatureContradictions({ sectioned: true, lineTopology: 'końcowa', transformer: false, derOnMv: null, derBehindTr: null, noOpen: false }).length,
    ).toBeGreaterThan(0);
    expect(
      miniRmuFeatureContradictions({ sectioned: false, lineTopology: 'końcowa', transformer: false, derOnMv: null, derBehindTr: null, noOpen: true }).length,
    ).toBeGreaterThan(0);
    expect(
      allMiniRmuFeatureCombinations().some((c) => c.sectioned && c.lineTopology !== 'przelotowa'),
    ).toBe(false);
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
