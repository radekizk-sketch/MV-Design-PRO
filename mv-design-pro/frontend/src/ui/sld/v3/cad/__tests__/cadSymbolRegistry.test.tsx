/**
 * PIN rejestru symboli CAD (R2 §16/§19/§22/§23) i renderera `CadSymbol`.
 *
 * Reguła KLASA, nie instancja: każdy test iteruje po CAŁYM rejestrze
 * (`CAD_SYMBOL_IDS`) i po iloczynie „symbol × stan", nie po przykładzie.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CadSymbol } from '../CadSymbol';
import {
  CAD_SYMBOL_IDS,
  ELECTRICAL_CAD_SYMBOL_REGISTRY,
  KAT_NIEZNANY,
  KAT_NIEZNANY_WKLADKI,
  KAT_OTWARTY,
  KAT_OTWARTY_WKLADKI,
  gabarytCad,
  maStanLaczeniowy,
  prymitywy,
  zaciskCad,
  type CadPrimitive,
  type CadSwitchState,
  type CadSymbolId,
} from '../cadSymbolRegistry';

const STANY: readonly CadSwitchState[] = ['closed', 'open', 'unknown'];

type Przegub = Extract<CadPrimitive, { k: 'pivot' }>;
type Kreska = Extract<CadPrimitive, { k: 'line' }>;

function splaszcz(prims: readonly CadPrimitive[]): CadPrimitive[] {
  return prims.flatMap((p) => (p.k === 'pivot' ? [p, ...splaszcz(p.prims)] : [p]));
}

function przeguby(id: CadSymbolId, state: CadSwitchState): Przegub[] {
  return splaszcz(prymitywy(id, state)).filter((p): p is Przegub => p.k === 'pivot');
}

function katyPrzegubow(id: CadSymbolId, state: CadSwitchState): number[] {
  return przeguby(id, state).map((p) => Math.abs(p.deg));
}

function liczbaWypelnienTuszem(id: CadSymbolId, state: CadSwitchState): number {
  return splaszcz(prymitywy(id, state)).filter((p) => (p.k === 'circle' || p.k === 'path') && p.fill === 'ink').length;
}

/** Obrót punktu wokół przegubu o kąt grupy (układ SVG: y w dół, kąt dodatni = zgodnie z ruchem wskazówek). */
function obroc(p: { x: number; y: number }, c: { cx: number; cy: number }, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  const dx = p.x - c.cx;
  const dy = p.y - c.cy;
  return { x: c.cx + dx * Math.cos(a) - dy * Math.sin(a), y: c.cy + dx * Math.sin(a) + dy * Math.cos(a) };
}

/** Końcówka SWOBODNA noża po obrocie (koniec kreski `nozStanu` nieleżący w przegubie). */
function koncowkaNoza(id: CadSymbolId, state: CadSwitchState): { x: number; y: number; przegub: Przegub } {
  const [przegub] = przeguby(id, state);
  const noz = przegub.prims.find((p): p is Kreska => p.k === 'line' && p.nozStanu === true);
  if (!noz) throw new Error(`${id}: brak noża`);
  const wPrzegubie = (x: number, y: number) => x === przegub.cx && y === przegub.cy;
  const koniec = wPrzegubie(noz.x1, noz.y1) ? { x: noz.x2, y: noz.y2 } : { x: noz.x1, y: noz.y1 };
  return { ...obroc(koniec, przegub, przegub.deg), przegub };
}

/** Symbole ze stanem w kolejności rejestru — lista ZAMKNIĘTA (nowy łącznik = świadomy wpis tutaj). */
const ZE_STANEM: readonly CadSymbolId[] = [
  'cad.wylacznik',
  'cad.wylacznikInstalacyjny',
  'cad.odlacznik',
  'cad.rozlacznik',
  'cad.lacznik',
  'cad.uziemnik',
  'cad.rozlacznikBezpiecznikowy',
];

/** Kąty otwarcia inne niż domyślne (dłuższy nóż z wkładką → mniejszy kąt, ta sama wysokość końcówki). */
const KAT_OTWARCIA: Partial<Record<CadSymbolId, { open: number; unknown: number }>> = {
  'cad.rozlacznikBezpiecznikowy': { open: KAT_OTWARTY_WKLADKI, unknown: KAT_NIEZNANY_WKLADKI },
};

/** Znaki normatywne będące CZĘŚCIĄ symbolu IEC (nie etykietą): kod maszyny „G", „3" faz przy „~" przekształtnika. */
const LITERY_NORMATYWNE: Partial<Record<CadSymbolId, readonly string[]>> = {
  'cad.generator': ['G'],
  'cad.przeksztaltnik': ['3'],
  'cad.zrodloPvZPrzeksztaltnikiem': ['3'],
  'cad.magazynZPrzeksztaltnikiem': ['3'],
};

describe('rejestr symboli CAD — kontrakt R2', () => {
  it('ma 19 symboli, każdy z odniesieniem normatywnym, nazwą polską, typem domenowym i statusem; ŻADEN nie jest NORMATIVE_VERIFIED bez porównania z bazą IEC', () => {
    expect(CAD_SYMBOL_IDS).toHaveLength(19);
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

  it('stan wynika z KĄTA przegubu: CLOSED 0°, OPEN |KAT_OTWARTY|, UNKNOWN |KAT_NIEZNANY| — dla każdego symbolu ze stanem', () => {
    const zeStanem = CAD_SYMBOL_IDS.filter(maStanLaczeniowy);
    expect(zeStanem).toEqual(ZE_STANEM);
    for (const id of zeStanem) {
      const katy = KAT_OTWARCIA[id] ?? { open: KAT_OTWARTY, unknown: KAT_NIEZNANY };
      expect(katyPrzegubow(id, 'closed')).toEqual([0]);
      expect(katyPrzegubow(id, 'open')).toEqual([Math.abs(katy.open)]);
      expect(katyPrzegubow(id, 'unknown')).toEqual([Math.abs(katy.unknown)]);
      expect(Math.abs(katy.unknown)).toBeLessThan(Math.abs(katy.open));
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

  it('warstwa CAD = wyłącznie prymitywy wektorowe; znaki normatywne TYLKO tam, gdzie są częścią symbolu IEC (G maszyny, „3" przekształtnika)', () => {
    const dozwolone = new Set(['line', 'circle', 'arc', 'path', 'pivot', 'letter']);
    for (const id of CAD_SYMBOL_IDS) {
      for (const s of STANY) {
        const litery = splaszcz(prymitywy(id, s)).filter((p): p is Extract<CadPrimitive, { k: 'letter' }> => p.k === 'letter');
        for (const p of splaszcz(prymitywy(id, s))) {
          expect(dozwolone.has(p.k), `${id}: prymityw ${p.k}`).toBe(true);
        }
        expect(litery.map((p) => p.t), `${id}: znaki normatywne`).toEqual(LITERY_NORMATYWNE[id] ?? []);
      }
    }
  });

  it('pierwowzór właściciela (R2.1): przegub u DOŁU, styk stały u GÓRY, otwarty nóż odchyla końcówkę W LEWO na wysokość styku stałego; nóż zamknięty leży w osi toru', () => {
    for (const id of ZE_STANEM) {
      const def = ELECTRICAL_CAD_SYMBOL_REGISTRY[id];
      const os = def.anchors.center.x;
      const zamkniety = koncowkaNoza(id, 'closed');
      expect(zamkniety.x, `${id}: zamknięty nóż poza osią`).toBeCloseTo(os, 6);
      const otwarty = koncowkaNoza(id, 'open');
      expect(otwarty.x, `${id}: otwarty nóż nie odchyla się w lewo`).toBeLessThan(os - 2);
      const nieznany = koncowkaNoza(id, 'unknown');
      expect(nieznany.x, `${id}: stan nieznany między zamkniętym a otwartym`).toBeLessThan(os);
      expect(nieznany.x).toBeGreaterThan(otwarty.x);
      if (id === 'cad.uziemnik') {
        // Uziemnik: przegub na przewodzie toru (u góry), nóż zamyka W DÓŁ na styk strony uziemienia.
        expect(otwarty.przegub.cy).toBeLessThan(def.nominalHeight / 2);
        continue;
      }
      // Przegub w dolnej połowie symbolu, końcówka otwartego noża nie niżej niż 1 u poniżej końca przewodu górnego.
      expect(otwarty.przegub.cy, `${id}: przegub nie u dołu`).toBeGreaterThan(def.nominalHeight / 2);
      const przewodGorny = def.body.find((p): p is Kreska => p.k === 'line' && p.y1 === 0 && p.x1 === os);
      if (!przewodGorny) throw new Error(`${id}: brak przewodu górnego`);
      expect(otwarty.y, `${id}: końcówka otwartego noża za nisko`).toBeLessThanOrEqual(przewodGorny.y2 + 1);
    }
  });

  it('pierwowzór właściciela (R2.1): kwalifikatory funkcji NIERUCHOME na styku stałym (krzyżyk, poprzeczka, okrąg pod poprzeczką); wyzwalacze MCB i wkładka obracane Z nożem', () => {
    const pozaPrzegubem = (id: CadSymbolId) => prymitywy(id, 'open').filter((p) => p.k !== 'pivot' && !ELECTRICAL_CAD_SYMBOL_REGISTRY[id].body.includes(p));
    const wPrzegubie = (id: CadSymbolId) => przeguby(id, 'open')[0].prims.filter((p) => !(p.k === 'line' && p.nozStanu));

    // Wyłącznik mocy: krzyżyk = dwie kreski przecinające się w KOŃCU przewodu górnego, poza przegubem; nic przy nożu.
    const wyl = ELECTRICAL_CAD_SYMBOL_REGISTRY['cad.wylacznik'];
    const przewodGornyWyl = wyl.body.find((p): p is Kreska => p.k === 'line' && p.y1 === 0)!;
    const krzyzyk = pozaPrzegubem('cad.wylacznik').filter((p): p is Kreska => p.k === 'line');
    expect(krzyzyk).toHaveLength(2);
    for (const k of krzyzyk) {
      expect((k.x1 + k.x2) / 2).toBe(wyl.anchors.center.x);
      expect((k.y1 + k.y2) / 2).toBe(przewodGornyWyl.y2);
      expect(Math.abs(k.x2 - k.x1)).toBe(Math.abs(k.y2 - k.y1)); // 45°
    }
    expect(wPrzegubie('cad.wylacznik')).toEqual([]);

    // Wyłącznik instalacyjny: BEZ krzyżyka; wyzwalacze (kreski, „hak" bimetalu, strzałka pełna) w grupie przegubu, po LEWEJ stronie noża.
    expect(pozaPrzegubem('cad.wylacznikInstalacyjny')).toEqual([]);
    const wyzwalacze = wPrzegubie('cad.wylacznikInstalacyjny');
    expect(wyzwalacze.length).toBeGreaterThanOrEqual(3);
    expect(wyzwalacze.some((p) => p.k === 'path' && p.fill === 'ink'), 'strzałka wyzwalacza elektromagnetycznego').toBe(true);
    for (const p of wyzwalacze) {
      if (p.k === 'line') expect(Math.max(p.x1, p.x2)).toBeLessThanOrEqual(8);
    }

    // Odłącznik: poprzeczka pozioma na końcu przewodu górnego; rozłącznik = ta sama poprzeczka + okrąg ZAWIESZONY POD nią.
    const poprzeczkaOdl = pozaPrzegubem('cad.odlacznik').filter((p): p is Kreska => p.k === 'line');
    expect(poprzeczkaOdl).toHaveLength(1);
    expect(poprzeczkaOdl[0].y1).toBe(poprzeczkaOdl[0].y2);
    expect(poprzeczkaOdl[0].y1).toBe(przewodGornyWyl.y2);
    const roz = pozaPrzegubem('cad.rozlacznik');
    const poprzeczkaRoz = roz.find((p): p is Kreska => p.k === 'line')!;
    const okrag = roz.find((p): p is Extract<CadPrimitive, { k: 'circle' }> => p.k === 'circle')!;
    expect(poprzeczkaRoz).toEqual(poprzeczkaOdl[0]);
    expect(okrag.cx).toBe(8);
    expect(okrag.cy).toBeCloseTo(poprzeczkaRoz.y1 + okrag.r, 6);
    expect(okrag.fill).toBe('paper');
    expect(wPrzegubie('cad.odlacznik')).toEqual([]);
    expect(wPrzegubie('cad.rozlacznik')).toEqual([]);

    // Rozłącznik bezpiecznikowy: poprzeczka + okrąg u góry NIERUCHOME, wkładka (prostokąt) obracana z nożem.
    const rb = pozaPrzegubem('cad.rozlacznikBezpiecznikowy');
    expect(rb.filter((p) => p.k === 'line')).toHaveLength(1);
    expect(rb.filter((p) => p.k === 'circle')).toHaveLength(1);
    const wkladka = wPrzegubie('cad.rozlacznikBezpiecznikowy');
    expect(wkladka).toHaveLength(1);
    expect(wkladka[0].k).toBe('path');

    // Łącznik ogólny: sam nóż, bez kwalifikatorów.
    expect(pozaPrzegubem('cad.lacznik')).toEqual([]);
    expect(wPrzegubie('cad.lacznik')).toEqual([]);
  });

  it('pierwowzór właściciela (R2.1): przekształtnik z „3~" po stronie AC (zacisk u góry) i „=" po stronie DC; PV i magazyn = przekształtnik NAD źródłem', () => {
    const konwerter = ELECTRICAL_CAD_SYMBOL_REGISTRY['cad.przeksztaltnik'];
    expect(konwerter.terminals.find((t) => t.name === 'ac')).toEqual({ name: 'ac', x: 8, y: 0, dir: 'N' });
    expect(konwerter.terminals.find((t) => t.name === 'dc')).toEqual({ name: 'dc', x: 8, y: 24, dir: 'S' });
    const litera = konwerter.body.find((p): p is Extract<CadPrimitive, { k: 'letter' }> => p.k === 'letter')!;
    const kreskiDc = konwerter.body.filter((p): p is Kreska => p.k === 'line' && p.y1 === p.y2 && p.x1 !== 8);
    expect(kreskiDc).toHaveLength(2);
    expect(litera.y).toBeLessThan(Math.min(...kreskiDc.map((k) => k.y1)));
    for (const id of ['cad.zrodloPvZPrzeksztaltnikiem', 'cad.magazynZPrzeksztaltnikiem'] as const) {
      const def = ELECTRICAL_CAD_SYMBOL_REGISTRY[id];
      expect(def.terminals).toEqual([{ name: 'ac', x: 8, y: 0, dir: 'N' }]);
      const literaZlozenia = def.body.find((p): p is Extract<CadPrimitive, { k: 'letter' }> => p.k === 'letter')!;
      // Ramka źródła (pole DC) leży PONIŻEJ przekształtnika.
      const ramki = def.body.filter((p): p is Extract<CadPrimitive, { k: 'path' }> => p.k === 'path' && /h 14 v 18/.test(p.d));
      expect(ramki).toHaveLength(1);
      const yRamki = Number(ramki[0].d.split(' ')[2]);
      expect(yRamki).toBeGreaterThan(literaZlozenia.y);
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

  it('orientacja pozioma (+90°): zacisk a po PRAWEJ, b po LEWEJ, gabaryt obrócony wokół środka; otwarty nóż odchyla się W GÓRĘ od osi szyny', () => {
    expect(zaciskCad('cad.wylacznik', 'a', 'pozioma')).toEqual({ name: 'a', x: 20, y: 12, dir: 'E' });
    expect(zaciskCad('cad.wylacznik', 'b', 'pozioma')).toEqual({ name: 'b', x: -4, y: 12, dir: 'W' });
    expect(gabarytCad('cad.wylacznik', 'pozioma')).toEqual({ x: -4, y: 4, w: 24, h: 16 });
    for (const id of ZE_STANEM.filter((x) => x !== 'cad.uziemnik')) {
      const koncowka = koncowkaNoza(id, 'open');
      const c = ELECTRICAL_CAD_SYMBOL_REGISTRY[id].anchors.center;
      // rotate(+90°) wokół środka: x' = cx − (y − cy), y' = cy + (x − cx); końcówka w lewo (x < cx) → w górę (y' < cy).
      const poObrocie = { x: c.x - (koncowka.y - c.y), y: c.y + (koncowka.x - c.x) };
      expect(poObrocie.y, `${id}: otwarty nóż poziomo nie odchyla się w górę`).toBeLessThan(c.y);
    }
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

  it('orientacja pozioma obraca symbol o +90° wokół środka gabarytu (zgodnie z `punktPoObrocie`)', () => {
    const { g } = narysuj('cad.rozlacznik', 'open', { orientation: 'pozioma' });
    expect(g.getAttribute('transform')).toBe('translate(10 20) scale(2) rotate(90 8 12)');
    expect(g.getAttribute('data-orientation')).toBe('pozioma');
  });
});
