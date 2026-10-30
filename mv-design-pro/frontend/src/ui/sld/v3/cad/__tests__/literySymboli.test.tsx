/**
 * LITERY SYMBOLI — podłoga czytelności S9-7 i tusz bez nakładania na kreskę (karta
 * UX-04/POLE-LINIOWE-WZORZEC, decyzja architekta §11.7 pkt 5: „podłoga S9-7 (8 px przy wejściu
 * w LOD2) obejmuje litery symboli”).
 *
 * (A) INWENTARZ wszystkich liter symboli z rejestrów — rejestr CAD (`ELECTRICAL_CAD_SYMBOL_
 * REGISTRY`, każdy stan łącznika, przeguby rozwinięte), znaki wnętrza zabezpieczenia CAD,
 * symbole QET pola SN (`QET_SYMBOLE_POLA_SN`: przewody, rysunek stały, nóż, osprzęt) i glify
 * sceny (`SYMBOL_GLYPHS` każdego `SymbolId` w wariantach, które rysują tekst: kody przekaźnika,
 * znaki „!”, „?” uzwojeń, litera miernika, znaki kafla stanu w każdym stanie). Każda litera ma
 * na ekranie ≥ `MIN_TEXT_SCREEN_PX`: glify i symbole QET w jednostkach świata (skala ≥ 1 przy
 * wejściu w LOD 2), rejestr CAD w jednostkach `u` × `CAD_U_PX` (widok domeny nN, skala
 * biblioteki stała na ekranie). Inwentarz jest przypięty co do rodzajów źródeł (test nie może
 * stać się pusty przy zmianie rejestru).
 *
 * (B) TUSZ BEZ NAKŁADANIA. Prostokąt tuszu litery liczony NIEZALEŻNIE z surowej tabeli kroju
 * (`metrykiKroju.json`: posuwy — szerokość przy `text-anchor: middle`, nagłówki glifów — pion;
 * linia centralna (wznoszenie − zejście)/2 nad linią bazową dla `dominant-baseline: central`)
 * nie dotyka żadnej kreski TEGO SAMEGO symbolu (odcinek, okrąg, łuk, ścieżka — z połową
 * grubości kreski), dla każdej litery rejestru CAD i QET. Okrąg przekaźnika: każdy kod
 * słownika funkcji EAZ (czytany z `backend/src/network_model/catalog/funkcje_eaz.py`) sam
 * i w każdej uporządkowanej parze — kody wybrane do okręgu mieszczą się w promieniu wewnętrznej
 * krawędzi kreski, wiersze nie nachodzą na siebie, a okrąg ∪ reszta = lista wejściowa
 * w kolejności. Znaki „!” mieszczą się w swoich kółkach.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import metrykiKroju from '../../core/metrykiKroju.json';
import { MIN_TEXT_SCREEN_PX } from '../../core/text';
import { FUNKCJA_ZABEZPIECZENIA, znakiIec } from '../../lv-domain/symbolRegistry';
import { CAD_U_PX } from '../../lv-domain/visualGrammar';
import type { SymbolId } from '../../symbols/defs';
import {
  PISMO_ZNAKU_OSTRZEZENIA,
  PROMIEN_ZNAKU_OSTRZEZENIA,
  SYMBOL_GLYPHS,
  SYMBOL_IDS,
  V3_STROKE_APPARATUS,
  type GlyphProps,
  type SwitchState,
} from '../../symbols/glyphs';
import {
  KRESKA_OKREGU_PRZEKAZNIKA,
  OKRAG_PRZEKAZNIKA,
  PISMO_KODU_W_OKREGU,
  kodyPozaOkregiemPrzekaznika,
  ukladKodowWOkregu,
} from '../../symbols/okragPrzekaznika';
import { STATE_COLOR } from '../../theme/colorTokens';
import { CAD_SYMBOL_STROKE_PX, CadSymbol, WAGA_LITERY_SYMBOLU } from '../CadSymbol';
import { CAD_LITERA_MIN_U, CAD_SYMBOL_IDS, ELECTRICAL_CAD_SYMBOL_REGISTRY, prymitywy, type CadPrimitive } from '../cadSymbolRegistry';
import { QET_KRESKA_GLIFU, QET_ODMIANA_KROJU_LITER, QET_SYMBOLE_POLA_SN, type QetSymbolPolaSnId } from '../qet/qetPoleSn';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Surowa metryka kroju (bez kodu `core/text.ts`).
// ---------------------------------------------------------------------------

const EM = metrykiKroju.jednostkiEm;
const SANS = metrykiKroju.kroje.sans;
const ZNAKI = Array.from(SANS.znaki);
type Odmiana = '400' | '700';
const odmianaWagi = (waga: number): Odmiana => (waga > 500 ? '700' : '400');

interface Prostokat {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Prostokąt tuszu tekstu z `text-anchor: middle` w punkcie `x` i linii bazowej `baza`. */
function tuszTekstu(tekst: string, x: number, baza: number, rozmiar: number, waga: number): Prostokat {
  const odm = odmianaWagi(waga);
  let szer = 0;
  let yMin = 0;
  let yMax = 0;
  for (const z of tekst) {
    const i = ZNAKI.indexOf(z);
    expect(i, `„${z}” w tabeli kroju`).toBeGreaterThanOrEqual(0);
    szer += SANS.posuwy[odm][i] / EM;
    yMin = Math.min(yMin, SANS.pionowe[odm].tuszDol[i] / EM);
    yMax = Math.max(yMax, SANS.pionowe[odm].tuszGora[i] / EM);
  }
  return { x0: x - (szer * rozmiar) / 2, x1: x + (szer * rozmiar) / 2, y0: baza - yMax * rozmiar, y1: baza - yMin * rozmiar };
}

/** Linia bazowa tekstu z `dominant-baseline: central` w punkcie `y`. */
function bazaCentralna(y: number, rozmiar: number, waga: number): number {
  const p = SANS.pionowe[odmianaWagi(waga)];
  return y + ((p.wznoszenie - p.zejscie) / 2 / EM) * rozmiar;
}

// ---------------------------------------------------------------------------
// Geometria kreski: odcinki (ścieżki próbkowane) i okręgi.
// ---------------------------------------------------------------------------

type P = readonly [number, number];
interface Kreska {
  readonly odcinki: readonly (readonly [P, P])[];
  readonly okregi: readonly { readonly c: P; readonly r: number }[];
  readonly polGrubosci: number;
  readonly opis: string;
}

/** Punkty ścieżki SVG (M L H V Z Q T A, bezwzględne i względne) — krzywe próbkowane. */
function probkujSciezke(d: string): P[][] {
  const tokeny = d.match(/[MLHVZQTAmlhvzqta]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const linie: P[][] = [];
  let biezaca: P[] = [];
  let pkt: P = [0, 0];
  let start: P = [0, 0];
  let ostatniKontrolny: P | null = null;
  let i = 0;
  let polecenie = '';
  const liczba = (): number => Number(tokeny[i++]);
  const kwadratowa = (k: P, koniec: P): void => {
    for (let n = 1; n <= 24; n += 1) {
      const t = n / 24;
      biezaca.push([
        (1 - t) ** 2 * pkt[0] + 2 * (1 - t) * t * k[0] + t ** 2 * koniec[0],
        (1 - t) ** 2 * pkt[1] + 2 * (1 - t) * t * k[1] + t ** 2 * koniec[1],
      ]);
    }
    ostatniKontrolny = k;
    pkt = koniec;
  };
  while (i < tokeny.length) {
    if (/[A-Za-z]/.test(tokeny[i])) polecenie = tokeny[i++];
    const wzgl = polecenie === polecenie.toLowerCase();
    const o: P = wzgl ? pkt : [0, 0];
    switch (polecenie.toUpperCase()) {
      case 'M': {
        if (biezaca.length > 1) linie.push(biezaca);
        pkt = [o[0] + liczba(), o[1] + liczba()];
        start = pkt;
        biezaca = [pkt];
        polecenie = wzgl ? 'l' : 'L';
        ostatniKontrolny = null;
        break;
      }
      case 'L':
        pkt = [o[0] + liczba(), o[1] + liczba()];
        biezaca.push(pkt);
        ostatniKontrolny = null;
        break;
      case 'H':
        pkt = [(wzgl ? pkt[0] : 0) + liczba(), pkt[1]];
        biezaca.push(pkt);
        ostatniKontrolny = null;
        break;
      case 'V':
        pkt = [pkt[0], (wzgl ? pkt[1] : 0) + liczba()];
        biezaca.push(pkt);
        ostatniKontrolny = null;
        break;
      case 'Z':
        biezaca.push(start);
        pkt = start;
        ostatniKontrolny = null;
        break;
      case 'Q': {
        const k: P = [o[0] + liczba(), o[1] + liczba()];
        kwadratowa(k, [o[0] + liczba(), o[1] + liczba()]);
        break;
      }
      case 'T': {
        const poprzedni: P | null = ostatniKontrolny;
        const k: P = poprzedni ? [2 * pkt[0] - poprzedni[0], 2 * pkt[1] - poprzedni[1]] : pkt;
        kwadratowa(k, [o[0] + liczba(), o[1] + liczba()]);
        break;
      }
      case 'A': {
        // SVG 1.1 F.6.5: parametryzacja środkowa łuku z punktów końcowych.
        let rx = Math.abs(liczba());
        let ry = Math.abs(liczba());
        const fi = (liczba() * Math.PI) / 180;
        const duzy = liczba() !== 0;
        const zgodny = liczba() !== 0;
        const koniec: P = [o[0] + liczba(), o[1] + liczba()];
        const dx = (pkt[0] - koniec[0]) / 2;
        const dy = (pkt[1] - koniec[1]) / 2;
        const x1 = Math.cos(fi) * dx + Math.sin(fi) * dy;
        const y1 = -Math.sin(fi) * dx + Math.cos(fi) * dy;
        const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
        if (lam > 1) {
          rx *= Math.sqrt(lam);
          ry *= Math.sqrt(lam);
        }
        const znak = duzy === zgodny ? -1 : 1;
        const licz = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
        const wsp = znak * Math.sqrt(Math.max(0, licz / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
        const cx1 = (wsp * rx * y1) / ry;
        const cy1 = (-wsp * ry * x1) / rx;
        const cx = Math.cos(fi) * cx1 - Math.sin(fi) * cy1 + (pkt[0] + koniec[0]) / 2;
        const cy = Math.sin(fi) * cx1 + Math.cos(fi) * cy1 + (pkt[1] + koniec[1]) / 2;
        const kat = (ux: number, uy: number, vx: number, vy: number): number => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
        const t1 = kat(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
        let dt = kat((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
        if (!zgodny && dt > 0) dt -= 2 * Math.PI;
        if (zgodny && dt < 0) dt += 2 * Math.PI;
        for (let n = 1; n <= 48; n += 1) {
          const t = t1 + (dt * n) / 48;
          biezaca.push([
            cx + rx * Math.cos(fi) * Math.cos(t) - ry * Math.sin(fi) * Math.sin(t),
            cy + rx * Math.sin(fi) * Math.cos(t) + ry * Math.cos(fi) * Math.sin(t),
          ]);
        }
        pkt = koniec;
        ostatniKontrolny = null;
        break;
      }
      default:
        throw new Error(`ścieżka „${d}”: polecenie ${polecenie} poza obsługą testu`);
    }
  }
  if (biezaca.length > 1) linie.push(biezaca);
  return linie;
}

const obroc = (p: P, c: P, stopnie: number): P => {
  const a = (stopnie * Math.PI) / 180;
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a)];
};

/** Kreski prymitywów (bez liter) — `w` mnoży grubość bazową; przeguby obrócone. */
function kreskiPrymitywow(prims: readonly CadPrimitive[], bazowa: number, opis: string, obrot?: { c: P; deg: number }): Kreska[] {
  const t = (p: P): P => (obrot ? obroc(p, obrot.c, obrot.deg) : p);
  const wynik: Kreska[] = [];
  prims.forEach((p, i) => {
    const pol = (bazowa * ('w' in p && p.w !== undefined ? p.w : 1)) / 2;
    const o = `${opis}#${i}:${p.k}`;
    if (p.k === 'line') wynik.push({ odcinki: [[t([p.x1, p.y1]), t([p.x2, p.y2])]], okregi: [], polGrubosci: pol, opis: o });
    else if (p.k === 'circle') wynik.push({ odcinki: [], okregi: [{ c: t([p.cx, p.cy]), r: p.r }], polGrubosci: pol, opis: o });
    else if (p.k === 'arc' || p.k === 'path') {
      const odcinki: [P, P][] = [];
      for (const linia of probkujSciezke(p.d)) for (let j = 1; j < linia.length; j += 1) odcinki.push([t(linia[j - 1]), t(linia[j])]);
      wynik.push({ odcinki, okregi: [], polGrubosci: pol, opis: o });
    } else if (p.k === 'pivot') wynik.push(...kreskiPrymitywow(p.prims, bazowa, o, { c: [p.cx, p.cy], deg: p.deg }));
  });
  return wynik;
}

function literyPrymitywow(prims: readonly CadPrimitive[]): { readonly t: string; readonly x: number; readonly y: number; readonly size: number }[] {
  return prims.flatMap((p) => (p.k === 'letter' ? [p] : p.k === 'pivot' ? literyPrymitywow(p.prims) : []));
}

const odlPunktProstokat = (p: P, r: Prostokat): number => Math.hypot(Math.max(r.x0 - p[0], 0, p[0] - r.x1), Math.max(r.y0 - p[1], 0, p[1] - r.y1));

function przecinaProstokat(a: P, b: P, r: Prostokat): boolean {
  // Liang–Barsky: odcinek a→b w prostokącie.
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - r.x0], [dx, r.x1 - a[0]], [-dy, a[1] - r.y0], [dy, r.y1 - a[1]]] as const) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

function odlPunktOdcinek(p: P, a: P, b: P): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dl = dx * dx + dy * dy;
  const t = dl === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / dl));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Odstęp tuszu od osi kreski (0 = przecięcie). */
function odstepOdKreski(r: Prostokat, k: Kreska): number {
  let min = Infinity;
  const narozniki: P[] = [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]];
  for (const [a, b] of k.odcinki) {
    if (przecinaProstokat(a, b, r)) return 0;
    min = Math.min(min, odlPunktProstokat(a, r), odlPunktProstokat(b, r), ...narozniki.map((n) => odlPunktOdcinek(n, a, b)));
  }
  for (const { c, r: promien } of k.okregi) {
    const najblizszy = odlPunktProstokat(c, r);
    const najdalszy = Math.max(...narozniki.map((n) => Math.hypot(n[0] - c[0], n[1] - c[1])));
    if (najblizszy <= promien && najdalszy >= promien) return 0;
    min = Math.min(min, najdalszy < promien ? promien - najdalszy : najblizszy - promien);
  }
  return min;
}

// ---------------------------------------------------------------------------
// (A) Inwentarz liter i podłoga.
// ---------------------------------------------------------------------------

interface LiteraSymbolu {
  readonly zrodlo: 'cad' | 'cad-wnetrze' | 'qet' | 'glif';
  readonly opis: string;
  readonly tekst: string;
  readonly pxEkranu: number;
}

const STANY_CAD = ['closed', 'open', 'unknown'] as const;
const QET_IDS = Object.keys(QET_SYMBOLE_POLA_SN) as QetSymbolPolaSnId[];

function literyRejestruCad(): LiteraSymbolu[] {
  return CAD_SYMBOL_IDS.flatMap((id) =>
    STANY_CAD.flatMap((stan) =>
      literyPrymitywow(prymitywy(id, stan)).map((l) => ({ zrodlo: 'cad' as const, opis: `${id}/${stan}`, tekst: l.t, pxEkranu: l.size * CAD_U_PX })),
    ),
  );
}

function literyWnetrzaCad(): LiteraSymbolu[] {
  const ids = CAD_SYMBOL_IDS.filter((id) => ELECTRICAL_CAD_SYMBOL_REGISTRY[id].functionalClass === 'zabezpieczenie');
  return ids.flatMap((id) =>
    [['51'], ['51', '51N']].flatMap((wnetrze) => {
      const { container } = render(
        <svg>
          <CadSymbol id={id} x={0} y={0} scale={CAD_U_PX} ink="#000000" paper="#ffffff" wnetrze={wnetrze} />
        </svg>,
      );
      const wynik = [...container.querySelectorAll('[data-cad="mark"]')].map((t) => ({
        zrodlo: 'cad-wnetrze' as const,
        opis: `${id}/${wnetrze.join('+')}`,
        tekst: t.textContent ?? '',
        pxEkranu: Number(t.getAttribute('font-size')) * CAD_U_PX,
      }));
      cleanup();
      return wynik;
    }),
  );
}

function literyQet(): LiteraSymbolu[] {
  return QET_IDS.flatMap((id) => {
    const s = QET_SYMBOLE_POLA_SN[id];
    return [...s.przewody, ...s.stale, ...s.osprzet, ...(s.noz?.prymitywy ?? [])].flatMap((p) =>
      literyPrymitywow([p]).map((l) => ({ zrodlo: 'qet' as const, opis: id, tekst: l.t, pxEkranu: l.size })),
    );
  });
}

const WARIANTY_GLIFU: readonly (readonly [string, Partial<GlyphProps>])[] = [
  ['bazowy', {}],
  ...(['closed', 'open', 'unknown', 'earthed', 'bad'] as const satisfies readonly SwitchState[]).map(
    (state) => [`kafel/${state}`, { state, kafleStanu: STATE_COLOR }] as const,
  ),
  ['kody 1', { labelLines: ['51'] }],
  ['kody 2', { labelLines: ['51', '51N'] }],
  ['ostrzeżenie topologii', { hasTopologyWarning: true }],
  ['brak pola TR', { hasFieldGapWarning: true }],
  ['uzwojenia brak', { uzwojenia: { stan: 'brak' } }],
  ['miernik A', { meterQuantity: 'A' }],
];

function literyGlifow(): LiteraSymbolu[] {
  return SYMBOL_IDS.flatMap((id: SymbolId) =>
    WARIANTY_GLIFU.flatMap(([wariant, props]) => {
      const Glif = SYMBOL_GLYPHS[id];
      const { container } = render(
        <svg>
          <Glif x={0} y={0} {...props} />
        </svg>,
      );
      const wynik = [...container.querySelectorAll('text')].map((t) => ({
        zrodlo: 'glif' as const,
        opis: `${id}/${wariant}`,
        tekst: t.textContent ?? '',
        pxEkranu: Number(t.getAttribute('font-size')),
      }));
      cleanup();
      return wynik;
    }),
  );
}

describe('(A) podłoga S9-7 na liście wszystkich liter symboli z rejestrów', () => {
  const LITERY = [...literyRejestruCad(), ...literyWnetrzaCad(), ...literyQet(), ...literyGlifow()];

  it('każda litera symbolu ma na ekranie ≥ 8 px przy wejściu w LOD 2', () => {
    const ponizej = LITERY.filter((l) => !(l.pxEkranu >= MIN_TEXT_SCREEN_PX)).map((l) => `${l.zrodlo} ${l.opis} „${l.tekst}”: ${l.pxEkranu} px`);
    expect(ponizej).toEqual([]);
  });

  it('inwentarz obejmuje litery nazwane w decyzji (G maszyny, „3” przekształtnika i przekładnika Ferrantiego, „M” napędu, kody i znaki glifów)', () => {
    const jest = (zrodlo: LiteraSymbolu['zrodlo'], tekst: string, opis?: RegExp): boolean =>
      LITERY.some((l) => l.zrodlo === zrodlo && l.tekst === tekst && (!opis || opis.test(l.opis)));
    expect(jest('cad', 'G', /^cad\.generator/)).toBe(true);
    expect(jest('cad', '3')).toBe(true);
    expect(jest('cad-wnetrze', '51N')).toBe(true);
    expect(jest('qet', '3', /^qetCoreBalanceCt$/)).toBe(true);
    expect(jest('qet', 'M', /^qetBreakerZNapedem$/)).toBe(true);
    expect(jest('glif', '51N', /^protectionRelay\//)).toBe(true);
    expect(jest('glif', '!', /^protectionRelay\//)).toBe(true);
    expect(jest('glif', '!', /^transformer2W\//)).toBe(true);
    expect(jest('glif', '?', /\/kafel\/unknown$/)).toBe(true);
    expect(jest('glif', 'A', /^meter\//)).toBe(true);
    expect(new Set(LITERY.map((l) => l.zrodlo))).toEqual(new Set(['cad', 'cad-wnetrze', 'qet', 'glif']));
  });

  it('stała pisma liter CAD = podłoga w jednostkach biblioteki', () => {
    expect(CAD_LITERA_MIN_U * CAD_U_PX).toBe(MIN_TEXT_SCREEN_PX);
    expect(PISMO_KODU_W_OKREGU.fontSize).toBeGreaterThanOrEqual(MIN_TEXT_SCREEN_PX);
    expect(PISMO_ZNAKU_OSTRZEZENIA.fontSize).toBeGreaterThanOrEqual(MIN_TEXT_SCREEN_PX);
  });
});

// ---------------------------------------------------------------------------
// (B) Tusz bez nakładania na kreskę.
// ---------------------------------------------------------------------------

describe('(B) tusz litery nie dotyka kreski własnego symbolu', () => {
  it('importer QET mierzy litery odmianą rysowaną przez renderer, a kreska okręgu przekaźnika = kreska aparatu', () => {
    expect(QET_ODMIANA_KROJU_LITER).toBe(odmianaWagi(WAGA_LITERY_SYMBOLU));
    expect(KRESKA_OKREGU_PRZEKAZNIKA).toBe(V3_STROKE_APPARATUS);
  });

  it('rejestr CAD: każda litera każdego symbolu w każdym stanie', () => {
    // Kreska CAD nie skaluje się z symbolem (`non-scaling-stroke`): grubość w `u` = px / CAD_U_PX.
    const bazowa = CAD_SYMBOL_STROKE_PX / CAD_U_PX;
    let litery = 0;
    const kolizje: string[] = [];
    for (const id of CAD_SYMBOL_IDS) {
      for (const stan of STANY_CAD) {
        const prims = prymitywy(id, stan);
        const kreski = kreskiPrymitywow(prims, bazowa, `${id}/${stan}`);
        for (const l of literyPrymitywow(prims)) {
          litery += 1;
          const tusz = tuszTekstu(l.t, l.x, bazaCentralna(l.y, l.size, WAGA_LITERY_SYMBOLU), l.size, WAGA_LITERY_SYMBOLU);
          for (const k of kreski) {
            const odstep = odstepOdKreski(tusz, k);
            if (odstep <= k.polGrubosci) kolizje.push(`${k.opis} „${l.t}”: odstęp ${odstep.toFixed(3)} ≤ ${k.polGrubosci}`);
          }
        }
      }
    }
    expect(litery).toBeGreaterThan(0);
    expect(kolizje).toEqual([]);
  });

  it('symbole QET: każda litera w każdym położeniu noża', () => {
    let litery = 0;
    const kolizje: string[] = [];
    for (const id of QET_IDS) {
      const s = QET_SYMBOLE_POLA_SN[id];
      const katy = s.noz ? Object.values(s.noz.katy) : [0];
      for (const kat of katy) {
        const kreski = [
          ...kreskiPrymitywow(s.przewody, V3_STROKE_APPARATUS, `${id}/przewody`),
          ...kreskiPrymitywow(s.stale, QET_KRESKA_GLIFU, `${id}/stale`),
          ...kreskiPrymitywow(s.osprzet, QET_KRESKA_GLIFU, `${id}/osprzet`),
          ...(s.noz ? kreskiPrymitywow(s.noz.prymitywy, QET_KRESKA_GLIFU, `${id}/noz@${kat}`, { c: [s.noz.cx, s.noz.cy], deg: kat }) : []),
        ];
        for (const l of literyPrymitywow([...s.przewody, ...s.stale, ...s.osprzet])) {
          litery += 1;
          const tusz = tuszTekstu(l.t, l.x, bazaCentralna(l.y, l.size, WAGA_LITERY_SYMBOLU), l.size, WAGA_LITERY_SYMBOLU);
          for (const k of kreski) {
            const odstep = odstepOdKreski(tusz, k);
            if (odstep <= k.polGrubosci) kolizje.push(`${k.opis} „${l.t}”: odstęp ${odstep.toFixed(3)} ≤ ${k.polGrubosci}`);
          }
        }
      }
    }
    expect(litery).toBeGreaterThanOrEqual(2);
    expect(kolizje).toEqual([]);
  });

  it('przekształtnik CAD: cały znak „3~” (tusz „3” i łuki „~”) w górnym lewym trójkącie, prześwit tuszu od kreski przekątnej ≥ 0,5 u (1 px ekranu)', () => {
    let symbole = 0;
    for (const id of CAD_SYMBOL_IDS) {
      const prims = prymitywy(id);
      const trojka = literyPrymitywow(prims).find((l) => l.t === '3');
      if (!trojka) continue;
      symbole += 1;
      // Przekątna kwadratu: odcinek o nachyleniu −1 (od lewego dolnego do prawego górnego rogu).
      const przekatna = prims.find((p): p is Extract<CadPrimitive, { k: 'line' }> => p.k === 'line' && p.x2 - p.x1 === p.y1 - p.y2 && p.x2 > p.x1);
      expect(przekatna, id).toBeDefined();
      const { x1, y1 } = przekatna!;
      // Strona górnego lewego trójkąta: x + y < x1 + y1 (prosta x + y = const).
      const odPrzekatnej = (q: P): number => (x1 + y1 - (q[0] + q[1])) / Math.SQRT2;
      const tusz = tuszTekstu('3', trojka.x, bazaCentralna(trojka.y, trojka.size, WAGA_LITERY_SYMBOLU), trojka.size, WAGA_LITERY_SYMBOLU);
      const polKreski = CAD_SYMBOL_STROKE_PX / CAD_U_PX / 2;
      // Tusz „3” — od krawędzi kreski przekątnej; łuk „~” — od krawędzi do krawędzi (dwie połowy kreski).
      const naroznikiTrojki: P[] = [[tusz.x0, tusz.y0], [tusz.x1, tusz.y0], [tusz.x0, tusz.y1], [tusz.x1, tusz.y1]];
      const lukTyldy = prims.filter((p) => p.k === 'arc').flatMap((p) => probkujSciezke((p as { d: string }).d).flat());
      expect(lukTyldy.length, id).toBeGreaterThan(0);
      for (const q of naroznikiTrojki) expect(odPrzekatnej(q) - polKreski, `${id}: „3” (${q[0].toFixed(2)}; ${q[1].toFixed(2)})`).toBeGreaterThanOrEqual(0.5);
      for (const q of lukTyldy) expect(odPrzekatnej(q) - 2 * polKreski, `${id}: „~” (${q[0].toFixed(2)}; ${q[1].toFixed(2)})`).toBeGreaterThanOrEqual(0.5);
    }
    expect(symbole).toBe(3);
  });

  it('znaki wnętrza zabezpieczenia CAD (notacja IEC funkcji nN): każda funkcja sama, każda para i lista > 2 („+N”)', () => {
    const kody = Object.keys(FUNKCJA_ZABEZPIECZENIA);
    const listy = [...kody.map((k) => [k]), ...kody.flatMap((a) => kody.filter((b) => b !== a).map((b) => [a, b])), kody];
    const bazowa = CAD_SYMBOL_STROKE_PX / CAD_U_PX;
    const ids = CAD_SYMBOL_IDS.filter((id) => ELECTRICAL_CAD_SYMBOL_REGISTRY[id].functionalClass === 'zabezpieczenie');
    expect(ids.length).toBeGreaterThan(0);
    const kolizje: string[] = [];
    let znaki = 0;
    for (const id of ids) {
      const kreski = kreskiPrymitywow(prymitywy(id), bazowa, id);
      for (const lista of listy) {
        const { container } = render(
          <svg>
            <CadSymbol id={id} x={0} y={0} scale={CAD_U_PX} ink="#000000" paper="#ffffff" wnetrze={znakiIec(lista)} />
          </svg>,
        );
        const teksty = [...container.querySelectorAll('[data-cad="mark"]')];
        const tusze = teksty.map((t) => {
          const rozmiar = Number(t.getAttribute('font-size'));
          const waga = Number(t.getAttribute('font-weight'));
          const y = Number(t.getAttribute('y'));
          return tuszTekstu(t.textContent ?? '', Number(t.getAttribute('x')), bazaCentralna(y, rozmiar, waga), rozmiar, waga);
        });
        tusze.forEach((tusz, i) => {
          znaki += 1;
          for (const k of kreski) {
            const odstep = odstepOdKreski(tusz, k);
            if (odstep <= k.polGrubosci) kolizje.push(`${id} ${lista.join('+')} „${teksty[i].textContent}”: odstęp ${odstep.toFixed(3)}`);
          }
        });
        if (tusze.length === 2 && !(tusze[0].y1 < tusze[1].y0)) kolizje.push(`${id} ${lista.join('+')}: wiersze nachodzą`);
        cleanup();
      }
    }
    expect(znaki).toBeGreaterThan(listy.length);
    expect(kolizje).toEqual([]);
  });

  it('znaki „!” glifów mieszczą się w swoich kółkach (wewnętrzna krawędź kreski)', () => {
    for (const [id, props] of [
      ['transformer2W', { hasFieldGapWarning: true }],
      ['protectionRelay', { hasTopologyWarning: true }],
    ] as const) {
      const Glif = SYMBOL_GLYPHS[id];
      const { container } = render(
        <svg>
          <Glif x={0} y={0} {...props} />
        </svg>,
      );
      const grupa = container.querySelector('[data-field-gap-warning], [data-topology-warning]')!;
      const kolo = grupa.querySelector('circle')!;
      const tekst = grupa.querySelector('text')!;
      const c: P = [Number(kolo.getAttribute('cx')), Number(kolo.getAttribute('cy'))];
      const r = Number(kolo.getAttribute('r'));
      expect(r).toBe(PROMIEN_ZNAKU_OSTRZEZENIA);
      const pol = Number(kolo.getAttribute('stroke-width')) / 2;
      const tusz = tuszTekstu('!', Number(tekst.getAttribute('x')), Number(tekst.getAttribute('y')), Number(tekst.getAttribute('font-size')), Number(tekst.getAttribute('font-weight')));
      for (const n of [[tusz.x0, tusz.y0], [tusz.x1, tusz.y0], [tusz.x0, tusz.y1], [tusz.x1, tusz.y1]] as const) {
        expect(Math.hypot(n[0] - c[0], n[1] - c[1]), `${id}: narożnik tuszu „!”`).toBeLessThan(r - pol);
      }
      cleanup();
    }
  });
});

describe('(B) okrąg przekaźnika: kody słownika funkcji EAZ pismem 8 px', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const zrodlo = readFileSync(resolve(here, '../../../../../../../backend/src/network_model/catalog/funkcje_eaz.py'), 'utf8');
  // Wpis może mieć komentarz między nawiasem a kodem — pomijany.
  const KODY = [...zrodlo.matchAll(/FunkcjaEaz\(\s*(?:#[^\n]*\n\s*)*"([^"]+)"/g)].map((m) => m[1]);
  const R_WEWN = OKRAG_PRZEKAZNIKA.r - KRESKA_OKREGU_PRZEKAZNIKA / 2;

  // 34 kody: jedna nomenklatura, każda funkcja raz (decyzja architekta 2026-10-30 — SCO
  // z ponownym załączeniem po SCO jednym wpisem, numery IEEE C37.2 zamiast nazw własnych).
  it('słownik czytany ze źródła backendu (34 kody, bez powtórzeń)', () => {
    expect(KODY).toHaveLength(34);
    expect(new Set(KODY).size).toBe(KODY.length);
  });

  it('iloczyn: każdy kod sam i każda uporządkowana para — tusz w okręgu, wiersze rozłączne, okrąg ∪ reszta = lista', () => {
    let przypadki = 0;
    let wOkregu = 0;
    const listy = [...KODY.map((k) => [k]), ...KODY.flatMap((a) => KODY.filter((b) => b !== a).map((b) => [a, b]))];
    for (const lista of listy) {
      const uklad = ukladKodowWOkregu(lista);
      expect([...uklad.kody, ...kodyPozaOkregiemPrzekaznika(lista)], lista.join('+')).toEqual(lista);
      expect(uklad.kody, lista.join('+')).toEqual(lista.slice(0, uklad.kody.length));
      expect(uklad.linieBazowe).toHaveLength(uklad.kody.length);
      const tusze = uklad.kody.map((kod, i) =>
        tuszTekstu(kod, OKRAG_PRZEKAZNIKA.cx, uklad.linieBazowe[i], PISMO_KODU_W_OKREGU.fontSize, PISMO_KODU_W_OKREGU.fontWeight),
      );
      for (const [i, t] of tusze.entries()) {
        for (const n of [[t.x0, t.y0], [t.x1, t.y0], [t.x0, t.y1], [t.x1, t.y1]] as const) {
          expect(Math.hypot(n[0] - OKRAG_PRZEKAZNIKA.cx, n[1] - OKRAG_PRZEKAZNIKA.cy), `${lista.join('+')}: „${uklad.kody[i]}”`).toBeLessThan(R_WEWN);
        }
      }
      if (tusze.length === 2) expect(tusze[0].y1, lista.join('+')).toBeLessThan(tusze[1].y0);
      wOkregu += uklad.kody.length;
      przypadki += 1;
    }
    expect(przypadki).toBe(34 + 34 * 33);
    expect(wOkregu).toBeGreaterThan(0);
  });

  it('kody, które pismem 8 px nie mieszczą się w okręgu same — jawna lista (idą do wierszy bloku)', () => {
    const zaSzerokie = KODY.filter((k) => ukladKodowWOkregu([k]).kody.length === 0);
    expect(zaSzerokie).toMatchInlineSnapshot(`
      [
        "50BF",
        "SPZE",
        "OWG",
        "ZAWSC",
      ]
    `);
  });

  it('para kodów pola liniowego ENEA (51, 50) i (51N, 67N) mieści się w dwóch wierszach', () => {
    expect(ukladKodowWOkregu(['51', '50', '51N']).kody).toEqual(['51', '50']);
    expect(ukladKodowWOkregu(['51N', '67N']).kody).toEqual(['51N', '67N']);
  });
});
