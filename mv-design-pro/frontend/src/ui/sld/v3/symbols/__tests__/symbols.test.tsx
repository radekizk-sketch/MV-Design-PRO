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
import { SYMBOL_GLYPHS, SYMBOL_IDS } from '../glyphs';
import { uzwojeniaZGrupyPolaczen } from '../uzwojenia';

// Karta SLD-SKALA-I-NAWIGACJA (R1): gramatyka sylwetki stacji mini-RMU (GS-1/GS-2/
// GS-4/GS-5, dawny moduł gramatyki sylwetki) skasowana razem ze zwiniętym przeglądem.
// Scena ma jeden rysunek stacji (pełne pola); typ/TR/DER/NO rozpoznaje się z jego
// symboli, a czytelność przy oddaleniu pilnuje kanwa (stała ekranowa tożsamości).

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
    // Karta JEDNA NOTACJA BLOKU ZABEZPIECZEŃ: blok zabezpieczeń pola nie ma portów definicji —
    // wejścia linii leżą na krawędziach ramki z danych pola (meta sceny
    // `wejsciaBlokuPrzekaznika`); każdy inny symbol ma co najmniej jeden port.
    if (id === 'protectionRelay') expect(d.ports).toEqual([]);
    else expect(d.ports.length).toBeGreaterThan(0);
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

  it('P0.8 nN: rodzina CAŁEJ biblioteki łączników (SN + nN) — każdy rodzaj WŁASNY rysunek', () => {
    // Karta P0.8 §0.3 (H_PLAN_IMPLEMENTACJI_NN): rozszerzenie testu rozróżnialności
    // na NOWE glify nN — reguła KLASA §2 „sprawdzamy CAŁĄ rodzinę", nie tylko parę
    // z karty. `recloser` istniejący, NIETKNIĘTY (zakaz karty P0.8 §0 pkt 3).
    const wszystkieLaczniki = [
      'breaker', 'recloser', 'loadBreakSwitch', 'fuseSwitch', 'disconnector',
      'nnBreaker', 'nnFuseSwitch',
    ] as const;
    const markup = wszystkieLaczniki.map((id) =>
      renderToStaticMarkup(<svg>{SYMBOL_GLYPHS[id]({ x: 0, y: 0, state: 'closed' })}</svg>)
        .replace(/ data-symbol-canon="[^"]*"/, ''),
    );
    expect(new Set(markup).size).toBe(wszystkieLaczniki.length);
  });

  it('PORTAL nN (LV Domain Projection): portal domeny nN ma WŁASNY rysunek, odróżnialny od CAŁEJ biblioteki', () => {
    const nowe = ['lvPortal'] as const;
    const reszta = ids.filter((id) => !nowe.includes(id as (typeof nowe)[number]));
    const markupNowe = nowe.map((id) =>
      renderToStaticMarkup(<svg>{SYMBOL_GLYPHS[id]({ x: 0, y: 0 })}</svg>).replace(/ data-symbol-canon="[^"]*"/, ''),
    );
    const markupReszty = reszta.map((id) =>
      renderToStaticMarkup(<svg>{SYMBOL_GLYPHS[id]({ x: 0, y: 0 })}</svg>).replace(/ data-symbol-canon="[^"]*"/, ''),
    );
    // Nowe dwa różnią się między sobą.
    expect(new Set(markupNowe).size).toBe(nowe.length);
    // Żaden z nowych nie duplikuje rysunku istniejącej biblioteki.
    for (const m of markupNowe) expect(markupReszty).not.toContain(m);
  });

  it('P0.8 nN: recloser NIETKNIĘTY (zakaz karty §0 pkt 3) — łuk SPZ nadal obecny', () => {
    const { container } = render(<svg><SYMBOL_GLYPHS.recloser x={0} y={0} /></svg>);
    expect(container.querySelector('[data-recloser-arc="true"]')).toBeTruthy();
  });

  it('wyłącznik nN/MCB: stan zamknięty/otwarty różni się GEOMETRIĄ, dźwignia modułowa obecna', () => {
    const Glyph = SYMBOL_GLYPHS.nnBreaker;
    const closed = render(<svg><Glyph x={0} y={0} state="closed" /></svg>);
    const open = render(<svg><Glyph x={0} y={0} state="open" /></svg>);
    const fillOf = (c: HTMLElement) => c.querySelector('rect')?.getAttribute('fill');
    expect(fillOf(closed.container)).not.toBe('none');
    expect(fillOf(open.container)).toBe('none');
    expect(closed.container.querySelector('[data-nn-breaker-toggle="true"]')).toBeTruthy();
  });

  it('rozłącznik bezpiecznikowy nN: kaseta sześciokątna obecna (odróżnialna od prostokątnej wkładki SN)', () => {
    const { container } = render(<svg><SYMBOL_GLYPHS.nnFuseSwitch x={0} y={0} /></svg>);
    expect(container.querySelector('[data-nn-fuseswitch-cartridge="true"]')).toBeTruthy();
    expect(container.querySelector('rect')).toBeFalsy();
  });

  it('portal domeny nN: chorągiewka pięciokątna + napis „nN", 1 port `top` na osi, gabaryt 32×24 (4×3 GRID)', () => {
    const d = SYMBOL_DEFS.lvPortal;
    expect(d.width).toBe(32);
    expect(d.height).toBe(24);
    expect(d.ports).toEqual([{ name: 'top', x: 16, y: 0, dir: 'N' }]);
    const { container } = render(<svg><SYMBOL_GLYPHS.lvPortal x={0} y={0} /></svg>);
    expect(container.querySelector('[data-lv-portal-flag="true"]')).toBeTruthy();
    expect(container.textContent).toBe('nN');
    // Nie jest aparatem: brak prostokąta korpusu łącznika i brak okręgu.
    expect(container.querySelector('rect')).toBeFalsy();
    expect(container.querySelector('circle')).toBeFalsy();
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

  // Rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC (referencja HMI): NOP jest ZNACZNIKIEM
  // FUNKCJI (okrąg), a geometrię toru przez okrąg rysuje BIEŻĄCE położenie łącznika — przerwa
  // tylko w położeniu otwartym; brak położenia nie udaje przerwy (tor przerywany = nieustalony).
  it.each([
    ['open', 2, null],
    ['closed', 1, null],
    ['unknown', 1, '3 2'],
    [undefined, 1, '3 2'],
  ] as const)('punkt NO × położenie %s: %i odcinki toru + okrąg', (state, odcinki, kreskowanie) => {
    const Glyph = SYMBOL_GLYPHS.noPoint;
    const { container } = render(<svg><Glyph x={0} y={0} state={state} /></svg>);
    const linie = [...container.querySelectorAll('line')];
    expect(linie.length).toBe(odcinki);
    expect(linie[0]!.getAttribute('stroke-dasharray')).toBe(kreskowanie);
    expect(container.querySelector('circle')).toBeTruthy();
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

// ---------------------------------------------------------------------------
// GPZ-PARYTET (§0 pkt 2): oznaczenie uzwojeń w glifie transformatora — z grupy
// połączeń modelu, rysowane w okręgach uzwojeń biblioteki symboli.
// ---------------------------------------------------------------------------

describe('Transformer2WGlyph — oznaczenie uzwojeń z grupy połączeń', () => {
  const Glif = SYMBOL_GLYPHS.transformer2W;
  const PRZYPADKI = [
    ['Dyn11', ['trojkat', 'false'], ['gwiazda', 'true'], '11'],
    ['Yyn0', ['gwiazda', 'false'], ['gwiazda', 'true'], '0'],
    ['YNd11', ['gwiazda', 'true'], ['trojkat', 'false'], '11'],
    ['Yzn11', ['gwiazda', 'false'], ['zygzak', 'true'], '11'],
  ] as const;

  for (const [grupa, gorne, dolne, godzina] of PRZYPADKI) {
    it(`${grupa}: znak uzwojenia górnego i dolnego, punkt neutralny tylko tam, gdzie zapis go niesie`, () => {
      const { container } = render(
        <svg>
          <Glif x={0} y={0} stroke="#000000" uzwojenia={uzwojeniaZGrupyPolaczen(grupa)} />
        </svg>,
      );
      const stan = container.querySelector('[data-uzwojenia-stan]')!;
      expect(stan.getAttribute('data-uzwojenia-stan')).toBe('znane');
      expect(stan.getAttribute('data-uzwojenia-godzina')).toBe(godzina);
      const g = container.querySelector('[data-uzwojenie="gorne"]')!;
      const d = container.querySelector('[data-uzwojenie="dolne"]')!;
      expect([g.getAttribute('data-uzwojenie-rodzaj'), g.getAttribute('data-uzwojenie-neutralny')]).toEqual([...gorne]);
      expect([d.getAttribute('data-uzwojenie-rodzaj'), d.getAttribute('data-uzwojenie-neutralny')]).toEqual([...dolne]);
      expect(g.querySelectorAll('[data-uzwojenie-punkt-neutralny]').length).toBe(gorne[1] === 'true' ? 1 : 0);
      expect(d.querySelectorAll('[data-uzwojenie-punkt-neutralny]').length).toBe(dolne[1] === 'true' ? 1 : 0);
    });
  }

  for (const [opis, grupa, stan] of [['brak grupy', null, 'brak'], ['zapis nierozpoznany', 'Xy5', 'nierozpoznane']] as const) {
    it(`${opis}: jawny znacznik „?" w obu uzwojeniach (stan ${stan}) — bez zgadywania układu`, () => {
      const { container } = render(
        <svg>
          <Glif x={0} y={0} stroke="#000000" uzwojenia={uzwojeniaZGrupyPolaczen(grupa)} />
        </svg>,
      );
      expect(container.querySelector('[data-uzwojenia-stan]')!.getAttribute('data-uzwojenia-stan')).toBe(stan);
      const znaki = [...container.querySelectorAll('[data-uzwojenie-rodzaj="brak"]')];
      expect(znaki).toHaveLength(2);
      expect(znaki.every((z) => z.textContent === '?')).toBe(true);
    });
  }

  it('wołający bez rozwiązywania grupy (uzwojenia nieprzekazane): glif bazowy bez znaków — nie rysuje „?" zastępczo', () => {
    const { container } = render(
      <svg>
        <Glif x={0} y={0} stroke="#000000" />
      </svg>,
    );
    expect(container.querySelector('[data-uzwojenia-stan]')).toBeNull();
  });

  it('determinizm: ten sam zapis ⇒ identyczny markup', () => {
    const markup = (): string =>
      renderToStaticMarkup(
        <svg>
          <Glif x={0} y={0} stroke="#000000" uzwojenia={uzwojeniaZGrupyPolaczen('Dyn11')} />
        </svg>,
      );
    expect(markup()).toBe(markup());
  });
});
