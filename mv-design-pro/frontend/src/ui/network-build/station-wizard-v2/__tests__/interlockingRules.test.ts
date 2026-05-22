/**
 * Kontrakt Interlocking Rules — wymagania bezpieczeństwa PN-EN 62271-200.
 *
 * Reguły blokad są krytyczne dla BHP — silnik blokad musi być
 * deterministyczny i audytowalny. Test wymusza poprawność każdej reguły
 * + scenariusze realne (Q1 zamknięty blokuje zamknięcie Q3 itd.).
 */
import { describe, expect, it } from 'vitest';

import {
  INTERLOCKING_RULES,
  evaluateInterlock,
  buildInterlockMatrix,
  type BayState,
} from '../interlockingRules';

describe('INTERLOCKING_RULES — kanon 6 reguł blokad', () => {
  it('zawiera 6 reguł per PN-EN 62271-200 § 5.10', () => {
    expect(INTERLOCKING_RULES.length).toBe(6);
  });

  it('każda reguła ma unikalny id', () => {
    const ids = INTERLOCKING_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('każda reguła ma referencję normatywną PN-EN 62271-200', () => {
    for (const rule of INTERLOCKING_RULES) {
      expect(rule.normRef).toMatch(/PN-EN 62271-200/);
    }
  });

  it('każda reguła ma polski opis (reasonPl)', () => {
    for (const rule of INTERLOCKING_RULES) {
      expect(rule.reasonPl.length).toBeGreaterThan(10);
    }
  });

  it('reguły safety_mechanical pokrywają Q1↔Q3 + Q2↔Q1', () => {
    const safetyRules = INTERLOCKING_RULES.filter((r) => r.class === 'safety_mechanical');
    expect(safetyRules.length).toBeGreaterThanOrEqual(5);
  });
});

describe('evaluateInterlock — silnik blokad BHP', () => {
  it('R1: nie można zamknąć Q3 gdy Q1 zamknięty (sam R1 — Q2=open)', () => {
    const state: BayState = { Q1: 'closed', Q2: 'open', Q3: 'open' };
    const result = evaluateInterlock('Q3', 'close', state);
    expect(result.allowed).toBe(false);
    // Tylko R1 — Q2 jest open więc R5 nie odpala.
    const ids = result.violatedRules.map((r) => r.id);
    expect(ids).toContain('R1_close_Q3_when_Q1_closed');
    expect(ids).not.toContain('R5_close_Q3_when_Q2_closed');
  });

  it('R2: nie można zamknąć Q1 gdy Q3 zamknięty (uziemnik aktywny)', () => {
    const state: BayState = { Q1: 'open', Q2: 'closed', Q3: 'closed' };
    const result = evaluateInterlock('Q1', 'close', state);
    expect(result.allowed).toBe(false);
    expect(result.violatedRules.map((r) => r.id)).toContain('R2_close_Q1_when_Q3_closed');
  });

  it('R3: nie można zamknąć Q1 gdy Q2 otwarty (odłącznik otwarty)', () => {
    const state: BayState = { Q1: 'open', Q2: 'open', Q3: 'open' };
    const result = evaluateInterlock('Q1', 'close', state);
    expect(result.allowed).toBe(false);
    expect(result.violatedRules.map((r) => r.id)).toContain('R3_close_Q1_when_Q2_open');
  });

  it('R4: nie można otworzyć Q2 gdy Q1 zamknięty (operacja pod obciążeniem)', () => {
    const state: BayState = { Q1: 'closed', Q2: 'closed', Q3: 'open' };
    const result = evaluateInterlock('Q2', 'open', state);
    expect(result.allowed).toBe(false);
    expect(result.violatedRules.map((r) => r.id)).toContain('R4_open_Q2_when_Q1_closed');
  });

  it('R5: nie można zamknąć Q3 gdy Q2 zamknięty (uziemienie pod napięciem)', () => {
    const state: BayState = { Q1: 'open', Q2: 'closed', Q3: 'open' };
    const result = evaluateInterlock('Q3', 'close', state);
    expect(result.allowed).toBe(false);
    expect(result.violatedRules.map((r) => r.id)).toContain('R5_close_Q3_when_Q2_closed');
  });

  it('Bezpieczny stan: Q1=open + Q2=open + Q3=closed (do prac pod ziemią)', () => {
    const state: BayState = { Q1: 'open', Q2: 'open', Q3: 'closed' };
    // Otwarcie Q3 zawsze dozwolone.
    const r1 = evaluateInterlock('Q3', 'open', state);
    expect(r1.allowed).toBe(true);
  });

  it('Stan operacyjny normalny: Q1=closed + Q2=closed + Q3=open', () => {
    const state: BayState = { Q1: 'closed', Q2: 'closed', Q3: 'open' };
    // Otwarcie Q1 zawsze dozwolone (rozłączenie pod obciążeniem - CB ma TIK).
    const r1 = evaluateInterlock('Q1', 'open', state);
    expect(r1.allowed).toBe(true);
  });

  it('Manewr ring: jeśli Q2 zam + Q1 otw, zamknięcie Q1 dozwolone tylko gdy Q3 otw', () => {
    const safeState: BayState = { Q1: 'open', Q2: 'closed', Q3: 'open' };
    const unsafeState: BayState = { Q1: 'open', Q2: 'closed', Q3: 'closed' };
    expect(evaluateInterlock('Q1', 'close', safeState).allowed).toBe(true);
    expect(evaluateInterlock('Q1', 'close', unsafeState).allowed).toBe(false);
  });

  it('Wiele reguł może być naruszonych jednocześnie (np. Q3 close blokowany przez Q1 + Q2)', () => {
    const state: BayState = { Q1: 'closed', Q2: 'closed', Q3: 'open' };
    const result = evaluateInterlock('Q3', 'close', state);
    expect(result.allowed).toBe(false);
    // Zarówno R1 (Q1 closed) jak i R5 (Q2 closed) blokują zamknięcie Q3.
    const ids = result.violatedRules.map((r) => r.id);
    expect(ids).toContain('R1_close_Q3_when_Q1_closed');
    expect(ids).toContain('R5_close_Q3_when_Q2_closed');
  });
});

describe('buildInterlockMatrix — wizualizacja w wizardzie', () => {
  it('zwraca tablicę komórek dla wizardu (krok 3)', () => {
    const matrix = buildInterlockMatrix();
    expect(matrix.length).toBeGreaterThan(0);
  });

  it('każda komórka ma target, action, condition i normRef', () => {
    const matrix = buildInterlockMatrix();
    for (const cell of matrix) {
      expect(cell.target).toBeTruthy();
      expect(['close', 'open']).toContain(cell.action);
      expect(cell.condition).toBeTruthy();
      expect(cell.normRef).toMatch(/PN-EN 62271-200/);
    }
  });

  it('macierz pokazuje wszystkie blokujące reguły (bez R6 always-allowed)', () => {
    const matrix = buildInterlockMatrix();
    // R6 ma blockedWhen=[] (zawsze dozwolone) — nie pojawia się w matrix.
    expect(matrix.length).toBe(5);
  });

  it('warunek condition jest czytelny operatorsko (PL skróty ZAM/OTW)', () => {
    const matrix = buildInterlockMatrix();
    for (const cell of matrix) {
      expect(cell.condition).toMatch(/(ZAM|OTW|TRANS)/);
    }
  });
});

describe('Edge cases — częściowy stan pola', () => {
  it('Częściowy stan (tylko Q1 znany) — reguły wymagające Q3 nie blokują', () => {
    const state: BayState = { Q1: 'closed' };
    // R3 wymaga Q2=open; bez Q2 znanego, reguła nie aktywuje.
    const result = evaluateInterlock('Q1', 'close', state);
    expect(result.allowed).toBe(true);
  });

  it('Pusty stan — wszystkie akcje dozwolone (no constraint to check)', () => {
    const state: BayState = {};
    const result = evaluateInterlock('Q1', 'close', state);
    expect(result.allowed).toBe(true);
  });

  it('Stan transitional — żadna reguła nie odpala (defensive)', () => {
    const state: BayState = { Q1: 'transitional', Q3: 'transitional' };
    const result = evaluateInterlock('Q3', 'close', state);
    expect(result.allowed).toBe(true);
  });
});
