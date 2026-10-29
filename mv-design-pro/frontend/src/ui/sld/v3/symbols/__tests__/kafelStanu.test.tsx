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
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { QET_SYMBOLE_POLA_SN } from '../../cad/qet/qetPoleSn';
import { SYMBOL_DEFS, SYMBOLE_LACZNIKOW_Z_POLOZENIEM, czyLacznikZPolozeniem, obrysSymbolu, type SymbolId } from '../defs';
import {
  KAFEL_STANU_MARGINES,
  OPIS_POLOZENIA_PL,
  SYMBOL_GLYPHS,
  prostokatKaflaStanu,
  stanKaflaLacznika,
  type SwitchState,
} from '../glyphs';
import { DARK_SCADA_SLD_PALETTE, STATE_COLOR, type StanKafla } from '../../theme/colorTokens';
import { LIGHT_TECHNICAL_SLD_PALETTE } from '../../theme/palette';
import { LIGHT_TECHNICAL_V3 } from '../../export/exportPalette';
import { WARIANT_RYSUNKU_QET, symbolIdForPrimaryDeviceKind } from '../../compose/apparatusSequence';
import { RODZAJE_LACZNIKOW_POLA } from '../../compose/rodzajeAparatuPola';
import type { BayPrimaryDeviceKind } from '../../../../../types/enm';

const MOTYWY = [
  ['ciemny', DARK_SCADA_SLD_PALETTE.state],
  ['jasny', LIGHT_TECHNICAL_SLD_PALETTE.state],
  ['eksport', LIGHT_TECHNICAL_V3.state],
] as const;

const STANY: readonly (SwitchState | undefined)[] = ['closed', 'open', 'earthed', 'unknown', 'bad', undefined];

/** Wyrocznia NIEZALEŻNA od `stanKaflaLacznika`: tabela kontraktu z karty. */
function oczekiwanyKafel(id: SymbolId, state: SwitchState | undefined): StanKafla | null {
  if (id === 'noPoint' && state === undefined) return null; // NOP bez łącznika — sam znacznik
  if (state === 'closed') return 'zamkniety';
  if (state === 'open') return 'otwarty';
  if (state === 'bad') return 'bledny';
  // Uziemiony: tylko łącznik trójpołożeniowy (dwa XSWI wg IEC 61850-7-4 — zestyk uziemiający
  // ZAMKNIĘTY); na każdym innym symbolu to stan bez znaczenia → nieustalony.
  if (state === 'earthed') return id === 'qetThreePositionSwitch' ? 'zamkniety' : 'nieustalony';
  return 'nieustalony';
}

/** Oczekiwane położenie geometrii styku (wyrocznia z karty). */
function oczekiwanaGeometria(id: SymbolId, state: SwitchState | undefined): string {
  if (state === 'closed' || state === 'open') return state;
  if (state === 'earthed' && id === 'qetThreePositionSwitch') return 'earthed';
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
    (
      [
        ['kanoniczny', symbolIdForPrimaryDeviceKind(kind, null)],
        ['QET', symbolIdForPrimaryDeviceKind(kind, WARIANT_RYSUNKU_QET)],
      ] as const
    )
      .filter((para): para is readonly ['kanoniczny' | 'QET', SymbolId] => para[1] !== null)
      .map(([wariant, id]) => [kind, wariant, id] as const),
);

describe('kafel stanu — parytet: każdy łącznik pola rysuje położenie', () => {
  it('symbol każdego rodzaju łącznika pola (oba warianty) należy do SYMBOLE_LACZNIKOW_Z_POLOZENIEM', () => {
    expect(RODZAJE_SYMBOLE.length).toBeGreaterThanOrEqual(2 * 5);
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
          // Kafel obejmuje cały rysunek (wszystkie położenia noża) + margines.
          const o = obrysSymbolu(id);
          expect(Number(tlo.getAttribute('x'))).toBeCloseTo(o.x - KAFEL_STANU_MARGINES, 6);
          expect(Number(tlo.getAttribute('y'))).toBeCloseTo(o.y - KAFEL_STANU_MARGINES, 6);
          expect(Number(tlo.getAttribute('width'))).toBeCloseTo(o.width + 2 * KAFEL_STANU_MARGINES, 6);
          expect(Number(tlo.getAttribute('height'))).toBeCloseTo(o.height + 2 * KAFEL_STANU_MARGINES, 6);
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

  it('łącznik trójpołożeniowy: trzy różne położenia noża; „uziemiony" = kafel zamknięty (zestyk uziemiający)', () => {
    const katy = QET_SYMBOLE_POLA_SN.qetThreePositionSwitch.noz!.katy;
    expect(new Set([katy.closed, katy.open, katy.earthed]).size).toBe(3);
    const doc = rysuj('qetThreePositionSwitch', 'earthed');
    expect(doc.querySelector('[data-qet-polozenie]')!.getAttribute('data-qet-polozenie')).toBe('earthed');
    expect(doc.querySelector('[data-kafel-stanu]')!.getAttribute('data-kafel-stanu')).toBe('zamkniety');
  });

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
