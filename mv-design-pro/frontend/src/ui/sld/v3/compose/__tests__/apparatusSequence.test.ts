/**
 * SLD V3 F10.2 — testy `compose/apparatusSequence.ts` `apparatusIdentifiers`
 * (SLD_CAD_SPEC_V3 §19.1, V12K-035): identyfikator PER-APARAT (Q/QE/T),
 * fallback konwencji WYŁĄCZNIE dla aparatów wymienionych wprost w spec §19.1
 * (wyłącznik/rozłącznik/odłącznik → „Q"; uziemnik → „QE"; transformator →
 * „T"). CT/VT/SA/cableHead NIE dostają identyfikatora w tej fazie.
 */
import { describe, expect, it } from 'vitest';

import { apparatusIdentifiers, apparatusIdentifierSources } from '../apparatusSequence';
import type { SymbolId } from '../../symbols/defs';

describe('apparatusIdentifiers (spec §19.1 — identyfikator per-aparat, fallback konwencji)', () => {
  it('pole liniowe (konwencja §12.4): DS→CB→CT→DS→ES→głowica ⇒ Q1,Q2,null,Q3,QE1,null', () => {
    const symbolIds: readonly SymbolId[] = [
      'disconnector',
      'breaker',
      'currentTransformer',
      'disconnector',
      'earthSwitch',
      'cableHead',
    ];
    expect(apparatusIdentifiers(symbolIds)).toEqual(['Q1', 'Q2', null, 'Q3', 'QE1', null]);
  });

  it('pole transformatorowe (konwencja §12.4): DS→fuseSwitch→TR2W ⇒ Q1,Q2,T1', () => {
    const symbolIds: readonly SymbolId[] = ['disconnector', 'fuseSwitch', 'transformer2W'];
    expect(apparatusIdentifiers(symbolIds)).toEqual(['Q1', 'Q2', 'T1']);
  });

  it('pole pomiarowe (konwencja §12.4): DS→VT→ES ⇒ Q1,null,QE1 (VT bez identyfikatora w F10.2)', () => {
    const symbolIds: readonly SymbolId[] = ['disconnector', 'voltageTransformer', 'earthSwitch'];
    expect(apparatusIdentifiers(symbolIds)).toEqual(['Q1', null, 'QE1']);
  });

  it('CT/VT/SA/cableHead nigdy nie dostają identyfikatora (poza zakresem F10.2 — §18.3/F10.4, brak konwencji dla VT/SA)', () => {
    const symbolIds: readonly SymbolId[] = ['currentTransformer', 'voltageTransformer', 'surgeArrester', 'cableHead'];
    expect(apparatusIdentifiers(symbolIds)).toEqual([null, null, null, null]);
  });

  it('liczniki Q/QE/T są NIEZALEŻNE — pozycja aparatu jednej kategorii nie wpływa na numerację innej', () => {
    const symbolIds: readonly SymbolId[] = [
      'earthSwitch', // QE1
      'breaker', // Q1
      'transformer2W', // T1
      'disconnector', // Q2
      'earthSwitch', // QE2
      'transformer2W', // T2
    ];
    expect(apparatusIdentifiers(symbolIds)).toEqual(['QE1', 'Q1', 'T1', 'Q2', 'QE2', 'T2']);
  });

  it('sekwencja pusta ⇒ tablica pusta', () => {
    expect(apparatusIdentifiers([])).toEqual([]);
  });

  it('deterministyczne: dwa wywołania na tych samych danych dają identyczny wynik', () => {
    const symbolIds: readonly SymbolId[] = ['disconnector', 'breaker', 'currentTransformer', 'earthSwitch'];
    expect(apparatusIdentifiers(symbolIds)).toEqual(apparatusIdentifiers(symbolIds));
  });
});

describe('F10.6 (DOMAIN, V12K-035, D1) — apparatusIdentifiers/apparatusIdentifierSources z BayPrimaryDevice.designation', () => {
  it('designation obecny wygrywa nad tekstem konwencji, licznik kategorii mimo to rośnie dla pozostałych aparatów', () => {
    const symbolIds: readonly SymbolId[] = ['breaker', 'disconnector', 'earthSwitch'];
    const designations = ['Q7', null, undefined];
    expect(apparatusIdentifiers(symbolIds, designations)).toEqual(['Q7', 'Q2', 'QE1']);
  });

  it('designation pusty/samo-białe-znaki traktowany jak brak danej (fallback konwencji)', () => {
    const symbolIds: readonly SymbolId[] = ['breaker'];
    expect(apparatusIdentifiers(symbolIds, [''])).toEqual(['Q1']);
    expect(apparatusIdentifiers(symbolIds, ['   '])).toEqual(['Q1']);
  });

  it('brak parametru designations zachowuje DOKŁADNIE zachowanie sprzed F10.6 (100% konwencja)', () => {
    const symbolIds: readonly SymbolId[] = ['disconnector', 'breaker', 'earthSwitch', 'transformer2W'];
    expect(apparatusIdentifiers(symbolIds)).toEqual(['Q1', 'Q2', 'QE1', 'T1']);
  });

  it('apparatusIdentifierSources: "dane" wyłącznie gdy designation obecny na pozycji identyfikowalnej, null dla CT/VT/SA', () => {
    const symbolIds: readonly SymbolId[] = ['breaker', 'disconnector', 'currentTransformer', 'earthSwitch'];
    const designations = ['Q7', undefined, 'ignorowane-CT-nie-ma-identyfikatora', undefined];
    expect(apparatusIdentifierSources(symbolIds, designations)).toEqual(['dane', 'konwencja', null, 'konwencja']);
  });

  it('apparatusIdentifierSources bez designations ⇒ zawsze "konwencja" na pozycjach identyfikowalnych', () => {
    const symbolIds: readonly SymbolId[] = ['breaker', 'earthSwitch', 'transformer2W', 'cableHead'];
    expect(apparatusIdentifierSources(symbolIds)).toEqual(['konwencja', 'konwencja', 'konwencja', null]);
  });
});
