import { describe, expect, it } from 'vitest';

import { etykietaStanu, fmtA, fmtKa, fmtLiczba, fmtProcent, fmtStan } from '../arkuszFormat';
import type { ArkuszWartosc } from '../nnSiteApi';

describe('arkuszFormat — konwencja polska (przecinek dziesiętny)', () => {
  it('fmtLiczba zamienia kropkę na przecinek', () => {
    expect(fmtLiczba(32.2749, 1)).toBe('32,3');
    expect(fmtLiczba(0, 0)).toBe('0');
  });

  it('fmtLiczba zwraca pusty napis dla null/undefined/NaN', () => {
    expect(fmtLiczba(null)).toBe('');
    expect(fmtLiczba(undefined)).toBe('');
    expect(fmtLiczba(Number.NaN)).toBe('');
  });

  it('fmtA/fmtKa dołączają jednostkę', () => {
    expect(fmtA(23.2, 1)).toBe('23,2 A');
    expect(fmtKa(3.5, 2)).toBe('3,50 kA');
    expect(fmtA(null)).toBe('');
  });

  it('fmtProcent dołącza znak procenta', () => {
    expect(fmtProcent(1.234, 2)).toBe('1,23 %');
  });
});

describe('arkuszFormat — stan czterowartościowy (puste komórki nie istnieją)', () => {
  const wartosc: ArkuszWartosc<number> = { status: 'OK', wartosc: 42, zrodlo_pl: 'x', reason_pl: null };
  const brak: ArkuszWartosc<number> = { status: 'brak danych', wartosc: null, zrodlo_pl: null, reason_pl: 'brak biegu' };
  const nieDotyczy: ArkuszWartosc<number> = { status: 'nie dotyczy', wartosc: null, zrodlo_pl: null, reason_pl: 'IT' };
  const nierozstrzygalne: ArkuszWartosc<number> = { status: 'nierozstrzygalne', wartosc: null, zrodlo_pl: null, reason_pl: 'x' };

  it('fmtStan formatuje wartość, gdy status OK', () => {
    expect(fmtStan(wartosc, (v) => `${v}A`)).toBe('42A');
  });

  it('fmtStan NIGDY nie zwraca pustego napisu dla trzeciego/czwartego stanu', () => {
    expect(fmtStan(brak, (v) => `${v}A`)).not.toBe('');
    expect(fmtStan(nieDotyczy, (v) => `${v}A`)).not.toBe('');
    expect(fmtStan(nierozstrzygalne, (v) => `${v}A`)).not.toBe('');
  });

  it('etykietaStanu rozróżnia trzy nie-OK stany', () => {
    expect(etykietaStanu('brak danych')).toBe('brak danych');
    expect(etykietaStanu('nie dotyczy')).toBe('nie dotyczy');
    expect(etykietaStanu('nierozstrzygalne')).toBe('nierozstrzygalne');
  });
});
