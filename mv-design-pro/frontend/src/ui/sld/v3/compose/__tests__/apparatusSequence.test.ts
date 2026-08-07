/**
 * SLD V3 F10.2 — testy `compose/apparatusSequence.ts` `apparatusIdentifiers`
 * (SLD_CAD_SPEC_V3 §19.1, V12K-035): identyfikator PER-APARAT (Q/QE/T),
 * fallback konwencji dla aparatów wymienionych wprost w spec §19.1
 * (wyłącznik/rozłącznik/odłącznik → „Q"; uziemnik → „QE"; transformator →
 * „T") ORAZ — od dyrektywy właściciela 2026-08-06 (audyt sieci pokazowej:
 * anonimowy przekładnik pola pomiarowego czytał się jak „mały transformator")
 * — przekładnik napięciowy → „TV" (klasa przekładników PN-EN 81346-2:
 * TA=prądowy, TV=napięciowy) ORAZ — od decyzji właściciela 2026-08-07
 * (V12K-335 pkt 3, karta S9-12) — ogranicznik przepięć → „F" (klasa
 * ochronników PN-EN 81346-2; dług „SA bez konwencji" z V12K-329
 * ROZSTRZYGNIĘTY). CT/cableHead NIE dostają identyfikatora w tej fazie
 * (CT ma własną adnotację §18.3/F10.4).
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

  it('pole pomiarowe (konwencja §12.4): DS→VT→ES ⇒ Q1,TV1,QE1 (przekładnik napięciowy z oznacznikiem — dyrektywa 2026-08-06)', () => {
    // Intencja pierwotna (VT ⇒ null) była świadomą decyzją „zero zgadywania";
    // zmiana kanonu rozstrzygnięta dyrektywą właściciela po audycie sieci
    // pokazowej — VT bez oznacznika czytał się jak transformator mocy.
    const symbolIds: readonly SymbolId[] = ['disconnector', 'voltageTransformer', 'earthSwitch'];
    expect(apparatusIdentifiers(symbolIds)).toEqual(['Q1', 'TV1', 'QE1']);
  });

  it('CT/cableHead nigdy nie dostają identyfikatora (§18.3/F10.4 dla CT), VT dostaje TV, SA dostaje F (V12K-335 pkt 3)', () => {
    // Intencja pierwotna (SA ⇒ null) była świadomym długiem „brak konwencji,
    // zero zgadywania" (V12K-329); decyzja właściciela 2026-08-07 rozstrzygnęła
    // rodzinę F wg PN-EN 81346-2 — test przepisany do obecnego kanonu.
    const symbolIds: readonly SymbolId[] = ['currentTransformer', 'voltageTransformer', 'surgeArrester', 'cableHead'];
    expect(apparatusIdentifiers(symbolIds)).toEqual([null, 'TV1', 'F1', null]);
  });

  it('dwa ograniczniki w polu ⇒ F1, F2 (licznik kategorii F, jak Q/QE/T/TV); licznik resetuje się między polami', () => {
    const symbolIds: readonly SymbolId[] = ['disconnector', 'surgeArrester', 'surgeArrester', 'earthSwitch'];
    expect(apparatusIdentifiers(symbolIds)).toEqual(['Q1', 'F1', 'F2', 'QE1']);
    // Reset per pole: NOWE wywołanie (nowe pole) zaczyna od F1, nie F3.
    expect(apparatusIdentifiers(['surgeArrester'])).toEqual(['F1']);
  });

  it('dana per-aparat wygrywa nad konwencją F (prymat danych §12.1 obejmuje ogranicznik — np. producenckie „Z1")', () => {
    const symbolIds: readonly SymbolId[] = ['surgeArrester'];
    expect(apparatusIdentifiers(symbolIds, ['Z1'])).toEqual(['Z1']);
    expect(apparatusIdentifierSources(symbolIds, ['Z1'])).toEqual(['dane']);
    expect(apparatusIdentifierSources(symbolIds)).toEqual(['konwencja']);
  });

  it('KOLIZJA dana↔konwencja F: dana „F1" na bezpieczniku + konwencyjny F1 ogranicznika ⇒ deterministyczny sufiks', () => {
    // Iloczyn cech nazwany w V12K-329 jako powód wstrzymania F: producenckie
    // „F1" bezpiecznika w JEDNYM polu z ogranicznikiem konwencji. Mechanizm
    // disambiguacji Z3 §0.3 rozstrzyga kolizję JAWNIE (sufiks „·k"), zero
    // cichego nadpisania.
    const symbolIds: readonly SymbolId[] = ['fuseSwitch', 'surgeArrester'];
    const designations = ['F1', null];
    expect(apparatusIdentifiers(symbolIds, designations)).toEqual(['F1', 'F1·2']);
  });

  it('dwa przekładniki napięciowe w polu ⇒ TV1, TV2 (licznik kategorii TV, jak Q/QE/T)', () => {
    const symbolIds: readonly SymbolId[] = ['disconnector', 'voltageTransformer', 'voltageTransformer', 'earthSwitch'];
    expect(apparatusIdentifiers(symbolIds)).toEqual(['Q1', 'TV1', 'TV2', 'QE1']);
  });

  it('dana per-aparat wygrywa nad konwencją TV (prymat danych §12.1 obejmuje przekładnik)', () => {
    const symbolIds: readonly SymbolId[] = ['voltageTransformer'];
    expect(apparatusIdentifiers(symbolIds, ['PN-7'])).toEqual(['PN-7']);
    expect(apparatusIdentifierSources(symbolIds, ['PN-7'])).toEqual(['dane']);
    expect(apparatusIdentifierSources(symbolIds)).toEqual(['konwencja']);
  });

  it('liczniki Q/QE/T/TV/F są NIEZALEŻNE — pozycja aparatu jednej kategorii nie wpływa na numerację innej', () => {
    const symbolIds: readonly SymbolId[] = [
      'earthSwitch', // QE1
      'breaker', // Q1
      'transformer2W', // T1
      'disconnector', // Q2
      'earthSwitch', // QE2
      'transformer2W', // T2
      'voltageTransformer', // TV1 — licznik TV niezależny od T
      'surgeArrester', // F1 — licznik F niezależny od pozostałych
    ];
    expect(apparatusIdentifiers(symbolIds)).toEqual(['QE1', 'Q1', 'T1', 'Q2', 'QE2', 'T2', 'TV1', 'F1']);
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

  it('apparatusIdentifierSources: "dane" wyłącznie gdy designation obecny na pozycji identyfikowalnej, null dla CT', () => {
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
  it('PEŁNE dane producenckie: „F1"/„TR" wygrywają nad konwencją („TR" nadal poza wzorcem §19.1 — prymat danych)', () => {
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
