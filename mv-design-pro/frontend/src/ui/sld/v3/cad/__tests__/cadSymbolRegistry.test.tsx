/**
 * PIN rejestru symboli CAD (R2 §16/§19/§22/§23) i renderera `CadSymbol`.
 *
 * Reguła KLASA, nie instancja: każdy test iteruje po CAŁYM rejestrze
 * (`CAD_SYMBOL_IDS`) i po iloczynie „symbol × stan", nie po przykładzie.
 */
import { render } from '@testing-library/react';

import { CadSymbol } from '../CadSymbol';
import {
  CAD_SYMBOL_IDS,
  ELECTRICAL_CAD_SYMBOL_REGISTRY,
  KAT_NIEZNANY,
  KAT_OTWARTY,
  gabarytCad,
  maStanLaczeniowy,
  prymitywy,
  zaciskCad,
  type CadPrimitive,
  type CadSwitchState,
  type CadSymbolId,
} from '../cadSymbolRegistry';

const STANY: readonly CadSwitchState[] = ['closed', 'open', 'unknown'];

function splaszcz(prims: readonly CadPrimitive[]): CadPrimitive[] {
  return prims.flatMap((p) => (p.k === 'pivot' ? [p, ...splaszcz(p.prims)] : [p]));
}

function katyPrzegubow(id: CadSymbolId, state: CadSwitchState): number[] {
  return splaszcz(prymitywy(id, state))
    .filter((p): p is Extract<CadPrimitive, { k: 'pivot' }> => p.k === 'pivot')
    .map((p) => Math.abs(p.deg));
}

function liczbaWypelnienTuszem(id: CadSymbolId, state: CadSwitchState): number {
  return splaszcz(prymitywy(id, state)).filter((p) => (p.k === 'circle' || p.k === 'path') && p.fill === 'ink').length;
}

describe('rejestr symboli CAD — kontrakt R2', () => {
  it('ma 18 symboli, każdy z odniesieniem normatywnym, nazwą polską, typem domenowym i statusem; ŻADEN nie jest NORMATIVE_VERIFIED bez porównania z bazą IEC', () => {
    expect(CAD_SYMBOL_IDS).toHaveLength(18);
    for (const id of CAD_SYMBOL_IDS) {
      const def = ELECTRICAL_CAD_SYMBOL_REGISTRY[id];
      expect(def.symbolId).toBe(id);
      expect(def.standardReference.length).toBeGreaterThan(8);
      expect(def.polishName.length).toBeGreaterThan(3);
      expect(def.domainType.length).toBeGreaterThan(3);
      expect(def.notes.length).toBeGreaterThan(10);
      expect(['DRAFT', 'ENGINEERING_REVIEWED']).toContain(def.verificationStatus);
      expect(def.minimumSizePx).toBeGreaterThan(0);
    }
    // Statusy DRAFT są jawne i zamknięte (uziemnik bez elementu ENM, zabezpieczenie bez glifu IEC).
    const drafty = CAD_SYMBOL_IDS.filter((id) => ELECTRICAL_CAD_SYMBOL_REGISTRY[id].verificationStatus === 'DRAFT');
    expect(drafty).toEqual(['cad.uziemnik', 'cad.zabezpieczenie']);
  });

  it('kotwice na siatce 1 u, zaciski na siatce i NA KRAWĘDZI gabarytu (§16)', () => {
    for (const id of CAD_SYMBOL_IDS) {
      const def = ELECTRICAL_CAD_SYMBOL_REGISTRY[id];
      const { top, bottom, left, right, center } = def.anchors;
      for (const p of [top, bottom, left, right, center]) {
        expect(Number.isInteger(p.x), `${id}: kotwica x=${p.x}`).toBe(true);
        expect(Number.isInteger(p.y), `${id}: kotwica y=${p.y}`).toBe(true);
      }
      expect(top).toEqual({ x: def.nominalWidth / 2, y: 0 });
      expect(bottom).toEqual({ x: def.nominalWidth / 2, y: def.nominalHeight });
      expect(center).toEqual({ x: def.nominalWidth / 2, y: def.nominalHeight / 2 });
      expect(def.terminals.length).toBeGreaterThan(0);
      for (const t of def.terminals) {
        expect(Number.isInteger(t.x) && Number.isInteger(t.y), `${id}: zacisk ${t.name} poza siatką`).toBe(true);
        const naKrawedzi = t.x === 0 || t.x === def.nominalWidth || t.y === 0 || t.y === def.nominalHeight;
        expect(naKrawedzi, `${id}: zacisk ${t.name} nie leży na krawędzi gabarytu`).toBe(true);
      }
    }
  });

  it('stan wynika z KĄTA przegubu: CLOSED 0°, OPEN ±KAT_OTWARTY, UNKNOWN ±KAT_NIEZNANY — dla każdego symbolu ze stanem', () => {
    const zeStanem = CAD_SYMBOL_IDS.filter(maStanLaczeniowy);
    expect(zeStanem).toEqual(['cad.wylacznik', 'cad.odlacznik', 'cad.rozlacznik', 'cad.lacznik', 'cad.uziemnik', 'cad.rozlacznikBezpiecznikowy']);
    for (const id of zeStanem) {
      expect(katyPrzegubow(id, 'closed')).toEqual([0]);
      expect(katyPrzegubow(id, 'open')).toEqual([KAT_OTWARTY]);
      expect(katyPrzegubow(id, 'unknown')).toEqual([KAT_NIEZNANY]);
      // Ta sama rodzina geometryczna: korpus identyczny, różni się wyłącznie grupa przegubu.
      const bezPrzegubu = (state: CadSwitchState) => prymitywy(id, state).filter((p) => p.k !== 'pivot');
      expect(bezPrzegubu('open')).toEqual(bezPrzegubu('closed'));
      expect(bezPrzegubu('unknown')).toEqual(bezPrzegubu('closed'));
      // Nóż oznaczony `nozStanu` istnieje dokładnie raz.
      const noze = splaszcz(prymitywy(id, 'open')).filter((p) => p.k === 'line' && p.nozStanu);
      expect(noze, `${id}: dokładnie jedna kreska noża`).toHaveLength(1);
    }
    for (const id of CAD_SYMBOL_IDS.filter((x) => !maStanLaczeniowy(x))) {
      expect(katyPrzegubow(id, 'closed')).toEqual([]);
      expect(prymitywy(id, 'open')).toEqual(prymitywy(id, 'closed'));
    }
  });

  it('wypełnienie NIE jest nośnikiem stanu (§14): liczba elementów wypełnionych tuszem identyczna w każdym stanie', () => {
    for (const id of CAD_SYMBOL_IDS) {
      const wartosci = new Set(STANY.map((s) => liczbaWypelnienTuszem(id, s)));
      expect(wartosci.size, `${id}: fill różni się między stanami`).toBe(1);
    }
  });

  it('warstwa CAD = wyłącznie prymitywy wektorowe; litera normatywna TYLKO w generatorze (kod maszyny G)', () => {
    const dozwolone = new Set(['line', 'circle', 'arc', 'path', 'pivot', 'letter']);
    for (const id of CAD_SYMBOL_IDS) {
      for (const s of STANY) {
        for (const p of splaszcz(prymitywy(id, s))) {
          expect(dozwolone.has(p.k), `${id}: prymityw ${p.k}`).toBe(true);
          if (p.k === 'letter') {
            expect(id).toBe('cad.generator');
            expect(p.t).toBe('G');
          }
        }
      }
    }
  });

  it('CT ≠ VT ≠ transformator: liczba zacisków i geometria różne', () => {
    const ct = ELECTRICAL_CAD_SYMBOL_REGISTRY['cad.przekladnikPradowy'];
    const vt = ELECTRICAL_CAD_SYMBOL_REGISTRY['cad.przekladnikNapieciowy'];
    const tr = ELECTRICAL_CAD_SYMBOL_REGISTRY['cad.transformator2u'];
    expect(ct.terminals.map((t) => t.name)).toEqual(['a', 'b']);
    expect(vt.terminals.map((t) => t.name)).toEqual(['a']);
    expect(tr.terminals.map((t) => t.name)).toEqual(['hv', 'lv']);
    expect(ct.body).not.toEqual(vt.body);
    expect(vt.body).not.toEqual(tr.body);
    expect(tr.nominalHeight).toBeGreaterThan(vt.nominalHeight);
  });

  it('każdy symbol ma UNIKALNĄ geometrię w stanie zamkniętym (rozpoznawalność bez etykiet §22)', () => {
    const odciski = new Map<string, CadSymbolId>();
    for (const id of CAD_SYMBOL_IDS) {
      const odcisk = JSON.stringify(prymitywy(id, 'closed'));
      expect(odciski.has(odcisk), `${id} ma tę samą geometrię co ${odciski.get(odcisk)}`).toBe(false);
      odciski.set(odcisk, id);
    }
  });

  it('orientacja pozioma: zacisk a po LEWEJ, b po PRAWEJ, gabaryt obrócony wokół środka', () => {
    expect(zaciskCad('cad.wylacznik', 'a', 'pozioma')).toEqual({ name: 'a', x: -4, y: 12, dir: 'W' });
    expect(zaciskCad('cad.wylacznik', 'b', 'pozioma')).toEqual({ name: 'b', x: 20, y: 12, dir: 'E' });
    expect(gabarytCad('cad.wylacznik', 'pozioma')).toEqual({ x: -4, y: 4, w: 24, h: 16 });
    expect(gabarytCad('cad.wylacznik')).toEqual({ x: 0, y: 0, w: 16, h: 24 });
    expect(zaciskCad('cad.wylacznik', 'a')).toEqual({ name: 'a', x: 8, y: 0, dir: 'N' });
    expect(() => zaciskCad('cad.wylacznik', 'nie-ma')).toThrow(/nie ma zacisku/);
  });

  it('snapshot prymitywów per symbol × stan (zmiana geometrii = świadoma decyzja rejestru)', () => {
    const migawka = Object.fromEntries(
      CAD_SYMBOL_IDS.map((id) => [id, Object.fromEntries((maStanLaczeniowy(id) ? STANY : ['closed']).map((s) => [s, prymitywy(id, s as CadSwitchState)]))]),
    );
    expect(migawka).toMatchSnapshot();
  });
});

describe('CadSymbol — renderer', () => {
  function narysuj(id: CadSymbolId, state: CadSwitchState = 'closed', extra: Partial<Parameters<typeof CadSymbol>[0]> = {}) {
    const { container } = render(
      <svg>
        <CadSymbol id={id} x={10} y={20} scale={2} state={state} ink="#123456" paper="#ffffff" testId="sym" {...extra} />
      </svg>,
    );
    const g = container.querySelector('g[data-symbol-family="cad"]');
    if (!g) throw new Error('brak grupy symbolu');
    return { container, g };
  }

  it('rysuje grupę symbolu z atrybutami kanonu, kreską nieskalowaną, bez bitmap i ikon — dla każdego symbolu', () => {
    for (const id of CAD_SYMBOL_IDS) {
      const { g } = narysuj(id);
      expect(g.getAttribute('data-symbol-canon')).toBe(id);
      expect(g.getAttribute('data-verification')).toBe(ELECTRICAL_CAD_SYMBOL_REGISTRY[id].verificationStatus);
      expect(g.getAttribute('transform')).toBe('translate(10 20) scale(2)');
      expect(g.querySelectorAll('image, foreignObject, use').length).toBe(0);
      const kreski = g.querySelectorAll('line, circle, path');
      expect(kreski.length).toBeGreaterThan(0);
      for (const k of Array.from(kreski)) {
        expect(k.getAttribute('vector-effect')).toBe('non-scaling-stroke');
        expect(k.getAttribute('stroke')).toBe('#123456');
      }
      if (maStanLaczeniowy(id)) expect(g.getAttribute('data-switch-state')).toBe('closed');
      else expect(g.hasAttribute('data-switch-state')).toBe(false);
    }
  });

  it('stan NIEZNANY: przerywany WYŁĄCZNIE nóż; kwalifikatory i korpus ciągłe', () => {
    for (const id of CAD_SYMBOL_IDS.filter(maStanLaczeniowy)) {
      const { g } = narysuj(id, 'unknown');
      const noz = g.querySelector('line[data-cad="noz"]');
      expect(noz?.getAttribute('stroke-dasharray'), `${id}: nóż bez kreski przerywanej`).toBeTruthy();
      for (const inne of Array.from(g.querySelectorAll('line[data-cad="line"], circle, path'))) {
        expect(inne.getAttribute('stroke-dasharray'), `${id}: element poza nożem przerywany`).toBeNull();
      }
      const { g: zamkniety } = narysuj(id, 'closed');
      expect(zamkniety.querySelector('line[data-cad="noz"]')?.getAttribute('stroke-dasharray')).toBeNull();
    }
  });

  it('OPEN ≠ CLOSED w DOM przez kąt przegubu, a nie przez fill', () => {
    for (const id of CAD_SYMBOL_IDS.filter(maStanLaczeniowy)) {
      const { g: otwarty } = narysuj(id, 'open');
      const { g: zamkniety } = narysuj(id, 'closed');
      expect(otwarty.querySelector('[data-cad="pivot"]')?.getAttribute('data-cad-deg')).not.toBe('0');
      expect(zamkniety.querySelector('[data-cad="pivot"]')?.getAttribute('data-cad-deg')).toBe('0');
      const wypelnione = (el: Element) => Array.from(el.querySelectorAll('[fill]')).filter((e) => e.getAttribute('fill') === '#123456').length;
      expect(wypelnione(otwarty)).toBe(wypelnione(zamkniety));
    }
  });

  it('zabezpieczenie: znaki IEC z danych wewnątrz prostokąta (maks. 2); inne symbole ignorują `wnetrze`', () => {
    const { g } = narysuj('cad.zabezpieczenie', 'closed', { wnetrze: ['I>', 'I0>', 'U<'] });
    const znaki = Array.from(g.querySelectorAll('text[data-cad="mark"]')).map((t) => t.textContent);
    expect(znaki).toEqual(['I>', 'I0>']);
    const { g: wylacznik } = narysuj('cad.wylacznik', 'closed', { wnetrze: ['I>'] });
    expect(wylacznik.querySelectorAll('text').length).toBe(0);
    const { g: generator } = narysuj('cad.generator');
    expect(Array.from(generator.querySelectorAll('text[data-cad="letter"]')).map((t) => t.textContent)).toEqual(['G']);
  });

  it('orientacja pozioma obraca symbol o −90° wokół środka gabarytu', () => {
    const { g } = narysuj('cad.rozlacznik', 'open', { orientation: 'pozioma' });
    expect(g.getAttribute('transform')).toBe('translate(10 20) scale(2) rotate(-90 8 12)');
    expect(g.getAttribute('data-orientation')).toBe('pozioma');
  });
});
