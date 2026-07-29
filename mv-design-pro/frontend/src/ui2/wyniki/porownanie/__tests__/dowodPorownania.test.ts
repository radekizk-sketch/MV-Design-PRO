/*
 * Testy wewnętrznego API dowodów porównania (R3-C / K3-G2): kodowanie strony
 * A/B w `dowodRef` komórki i bezpieczne dekodowanie (ref spoza formatu → null).
 */
import { describe, it, expect } from 'vitest';

import { refDowoduPorownania, stronaDowodu } from '../dowodPorownania';

describe('dowodPorownania — ref strony A/B', () => {
  it('buduje ref strona:element i odczytuje stronę', () => {
    expect(refDowoduPorownania('A', 'SZYNA-GPZ')).toBe('A:SZYNA-GPZ');
    expect(refDowoduPorownania('B', 'SZYNA-GPZ')).toBe('B:SZYNA-GPZ');
    expect(stronaDowodu('A:SZYNA-GPZ')).toBe('A');
    expect(stronaDowodu('B:SZYNA-GPZ')).toBe('B');
  });

  it('element z dwukropkiem nie psuje odczytu strony (podział po prefiksie)', () => {
    expect(stronaDowodu(refDowoduPorownania('A', 'ST:1/pole:2'))).toBe('A');
  });

  it('ref spoza formatu porównania → null (nic nie otwieramy na ślepo)', () => {
    expect(stronaDowodu('bus-1')).toBeNull();
    expect(stronaDowodu('')).toBeNull();
    expect(stronaDowodu('C:element')).toBeNull();
  });
});
