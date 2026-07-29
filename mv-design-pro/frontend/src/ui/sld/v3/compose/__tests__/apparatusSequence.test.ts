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

describe('Z3 (AUDYT_POWYKONAWCZY_SLD §Z3 + dług W1c) — prymat danych i unikalność w polu', () => {
  it('PEŁNE dane producenckie: „F1"/„TR" (poza wzorcem §19.1) wygrywają nad konwencją', () => {
    // Pole transformatorowe RMU z packa: rozłącznik bezpiecznikowy „F1" +
    // uziemnik „Q9" (dana) + transformator „TR". Dane spływają 1:1.
    const symbolIds: readonly SymbolId[] = ['fuseSwitch', 'earthSwitch', 'transformer2W'];
    const designations = ['F1', 'Q9', 'TR'];
    expect(apparatusIdentifiers(symbolIds, designations)).toEqual(['F1', 'Q9', 'TR']);
  });

  it('CZĘŚCIOWE dane: brakująca dana per-aparat degraduje do konwencji, obecna wygrywa', () => {
    const symbolIds: readonly SymbolId[] = ['disconnector', 'breaker', 'earthSwitch'];
    // odłącznik ma daną „Q1", wyłącznik bez danej (→ konwencja Q2), uziemnik „Q9".
    const designations = ['Q1', null, 'Q9'];
    expect(apparatusIdentifiers(symbolIds, designations)).toEqual(['Q1', 'Q2', 'Q9']);
  });

  it('BRAK danych: czysta konwencja §19.1 (fallback)', () => {
    const symbolIds: readonly SymbolId[] = ['disconnector', 'breaker', 'earthSwitch', 'transformer2W'];
    expect(apparatusIdentifiers(symbolIds)).toEqual(['Q1', 'Q2', 'QE1', 'T1']);
  });

  it('KOLIZJA danych: dwa aparaty pola z tym samym designation ⇒ deterministyczny sufiks „·k" (zero nadpisania)', () => {
    const symbolIds: readonly SymbolId[] = ['disconnector', 'breaker', 'disconnector'];
    const designations = ['Q1', 'Q1', 'Q1'];
    expect(apparatusIdentifiers(symbolIds, designations)).toEqual(['Q1', 'Q1·2', 'Q1·3']);
    // Determinizm: powtórka daje identyczny wynik.
    expect(apparatusIdentifiers(symbolIds, designations)).toEqual(apparatusIdentifiers(symbolIds, designations));
  });

  it('KOLIZJA dana↔konwencja: dana „Q2" na 1. odłączniku koliduje z konwencyjnym Q2 2. odłącznika ⇒ sufiks', () => {
    // Licznik „Q" jest WSPÓLNY dla wszystkich łączników toru (odłącznik/
    // wyłącznik/…): idx0 odłącznik q=1 (ale dana „Q2" wygrywa), idx1 odłącznik
    // q=2 → konwencja „Q2" KOLIDUJE z daną → „Q2·2", idx2 wyłącznik q=3 → „Q3".
    const symbolIds: readonly SymbolId[] = ['disconnector', 'disconnector', 'breaker'];
    const designations = ['Q2', null, null];
    expect(apparatusIdentifiers(symbolIds, designations)).toEqual(['Q2', 'Q2·2', 'Q3']);
  });

  it('sufiks kolizji „·k" przechodzi wzorzec wyroczni sceny (Q\\d+/QE\\d+/T\\d+ + ·k)', () => {
    // Regresja: sufiks musi pozostać rozpoznawalny przez wyrocznię
    // `apparatusIdentifierGaps` dla fallbacku konwencji.
    const pattern = /^(Q\d+|QE\d+|T\d+)(·\d+)?$/;
    // dwie DANE „Q2" na łącznikach toru ⇒ ['Q2', 'Q2·2'] — obie zgodne z wzorcem.
    const ids = apparatusIdentifiers(['disconnector', 'breaker'], ['Q2', 'Q2']);
    expect(ids).toEqual(['Q2', 'Q2·2']);
    for (const id of ids) expect(pattern.test(id as string)).toBe(true);
  });
});
