/**
 * REJESTR SYMBOLI §4 — snapshot glifu per typ urządzenia × stan (§46
 * „symbol registry snapshot"): ten sam typ ENM zawsze dostaje ten sam glif,
 * stan OPEN/CLOSED ma NOŚNIK GEOMETRYCZNY (różny znacznik), a typy bez stanu
 * (wkładka, przewód) nie udają łącznika.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { SYMBOL_DEFS } from '../../symbols/defs';
import { SYMBOL_GLYPHS } from '../../symbols/glyphs';
import {
  REJESTR_SYMBOLI_NN,
  SYMBOL_ODBIORU,
  SYMBOL_TRANSFORMATORA,
  SYMBOL_ZABEZPIECZENIA,
  kodyAnsi,
  kodyAnsiPelne,
  stanSlowny,
  symbolPomiaru,
  symbolZrodlaDer,
} from '../symbolRegistry';
import { SCENARIUSZE_NN, SLUGI_SCENARIUSZY } from '../fixtures/scenariusze';

const TYPY = Object.keys(REJESTR_SYMBOLI_NN) as (keyof typeof REJESTR_SYMBOLI_NN)[];

function markupGlifu(symbolId: keyof typeof SYMBOL_GLYPHS, state: 'open' | 'closed' | 'unknown'): string {
  const Glyph = SYMBOL_GLYPHS[symbolId];
  const { container, unmount } = render(
    <svg>
      <Glyph x={0} y={0} stroke="#000" state={state} />
    </svg>,
  );
  const markup = container.querySelector('svg')?.innerHTML ?? '';
  unmount();
  return markup;
}

describe('REJESTR_SYMBOLI_NN — jeden wpis na typ gałęzi ENM', () => {
  it('rejestr (typ → glif · klasa · nośnik stanu) jest zamrożony snapshotem', () => {
    expect(REJESTR_SYMBOLI_NN).toMatchSnapshot();
  });

  it('każdy glif rejestru istnieje w bibliotece symboli (`symbols/defs`) i ma komponent', () => {
    for (const typ of TYPY) {
      const wpis = REJESTR_SYMBOLI_NN[typ];
      if (wpis.symbolId === null) {
        expect(wpis.klasaOznaczenia, typ).toBe('W');
        expect(wpis.nosnikStanu, typ).toBe('brak');
        continue;
      }
      expect(SYMBOL_DEFS[wpis.symbolId], `${typ} → ${wpis.symbolId}`).toBeDefined();
      expect(SYMBOL_GLYPHS[wpis.symbolId], `${typ} → ${wpis.symbolId}`).toBeDefined();
    }
  });

  for (const typ of TYPY) {
    const wpis = REJESTR_SYMBOLI_NN[typ];
    if (wpis.symbolId === null) continue;
    const symbolId = wpis.symbolId;
    it(`[${typ} → ${symbolId}] markup glifu per stan (open/closed/unknown) jest zamrożony snapshotem`, () => {
      for (const state of ['open', 'closed', 'unknown'] as const) {
        expect(markupGlifu(symbolId, state)).toMatchSnapshot(`${typ}:${state}`);
      }
    });

    it(`[${typ}] stan OPEN ≠ CLOSED geometrycznie, gdy typ niesie stan; identyczny, gdy nośnik = brak`, () => {
      // Porównanie GEOMETRII: atrybut `data-switch-state` jest opisem danych,
      // nie rysunkiem — zdejmujemy go, żeby test mierzył sylwetkę.
      const bezAtrybutu = (markup: string): string => markup.replace(/ data-switch-state="[a-z]+"/g, '');
      const open = bezAtrybutu(markupGlifu(symbolId, 'open'));
      const closed = bezAtrybutu(markupGlifu(symbolId, 'closed'));
      if (wpis.nosnikStanu === 'brak') expect(open).toBe(closed);
      else expect(open).not.toBe(closed);
    });
  }

  it('sprzęgło ma klasę QBC i ten sam glif co wyłącznik (aparat rzeczywisty, §7), ale osobny rozmiar', () => {
    expect(REJESTR_SYMBOLI_NN.bus_coupler.klasaOznaczenia).toBe('QBC');
    expect(REJESTR_SYMBOLI_NN.bus_coupler.symbolId).toBe(REJESTR_SYMBOLI_NN.breaker.symbolId);
    expect(REJESTR_SYMBOLI_NN.bus_coupler.rozmiar).toBe('sprzeglo');
  });

  it('KAŻDY typ urządzenia występujący w scenariuszach 01–18 ma wpis w rejestrze (zero glifu „na oko")', () => {
    const typyWDanych = new Set<string>();
    for (const slug of SLUGI_SCENARIUSZY) {
      const g = SCENARIUSZE_NN[slug].graph;
      if (g.status !== 'OK') continue;
      for (const d of g.devices) typyWDanych.add(d.device_type);
    }
    expect(typyWDanych.size).toBeGreaterThan(3);
    for (const typ of typyWDanych) expect(TYPY, typ).toContain(typ);
  });
});

describe('Symbole elementów nie-gałęziowych — z DANYCH, nie z domysłu', () => {
  it('transformator, odbiór, zabezpieczenie — stałe glify biblioteki', () => {
    expect(SYMBOL_DEFS[SYMBOL_TRANSFORMATORA]).toBeDefined();
    expect(SYMBOL_DEFS[SYMBOL_ODBIORU]).toBeDefined();
    expect(SYMBOL_DEFS[SYMBOL_ZABEZPIECZENIA]).toBeDefined();
  });

  it('źródło rozproszone wg gen_type: PV → derPv, BESS → derBess, wiatr → derWind, nieznany → generator ogólny', () => {
    expect(symbolZrodlaDer('pv_inverter')).toBe('derPv');
    expect(symbolZrodlaDer('bess')).toBe('derBess');
    expect(symbolZrodlaDer('wind_inverter')).toBe('derWind');
    expect(symbolZrodlaDer('fw_dfig')).toBe('derWind');
    expect(symbolZrodlaDer('synchronous')).toBe('derGenerator');
    expect(symbolZrodlaDer(null)).toBe('derGenerator');
  });

  it('pomiar: CT → przekładnik prądowy, VT → napięciowy', () => {
    expect(symbolPomiaru('CT')).toBe('currentTransformer');
    expect(symbolPomiaru('VT')).toBe('voltageTransformer');
  });

  it('kody ANSI: ≤2 kody wprost; ≥3 → pierwszy + licznik (glif mieści dwa wiersze), pełna lista osobno', () => {
    expect(kodyAnsi(['overcurrent_50', 'overcurrent_51'])).toEqual(['50', '51']);
    expect(kodyAnsi(['rocof_81R', 'underfrequency_81U', 'vector_shift_78'])).toEqual(['81R', '+2']);
    expect(kodyAnsiPelne(['rocof_81R', 'underfrequency_81U', 'vector_shift_78'])).toEqual(['81R', '81U', '78']);
    expect(kodyAnsiPelne(['nieznany_kod'])).toEqual(['nieznany_kod']);
  });

  it('słowo stanu po polsku (drugorzędne potwierdzenie glifu)', () => {
    expect(stanSlowny('OPEN')).toBe('OTWARTY');
    expect(stanSlowny('CLOSED')).toBe('ZAMKNIĘTY');
    expect(stanSlowny('UNKNOWN')).toBe('STAN NIEZNANY');
  });
});
