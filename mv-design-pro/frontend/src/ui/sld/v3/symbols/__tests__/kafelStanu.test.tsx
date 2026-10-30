/**
 * Rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC — kafel stanu łącznika wg referencji HMI
 * właściciela (2026-10-29, sterownik polowy e²TANGO): stan kodują RAZEM wypełniony kafel pod
 * symbolem (czerwony = zamknięty, zielony = otwarty), geometria styku i biały symbol na kaflu.
 * Zastępuje dawny test ramki SCADA (`qetRamkaScada.test.tsx`): INTENCJA tamtego testu
 * (kolor stanu z jednej tabeli, obejmuje cały rysunek, stan nieznany nie udaje stanu, tylko
 * łączniki pola dostają oznaczenie stanu) zostaje; zmienia się nośnik (kafel zamiast obrysu)
 * i stan nieznany ma WŁASNY kafel „?" (brak sygnału nie może być słabszy niż stan).
 *
 * Iloczyn cech: rodzaj aparatu {wyłącznik, rozłącznik, odłącznik, uziemnik, bezpiecznik
 * z rozłącznikiem, łącznik trójpołożeniowy} × wariant rysunku {kanoniczny, QET} × stan
 * {zamknięty, otwarty, uziemiony, nieustalony, awaria, brak stanu} × motyw {ciemny, jasny,
 * eksport}; osobno NOP {zadeklarowany ze stanem łącznika, bez stanu} i aparaty bez położenia.
 * Asercje: kolor kafla z JEDNEJ tabeli (`STATE_COLOR`), geometria styku zgodna ze stanem,
 * znak stanu („?", „!"), podpowiedź położenia z jednej mapy (`OPIS_POLOZENIA_PL`), kafel
 * obejmuje cały rysunek.
 *
 * Wymaganie właściciela 2026-10-29 (korekta P0): kafel łącznika rysowanego symbolem QET jest
 * KWADRATEM o boku z JEDNEJ stałej (`QET_BOK_KAFLA_STANU`, 48 px w skali LOD2) — identycznym
 * dla każdego rodzaju i każdego stanu; nie wynika z obrysu rysunku. Kafel symbolu
 * kanonicznego (pola stacji SN/nN) pozostaje obrysem rysunku z marginesem — inna konwencja
 * rysunku (dowód w tabeli meldunku karty). Wariant z napędem silnikowym (`naped`) wchodzi do
 * iloczynu przez `symboleRodzajuAparatu`.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { QET_BOK_KAFLA_STANU, QET_KRESKA_GLIFU, QET_SYMBOLE_POLA_SN, type QetSymbolPolaSnId } from '../../cad/qet/qetPoleSn';
import {
  SYMBOL_DEFS,
  SYMBOLE_LACZNIKOW_Z_POLOZENIEM,
  czySymbolQet,
  czyLacznikZPolozeniem,
  obrysSymbolu,
  type SymbolId,
} from '../defs';
import {
  KAFEL_STANU_MARGINES,
  OPIS_POLOZENIA_PL,
  SYMBOL_GLYPHS,
  V3_STROKE_APPARATUS,
  prostokatKaflaStanu,
  stanKaflaLacznika,
  type SwitchState,
} from '../glyphs';
import { DARK_SCADA_SLD_PALETTE, STATE_COLOR, type StanKafla } from '../../theme/colorTokens';
import { LIGHT_TECHNICAL_SLD_PALETTE } from '../../theme/palette';
import { LIGHT_TECHNICAL_V3 } from '../../export/exportPalette';
import { symbolIdForPrimaryDeviceKind, symboleRodzajuAparatu } from '../../compose/apparatusSequence';
import { RODZAJE_LACZNIKOW_POLA } from '../../compose/rodzajeAparatuPola';
import type { BayPrimaryDeviceKind } from '../../../../../types/enm';
import { MIN_TEXT_SCREEN_PX } from '../../core/text';
import { DEFAULT_LOD_THRESHOLDS, LOD_HYSTERESIS_MARGIN } from '../../canvas/camera';
import type { CadPrimitive } from '../../cad/cadSymbolRegistry';

const MOTYWY = [
  ['ciemny', DARK_SCADA_SLD_PALETTE.state],
  ['jasny', LIGHT_TECHNICAL_SLD_PALETTE.state],
  ['eksport', LIGHT_TECHNICAL_V3.state],
] as const;

const STANY: readonly (SwitchState | undefined)[] = ['closed', 'open', 'earthed', 'unknown', 'bad', undefined];

/** Rysunki łącznika trójpołożeniowego — bez i ze znakiem napędu z modelu (decyzja architekta
 *  2026-10-30: napęd jest atrybutem łącznika). Lista jawna (wyrocznia niezależna od
 *  `rodzajSymbolu`). */
const TROJPOLOZENIOWE: ReadonlySet<SymbolId> = new Set<SymbolId>(['qetThreePositionSwitch', 'qetThreePositionSwitchZNapedem']);

/** Wyrocznia NIEZALEŻNA od `stanKaflaLacznika`: tabela kontraktu z karty. */
function oczekiwanyKafel(id: SymbolId, state: SwitchState | undefined): StanKafla | null {
  if (id === 'noPoint' && state === undefined) return null; // NOP bez łącznika — sam znacznik
  if (state === 'closed') return 'zamkniety';
  if (state === 'open') return 'otwarty';
  if (state === 'bad') return 'bledny';
  // Uziemiony: tylko łącznik trójpołożeniowy (dwa XSWI wg IEC 61850-7-4 — zestyk uziemiający
  // zamknięty, tor główny OTWARTY). Kolor kafla mówi o torze głównym (uwaga właściciela
  // 2026-10-30), nóż na zestyku uziemiającym mówi, że pole jest uziemione; na każdym innym
  // symbolu „uziemiony" to stan bez znaczenia → nieustalony.
  if (state === 'earthed') return TROJPOLOZENIOWE.has(id) ? 'otwarty' : 'nieustalony';
  return 'nieustalony';
}

/** Oczekiwane położenie geometrii styku (wyrocznia z karty). */
function oczekiwanaGeometria(id: SymbolId, state: SwitchState | undefined): string {
  if (state === 'closed' || state === 'open') return state;
  if (state === 'earthed' && TROJPOLOZENIOWE.has(id)) return 'earthed';
  return 'unknown';
}

function rysuj(id: SymbolId, state: SwitchState | undefined, kafle = DARK_SCADA_SLD_PALETTE.state): Document {
  const Glyph = SYMBOL_GLYPHS[id];
  const markup = renderToStaticMarkup(
    <svg>
      <Glyph x={0} y={0} stroke="#123456" state={state} kafleStanu={kafle} />
    </svg>,
  );
  return new DOMParser().parseFromString(markup, 'image/svg+xml');
}

const RODZAJE_SYMBOLE: ReadonlyArray<readonly [BayPrimaryDeviceKind, string, SymbolId]> = [...RODZAJE_LACZNIKOW_POLA].flatMap(
  (kind) =>
    symboleRodzajuAparatu(kind).map((id) => [kind, czySymbolQet(id) ? 'QET' : 'kanoniczny', id] as const),
);

/** Wyrocznia prostokąta kafla NIEZALEŻNA od `prostokatKaflaStanu`: QET — kwadrat z jednej
 *  stałej w gabarycie; kanoniczny — obrys rysunku z marginesem. */
function oczekiwanyProstokat(id: SymbolId): { x: number; y: number; width: number; height: number } {
  if (czySymbolQet(id)) return { x: 0, y: 0, width: QET_BOK_KAFLA_STANU, height: QET_BOK_KAFLA_STANU };
  const o = obrysSymbolu(id);
  return {
    x: o.x - KAFEL_STANU_MARGINES,
    y: o.y - KAFEL_STANU_MARGINES,
    width: o.width + 2 * KAFEL_STANU_MARGINES,
    height: o.height + 2 * KAFEL_STANU_MARGINES,
  };
}

describe('kafel stanu — parytet: każdy łącznik pola rysuje położenie', () => {
  it('symbol każdego rodzaju łącznika pola (oba warianty) należy do SYMBOLE_LACZNIKOW_Z_POLOZENIEM', () => {
    expect(RODZAJE_SYMBOLE.length).toBeGreaterThanOrEqual(2 * 5);
    // Warianty z napędem (wyłącznik — silnikowy, łącznik trójpołożeniowy — zasobnikowy z obsługą
    // ręczną) są w iloczynie (nie tylko symbole podstawowe).
    expect(RODZAJE_SYMBOLE.map(([, , id]) => id)).toEqual(
      expect.arrayContaining(['qetBreakerZNapedem', 'qetThreePositionSwitchZNapedem']),
    );
    expect(symbolIdForPrimaryDeviceKind('CB', null)).toBe('breaker');
    for (const [kind, wariant, id] of RODZAJE_SYMBOLE) {
      expect(czyLacznikZPolozeniem(id), `${kind} (${wariant}) → ${id}`).toBe(true);
    }
  });

  it('aparat bez położenia (przekładniki, głowica, wskaźnik, bezpiecznik sam) nie dostaje kafla', () => {
    const bez: readonly SymbolId[] = [
      'currentTransformer',
      'voltageTransformer',
      'cableHead',
      'fuse',
      'qetCurrentTransformer',
      'qetVoltageTransformer',
      'qetCableHead',
      'qetCoreBalanceCt',
      'qetVoltageIndicator',
    ];
    for (const id of bez) {
      expect(czyLacznikZPolozeniem(id), id).toBe(false);
      for (const state of STANY) {
        expect(rysuj(id, state).querySelectorAll('[data-kafel-stanu]'), `${id} · ${state}`).toHaveLength(0);
      }
    }
  });
});

describe('kafel stanu — iloczyn rodzaj × wariant × stan × motyw', () => {
  for (const [motyw, kafle] of MOTYWY) {
    for (const [kind, wariant, id] of RODZAJE_SYMBOLE) {
      for (const state of STANY) {
        it(`${motyw} · ${kind} (${wariant}, ${id}) · ${state ?? 'brak stanu'}`, () => {
          const doc = rysuj(id, state, kafle);
          const grupy = doc.querySelectorAll('[data-kafel-stanu]');
          const oczekiwany = oczekiwanyKafel(id, state);
          expect(stanKaflaLacznika(id, state)).toBe(oczekiwany);
          // Stan nieznany ma WŁASNY kafel — nigdy „brak kafla" (iniekcja: kafel tylko dla
          // zamkniętego/otwartego → czerwony test dla nieustalonego i braku stanu).
          expect(grupy).toHaveLength(1);
          const grupa = grupy[0];
          expect(grupa.getAttribute('data-kafel-stanu')).toBe(oczekiwany);
          const tlo = grupa.querySelector('[data-kafel="tlo"]')!;
          // Kolor kafla z JEDNEJ tabeli — identyczny w każdym motywie i w eksporcie.
          expect(tlo.getAttribute('fill')).toBe(STATE_COLOR[oczekiwany!]);
          expect(tlo.getAttribute('fill')).toBe(kafle[oczekiwany!]);
          // Kafel: QET — kwadrat z jednej stałej; kanoniczny — obrys + margines. W obu
          // konwencjach obejmuje cały rysunek (wszystkie położenia noża).
          const r = oczekiwanyProstokat(id);
          const tx = Number(tlo.getAttribute('x'));
          const ty = Number(tlo.getAttribute('y'));
          const tw = Number(tlo.getAttribute('width'));
          const th = Number(tlo.getAttribute('height'));
          expect(tx).toBeCloseTo(r.x, 6);
          expect(ty).toBeCloseTo(r.y, 6);
          expect(tw).toBeCloseTo(r.width, 6);
          expect(th).toBeCloseTo(r.height, 6);
          const o = obrysSymbolu(id);
          expect(o.x).toBeGreaterThanOrEqual(tx);
          expect(o.y).toBeGreaterThanOrEqual(ty);
          expect(o.x + o.width).toBeLessThanOrEqual(tx + tw);
          expect(o.y + o.height).toBeLessThanOrEqual(ty + th);
          // Symbol na kaflu w kolorze glifu kafla (kontrast z kaflem, nie z tłem kanwy).
          const glif = grupa.querySelector(`[data-symbol-canon="${id}"]`)!;
          expect(glif).not.toBeNull();
          const kreski = [...glif.querySelectorAll('[stroke]')].map((n) => n.getAttribute('stroke'));
          expect(kreski.length).toBeGreaterThan(0);
          for (const k of kreski) expect(['none', kafle.glif]).toContain(k);
          expect(glif.innerHTML).not.toContain('#123456');
          // Znak stanu: „?" nieustalony, „!" awaria; zamknięty/otwarty bez znaku.
          const znak = grupa.querySelector('[data-kafel="znak"]');
          const oczekiwanyZnak = oczekiwany === 'nieustalony' ? '?' : oczekiwany === 'bledny' ? '!' : null;
          expect(znak?.textContent ?? null).toBe(oczekiwanyZnak);
          // Podpowiedź położenia z jednej mapy (ta sama co inspektor i legenda).
          expect(grupa.querySelector('title')?.textContent).toBe(OPIS_POLOZENIA_PL[state ?? 'unknown']);
          // Geometria styku zgodna ze stanem.
          const qet = glif.getAttribute('data-qet-polozenie');
          if (QET_SYMBOLE_POLA_SN[id as keyof typeof QET_SYMBOLE_POLA_SN]) {
            expect(qet).toBe(oczekiwanaGeometria(id, state));
          } else {
            expect(glif.getAttribute('data-switch-state') ?? undefined).toBe(state);
          }
        });
      }
    }
  }
});

describe('kafel stanu — NOP (punkt normalnie otwarty) × stan łącznika', () => {
  for (const state of STANY) {
    it(`NOP · ${state ?? 'bez łącznika'}`, () => {
      const doc = rysuj('noPoint', state);
      const grupy = doc.querySelectorAll('[data-kafel-stanu]');
      const glif = doc.querySelector('[data-symbol-canon="noPoint"]')!;
      // Znacznik funkcji NOP (okrąg) jest zawsze — NOP nie ma własnego koloru stanu.
      expect(glif.querySelector('circle')).not.toBeNull();
      if (state === undefined) {
        expect(grupy).toHaveLength(0);
        return;
      }
      expect(grupy).toHaveLength(1);
      expect(grupy[0].getAttribute('data-kafel-stanu')).toBe(oczekiwanyKafel('noPoint', state));
      expect(glif.getAttribute('data-nop-polozenie')).toBe(oczekiwanaGeometria('noPoint', state));
    });
  }
});

describe('kafel stanu — geometria i sąsiedztwo', () => {
  it('kafel każdego łącznika mieści się w marginesie wokół gabarytu (sąsiedzi stosu nie kolidują)', () => {
    for (const id of SYMBOLE_LACZNIKOW_Z_POLOZENIEM) {
      const r = prostokatKaflaStanu(id);
      const d = SYMBOL_DEFS[id];
      expect(r.x, id).toBeGreaterThanOrEqual(-KAFEL_STANU_MARGINES);
      expect(r.y, id).toBeGreaterThanOrEqual(-KAFEL_STANU_MARGINES);
      expect(r.x + r.width, id).toBeLessThanOrEqual(d.width + KAFEL_STANU_MARGINES);
      expect(r.y + r.height, id).toBeLessThanOrEqual(d.height + KAFEL_STANU_MARGINES);
    }
  });

  for (const id of ['qetThreePositionSwitch', 'qetThreePositionSwitchZNapedem'] as const) {
    it(`${id}: trzy różne położenia noża; „uziemiony" = nóż na zestyku uziemiającym, kafel otwarty (tor główny otwarty)`, () => {
      const katy = QET_SYMBOLE_POLA_SN[id].noz!.katy;
      expect(new Set([katy.closed, katy.open, katy.earthed]).size).toBe(3);
      const doc = rysuj(id, 'earthed');
      expect(doc.querySelector('[data-qet-polozenie]')!.getAttribute('data-qet-polozenie')).toBe('earthed');
      expect(doc.querySelector('[data-qet="noz"]')!.getAttribute('data-qet-kat')).toBe(String(katy.earthed));
      expect(doc.querySelector('[data-kafel-stanu]')!.getAttribute('data-kafel-stanu')).toBe('otwarty');
    });
  }

  for (const [bez, z] of [
    ['qetThreePositionSwitch', 'qetThreePositionSwitchZNapedem'],
    ['qetBreaker', 'qetBreakerZNapedem'],
  ] as const) {
    it(`${z} = ${bez} + napęd (atrybut): nóż, położenia, znaczniki, ziemia, przewody i porty bez zmian`, () => {
      // Decyzja właściciela 2026-10-30: „Napęd M zostaje jako atrybut" — układ kafla (zawias,
      // styk stały, znacznik, ziemia) wynika z rodzaju łącznika, nie z napędu.
      const a = QET_SYMBOLE_POLA_SN[bez];
      const b = QET_SYMBOLE_POLA_SN[z];
      expect(b.noz).toEqual(a.noz);
      expect(b.znaczniki).toEqual(a.znaczniki);
      expect(b.ziemia).toEqual(a.ziemia);
      expect(b.przewody).toEqual(a.przewody);
      expect(b.stale).toEqual(a.stale);
      expect(b.porty).toEqual(a.porty);
      expect(a.osprzet).toEqual([]);
      expect(b.osprzet.length).toBeGreaterThan(0);
    });
  }

  it('bez tabeli kafli (miniatury, harness mono) symbol rysuje się bez kafla', () => {
    const Glyph = SYMBOL_GLYPHS.qetBreaker;
    const markup = renderToStaticMarkup(
      <svg>
        <Glyph x={0} y={0} stroke="#000" state="closed" />
      </svg>,
    );
    expect(markup).not.toContain('data-kafel-stanu');
    expect(markup).toContain('data-symbol-canon="qetBreaker"');
  });
});

/** Punkty noża w KAŻDYM położeniu (zasięg położenia, obrót SVG wokół przegubu) — wyrocznia
 *  niezależna od renderu; przegub pominięty (sprzężenie napędu zaczyna się w przegubie). */
function punktyNoza(s: (typeof QET_SYMBOLE_POLA_SN)[QetSymbolPolaSnId]): Record<string, Array<readonly [number, number]>> {
  const noz = s.noz!;
  const wynik: Record<string, Array<readonly [number, number]>> = {};
  for (const [polozenie, kat] of Object.entries(noz.katy)) {
    const r = ((kat ?? 0) * Math.PI) / 180;
    const zasieg = noz.zasiegi[polozenie as keyof typeof noz.zasiegi] ?? 1;
    const punkty: Array<readonly [number, number]> = [];
    for (const n of noz.prymitywy) {
      if (n.k !== 'line') throw new Error('nóż QET wyłącznie z linii');
      for (let i = 0; i <= 40; i += 1) {
        const px = (n.x1 + ((n.x2 - n.x1) * i) / 40 - noz.cx) * zasieg;
        const py = (n.y1 + ((n.y2 - n.y1) * i) / 40 - noz.cy) * zasieg;
        if (Math.hypot(px, py) < QET_KRESKA_GLIFU) continue;
        punkty.push([noz.cx + px * Math.cos(r) - py * Math.sin(r), noz.cy + px * Math.sin(r) + py * Math.cos(r)]);
      }
    }
    wynik[polozenie] = punkty;
  }
  return wynik;
}

/**
 * Litera na kaflu łącznika (kwalifikator „M" napędu silnikowego, EN 60617 02-13-26) jest częścią
 * symbolu, ale musi być CZYTELNA tam, gdzie kafel jest rysowany: w całym zakresie skali kamery
 * aktywnego LOD2 (od dolnego brzegu histerezy `l1Max·(1 − margines)` = 1,02) litera ma na
 * ekranie co najmniej `MIN_TEXT_SCREEN_PX`. Pomiar przed naprawą (karta UX-04, oględziny zrzutów
 * 2026-10-29): litera w skali źródła QET miała 2,4 jednostki świata — 2,4 px przy wejściu w LOD2
 * i 3,6–6,6 px na zrzutach pola. Iloczyn: łącznik QET z kaflem × litera symbolu × skala LOD2
 * {dolny brzeg, brzeg górnej strefy, wnętrze} × stan × motyw (litera rysowana w każdym stanie).
 * Iniekcja: dawna skala znaku napędu (1, rozmiar 2,4) — czerwone komórki skali.
 */
describe('kafel stanu — litera na kaflu czytelna w całym zakresie LOD2', () => {
  const SKALA_MIN_L2 = DEFAULT_LOD_THRESHOLDS.l1Max * (1 - LOD_HYSTERESIS_MARGIN);
  const SKALE_L2 = [SKALA_MIN_L2, DEFAULT_LOD_THRESHOLDS.l1Max * (1 + LOD_HYSTERESIS_MARGIN), 2];
  const litery = (prims: readonly CadPrimitive[]) =>
    prims.filter((p): p is Extract<CadPrimitive, { k: 'letter' }> => p.k === 'letter');
  const LITERY_NA_KAFLACH = Object.values(QET_SYMBOLE_POLA_SN)
    .filter((s) => s.kafel)
    .flatMap((s) =>
      [...litery(s.stale), ...litery(s.osprzet), ...litery(s.noz?.prymitywy ?? [])].map((l) => [s.id, l] as const),
    );

  it('warunek wstępny: litera „M" napędu silnikowego jest na kaflu wyłącznika z napędem', () => {
    expect(LITERY_NA_KAFLACH.map(([id, l]) => `${id}:${l.t}`)).toContain('qetBreakerZNapedem:M');
  });

  for (const [id, litera] of LITERY_NA_KAFLACH) {
    for (const skala of SKALE_L2) {
      it(`${id} · „${litera.t}" · skala ${skala.toFixed(2)}: ≥ ${MIN_TEXT_SCREEN_PX} px ekranu`, () => {
        expect(litera.size * skala).toBeGreaterThanOrEqual(MIN_TEXT_SCREEN_PX);
      });
    }
  }

  it('napęd (osprzęt kafla): okrąg z literą w kaflu z marginesem, litera w okręgu, linia sprzężenia dochodzi do okręgu', () => {
    const s = QET_SYMBOLE_POLA_SN.qetBreakerZNapedem;
    const okregi = s.osprzet.filter((p): p is Extract<CadPrimitive, { k: 'circle' }> => p.k === 'circle');
    expect(okregi).toHaveLength(1);
    const [o] = okregi;
    const [m] = litery(s.osprzet);
    // Napęd po LEWEJ stronie osi: prawą stronę zajmuje nóż otwarty (ukośny w prawo), a prawa
    // krawędź kafla przyjmuje linię wyłączania (port `wylacz`).
    expect(o.cx - o.r).toBeGreaterThan(0);
    expect(o.cx).toBeLessThan(s.noz!.cx);
    expect(o.cy - o.r).toBeGreaterThan(0);
    expect(o.cy + o.r).toBeLessThan(QET_BOK_KAFLA_STANU);
    expect(Math.hypot(m.x - o.cx, m.y - o.cy)).toBeLessThan(o.r / 4);
    // Połowa wysokości litery mieści się w okręgu (litera nie wychodzi na kafel).
    expect(Math.hypot(m.x - o.cx, m.y - o.cy) + m.size / 2).toBeLessThan(o.r);
    const sprzezenie = s.osprzet.filter((p): p is Extract<CadPrimitive, { k: 'line' }> => p.k === 'line' && Boolean(p.kreskowana));
    expect(sprzezenie).toHaveLength(1);
    const [l] = sprzezenie;
    const noz = s.noz!;
    // Linia sprzężenia mechanicznego zaczepiona w przegubie noża i kończy się na okręgu napędu.
    expect([Math.max(l.x1, l.x2), l.y1, l.y2]).toEqual([noz.cx, noz.cy, noz.cy]);
    expect(Math.min(l.x1, l.x2)).toBeCloseTo(o.cx + o.r, 6);
    // Nóż w żadnym położeniu nie wchodzi na okrąg napędu (tusz z marginesem kreski).
    for (const [polozenie, punkty] of Object.entries(punktyNoza(s))) {
      for (const [x, y] of punkty) {
        expect(Math.hypot(x - o.cx, y - o.cy), `${polozenie}: punkt noża (${x.toFixed(2)}, ${y.toFixed(2)})`).toBeGreaterThan(
          o.r + QET_KRESKA_GLIFU,
        );
      }
    }
  });

  it('napęd zasobnikowy łącznika trójpołożeniowego (osprzęt kafla): kwadrat po lewej osi na sprzężeniu do przegubu, znak obsługi ręcznej pod kwadratem, całość w kaflu z marginesem, nóż w żadnym położeniu nie wchodzi na kwadrat', () => {
    // Układ kafla wg wzorca HMI e²TANGO (decyzja właściciela 2026-10-30): prawą stronę osi
    // zajmuje nóż (otwarty — ukośny w prawo, uziemiony — poziomo na zestyk uziemiający z ziemią
    // w dół), więc napęd zasobnikowy stoi po LEWEJ, na wysokości przegubu.
    const s = QET_SYMBOLE_POLA_SN.qetThreePositionSwitchZNapedem;
    const noz = s.noz!;
    const margines = QET_KRESKA_GLIFU; // margines kafla 5 jednostek QET × 0,4 = kreska glifu
    const sciezki = s.osprzet.filter((p): p is Extract<CadPrimitive, { k: 'path' }> => p.k === 'path');
    expect(sciezki).toHaveLength(1);
    const liczby = (sciezki[0].d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const xs = liczby.filter((_, i) => i % 2 === 0);
    const ys = liczby.filter((_, i) => i % 2 === 1);
    const kw = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    // Kwadrat (EN 60617 02-13-20): bok ≥ podłoga 8 px przy wejściu w LOD2, po lewej osi,
    // w kaflu z marginesem, środek na wysokości przegubu.
    expect(kw.x1 - kw.x0).toBeCloseTo(kw.y1 - kw.y0, 6);
    expect((kw.x1 - kw.x0) * SKALA_MIN_L2).toBeGreaterThanOrEqual(MIN_TEXT_SCREEN_PX);
    expect(kw.x1).toBeLessThan(noz.cx);
    expect(kw.x0).toBeGreaterThanOrEqual(margines);
    expect((kw.y0 + kw.y1) / 2).toBeCloseTo(noz.cy, 6);
    const linie = s.osprzet.filter((p): p is Extract<CadPrimitive, { k: 'line' }> => p.k === 'line');
    const kreskowane = linie.filter((l) => l.kreskowana);
    expect(kreskowane).toHaveLength(2);
    // Sprzężenie mechaniczne: poziomo od prawego boku kwadratu do przegubu noża.
    const sprzezenie = kreskowane.find((l) => l.y1 === l.y2)!;
    expect([sprzezenie.y1, Math.min(sprzezenie.x1, sprzezenie.x2), Math.max(sprzezenie.x1, sprzezenie.x2)]).toEqual([
      noz.cy,
      kw.x1,
      noz.cx,
    ]);
    // Obsługa ręczna (EN 60617 02-13-01): kreskowany pion ze środka dolnego boku kwadratu
    // zakończony poprzeczką, w kaflu z marginesem.
    const pion = kreskowane.find((l) => l.x1 === l.x2)!;
    expect(pion.x1).toBeCloseTo((kw.x0 + kw.x1) / 2, 6);
    expect(Math.min(pion.y1, pion.y2)).toBeCloseTo(kw.y1, 6);
    const dol = Math.max(pion.y1, pion.y2);
    const poprzeczki = linie.filter((l) => !l.kreskowana);
    expect(poprzeczki).toHaveLength(1);
    const [poprzeczka] = poprzeczki;
    expect([poprzeczka.y1, poprzeczka.y2]).toEqual([dol, dol]);
    expect((poprzeczka.x1 + poprzeczka.x2) / 2).toBeCloseTo(pion.x1, 6);
    expect(dol).toBeLessThanOrEqual(QET_BOK_KAFLA_STANU - margines);
    // Nóż w każdym położeniu (zasięg, obrót wokół przegubu) nie wchodzi na kwadrat.
    for (const [polozenie, punkty] of Object.entries(punktyNoza(s))) {
      for (const [x, y] of punkty) {
        const wKwadracie = x >= kw.x0 - margines && x <= kw.x1 + margines && y >= kw.y0 - margines && y <= kw.y1 + margines;
        expect(wKwadracie, `${polozenie}: punkt noża (${x.toFixed(2)}, ${y.toFixed(2)})`).toBe(false);
      }
    }
  });

  for (const [motyw, kafle] of MOTYWY) {
    for (const state of STANY) {
      it(`${motyw} · napęd M · ${state ?? 'brak stanu'}: litera rysowana na kaflu`, () => {
        const doc = rysuj('qetBreakerZNapedem', state, kafle);
        const m = [...doc.querySelectorAll('[data-kafel-stanu] text[data-cad="letter"]')].filter((t) => t.textContent === 'M');
        expect(m).toHaveLength(1);
        expect(Number(m[0].getAttribute('font-size')) * SKALA_MIN_L2).toBeGreaterThanOrEqual(MIN_TEXT_SCREEN_PX);
      });
    }
  }
});

/**
 * Uwaga właściciela 2026-10-29 pkt 1 (glify miniaturowe): glif aparatu na kaflu zajmuje 55–70 %
 * boku kafla w KAŻDYM położeniu noża, kreska glifu jest proporcjonalna do kafla (bok/24), a
 * przewody toru mają kreskę przewodu. W układzie kafla (decyzja właściciela 2026-10-30) glif =
 * nóż + znaczniki rodzaju aparatu przy stykach stałych; ziemia i napęd są poza miarą stopnia.
 * Wyrocznia NIEZALEŻNA od pola `glif` importera: obwiednia liczona tu z prymitywów (znaczniki
 * + nóż w zasięgu położenia, obrócony o kąt położenia wokół przegubu). Iloczyn:
 * łącznik QET z kaflem × stan (położenie noża) × motyw (rysunek z kaflem). Pomiar przed
 * naprawą: wyłącznik 0,20, odłącznik 0,19–0,20, uziemnik 0,23 boku kafla (rysunek w skali
 * źródła), kreska glifu 1,2 = bok/40. Iniekcja w e2e: glif w skali źródła → czerwony pomiar
 * `getBBox` glifu względem kafla (`ux04-pole-liniowe-zrzuty-screenshot.spec.ts`).
 */
describe('kafel stanu — stopień glifu i kreska proporcjonalna do kafla', () => {
  const KAFLOWE = (Object.keys(QET_SYMBOLE_POLA_SN) as QetSymbolPolaSnId[]).filter((id) => QET_SYMBOLE_POLA_SN[id].kafel);

  function obrot(x: number, y: number, kat: number, cx: number, cy: number): readonly [number, number] {
    const r = (kat * Math.PI) / 180;
    return [cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)];
  }
  function obwiedniaY(prims: readonly CadPrimitive[], kat = 0, cx = 0, cy = 0, zasieg = 1): [number, number] {
    let lo = Infinity;
    let hi = -Infinity;
    const z = (x: number, y: number) => obrot(cx + (x - cx) * zasieg, cy + (y - cy) * zasieg, kat, cx, cy)[1];
    for (const p of prims) {
      const ys: number[] = [];
      if (p.k === 'line') ys.push(z(p.x1, p.y1), z(p.x2, p.y2));
      else if (p.k === 'circle') ys.push(p.cy - p.r, p.cy + p.r);
      else if (p.k === 'path' || p.k === 'arc') {
        const liczby = p.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
        if (p.k === 'path') for (let i = 1; i < liczby.length; i += 2) ys.push(liczby[i]);
        else ys.push(liczby[1], liczby[liczby.length - 1]);
      } else if (p.k === 'letter') ys.push(p.y - p.size / 2, p.y + p.size / 2);
      for (const y of ys) {
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
    }
    return [lo, hi];
  }

  it('warunek wstępny: osiem rysunków łączników z kaflem, kreska glifu = bok/24 i grubsza od kreski przewodu', () => {
    expect(KAFLOWE).toHaveLength(8);
    expect(QET_KRESKA_GLIFU).toBeCloseTo(QET_BOK_KAFLA_STANU / 24, 9);
    expect(QET_KRESKA_GLIFU).toBeGreaterThan(V3_STROKE_APPARATUS);
  });

  for (const id of KAFLOWE) {
    const s = QET_SYMBOLE_POLA_SN[id];
    for (const [polozenie, kat] of Object.entries(s.noz!.katy)) {
      it(`${id} · położenie ${polozenie}: wysokość glifu (nóż + znaczniki) w [0,55; 0,70] boku kafla`, () => {
        const [a, b] = obwiedniaY([...s.stale, ...s.znaczniki.flatMap((z) => z.prymitywy)]);
        const zasieg = s.noz!.zasiegi[polozenie as keyof typeof s.noz.zasiegi] ?? 1;
        const [c, d] = obwiedniaY(s.noz!.prymitywy, kat ?? 0, s.noz!.cx, s.noz!.cy, zasieg);
        const udzial = (Math.max(b, d) - Math.min(a, c)) / QET_BOK_KAFLA_STANU;
        expect(udzial).toBeGreaterThanOrEqual(0.55);
        expect(udzial).toBeLessThanOrEqual(0.7);
      });
    }
    for (const [motyw, kafle] of MOTYWY) {
      for (const state of STANY) {
        it(`${motyw} · ${id} · ${state ?? 'brak stanu'}: glif i osprzęt kreską glifu, przewody kreską przewodu`, () => {
          const doc = rysuj(id, state, kafle);
          const glif = doc.querySelector('[data-kafel-stanu] [data-qet="glif"]')!;
          const przewody = doc.querySelector('[data-kafel-stanu] [data-qet="przewody"]')!;
          expect(glif).not.toBeNull();
          expect(przewody).not.toBeNull();
          const szer = (g: Element) => [...g.querySelectorAll('[stroke-width]')].map((n) => Number(n.getAttribute('stroke-width')));
          const wGlifu = szer(glif);
          const kreskiZnacznikow = s.znaczniki.reduce((n, z) => n + z.prymitywy.length, 0);
          expect(kreskiZnacznikow).toBeGreaterThan(0);
          expect(wGlifu.length).toBe(s.stale.length + s.noz!.prymitywy.length + kreskiZnacznikow);
          for (const w of wGlifu) expect(w).toBeCloseTo(QET_KRESKA_GLIFU, 9);
          // Ziemia (uziemnik, trójpołożeniowy) kreską glifu, poza grupą glifu (poza miarą stopnia).
          const ziemia = doc.querySelector('[data-kafel-stanu] [data-qet="ziemia"]');
          expect(ziemia === null).toBe(s.ziemia === null);
          if (ziemia) {
            expect(szer(ziemia).length).toBe(s.ziemia!.prymitywy.length);
            for (const w of szer(ziemia)) expect(w).toBeCloseTo(QET_KRESKA_GLIFU, 9);
          }
          expect(szer(przewody).length).toBe(s.przewody.length);
          for (const w of szer(przewody)) expect(w).toBeCloseTo(V3_STROKE_APPARATUS, 9);
          const osprzet = doc.querySelector('[data-kafel-stanu] [data-qet="osprzet"]');
          expect(osprzet === null).toBe(s.osprzet.length === 0);
          if (osprzet) for (const w of szer(osprzet)) expect([QET_KRESKA_GLIFU, 0.5 * QET_KRESKA_GLIFU]).toContain(w);
          // Kreska przerywana (nóż stanu nieznanego, sprzężenie napędu) z WIDOCZNĄ przerwą przy
          // końcach zaokrąglonych: przerwa wzoru > grubość kreski (stały wzór 1,5 1 przy kresce
          // 2 zlewał się w linię ciągłą — iniekcja tego wzoru daje czerwony test).
          for (const n of doc.querySelectorAll('[data-kafel-stanu] [stroke-dasharray]')) {
            const [kreska, przerwa] = n.getAttribute('stroke-dasharray')!.split(' ').map(Number);
            const w = Number(n.getAttribute('stroke-width'));
            expect(kreska).toBeGreaterThan(0);
            expect(przerwa - w).toBeGreaterThan(0);
          }
        });
      }
    }
  }
});
