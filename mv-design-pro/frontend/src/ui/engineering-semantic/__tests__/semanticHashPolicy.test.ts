import { describe, expect, it } from 'vitest';

import { canonicalHash, canonicalNormalize } from '../semanticHashPolicy';

describe('semanticHashPolicy', () => {
  it('ignoruje pola czasu i autora w hashach deterministycznych', () => {
    const base = {
      refId: 'bay-1',
      engineeringRole: 'LINE_FEEDER_BAY',
      generatedAt: '2026-04-28T10:00:00Z',
      author: 'Projektant A',
    };

    expect(canonicalHash(base)).toBe(canonicalHash({
      ...base,
      generatedAt: '2026-04-28T11:00:00Z',
      author: 'Projektant B',
    }));
  });

  it('ignoruje teksty diagnostyczne, ale zachowuje kod i severity', () => {
    const diagnostic = {
      code: 'SEM-BAY-001',
      severity: 'BLOKADA_RENDERU',
      elementRefId: 'bay-1',
      messagePl: 'Tekst redakcyjny A',
      repairActionPl: 'Napraw A',
    };

    expect(canonicalHash(diagnostic)).toBe(canonicalHash({
      ...diagnostic,
      messagePl: 'Tekst redakcyjny B',
      repairActionPl: 'Napraw B',
    }));
    expect(canonicalHash(diagnostic)).not.toBe(canonicalHash({
      ...diagnostic,
      severity: 'OSTRZEZENIE',
    }));
  });

  it('jest niezmienny na permutacje list semantycznych', () => {
    const first = {
      elements: [{ refId: 'b' }, { refId: 'a' }],
      connections: [{ connectionId: 'c2' }, { connectionId: 'c1' }],
    };
    const second = {
      connections: [{ connectionId: 'c1' }, { connectionId: 'c2' }],
      elements: [{ refId: 'a' }, { refId: 'b' }],
    };

    expect(canonicalHash(first)).toBe(canonicalHash(second));
    expect(canonicalNormalize(first)).toEqual(canonicalNormalize(second));
  });

  it('kanonicznie hashuje polaczenia bezkierunkowe niezaleznie od kolejnosci portow', () => {
    const connection = {
      connectionId: 'conn-1',
      orientation: 'BEZKIERUNKOWE',
      ports: ['p-b', 'p-a'],
    };

    expect(canonicalHash(connection)).toBe(canonicalHash({
      ...connection,
      ports: ['p-a', 'p-b'],
    }));
  });
});
